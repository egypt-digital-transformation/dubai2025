import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  collection as angularCollection,
  collectionData,
  doc,
  getDoc,
  query as angularQuery,
  where as angularWhere,
} from '@angular/fire/firestore';
import {
  DocumentData,
  QueryDocumentSnapshot,
  addDoc,
  collection,
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
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { IconicProject, HolcimProduct, ProjectStats } from '../iconic-projects/models/project.model';
import { PreviewUser } from './admin-preview.service';

export interface AdminAttendee {
  id: string;
  email: string;
  name: string;
  firstName: string;
  nationality: string;
  day2Group: string;
  day3Type: string;
  day3GroupAM: string;
  day3GroupPM: string;
  participantsGroup: string;
  hasPushToken: boolean;
  loggedIn: boolean;
  active: boolean;
  installed: boolean;
  plantVisit: boolean;
  safetyInductionCompleted?: boolean;
  safetyInductionStatus?: string;
  flightDetails?: FlightDetails;
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
  acceptedCount: number;
  failedCount: number;
  status: string;
  scheduledAt?: string;
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

export interface AdminResource {
  id: string;
  title: string;
  type: ResourceType;
  description: string;
  url: string;
  createdAt?: string;
}

export type ProjectInput = Omit<IconicProject, 'id'> & { id?: string };

export interface InteractiveActivity {
  id: string;
  title: string;
  question: string;
  options: string[];
  kind: 'quiz' | 'poll';
  submitted: boolean;
}

export interface AdminInteractiveActivity extends Omit<InteractiveActivity, 'submitted'> {
  active: boolean;
  target: NotificationTarget;
  responseCount: number;
  optionCounts: number[];
  correctCount: number | null;
}

export type NotificationTarget =
  | { kind: 'all' }
  | { kind: 'user'; userId: string }
  | { kind: 'users'; userIds: string[] }
  | {
      kind: 'segment';
      field: 'day2.group' | 'day3.type' | 'day3.groupAM' | 'day3.groupPM' | 'participantsGroup' | 'plantVisit';
      value: string;
    };

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly functions = getFunctions(undefined, 'europe-west1');

  async isAdmin(email = this.auth.currentUser?.email): Promise<boolean> {
    const adminEmail = email?.trim().toLowerCase();
    if (!adminEmail) {
      return false;
    }
    const snapshot = await getDoc(doc(this.firestore, 'admins', adminEmail));
    return snapshot.exists() && snapshot.data()['active'] === true;
  }

  async recordAppActivity(installed: boolean): Promise<void> {
    await this.call<void>('recordAppActivity', { installed });
  }

  async registerPushToken(token: string): Promise<void> {
    await this.call<void>('registerPushToken', { token });
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
    const dashboard = await this.call<AdminDashboard>('getAdminDashboard', {});
    const users = await this.loadMainProjectUsers();
    const analytics = await this.loadAppAnalytics();
    const attendees = await this.attachSafetyInductionStatus(
      users.map((user) => {
        const activity = analytics.get(user.email.toLowerCase());
        return {
          ...user,
          loggedIn: activity?.loggedIn ?? false,
          active: activity?.active ?? false,
          installed: activity?.installed ?? false,
          hasPushToken: user.hasPushToken,
        };
      })
    );

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
    const snapshot = await getDocs(collection(this.firestore, 'users'));
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
          name: asText(data['displayName'] ?? data['name']),
          firstName: asText(data['firstName']),
          nationality: asText(data['nationality']),
          day2Group: asText((data['day2'] as { group?: unknown } | undefined)?.group),
          day3Type: asText((data['day3'] as { type?: unknown } | undefined)?.type),
          day3GroupAM: asText((data['day3'] as { groupAM?: unknown } | undefined)?.groupAM),
          day3GroupPM: asText((data['day3'] as { groupPM?: unknown } | undefined)?.groupPM),
          participantsGroup: asText(data['participantsGroup']),
          hasPushToken:
            typeof data['fcmToken'] === 'string' && data['fcmToken'].length > 0,
          plantVisit: data['plantVisit'] === true,
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
      acceptedCount: number;
      failedCount: number;
      deliveryError: boolean;
    };
  }> {
    return this.call('createInteractiveActivity', activity);
  }

  async listInteractiveActivities(): Promise<{ activities: InteractiveActivity[] }> {
    return this.call('listInteractiveActivities', {});
  }

  async listAdminInteractiveActivities(): Promise<{ activities: AdminInteractiveActivity[] }> {
    return this.call('listAdminInteractiveActivities', {});
  }

  async loadProjects(): Promise<IconicProject[]> {
    const snapshot = await getDocs(collection(this.firestore, 'projects'));
    return snapshot.docs
      .map((projectDocument) => this.toProject(projectDocument.id, projectDocument.data()))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
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

  async saveProject(project: ProjectInput): Promise<IconicProject> {
    const id = project.id?.trim() || this.createProjectId(project.name);
    const savedProject: IconicProject = { ...project, id };
    await setDoc(firestoreDoc(this.firestore, 'projects', id), savedProject);
    return savedProject;
  }

  async deleteProject(projectId: string): Promise<void> {
    await deleteDoc(firestoreDoc(this.firestore, 'projects', projectId));
  }

  async loadResources(): Promise<AdminResource[]> {
    const snapshot = await getDocs(collection(this.firestore, 'resources'));
    return snapshot.docs
      .map((resourceDocument) => ({
        id: resourceDocument.id,
        ...(resourceDocument.data() as Omit<AdminResource, 'id'>),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
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
    const savedResource: AdminResource = { ...resource, id };
    await setDoc(firestoreDoc(this.firestore, 'resources', id), savedResource);
    return savedResource;
  }

  async deleteResource(resourceId: string): Promise<void> {
    await deleteDoc(firestoreDoc(this.firestore, 'resources', resourceId));
  }

  async uploadResource(file: File, resourceTitle: string): Promise<string> {
    const storage = getStorage(
      getApp(),
      `gs://${environment.hsefirebaseConfig.storageBucket}`
    );
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const resourceId = this.createProjectId(resourceTitle);
    const resourceRef = ref(storage, `resources/${resourceId}-${Date.now()}-${safeName}`);
    await uploadBytes(resourceRef, file, { contentType: file.type || undefined });
    return getDownloadURL(resourceRef);
  }

  async uploadProjectAsset(
    file: File,
    assetType: 'image' | 'model',
    projectName = 'project'
  ): Promise<string> {
    const storage = getStorage(
      getApp(),
      `gs://${environment.hsefirebaseConfig.storageBucket}`
    );
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const projectId = this.createProjectId(projectName);
    const assetRef = ref(storage, `projects/${projectId}/${assetType}-${Date.now()}-${safeName}`);
    await uploadBytes(assetRef, file, { contentType: file.type || undefined });
    return getDownloadURL(assetRef);
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
      const hseApp =
        getApps().find((app) => app.name === 'HSEApp') ??
        initializeApp(environment.hsefirebaseConfig, 'HSEApp');
      const hseFirestore = getFirestore(hseApp);
      const snapshot = await getDocs(collection(hseFirestore, 'userProgress'));
      const statusByEmail = new Map<string, { completed: boolean; status: string }>();

      for (const progressDocument of snapshot.docs) {
        const data = progressDocument.data() as {
          email?: unknown;
          RMX?: { questionnairePassed?: unknown };
          rmx?: { questionnairePassed?: unknown };
          sokhnaplant?: { questionnairePassed?: unknown; lastWatchedIndex?: unknown };
          sokhnaPlant?: { questionnairePassed?: unknown; lastWatchedIndex?: unknown };
        };
        const email = typeof data.email === 'string'
          ? data.email.trim().toLowerCase()
          : '';
        if (!email) {
          continue;
        }

        const rmx = data.RMX ?? data.rmx;
        const sokhna = data.sokhnaplant ?? data.sokhnaPlant;
        const requiresRmx = rmx !== undefined;
        const sokhnaComplete = sokhna?.questionnairePassed === true;
        const rmxComplete = rmx?.questionnairePassed === true;
        const completed = requiresRmx
          ? sokhnaComplete && rmxComplete
          : sokhnaComplete;
        const lastWatchedIndex = sokhna?.lastWatchedIndex;
        const progress = typeof lastWatchedIndex === 'number' && lastWatchedIndex > 0
          ? `${lastWatchedIndex}/5`
          : 'Not started';
        statusByEmail.set(email, {
          completed,
          status: completed ? 'Done' : progress,
        });
      }

      return attendees.map((attendee) => {
        const email = attendee.email.trim().toLowerCase();
        if (!attendee.plantVisit) {
          return {
            ...attendee,
            safetyInductionCompleted: undefined,
            safetyInductionStatus: 'N/A',
          };
        }
        const status = statusByEmail.get(email);
        return status
          ? {
              ...attendee,
              safetyInductionCompleted: status.completed,
              safetyInductionStatus: status.status,
            }
          : { ...attendee, safetyInductionCompleted: false, safetyInductionStatus: 'Not started' };
      });
    } catch (error) {
      console.error('[AdminService] Failed to load HSE induction status:', error);
      return attendees;
    }
  }

  private toProject(id: string, data: Record<string, unknown>): IconicProject {
    return {
      ...(data as Omit<IconicProject, 'id'>),
      id,
      order: typeof data['order'] === 'number' ? data['order'] : 0,
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

  private async loadMainProjectUsers(): Promise<AdminAttendee[]> {
    const snapshot = await getDocs(collection(this.firestore, 'users'));
    const attendees = await Promise.all(snapshot.docs
      .map(async (userDocument) => {
        const data = userDocument.data() as {
          displayName?: unknown;
          name?: unknown;
          firstName?: unknown;
          nationality?: unknown;
          emailAddress?: unknown;
          plantVisit?: unknown;
          day2?: { group?: unknown };
          day3?: {
            type?: unknown;
            groupAM?: unknown;
            groupPM?: unknown;
          };
          participantsGroup?: unknown;
        };
        const asText = (value: unknown): string =>
          value == null ? '' : String(value);

        const attendee = {
          id: userDocument.id,
          email: typeof data.emailAddress === 'string' && data.emailAddress.trim()
            ? data.emailAddress.trim()
            : userDocument.id,
          name: asText(data.displayName ?? data.name),
          firstName: asText(data.firstName),
          nationality: asText(data.nationality),
          day2Group: asText(data.day2?.group),
          day3Type: asText(data.day3?.type),
          day3GroupAM: asText(data.day3?.groupAM),
          day3GroupPM: asText(data.day3?.groupPM),
          participantsGroup: asText(data.participantsGroup),
          hasPushToken:
            typeof (data as { fcmToken?: unknown }).fcmToken === 'string' &&
            (data as { fcmToken: string }).fcmToken.length > 0,
          plantVisit: data.plantVisit === true,
          loggedIn: false,
          active: false,
          installed: false,
        };
        const flightDetails = await this.loadFlightDetailsForUserId(userDocument.id);
        return flightDetails ? { ...attendee, flightDetails } : attendee;
      }));
    return attendees
      .filter((user) => user.email.trim().length > 0)
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  private async loadFlightDetailsForUserId(userId: string): Promise<FlightDetails | null> {
    const flightDocument = await firebaseGetDoc(
      firestoreDoc(this.firestore, 'users', userId, 'flightDetails', 'flightInfo')
    );
    return flightDocument.exists() ? this.toFlightDetails(flightDocument.data()) : null;
  }

  private async loadAppAnalytics(): Promise<
    Map<string, { loggedIn: boolean; active: boolean; installed: boolean }>
  > {
    const snapshot = await getDocs(collection(this.firestore, 'appAnalytics'));
    const activeCutoff = Date.now() - 15 * 60 * 1000;
    const analytics = new Map<
      string,
      { loggedIn: boolean; active: boolean; installed: boolean }
    >();

    for (const activityDocument of snapshot.docs) {
      const data = activityDocument.data() as {
        email?: unknown;
        firstLoginAt?: { toMillis?: () => number };
        lastActiveAt?: { toMillis?: () => number };
        installedAt?: { toMillis?: () => number };
      };
      const email =
        typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
      if (!email) {
        continue;
      }
      const lastActiveAt = data.lastActiveAt?.toMillis?.() ?? 0;
      analytics.set(email, {
        loggedIn: !!data.firstLoginAt,
        active: lastActiveAt >= activeCutoff,
        installed: !!data.installedAt,
      });
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
