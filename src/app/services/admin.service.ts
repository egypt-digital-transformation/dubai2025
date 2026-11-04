import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection as angularCollection,
  collectionData,
  doc,
  docData,
  getDoc,
  query as angularQuery,
  where as angularWhere,
} from '@angular/fire/firestore';
import {
  DocumentData,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc as firestoreDoc,
  getDoc as firebaseGetDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from 'firebase/storage';
import { Observable, combineLatest, from, map, of, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { IconicProject, HolcimProduct, ProjectStats } from '../iconic-projects/models/project.model';
import { PreviewUser } from './admin-preview.service';
import { FirebaseInjectionContext } from './firebase-injection-context.service';
import { mapAgendaDaySessions } from '../shared/agenda-day';

export interface AdminAttendee {
  id: string;
  email: string;
  name: string;
  firstName: string;
  nationality: string;
  participantsGroup: string;
  hasPushToken: boolean;
  loggedIn: boolean;
  active: boolean;
  installed: boolean;
  plantVisit: boolean;
  group?: string;
  rebrandingEvent?: boolean;
  authenticatedEmail?: string;
  safetyInductionCompleted?: boolean;
  safetyInductionStatus?: string;
  flightDetails?: FlightDetails;
  accommodationDetails?: AccommodationDetails;
}

export interface AccommodationDetails {
  hotel: string;
  roomNumber: string;
  floor: string;
  checkIn: string;
  checkOut: string;
  updatedAt?: string;
}

export interface CarDetails {
  carModel: string;
  licensePlate: string;
}

export interface MeetAndGreetRepresentative {
  name: string;
  phoneNumber: string;
}

export interface JourneyDetails {
  flightDetails: FlightDetails | null;
  accommodationDetails: AccommodationDetails | null;
  carDetails: CarDetails | null;
  meetAndGreetRepresentative: MeetAndGreetRepresentative | null;
}

export interface FlightLeg {
  arrivalAirport: string;
  arrivalDate: string;
  arrivalTime: string;
  departureAirport: string;
  departureDate: string;
  departureTime: string;
  flightNo: string;
}

export interface FlightDetails {
  inbound: FlightLeg;
  outbound: FlightLeg;
  updatedAt?: string;
}

export type RequestStatus = 'Open' | 'In progress' | 'Resolved';

export interface AdminRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: string;
  details: string;
  status: RequestStatus;
  adminComment: string;
  createdAt?: Date | string | number | null;
  updatedAt?: Date | string | number | null;
}

export interface AdminCampaign {
  id: string;
  title: string;
  targetLabel: string;
  createdAt: string | null;
  targetCount: number;
  inAppCount: number;
  pushReadyCount: number;
  acceptedCount: number;
  failedCount: number;
  openedCount: number;
  status: string;
  scheduledAt: string | null;
}

export interface NotificationSendResult {
  campaignId: string;
  targetCount: number;
  pushReadyCount: number;
  inAppCount?: number;
  acceptedCount: number;
  failedCount: number;
  status: string;
  scheduledAt?: string;
}

export interface ReceivedNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string | null;
  opened: boolean;
  link?: string | null;
}

export interface AdminDashboard {
  refreshedAt: string;
  totalAttendees: number;
  totalLoggedIn: number;
  activeLoggedIn: number;
  installedUsers: number;
  pushReadyUsers: number;
  attendees: AdminAttendee[];
  campaigns: AdminCampaign[];
}

export type ResourceType = string;
export const DEFAULT_RESOURCE_TYPES: ResourceType[] = [
  'Presentation',
  'Video',
  'Document',
  'Photo',
];

export interface AgendaSessionOption {
  sessionName: string;
  speakerName: string;
  speakerTitle?: string;
  day?: string;
  category?: string;
}

