import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Auth, signOut } from '@angular/fire/auth';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  accessibilityOutline,
  arrowForwardOutline,
  calendarOutline,
  callOutline,
  chatbubblesOutline,
  compassOutline,
  documentTextOutline,
  imagesOutline,
  logOutOutline,
  notificationsOutline,
  peopleOutline,
  personOutline,
  phonePortraitOutline,
  qrCodeOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons';
import { Router } from '@angular/router';

interface MoreItem {
  title: string;
  description: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-more',
  standalone: true,
  templateUrl: './more.page.html',
  styleUrls: ['./more.page.scss'],
  imports: [CommonModule, IonicModule],
})
export class MorePage {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly journeyItems: MoreItem[] = [
    { title: 'Help requests', description: 'Create & track a concierge request', icon: 'chatbubbles-outline', route: '/tabs/requests' },
    { title: 'My journey', description: 'Flights, transfers & hotel', icon: 'compass-outline', route: '/tabs/journey' },
  ];

  readonly eventItems: MoreItem[] = [
    { title: 'Find my colleagues', description: 'Connect with fellow attendees', icon: 'people-outline', route: '/tabs/networking' },
    { title: 'Concierge & support', description: 'A helping hand', icon: 'call-outline', route: '/tabs/support' },
  ];

  constructor() {
    addIcons({
      accessibilityOutline,
      arrowForwardOutline,
      calendarOutline,
      callOutline,
      chatbubblesOutline,
      compassOutline,
      documentTextOutline,
      imagesOutline,
      logOutOutline,
      notificationsOutline,
      peopleOutline,
      personOutline,
      phonePortraitOutline,
      qrCodeOutline,
      shieldCheckmarkOutline,
    });
  }

  open(item: MoreItem): void {
    void this.router.navigateByUrl(item.route);
  }

  openResources(): void {
    void this.router.navigateByUrl('/tabs/resources');
  }

  openProjects(): void {
    void this.router.navigateByUrl('/tabs/projects');
  }

  openAdmin(): void {
    void this.router.navigateByUrl('/admin');
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
