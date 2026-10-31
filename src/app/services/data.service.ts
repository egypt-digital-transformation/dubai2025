import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  orderBy,
  query,
  CollectionReference,
} from '@angular/fire/firestore';
import {
  BehaviorSubject,
  Observable,
  catchError,
  defer,
  firstValueFrom,
  shareReplay,
  tap,
  throwError,
  timeout,
} from 'rxjs';

export interface Session {
  id: string;
  title: string;
  startTime: any;
  endTime: any;
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

export interface Announcement {
  id: string;
  title: string;
  description: string;
  timestamp: any;
  active: boolean;
  priority: string;
}

export type DataLoadState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: unknown };

@Injectable({ providedIn: 'root' })
export class DataService {
  private _sessions$!: Observable<Session[]>;
  private _announcements$!: Observable<Announcement[]>;
  private _initialized = false;
  private initialization?: Promise<{ sessions: Session[]; announcements: Announcement[] }>;
  private readonly sessionsState = new BehaviorSubject<DataLoadState<Session[]>>({
    status: 'loading',
  });
  private readonly announcementsState = new BehaviorSubject<DataLoadState<Announcement[]>>({
    status: 'loading',
  });

  constructor(private firestore: Firestore) {}

  /** Start fetching Firestore data early and resolve when both collections emit. */
  initData(): Promise<{ sessions: Session[]; announcements: Announcement[] }> {
    this.ensureInit();
    if (this.initialization) return this.initialization;

    const initialization = Promise.all([
      firstValueFrom(this._sessions$),
      firstValueFrom(this._announcements$),
    ]).then(([sessions, announcements]) => ({ sessions, announcements }));

    this.initialization = initialization;
    void initialization.catch(() => {
      if (this.initialization === initialization) {
        this.initialization = undefined;
      }
    });

    return initialization;
  }

  get sessionsState$(): Observable<DataLoadState<Session[]>> {
    return this.sessionsState.asObservable();
  }

  get announcementsState$(): Observable<DataLoadState<Announcement[]>> {
    return this.announcementsState.asObservable();
  }

  /** Observable getters */
  get sessions$(): Observable<Session[]> {
    this.ensureInit();
    return this._sessions$;
  }

  get announcements$(): Observable<Announcement[]> {
    this.ensureInit();
    return this._announcements$;
  }

  private ensureInit(): void {
    if (this._initialized) return;
    this._initialized = true;

    const sessionsRef = collection(
      this.firestore,
      'sessions'
    ) as CollectionReference<Session>;
    const announcementsRef = collection(
      this.firestore,
      'announcements'
    ) as CollectionReference<Announcement>;

    this._sessions$ = this.trackLoadState(
      () => collectionData(
        query(sessionsRef, orderBy('startTime', 'asc')),
        { idField: 'id' }
      ),
      this.sessionsState
    );
    this._announcements$ = this.trackLoadState(
      () => collectionData(
        query(announcementsRef, orderBy('timestamp', 'desc')),
        { idField: 'id' }
      ),
      this.announcementsState
    );
  }

  private trackLoadState<T>(
    source: () => Observable<T>,
    state: BehaviorSubject<DataLoadState<T>>
  ): Observable<T> {
    return defer(() => {
      state.next({ status: 'loading' });
      return source().pipe(
        timeout({ first: 15_000 }),
        tap((data) => state.next({ status: 'loaded', data })),
        catchError((error: unknown) => {
          state.next({ status: 'error', error });
          return throwError(() => error);
        })
      );
    }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }
}
