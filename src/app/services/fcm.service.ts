import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular/standalone';
import { AuthService } from './auth.service';
import { AdminService, PushTokenRegistrationResult } from './admin.service';
import { environment } from '../../environments/environment';
import { BehaviorSubject, filter } from 'rxjs';
import {
  isSupported,
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  Messaging,
  MessagePayload,
} from 'firebase/messaging';

function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration> {
  if (registration.active?.state === 'activated') {
    return Promise.resolve(registration);
  }

  const worker = registration.installing ?? registration.waiting;
  if (!worker) {
    return Promise.reject(new Error('The Firebase service worker has no active worker.'));
  }

  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      worker.removeEventListener('statechange', onStateChange);
      if (error) {
        reject(error);
      } else {
        resolve(registration);
      }
    };
    const onStateChange = () => {
      if (registration.active?.state === 'activated') {
        finish();
      } else if (worker.state === 'redundant') {
        finish(new Error('The Firebase service worker became redundant before activation.'));
      }
    };
    const timeout = window.setTimeout(
      () => finish(new Error('Timed out waiting for the Firebase service worker to activate.')),
      15000,
    );

    worker.addEventListener('statechange', onStateChange);
    onStateChange();
  });
}

function getPushDeviceId(): string {
  const storageKey = 'fcmPushDeviceId';
  const existingId = window.localStorage.getItem(storageKey);
  if (existingId && /^[A-Za-z0-9_-]{8,128}$/.test(existingId)) {
    return existingId;
  }

  const deviceId = window.crypto.randomUUID();
  window.localStorage.setItem(storageKey, deviceId);
  return deviceId;
}

async function clearStaleBrowserPushSubscriptions(
  swRegistration?: ServiceWorkerRegistration
): Promise<void> {
  try {
    const sub = await swRegistration?.pushManager?.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[FCM] Failed to unsubscribe push subscription:', err);
  }
  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      await Promise.all(
        ['firebase-messaging-database', 'fcm_token_details_db'].map(
          (databaseName) =>
            new Promise<void>((resolve) => {
              const timeout = window.setTimeout(() => {
                console.warn(`[FCM] Timed out clearing ${databaseName}`);
                resolve();
              }, 5000);
              const finish = () => {
                window.clearTimeout(timeout);
                resolve();
              };
              const request = window.indexedDB.deleteDatabase(databaseName);
              request.onsuccess = finish;
              request.onerror = () => {
                console.warn(`[FCM] Failed to clear ${databaseName}:`, request.error);
                finish();
              };
              request.onblocked = () => {
                console.warn(`[FCM] Clearing ${databaseName} is blocked by an open connection`);
              };
            }),
        ),
      );
    }
  } catch (err) {
    console.warn('[FCM] Failed to delete FCM IndexedDB databases:', err);
  }
}

@Injectable({
  providedIn: 'root',
})
export class FcmService {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private authService = inject(AuthService);
  private adminService = inject(AdminService);

  private messagingInstance: Messaging | null = null;
  private hasForegroundMessageListener = false;
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
        this.messagingInstance = getMessaging();
      }

      const swRegistration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { scope: '/firebase-cloud-messaging-push-scope' },
      );
      await waitForActiveServiceWorker(swRegistration);
      console.log('[FCM] Service worker is active:', swRegistration.scope);

      // Get FCM token
      const tokenOptions: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration } = {};
      if (environment.notificationVapidKey.trim()) {
        tokenOptions.vapidKey = environment.notificationVapidKey.trim();
      }
      if (swRegistration) {
        tokenOptions.serviceWorkerRegistration = swRegistration;
      }

      console.log('[FCM] Fetching FCM device token...');
      let currentToken: string | null = null;
      try {
        currentToken = await getToken(this.messagingInstance, tokenOptions);
      } catch (tokenErr: any) {
        console.warn(
          '[FCM] Stale push subscription detected or token acquisition failed; resetting push storage:',
          tokenErr
        );
        await clearStaleBrowserPushSubscriptions(swRegistration);
        currentToken = await getToken(this.messagingInstance, tokenOptions);
      }

      if (!currentToken) {
        console.warn('[FCM] ⚠️ No registration token available. Request permission to generate one.');
        return null;
      }

      let registration = await this.saveTokenToFirestore(currentToken);
      if (registration.refreshRequired) {
        console.warn('[FCM] Firebase rejected the previously registered token; refreshing it.');
        const rejectedToken = currentToken;
        try {
          await deleteToken(this.messagingInstance);
        } catch (delErr) {
          console.warn('[FCM] deleteToken failed (cross-project 403); clearing push storage:', delErr);
        }
        await clearStaleBrowserPushSubscriptions(swRegistration);
        currentToken = await getToken(this.messagingInstance, tokenOptions);
        if (currentToken === rejectedToken) {
          console.warn('[FCM] Firebase returned the rejected token after cleanup; retrying once.');
          await clearStaleBrowserPushSubscriptions(swRegistration);
          currentToken = await getToken(this.messagingInstance, tokenOptions);
        }
        if (!currentToken) {
          throw new Error('Firebase did not provide a replacement push token.');
        }
        if (currentToken === rejectedToken) {
          throw new Error('Firebase continued returning a token the server marked invalid.');
        }
        registration = await this.saveTokenToFirestore(currentToken);
      }
      if (!registration.registered) {
        throw new Error('The push token was not registered successfully.');
      }

      console.log('[FCM] ✅ FCM token retrieved and registered');
      this.fcmTokenSubject.next(currentToken);
      this.listenForForegroundMessages();
      return currentToken;
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
    if (!this.messagingInstance || this.hasForegroundMessageListener) {
      return;
    }

    try {
      onMessage(this.messagingInstance, async (payload: MessagePayload) => {
        console.log('[FCM] 📩 Foreground message received:', payload);
        await this.displayForegroundToast(payload);
      });
      this.hasForegroundMessageListener = true;
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
  async saveTokenToFirestore(token: string): Promise<PushTokenRegistrationResult> {
    const currentUser = this.authService.currentUser;
    if (!currentUser?.email) {
      const error = new Error('Cannot register a push token without an authenticated user.');
      console.error('[FCM] Push-token registration requires an authenticated user:', error);
      throw error;
    }

    try {
      const result = await this.adminService.registerPushToken(
        token,
        getPushDeviceId(),
      );
      console.log(`[FCM] Push token registered for ${currentUser.email}`);
      return result;
    } catch (error) {
      console.error('[FCM] Failed to register push token:', error);
      throw error;
    }
  }
}
