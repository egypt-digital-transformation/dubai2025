import { Component, NgZone, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { addDoc } from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';


import {
  IonContent,
  IonIcon,
  IonModal,
  IonButton,
  IonCardTitle,
  IonCard,
  IonCardHeader,
  IonCardContent, IonTextarea, IonInput } from '@ionic/angular/standalone';
import { Auth, signOut, onAuthStateChanged } from '@angular/fire/auth';
import { ModalController } from '@ionic/angular/standalone';
import { DataService } from '../services/data.service';
import { environment } from '../../environments/environment';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection as firebaseCollection,
  DocumentData,
  getFirestore,
  onSnapshot,
  query as firebaseQuery,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import {
  SafetyInductionModalComponent,
  SafetyInductionSite,
  SafetyInductions,
} from '../hse-induction/safety-induction-modal.component';

import {
  Firestore,
  collection,
  collectionData,
  query,
  orderBy,
  Timestamp,
} from '@angular/fire/firestore';

import {
  Observable,
  Subject,
  interval,
  combineLatest,
  map,
  takeUntil,
  shareReplay,
  startWith,
} from 'rxjs';
import { RouterModule } from '@angular/router';

interface Announcement {
  id: string;
  title: string;
  description: string;
  timestamp: any;
  active: boolean;
  priority: string;
}

interface Session {
  id: string;
  title: string;
  startTime: any; // Firestore Timestamp
  endTime: any; // Firestore Timestamp
  location: string;
  day: string;
  description: string;
  category: string;
  color: string;
  isGeneral: boolean;
  speaker?: {
    name: string;
    title: string;
    photoURL: string | null;
    userID: string;
  };
}

type MessageType = 'today' | 'over' | 'before' | null;

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonInput, IonTextarea, 
    IonCardContent,
    IonCardHeader,
    IonCard,
    IonCardTitle,
    IonButton,
    IonModal,
    IonContent,
    IonIcon,
    CommonModule,
    DatePipe,
    RouterModule,
    FormsModule
  ],
})
export class HomePage implements OnInit, OnDestroy {
newAnnouncementTitle: any;
newAnnouncementDesc: any;
openPhotos() {
throw new Error('Method not implemented.');
}
  public primarySession: Session | null = null;
  public secondarySession: Session | null = null;
  public todaySessions$!: Observable<Session[]>;
  public announcements$!: Observable<Announcement[]>;
  public messageType: MessageType = null;
  public currentDay = 1;
  public showQR = false;
  public displayName: string | null = null;
  public isAdmin = false;
  readonly safetyInductions: SafetyInductions = {
    sokhnaplant: {
      completed: false,
      link: 'https://mea-hseegyptonboarding-prod.web.app/sokhnaplant',
    },
    rmx: {
      completed: false,
      link: 'https://mea-hseegyptonboarding-prod.web.app/RMX',
    },
  };
  readonly totalInductionsRequired = 2;
  completedInductionsCount = 0;
private adminEmails = [
  'emily.elias@holcim.com',
  'hadeer.hamada@holcim.com'
];



showAddModal = false;
newAnnouncementPriority = 'normal';



async submitAnnouncement() {
  if (!this.newAnnouncementTitle.trim() || !this.newAnnouncementDesc.trim()) return;

  const ref = collection(this.firestore, 'announcements');
  await addDoc(ref, {
    title: this.newAnnouncementTitle.trim(),
    description: this.newAnnouncementDesc.trim(),
    priority: this.newAnnouncementPriority,
    active: true,
    timestamp: new Date(),
  });

  this.newAnnouncementTitle = '';
  this.newAnnouncementDesc = '';
  this.newAnnouncementPriority = 'normal';
  this.closeAddModal();
}

  private destroy$ = new Subject<void>();
  private readonly TICK_MS = 1000;
  private safetyInductionUnsubscribe?: Unsubscribe;

  constructor(
    private router: Router,
    private firestore: Firestore,
    private auth: Auth,
    private data: DataService,
    private modalController: ModalController,
    private zone: NgZone
  ) {}

