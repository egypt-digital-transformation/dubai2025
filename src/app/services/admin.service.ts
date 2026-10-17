import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
    return this.call<AdminDashboard>('getAdminDashboard', {});
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
