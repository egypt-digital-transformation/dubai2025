import '@angular/compiler';
import '@analogjs/vitest-angular/setup-zone';

import { Auth } from '@angular/fire/auth';
import { Firestore } from '@angular/fire/firestore';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { AuthService } from './app/services/auth.service';
import { AdminService } from './app/services/admin.service';

if (typeof CSSStyleSheet !== 'undefined' && !('adoptedStyleSheets' in document)) {
  Object.defineProperty(document, 'adoptedStyleSheets', {
    configurable: true,
    value: [],
  });
}

if (typeof ShadowRoot !== 'undefined' && !('adoptedStyleSheets' in ShadowRoot.prototype)) {
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    configurable: true,
    value: [],
  });
}

setupTestBed({
  zoneless: false,
  providers: [
    provideRouter([]),
    { provide: Auth, useValue: {} },
    { provide: Firestore, useValue: {} },
    { provide: SwUpdate, useValue: { isEnabled: false } },
    {
      provide: AuthService,
      useValue: {
        user$: of(null),
        currentUser: null,
        waitForAuthResolved: vi.fn().mockResolvedValue(undefined),
      },
    },
    { provide: AdminService, useValue: {} },
  ],
});