  ngOnInit() {

    this.showAddModal = false;
this.showQR = false;

    // sessions$ from data service but ensure it's sorted and convert timestamps lazily when needed.
    const sessionsSorted$ = this.data.sessions$.pipe(
      map((sessions) =>
        (sessions || []).slice().sort((a, b) => this.toDate(a.startTime).getTime() - this.toDate(b.startTime).getTime())
      ),
      shareReplay(1)
    );

    // announcements are expected to come from data service — reuse and share
    this.announcements$ = (this.data.announcements$ || [] as any) as Observable<Announcement[]>;

    // "now" stream for ticking UI (used in evaluation and time-remaining helpers)
    const now$ = interval(this.TICK_MS).pipe(
      startWith(0),
      map(() => new Date()),
      shareReplay(1)
    );

    // auth state - formatted displayName
    const authState$ = new Observable((sub) => {
      const unsub = onAuthStateChanged(this.auth, (user) => sub.next(user ?? null));
      return { unsubscribe: unsub };
    }).pipe(takeUntil(this.destroy$), shareReplay(1));

    authState$.pipe(takeUntil(this.destroy$)).subscribe((user: any) => {
      this.displayName = user?.displayName ? this.formatDisplayName(user.displayName) : null;
      this.isAdmin = !!user?.email && this.adminEmails.includes(user.email);
      this.listenToSafetyInductionStatus(user?.email ?? null);

    });

    
    

    // Combine sessions + now to compute currentDay and evaluate live/up-next sessions
    combineLatest([sessionsSorted$, now$])
      .pipe(
        map(([sessions, now]) => {
          const currentDay = this.calculateCurrentDayFromSessions(sessions, now);
          const evaluation = this.evaluateSessionsForDay(sessions, now, currentDay);
          return { currentDay, evaluation };
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(({ currentDay, evaluation }) => {
        this.currentDay = currentDay;
        this.primarySession = evaluation.primary;
        this.secondarySession = evaluation.secondary;
        this.messageType = evaluation.messageType;
      });

    // expose top-3 sessions for "today" (derived from sorted sessions)
    this.todaySessions$ = sessionsSorted$.pipe(
      map((sessions) => {
        const dayStr = String(this.currentDay); // fallback to 1 if currentDay unset
        return sessions.filter((s) => this.normalizeDay(s.day) === dayStr).slice(0, 3);
      }),
      shareReplay(1)
    );
  }

  ngOnDestroy() {
    this.safetyInductionUnsubscribe?.();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private listenToSafetyInductionStatus(email: string | null): void {
    this.safetyInductionUnsubscribe?.();
    this.safetyInductionUnsubscribe = undefined;

    if (!email) {
      this.updateSafetyInductionStatus();
      return;
    }

    const normalizedEmail = email.toLowerCase();
    const emailVariants = Array.from(new Set([email, normalizedEmail]));
    const hseApp =
      getApps().find((app) => app.name === 'HSEApp') ??
      initializeApp(environment.hsefirebaseConfig, 'HSEApp');
    const hseFirestore = getFirestore(hseApp);
    const userProgressQuery = firebaseQuery(
      firebaseCollection(hseFirestore, 'userProgress'),
      where('email', 'in', emailVariants)
    );

    this.safetyInductionUnsubscribe = onSnapshot(
      userProgressQuery,
      (snapshot) => {
        this.zone.run(() => this.updateSafetyInductionStatus(snapshot.docs[0]?.data()));
      },
      (error) => {
        console.error('[SafetyInduction] Failed to load induction progress:', error);
        this.zone.run(() => this.updateSafetyInductionStatus());
      }
    );
  }

  private updateSafetyInductionStatus(docData?: DocumentData): void {
    const sokhnaPlantData = docData?.['sokhnaPlant'] ?? docData?.['sokhnaplant'];
    const rmxData = docData?.['RMX'] ?? docData?.['rmx'];

    this.safetyInductions.sokhnaplant.completed =
      sokhnaPlantData?.['questionnairePassed'] === true;
    this.safetyInductions.rmx.completed =
      rmxData?.['questionnairePassed'] === true;
    this.completedInductionsCount = Object.values(this.safetyInductions)
      .filter((induction) => induction.completed).length;
  }

  async openSafetyInductionModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: SafetyInductionModalComponent,
      componentProps: {
        safetyInductions: this.safetyInductions,
        completedCount: this.completedInductionsCount,
        totalRequired: this.totalInductionsRequired,
      },
      cssClass: 'safety-induction-modal',
    });

    await modal.present();
    const { data } = await modal.onDidDismiss<{ site?: SafetyInductionSite }>();

    if (data?.site) {
      window.open(this.safetyInductions[data.site].link, '_blank');
    }
  }

  // ---------- Utilities / Helpers ----------

  private formatDisplayName(name: string): string {
    if (!name) return name;
    return name
      .toLowerCase()
      .split(' ')
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' ');
  }

