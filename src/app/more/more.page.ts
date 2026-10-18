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
    { title: 'My personal agenda', description: 'Saved sessions & calendar reminders', icon: 'calendar-outline', route: '/tabs/agenda' },
    { title: 'Help requests', description: 'Create & track a concierge request', icon: 'chatbubbles-outline', route: '/tabs/requests' },
    { title: 'My recap, photos & certificates', description: 'Your event memories', icon: 'images-outline', route: '/tabs/resources' },
    { title: 'Session takeaways', description: 'Reviewed notes & actions', icon: 'document-text-outline', route: '/tabs/takeaways' },
    { title: 'My journey', description: 'Flights, transfers & hotel', icon: 'compass-outline', route: '/tabs/journey' },
  ];

  readonly eventItems: MoreItem[] = [
    { title: 'Digital badge', description: 'Your event access', icon: 'qr-code-outline', route: '/tabs/home' },
    { title: 'Safety onboarding', description: 'Required induction & status', icon: 'shield-checkmark-outline', route: '/hse-induction' },
    { title: 'Networking', description: 'Digital contact cards', icon: 'people-outline', route: '/tabs/networking' },
    { title: 'Event updates', description: 'Announcements & notifications', icon: 'notifications-outline', route: '/tabs/home' },
    { title: 'Concierge & support', description: 'A helping hand', icon: 'call-outline', route: '/tabs/support' },
    { title: 'My profile', description: 'Your delegate details', icon: 'person-outline', route: '/tabs/home' },
    { title: 'Install Ahlan', description: 'Keep your companion close', icon: 'phone-portrait-outline', route: '/tabs/home' },
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
