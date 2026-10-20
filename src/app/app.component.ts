import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { PwaService } from './services/pwa.service';
import { AuthService } from './services/auth.service';
import { AgendaService } from './services/agenda.service';
import { FcmService } from './services/fcm.service';
import { AdminService } from './services/admin.service';
import { IonApp, IonRouterOutlet, Platform, ToastController } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { EMPTY, filter, interval, startWith, switchMap, tap } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { NavigationEnd } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, CommonModule, RouterModule],
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private pwaService = inject(PwaService);
  private platform = inject(Platform);
  private agendaService = inject(AgendaService);
  private fcmService = inject(FcmService);
  private adminService = inject(AdminService);
  private auth = inject(Auth);
  private swUpdate = inject(SwUpdate);
  private toastCtrl = inject(ToastController);

  isIos = false;
  showInstallBanner = false;
  showNotificationPrompt = false;
  notificationPermissionDenied = false;
  isEnablingNotifications = false;
  notificationSetupMessage = '';
  deferredPrompt: any;
  private installedApp = false;
  private readonly openedCampaigns = new Set<string>();

  async ngOnInit() {
    console.log('[APP] Initializing...');

    // ✅ Wait for Firebase Auth initialization before routing
    await this.authService.waitForAuthResolved();

    // ✅ Navigate to splash if at root
    if (this.router.url === '/' || this.router.url === '') {
      await this.router.navigateByUrl('/splash', { replaceUrl: true });
    }

    // ✅ Initialize Firebase Cloud Messaging push notifications
    this.fcmService.initPushNotifications();
    this.authService.user$.subscribe((user) => {
      void this.updateNotificationPrompt(!!user?.email);
    });

    // ✅ Watch for new deploys and update installed home-screen apps automatically
    this.watchForPwaUpdates();

    // ✅ Handle PWA install banners
    this.checkInstallSupport();
    this.handleBeforeInstallPrompt();
    this.installedApp = this.isInstalledExperience();
    window.addEventListener('appinstalled', () => {
      this.installedApp = true;
      this.recordAppActivity();
      void this.updateNotificationPrompt(!!this.authService.currentUser?.email);
    });

    this.authService.user$
      .pipe(
        switchMap((user) =>
          user?.email
            ? interval(5 * 60 * 1000).pipe(
                startWith(0),
                tap(() => this.recordAppActivity())
              )
            : EMPTY
        )
      )
      .subscribe();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.trackNotificationCampaignOpen());
    this.trackNotificationCampaignOpen();

    // ✅ Generate the user's agenda once per login session
    this.authService.user$
      .pipe(filter((user) => !!user && !!user.email))
      .subscribe(async (user) => {
        console.log(`[APP] Authenticated user: ${user?.email}`);
        try {
          await this.agendaService.generateUserAgenda();
          console.log('[APP] ✅ Agenda generation completed');
        } catch (err) {
          console.error('[APP] ❌ Failed to generate agenda:', err);
        }
      });
  }

  /** ✅ Detect iOS and standalone mode */
  checkInstallSupport() {
    const ua = window.navigator.userAgent.toLowerCase();
    this.isIos = /iphone|ipad|ipod/.test(ua);
    const isStandalone =
      (window.navigator as any).standalone ||
      window.matchMedia('(display-mode: standalone)').matches;

    const dismissed = localStorage.getItem('installBannerDismissed') === 'true';
    if (!isStandalone && !dismissed) {
      this.showInstallBanner = true;
    }
  }

  /** ✅ Handle Android install prompt */
  handleBeforeInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event: any) => {
      console.log('[PWA] beforeinstallprompt fired');
      event.preventDefault();
      this.deferredPrompt = event;
      this.showInstallBanner = true;
    });
  }

  private isInstalledExperience(): boolean {
    const navigatorWithStandalone = window.navigator as Navigator & {
      standalone?: boolean;
    };
    return (
      navigatorWithStandalone.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  }

  private async updateNotificationPrompt(isAuthenticated: boolean): Promise<void> {
    if (!isAuthenticated || !(this.installedApp || this.isInstalledExperience())) {
      this.showNotificationPrompt = false;
      return;
    }

    if (!(await this.fcmService.isPushSupported()) || !this.authService.currentUser?.email) {
      this.showNotificationPrompt = false;
      return;
    }

    this.notificationPermissionDenied = Notification.permission === 'denied';
    this.showNotificationPrompt = Notification.permission !== 'granted';
  }

  async enableNotifications(): Promise<void> {
    if (this.isEnablingNotifications) {
      return;
    }

    this.isEnablingNotifications = true;
    this.notificationSetupMessage = '';
    try {
      const token = await this.fcmService.requestPermissionAndRegisterToken();
      if (token) {
        this.showNotificationPrompt = false;
        return;
      }

      this.notificationPermissionDenied = Notification.permission === 'denied';
      this.notificationSetupMessage = this.notificationPermissionDenied
        ? ''
        : 'We could not finish notification setup. Please try again.';
    } catch (error) {
      console.error('[APP] Failed to enable push notifications:', error);
      this.notificationSetupMessage = 'We could not finish notification setup. Please try again.';
    } finally {
      this.isEnablingNotifications = false;
    }
  }

  continueWithoutNotifications(): void {
    this.showNotificationPrompt = false;
  }

  private recordAppActivity(): void {
    void this.adminService
      .recordAppActivity(this.installedApp || this.isInstalledExperience())
      .catch((error) => {
        console.error('[APP] Failed to record app activity:', error);
      });
  }

  private trackNotificationCampaignOpen(): void {
    const campaignId = new URL(window.location.href).searchParams.get(
      'notificationCampaign'
    );
    if (
      !campaignId ||
      this.openedCampaigns.has(campaignId) ||
      !this.auth.currentUser
    ) {
      return;
    }

    this.openedCampaigns.add(campaignId);
    void this.adminService.recordNotificationOpen(campaignId).catch((error) => {
      this.openedCampaigns.delete(campaignId);
      console.error('[APP] Failed to record notification open:', error);
    });
  }

  private watchForPwaUpdates(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(filter((event) => event.type === 'VERSION_READY'))
      .subscribe(async () => {
        const toast = await this.toastCtrl.create({
          header: 'App update ready',
          message: 'A new version is available. Reload to apply the update?',
          position: 'top',
          duration: 0,
          buttons: [
            {
              text: 'Later',
              role: 'cancel',
            },
            {
              text: 'Update',
              handler: async () => {
                await this.swUpdate.activateUpdate();
                window.location.reload();
              },
            },
          ],
        });

        await toast.present();
      });

    void this.swUpdate.checkForUpdate();
    setInterval(() => {
      void this.swUpdate.checkForUpdate();
    }, 60 * 1000);
  }

  /** ✅ Trigger PWA install prompt */
  installPwa() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.finally(() => {
        this.deferredPrompt = null;
        this.showInstallBanner = false;
      });
    }
  }

  /** ✅ Dismiss iOS banner */
  dismissIosBanner() {
    this.showInstallBanner = false;
    localStorage.setItem('installBannerDismissed', 'true');
  }
}