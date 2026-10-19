import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged, signOut, Unsubscribe } from '@angular/fire/auth';
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
import { AdminService } from '../services/admin.service';

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
export class MorePage implements OnInit, OnDestroy {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly adminService = inject(AdminService);
  private authUnsubscribe?: Unsubscribe;

  isAdmin = false;

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

  ngOnInit(): void {
    this.authUnsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.isAdmin = false;
      if (!user?.email) {
        return;
      }

      void this.adminService.isAdmin(user.email).then((isAdmin) => {
        if (this.auth.currentUser?.uid === user.uid) {
          this.isAdmin = isAdmin;
        }
      }).catch((error) => {
        console.error('[MorePage] Failed to verify admin access:', error);
      });
    });
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
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

  openAdmin(event: MouseEvent): void {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur();
    }
    void this.router.navigateByUrl('/admin');
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
