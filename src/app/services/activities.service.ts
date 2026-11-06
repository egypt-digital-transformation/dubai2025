import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Auth } from '@angular/fire/auth';
import { Firestore, collection, doc, getDoc, getDocs, query, where } from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import { AdminService, InteractiveActivity } from './admin.service';
import { AdminPreviewService } from './admin-preview.service';
import { DataService } from './data.service';
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
  private readonly adminPreview = inject(AdminPreviewService);
  private readonly dataService = inject(DataService);

  private readonly unseenCountSubject = new BehaviorSubject<number>(0);
  public readonly unseenCount$: Observable<number> = this.unseenCountSubject.asObservable();

  private userSessionTimings: UserSessionTiming[] | null = null;
  private userSessionTimingsUid = '';

  private toDate(val: any): Date {
    if (!val) return new Date(NaN);
    if (val instanceof Timestamp) return val.toDate();
    if (val?.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    return new Date(val);
  }

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
   * Loads attendee's personal session timings from their personal agenda or shared sessions.
   */
  async getUserSessionTimings(userEmailOrUid?: string): Promise<UserSessionTiming[]> {
    const previewUser = this.adminPreview?.selectedUser;
    const authUser = this.auth.currentUser;
    const email = (previewUser?.email || userEmailOrUid || authUser?.email || '').trim().toLowerCase();
    const uid = previewUser?.id || authUser?.uid || '';

    const cacheKey = `${email}:${uid}`;
    if (this.userSessionTimings && this.userSessionTimings.length > 0 && this.userSessionTimingsUid === cacheKey) {
      return this.userSessionTimings;
    }

    const timings: UserSessionTiming[] = [];
    let userDocId: string | null = null;
    let userDocData: Record<string, any> | null = null;

    try {
      const usersRef = collection(this.firestore, 'users');
      if (email) {
        const directDoc = await this.firebaseContext.run(() =>
          getDoc(doc(this.firestore, 'users', email))
        ).catch(() => null);

        if (directDoc && directDoc.exists()) {
          userDocId = directDoc.id;
          userDocData = directDoc.data();
        } else {
          const [byEmailAddress, byEmail] = await Promise.all([
            this.firebaseContext.run(() =>
              getDocs(query(usersRef, where('emailAddress', '==', email)))
            ).catch(() => null),
            this.firebaseContext.run(() =>
              getDocs(query(usersRef, where('email', '==', email)))
            ).catch(() => null),
          ]);
          const found = byEmailAddress?.docs[0] || byEmail?.docs[0];
          if (found) {
            userDocId = found.id;
            userDocData = found.data();
          }
        }
      }

      if (!userDocId && uid) {
        const directUidDoc = await this.firebaseContext.run(() =>
          getDoc(doc(this.firestore, 'users', uid))
        ).catch(() => null);
        if (directUidDoc && directUidDoc.exists()) {
          userDocId = directUidDoc.id;
          userDocData = directUidDoc.data();
        }
      }

      if (userDocId) {
        const agendaRef = collection(this.firestore, 'users', userDocId, 'agenda');
        const agendaSnap = await this.firebaseContext.run(() => getDocs(agendaRef)).catch(() => null);
        if (agendaSnap && !agendaSnap.empty) {
          for (const dayDoc of agendaSnap.docs) {
            const mapped = mapAgendaDaySessions(dayDoc.data());
            for (const s of mapped) {
              if (s.title && s.startTime) {
                timings.push({
                  sessionTitle: s.title.trim().toLowerCase(),
                  startTime: s.startTime,
                  endTime: s.endTime,
                  day: s.day,
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[ActivitiesService] Error querying user agenda:', e);
    }

    // Always merge or fallback to shared sessions from DataService or Firestore
    try {
      let sharedSessions: any[] = [];
      try {
        sharedSessions = await firstValueFrom(
          this.dataService.sessions$.pipe(timeout(3000), catchError(() => of([])))
        );
      } catch {}

      if (!sharedSessions || sharedSessions.length === 0) {
        const sSnap = await this.firebaseContext.run(() =>
          getDocs(collection(this.firestore, 'sessions'))
        ).catch(() => null);
        if (sSnap && !sSnap.empty) {
          sharedSessions = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        }
      }

      const userGroup =
        previewUser?.group ||
        userDocData?.day2?.group ||
        userDocData?.group ||
        userDocData?.participantsGroup ||
        '';
      const groupNum = typeof userGroup === 'string'
        ? userGroup.replace(/\D/g, '')
        : typeof userGroup === 'number'
        ? String(userGroup)
        : '';

      const day3 = userDocData?.day3;
      const groupAM = day3?.groupAM && day3.groupAM !== 'SV' ? String(day3.groupAM).replace(/\D/g, '') : '';
      const groupPM = day3?.groupPM && day3.groupPM !== 'SV' ? String(day3.groupPM).replace(/\D/g, '') : '';

      for (const s of sharedSessions) {
        if (!s.title) continue;
        const titleLower = s.title.trim().toLowerCase();

        // If personal agenda already populated this session with start and end times, keep the personal one
        if (timings.some((t) => t.sessionTitle === titleLower)) {
          continue;
        }

        let start = this.toDate(s.startTime);
        let end = this.toDate(s.endTime);

        // If workshop with rotational schedule for user's group, apply group-specific rotation
        if ((s as any).rotationalSchedule) {
          const rot = (s as any).rotationalSchedule;
          let matchedRotation: any = null;
          const sessionDay = String(s.day || '').trim();

          if (sessionDay === '2' || !sessionDay) {
            if (groupNum && rot[`group${groupNum}`]) {
              matchedRotation = rot[`group${groupNum}`];
            }
          }
          if (sessionDay === '3') {
            if (groupAM && rot[`group${groupAM}`]) {
              matchedRotation = rot[`group${groupAM}`];
            } else if (groupPM && rot[`group${groupPM}`]) {
              matchedRotation = rot[`group${groupPM}`];
            } else if (groupNum && rot[`group${groupNum}`]) {
              matchedRotation = rot[`group${groupNum}`];
            }
          }
          if (!matchedRotation && groupNum && rot[`group${groupNum}`]) {
            matchedRotation = rot[`group${groupNum}`];
          }

          if (matchedRotation) {
            const rotStart = this.toDate(matchedRotation.startTime);
            const rotEnd = this.toDate(matchedRotation.endTime);
            if (!isNaN(rotStart.getTime())) start = rotStart;
            if (!isNaN(rotEnd.getTime())) end = rotEnd;
          }
        }

        if (!isNaN(start.getTime())) {
          timings.push({
            sessionTitle: titleLower,
            startTime: start,
            endTime: isNaN(end.getTime()) ? null : end,
            day: s.day,
          });
        }
      }
    } catch (e) {
      console.warn('[ActivitiesService] Error loading shared sessions fallback:', e);
    }

    if (timings.length > 0) {
      this.userSessionTimings = timings;
      this.userSessionTimingsUid = cacheKey;
    }
    return timings;
  }

  /**
   * Determines if a session-locked activity is currently visible for this attendee:
   * - If not linked to a session or not schedule-locked: always visible.
   * - If already submitted by user: always visible (so they can review their answer/score).
   * - If linked to a session: only appears when the session is live now for him.
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

    const sessionKey = activity.sessionName.trim().toLowerCase();
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedKey = normalize(sessionKey);

    const matched = (timings || []).find((t) => {
      if (!t.sessionTitle) return false;
      const normalizedTitle = normalize(t.sessionTitle);
      return (
        t.sessionTitle === sessionKey ||
        normalizedTitle === normalizedKey ||
        t.sessionTitle.includes(sessionKey) ||
        sessionKey.includes(t.sessionTitle) ||
        normalizedTitle.includes(normalizedKey) ||
        normalizedKey.includes(normalizedTitle)
      );
    });

    if (!matched || !matched.startTime) {
      return false;
    }

    // "The poll/quiz should appear for the user on the session is live now for him"
    // Active from session start time (with 10-minute buffer for early entry)
    // until session end time (with 15-minute grace period for concluding votes).
    const startThreshold = new Date(matched.startTime.getTime() - 10 * 60 * 1000);
    const endThreshold = matched.endTime
      ? new Date(matched.endTime.getTime() + 15 * 60 * 1000)
      : null;

    const hasStarted = now.getTime() >= startThreshold.getTime();
    if (!hasStarted) {
      return false; // Not yet live for this attendee
    }

    if (endThreshold && now.getTime() > endThreshold.getTime()) {
      return false; // Session rotation has passed
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
