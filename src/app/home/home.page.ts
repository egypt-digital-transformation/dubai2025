import { Component, inject, NgZone, OnInit, OnDestroy } from '@angular/core';
import { FirebaseInjectionContext } from '../services/firebase-injection-context.service';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import {
  IonContent,
  IonIcon,
  IonModal,
  IonCardContent,
} from '@ionic/angular/standalone';
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
  Unsubscribe,
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
  where,
  getDocs,
  doc,
  orderBy,
  Timestamp,
  updateDoc,
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
  BehaviorSubject,
} from 'rxjs';
import { RouterModule } from '@angular/router';
import { greetingForNationality } from '../shared/nationality-greetings';
import { AdminPreviewService } from '../services/admin-preview.service';
import QRCode from 'qrcode';
import { mapAgendaDaySessions, parseAgendaDate } from '../shared/agenda-day';

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
const EVENT_START = new Date(2026, 10, 9);
const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    IonModal,
    IonContent,
    IonIcon,
    CommonModule,
    DatePipe,
    RouterModule
  ],
})
export class HomePage implements OnInit, OnDestroy {
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  public primarySession: Session | null = null;
  public secondarySession: Session | null = null;
  public todaySessions$!: Observable<Session[]>;
  public messageType: MessageType = null;
  public currentDay = 0;
  public eventStartDate = EVENT_START;
  private agendaDayDates: { dayNumber: number; date: Date }[] = [];
  public showQR = false;
  public displayName: string | null = null;
  public firstName: string | null = null;
  public welcomeGreeting = 'Ahlan';
  public profileName = '';
  public profilePosition = '';
  public profileCountry = '';
  public profileEmail = '';
  public profileMobile = '';
  public profileQrCode = '';
  public shareContactCard = false;
  public isSavingContactSharing = false;
  public contactSharingError = '';
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
  rmxRequired = false;
  totalInductionsRequired = 1;
  completedInductionsCount = 0;
  isPlantVisitRequired = false;

  private destroy$ = new Subject<void>();
  private readonly agendaSessions$ = new BehaviorSubject<Session[] | null>(null);
  private readonly TICK_MS = 1000;
  private safetyInductionUnsubscribe?: Unsubscribe;
  private agendaUnsubscribe?: Unsubscribe;
  private viewGeneration = 0;
  private profileDocumentId = '';

  constructor(
    private router: Router,
    private firestore: Firestore,
    private auth: Auth,
    private data: DataService,
    private modalController: ModalController,
    private zone: NgZone,
    private readonly adminPreview: AdminPreviewService
  ) {
  }

