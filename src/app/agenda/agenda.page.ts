import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  QueryList,
  ViewChildren,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import {
  Firestore,
  collection,
  collectionData,
  query,
  where,
  getDocs,
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
  imports: [IonContent, IonIcon, CommonModule, FormsModule],
})
export class AgendaPage implements OnInit, OnDestroy {
  selectedDay = '1';
  availableDays: string[] = [];
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
  private userAgendaSubscription?: Subscription;
  private agendaLoadId = 0;
  private hasUserAgenda = false;

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
    this.userAgendaSubscription?.unsubscribe();
  }

  async initializeAgenda(emailOverride?: string) {
    const loadId = ++this.agendaLoadId;
    this.sessionsSubscription?.unsubscribe();
    this.userAgendaSubscription?.unsubscribe();
    this.sessionsSubscription = undefined;
    this.userAgendaSubscription = undefined;
    this.hasUserAgenda = false;
    this.availableDays = [];

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
      if (loadId !== this.agendaLoadId) return;
      if (snapshot.empty) {
        const emailQuery = query(usersRef, where('email', '==', this.userEmail));
        snapshot = await getDocs(emailQuery);
        if (loadId !== this.agendaLoadId) return;
      }

      if (snapshot.empty) {
        console.warn(`[DEBUG] No user found with email ${this.userEmail}`);
        return;
      }

      const userDoc = snapshot.docs[0];
      this.currentUser = userDoc.data();
      console.log('[DEBUG] Loaded user:', this.currentUser);

      const userAgendaRef = collection(this.firestore, 'users', userDoc.id, 'agenda');
      this.userAgendaSubscription = collectionData(userAgendaRef, { idField: 'id' }).subscribe({
        next: (documents: any[]) => {
          if (loadId !== this.agendaLoadId) return;
          const dayDocuments = documents.filter(
            (document) =>
              typeof document.dayNumber === 'number' &&
              Array.isArray(document.sessions)
          );

          if (dayDocuments.length) {
            this.sessionsSubscription?.unsubscribe();
            this.sessionsSubscription = undefined;
            this.hasUserAgenda = true;
            this.availableDays = [...new Set(
              dayDocuments.map((dayDocument) => String(dayDocument.dayNumber))
            )].sort((a, b) => Number(a) - Number(b));
            this.keepSelectedDayAvailable();
            this.sessions = [];
            dayDocuments.forEach((dayDocument) => {
              this.sessions.push(...this.mapUserAgendaSessions(dayDocument));
            });
            this.applyFilters();
            return;
          }

          this.hasUserAgenda = false;
          if (!this.sessionsSubscription) this.subscribeToSharedSessions();
        },
        error: (error) => {
          console.error('[AgendaPage] Failed to load the user agenda:', error);
          this.hasUserAgenda = false;
          if (loadId === this.agendaLoadId && !this.sessionsSubscription) {
            this.subscribeToSharedSessions();
          }
        },
      });
    } catch (err) {
      console.error('[DEBUG] Error initializing agenda:', err);
    }
  }

  private subscribeToSharedSessions() {
    const sessionsRef = collection(this.firestore, 'sessions');
    this.sessionsSubscription = collectionData(sessionsRef, { idField: 'id' }).subscribe({
      next: (data: any[]) => {
        this.sessions = data || [];
        this.availableDays = [...new Set(
          this.sessions
            .map((session) => String(session.day ?? ''))
            .filter((day) => day !== '')
        )].sort((a, b) => Number(a) - Number(b));
        this.keepSelectedDayAvailable();
        console.log('[DEBUG] Total shared sessions loaded:', this.sessions.length);
        this.applyFilters();

        this.route.queryParams.subscribe((params) => {
          const targetSessionId = params['sessionId'] || null;
          if (targetSessionId) {
            setTimeout(() => this.scrollToSession(targetSessionId), 150);
          }
        });
      },
      error: (error) => {
        console.error('[AgendaPage] Failed to load shared sessions:', error);
      },
    });
  }

  private mapUserAgendaSessions(dayDocument: any): Session[] {
    const day = String(dayDocument.dayNumber);
    const dayDate = dayDocument.date;
    return dayDocument.sessions
      .filter((session: any) => session && typeof session === 'object')
      .map((session: any, index: number) => {
        const speaker =
          typeof session.speaker === 'string'
            ? {
                name: session.speaker,
                title: '',
                photoURL: null,
                userID: '',
              }
            : session.speaker;
        const startTime = this.combineAgendaDateAndTime(dayDate, session.timeFrom);
        const endTime = this.combineAgendaDateAndTime(dayDate, session.timeTo);

        return {
          ...session,
          id: session.sessionId || `${day}-${index}`,
          title: session.title || session.label || session.content || session.description || 'Session',
          startTime,
          endTime,
          location: session.location || '',
          day,
          description: session.description || session.content || '',
          category: session.track || 'general',
          color: session.color || '#0f766e',
          isGeneral: true,
          speaker,
          material: session.material || session.attachment || '',
          qnaLink: session.qnaLink || '',
        } as Session;
      });
  }

  private combineAgendaDateAndTime(dayDate: unknown, timeValue: unknown): Date | null {
    if (timeValue && typeof timeValue === 'object' && 'toDate' in timeValue) {
      const timeDate = (timeValue as { toDate: () => Date }).toDate();
      if (Number.isNaN(timeDate.getTime())) return null;
      if (typeof dayDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) {
        return timeDate;
      }
      const [, year, month, day] = dayDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
      return new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        timeDate.getHours(),
        timeDate.getMinutes(),
        timeDate.getSeconds()
      );
    }

    if (typeof timeValue !== 'string') return null;
    const timeMatch = timeValue.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!timeMatch) {
      const parsed = new Date(timeValue);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const seconds = Number(timeMatch[3] || 0);
    const meridiem = timeMatch[4]?.toUpperCase();
    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;

    if (typeof dayDate === 'string') {
      const dayMatch = dayDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dayMatch) {
        return new Date(
          Number(dayMatch[1]),
          Number(dayMatch[2]) - 1,
          Number(dayMatch[3]),
          hours,
          minutes,
          seconds
        );
      }
    }

    const parsed = new Date(timeValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private applyFilters() {
    if (!this.currentUser) return;

    let filtered = this.sessions.filter((s) => s.day === this.selectedDay);

    if (!this.hasUserAgenda) filtered = filtered.filter((session) => {
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

    let mappedSessions = this.hasUserAgenda ? filtered : filtered.map((session) => {
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
      const aTime = this.asDate(a.startTime)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bTime = this.asDate(b.startTime)?.getTime() ?? Number.POSITIVE_INFINITY;
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
    if (!this.availableDays.includes(day)) return;
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

  private keepSelectedDayAvailable() {
    if (this.availableDays.length && !this.availableDays.includes(this.selectedDay)) {
      this.selectedDay = this.availableDays[0];
    }
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
    const start = this.asDate(session.startTime);
    const end = this.asDate(session.endTime);
    if (!start || !end) return '';
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

  getSessionStartTime(session: Session): Date | null {
    return this.asDate(session.startTime);
  }

  private asDate(value: any): Date | null {
    const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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
