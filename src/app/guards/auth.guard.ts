import { inject } from '@angular/core';
import {
  CanActivateFn,
  Router,
  UrlTree
} from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Protects routes by ensuring user is authenticated.
 * Waits for Firebase auth initialization before deciding.
 */
export const AuthGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // ✅ Wait until Firebase finishes checking for existing session
  await authService.waitForAuthResolved();

  // ✅ If authenticated, ensure user is registered in users or admins
  if (authService.isAuthenticated()) {
    const user = authService.currentUser;
    const allowed = await authService.isUserAllowed(user?.email);
    if (allowed) {
      return true;
    }
    console.warn('[AuthGuard] Authenticated user is not registered in users collection. Logging out.');
    await authService.logout();
    return router.parseUrl('/login');
  }

  // 🚫 Otherwise, redirect to login
  return router.parseUrl('/login');
};
