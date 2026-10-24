import { CommonModule } from '@angular/common';
import { Component, EnvironmentInjector, inject, OnDestroy, OnInit } from '@angular/core';
import { Auth, onAuthStateChanged, signOut, Unsubscribe } from '@angular/fire/auth';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonHeader,
  IonIcon,
  IonLabel,
  IonModal,
  IonSearchbar,
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
  closeOutline,
} from 'ionicons/icons';
import { Router } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { AdminPreviewService, PreviewUser } from '../services/admin-preview.service';
import { FirebaseInjectionContext } from '../services/firebase-injection-context.service';

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
    IonModal,
    IonSearchbar,
    CommonModule,
    FormsModule,
  ],
})
export class TabsPage implements OnInit, OnDestroy {
  public environmentInjector = inject(EnvironmentInjector);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly adminService = inject(AdminService);
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  readonly preview = inject(AdminPreviewService);
  isAdmin = false;
  isLoadingPreviewUsers = false;
  previewUsers: PreviewUser[] = [];
  previewSearch = '';
  showPreviewPicker = false;
  previewError = '';
  private authUnsubscribe?: Unsubscribe;

  constructor() {
    addIcons({
      home,
      calendarOutline,
      bookOutline,
      businessOutline,
      menuOutline,
      logOutOutline,
      notificationsOutline,
      closeOutline,
    });
  }

  ngOnInit(): void {
    this.authUnsubscribe = this.firebaseContext.run(() =>
      onAuthStateChanged(this.auth, (user) => {
        this.isAdmin = false;
        if (!user?.email) {
          this.preview.stopPreview();
          return;
        }
        void this.adminService.isAdmin(user.email).then((isAdmin) => {
          if (this.auth.currentUser?.uid === user.uid) {
            this.isAdmin = isAdmin;
            if (!isAdmin) {
              this.preview.stopPreview();
            }
          }
        }).catch((error) => {
          console.error('[TabsPage] Failed to verify admin access:', error);
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.authUnsubscribe?.();
  }

  get filteredPreviewUsers(): PreviewUser[] {
    const search = this.previewSearch.trim().toLowerCase();
    if (!search) {
      return this.previewUsers;
    }
    return this.previewUsers.filter((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes(search)
    );
  }

  async openPreviewPicker(): Promise<void> {
    if (!this.isAdmin || this.isLoadingPreviewUsers) {
      this.showPreviewPicker = this.isAdmin;
      return;
    }

    this.showPreviewPicker = true;
    if (this.previewUsers.length) {
      return;
    }

    this.isLoadingPreviewUsers = true;
    this.previewError = '';
    try {
      this.previewUsers = await this.adminService.loadPreviewUsers();
    } catch (error) {
      console.error('[TabsPage] Failed to load users for preview:', error);
      this.previewError = 'Could not load users. Please try again.';
    } finally {
      this.isLoadingPreviewUsers = false;
    }
  }

  selectPreviewUser(user: PreviewUser): void {
    if (!this.isAdmin) {
      return;
    }
    this.preview.startPreview(user);
    this.previewSearch = '';
    this.showPreviewPicker = false;
  }

  stopPreview(): void {
    this.preview.stopPreview();
  }

  openNotifications(): void {
    if (this.router.url.startsWith('/tabs/notifications')) {
      window.dispatchEvent(new Event('notifications-page-requested'));
    }
    void this.router.navigateByUrl('/tabs/notifications');
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    await this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}