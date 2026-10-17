import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('../home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'agenda',
        loadComponent: () =>
          import('../agenda/agenda.page').then((m) => m.AgendaPage),
      },
      {
        path: 'network',
        loadComponent: () =>
          import('../network/network.page').then((m) => m.NetworkPage),
      },
      {
        path: 'resources',
        loadComponent: () =>
          import('../resources/resources.page').then((m) => m.ResourcesPage),
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('../iconic-projects/iconic-projects.page').then(
            (m) => m.IconicProjectsPage
          ),
      },
      {
        path: '',
        redirectTo: 'home', // ✅ redirect within this group
        pathMatch: 'full',
      },
    ],
  },
];
