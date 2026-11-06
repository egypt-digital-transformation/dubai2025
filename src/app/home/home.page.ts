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
import {
  GoogleAuthProvider,
  User as FirebaseUser,
  getAuth,
  onAuthStateChanged as onFirebaseAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import { DataService } from '../services/data.service';
import { environment } from '../../environments/environment';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection as firebaseCollection,
  DocumentData,
  doc as firebaseDoc,
  getDoc as firebaseGetDoc,
  getFirestore,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';

import { addIcons } from 'ionicons';
import {
  timeOutline,
  locationOutline,
  hourglassOutline,
  radioOutline,
  chevronForward,
  qrCodeOutline,
  mapOutline,
  airplaneOutline,
  bulbOutline,
  checkmarkCircle,
  trophy,
  calendarOutline,
  cameraOutline,
  statsChartOutline,
  keyOutline,
  closeOutline,
  personOutline,
  briefcaseOutline,
  callOutline,
  mailOutline,
  copyOutline,
  checkmarkOutline,
  notificationsOutline,
  easelOutline,
  wineOutline,
  sparklesOutline,
  peopleOutline,
  restaurantOutline,
  gridOutline,
} from 'ionicons/icons';

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
  catchError,
  of,
  switchMap,
} from 'rxjs';
import { RouterModule } from '@angular/router';
import { greetingForNationality } from '../shared/nationality-greetings';
import { AdminPreviewService } from '../services/admin-preview.service';
import QRCode from 'qrcode';
import { mapAgendaDaySessions, parseAgendaDate } from '../shared/agenda-day';
import { ActivitiesService } from '../services/activities.service';
import { EventArchiveService } from '../services/event-archive.service';
import { AdminService, ReceivedNotification } from '../services/admin.service';
import {
  SafetyInductionModalComponent,
  SafetyInductionSite,
  SafetyInductions,
} from '../hse-induction/safety-induction-modal.component';

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
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
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
  private readonly hseApp =
    getApps().find((app) => app.name === 'HSEApp') ??
    initializeApp(environment.hsefirebaseConfig, 'HSEApp');
  private readonly hseAuth = getAuth(this.hseApp);
  private readonly hseFirestore = getFirestore(this.hseApp);
  public primarySession: Session | null = null;
  public secondarySession: Session | null = null;
  public isLoadingSessions = true;
  public sessionsLoadError = '';
  public todaySessions$!: Observable<Session[]>;
  public messageType: MessageType = null;
  public currentDay = 0;
  public eventStartDate = EVENT_START;
  private agendaDayDates: { dayNumber: number; date: Date }[] = [];
  /** True once the viewed user's (or previewed user's) personal agenda has been read. */
  private isViewerAgendaLoaded = false;
  public showQR = false;
  public showSeatingModal = false;
  public displayName: string | null = null;
  public firstName: string | null = null;
  public welcomeGreeting = 'Ahlan';
  public profileName = '';
  public profilePosition = '';
  public profileCountry = '';
  public profileEmail = '';
  public homeAnnouncements: ReceivedNotification[] = [];
  public profileMobile = '';
  public profileQrCode = '';
  public plenarySeating = '';
  public galaDinner = '';
  public userGroup = '';
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
  safetyInductionStatusLoaded = false;
  safetyInductionStatusMessage = 'Tap to sync status';
  isPlantVisitRequired = false;
  public unseenActivitiesCount = 0;
  public isEventArchived = false;
  public eventArchiveStatusError = false;
  public isWifiPasswordCopied = false;
  public wifiPasswordCopyError = '';
  public wifiNetworkName = '';
  public wifiPassword = '';
  public isWifiLoading = true;
  public wifiLoadError = '';

  private destroy$ = new Subject<void>();
  private readonly retrySessions$ = new Subject<void>();
  private readonly agendaSessions$ = new BehaviorSubject<Session[] | null>(null);
  private readonly activitiesService = inject(ActivitiesService);
  private readonly eventArchiveService = inject(EventArchiveService);
  private readonly adminService = inject(AdminService);
  private readonly TICK_MS = 1000;
  private hseAuthUnsubscribe?: Unsubscribe;
  private agendaUnsubscribe?: Unsubscribe;
  private profileUnsubscribe?: Unsubscribe;
  private wifiDetailsUnsubscribe?: Unsubscribe;
  private viewGeneration = 0;
  private homeAnnouncementGeneration = 0;
  private profileDocumentId = '';
  private wifiCopyResetTimer?: ReturnType<typeof setTimeout>;
  private safetyStatusRefreshTimer?: ReturnType<typeof setInterval>;
  private homeAnnouncementRefreshTimer?: ReturnType<typeof setInterval>;

  get hasSeatingAssignments(): boolean {
    return Boolean(this.plenarySeating?.trim() || this.galaDinner?.trim());
  }

  get userGroupLabel(): string {
    if (!this.userGroup) return '';
    const trimmed = this.userGroup.trim();
    if (/^group\s*\d+/i.test(trimmed)) {
      return trimmed.replace(/^group\s*/i, 'Group ');
    }
    return trimmed;
  }

  formatTableNumber(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (!str) return '';
    return str.replace(/^table\s*#?/i, '').trim();
  }

  get seatingQuickSummary(): string {
    const plenary = this.formatTableNumber(this.plenarySeating);
    const gala = this.formatTableNumber(this.galaDinner);
    if (plenary && gala) {
      return `Table ${plenary} & ${gala}`;
    }
    if (plenary) {
      return `Table ${plenary}`;
    }
    if (gala) {
      return `Table ${gala}`;
    }
    return 'Table assignments';
  }

  openSeatingModal() {
    this.showSeatingModal = true;
  }

  async closeSeatingModal() {
    this.showSeatingModal = false;
    const modal = document.querySelector('ion-modal.seating-modal') as HTMLIonModalElement;
    if (modal) await modal.dismiss();
  }

  showFlightWelcomeModal = false;
  flightWelcomeFlightNo = '';
  flightWelcomeFirstName = '';

  closeFlightWelcomeModal() {
    this.showFlightWelcomeModal = false;
    const emailKey = (this.profileEmail || this.auth.currentUser?.email || '').trim().toLowerCase();
    if (emailKey) {
      try {
        localStorage.setItem(`flight_welcome_seen_${emailKey}`, 'true');
      } catch {}
    }
  }

  exploreFromFlightWelcome(target: 'agenda' | 'journey') {
    this.closeFlightWelcomeModal();
    if (target === 'agenda') {
      void this.router.navigate(['/tabs/agenda']);
    } else if (target === 'journey') {
      void this.router.navigate(['/tabs/journey']);
    }
  }

  constructor(
    private router: Router,
    private firestore: Firestore,
    private auth: Auth,
    private data: DataService,
    private modalController: ModalController,
    private zone: NgZone,
    private readonly adminPreview: AdminPreviewService
  ) {
    addIcons({ qrCodeOutline, mapOutline, airplaneOutline, bulbOutline, cameraOutline, statsChartOutline, chevronForward, locationOutline, hourglassOutline, calendarOutline, radioOutline, keyOutline, closeOutline, personOutline, briefcaseOutline, callOutline, mailOutline, copyOutline, checkmarkOutline, notificationsOutline, timeOutline, checkmarkCircle, trophy, easelOutline, wineOutline, sparklesOutline, peopleOutline, restaurantOutline, gridOutline });
  }

  ionViewWillEnter() {
    void this.activitiesService.refreshUnseenCount();
    void this.refreshHomeAnnouncement();
    if (!this.homeAnnouncementRefreshTimer) {
      this.homeAnnouncementRefreshTimer = setInterval(
        () => void this.refreshHomeAnnouncement(),
        30_000
      );
    }
    if (this.profileEmail) {
      void this.loadSafetyInductionStatus(this.profileEmail, this.viewGeneration);
      if (!this.safetyStatusRefreshTimer) {
        this.safetyStatusRefreshTimer = setInterval(() => {
          if (this.profileEmail) {
            void this.loadSafetyInductionStatus(
              this.profileEmail,
              this.viewGeneration
            );
          }
        }, 30_000);
      }
    }
  }

  ionViewWillLeave(): void {
    if (this.homeAnnouncementRefreshTimer) {
      clearInterval(this.homeAnnouncementRefreshTimer);
      this.homeAnnouncementRefreshTimer = undefined;
    }
    if (this.safetyStatusRefreshTimer) {
      clearInterval(this.safetyStatusRefreshTimer);
      this.safetyStatusRefreshTimer = undefined;
    }
  }

  private async refreshHomeAnnouncement(): Promise<void> {
    const generation = ++this.homeAnnouncementGeneration;
    const userId = this.auth.currentUser?.uid;
    if (this.isPreviewingUser || !userId) {
      this.homeAnnouncements = [];
      return;
    }

    try {
      const notifications = await this.adminService.listReceivedNotifications();
      if (
        generation !== this.homeAnnouncementGeneration ||
        this.isPreviewingUser ||
        this.auth.currentUser?.uid !== userId
      ) {
        return;
      }
      this.homeAnnouncements = notifications
        .filter((notification) => notification.homeAnnouncement === true)
        .sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        );
    } catch (error) {
      console.error('[HomePage] Failed to load Home announcements:', error);
    }
  }

  ngOnInit() {

    this.showQR = false;
    this.loadWifiDetails();
    this.hseAuthUnsubscribe = onFirebaseAuthStateChanged(this.hseAuth, (user) => {
      const email = this.auth.currentUser?.email ?? '';
      if (user && this.isSameEmail(user.email, email) && !this.isPreviewingUser) {
        void this.readSafetyInductionStatus(user, this.viewGeneration);
      }
    });

    this.eventArchiveService.start();
    this.eventArchiveService.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.zone.run(() => {
          this.isEventArchived = state.archived;
          this.eventArchiveStatusError = state.status === 'error';
        });
      });

    this.activitiesService.unseenCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe((count) => {
        this.unseenActivitiesCount = count;
      });
    void this.activitiesService.refreshUnseenCount();

    // sessions$ from data service but ensure it's sorted and convert timestamps lazily when needed.
    this.data.sessionsState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.zone.run(() => {
          this.isLoadingSessions = state.status === 'loading';
          this.sessionsLoadError =
            state.status === 'error'
              ? 'Could not load the schedule. Check your connection and try again.'
              : '';
        });
      });

    const sharedSessions$ = this.retrySessions$.pipe(
      startWith(undefined),
      switchMap(() =>
        this.data.sessions$.pipe(
          catchError((error: unknown) => {
            console.error('[HomePage] Failed to load sessions:', error);
            return of([] as Session[]);
          })
        )
      )
    );
    const sessionsSorted$ = combineLatest([
      sharedSessions$,
      this.agendaSessions$,
    ]).pipe(
      map(([sharedSessions, agendaSessions]) =>
        (agendaSessions ?? (this.adminPreview.isPreviewing ? [] : sharedSessions))
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
        this.zone.run(() => {
          this.currentDay = currentDay;
          this.primarySession = evaluation.primary;
          this.secondarySession = evaluation.secondary;
          this.messageType = this.isEventArchived
            ? 'over'
            : evaluation.messageType === 'over'
              ? 'today'
              : evaluation.messageType;
        });
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

  retrySessionLoad(): void {
    this.retrySessions$.next();
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
        ...(this.auth.currentUser?.photoURL?.trim() ? { photoURL: this.auth.currentUser.photoURL.trim() } : {}),
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
    this.homeAnnouncements = [];
    void this.refreshHomeAnnouncement();
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
    this.plenarySeating = previewUser?.plenarySeating ?? '';
    this.galaDinner = previewUser?.galaDinner ?? '';
    this.userGroup = previewUser?.group ?? '';
    this.agendaUnsubscribe?.();
    this.agendaUnsubscribe = undefined;
    this.showSeatingModal = false;
    this.shareContactCard = false;
    this.contactSharingError = '';
    this.welcomeGreeting = 'Ahlan';
    this.eventStartDate = EVENT_START;
    this.agendaDayDates = [];
    this.isViewerAgendaLoaded = false;
    this.currentDay = 0;
    this.agendaSessions$.next(null);
    this.isPlantVisitRequired = false;
    this.safetyInductionStatusLoaded = false;
    this.safetyInductionStatusMessage = 'Tap to sync status';
    this.profileUnsubscribe?.();
    this.profileUnsubscribe = undefined;
    if (!email) {
      this.updateSafetyInductionStatus();
      return;
    }
    void this.loadWelcomeProfile(email, uid, generation);
    void this.loadSafetyInductionStatus(email, generation);
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
      if (!userDocument || !this.isCurrentViewingUser(email, uid, generation)) {
        return;
      }
      this.profileDocumentId = userDocument.id;
      this.profileUnsubscribe?.();
      this.profileUnsubscribe = this.firebaseContext.run(() =>
        onSnapshot(
          userDocument.ref,
          (profileSnapshot) => {
            const data = profileSnapshot.data();
            if (!data || !this.isCurrentViewingUser(email, uid, generation)) {
              return;
            }
            void this.updateWelcomeProfile(
              userDocument.id,
              data,
              email,
              uid,
              generation
            );
          },
          (error) => {
            console.error('[HomePage] Failed to listen to the user profile:', error);
          }
        )
      );
      this.loadAgendaStartDate(userDocument.id, email, uid, generation);
    } catch (error) {
      console.error('[HomePage] Failed to load welcome profile:', error);
    }
  }

  private async updateWelcomeProfile(
    userId: string,
    data: DocumentData,
    email: string,
    uid: string | null,
    generation: number
  ): Promise<void> {
    try {
      const firstName = String(data['firstName'] ?? '').trim();
      const nationality = String(data['nationality'] ?? '').trim();
      const lastName = String(data['lastName'] ?? '').trim();
      const profileEmail = String(data['emailAddress'] ?? data['email'] ?? email).trim();
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
      const profilePosition = String(data['currentPosition'] ?? '').trim();
      const profileName = [firstName, lastName].filter(Boolean).join(' ');
      const rawPlenary = data['plenarySeating'] ?? data['plenaryTable'] ?? data['Plenary Seating'];
      const plenarySeating = rawPlenary !== undefined && rawPlenary !== null ? String(rawPlenary).trim() : '';
      const rawGala = data['galaDinner'] ?? data['galaTable'] ?? data['Gala Dinner'];
      const galaDinner = rawGala !== undefined && rawGala !== null ? String(rawGala).trim() : '';
      const rawGroup = data['group'] ?? data['userGroup'] ?? '';
      const userGroup = rawGroup !== undefined && rawGroup !== null ? String(rawGroup).trim() : '';
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
        this.profileDocumentId = userId;
        this.shareContactCard = data['shareContactCard'] === true;
        this.firstName = firstName || null;
        this.profileName = profileName;
        this.profileEmail = profileEmail;
        this.profileMobile = profileMobile;
        this.profileQrCode = profileQrCode;
        this.profilePosition = profilePosition;
        this.profileCountry = String(data['locationCountry'] ?? '').trim();
        this.plenarySeating = plenarySeating;
        this.galaDinner = galaDinner;
        this.userGroup = userGroup;
        this.welcomeGreeting = nationality ? greetingForNationality(nationality) : 'Ahlan';
        this.isPlantVisitRequired = data['plantVisit'] === true;
        this.checkFlightArrivalWelcome(data, profileEmail);
      });
    } catch (error) {
      console.error('[HomePage] Failed to update the live welcome profile:', error);
    }
  }

  private checkFlightArrivalWelcome(data: Record<string, unknown>, email: string): void {
    const inbound = (data['inbound'] as any) || (data['flightDetails'] as any)?.inbound;
    const flightWelcomeSent = data['flightWelcomeSent'] === true;
    if (!inbound && !flightWelcomeSent) return;

    const emailKey = (email || '').trim().toLowerCase();
    if (!emailKey) return;

    try {
      if (localStorage.getItem(`flight_welcome_seen_${emailKey}`) === 'true') {
        return;
      }
    } catch {}

    let isDue = flightWelcomeSent;
    if (!isDue && inbound?.arrivalDate && inbound?.arrivalTime) {
      const arrivalDate = this.parseCairoFlightArrival(String(inbound.arrivalDate), String(inbound.arrivalTime));
      if (arrivalDate && !isNaN(arrivalDate.getTime())) {
        const triggerMillis = arrivalDate.getTime() + 40 * 60 * 1000;
        const now = Date.now();
        // If 40 min passed and flight arrival is within last 48 hours
        if (now >= triggerMillis && now <= triggerMillis + 48 * 60 * 60 * 1000) {
          isDue = true;
        }
      }
    }

    if (isDue) {
      this.flightWelcomeFlightNo = inbound?.flightNo ? String(inbound.flightNo).trim() : '';
      const rawFirstName = String(data['firstName'] ?? data['displayName'] ?? this.firstName ?? '').trim();
      this.flightWelcomeFirstName = rawFirstName.split(/\s+/)[0] || 'Delegate';
      setTimeout(() => {
        if (!this.showQR && !this.showSeatingModal) {
          this.zone.run(() => {
            this.showFlightWelcomeModal = true;
          });
        }
      }, 700);
    }
  }

  private parseCairoFlightArrival(arrivalDateStr: string, arrivalTimeStr: string): Date | null {
    const dateTrimmed = (arrivalDateStr || '').trim();
    const timeTrimmed = (arrivalTimeStr || '').trim();
    if (!dateTrimmed || !timeTrimmed) return null;

    let year: number;
    let month: number;
    let day: number;

    const dmyMatch = dateTrimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    const ymdMatch = dateTrimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

    if (dmyMatch) {
      day = Number(dmyMatch[1]);
      month = Number(dmyMatch[2]);
      const rawYear = Number(dmyMatch[3]);
      year = rawYear < 100 ? 2000 + rawYear : rawYear;
    } else if (ymdMatch) {
      year = Number(ymdMatch[1]);
      month = Number(ymdMatch[2]);
      day = Number(ymdMatch[3]);
    } else {
      const parsed = new Date(dateTrimmed);
      if (isNaN(parsed.getTime())) return null;
      year = parsed.getUTCFullYear();
      month = parsed.getUTCMonth() + 1;
      day = parsed.getUTCDate();
    }

    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const timeMatch = timeTrimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
    if (!timeMatch) return null;

    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const second = Number(timeMatch[3] || 0);
    const meridiem = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

    if (meridiem === 'PM' && hour < 12) {
      hour += 12;
    } else if (meridiem === 'AM' && hour === 12) {
      hour = 0;
    }

    if (hour > 23 || minute > 59 || second > 59) {
      return null;
    }

    const targetUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    let candidateMillis = targetUtcMillis;
    for (let attempt = 0; attempt < 2; attempt++) {
      const formattedParts = Object.fromEntries(
        formatter
          .formatToParts(new Date(candidateMillis))
          .filter((part) => part.type !== 'literal')
          .map(({ type, value }) => [type, Number(value)])
      );
      const formattedUtcMillis = Date.UTC(
        formattedParts['year'],
        formattedParts['month'] - 1,
        formattedParts['day'],
        formattedParts['hour'],
        formattedParts['minute'],
        formattedParts['second']
      );
      candidateMillis += targetUtcMillis - formattedUtcMillis;
    }

    return new Date(candidateMillis);
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
              // Update day dates BEFORE emitting sessions so the day
              // calculation never runs against the previous user's dates.
              this.agendaDayDates = agendaDays;
              this.isViewerAgendaLoaded = true;
              this.eventStartDate = agendaDays.length ? agendaDays[0].date : EVENT_START;
              this.agendaSessions$.next(agendaDocuments.length ? sessions : null);
            });
          },
          (error) => {
            console.error('[HomePage] Failed to listen to the user agenda:', error);
            if (!this.isCurrentViewingUser(email, uid, generation)) return;
            this.zone.run(() => {
              this.isViewerAgendaLoaded = true;
              this.agendaSessions$.next(this.agendaSessions$.value);
            });
          }
        )
      );
    } catch (error) {
      console.error('[HomePage] Failed to listen to the user agenda:', error);
    }
  }

  ngOnDestroy() {
    this.ionViewWillLeave();
    this.profileUnsubscribe?.();
    this.hseAuthUnsubscribe?.();
    this.agendaUnsubscribe?.();
    this.wifiDetailsUnsubscribe?.();
    if (this.wifiCopyResetTimer) clearTimeout(this.wifiCopyResetTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  async copyWifiPassword(): Promise<void> {
    this.wifiPasswordCopyError = '';
    try {
      if (!this.wifiPassword) {
        throw new Error('The Wi-Fi password is not available.');
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }
      await navigator.clipboard.writeText(this.wifiPassword);
      this.isWifiPasswordCopied = true;
      if (this.wifiCopyResetTimer) clearTimeout(this.wifiCopyResetTimer);
      this.wifiCopyResetTimer = setTimeout(() => {
        this.isWifiPasswordCopied = false;
      }, 2000);
    } catch (error) {
      console.error('[HomePage] Could not copy the hotel Wi-Fi password:', error);
      this.isWifiPasswordCopied = false;
      this.wifiPasswordCopyError =
        'Could not copy the password. Please select and copy it manually.';
    }
  }

  private loadWifiDetails(): void {
    this.isWifiLoading = true;
    this.wifiLoadError = '';
    const wifiDocument = firebaseDoc(this.firestore, 'network', 'details');
    this.wifiDetailsUnsubscribe?.();
    this.wifiDetailsUnsubscribe = this.firebaseContext.run(() =>
      onSnapshot(
        wifiDocument,
        (snapshot) => {
          const data = snapshot.data();
          const name = typeof data?.['name'] === 'string'
            ? data['name'].trim()
            : '';
          const password = typeof data?.['password'] === 'string'
            ? data['password'].trim()
            : '';
          this.zone.run(() => {
            this.wifiNetworkName = name;
            this.wifiPassword = password;
            this.isWifiLoading = false;
            this.wifiLoadError = name && password
              ? ''
              : 'Wi-Fi details are not available right now.';
          });
        },
        (error) => {
          console.error('[HomePage] Could not load hotel Wi-Fi details:', error);
          this.zone.run(() => {
            this.wifiNetworkName = '';
            this.wifiPassword = '';
            this.isWifiLoading = false;
            this.wifiLoadError =
              'Wi-Fi details could not be loaded. Please try again later.';
          });
        }
      )
    );
  }

  private async loadSafetyInductionStatus(email: string, generation: number): Promise<void> {
    const hseUser = this.hseAuth.currentUser;
    if (!hseUser || !this.isSameEmail(hseUser.email, email) || this.isPreviewingUser) {
      this.safetyInductionStatusLoaded = false;
      this.safetyInductionStatusMessage = 'Tap to sync status';
      return;
    }

    try {
      await this.readSafetyInductionStatus(hseUser, generation);
    } catch (error) {
      this.handleSafetyInductionReadError(error, generation);
    }
  }

  private async readSafetyInductionStatus(
    user: FirebaseUser,
    generation: number
  ): Promise<void> {
    try {
      const progress = await firebaseGetDoc(
        firebaseDoc(this.hseFirestore, 'userProgress', user.uid)
      );
      if (
        this.viewGeneration !== generation ||
        this.hseAuth.currentUser?.uid !== user.uid ||
        !this.isSameEmail(user.email, this.auth.currentUser?.email ?? '') ||
        this.isPreviewingUser
      ) {
        return;
      }

      this.zone.run(() => {
        this.updateSafetyInductionStatus(progress.exists() ? progress.data() : undefined);
        this.safetyInductionStatusLoaded = true;
        this.safetyInductionStatusMessage = '';
      });
    } catch (error) {
      this.handleSafetyInductionReadError(error, generation);
    }
  }

  private async authenticateHseUser(): Promise<FirebaseUser> {
    const ahlanEmail = this.auth.currentUser?.email?.trim().toLowerCase();
    if (!ahlanEmail) {
      throw new Error('Sign in to Ahlan before syncing your safety induction.');
    }

    const currentUser = this.hseAuth.currentUser;
    if (currentUser && this.isSameEmail(currentUser.email, ahlanEmail)) {
      return currentUser;
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
      login_hint: ahlanEmail,
    });
    const credential = await signInWithPopup(this.hseAuth, provider);
    if (!this.isSameEmail(credential.user.email, ahlanEmail)) {
      throw new Error('Please choose the same Google account you use to sign in to Ahlan.');
    }
    return credential.user;
  }

  private isSameEmail(first: string | null, second: string | null): boolean {
    return !!first && !!second &&
      first.trim().toLowerCase() === second.trim().toLowerCase();
  }

  private handleSafetyInductionReadError(
    error: unknown,
    generation: number
  ): void {
    console.error('[SafetyInduction] Failed to load induction progress from HSE:', error);
    if (this.viewGeneration !== generation) {
      return;
    }
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : '';
    const message = error instanceof Error ? error.message : '';
    this.zone.run(() => {
      this.safetyInductionStatusLoaded = false;
      this.safetyInductionStatusMessage = code === 'auth/unauthorized-domain'
        ? 'HSE sign-in is not enabled for this app domain'
        : message === 'Please choose the same Google account you use to sign in to Ahlan.'
          ? message
          : 'Could not sync status. Tap to try again';
    });
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

    this.safetyInductionStatusLoaded = false;
    this.safetyInductionStatusMessage = 'Connecting to HSE…';
    let hseUser: FirebaseUser;
    try {
      hseUser = await this.authenticateHseUser();
      await this.readSafetyInductionStatus(hseUser, this.viewGeneration);
    } catch (error) {
      this.handleSafetyInductionReadError(error, this.viewGeneration);
      return;
    }
    if (!this.safetyInductionStatusLoaded) {
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
      window.open(this.safetyInductions[data.site].link, '_blank', 'noopener,noreferrer');
    }
    if (this.profileEmail) {
      void this.loadSafetyInductionStatus(this.profileEmail, this.viewGeneration);
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

    // Never derive the day number from the shared/global schedule while the
    // viewed user's agenda is still loading, or while an admin is previewing
    // another attendee — otherwise the admin's/global "Day N" leaks through.
    const useSessionDates =
      this.isViewerAgendaLoaded && !this.adminPreview.isPreviewing
        ? sessions
        : this.agendaSessions$.value ?? [];

    const sessionDays = new Map<number, Date>();
    for (const session of useSessionDates || []) {
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

  shouldDisplaySpeaker(
    session: Session | undefined | null
  ): session is Session & { speaker: NonNullable<Session['speaker']> } {
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

  public capturedMomentsUrl = 'https://drive.google.com/drive/u/1/folders/1-n217fVmI2j8NxJq1JejKcnMIYdJFzFZ';

  openCapturedMoments() {
    if (this.capturedMomentsUrl) {
      window.open(this.capturedMomentsUrl, '_blank', 'noopener,noreferrer');
    }
  }

  public pollsUrl = '';

  openPolls() {
    if (this.pollsUrl) {
      window.open(this.pollsUrl, '_blank', 'noopener,noreferrer');
    } else {
      this.router.navigate(['/activities']);
    }
  }

  openQRCode() {
    this.showQR = true;
  }

  async closeQRCode() {
    this.showQR = false;
    const modal = document.querySelector('ion-modal.qr-modal') as HTMLIonModalElement;
    if (modal) await modal.dismiss();
  }

  navigateToJourney() {
    this.router.navigate(['/tabs/journey']);
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
