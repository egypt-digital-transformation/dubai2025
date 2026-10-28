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
        path: 'notifications',
        loadComponent: () =>
          import('../notifications/notifications.page').then((m) => m.NotificationsPage),
      },
      {
        path: 'more',
        loadComponent: () =>
          import('../more/more.page').then((m) => m.MorePage),
      },
      {
        path: 'requests',
        loadComponent: () =>
          import('../requests/requests.page').then((m) => m.RequestsPage),
      },
      {
        path: 'takeaways',
        loadComponent: () =>
          import('../takeaways/takeaways.page').then((m) => m.TakeawaysPage),
      },
      {
        path: 'journey',
        loadComponent: () =>
          import('../journey/journey.page').then((m) => m.JourneyPage),
      },
      {
        path: 'networking',
        loadComponent: () =>
          import('../networking/networking.page').then((m) => m.NetworkingPage),
      },
      {
        path: 'support',
        loadComponent: () =>
          import('../support/support.page').then((m) => m.SupportPage),
      },
      {
        path: '',
        redirectTo: 'home', // ✅ redirect within this group
        pathMatch: 'full',
      },
    ],
  },
];
