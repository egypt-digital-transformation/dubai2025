import { inject, Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { BehaviorSubject, interval, startWith } from 'rxjs';

export interface EventArchiveState {
  status: 'loading' | 'ready' | 'error';
  archived: boolean;
  eventEndAtMs: number | null;
}

interface EventArchiveResponse {
  serverNowMs: number;
  eventEndAtMs: number | null;
}

@Injectable({ providedIn: 'root' })
export class EventArchiveService {
  private readonly auth = inject(Auth);
  private get functions() {
    return getFunctions(undefined, 'europe-west1');
  }
  private readonly stateSubject = new BehaviorSubject<EventArchiveState>({
    status: 'loading',
    archived: false,
    eventEndAtMs: null,
  });
  private started = false;
  private refreshPromise?: Promise<void>;
  private serverTimeAnchorMs: number | null = null;
  private monotonicTimeAnchorMs: number | null = null;
  private archiveTimeout?: ReturnType<typeof setTimeout>;

  readonly state$ = this.stateSubject.asObservable();

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('focus', this.refreshOnFocus);
    document.addEventListener('visibilitychange', this.refreshOnVisibility);
    interval(30_000)
      .pipe(startWith(0))
      .subscribe(() => {
        void this.refresh();
      });
  }

  private readonly refreshOnFocus = (): void => {
    void this.refresh();
  };

  private readonly refreshOnVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      void this.refresh();
    }
  };

  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.auth.authStateReady()
      .then(() => this.fetchStatus())
      .catch((error: unknown) => {
        console.error('[EventArchiveService] Could not initialize authentication:', error);
        this.stateSubject.next({
          ...this.stateSubject.value,
          status: 'error',
        });
      });
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  private async fetchStatus(): Promise<void> {
    try {
      const getStatus = httpsCallable<void, EventArchiveResponse>(
        this.functions,
        'getEventArchiveStatus'
      );
      const result = await getStatus();
      const { serverNowMs, eventEndAtMs } = result.data;
      if (
        !Number.isFinite(serverNowMs) ||
        (eventEndAtMs !== null && !Number.isFinite(eventEndAtMs))
      ) {
        throw new Error('The event status response was invalid.');
      }

      this.serverTimeAnchorMs = serverNowMs;
      this.monotonicTimeAnchorMs = performance.now();
      this.stateSubject.next({
        status: 'ready',
        archived: eventEndAtMs !== null && serverNowMs >= eventEndAtMs,
        eventEndAtMs,
      });
      this.scheduleArchiveTransition(eventEndAtMs);
    } catch (error) {
      console.error('[EventArchiveService] Could not refresh event status:', error);
      const current = this.stateSubject.value;
      this.stateSubject.next({
        ...current,
        status: 'error',
      });
    }
  }

  private scheduleArchiveTransition(eventEndAtMs: number | null): void {
    if (this.archiveTimeout) clearTimeout(this.archiveTimeout);
    if (
      eventEndAtMs === null ||
      this.serverTimeAnchorMs === null ||
      this.monotonicTimeAnchorMs === null ||
      this.stateSubject.value.archived
    ) {
      return;
    }

    const estimatedServerNow =
      this.serverTimeAnchorMs + (performance.now() - this.monotonicTimeAnchorMs);
    this.archiveTimeout = setTimeout(() => {
      if (estimatedServerNow < eventEndAtMs) {
        this.scheduleArchiveTransition(eventEndAtMs);
        return;
      }
      void this.refresh();
    }, Math.max(0, eventEndAtMs - estimatedServerNow));
  }
}
