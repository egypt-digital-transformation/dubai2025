import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged, Unsubscribe } from '@angular/fire/auth';
import { AdminRequest, AdminService } from '../services/admin.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-requests',
  standalone: true,
  templateUrl: './requests.page.html',
  styleUrls: ['../more/more-module.page.scss'],
  imports: [CommonModule, FormsModule, IonicModule],
})
export class RequestsPage implements OnInit, OnDestroy {
  requestType = 'Transport';
  details = '';
  status = 'all';
  requests: AdminRequest[] = [];
  isLoading = true;
  isSubmitting = false;
  errorMessage = '';
  private requestsSubscription?: Subscription;
  private authUnsubscribe?: Unsubscribe;

  constructor(
    private readonly auth: Auth,
    private readonly adminService: AdminService
  ) {}

  ngOnInit(): void {
    this.authUnsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.requestsSubscription?.unsubscribe();
      this.requestsSubscription = undefined;
      this.isLoading = true;

      if (!user?.email) {
        this.isLoading = false;
        this.errorMessage = 'Sign in to view and submit requests.';
        return;
      }

      this.requestsSubscription = this.adminService.watchUserRequests(user.email).subscribe({
        next: (requests) => {
          this.requests = requests
            .slice()
            .sort((a, b) => this.requestTime(b.createdAt) - this.requestTime(a.createdAt));
          this.isLoading = false;
          this.errorMessage = '';
        },
        error: (error) => {
          console.error('[RequestsPage] Failed to load requests:', error);
          this.isLoading = false;
          this.errorMessage = 'Could not load your requests. Please try again.';
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.requestsSubscription?.unsubscribe();
    this.authUnsubscribe?.();
  }

  get filteredRequests() {
    return this.status === 'all'
      ? this.requests
      : this.requests.filter((request) => request.status === this.status);
  }

  async create(): Promise<void> {
    const details = this.details.trim();
    const user = this.auth.currentUser;
    if (!details || !user?.email || this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';
    try {
      await this.adminService.createUserRequest({
        userId: user.uid,
        userEmail: user.email.trim().toLowerCase(),
        userName: user.displayName?.trim() || user.email.split('@')[0],
        type: this.requestType,
        details,
      });
      this.details = '';
    } catch (error) {
      console.error('[RequestsPage] Failed to submit request:', error);
      this.errorMessage = 'Could not submit your request. Please try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  private requestTime(value: unknown): number {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
      return value.toMillis();
    }
    return typeof value === 'string' ? Date.parse(value) || 0 : 0;
  }
}
