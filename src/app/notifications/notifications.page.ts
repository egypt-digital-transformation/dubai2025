import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
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
export class NotificationsPage implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly fcmService = inject(FcmService);
  private readonly router = inject(Router);

  notifications: ReceivedNotification[] = [];
  isLoading = true;
  loadError = '';
  isPushSupported = false;
  isPermissionGranted = false;
  isPermissionDenied = false;

  get unreadCount(): number {
    return this.notifications.filter((n) => !n.opened).length;
  }

  constructor() {
    addIcons({ notificationsOutline, refreshOutline });
  }

  ngOnInit(): void {
    void this.loadNotifications();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refreshPermissionState();
    if (this.isPushSupported && this.isPermissionGranted) {
      await this.fcmService.ensurePushTokenRegistered();
    }
  }

  async loadNotifications(): Promise<void> {
    this.isLoading = true;
    this.loadError = '';
    try {
      this.notifications = await this.adminService.listReceivedNotifications();
    } catch (error) {
      console.error('[NotificationsPage] Failed to load received notifications:', error);
      this.loadError = 'Notifications could not be loaded. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  async openNotification(notification: ReceivedNotification): Promise<void> {
    try {
      await this.adminService.recordNotificationOpen(notification.id);
      notification.opened = true;
    } catch (error) {
      console.error('[NotificationsPage] Failed to record notification open:', error);
    }

    await this.router.navigateByUrl(
      `/tabs/home?notificationCampaign=${encodeURIComponent(notification.id)}`
    );
  }

  private async refreshPermissionState(): Promise<void> {
    this.isPushSupported = await this.fcmService.isPushSupported();
    this.isPermissionGranted =
      typeof Notification !== 'undefined' && Notification.permission === 'granted';
    this.isPermissionDenied =
      typeof Notification !== 'undefined' && Notification.permission === 'denied';
  }
}