  /** Parse day like "Day 1", "1", "day 2" -> integer. Return 1 on invalid. */
  private parseDayToInt(day?: string | number): number {
    if (day == null) return 1;
    const match = String(day).toLowerCase().match(/(\d+)/);
    const n = match ? parseInt(match[1], 10) : NaN;
    return isNaN(n) ? 1 : n;
  }

  /** Normalize day to digits-only string */
  private normalizeDay(day: string | undefined): string {
    if (!day) return '1';
    const digits = String(day).replace(/[^0-9]/g, '');
    return digits === '' ? '1' : digits;
  }

  /**
   * Convert a variety of Firestore-like timestamp shapes to a JS Date.
   * Non-convertible values produce an Invalid Date (NaN date).
   */
  private toDate(tsOrDate: any): Date {
    if (!tsOrDate) return new Date(NaN);
    if (tsOrDate instanceof Timestamp) return tsOrDate.toDate();
    if (tsOrDate?.toDate && typeof tsOrDate.toDate === 'function') return tsOrDate.toDate();
    if (tsOrDate instanceof Date) return tsOrDate;
    // fallback - allow ISO / numeric strings
    return new Date(tsOrDate);
  }

  /** Calculate event "current day" using sessions and a reference now time. Returns 0 for before event. */
  private calculateCurrentDayFromSessions(sessions: Session[], now = new Date()): number {
    if (!sessions || sessions.length === 0) return 1;

    // Group sessions by day number
    const byDay = new Map<number, { start: Date; end: Date }[]>();
    for (const s of sessions) {
      const dayNum = this.parseDayToInt(s.day);
      const start = this.toDate(s.startTime);
      const end = this.toDate(s.endTime);
      if (!byDay.has(dayNum)) byDay.set(dayNum, []);
      byDay.get(dayNum)!.push({ start, end });
    }

    const dayNums = Array.from(byDay.keys()).sort((a, b) => a - b);
    if (dayNums.length === 0) return 1;

    // Determine day's earliest start and latest end (per day)
    const ranges = dayNums.map((n) => {
      const entries = byDay.get(n)!;
      const starts = entries.map((e) => e.start.getTime());
      const ends = entries.map((e) => e.end.getTime());
      const start = new Date(Math.min(...starts));
      const end = new Date(Math.max(...ends));
      return { dayNum: n, start, end };
    });

    // Before event
    if (now < ranges[0].start) return 0;

    // Find if now is within any day's range. If exactly between days but before 06:00, keep previous day.
    for (let i = 0; i < ranges.length; i++) {
      const { dayNum, start, end } = ranges[i];
      if (now >= start && now <= end) return dayNum;
      const next = ranges[i + 1];
      if (next && now > end && now < next.start) {
        if (now.getDate() === end.getDate() + 1 && now.getHours() < 6) {
          return dayNum;
        }
        return next.dayNum;
      }
    }

    // After last day
    return ranges[ranges.length - 1].dayNum;
  }

  /**
   * Evaluate sessions for a particular day and "now".
   * Returns { primary, secondary, messageType } - pure function.
   */
  private evaluateSessionsForDay(sessions: Session[], now: Date, currentDay: number) {
    if (!sessions || sessions.length === 0) {
      return { primary: null, secondary: null, messageType: 'over' as MessageType };
    }

    // Sorted sessions expected but ensure stable ordering
    const sorted = sessions.slice().sort((a, b) => this.toDate(a.startTime).getTime() - this.toDate(b.startTime).getTime());

    // If before the very first session overall => before event
    const firstOverall = sorted[0];
    if (now < this.toDate(firstOverall.startTime)) {
      return { primary: null, secondary: null, messageType: 'before' as MessageType };
    }

    // Filter today's sessions (by currentDay)
    const todayStr = String(currentDay);
    const todaySessions = sorted.filter((s) => this.normalizeDay(s.day) === todayStr);

    // If there are no sessions for the computed currentDay, determine if we're after event or between days
    if (todaySessions.length === 0) {
      const dayNums = Array.from(new Set(sorted.map((s) => this.parseDayToInt(s.day)))).sort((a, b) => a - b);
      const min = dayNums[0];
      const max = dayNums[dayNums.length - 1];
      if (currentDay === 0) return { primary: null, secondary: null, messageType: 'before' as MessageType };
      if (currentDay > max) return { primary: null, secondary: null, messageType: 'over' as MessageType };
      // Otherwise we're between days and there are sessions on other days
      return { primary: null, secondary: null, messageType: 'today' as MessageType };
    }

    // Now, determine live or upcoming in today's sessions
    // Convert times once for today's sessions to avoid repeated conversion
    const withDates = todaySessions.map((s) => ({
      session: s,
      start: this.toDate(s.startTime),
      end: this.toDate(s.endTime),
    }));

    // Find live session
    const live = withDates.find((d) => d.start <= now && now < d.end);
    if (live) {
      // find next session on today after the live one
      const index = withDates.findIndex((d) => d.session.id === live.session.id);
      const next = withDates.slice(index + 1).find((d) => d.start > now);
      return { primary: live.session, secondary: next ? next.session : null, messageType: null as MessageType };
    }

    // No live -> find upcoming today
    const upcoming = withDates.find((d) => d.start > now);
    if (upcoming) {
      return { primary: upcoming.session, secondary: null, messageType: null as MessageType };
    }

    // No live or upcoming today. Determine if it's the last day.
    const allDayNums = Array.from(new Set(sorted.map((s) => this.parseDayToInt(s.day))));
    const maxDay = Math.max(...allDayNums);
    if (currentDay >= maxDay) {
      return { primary: null, secondary: null, messageType: 'over' as MessageType };
    }

    return { primary: null, secondary: null, messageType: 'today' as MessageType };
  }

