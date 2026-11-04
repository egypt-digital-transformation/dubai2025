// src/app/services/pwa.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private deferredPrompt: any = null;
  private readonly isIos: boolean;
  private readonly isAndroid: boolean;
  private installed = false;

  constructor() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    // iPadOS 13+ reports itself as "Macintosh", so also check for touch support.
    this.isIos =
      /iphone|ipad|ipod/.test(userAgent) ||
      (/macintosh/.test(userAgent) && window.navigator.maxTouchPoints > 1);
    this.isAndroid = /android/.test(userAgent);

    // The prompt often fires before Angular boots; index.html stashes it here.
    const earlyPrompt = (window as Window & { __pwaInstallPrompt?: Event | null })
      .__pwaInstallPrompt;
    if (earlyPrompt) {
      this.deferredPrompt = earlyPrompt;
    }

    // Capture install event for Android/Chrome (fires again after a dismissed prompt)
    window.addEventListener('beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      this.deferredPrompt = event;
      console.log('beforeinstallprompt captured');
    });

    window.addEventListener('appinstalled', () => {
      console.log('PWA installed successfully');
      this.deferredPrompt = null;
      this.installed = true;
    });
  }

  /** True when the app is running from the home screen (standalone mode). */
  isStandalone(): boolean {
    return (
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  }

  isIosDevice(): boolean {
    return this.isIos;
  }

  isMobileDevice(): boolean {
    return this.isIos || this.isAndroid;
  }

  /**
   * Mobile attendees must use the home-screen app: when this is true the
   * install banner cannot be dismissed and browser sign-in is hidden.
   */
  isInstallRequired(): boolean {
    return this.isMobileDevice() && !this.isStandalone() && !this.installed;
  }

  canPromptInstall(): boolean {
    return !!this.deferredPrompt;
  }

  canInstall(): boolean {
    // Android case
    if (this.deferredPrompt) return true;

    // iOS case: show instruction if not standalone
    if (this.isIos && !this.isStandalone()) return true;

    return false;
  }

  async promptInstall(): Promise<void> {
    // Android install
    if (this.deferredPrompt) {
      const prompt = this.deferredPrompt;
      // A prompt can only be shown once; clear it so the banner falls back
      // to manual instructions if the user dismisses the dialog.
      this.deferredPrompt = null;
      (window as Window & { __pwaInstallPrompt?: Event | null }).__pwaInstallPrompt = null;
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      console.log(`User response: ${outcome}`);
    } else {
      console.log('No install prompt available');
    }
  }
}
