import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged, Unsubscribe } from '@angular/fire/auth';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AdminPreviewService } from '../services/admin-preview.service';
import { AdminService } from '../services/admin.service';
import { FirebaseInjectionContext } from '../services/firebase-injection-context.service';

interface DirectoryContact {
  name: string;
  email: string;
  mobile: string;
  position: string;
}

@Component({
  selector: 'app-networking',
  standalone: true,
  templateUrl: './networking.page.html',
  styleUrls: ['../more/more-module.page.scss', './networking.page.scss'],
  imports: [CommonModule, IonicModule],
})
export class NetworkingPage implements OnInit, OnDestroy {
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  directoryContacts: DirectoryContact[] = [];
  isDirectoryLoading = true;
  directoryError = '';

  private authUnsubscribe?: Unsubscribe;
  private previewSubscription?: Subscription;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private isRefreshingDirectory = false;

  constructor(
    private readonly auth: Auth,
    private readonly adminPreview: AdminPreviewService,
    private readonly adminService: AdminService
  ) {}

  ngOnInit(): void {
    this.authUnsubscribe = this.firebaseContext.run(() =>
      onAuthStateChanged(this.auth, (user) => {
        this.previewSubscription?.unsubscribe();
        this.previewSubscription = this.adminPreview.selectedUser$.subscribe((previewUser) => {
          this.watchDirectory(previewUser?.email ?? user?.email ?? undefined);
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.previewSubscription?.unsubscribe();
    this.ionViewWillLeave();
  }

  ionViewWillEnter(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval(() => {
      const email =
        this.adminPreview.selectedUser?.email ??
        this.auth.currentUser?.email ??
        undefined;
      void this.loadDirectory(email, true);
    }, 15_000);
  }

  ionViewWillLeave(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private watchDirectory(excludedEmail?: string): void {
    void this.loadDirectory(excludedEmail);
  }

  private async loadDirectory(
    excludedEmail?: string,
    silent = false
  ): Promise<void> {
    if (this.isRefreshingDirectory) return;
    this.isRefreshingDirectory = true;
    if (!silent) {
      this.directoryContacts = [];
      this.directoryError = '';
      this.isDirectoryLoading = true;
    }

    if (!this.auth.currentUser) {
      this.isRefreshingDirectory = false;
      if (!silent) this.isDirectoryLoading = false;
      return;
    }

    try {
      const { contacts } = await this.adminService.listSharedContactCards();
      const excluded = excludedEmail?.trim().toLowerCase();
      this.directoryContacts = contacts
        .filter((contact) => contact.email.trim().toLowerCase() !== excluded)
        .sort((a, b) => a.name.localeCompare(b.name));
      this.directoryError = '';
    } catch (error) {
      console.error('[NetworkingPage] Failed to load shared contact cards:', error);
      if (!silent || !this.directoryContacts.length) {
        this.directoryError = 'Could not load the colleague directory. Please try again.';
      }
    } finally {
      this.isRefreshingDirectory = false;
      if (!silent) this.isDirectoryLoading = false;
    }
  }
}
