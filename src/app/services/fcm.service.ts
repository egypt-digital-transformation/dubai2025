import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular/standalone';
import { AuthService } from './auth.service';
import { AdminService } from './admin.service';
import { environment } from '../../environments/environment';
import { initializeApp } from 'firebase/app';
import { BehaviorSubject, filter } from 'rxjs';
import {
  isSupported,
  getMessaging,
  getToken,
  onMessage,
  Messaging,
  MessagePayload,
} from 'firebase/messaging';

@Injectable({
  providedIn: 'root',
})
export class FcmService {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private authService = inject(AuthService);
  private adminService = inject(AdminService);

  private messagingInstance: Messaging | null = null;
  private notificationApp = initializeApp(
    environment.notificationFirebaseConfig,
    'NotificationSender'
  );
  private isInitialized = false;

  private fcmTokenSubject = new BehaviorSubject<string | null>(null);
  readonly fcmToken$ = this.fcmTokenSubject.asObservable();

  /**
   * ✅ Initialize FCM for the authenticated user
   */
  initPushNotifications() {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    console.log('[FCM] Setting up push notification listener for authenticated user...');

    this.authService.user$
      .pipe(filter((user) => !!user && !!user.email))
      .subscribe(async (user) => {
        console.log(`[FCM] Authenticated user active: ${user?.email}`);
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          await this.requestPermissionAndRegisterToken();
        }
      });
  }

  async isPushSupported(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return false;
    }

    try {
      return await isSupported();
    } catch (error) {
      console.error('[FCM] Failed to check push notification support:', error);
      return false;
    }
  }

  /**
   * ✅ Request browser notification permission and get FCM token
   */
  async requestPermissionAndRegisterToken(): Promise<string | null> {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        console.warn('[FCM] Notifications are not supported in this environment');
        return null;
      }

      let permission = Notification.permission;
      if (permission === 'default') {
        console.log('[FCM] Requesting notification permission...');
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        console.warn(`[FCM] Notification permission was ${permission}`);
        return null;
      }

      const supported = await this.isPushSupported();
      if (!supported) {
        console.warn('[FCM] Firebase Messaging is not supported on this browser/platform');
        return null;
      }

      if (!this.messagingInstance) {
        this.messagingInstance = getMessaging(this.notificationApp);
      }

      // Ensure service worker registration is ready
      let swRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        try {
          swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/firebase-cloud-messaging-push-scope',
          });
          console.log('[FCM] Service worker registered successfully:', swRegistration.scope);
        } catch (swErr) {
          console.warn('[FCM] Custom SW registration note:', swErr);
          // Fall back to existing registration if any
          swRegistration = await navigator.serviceWorker.getRegistration();
        }
      }

      // Get FCM token
      const tokenOptions: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration } = {};
      if (environment.notificationVapidKey.trim()) {
        tokenOptions.vapidKey = environment.notificationVapidKey.trim();
      }
      if (swRegistration) {
        tokenOptions.serviceWorkerRegistration = swRegistration;
      }

      console.log('[FCM] Fetching FCM device token...');
      const currentToken = await getToken(this.messagingInstance, tokenOptions);

      if (currentToken) {
        console.log('[FCM] ✅ FCM token retrieved');
        this.fcmTokenSubject.next(currentToken);
        await this.saveTokenToFirestore(currentToken);
        this.listenForForegroundMessages();
        return currentToken;
      } else {
        console.warn('[FCM] ⚠️ No registration token available. Request permission to generate one.');
        return null;
      }
    } catch (error: any) {
      console.error('[FCM] ❌ Error acquiring FCM token:', error);
      if (error?.code === 'messaging/vapid-key-required' || error?.message?.includes('vapidKey')) {
        console.info(
          '[FCM] 👉 Note: A Web Push Certificate (VAPID Key) is required by Firebase. ' +
          'Generate one in Firebase Console > Project Settings > Cloud Messaging > Web Push Certificates ' +
          'and set it in environment.ts as vapidKey.'
        );
      }
      return null;
    }
  }

  /**
   * ✅ Listen for incoming notifications while the app is in foreground
   */
  private listenForForegroundMessages() {
    if (!this.messagingInstance) {
      return;
    }

    try {
      onMessage(this.messagingInstance, async (payload: MessagePayload) => {
        console.log('[FCM] 📩 Foreground message received:', payload);
        await this.displayForegroundToast(payload);
      });
    } catch (err) {
      console.warn('[FCM] Failed to attach foreground message listener:', err);
    }
  }

  /**
   * ✅ Show Ionic Toast for foreground notifications
   */
  private async displayForegroundToast(payload: MessagePayload) {
    const title = payload.notification?.title || payload.data?.['title'] || 'New Notification';
    const body = payload.notification?.body || payload.data?.['body'] || '';
    const targetUrl = payload.data?.['url'] || payload.data?.['link'];

    const buttons: any[] = [
      {
        text: 'Dismiss',
        role: 'cancel',
      },
    ];

    if (targetUrl) {
      buttons.unshift({
        text: 'View',
        handler: async () => {
          const campaignId = payload.data?.['campaignId'];
          if (campaignId) {
            try {
              await this.adminService.recordNotificationOpen(campaignId);
            } catch (error) {
              console.error('[FCM] Failed to record notification open:', error);
            }
          }
          if (targetUrl.startsWith('http')) {
            window.open(targetUrl, '_blank');
          } else {
            this.router.navigateByUrl(targetUrl);
          }
        },
      });
    }

    const toast = await this.toastCtrl.create({
      header: title,
      message: body,
      position: 'top',
      duration: 6000,
      buttons,
      cssClass: 'fcm-foreground-toast',
    });

    await toast.present();
  }

  /**
   * ✅ Save FCM token to Firestore in the user document
   */
  async saveTokenToFirestore(token: string) {
    const currentUser = this.authService.currentUser;
    if (!currentUser?.email) {
      const error = new Error('Cannot register a push token without an authenticated user.');
      console.error('[FCM] Push-token registration requires an authenticated user:', error);
      throw error;
    }

    try {
      await this.adminService.registerPushToken(token);
      console.log(`[FCM] Push token registered for ${currentUser.email}`);
    } catch (error) {
      console.error('[FCM] Failed to register push token:', error);
      throw error;
    }
  }
}