  // ---------- UI helpers ----------

  public getTimeUntil(session: Session | null): string {
    if (!session) return '';
    const now = new Date();
    const start = this.toDate(session.startTime);
    const end = this.toDate(session.endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';

    // Live
    if (now >= start && now < end) {
      const remainingMs = Math.max(0, end.getTime() - now.getTime());
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      if (mins > 0) return `Live • ${mins}m ${secs}s left`;
      return `Live • ${secs}s left`;
    }

    // Before start
    const diffMs = start.getTime() - now.getTime();
    if (diffMs <= 0) return 'Starting now';
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 60) return `Starts in ${diffMinutes} min`;
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return minutes === 0 ? `Starts in ${hours}h` : `Starts in ${hours}h ${minutes}m`;
  }

  public isLive(session: Session | null): boolean {
    if (!session) return false;
    const now = new Date();
    const start = this.toDate(session.startTime);
    const end = this.toDate(session.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
    return start <= now && now < end;
  }

  shouldDisplaySpeaker(session: Session | undefined | null): boolean {
    const name = session?.speaker?.name?.trim?.() ?? '';
    if (!name) return false;
    const lc = name.toLowerCase();
    return lc !== 'all' && lc.length > 0;
  }

  // ---------- Navigation ----------

  navigateToAgenda() {
    this.router.navigate(['tabs/agenda']);
  }

  goToAgendaSession(session: Session) {
    this.router.navigate(['tabs/agenda'], {
      queryParams: { sessionId: session.id, day: session.day },
      state: { fromHome: true },
    });
  }

  openNetworking() {
    this.router.navigate(['/tabs/network']);
  }

  openTips() {
    this.router.navigate(['/tips']);
  }

openAddModal() {
  if (this.showQR) this.closeQRCode();
  this.showAddModal = true;
}

async closeAddModal() {
  this.showAddModal = false;
  const modal = document.querySelector('ion-modal.add-modal') as HTMLIonModalElement;
  if (modal) await modal.dismiss();
}

openQRCode() {
  if (this.showAddModal) this.closeAddModal();
  this.showQR = true;
}

async closeQRCode() {
  this.showQR = false;
  const modal = document.querySelector('ion-modal.qr-modal') as HTMLIonModalElement;
  if (modal) await modal.dismiss();
}


  timeAgo(timestamp: any): string {
    if (!timestamp?.toDate) return '';
    const now = new Date();
    const t = timestamp.toDate();
    const diffMs = now.getTime() - t.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  navigateToVenue() {
    this.router.navigate(['/venue']);
  }

  logoutUser() {
    signOut(this.auth)
      .then(() => {
        console.log('[SSO] User signed out');
        this.router.navigateByUrl('/login', { replaceUrl: true });
      })
      .catch((err) => console.error('[SSO] Logout error:', err));
  }

  async addAnnouncement(title: string, description: string, priority: string = 'normal') {
  const ref = collection(this.firestore, 'announcements');
  await addDoc(ref, {
    title,
    description,
    priority,
    active: true,
    timestamp: new Date()
  });
}

}
