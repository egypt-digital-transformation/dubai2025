import './polyfills';
import './global.scss';
import './theme/variables.scss';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideStorage, getStorage } from '@angular/fire/storage'; // ✅ Add this
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { environment } from './environments/environment';
import { enableProdMode, isDevMode, APP_INITIALIZER } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { provideRouter } from '@angular/router';
import { DataService } from './app/services/data.service';
import { firstValueFrom } from 'rxjs';
import { SplashScreen } from '@capacitor/splash-screen';

if (environment.production) {
  enableProdMode();
}

defineCustomElements(window);

/**
 * ✅ Preload Firestore data before app navigation
 */
export function preloadData(dataService: DataService) {
  return async () => {
    console.log('[INIT] Starting Firestore preload...');
    dataService.initData();

    try {
      // ✅ Wait for first emission of both observables
      const [sessions, announcements] = await Promise.all([
        firstValueFrom(dataService.sessions$),
        firstValueFrom(dataService.announcements$),
      ]);

      console.log(`[INIT] Loaded ${sessions.length} sessions, ${announcements.length} announcements`);
    } catch (err) {
      console.warn('[INIT] Firestore preload failed or offline', err);
    } finally {
      // ✅ Hide splash only after data loaded
      try {
        await SplashScreen.hide();
      } catch {
        console.log('[INIT] SplashScreen plugin not available — ignoring');
      }
    }
  };
}

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideStorage(() => getStorage()), 

    // ✅ Still valid in Angular 20.x
    {
      provide: APP_INITIALIZER,
      useFactory: preloadData,
      deps: [DataService],
      multi: true,
    },

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
}).then(() => defineCustomElements(window));