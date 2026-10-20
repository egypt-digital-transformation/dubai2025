import { EnvironmentInjector, Injectable, inject, runInInjectionContext } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FirebaseInjectionContext {
  private readonly injector = inject(EnvironmentInjector);

  run<T>(operation: () => T): T {
    return runInInjectionContext(this.injector, operation);
  }
}