export interface AdminResource {
  id: string;
  title: string;
  type: ResourceType;
  description: string;
  url: string;
  sessionName?: string;
  speakerName?: string;
  speakerTitle?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ProjectInput = Omit<IconicProject, 'id'> & { id?: string };

export interface InteractiveActivity {
  id: string;
  title: string;
  question: string;
  options: string[];
  kind: 'quiz' | 'poll';
  active?: boolean;
  submitted: boolean;
  submittedOptionIndex?: number | null;
  isCorrect?: boolean | null;
  optionPercentages?: number[];
  createdAt?: string | null;
}

export interface AdminInteractiveActivity extends Omit<InteractiveActivity, 'submitted'> {
  active: boolean;
  target: NotificationTarget;
  responseCount: number;
  optionCounts: number[];
  correctCount: number | null;
  responses?: AdminInteractiveActivityResponse[] | null;
}

export interface AdminInteractiveActivityResponse {
  email: string;
  optionIndex: number | null;
  option: string | null;
  isCorrect: boolean | null;
}

export type NotificationTarget =
  | { kind: 'all' }
  | { kind: 'user'; userId: string }
  | { kind: 'users'; userIds: string[] }
  | {
      kind: 'segment';
      field: 'participantsGroup' | 'plantVisit' | 'group' | 'rebrandingEvent';
      value: string;
    };

export interface PushTokenRegistrationResult {
  registered: boolean;
  refreshRequired?: boolean;
}

function hasRegisteredPushToken(data: DocumentData): boolean {
  const hasDeviceToken =
    Array.isArray(data['devices']) &&
    data['devices'].some((device: unknown) => {
      if (!device || typeof device !== 'object') {
        return false;
      }
      const record = device as Record<string, unknown>;
      return (
        typeof record['token'] === 'string' &&
        record['token'].length > 0 &&
        record['fcmProjectId'] === environment.firebaseConfig.projectId
      );
    });
  const hasLegacyToken =
    typeof data['fcmToken'] === 'string' &&
    data['fcmToken'].length > 0 &&
    data['fcmProjectId'] === environment.firebaseConfig.projectId;
  return hasDeviceToken || hasLegacyToken;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  private readonly functions = getFunctions(undefined, 'europe-west1');
  private userSnapshotCache?: {
    loadedAt: number;
    promise: Promise<QuerySnapshot<DocumentData>>;
  };
  private projectsCache?: { loadedAt: number; projects: IconicProject[] };

  private loadUsersSnapshot(): Promise<QuerySnapshot<DocumentData>> {
    if (
      this.userSnapshotCache &&
      Date.now() - this.userSnapshotCache.loadedAt < 5000
    ) {
      return this.userSnapshotCache.promise;
    }

    const promise = getDocs(collection(this.firestore, 'users'));
    this.userSnapshotCache = { loadedAt: Date.now(), promise };
    void promise.catch(() => {
      if (this.userSnapshotCache?.promise === promise) {
        this.userSnapshotCache = undefined;
      }
    });
    return promise;
  }

  async isAdmin(email = this.auth.currentUser?.email): Promise<boolean> {
    const adminEmail = email?.trim().toLowerCase();
    if (!adminEmail) {
      return false;
    }
    const snapshot = await this.firebaseContext.run(() =>
      getDoc(doc(this.firestore, 'admins', adminEmail))
    );
    return snapshot.exists() && snapshot.data()['active'] === true;
  }

  async recordAppActivity(installed: boolean): Promise<void> {
    await this.call<void>('recordAppActivity', { installed });
  }

  async registerPushToken(
    token: string,
    deviceId: string,
  ): Promise<PushTokenRegistrationResult> {
    return this.call<PushTokenRegistrationResult>('registerPushToken', {
      token,
      deviceId,
    });
  }

  async listSharedContactCards(): Promise<{
    contacts: Array<{
      name: string;
      email: string;
      mobile: string;
      position: string;
    }>;
  }> {
    return this.call('listSharedContactCards', {});
  }

  async loadDashboard(): Promise<AdminDashboard> {
    const [dashboard, profileAttendees, analytics] = await Promise.all([
      this.call<AdminDashboard>('getAdminDashboard', {}),
      this.loadMainProjectUsers(),
      this.loadAppAnalytics(),
    ]);
    const attendeesWithStatus = profileAttendees.map((attendee) => {
      const status = analytics.get(attendee.id) ??
        analytics.get(attendee.email.trim().toLowerCase());
      return {
        ...attendee,
        loggedIn: status?.loggedIn ?? false,
        active: status?.active ?? false,
        installed: status?.installed ?? false,
        hasPushToken: attendee.hasPushToken,
        authenticatedEmail: status?.email,
      };
    });
    const attendees = attendeesWithStatus;

    return {
      ...dashboard,
      totalAttendees: attendees.length,
      totalLoggedIn: attendees.filter((attendee) => attendee.loggedIn).length,
      activeLoggedIn: attendees.filter((attendee) => attendee.active).length,
      installedUsers: attendees.filter((attendee) => attendee.installed).length,
      pushReadyUsers: attendees.filter((attendee) => attendee.hasPushToken).length,
      attendees,
    };
  }

  async loadNotificationAudience(): Promise<AdminAttendee[]> {
    const snapshot = await this.loadUsersSnapshot();
    return snapshot.docs
      .map((userDocument) => {
        const data = userDocument.data();
        const asText = (value: unknown): string =>
          value == null ? '' : String(value);
        return {
          id: userDocument.id,
          email:
            asText(data['emailAddress']).trim() ||
            asText(data['email']).trim() ||
            userDocument.id,
          name:
            asText(data['displayName'] ?? data['name']).trim() ||
            [asText(data['firstName']).trim(), asText(data['lastName']).trim()]
              .filter(Boolean)
              .join(' '),
          firstName: asText(data['firstName']),
          nationality: asText(data['nationality']),
          participantsGroup: asText(data['participantsGroup']),
          hasPushToken: hasRegisteredPushToken(data),
          plantVisit: data['plantVisit'] === true,
          group: asText(data['group']).trim(),
          rebrandingEvent: data['rebrandingEvent'] === true,
          loggedIn: false,
          active: false,
          installed: false,
        };
      })
      .filter((user) => user.email.trim().length > 0)
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  async sendNotification(
    title: string,
    body: string,
    target: NotificationTarget
  ): Promise<NotificationSendResult> {
    return this.call('sendTargetedNotification', { title, body, target });
  }

  async listReceivedNotifications(): Promise<ReceivedNotification[]> {
    return this.call('listUserNotifications', {});
  }

  async scheduleNotification(
    title: string,
    body: string,
    target: NotificationTarget,
    scheduledAt: string
  ): Promise<NotificationSendResult> {
    return this.call('scheduleTargetedNotification', {
      title,
      body,
      target,
      scheduledAt,
    });
  }

  async createInteractiveActivity(activity: {
    title: string;
    question: string;
    options: string[];
    kind: 'quiz' | 'poll';
    target: NotificationTarget;
    correctOptionIndex: number | null;
  }): Promise<{
    id: string;
    notificationSummary?: {
      pushReadyCount: number;
      inAppCount?: number;
      acceptedCount: number;
      failedCount: number;
      deliveryError: boolean;
    };
  }> {
    return this.call('createInteractiveActivity', activity);
  }

  async listInteractiveActivities(): Promise<{ activities: InteractiveActivity[] }> {
    try {
      return await this.call('listInteractiveActivities', {});
    } catch (error: unknown) {
      if (await this.isAdmin()) {
        try {
          const adminResult = await this.listAdminInteractiveActivities();
          return {
            activities: (adminResult.activities || []).map((a) => ({
              id: a.id,
              title: a.title,
              question: a.question,
              options: a.options,
              kind: a.kind,
              active: a.active,
              submitted: false,
              optionPercentages: a.optionPercentages,
              createdAt: a.createdAt,
            })),
          };
        } catch (adminErr) {
          console.warn('[AdminService] Admin fallback failed:', adminErr);
        }
      }
      throw error;
    }
  }

  async listAdminInteractiveActivities(): Promise<{ activities: AdminInteractiveActivity[] }> {
    const result = await this.call<{
      activities: Array<
        Omit<AdminInteractiveActivity, 'responses'> & {
          responses?: AdminInteractiveActivityResponse[] | null;
        }
      >;
    }>('listAdminInteractiveActivities', {});
    return {
      activities: (result.activities || []).map((activity) => ({
        ...activity,
        responses: activity.responses || [],
      })),
    };
  }

  async setInteractiveActivityActive(
    activityId: string,
    active: boolean
  ): Promise<{ active: boolean }> {
    return this.call('setInteractiveActivityActive', { activityId, active });
  }

  async loadProjects(forceRefresh = false): Promise<IconicProject[]> {
    if (
      !forceRefresh &&
      this.projectsCache &&
      Date.now() - this.projectsCache.loadedAt < 60_000
    ) {
      return this.projectsCache.projects;
    }
    const snapshot = await getDocs(collection(this.firestore, 'projects'));
    const projects = snapshot.docs
      .map((projectDocument) => this.toProject(projectDocument.id, projectDocument.data()))
      .sort((a, b) => (a.order > 0 ? a.order : Number.MAX_SAFE_INTEGER) - (b.order > 0 ? b.order : Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name));
    this.projectsCache = { loadedAt: Date.now(), projects };
    return projects;
  }

  watchProjects(): Observable<IconicProject[]> {
    return this.firebaseContext.run(() =>
      collectionData(angularCollection(this.firestore, 'projects'), {
        idField: 'id',
      }).pipe(
        map((documents) =>
          documents
            .map((project) =>
              this.toProject(
                String(project['id'] ?? ''),
                project as Record<string, unknown>
              )
            )
            .sort((a, b) => (a.order > 0 ? a.order : Number.MAX_SAFE_INTEGER) - (b.order > 0 ? b.order : Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name))
        )
      )
    );
  }

  async loadFlightDetailsForAttendees(
    attendees: AdminAttendee[]
  ): Promise<AdminAttendee[]> {
    const snapshot = await getDocs(collectionGroup(this.firestore, 'flightDetails'));
    const detailsByUserId = new Map<string, FlightDetails>();
    for (const flightDocument of snapshot.docs) {
      if (flightDocument.id !== 'flightInfo') {
        continue;
      }
      const userId = flightDocument.ref.parent.parent?.id;
      if (userId) {
        detailsByUserId.set(
          userId,
          this.toFlightDetails(flightDocument.data() as Record<string, unknown>)
        );
      }
    }
    return attendees.map((attendee) => {
      const flightDetails = detailsByUserId.get(attendee.id);
      return flightDetails ? { ...attendee, flightDetails } : attendee;
    });
  }

  async loadAccommodationDetailsForAttendees(
    attendees: AdminAttendee[]
  ): Promise<AdminAttendee[]> {
    const snapshot = await getDocs(collectionGroup(this.firestore, 'accommodation'));
    const detailsByUserId = new Map<string, AccommodationDetails>();
    for (const accommodationDocument of snapshot.docs) {
      if (accommodationDocument.id !== 'details') {
        continue;
      }
      const userId = accommodationDocument.ref.parent.parent?.id;
      const details = this.toAccommodationDetails(
        accommodationDocument.data() as Record<string, unknown>
      );
      if (userId && details) {
        detailsByUserId.set(userId, details);
      }
    }
    return attendees.map((attendee) => {
      const accommodationDetails = detailsByUserId.get(attendee.id);
      return accommodationDetails ? { ...attendee, accommodationDetails } : attendee;
    });
  }

  async loadSafetyInductionStatus(
    attendees: AdminAttendee[]
  ): Promise<AdminAttendee[]> {
    return this.attachSafetyInductionStatus(attendees);
  }

  async loadPreviewUsers(): Promise<PreviewUser[]> {
    const snapshot = await getDocs(collection(this.firestore, 'users'));
    return snapshot.docs
      .map((userDocument) => {
        const data = userDocument.data();
        const email = String(data['emailAddress'] ?? data['email'] ?? '').trim().toLowerCase();
        const firstName = String(data['firstName'] ?? '').trim();
        const lastName = String(data['lastName'] ?? '').trim();
        const name = String(data['displayName'] ?? data['name'] ?? '').trim() ||
          [firstName, lastName].filter(Boolean).join(' ');
        return {
          id: userDocument.id,
          email,
          name,
          firstName,
          lastName,
          currentPosition: String(data['currentPosition'] ?? '').trim(),
          locationCountry: String(data['locationCountry'] ?? '').trim(),
        };
      })
      .filter((user) => user.email)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }

  async createUserRequest(request: {
    userId: string;
    userEmail: string;
    userName: string;
    type: string;
    details: string;
  }): Promise<void> {
    await addDoc(collection(this.firestore, 'requests'), {
      ...request,
      status: 'Open',
      adminComment: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  watchUserRequests(email: string): Observable<AdminRequest[]> {
    return this.firebaseContext.run(() => {
      const requestsQuery = angularQuery(
        angularCollection(this.firestore, 'requests'),
        angularWhere('userEmail', '==', email.trim().toLowerCase())
      );
      return collectionData(requestsQuery, { idField: 'id' }).pipe(
        map((requests) =>
          requests.map((request) =>
            this.toAdminRequest(String(request['id'] ?? ''), request as Record<string, unknown>)
          )
        )
      );
    });
  }

  async loadAdminRequests(): Promise<AdminRequest[]> {
    const snapshot = await getDocs(collection(this.firestore, 'requests'));
    return snapshot.docs
      .map((requestDocument) => this.toAdminRequest(requestDocument.id, requestDocument.data()))
      .sort((a, b) => this.requestTime(b.createdAt) - this.requestTime(a.createdAt));
  }

  async updateAdminRequest(
    requestId: string,
    status: RequestStatus,
    adminComment: string
  ): Promise<void> {
    await updateDoc(firestoreDoc(this.firestore, 'requests', requestId), {
      status,
      adminComment: adminComment.trim(),
      updatedAt: serverTimestamp(),
    });
  }

  async loadFlightDetails(email: string): Promise<FlightDetails | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return null;

    let userDocument: QueryDocumentSnapshot<DocumentData> | undefined;
    if (await this.isAdmin()) {
      const usersSnapshot = await getDocs(collection(this.firestore, 'users'));
      userDocument = usersSnapshot.docs.find((candidate) => {
        const data = candidate.data() as { emailAddress?: unknown; email?: unknown };
        return String(data.emailAddress ?? data.email ?? candidate.id)
          .trim()
          .toLowerCase() === normalizedEmail;
      });
    } else {
      const users = collection(this.firestore, 'users');
      let userSnapshot = await getDocs(query(users, where('emailAddress', '==', normalizedEmail)));
      if (userSnapshot.empty) {
        userSnapshot = await getDocs(query(users, where('email', '==', normalizedEmail)));
      }
      if (userSnapshot.empty && email.trim() !== normalizedEmail) {
        userSnapshot = await getDocs(query(users, where('emailAddress', '==', email.trim())));
      }
      if (userSnapshot.empty && email.trim() !== normalizedEmail) {
        userSnapshot = await getDocs(query(users, where('email', '==', email.trim())));
      }
      userDocument = userSnapshot.docs[0];
    }

    if (!userDocument) return null;
    return this.loadFlightDetailsForUserId(userDocument.id);
  }

  async loadAccommodationDetails(email: string): Promise<AccommodationDetails | null> {
    const userId = await this.findUserDocumentId(email);
    if (!userId) return null;
    return this.loadAccommodationDetailsForUserId(userId);
  }

  async loadCarDetails(email: string): Promise<CarDetails | null> {
    const userId = await this.findUserDocumentId(email);
    if (!userId) return null;
    const carDocument = await firebaseGetDoc(
      firestoreDoc(this.firestore, 'users', userId, 'cardata', 'details')
    );
    if (!carDocument.exists()) return null;

    const data = carDocument.data();
    const carDetails = {
      carModel: String(data['carModel'] ?? '').trim(),
      licensePlate: String(data['licensePlate'] ?? '').trim(),
    };
    return carDetails;
  }

  async loadMeetAndGreetRepresentative(
    email: string
  ): Promise<MeetAndGreetRepresentative | null> {
    const userId = await this.findUserDocumentId(email);
    if (!userId) return null;
    const representativeDocument = await firebaseGetDoc(
      firestoreDoc(
        this.firestore,
        'users',
        userId,
        'meet&greetrepresentative',
        'details'
      )
    );
    if (!representativeDocument.exists()) return null;

    const data = representativeDocument.data();
    const representative = {
      name: String(data['name'] ?? '').trim(),
      phoneNumber: String(data['phoneNumber'] ?? '').trim(),
    };
    return representative;
  }

  watchJourneyDetails(email: string): Observable<JourneyDetails> {
    const emptyDetails: JourneyDetails = {
      flightDetails: null,
      accommodationDetails: null,
      carDetails: null,
      meetAndGreetRepresentative: null,
    };
    return from(this.findUserDocumentId(email)).pipe(
      switchMap((userId) => {
        if (!userId) return of(emptyDetails);
        const userPath = ['users', userId];
        return this.firebaseContext.run(() =>
          combineLatest({
            flightDetails: docData(
              doc(this.firestore, ...userPath, 'flightDetails', 'flightInfo')
            ).pipe(
              map((data) =>
                data
                  ? this.toFlightDetails(data as Record<string, unknown>)
                  : null
              )
            ),
            accommodationDetails: docData(
              doc(this.firestore, ...userPath, 'accommodation', 'details')
            ).pipe(
              map((data) =>
                data
                  ? this.toAccommodationDetails(data as Record<string, unknown>)
                  : null
              )
            ),
            carDetails: docData(
              doc(this.firestore, ...userPath, 'cardata', 'details')
            ).pipe(
              map((data) =>
                data
                  ? {
                      carModel: String(data['carModel'] ?? '').trim(),
                      licensePlate: String(data['licensePlate'] ?? '').trim(),
                    }
                  : null
              )
            ),
            meetAndGreetRepresentative: docData(
              doc(
                this.firestore,
                ...userPath,
                'meet&greetrepresentative',
                'details'
              )
            ).pipe(
              map((data) =>
                data
                  ? {
                      name: String(data['name'] ?? '').trim(),
                      phoneNumber: String(data['phoneNumber'] ?? '').trim(),
                    }
                  : null
              )
            ),
          })
        );
      })
    );
  }

  private async findUserDocumentId(email: string): Promise<string | null> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return null;

    let userDocument: QueryDocumentSnapshot<DocumentData> | undefined;
    if (await this.isAdmin()) {
      const usersSnapshot = await this.loadUsersSnapshot();
      userDocument = usersSnapshot.docs.find((candidate) => {
        const data = candidate.data() as { emailAddress?: unknown; email?: unknown };
        return String(data.emailAddress ?? data.email ?? candidate.id)
          .trim()
          .toLowerCase() === normalizedEmail;
      });
    } else {
      const users = collection(this.firestore, 'users');
      let userSnapshot = await getDocs(query(users, where('emailAddress', '==', normalizedEmail)));
      if (userSnapshot.empty) {
        userSnapshot = await getDocs(query(users, where('email', '==', normalizedEmail)));
      }
      if (userSnapshot.empty && email.trim() !== normalizedEmail) {
        userSnapshot = await getDocs(query(users, where('emailAddress', '==', email.trim())));
      }
      if (userSnapshot.empty && email.trim() !== normalizedEmail) {
        userSnapshot = await getDocs(query(users, where('email', '==', email.trim())));
      }
      userDocument = userSnapshot.docs[0];
    }

    return userDocument?.id ?? null;
  }

  async saveProject(project: ProjectInput): Promise<IconicProject> {
    const id = project.id?.trim() || this.createProjectId(project.name);
    const savedProject: IconicProject = { ...project, id };
    await setDoc(firestoreDoc(this.firestore, 'projects', id), savedProject);
    this.projectsCache = undefined;
    return savedProject;
  }

  async deleteProject(projectId: string): Promise<void> {
    await deleteDoc(firestoreDoc(this.firestore, 'projects', projectId));
    this.projectsCache = undefined;
  }

  async loadResources(): Promise<AdminResource[]> {
    const snapshot = await getDocs(collection(this.firestore, 'resources'));
    return this.sortResourcesNewestFirst(
      snapshot.docs.map((resourceDocument) => ({
        id: resourceDocument.id,
        ...(resourceDocument.data() as Omit<AdminResource, 'id'>),
      }))
    );
  }

  watchResources(): Observable<AdminResource[]> {
    return this.firebaseContext.run(() =>
      collectionData(angularCollection(this.firestore, 'resources'), {
        idField: 'id',
      }).pipe(
        map((documents) =>
          this.sortResourcesNewestFirst(
            documents.map((resource) => ({
              id: String(resource['id'] ?? ''),
              ...(resource as Omit<AdminResource, 'id'>),
            }))
          )
        )
      )
    );
  }

  async loadResourceTypes(): Promise<ResourceType[]> {
    const [typeSnapshot, resourceSnapshot] = await Promise.all([
      getDocs(collection(this.firestore, 'resourceTypes')),
      getDocs(collection(this.firestore, 'resources')),
    ]);
    const types = typeSnapshot.docs.map((typeDocument) => {
      const data = typeDocument.data() as { name?: string };
      return data.name?.trim() || typeDocument.id;
    });
    const usedTypes = resourceSnapshot.docs.map((resourceDocument) =>
      (resourceDocument.data() as Partial<AdminResource>).type
    );
    return this.uniqueResourceTypes([...DEFAULT_RESOURCE_TYPES, ...types, ...usedTypes]);
  }

  watchResourceTypes(): Observable<ResourceType[]> {
    return this.firebaseContext.run(() =>
      combineLatest([
        collectionData(angularCollection(this.firestore, 'resourceTypes'), {
          idField: 'id',
        }),
        collectionData(angularCollection(this.firestore, 'resources'), {
          idField: 'id',
        }),
      ]).pipe(
        map(([typeDocuments, resourceDocuments]) => {
          const types = typeDocuments.map((typeDocument) => {
            const name = String(typeDocument['name'] ?? '').trim();
            return name || String(typeDocument['id'] ?? '');
          });
          const usedTypes = resourceDocuments.map((resource) =>
            typeof resource['type'] === 'string' ? resource['type'] : undefined
          );
          return this.uniqueResourceTypes([
            ...DEFAULT_RESOURCE_TYPES,
            ...types,
            ...usedTypes,
          ]);
        })
      )
    );
  }

  async saveResourceType(name: string): Promise<ResourceType> {
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      throw new Error('Resource type name is required.');
    }
    const id = this.createProjectId(normalizedName);
    await setDoc(firestoreDoc(this.firestore, 'resourceTypes', id), {
      name: normalizedName,
    });
    return normalizedName;
  }

  async saveResource(resource: Omit<AdminResource, 'id'> & { id?: string }): Promise<AdminResource> {
    const id = resource.id?.trim() || this.createProjectId(resource.title);
    const nowIso = new Date().toISOString();
    const savedResource: AdminResource = {
      ...resource,
      id,
      createdAt: resource.createdAt || nowIso,
      updatedAt: nowIso,
    };
    await setDoc(firestoreDoc(this.firestore, 'resources', id), savedResource);
    return savedResource;
  }

  sortResourcesNewestFirst(resources: AdminResource[]): AdminResource[] {
    return [...resources].sort((a, b) => {
      const timeDiff = this.getResourceTimestamp(b) - this.getResourceTimestamp(a);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return a.title.localeCompare(b.title);
    });
  }

  private getResourceTimestamp(resource: AdminResource): number {
    const rawTime = resource.updatedAt ?? resource.createdAt;
    const parsed = this.requestTime(rawTime);
    if (parsed > 0) {
      return parsed;
    }
    const urlMatch = typeof resource.url === 'string' ? resource.url.match(/-(\d{13})-/) : null;
    if (urlMatch) {
      const urlTimestamp = Number(urlMatch[1]);
      if (Number.isFinite(urlTimestamp) && urlTimestamp > 0) {
        return urlTimestamp;
      }
    }
    return 0;
  }

  async loadAgendaSessionOptions(): Promise<AgendaSessionOption[]> {
    const optionsByKey = new Map<string, AgendaSessionOption>();
    const addOption = (
      sessionNameRaw: unknown,
      speakerNameRaw: unknown,
      speakerTitleRaw?: unknown,
      dayRaw?: unknown,
      categoryRaw?: unknown
    ) => {
      const sessionName = typeof sessionNameRaw === 'string' ? sessionNameRaw.trim() : '';
      if (!sessionName) {
        return;
      }
      const rawSpeaker = typeof speakerNameRaw === 'string' ? speakerNameRaw.trim() : '';
      const speakerName = rawSpeaker.toLowerCase() === 'all' ? '' : rawSpeaker;
      const speakerTitle = typeof speakerTitleRaw === 'string' ? speakerTitleRaw.trim() : '';
      const day = typeof dayRaw === 'string' || typeof dayRaw === 'number' ? String(dayRaw).trim() : '';
      const category = typeof categoryRaw === 'string' ? categoryRaw.trim() : '';
      const key = sessionName.toLowerCase();
      const existing = optionsByKey.get(key);
      if (!existing || (!existing.speakerName && speakerName)) {
        optionsByKey.set(key, {
          sessionName,
          speakerName: speakerName || existing?.speakerName || '',
          speakerTitle: speakerTitle || existing?.speakerTitle || undefined,
          day: day || existing?.day || undefined,
          category: category || existing?.category || undefined,
        });
      }
    };

    try {
      const usersSnapshot = await this.loadUsersSnapshot();
      const sampleUsers: QueryDocumentSnapshot<DocumentData>[] = [];
      const seenProfiles = new Set<string>();
      for (const userDoc of usersSnapshot.docs) {
        const data = userDoc.data();
        const profileKey = `${Boolean(data['plantVisit'])}:${String(data['group'] ?? '')}:${Boolean(data['rebrandingEvent'])}`;
        if (!seenProfiles.has(profileKey) && sampleUsers.length < 8) {
          seenProfiles.add(profileKey);
          sampleUsers.push(userDoc);
        }
      }
      if (!sampleUsers.length && usersSnapshot.docs.length) {
        sampleUsers.push(usersSnapshot.docs[0]);
      }

      const agendaSnapshots = await Promise.all(
        sampleUsers.map((userDoc) =>
          getDocs(collection(this.firestore, 'users', userDoc.id, 'agenda')).catch(() => null)
        )
      );
      for (const agendaSnapshot of agendaSnapshots) {
        if (!agendaSnapshot) continue;
        for (const dayDoc of agendaSnapshot.docs) {
          const mappedSessions = mapAgendaDaySessions(dayDoc.data());
          for (const session of mappedSessions) {
            addOption(
              session.title,
              session.speaker?.name,
              session.speaker?.title,
              session.day,
              session.category
            );
          }
        }
      }
    } catch (error) {
      console.warn('[AdminService] Could not load user agenda sessions for options:', error);
    }

    try {
      const sharedSessionsSnapshot = await getDocs(collection(this.firestore, 'sessions'));
      for (const sessionDoc of sharedSessionsSnapshot.docs) {
        const data = sessionDoc.data();
        const speakerRecord =
          data['speaker'] && typeof data['speaker'] === 'object'
            ? (data['speaker'] as Record<string, unknown>)
            : null;
        const speakerName = speakerRecord
          ? speakerRecord['name']
          : data['speaker'];
        const speakerTitle = speakerRecord ? speakerRecord['title'] : '';
        addOption(
          data['content'] ?? data['title'] ?? data['label'],
          speakerName,
          speakerTitle,
          data['day'],
          data['label'] ?? data['category']
        );
      }
    } catch (error) {
      console.warn('[AdminService] Could not load shared sessions for options:', error);
    }

    return [...optionsByKey.values()].sort((a, b) => {
      const dayDiff = Number(a.day || 99) - Number(b.day || 99);
      if (dayDiff !== 0) return dayDiff;
      return a.sessionName.localeCompare(b.sessionName);
    });
  }

  async loadEventEndAt(): Promise<Date | null> {
    const snapshot = await getDoc(firestoreDoc(this.firestore, 'appConfiguration', 'event'));
    const eventEndAt = snapshot.data()?.['eventEndAt'];
    if (!eventEndAt) return null;
    if (eventEndAt instanceof Timestamp) return eventEndAt.toDate();
    throw new Error('The saved event end time is invalid.');
  }

  async saveEventEndAt(eventEndAt: Date | null): Promise<void> {
    await setDoc(firestoreDoc(this.firestore, 'appConfiguration', 'event'), {
      eventEndAt: eventEndAt ? Timestamp.fromDate(eventEndAt) : null,
      timeZone: 'Africa/Cairo',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async deleteResource(resourceId: string): Promise<void> {
    await deleteDoc(firestoreDoc(this.firestore, 'resources', resourceId));
  }

  async uploadResource(
    file: File,
    resourceTitle: string,
    options?: {
      onProgress?: (progress: { percent: number; bytesTransferred: number; totalBytes: number }) => void;
      signal?: AbortSignal;
    }
  ): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const resourceId = this.createProjectId(resourceTitle);
    const objectPath = `resources/${resourceId}-${Date.now()}-${safeName}`;
    const bucket = environment.hsefirebaseConfig.storageBucket;
    return this.uploadFileToBucket(bucket, objectPath, file, options);
  }

  private uploadFileToBucket(
    bucket: string,
    objectPath: string,
    file: File,
    options?: {
      onProgress?: (progress: { percent: number; bytesTransferred: number; totalBytes: number }) => void;
      signal?: AbortSignal;
    }
  ): Promise<string> {
    const storage = getStorage(getApp(), `gs://${bucket}`);
    storage.maxUploadRetryTime = 30_000;
    storage.maxOperationRetryTime = 20_000;
    const resourceRef = ref(storage, objectPath);
    const uploadTask = uploadBytesResumable(resourceRef, file, {
      contentType: file.type || 'application/octet-stream',
    });

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let lastBytes = -1;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (stallTimer) {
          clearTimeout(stallTimer);
          stallTimer = undefined;
        }
        options?.signal?.removeEventListener('abort', onAbort);
      };

      const resetStallTimer = (timeoutMs: number) => {
        if (stallTimer) {
          clearTimeout(stallTimer);
        }
        stallTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          uploadTask.cancel();
          cleanup();
          reject(
            new Error(
              lastBytes <= 0
                ? `Upload could not start on bucket ${bucket} (connection or CORS blocked).`
                : 'Upload connection stalled with no progress for 45 seconds.'
            )
          );
        }, timeoutMs);
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        uploadTask.cancel();
        cleanup();
        reject(new Error('Upload cancelled.'));
      };

      if (options?.signal?.aborted) {
        onAbort();
        return;
      }
      options?.signal?.addEventListener('abort', onAbort, { once: true });

      // Fail fast (20s) if 0 bytes can be sent to this bucket; allow 45s between active chunks
      resetStallTimer(20_000);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const totalBytes = snapshot.totalBytes || file.size || 1;
          const bytesTransferred = snapshot.bytesTransferred;
          const percent = Math.min(100, Math.round((bytesTransferred / totalBytes) * 100));
          options?.onProgress?.({ percent, bytesTransferred, totalBytes });
          if (bytesTransferred > lastBytes) {
            lastBytes = bytesTransferred;
            resetStallTimer(45_000);
          }
        },
        (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        },
        async () => {
          if (settled) return;
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            settled = true;
            cleanup();
            resolve(downloadUrl);
          } catch (error) {
            settled = true;
            cleanup();
            reject(error);
          }
        }
      );
    });
  }

  async uploadProjectAsset(
    file: File,
    assetType: 'image' | 'model',
    projectName = 'project'
  ): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const projectId = this.createProjectId(projectName);
    const objectPath = `projects/${projectId}/${assetType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
    return this.uploadFileToBucket(
      environment.hsefirebaseConfig.storageBucket,
      objectPath,
      file
    );
  }

  async ensureProjectAssetStored(
    assetUrl: string,
    assetType: 'image' | 'model',
    projectName: string
  ): Promise<string> {
    if (assetUrl.includes('firebasestorage.googleapis.com')) {
      return assetUrl;
    }

    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(`Could not download the existing ${assetType} asset.`);
    }
    const blob = await response.blob();
    const extension = assetType === 'image'
      ? (blob.type.split('/')[1] || 'jpg')
      : (assetUrl.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb');
    const file = new File([blob], `${this.createProjectId(projectName)}.${extension}`, {
      type: blob.type || (assetType === 'model' ? 'model/gltf-binary' : 'image/jpeg'),
    });
    return this.uploadProjectAsset(file, assetType, projectName);
  }

  private async attachSafetyInductionStatus(
    attendees: AdminAttendee[]
  ): Promise<AdminAttendee[]> {
    try {
      const response = await this.call<{
        statuses: Record<string, { completed: boolean; status: string }>;
      }>('getAdminSafetyInductionStatuses', {});

      const statusByEmail = new Map<string, { completed: boolean; status: string }>(
        Object.entries(response?.statuses ?? {})
      );

      return attendees.map((attendee) => {
        if (!attendee.plantVisit) {
          return {
            ...attendee,
            safetyInductionCompleted: undefined,
            safetyInductionStatus: 'N/A',
          };
        }
        const matchingEmails = [
          attendee.email,
          attendee.id,
          attendee.authenticatedEmail ?? '',
        ]
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean);
        const status = matchingEmails
          .map((email) => statusByEmail.get(email))
          .find((value) => value !== undefined);
        return status
          ? {
              ...attendee,
              safetyInductionCompleted: status.completed,
              safetyInductionStatus: status.status,
            }
          : {
              ...attendee,
              safetyInductionCompleted: false,
              safetyInductionStatus: 'No matching HSE record',
            };
      });
    } catch (error) {
      console.error('[AdminService] Failed to load HSE induction status:', error);
      return attendees.map((attendee) =>
        attendee.plantVisit
          ? { ...attendee, safetyInductionStatus: 'Unavailable' }
          : { ...attendee, safetyInductionStatus: 'N/A' }
      );
    }
  }

  private toProject(id: string, data: Record<string, unknown>): IconicProject {
    const assetType = (data['assetType'] as 'image' | 'model' | undefined) ?? 'image';
    const heroImage = typeof data['heroImage'] === 'string' ? data['heroImage'].trim() : '';
    const assetUrl = typeof data['assetUrl'] === 'string' ? data['assetUrl'].trim() : '';
    const primaryImage = assetType === 'image' ? (heroImage || assetUrl) : heroImage;
    const rawImages = Array.isArray(data['images'])
      ? data['images']
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      : [];
    const images = Array.from(
      new Set([primaryImage, ...rawImages].filter(Boolean))
    );

    return {
      ...(data as Omit<IconicProject, 'id'>),
      id,
      heroImage: primaryImage || images[0] || heroImage,
      images,
      order: Number.isFinite(Number(data['order'])) ? Number(data['order']) : 0,
      tags: Array.isArray(data['tags']) ? data['tags'].map(String) : [],
      products: Array.isArray(data['products']) ? data['products'] as HolcimProduct[] : [],
      stats: typeof data['stats'] === 'object' && data['stats'] !== null
        ? data['stats'] as ProjectStats
        : {},
      coordinates:
        typeof data['coordinates'] === 'object' && data['coordinates'] !== null
          ? data['coordinates'] as { lat: number; lng: number }
          : { lat: 0, lng: 0 },
    };
  }

  private toAdminRequest(id: string, data: Record<string, unknown>): AdminRequest {
    const status = data['status'];
    return {
      id,
      userId: String(data['userId'] ?? ''),
      userEmail: String(data['userEmail'] ?? ''),
      userName: String(data['userName'] ?? ''),
      type: String(data['type'] ?? ''),
      details: String(data['details'] ?? ''),
      status: status === 'In progress' || status === 'Resolved' ? status : 'Open',
      adminComment: String(data['adminComment'] ?? ''),
      createdAt: this.toRequestDate(data['createdAt']),
      updatedAt: this.toRequestDate(data['updatedAt']),
    };
  }

  private toRequestDate(value: unknown): Date | string | number | null {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    return typeof value === 'string' || typeof value === 'number' ? value : null;
  }

  private requestTime(value: unknown): number {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
      return value.toMillis();
    }
    if (typeof value === 'string') {
      return Date.parse(value) || 0;
    }
    return 0;
  }

  private toFlightDetails(data: Record<string, unknown>): FlightDetails {
    const toLeg = (value: unknown): FlightLeg => {
      const leg = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return {
        arrivalAirport: String(leg['arrivalAirport'] ?? ''),
        arrivalDate: String(leg['arrivalDate'] ?? ''),
        arrivalTime: String(leg['arrivalTime'] ?? ''),
        departureAirport: String(leg['departureAirport'] ?? ''),
        departureDate: String(leg['departureDate'] ?? ''),
        departureTime: String(leg['departureTime'] ?? ''),
        flightNo: String(leg['flightNo'] ?? ''),
      };
    };
    return {
      inbound: toLeg(data['inbound']),
      outbound: toLeg(data['outbound']),
      updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : undefined,
    };
  }

  private createProjectId(name: string): string {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) {
      throw new Error('A project name is required.');
    }
    return id;
  }

  private uniqueResourceTypes(types: Array<string | undefined>): ResourceType[] {
    const unique = new Map<string, string>();
    for (const type of types) {
      const normalizedType = type?.trim().replace(/\s+/g, ' ');
      if (normalizedType) {
        unique.set(normalizedType.toLowerCase(), normalizedType);
      }
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }

  private async loadFlightDetailsForUserId(userId: string): Promise<FlightDetails | null> {
    const flightDocument = await firebaseGetDoc(
      firestoreDoc(this.firestore, 'users', userId, 'flightDetails', 'flightInfo')
    );
    return flightDocument.exists() ? this.toFlightDetails(flightDocument.data()) : null;
  }

  private toAccommodationDetails(data: Record<string, unknown>): AccommodationDetails | null {
    const asText = (value: unknown): string => {
      if (value == null) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number') return String(value);
      if (
        typeof value === 'object' &&
        'toDate' in value &&
        typeof (value as { toDate?: unknown }).toDate === 'function'
      ) {
        const date = (value as { toDate: () => Date }).toDate();
        return Number.isNaN(date.getTime()) ? '' : date.toISOString();
      }
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? '' : value.toISOString();
      }
      return String(value).trim();
    };

    const hotel = asText(data['hotel']);
    const roomNumber = asText(data['roomNumber']);
    const floor = asText(data['floor']);
    const checkIn = asText(data['checkIn']);
    const checkOut = asText(data['checkOut']);
    const updatedAt = asText(data['updatedAt']) || undefined;

    return {
      hotel,
      roomNumber,
      floor,
      checkIn,
      checkOut,
      updatedAt,
    };
  }

  private async loadAccommodationDetailsForUserId(
    userId: string
  ): Promise<AccommodationDetails | null> {
    const accommodationDocument = await firebaseGetDoc(
      firestoreDoc(this.firestore, 'users', userId, 'accommodation', 'details')
    );
    return accommodationDocument.exists()
      ? this.toAccommodationDetails(accommodationDocument.data())
      : null;
  }

  private async loadMainProjectUsers(): Promise<AdminAttendee[]> {
    const snapshot = await this.loadUsersSnapshot();
    const attendees = snapshot.docs.map((userDocument) => {
      const data = userDocument.data();
      const asText = (value: unknown): string =>
        value == null ? '' : String(value);
      const email = [data['emailAddress'], data['email']]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        ?.trim() || userDocument.id.trim();
      const name = asText(data['displayName'] ?? data['name']).trim() ||
        [asText(data['firstName']).trim(), asText(data['lastName']).trim()]
          .filter(Boolean)
          .join(' ');
      const attendee: AdminAttendee = {
        id: userDocument.id,
        email,
        name,
        firstName: asText(data['firstName']),
        nationality: asText(data['nationality']),
        participantsGroup: asText(data['participantsGroup']),
        hasPushToken: hasRegisteredPushToken(data),
        loggedIn: false,
        active: false,
        installed: false,
        plantVisit: data['plantVisit'] === true,
        group: asText(data['group']).trim(),
        rebrandingEvent: data['rebrandingEvent'] === true,
      };
      return attendee;
    });
    return attendees
      .filter((attendee) => attendee.email.trim().length > 0)
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  private async loadAppAnalytics(): Promise<
    Map<string, { loggedIn: boolean; active: boolean; installed: boolean; email: string }>
  > {
    const snapshot = await getDocs(collection(this.firestore, 'appAnalytics'));
    const activeCutoff = Date.now() - 15 * 60 * 1000;
    const analytics = new Map<
      string,
      { loggedIn: boolean; active: boolean; installed: boolean; email: string }
    >();

    for (const activityDocument of snapshot.docs) {
      const data = activityDocument.data() as {
        email?: unknown;
        profileId?: unknown;
        firstLoginAt?: { toMillis?: () => number };
        lastActiveAt?: { toMillis?: () => number };
        installedAt?: { toMillis?: () => number };
      };
      const email =
        typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      const lastActiveAt = data.lastActiveAt?.toMillis?.() ?? 0;
      const status = {
        loggedIn: !!data.firstLoginAt,
        active: lastActiveAt >= activeCutoff,
        installed: !!data.installedAt,
        email: typeof data.email === 'string' ? data.email.trim() : '',
      };
      const profileId =
        typeof data.profileId === 'string' ? data.profileId.trim() : '';
      if (profileId) {
        analytics.set(profileId, status);
      }
      if (email) {
        analytics.set(email, status);
      }
    }

    return analytics;
  }

  async submitInteractiveActivityResponse(
    activityId: string,
    optionIndex: number
  ): Promise<{ submitted: boolean; isCorrect: boolean | null }> {
    return this.call('submitInteractiveActivityResponse', { activityId, optionIndex });
  }

  async createAnnouncement(
    title: string,
    description: string,
    priority: string
  ): Promise<void> {
    await this.call('createAdminAnnouncement', { title, description, priority });
  }

  async recordNotificationOpen(campaignId: string): Promise<void> {
    await this.call('recordNotificationOpen', { campaignId });
  }

  private async call<T>(name: string, data: object): Promise<T> {
    const callable = httpsCallable<object, T>(this.functions, name);
    const result = await callable(data);
    return result.data;
  }
}
