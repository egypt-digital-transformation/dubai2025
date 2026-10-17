import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { PwaService } from './services/pwa.service';
import { AuthService } from './services/auth.service';
import { AgendaService } from './services/agenda.service';
import { FcmService } from './services/fcm.service';
import { AdminService } from './services/admin.service';
import { IonApp, IonRouterOutlet, Platform } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { EMPTY, filter, interval, startWith, switchMap, tap } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { NavigationEnd } from '@angular/router';

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

  isIos = false;
  showInstallBanner = false;
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

    // ✅ Handle PWA install banners
    this.checkInstallSupport();
    this.handleBeforeInstallPrompt();
    this.installedApp = this.isInstalledExperience();
    window.addEventListener('appinstalled', () => {
      this.installedApp = true;
      this.recordAppActivity();
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