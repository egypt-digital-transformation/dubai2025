import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged, Unsubscribe } from '@angular/fire/auth';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { personAddOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { AdminPreviewService } from '../services/admin-preview.service';
import { AdminService } from '../services/admin.service';
import { FirebaseInjectionContext } from '../services/firebase-injection-context.service';

interface DirectoryContact {
  name: string;
  email: string;
  mobile: string;
  position: string;
  photoURL?: string;
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
  failedPhotos: Record<string, boolean> = {};

  private authUnsubscribe?: Unsubscribe;
  private previewSubscription?: Subscription;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private isRefreshingDirectory = false;

  constructor(
    private readonly auth: Auth,
    private readonly adminPreview: AdminPreviewService,
    private readonly adminService: AdminService
  ) {
    addIcons({ personAddOutline });
  }

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

  onPhotoError(email: string): void {
    this.failedPhotos[email] = true;
  }

  saveColleagueContact(colleague: DirectoryContact): void {
    const escape = (value: string) =>
      value
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
    const fullName = (colleague.name || 'Attendee').trim();
    const parts = fullName.split(/\s+/);
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${escape(lastName)};${escape(firstName)};;;`,
      `FN:${escape(fullName)}`,
      `TITLE:${escape(colleague.position || '')}`,
      `TEL;TYPE=CELL:${escape(colleague.mobile || '')}`,
      `EMAIL;TYPE=INTERNET:${escape(colleague.email || '')}`,
      'END:VCARD',
    ].join('\r\n');

    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName =
      fullName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'contact';
    link.href = url;
    link.download = `${safeName}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
