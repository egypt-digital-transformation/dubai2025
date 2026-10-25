import { Injectable, inject } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
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

function getMessagingErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return undefined;
}

function isRecoverableSubscriptionError(error: unknown): boolean {
  const code = getMessagingErrorCode(error);
  return (
    code === 'messaging/token-subscribe-failed' ||
    code === 'messaging/token-unsubscribe-failed'
  );
}

async function clearStaleBrowserPushSubscriptions(
  swRegistration?: ServiceWorkerRegistration
): Promise<void> {
  // 1. Unsubscribe from the passed service worker registration
  try {
    const sub = await swRegistration?.pushManager?.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
  } catch (err) {
    console.warn('[FCM] Failed to unsubscribe push subscription:', err);
  }

  // 2. Unsubscribe push subscriptions across all browser service worker registrations
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const allRegistrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of allRegistrations) {
        try {
          const sub = await reg.pushManager?.getSubscription();
          if (sub) {
            await sub.unsubscribe();
          }
        } catch (subErr) {
          console.warn('[FCM] Failed to unsubscribe SW push subscription:', subErr);
        }
      }
    }
  } catch (err) {
    console.warn('[FCM] Failed to query SW registrations:', err);
  }

  // 3. Clear IndexedDB token tables without blocking on deleteDatabase
  try {
    if (typeof window !== 'undefined' && window.indexedDB) {
      const databasesToClear = ['firebase-messaging-database', 'fcm_token_details_db'];
      await Promise.all(
        databasesToClear.map(
          (dbName) =>
            new Promise<void>((resolve) => {
              const req = window.indexedDB.open(dbName);
              req.onsuccess = () => {
                const idb = req.result;
                try {
                  const storeNames = Array.from(idb.objectStoreNames);
                  if (storeNames.length > 0) {
                    const tx = idb.transaction(storeNames, 'readwrite');
                    for (const storeName of storeNames) {
                      try {
                        tx.objectStore(storeName).clear();
                      } catch (storeErr) {
                        console.warn(`[FCM] Could not clear store ${storeName}:`, storeErr);
                      }
                    }
                    tx.oncomplete = () => {
                      idb.close();
                      resolve();
                    };
                    tx.onerror = () => {
                      idb.close();
                      resolve();
                    };
                    return;
                  }
                } catch (txErr) {
                  console.warn(`[FCM] Error clearing stores in ${dbName}:`, txErr);
                }
                idb.close();
                resolve();
              };
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            })
        )
      );
    }
  } catch (err) {
    console.warn('[FCM] Failed to delete FCM IndexedDB databases:', err);
  }

  // 4. Reset device ID in localStorage to force a fresh identity on backend
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('fcmPushDeviceId');
    }
  } catch (err) {
    console.warn('[FCM] Failed to reset push device ID:', err);
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
  private isRefreshingTokenRegistration = false;
  private lastTokenRegistrationAttempt = 0;
  private readonly tokenRegistrationCooldownMs = 60 * 1000;

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
      .subscribe((user) => {
        console.log(`[FCM] Authenticated user active: ${user?.email}`);
        void this.ensurePushTokenRegistered();
      });

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', this.refreshTokenRegistration);
      window.addEventListener('online', this.refreshTokenRegistration);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          void this.refreshTokenRegistration();
        }
      }).catch((error) => {
        console.warn('[FCM] Could not attach the app foreground listener:', error);
      });
      window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          void this.refreshTokenRegistration();
        }
      }, this.tokenRegistrationCooldownMs);
    }
  }

  private readonly refreshTokenRegistration = async (): Promise<void> => {
    if (
      this.isRefreshingTokenRegistration ||
      !this.authService.currentUser?.email ||
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      Date.now() - this.lastTokenRegistrationAttempt < this.tokenRegistrationCooldownMs
    ) {
      return;
    }

    this.isRefreshingTokenRegistration = true;
    this.lastTokenRegistrationAttempt = Date.now();
    try {
      await this.requestPermissionAndRegisterToken();
    } finally {
      this.isRefreshingTokenRegistration = false;
    }
  };

  async ensurePushTokenRegistered(): Promise<void> {
    if (this.isRefreshingTokenRegistration) {
      return;
    }

    this.isRefreshingTokenRegistration = true;
    try {
      await this.requestPermissionAndRegisterToken();
    } finally {
      this.isRefreshingTokenRegistration = false;
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      void this.refreshTokenRegistration();
    }
  };

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
    let registrationStage = 'checking browser permission';
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

      registrationStage = 'registering Firebase service worker';
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
      registrationStage = 'acquiring FCM token';
      let currentToken: string | null = null;
      try {
        currentToken = await getToken(this.messagingInstance, tokenOptions);
      } catch (tokenErr: unknown) {
        if (!isRecoverableSubscriptionError(tokenErr)) {
          throw tokenErr;
        }
        console.warn('[FCM] Push subscription recovery required:', {
          code: getMessagingErrorCode(tokenErr),
        });
        await clearStaleBrowserPushSubscriptions(swRegistration);
        currentToken = await getToken(this.messagingInstance, tokenOptions);
      }

      if (!currentToken) {
        console.warn('[FCM] ⚠️ No registration token available. Request permission to generate one.');
        return null;
      }

      registrationStage = 'registering FCM token with the server';
      let registration = await this.saveTokenToFirestore(currentToken);
      if (registration.refreshRequired) {
        console.warn('[FCM] Server marked this device token invalid; requesting a replacement.');
        const rejectedToken = currentToken;
        registrationStage = 'replacing invalid FCM token';
        try {
          await deleteToken(this.messagingInstance);
        } catch (delErr: unknown) {
          console.warn('[FCM] Could not delete the invalid token through Firebase; clearing local push storage:', {
            code: getMessagingErrorCode(delErr),
          });
        }
        await clearStaleBrowserPushSubscriptions(swRegistration);
        this.messagingInstance = null;
        this.messagingInstance = getMessaging();
        currentToken = await getToken(this.messagingInstance, tokenOptions);
        if (currentToken === rejectedToken) {
          console.warn('[FCM] Firebase returned the rejected token after cleanup; retrying once.');
          await clearStaleBrowserPushSubscriptions(swRegistration);
          this.messagingInstance = null;
          this.messagingInstance = getMessaging();
          currentToken = await getToken(this.messagingInstance, tokenOptions);
        }
        if (!currentToken) {
          throw new Error('Firebase did not provide a replacement push token.');
        }
        registrationStage = 'registering replacement FCM token with the server';
        registration = await this.saveTokenToFirestore(currentToken);
      }
      if (!registration.registered) {
        throw new Error('The push token was not registered successfully.');
      }

      console.log('[FCM] ✅ FCM token retrieved and registered');
      this.fcmTokenSubject.next(currentToken);
      this.listenForForegroundMessages();
      return currentToken;
    } catch (error: unknown) {
      const errorCode = getMessagingErrorCode(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[FCM] Failed while ${registrationStage}:`, {
        code: errorCode,
        message: errorMessage,
      });
      if (errorCode === 'messaging/vapid-key-required' || errorMessage.includes('vapidKey')) {
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
