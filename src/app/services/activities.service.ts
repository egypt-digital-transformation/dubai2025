import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { AdminService, InteractiveActivity } from './admin.service';
import { FirebaseInjectionContext } from './firebase-injection-context.service';
import { mapAgendaDaySessions } from '../shared/agenda-day';

const SEEN_STORAGE_KEY = 'seen_interactive_activity_ids';

export interface UserSessionTiming {
  sessionTitle: string;
  startTime: Date | null;
  endTime: Date | null;
  day: string;
}

@Injectable({
  providedIn: 'root',
})
export class ActivitiesService {
  private readonly adminService = inject(AdminService);
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly firebaseContext = inject(FirebaseInjectionContext);

  private readonly unseenCountSubject = new BehaviorSubject<number>(0);
  public readonly unseenCount$: Observable<number> = this.unseenCountSubject.asObservable();

  private userSessionTimings: UserSessionTiming[] | null = null;
  private userSessionTimingsUid = '';

  private getSeenIds(): Set<string> {
    try {
      const raw = localStorage.getItem(SEEN_STORAGE_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set<string>();
    }
  }

  private saveSeenIds(ids: Set<string>): void {
    try {
      localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch (e) {
      console.warn('[ActivitiesService] Failed to persist seen activity IDs:', e);
    }
  }

  /**
   * Loads attendee's personal session timings from their personal agenda
   */
  async getUserSessionTimings(uid?: string): Promise<UserSessionTiming[]> {
    const targetUid = uid || this.auth.currentUser?.uid;
    if (!targetUid) return [];

    if (this.userSessionTimings && this.userSessionTimingsUid === targetUid) {
      return this.userSessionTimings;
    }

    try {
      const agendaRef = collection(this.firestore, 'users', targetUid, 'agenda');
      const agendaSnap = await this.firebaseContext.run(() => getDocs(agendaRef));
      const timings: UserSessionTiming[] = [];
      for (const dayDoc of agendaSnap.docs) {
        const mapped = mapAgendaDaySessions(dayDoc.data());
        for (const s of mapped) {
          timings.push({
            sessionTitle: (s.title || '').trim().toLowerCase(),
            startTime: s.startTime,
            endTime: s.endTime,
            day: s.day,
          });
        }
      }
      this.userSessionTimings = timings;
      this.userSessionTimingsUid = targetUid;
      return timings;
    } catch (e) {
      console.warn('[ActivitiesService] Could not load user session timings:', e);
      return [];
    }
  }

  /**
   * Determines if a session-locked activity is currently visible for this attendee:
   * - If not linked to a session or not schedule-locked: always visible.
   * - If already submitted by user: always visible (so they can review their answer/score).
   * - If linked to a session: only appears when the session is live now for him
   *   (from session start time until session end + 10 min grace period).
   */
  isActivityVisibleForUser(
    activity: InteractiveActivity,
    timings: UserSessionTiming[],
    now: Date = new Date()
  ): boolean {
    if (!activity.sessionName || !activity.scheduleLocked) {
      return true;
    }

    // Always visible if the attendee already responded
    if (activity.submitted) {
      return true;
    }

    if (!timings || !timings.length) {
      return false;
    }

    const sessionKey = activity.sessionName.trim().toLowerCase();
    const matched = timings.find(
      (t) =>
        t.sessionTitle === sessionKey ||
        t.sessionTitle.includes(sessionKey) ||
        sessionKey.includes(t.sessionTitle)
    );

    if (!matched || !matched.startTime) {
      return false;
    }

    // "The poll/quiz should appear for the user on the session is live now for him"
    // Active from session start time (with 3-minute grace buffer for early room entry)
    // until session end time (with 10-minute grace buffer for final votes).
    const startThreshold = new Date(matched.startTime.getTime() - 3 * 60 * 1000);
    const endThreshold = matched.endTime
      ? new Date(matched.endTime.getTime() + 10 * 60 * 1000)
      : null;

    const hasStarted = now.getTime() >= startThreshold.getTime();
    if (!hasStarted) {
      return false; // Not yet live for this attendee
    }

    if (endThreshold && now.getTime() > endThreshold.getTime()) {
      return false; // Session rotation has passed and attendee did not participate
    }

    return true;
  }

  /**
   * Determines if an activity is unlocked according to the attendee's personal session rotation.
   */
  isActivityScheduleUnlocked(
    activity: InteractiveActivity,
    timings: UserSessionTiming[],
    now: Date = new Date()
  ): { isUnlocked: boolean; unlockTime?: Date | null } {
    const isUnlocked = this.isActivityVisibleForUser(activity, timings, now);
    return { isUnlocked };
  }

  /**
   * Loads activities from server sorted newest to oldest, returning only activities
   * that are currently visible/live for the user.
   */
  async getActivities(): Promise<InteractiveActivity[]> {
    const result = await this.adminService.listInteractiveActivities();
    const sorted = [...(result.activities || [])].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const timings = await this.getUserSessionTimings();
    const seenIds = this.getSeenIds();
    const now = new Date();

    const visibleActivities = sorted.filter((activity) =>
      this.isActivityVisibleForUser(activity, timings, now)
    );

    const unseen = visibleActivities.filter((activity) => {
      if (activity.active === false || seenIds.has(activity.id) || activity.submitted) {
        return false;
      }
      return true;
    });
    this.unseenCountSubject.next(unseen.length);

    return visibleActivities;
  }

  /**
   * Refreshes the count of unseen polls/quizzes for badge display.
   */
  async refreshUnseenCount(): Promise<number> {
    try {
      const result = await this.adminService.listInteractiveActivities();
      const timings = await this.getUserSessionTimings();
      const seenIds = this.getSeenIds();
      const now = new Date();

      const visible = (result.activities || []).filter((activity) =>
        this.isActivityVisibleForUser(activity, timings, now)
      );

      const unseen = visible.filter((activity) => {
        if (activity.active === false || seenIds.has(activity.id) || activity.submitted) {
          return false;
        }
        return true;
      });
      const count = unseen.length;
      this.unseenCountSubject.next(count);
      return count;
    } catch (error) {
      console.warn('[ActivitiesService] Failed to refresh unseen count:', error);
      return this.unseenCountSubject.value;
    }
  }

  /**
   * Marks the given activities as seen and resets unseen badge count.
   */
  markActivitiesAsSeen(activities: InteractiveActivity[]): void {
    const seenIds = this.getSeenIds();
    for (const a of activities) {
      seenIds.add(a.id);
    }
    this.saveSeenIds(seenIds);
    this.unseenCountSubject.next(0);
  }
}
