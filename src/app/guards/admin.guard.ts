import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AdminService } from '../services/admin.service';

export const AdminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const adminService = inject(AdminService);
  const router = inject(Router);

  await authService.waitForAuthResolved();
  if (!authService.currentUser) {
    return router.parseUrl('/login');
  }

  try {
    return (await adminService.isAdmin())
      ? true
      : router.parseUrl('/tabs/home');
  } catch (error) {
    console.error('[AdminGuard] Failed to verify administrator access:', error);
    return router.parseUrl('/tabs/home');
  }
};
