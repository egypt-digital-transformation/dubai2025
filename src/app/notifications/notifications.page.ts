import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { notificationsOutline, refreshOutline } from 'ionicons/icons';
import { AdminService, ReceivedNotification } from '../services/admin.service';
import { FcmService } from '../services/fcm.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
})
export class NotificationsPage implements OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly fcmService = inject(FcmService);
  private readonly router = inject(Router);

  notifications: ReceivedNotification[] = [];
  isLoading = true;
  loadError = '';
  isPushSupported = false;
  isPermissionGranted = false;
  isPermissionDenied = false;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private isRefreshing = false;

  get unreadCount(): number {
    return this.notifications.filter((n) => !n.opened).length;
  }

  constructor() {
    addIcons({ notificationsOutline, refreshOutline });
  }

  async ionViewWillEnter(): Promise<void> {
    this.ionViewWillLeave();
    void this.loadNotifications();
    this.refreshTimer = setInterval(() => {
      if (!this.isRefreshing) {
        void this.loadNotifications(true);
      }
    }, 15_000);
    await this.refreshPermissionState();
    if (this.isPushSupported && this.isPermissionGranted) {
      await this.fcmService.ensurePushTokenRegistered();
    }
  }

  ionViewWillLeave(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  ngOnDestroy(): void {
    this.ionViewWillLeave();
  }

  async loadNotifications(silent = false): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;
    if (!silent) {
      this.isLoading = true;
      this.loadError = '';
    }
    try {
      this.notifications = await this.adminService.listReceivedNotifications();
      this.loadError = '';
    } catch (error) {
      console.error('[NotificationsPage] Failed to load received notifications:', error);
      if (!silent || !this.notifications.length) {
        this.loadError = 'Notifications could not be loaded. Please try again.';
      }
    } finally {
      this.isRefreshing = false;
      if (!silent) this.isLoading = false;
    }
  }

  async openNotification(notification: ReceivedNotification): Promise<void> {
    try {
      await this.adminService.recordNotificationOpen(notification.id);
      notification.opened = true;
    } catch (error) {
      console.error('[NotificationsPage] Failed to record notification open:', error);
    }

    const fallbackLink =
      `/tabs/home?notificationCampaign=${encodeURIComponent(notification.id)}`;
    const link =
      notification.link?.startsWith('/') && !notification.link.startsWith('//')
        ? notification.link
        : fallbackLink;
    await this.router.navigateByUrl(link);
  }

  private async refreshPermissionState(): Promise<void> {
    this.isPushSupported = await this.fcmService.isPushSupported();
    this.isPermissionGranted =
      typeof Notification !== 'undefined' && Notification.permission === 'granted';
    this.isPermissionDenied =
      typeof Notification !== 'undefined' && Notification.permission === 'denied';
  }
}
