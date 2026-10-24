import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  QueryList,
  ViewChildren,
  ViewChild,
  inject,
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
import { interval, Subject, Subscription, takeUntil } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AdminPreviewService } from '../services/admin-preview.service';
import { FirebaseInjectionContext } from '../services/firebase-injection-context.service';
import {
  AgendaDayDate,
  mapAgendaDaySessions,
  parseAgendaDate,
  selectAgendaDayForDate,
} from '../shared/agenda-day';

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
  labelGroupId?: string;
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

interface AgendaSessionGroup {
  key: string;
  panelId: string;
  label: string;
  sessions: Session[];
}

@Component({
  selector: 'app-agenda',
  standalone: true,
  templateUrl: './agenda.page.html',
  styleUrls: ['./agenda.page.scss'],
  imports: [IonContent, IonIcon, CommonModule, FormsModule],
})
export class AgendaPage implements OnInit, OnDestroy {
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  selectedDay = '1';
  availableDays: string[] = [];
  isTransitioning = false;

  @ViewChildren('sessionCard') sessionCards!: QueryList<ElementRef>;
  @ViewChild(IonContent, { static: false }) content!: IonContent;

  sessions: Session[] = [];
  filteredSessions: Session[] = [];
  filteredSessionGroups: AgendaSessionGroup[] = [];
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
  private readonly destroy$ = new Subject<void>();
  private agendaDayDates: AgendaDayDate[] = [];
  private lastAutoSelectedDate = '';
  private hasAutoSelectedAgendaDay = false;
  private readonly collapsedGroupKeys = new Set<string>();

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

    interval(60_000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateAgendaDayForCurrentDate());
    window.addEventListener('focus', this.onAppForeground);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ionViewWillEnter(): void {
    this.updateAgendaDayForCurrentDate();
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
    this.previewSubscription?.unsubscribe();
    this.sessionsSubscription?.unsubscribe();
    this.userAgendaSubscription?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('focus', this.onAppForeground);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onAppForeground = (): void => {
    this.updateAgendaDayForCurrentDate();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.updateAgendaDayForCurrentDate();
    }
  };

  async initializeAgenda(emailOverride?: string) {
    const loadId = ++this.agendaLoadId;
    this.sessionsSubscription?.unsubscribe();
    this.userAgendaSubscription?.unsubscribe();
    this.sessionsSubscription = undefined;
    this.userAgendaSubscription = undefined;
    this.hasUserAgenda = false;
    this.availableDays = [];
    this.agendaDayDates = [];
    this.hasAutoSelectedAgendaDay = false;
    this.lastAutoSelectedDate = '';

    try {
      this.currentUser = null;
      this.sessions = [];
      this.filteredSessions = [];
      this.filteredSessionGroups = [];
      this.collapsedGroupKeys.clear();
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
      let snapshot = await this.firebaseContext.run(() => getDocs(emailAddressQuery));
      if (loadId !== this.agendaLoadId) return;
      if (snapshot.empty) {
        const emailQuery = query(usersRef, where('email', '==', this.userEmail));
        snapshot = await this.firebaseContext.run(() => getDocs(emailQuery));
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
            this.agendaDayDates = dayDocuments
              .map((dayDocument) => ({
                dayNumber: Number(dayDocument.dayNumber),
                date: parseAgendaDate(dayDocument.date),
              }))
              .filter(
                (day): day is AgendaDayDate =>
                  Number.isInteger(day.dayNumber) &&
                  day.dayNumber > 0 &&
                  day.date !== null
              );
            this.updateAgendaDayForCurrentDate();
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
    return mapAgendaDaySessions(dayDocument);
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
    const groups = new Map<string, AgendaSessionGroup>();
    for (const session of this.filteredSessions) {
      const groupingId =
        session.labelGroupId ||
        `category:${session.category || 'general'}`;
      const key = `${session.day}:${groupingId}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          panelId: `agenda-group-${this.selectedDay}-${groups.size}`,
          label:
            session.category && session.category !== 'general'
              ? session.category
              : 'Sessions',
          sessions: [],
        };
        groups.set(key, group);
      }
      group.sessions.push(session);
    }
    this.filteredSessionGroups = [...groups.values()];

    console.log('[DEBUG] Filtered sessions:', this.filteredSessions);
  }

  isGroupCollapsed(groupKey: string): boolean {
    return this.collapsedGroupKeys.has(groupKey);
  }

  toggleSessionGroup(groupKey: string): void {
    if (this.collapsedGroupKeys.has(groupKey)) {
      this.collapsedGroupKeys.delete(groupKey);
    } else {
      this.collapsedGroupKeys.add(groupKey);
    }
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

  private updateAgendaDayForCurrentDate(): void {
    if (!this.agendaDayDates.length) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (this.hasAutoSelectedAgendaDay && today === this.lastAutoSelectedDate) {
      return;
    }

    this.lastAutoSelectedDate = today;
    this.hasAutoSelectedAgendaDay = true;
    const dayNumber = selectAgendaDayForDate(this.agendaDayDates, now);
    if (dayNumber === null) return;

    const day = String(dayNumber);
    if (this.availableDays.includes(day) && this.selectedDay !== day) {
      this.selectedDay = day;
      this.applyFilters();
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
