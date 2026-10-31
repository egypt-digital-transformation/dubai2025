import { CommonModule } from '@angular/common';
import { Component, inject, NgZone, OnDestroy, OnInit } from '@angular/core';
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
import { FirebaseInjectionContext } from '../services/firebase-injection-context.service';

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
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  private readonly zone = inject(NgZone);
  private authUnsubscribe?: Unsubscribe;

  isAdmin = false;
  isAdminStatusLoading = true;

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
    this.authUnsubscribe = this.firebaseContext.run(() =>
      onAuthStateChanged(this.auth, (user) => {
        this.isAdmin = false;
        if (!user?.email) {
          this.isAdminStatusLoading = false;
          return;
        }

        this.isAdminStatusLoading = true;
        void this.adminService.isAdmin(user.email).then((isAdmin) => {
          if (this.auth.currentUser?.uid === user.uid) {
            this.zone.run(() => {
              this.isAdmin = isAdmin;
              this.isAdminStatusLoading = false;
            });
          }
        }).catch((error) => {
          console.error('[MorePage] Failed to verify admin access:', error);
          if (this.auth.currentUser?.uid === user.uid) {
            this.zone.run(() => {
              this.isAdmin = false;
              this.isAdminStatusLoading = false;
            });
          }
        });
      })
    );
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
