import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { DataPrefetchGuard } from './guards/data-prefetch.guard';
import { AdminGuard } from './guards/admin.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full',
  },
  {
    path: 'splash',
    loadComponent: () => import('./splash/splash.page').then(m => m.SplashPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./sso/sso.page').then(m => m.SsoPage),
  },
  {
    path: 'tabs',
    canActivate: [AuthGuard, DataPrefetchGuard],   // ✅ Protected route
    loadChildren: () => import('./tabs/tabs.routes').then(m => m.routes),
  },
  {
    path: 'venue',
    canActivate: [AuthGuard, DataPrefetchGuard],   // Optional — protect if needed
    loadComponent: () => import('./venue/venue.page').then(m => m.VenuePage),
  },
  {
    path: 'hse-induction',
    canActivate: [AuthGuard, DataPrefetchGuard],
    loadComponent: () => import('./hse-induction/hse-induction.page').then(m => m.HseInductionPage),
  },
  {
    path: 'admin',
    canActivate: [AuthGuard, AdminGuard],
    loadComponent: () => import('./admin/admin.page').then(m => m.AdminPage),
  },
  {
    path: 'activities',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./activities/activities.page').then(m => m.ActivitiesPage),
  },
  {
    path: 'tips',
    loadComponent: () => import('./tips/tips.page').then( m => m.TipsPage)
  },
];
