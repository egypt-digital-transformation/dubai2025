import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import {
  collection,
  deleteDoc,
  doc as firestoreDoc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import { environment } from '../../environments/environment';
import { IconicProject, HolcimProduct, ProjectStats } from '../iconic-projects/models/project.model';

export interface AdminAttendee {
  id: string;
  email: string;
  name: string;
  day2Group: string;
  day3Type: string;
  day3GroupAM: string;
  day3GroupPM: string;
  hasPushToken: boolean;
  loggedIn: boolean;
  active: boolean;
  installed: boolean;
  safetyInductionCompleted?: boolean;
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
  | {
      kind: 'segment';
      field: 'day2.group' | 'day3.type' | 'day3.groupAM' | 'day3.groupPM';
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
    return snapshot.exists() && snapshot.data()['active'] !== false;
  }

  async recordAppActivity(installed: boolean): Promise<void> {
    await this.call<void>('recordAppActivity', { installed });
  }

  async registerPushToken(token: string): Promise<void> {
    await this.call<void>('registerPushToken', { token });
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

  async sendNotification(
    title: string,
    body: string,
    target: NotificationTarget
  ): Promise<{
    campaignId: string;
    targetCount: number;
    pushReadyCount: number;
    acceptedCount: number;
    failedCount: number;
    status: string;
  }> {
    return this.call('sendTargetedNotification', { title, body, target });
  }

  async createInteractiveActivity(activity: {
    title: string;
    question: string;
    options: string[];
    kind: 'quiz' | 'poll';
    target: NotificationTarget;
    correctOptionIndex: number | null;
  }): Promise<{ id: string }> {
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

  async saveProject(project: ProjectInput): Promise<IconicProject> {
    const id = project.id?.trim() || this.createProjectId(project.name);
    const savedProject: IconicProject = { ...project, id };
    await setDoc(firestoreDoc(this.firestore, 'projects', id), savedProject);
    return savedProject;
  }

  async deleteProject(projectId: string): Promise<void> {
    await deleteDoc(firestoreDoc(this.firestore, 'projects', projectId));
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
      const statusByEmail = new Map<string, boolean>();

      for (const progressDocument of snapshot.docs) {
        const data = progressDocument.data() as {
          email?: unknown;
          RMX?: { questionnairePassed?: unknown };
          rmx?: { questionnairePassed?: unknown };
          sokhnaplant?: { questionnairePassed?: unknown };
          sokhnaPlant?: { questionnairePassed?: unknown };
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
        statusByEmail.set(email, requiresRmx
          ? sokhnaComplete && rmxComplete
          : sokhnaComplete);
      }

      return attendees.map((attendee) => {
        const email = attendee.email.trim().toLowerCase();
        return statusByEmail.has(email)
          ? { ...attendee, safetyInductionCompleted: statusByEmail.get(email) }
          : attendee;
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

  private createProjectId(name: string): string {
    const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id) {
      throw new Error('A project name is required.');
    }
    return id;
  }

  private async loadMainProjectUsers(): Promise<AdminAttendee[]> {
    const snapshot = await getDocs(collection(this.firestore, 'users'));
    return snapshot.docs
      .map((userDocument) => {
        const data = userDocument.data() as {
          displayName?: unknown;
          name?: unknown;
          day2?: { group?: unknown };
          day3?: {
            type?: unknown;
            groupAM?: unknown;
            groupPM?: unknown;
          };
        };
        const asText = (value: unknown): string =>
          value == null ? '' : String(value);

        return {
          id: userDocument.id,
          email: userDocument.id,
          name: asText(data.displayName ?? data.name),
          day2Group: asText(data.day2?.group),
          day3Type: asText(data.day3?.type),
          day3GroupAM: asText(data.day3?.groupAM),
          day3GroupPM: asText(data.day3?.groupPM),
          hasPushToken:
            typeof (data as { fcmToken?: unknown }).fcmToken === 'string' &&
            (data as { fcmToken: string }).fcmToken.length > 0,
          loggedIn: false,
          active: false,
          installed: false,
        };
      })
      .filter((user) => user.email.trim().length > 0)
      .sort((a, b) => a.email.localeCompare(b.email));
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
