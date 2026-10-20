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
  }

  private watchDirectory(excludedEmail?: string): void {
    this.directoryContacts = [];
    this.directoryError = '';
    this.isDirectoryLoading = true;

    if (!this.auth.currentUser) {
      this.isDirectoryLoading = false;
      return;
    }

    void this.adminService.listSharedContactCards()
      .then(({ contacts }) => {
        const excluded = excludedEmail?.trim().toLowerCase();
        this.directoryContacts = contacts
          .filter((contact) => contact.email.trim().toLowerCase() !== excluded)
          .sort((a, b) => a.name.localeCompare(b.name));
        this.isDirectoryLoading = false;
      })
      .catch((error) => {
        console.error('[NetworkingPage] Failed to load shared contact cards:', error);
        this.isDirectoryLoading = false;
        this.directoryError = 'Could not load the colleague directory. Please try again.';
      });
  }
}
