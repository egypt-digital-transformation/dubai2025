import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged, Unsubscribe } from '@angular/fire/auth';
import { Firestore, collection, onSnapshot, query, where } from '@angular/fire/firestore';
import { IonicModule } from '@ionic/angular';
import { Subscription } from 'rxjs';
import { AdminPreviewService } from '../services/admin-preview.service';

interface DirectoryContact {
  id: string;
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
  directoryContacts: DirectoryContact[] = [];
  isDirectoryLoading = true;
  directoryError = '';

  private authUnsubscribe?: Unsubscribe;
  private previewSubscription?: Subscription;
  private directoryUnsubscribe?: Unsubscribe;

  constructor(
    private readonly auth: Auth,
    private readonly firestore: Firestore,
    private readonly adminPreview: AdminPreviewService
  ) {}

  ngOnInit(): void {
    this.authUnsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.previewSubscription?.unsubscribe();
      this.previewSubscription = this.adminPreview.selectedUser$.subscribe((previewUser) => {
        this.watchDirectory(previewUser?.id ?? user?.uid);
      });
    });
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
    this.previewSubscription?.unsubscribe();
    this.directoryUnsubscribe?.();
  }

  private watchDirectory(excludedUserId?: string): void {
    this.directoryUnsubscribe?.();
    this.directoryContacts = [];
    this.directoryError = '';
    this.isDirectoryLoading = true;

    const sharedContactsQuery = query(
      collection(this.firestore, 'users'),
      where('shareContactCard', '==', true)
    );
    this.directoryUnsubscribe = onSnapshot(
      sharedContactsQuery,
      (snapshot) => {
        this.directoryContacts = snapshot.docs
          .filter((userDocument) => userDocument.id !== excludedUserId)
          .map((userDocument) => {
            const data = userDocument.data();
            return {
              id: userDocument.id,
              name: [this.stringValue(data['firstName']), this.stringValue(data['lastName'])]
                .filter(Boolean)
                .join(' ') || this.stringValue(data['displayName']) || 'Attendee',
              email: this.stringValue(data['emailAddress']) || this.stringValue(data['email']),
              mobile: this.firstStringValue(data, [
                'mobileNumber',
                'mobile',
                'mobileNo',
                'phoneNumber',
                'phone',
                'phoneNo',
                'telephone',
                'contactNumber',
                'Mobile Number',
                'Phone Number',
              ]),
              position: this.stringValue(data['currentPosition']),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        this.isDirectoryLoading = false;
      },
      (error) => {
        console.error('[NetworkingPage] Failed to load shared contact cards:', error);
        this.isDirectoryLoading = false;
        this.directoryError = 'Could not load the colleague directory. Please try again.';
      }
    );
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private firstStringValue(data: Record<string, unknown>, fields: string[]): string {
    for (const field of fields) {
      const value = this.stringValue(data[field]);
      if (value) return value;
    }
    return '';
  }
}