  ngOnInit() {

this.showQR = false;

    // sessions$ from data service but ensure it's sorted and convert timestamps lazily when needed.
    const sessionsSorted$ = combineLatest([
      this.data.sessions$,
      this.agendaSessions$,
    ]).pipe(
      map(([sharedSessions, agendaSessions]) =>
        (agendaSessions ?? sharedSessions)
          .slice()
          .sort((a, b) => this.toDate(a.startTime).getTime() - this.toDate(b.startTime).getTime())
      ),
      shareReplay(1)
    );

    // "now" stream for ticking UI (used in evaluation and time-remaining helpers)
    const now$ = interval(this.TICK_MS).pipe(
      startWith(0),
      map(() => new Date()),
      shareReplay(1)
    );

    // auth state - formatted displayName
    const authState$ = new Observable((sub) => {
      const unsub = this.firebaseContext.run(() =>
        onAuthStateChanged(this.auth, (user) => sub.next(user ?? null))
      );
      return { unsubscribe: unsub };
    }).pipe(takeUntil(this.destroy$), shareReplay(1));

    authState$.pipe(takeUntil(this.destroy$)).subscribe((user: any) => {
      this.displayName = user?.displayName ? this.formatDisplayName(user.displayName) : null;
      this.applyViewingProfile(user?.email ?? null, user?.uid ?? null);
    });
    this.adminPreview.selectedUser$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.applyViewingProfile(this.auth.currentUser?.email ?? null, this.auth.currentUser?.uid ?? null);
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

  get isPreviewingUser(): boolean {
    return this.adminPreview.isPreviewing;
  }

  get isContactSharingDisabled(): boolean {
    return this.isPreviewingUser || this.isSavingContactSharing || !this.profileDocumentId;
  }

  async setContactCardSharing(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const nextValue = checkbox.checked;
    if (this.isPreviewingUser || !this.profileDocumentId || this.isSavingContactSharing) {
      checkbox.checked = this.shareContactCard;
      return;
    }

    const previousValue = this.shareContactCard;
    this.shareContactCard = nextValue;
    this.isSavingContactSharing = true;
    this.contactSharingError = '';
    try {
      await this.firebaseContext.run(() => updateDoc(doc(this.firestore, 'users', this.profileDocumentId), {
        shareContactCard: nextValue,
      }));
    } catch (error) {
      console.error('[HomePage] Failed to update contact-card sharing:', error);
      this.shareContactCard = previousValue;
      checkbox.checked = previousValue;
      this.contactSharingError = 'Could not update your sharing preference. Please try again.';
    } finally {
      this.isSavingContactSharing = false;
    }
  }

  get eventDayLabel(): string {
    if (this.currentDay > 0) return `DAY ${this.currentDay}`;

    const today = this.startOfDay(new Date());
    const start = this.startOfDay(this.eventStartDate);
    const daysLeft = Math.ceil((start.getTime() - today.getTime()) / DAY_MS);
    return daysLeft > 0
      ? `${daysLeft} DAY${daysLeft === 1 ? '' : 'S'} LEFT`
      : 'STARTS TODAY';
  }

  private applyViewingProfile(authEmail: string | null, uid: string | null): void {
    const previewUser = this.adminPreview.selectedUser;
    const email = previewUser?.email ?? authEmail;
    const generation = ++this.viewGeneration;
    this.firstName = previewUser?.firstName || null;
    this.profileName = previewUser?.name ?? '';
    this.profilePosition = previewUser?.currentPosition ?? '';
    this.profileCountry = previewUser?.locationCountry ?? '';
    this.profileEmail = previewUser?.email ?? authEmail ?? '';
    this.profileMobile = '';
    this.profileQrCode = '';
    this.profileDocumentId = '';
    this.agendaUnsubscribe?.();
    this.agendaUnsubscribe = undefined;
    this.shareContactCard = false;
    this.contactSharingError = '';
    this.welcomeGreeting = 'Ahlan';
    this.eventStartDate = EVENT_START;
    this.agendaDayDates = [];
    this.agendaSessions$.next(null);
    this.isPlantVisitRequired = false;
    if (!email) {
      this.updateSafetyInductionStatus();
      return;
    }
    void this.loadWelcomeProfile(email, uid, generation);
    void this.loadPlantVisitRequirement(email, uid, generation);
    this.listenToSafetyInductionStatus(email, generation);
  }

  private isCurrentViewingUser(email: string, uid: string | null, generation: number): boolean {
    const currentEmail = this.adminPreview.selectedUser?.email ?? this.auth.currentUser?.email ?? '';
    return this.viewGeneration === generation &&
      this.auth.currentUser?.uid === uid &&
      currentEmail.trim().toLowerCase() === email.trim().toLowerCase();
  }

  private async loadWelcomeProfile(email: string, uid: string | null, generation: number): Promise<void> {

    try {
      const users = collection(this.firestore, 'users');
      const normalizedEmail = email.trim().toLowerCase();
      let snapshot = await this.firebaseContext.run(() =>
        getDocs(query(users, where('emailAddress', '==', normalizedEmail)))
      );
      if (snapshot.empty && email.trim() !== normalizedEmail) {
        snapshot = await this.firebaseContext.run(() =>
          getDocs(query(users, where('emailAddress', '==', email.trim())))
        );
      }
      if (snapshot.empty) {
        snapshot = await this.firebaseContext.run(() =>
          getDocs(query(users, where('email', '==', normalizedEmail)))
        );
      }
      if (snapshot.empty && email.trim() !== normalizedEmail) {
        snapshot = await this.firebaseContext.run(() =>
          getDocs(query(users, where('email', '==', email.trim())))
        );
      }
      const userDocument = snapshot.docs[0];
      const data = userDocument?.data() as {
        firstName?: unknown;
        lastName?: unknown;
        nationality?: unknown;
        currentPosition?: unknown;
        locationCountry?: unknown;
        emailAddress?: unknown;
        email?: unknown;
        mobileNumber?: unknown;
        mobile?: unknown;
        mobileNo?: unknown;
        phoneNumber?: unknown;
        phone?: unknown;
        phoneNo?: unknown;
        telephone?: unknown;
        contactNumber?: unknown;
        shareContactCard?: unknown;
        'Mobile Number'?: unknown;
        'Phone Number'?: unknown;
      } | undefined;
      if (!data || !this.isCurrentViewingUser(email, uid, generation)) {
        return;
      }
      const firstName = String(data.firstName ?? '').trim();
      const nationality = String(data.nationality ?? '').trim();
      const lastName = String(data.lastName ?? '').trim();
      const profileEmail = String(data.emailAddress ?? data.email ?? email).trim();
      const profileMobile = this.firstProfileString(data, [
        'mobileNumber',
        'mobile',
        'mobileNo',
        'phoneNumber',
        'phone',
        'phoneNo',
        'telephone',
        'contactNumber',
        'Mobile Number',
        'Phone Number',
      ]);
      const profilePosition = String(data.currentPosition ?? '').trim();
      const profileName = [firstName, lastName].filter(Boolean).join(' ');
      const themeColors = getComputedStyle(document.documentElement);
      const profileQrCode = await QRCode.toDataURL(
        this.createContactVCard(
          firstName,
          lastName,
          profileEmail,
          profileMobile,
          profilePosition
        ),
        {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 240,
          color: {
            dark: themeColors.getPropertyValue('--holcim-dark-blue').trim(),
            light: themeColors.getPropertyValue('--white').trim(),
          },
        }
      );
      if (!this.isCurrentViewingUser(email, uid, generation)) return;
      this.zone.run(() => {
        this.profileDocumentId = userDocument?.id ?? '';
        this.shareContactCard = data.shareContactCard === true;
        this.firstName = firstName || null;
        this.profileName = profileName;
        this.profileEmail = profileEmail;
        this.profileMobile = profileMobile;
        this.profileQrCode = profileQrCode;
        this.profilePosition = profilePosition;
        this.profileCountry = String(data.locationCountry ?? '').trim();
        this.welcomeGreeting = nationality ? greetingForNationality(nationality) : 'Ahlan';
      });
      if (userDocument) {
        await this.loadAgendaStartDate(userDocument.id, email, uid, generation);
      }
    } catch (error) {
      console.error('[HomePage] Failed to load welcome profile:', error);
    }
  }

  private firstProfileString(
    data: Record<string, unknown>,
    fields: string[]
  ): string {
    for (const field of fields) {
      const value = data[field];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  private createContactVCard(
    firstName: string,
    lastName: string,
    email: string,
    mobile: string,
    position: string
  ): string {
    const escape = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `N:${escape(lastName)};${escape(firstName)};;;`,
      `FN:${escape(fullName)}`,
      `TITLE:${escape(position)}`,
      `TEL;TYPE=CELL:${escape(mobile)}`,
      `EMAIL;TYPE=INTERNET:${escape(email)}`,
      'END:VCARD',
    ].join('\r\n');
  }

  private loadAgendaStartDate(
    userId: string,
    email: string,
    uid: string | null,
    generation: number
  ): void {
    this.agendaUnsubscribe?.();
    this.agendaUnsubscribe = undefined;
    try {
      this.agendaUnsubscribe = this.firebaseContext.run(() =>
        onSnapshot(
          firebaseCollection(getFirestore(), 'users', userId, 'agenda'),
          (agendaSnapshot) => {
            if (!this.isCurrentViewingUser(email, uid, generation)) return;
            const agendaDocuments = agendaSnapshot.docs
              .map((agendaDocument) => agendaDocument.data())
              .filter((day) =>
                typeof day['dayNumber'] === 'number' &&
                Array.isArray(day['sessions'])
              );
            const agendaDays = agendaDocuments
              .map((day) => ({
                dayNumber: Number(day['dayNumber']),
                date: parseAgendaDate(day['date']),
              }))
              .filter(
                (day): day is { dayNumber: number; date: Date } =>
                  Number.isInteger(day.dayNumber) &&
                  day.dayNumber > 0 &&
                  day.date !== null
              )
              .sort((a, b) => a.date.getTime() - b.date.getTime());
            const sessions = agendaDocuments
              .flatMap((day) => mapAgendaDaySessions(day))
              .filter(
                (session) =>
                  session.startTime !== null &&
                  session.endTime !== null
              )
              .map((session) => ({
                ...session,
                startTime: Timestamp.fromDate(session.startTime!),
                endTime: Timestamp.fromDate(session.endTime!),
              }));
            this.zone.run(() => {
              this.agendaSessions$.next(agendaDocuments.length ? sessions : null);
              this.agendaDayDates = agendaDays;
              if (agendaDays.length) {
                this.eventStartDate = agendaDays[0].date;
              }
            });
          },
          (error) => {
            console.error('[HomePage] Failed to listen to the user agenda:', error);
          }
        )
      );
    } catch (error) {
      console.error('[HomePage] Failed to listen to the user agenda:', error);
    }
  }

  private async loadPlantVisitRequirement(email: string, uid: string | null, generation: number): Promise<void> {
    this.isPlantVisitRequired = false;

    try {
      const usersQuery = query(
        collection(this.firestore, 'users'),
        where('emailAddress', '==', email)
      );
      const snapshot = await this.firebaseContext.run(() => getDocs(usersQuery));
      const plantVisit = snapshot.docs[0]?.data()['plantVisit'] === true;
      if (this.isCurrentViewingUser(email, uid, generation)) {
        this.zone.run(() => {
          this.isPlantVisitRequired = plantVisit;
        });
      }
    } catch (error) {
      console.error('[HomePage] Failed to load plant visit requirement:', error);
    }
  }

  ngOnDestroy() {
    this.safetyInductionUnsubscribe?.();
    this.agendaUnsubscribe?.();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private listenToSafetyInductionStatus(email: string, generation: number): void {
    this.safetyInductionUnsubscribe?.();
    this.safetyInductionUnsubscribe = undefined;

    const normalizedEmail = email.trim().toLowerCase();
    const hseApp =
      getApps().find((app) => app.name === 'HSEApp') ??
      initializeApp(environment.hsefirebaseConfig, 'HSEApp');
    const hseFirestore = getFirestore(hseApp);
    this.safetyInductionUnsubscribe = onSnapshot(
      firebaseCollection(hseFirestore, 'userProgress'),
      (snapshot) => {
        const matchingProgress = snapshot.docs.find((progressDocument) =>
          String(progressDocument.data()['email'] ?? '').trim().toLowerCase() === normalizedEmail
        );
        if (this.viewGeneration === generation) {
          this.zone.run(() => this.updateSafetyInductionStatus(matchingProgress?.data()));
        }
      },
      (error) => {
        console.error('[SafetyInduction] Failed to load induction progress:', error);
        if (this.viewGeneration === generation) {
          this.zone.run(() => this.updateSafetyInductionStatus());
        }
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
    this.rmxRequired = rmxData !== undefined && rmxData !== null;
    this.totalInductionsRequired = this.rmxRequired ? 2 : 1;
    this.completedInductionsCount = [
      this.safetyInductions.sokhnaplant.completed,
      this.rmxRequired && this.safetyInductions.rmx.completed,
    ].filter(Boolean).length;
  }

  async openSafetyInductionModal(): Promise<void> {
    if (this.isPreviewingUser) {
      return;
    }
    const modal = await this.modalController.create({
      component: SafetyInductionModalComponent,
      componentProps: {
        safetyInductions: this.safetyInductions,
        rmxRequired: this.rmxRequired,
        completedCount: this.completedInductionsCount,
        totalRequired: this.totalInductionsRequired,
      },
      cssClass: this.rmxRequired
        ? 'safety-induction-modal'
        : 'safety-induction-modal single-site',
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

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private getEventDays(sessions: Session[]): { dayNumber: number; date: Date }[] {
    if (this.agendaDayDates.length) return this.agendaDayDates;

    const sessionDays = new Map<number, Date>();
    for (const session of sessions || []) {
      const dayNumber = this.parseDayToInt(session.day);
      const sessionDate = this.toDate(session.startTime);
      if (Number.isNaN(sessionDate.getTime())) continue;
      const date = this.startOfDay(sessionDate);
      const existing = sessionDays.get(dayNumber);
      if (!existing || date < existing) sessionDays.set(dayNumber, date);
    }

    if (sessionDays.size) {
      return Array.from(sessionDays, ([dayNumber, date]) => ({ dayNumber, date }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    return [1, 2, 3].map((dayNumber) => ({
      dayNumber,
      date: new Date(
        EVENT_START.getFullYear(),
        EVENT_START.getMonth(),
        EVENT_START.getDate() + dayNumber - 1
      ),
    }));
  }

  private calculateCurrentDayFromSessions(sessions: Session[], now = new Date()): number {
    const eventDays = this.getEventDays(sessions);
    const today = this.startOfDay(now);
    const firstDay = eventDays[0];
    if (today < firstDay.date) return 0;

    let currentDay = firstDay.dayNumber;
    for (const eventDay of eventDays) {
      if (today < eventDay.date) break;
      currentDay = eventDay.dayNumber;
    }
    return currentDay;
  }

  /**
   * Evaluate sessions for a particular day and "now".
   * Returns { primary, secondary, messageType } - pure function.
   */
  private evaluateSessionsForDay(sessions: Session[], now: Date, currentDay: number) {
    const eventDays = this.getEventDays(sessions);
    const firstEventDate = eventDays[0].date;
    const lastEventDate = eventDays[eventDays.length - 1].date;
    const eventEndExclusive = new Date(
      lastEventDate.getFullYear(),
      lastEventDate.getMonth(),
      lastEventDate.getDate() + 1
    );

    if (now < firstEventDate) {
      return { primary: null, secondary: null, messageType: 'before' as MessageType };
    }
    if (now >= eventEndExclusive) {
      return { primary: null, secondary: null, messageType: 'over' as MessageType };
    }
    if (!sessions || sessions.length === 0) {
      return { primary: null, secondary: null, messageType: 'today' as MessageType };
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

openQRCode() {
  this.showQR = true;
}

async closeQRCode() {
  this.showQR = false;
  const modal = document.querySelector('ion-modal.qr-modal') as HTMLIonModalElement;
  if (modal) await modal.dismiss();
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

}
