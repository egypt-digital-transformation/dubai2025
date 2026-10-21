import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { notificationsOutline, openOutline } from 'ionicons/icons';
import { AdminService, ReceivedNotification } from '../services/admin.service';
import { FcmService } from '../services/fcm.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonIcon],
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
  isEnablingNotifications = false;
  notificationSetupMessage = '';

  constructor() {
    addIcons({ notificationsOutline, openOutline });
  }

  ngOnInit(): void {
    void this.loadNotifications();
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refreshPermissionState();
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

  async enableNotifications(): Promise<void> {
    if (this.isEnablingNotifications) {
      return;
    }

    this.isEnablingNotifications = true;
    this.notificationSetupMessage = '';
    try {
      const token = await this.fcmService.requestPermissionAndRegisterToken();
      await this.refreshPermissionState();
      if (!token && !this.isPermissionDenied) {
        this.notificationSetupMessage =
          'We could not finish notification setup. Please try again.';
      }
    } catch (error) {
      console.error('[NotificationsPage] Failed to enable push notifications:', error);
      this.notificationSetupMessage =
        'We could not finish notification setup. Please try again.';
    } finally {
      this.isEnablingNotifications = false;
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
