import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  QueryList,
  ViewChildren,
  ViewChild,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { IonContent, IonIcon, IonModal } from '@ionic/angular/standalone';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  setDoc,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, NavigationStart } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AdminPreviewService } from '../services/admin-preview.service';

interface Session {
  id: string;
  title: string;
  startTime: any;
  endTime: any;
  location: string;
  day: string;
  description?: string;
  category: string;
  color: string;
  isGeneral: boolean;
  rotationalSchedule?: any;
  material?: string;
  qnaLink?: string;
  speaker?: {
    name: string;
    title: string;
    photoURL: string | null;
    userID: string;
  };
}

@Component({
  selector: 'app-agenda',
  standalone: true,
  templateUrl: './agenda.page.html',
  styleUrls: ['./agenda.page.scss'],
  imports: [IonModal, IonContent, IonIcon, CommonModule, DatePipe, FormsModule],
})
export class AgendaPage implements OnInit, OnDestroy {
  selectedDay = '1';
  isTransitioning = false;

  @ViewChildren('sessionCard') sessionCards!: QueryList<ElementRef>;
  @ViewChild(IonContent, { static: false }) content!: IonContent;

  sessions: Session[] = [];
  filteredSessions: Session[] = [];
  searchQuery = '';

  currentUser: any = null;
  userEmail: string | null = null;

  showMaterialViewer = false;
  selectedMaterial: { url: string; name: string; type: string } | null = null;

  private navigationSubscription?: Subscription;
  private previewSubscription?: Subscription;
  private sessionsSubscription?: Subscription;

  constructor(
    private firestore: Firestore,
    private auth: Auth,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private router: Router,
    private readonly adminPreview: AdminPreviewService
  ) {}

