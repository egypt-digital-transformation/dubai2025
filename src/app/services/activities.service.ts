import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AdminService, InteractiveActivity } from './admin.service';

const SEEN_STORAGE_KEY = 'seen_interactive_activity_ids';

@Injectable({
  providedIn: 'root',
})
export class ActivitiesService {
  private readonly adminService = inject(AdminService);

  private readonly unseenCountSubject = new BehaviorSubject<number>(0);
  public readonly unseenCount$: Observable<number> = this.unseenCountSubject.asObservable();

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
   * Loads activities from server sorted newest to oldest.
   */
  async getActivities(): Promise<InteractiveActivity[]> {
    const result = await this.adminService.listInteractiveActivities();
    const sorted = [...(result.activities || [])].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    // Update unseen count based on fetched activities
    const seenIds = this.getSeenIds();
    const unseen = sorted.filter((a) => !seenIds.has(a.id) && !a.submitted);
    this.unseenCountSubject.next(unseen.length);

    return sorted;
  }

  /**
   * Refreshes the count of unseen polls/quizzes for badge display.
   */
  async refreshUnseenCount(): Promise<number> {
    try {
      const result = await this.adminService.listInteractiveActivities();
      const seenIds = this.getSeenIds();
      const unseen = (result.activities || []).filter(
        (a) => !seenIds.has(a.id) && !a.submitted
      );
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
