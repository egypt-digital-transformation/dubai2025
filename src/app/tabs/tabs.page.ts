import { Component, EnvironmentInjector, inject } from '@angular/core';
import { Auth, signOut } from '@angular/fire/auth';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  home,
  calendarOutline,
  businessOutline,
  bookOutline,
  logOutOutline,
  menuOutline,
  notificationsOutline,
} from 'ionicons/icons';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: true, 
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonLabel,
  ],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      home,
      calendarOutline,
      bookOutline,
      businessOutline,
      menuOutline,
      logOutOutline,
      notificationsOutline,
    });
  }

  openNotifications(): void {
    void this.router.navigateByUrl('/tabs/home');
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}