  ngOnInit() {
    console.log('[DEBUG] Initializing AgendaPage...');
    void this.auth.authStateReady().then(() => {
      this.previewSubscription = this.adminPreview.selectedUser$.subscribe((previewUser) => {
        void this.initializeAgenda(previewUser?.email ?? this.auth.currentUser?.email ?? undefined);
      });
    }).catch((error) => {
      console.error('[AgendaPage] Failed to initialize authentication state:', error);
    });

    this.navigationSubscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationStart))
      .subscribe((event: any) => {
        if (!event.url.includes('/agenda')) {
          this.searchQuery = '';
        }
      });
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
    this.previewSubscription?.unsubscribe();
    this.sessionsSubscription?.unsubscribe();
  }

  async initializeAgenda(emailOverride?: string) {
    try {
      this.currentUser = null;
      this.sessions = [];
      this.filteredSessions = [];
      const user = this.auth.currentUser;
      const email = emailOverride ?? user?.email?.toLowerCase() ?? null;
      if (!email) {
        console.warn('[DEBUG] No authenticated user found.');
        return;
      }

      this.userEmail = email.toLowerCase();
      console.log('[DEBUG] Authenticated user email:', this.userEmail);

      const usersRef = collection(this.firestore, 'users');
      const emailAddressQuery = query(usersRef, where('emailAddress', '==', this.userEmail));
      let snapshot = await getDocs(emailAddressQuery);
      if (snapshot.empty) {
        const emailQuery = query(usersRef, where('email', '==', this.userEmail));
        snapshot = await getDocs(emailQuery);
      }

      if (snapshot.empty) {
        console.warn(`[DEBUG] No user found with email ${this.userEmail}`);
        return;
      }

      this.currentUser = snapshot.docs[0].data();
      console.log('[DEBUG] Loaded user:', this.currentUser);

      const sessionsRef = collection(this.firestore, 'sessions');
      this.sessionsSubscription?.unsubscribe();
      this.sessionsSubscription = collectionData(sessionsRef, { idField: 'id' }).subscribe((data: any[]) => {
        this.sessions = data || [];
        console.log('[DEBUG] Total sessions loaded:', this.sessions.length);
        this.applyFilters();

        this.route.queryParams.subscribe((params) => {
          const targetSessionId = params['sessionId'] || null;
          if (targetSessionId) {
            setTimeout(() => this.scrollToSession(targetSessionId), 150);
          }
        });
      });
    } catch (err) {
      console.error('[DEBUG] Error initializing agenda:', err);
    }
  }

  private applyFilters() {
    if (!this.currentUser) return;

    let filtered = this.sessions.filter((s) => s.day === this.selectedDay);

    filtered = filtered.filter((session) => {
      if (session.isGeneral) return true;

      if (this.selectedDay === '2') {
        const group = this.currentUser.day2?.group;
        const groupKey = group ? `group${group}` : '';
        if (!groupKey) return false;
        return session.rotationalSchedule?.hasOwnProperty(groupKey);
      }

      if (this.selectedDay === '3') {
        const day3 = this.currentUser.day3;
        if (!day3) return false;

        if (day3.type === 'SV') {
          return session.category?.toLowerCase() === 'site visit';
        }

        if (day3.type === 'WS') {
          const groupAM =
            day3.groupAM && day3.groupAM !== 'SV' ? `group${day3.groupAM}` : '';
          const groupPM =
            day3.groupPM && day3.groupPM !== 'SV' ? `group${day3.groupPM}` : '';
          return (
            (groupAM && session.rotationalSchedule?.hasOwnProperty(groupAM)) ||
            (groupPM && session.rotationalSchedule?.hasOwnProperty(groupPM))
          );
        }
      }

      return false;
    });

    let mappedSessions = filtered.map((session) => {
      if (session.isGeneral) return session;

      if (this.selectedDay === '2') {
        const groupKey = `group${this.currentUser.day2?.group}`;
        if (session.rotationalSchedule?.[groupKey]) {
          return {
            ...session,
            startTime: session.rotationalSchedule[groupKey].startTime,
            endTime: session.rotationalSchedule[groupKey].endTime,
          };
        }
      }

      if (this.selectedDay === '3' && this.currentUser.day3?.type === 'WS') {
        const { groupAM, groupPM } = this.currentUser.day3;
        const keyAM =
          groupAM && groupAM !== 'SV' ? `group${groupAM}` : '';
        const keyPM =
          groupPM && groupPM !== 'SV' ? `group${groupPM}` : '';
        const matchKey =
          keyAM && session.rotationalSchedule?.[keyAM]
            ? keyAM
            : keyPM && session.rotationalSchedule?.[keyPM]
            ? keyPM
            : '';
        if (matchKey) {
          return {
            ...session,
            startTime: session.rotationalSchedule[matchKey].startTime,
            endTime: session.rotationalSchedule[matchKey].endTime,
          };
        }
      }

      return session;
    });

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      mappedSessions = mappedSessions.filter((session) => {
        return (
          session.title?.toLowerCase().includes(query) ||
          session.description?.toLowerCase().includes(query) ||
          session.category?.toLowerCase().includes(query) ||
          session.location?.toLowerCase().includes(query) ||
          session.speaker?.name?.toLowerCase().includes(query)
        );
      });
    }

    this.filteredSessions = mappedSessions.sort((a, b) => {
      const aTime = a.startTime?.toDate
        ? a.startTime.toDate().getTime()
        : new Date(a.startTime).getTime();
      const bTime = b.startTime?.toDate
        ? b.startTime.toDate().getTime()
        : new Date(b.startTime).getTime();
      return aTime - bTime;
    });

    console.log('[DEBUG] Filtered sessions:', this.filteredSessions);
  }

  private scrollToSession(sessionId: string | null, retries = 12) {
    if (!sessionId) return;
    const target = this.sessionCards?.find(
      (card) => card.nativeElement.id === sessionId
    );
    if (target && target.nativeElement) {
      const el = target.nativeElement;
      setTimeout(() => {
        const viewportHeight = window.innerHeight;
        const elementTop = el.offsetTop;
        const elementHeight = el.offsetHeight;
        const centerY = elementTop + elementHeight / 2 - viewportHeight / 2;

        this.content.scrollToPoint(0, centerY, 500).then(() => {
          el.classList.add('highlight');
          setTimeout(() => el.classList.remove('highlight'), 2200);
        });
      }, 200);
    } else if (retries > 0) {
      setTimeout(() => this.scrollToSession(sessionId, retries - 1), 250);
    }
  }

  setSelectedDay(day: string) {
    if (this.selectedDay === day) return;
    this.isTransitioning = true;
    this.selectedDay = day;
    this.applyFilters();

    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        if (this.content) {
          await this.content.scrollToPoint(0, 0, 0);
          this.isTransitioning = false;
        }
      });
    });
  }

  onSearchChange(query: string) {
    this.searchQuery = query;
    this.applyFilters();
  }

  clearSearch() {
    this.searchQuery = '';
    this.applyFilters();
  }

  formatSessionTime(session: Session): string {
    const start = session.startTime?.toDate
      ? session.startTime.toDate()
      : new Date(session.startTime);
    const end = session.endTime?.toDate
      ? session.endTime.toDate()
      : new Date(session.endTime);
    const opts: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    return `${start.toLocaleTimeString('en-US', opts)} - ${end.toLocaleTimeString(
      'en-US',
      opts
    )}`;
  }

  // Material viewer methods
  viewMaterial(session: Session) {
    if (!session.material) return;
    const type = this.getMaterialType(session.material);
    this.selectedMaterial = { url: session.material, name: session.title, type };
    this.showMaterialViewer = true;
  }

  closeMaterialViewer() {
    this.showMaterialViewer = false;
    this.selectedMaterial = null;
  }

  getMaterialType(url: string): string {
    const u = url.toLowerCase();
    if (u.includes('pdf')) return 'PDF';
    if (u.match(/\.(mp4|mov|webm|video)/)) return 'Video';
    if (u.match(/\.(jpg|jpeg|png|gif|image)/)) return 'Image';
    if (u.match(/\.(xls|xlsx)/)) return 'Spreadsheet';
    if (u.match(/\.(ppt|pptx)/)) return 'Presentation';
    return 'Document';
  }

  getMaterialIcon(type: string): string {
    const map: Record<string, string> = {
      PDF: 'document-text-outline',
      Document: 'document-outline',
      Image: 'image-outline',
      Spreadsheet: 'grid-outline',
      Video: 'videocam-outline',
      Presentation: 'easel-outline',
    };
    return map[type] || 'document-outline';
  }

  formatCategory(category: string): string {
    return category
      ? category
          .replace(/[-_]/g, ' ')
          .split(' ')
          .map(
            (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          )
          .join(' ')
      : '';
  }

  hasMaterial(session: Session): boolean {
    return !!session.material?.trim();
  }


}
