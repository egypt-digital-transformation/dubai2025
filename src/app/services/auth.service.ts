import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
  signOut,
} from '@angular/fire/auth';
import {
  Firestore,
  collection,
  query,
  where,
  getDocs,
  getDocsFromServer,
  doc,
  getDoc,
  getDocFromServer,
  updateDoc,
} from '@angular/fire/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { FirebaseInjectionContext } from './firebase-injection-context.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly firestore = inject(Firestore);
  private readonly firebaseContext = inject(FirebaseInjectionContext);
  private _user = new BehaviorSubject<User | null>(null);
  public user$ = this._user.asObservable();

  private authInitialized = false;
  private legacyAuthorizedUid: string | null = null;
  private legacyAuthorizedEmail: string | null = null;
  private initPromise: Promise<void>;

  constructor(private auth: Auth) {
    this.initPromise = this.initializeAuth();
  }

  /** Initialize Firebase Auth listener once */
  private async initializeAuth(): Promise<void> {
    return new Promise((resolve) => {
      this.firebaseContext.run(() =>
        onAuthStateChanged(this.auth, async (user) => {
          if (!this.authInitialized && user) {
            const { value: savedUser } = await Preferences.get({ key: 'user' });
            if (savedUser) {
              try {
                const cachedUser = JSON.parse(savedUser) as { uid?: string; email?: string };
                if (
                  cachedUser.uid === user.uid &&
                  cachedUser.email?.trim().toLowerCase() === user.email?.trim().toLowerCase()
                ) {
                  this.legacyAuthorizedUid = user.uid;
                  this.legacyAuthorizedEmail = user.email?.trim().toLowerCase() ?? null;
                }
              } catch (error) {
                console.warn('[AuthService] Saved user session is invalid:', error);
              }
            }
          }

          this._user.next(user);

          if (user) {
            void this.cacheAndSyncUserPhoto(user);
            await Preferences.set({
              key: 'user',
              value: JSON.stringify({
                uid: user.uid,
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
              }),
            });
          } else {
            this.legacyAuthorizedUid = null;
            this.legacyAuthorizedEmail = null;
            await Promise.all([
              Preferences.remove({ key: 'user' }),
              Preferences.remove({ key: 'authorized-user' }),
            ]);
          }

          if (!this.authInitialized) {
            this.authInitialized = true;
            resolve();
          }
        })
      );
    });
  }

  /** Wait until Firebase finishes loading auth state */
  async waitForAuthResolved(): Promise<void> {
    await this.initPromise;
  }

  /** Current user getter */
  get currentUser(): User | null {
    return this._user.value;
  }

  /** Check login status (safe after waitForAuthResolved) */
  isAuthenticated(): boolean {
    return !!this._user.value;
  }

  /**
   * Verify if the user's email exists in the registered 'users' collection
   * or has active administrator privileges in 'admins'.
   */
  async isUserAllowed(email: string | null | undefined): Promise<boolean> {
    if (!email) return false;
    const normalizedEmail = email.trim().toLowerCase();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return this.hasCachedAuthorization(normalizedEmail);
    }

    // 1. Try server-side Cloud Function verifyUserAccess first
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const verifyFn = httpsCallable<object, { allowed: boolean; role: string | null }>(
        functions,
        'verifyUserAccess',
        { timeout: 8000 }
      );
      const res = await verifyFn({});
      if (res?.data && typeof res.data.allowed === 'boolean') {
        if (res.data.allowed) {
          await this.cacheAuthorization(normalizedEmail);
        } else {
          await this.clearAuthorizationCache();
        }
        return res.data.allowed;
      }
    } catch (cfError) {
      console.warn('[AuthService] verifyUserAccess function call failed, falling back to direct Firestore check:', cfError);
    }

    // 2. Direct Firestore fallback
    try {
      // Check admin status
      const adminDoc = await this.firebaseContext.run(() =>
        getDocFromServer(doc(this.firestore, 'admins', normalizedEmail))
      );
      if (adminDoc.exists() && adminDoc.data()?.['active'] === true) {
        await this.cacheAuthorization(normalizedEmail);
        return true;
      }

      // Check users collection by document ID
      const userDocById = await this.firebaseContext.run(() =>
        getDocFromServer(doc(this.firestore, 'users', normalizedEmail))
      );
      if (userDocById.exists()) {
        await this.cacheAuthorization(normalizedEmail);
        return true;
      }

      // Check users collection by email / emailAddress fields
      const usersRef = collection(this.firestore, 'users');
      const emailQueries = [
        this.firebaseContext.run(() =>
          getDocsFromServer(query(usersRef, where('email', '==', normalizedEmail)))
        ),
        this.firebaseContext.run(() =>
          getDocsFromServer(query(usersRef, where('emailAddress', '==', normalizedEmail)))
        ),
      ];

      if (email.trim() !== normalizedEmail) {
        emailQueries.push(
          this.firebaseContext.run(() =>
            getDocsFromServer(query(usersRef, where('email', '==', email.trim())))
          ),
          this.firebaseContext.run(() =>
            getDocsFromServer(query(usersRef, where('emailAddress', '==', email.trim())))
          )
        );
      }

      const matchingUser = (await Promise.all(emailQueries)).some((result) => !result.empty);
      if (matchingUser) {
        await this.cacheAuthorization(normalizedEmail);
        return true;
      }
    } catch (firestoreError) {
      if (this.isConnectivityError(firestoreError)) {
        console.warn('[AuthService] Firestore is unreachable; checking the saved session:', firestoreError);
        return this.hasCachedAuthorization(normalizedEmail);
      }

      console.error('[AuthService] Firestore access verification was denied or failed:', firestoreError);
      return false;
    }

    await this.clearAuthorizationCache();
    return false;
  }

  private async clearAuthorizationCache(): Promise<void> {
    try {
      await Preferences.remove({ key: 'authorized-user' });
    } catch (error) {
      console.error('[AuthService] Could not clear offline authorization:', error);
    }
  }

  private isConnectivityError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;

    const code = String(error.code);
    return [
      'unavailable',
      'deadline-exceeded',
      'network-request-failed',
      'functions/unavailable',
      'functions/deadline-exceeded',
    ].includes(code);
  }

  private async cacheAuthorization(email: string): Promise<void> {
    const user = this.auth.currentUser ?? this.currentUser;
    if (!user) return;

    try {
      await Preferences.set({
        key: 'authorized-user',
        value: JSON.stringify({ uid: user.uid, email }),
      });
    } catch (error) {
      console.error('[AuthService] Could not save offline authorization:', error);
    }
  }

  private async hasCachedAuthorization(email: string): Promise<boolean> {
    const user = this.auth.currentUser ?? this.currentUser;
    if (!user) return false;

    try {
      const { value: savedAuthorization } = await Preferences.get({ key: 'authorized-user' });
      if (savedAuthorization) {
        const authorization = JSON.parse(savedAuthorization) as { uid?: string; email?: string };
        if (authorization.uid === user.uid && authorization.email === email) {
          return true;
        }
      }
    } catch (error) {
      console.error('[AuthService] Could not read offline authorization:', error);
    }

    return this.legacyAuthorizedUid === user.uid && this.legacyAuthorizedEmail === email;
  }

  /** Google Sign-In with pre-registered users allowlist check */
  async signInWithGoogle(): Promise<User | null> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await this.firebaseContext.run(() => signInWithPopup(this.auth, provider));

      if (!result?.user) throw new Error('No user returned from sign-in');

      // Verify that user email is registered in users or admins collection
      const allowed = await this.isUserAllowed(result.user.email);
      if (!allowed) {
        await this.logout();
        const error: any = new Error('NOT_AUTHORIZED');
        error.code = 'auth/user-not-registered';
        throw error;
      }

      await this.cacheAndSyncUserPhoto(result.user);
      return result.user;
    } catch (error: any) {
      console.error('[AuthService] Google Sign-In Error:', error);
      throw error;
    }
  }

  /** Logout and clear data */
  async logout(): Promise<void> {
    try {
      await this.firebaseContext.run(() => signOut(this.auth));
      await Promise.all([
        Preferences.remove({ key: 'user' }),
        Preferences.remove({ key: 'authorized-user' }),
      ]);
      this._user.next(null);
    } catch (error) {
      console.error('[AuthService] Logout Error:', error);
      throw error;
    }
  }

  /** Check if a user session is stored locally (before Firebase initializes) */
  async hasStoredSession(): Promise<boolean> {
    const { value } = await Preferences.get({ key: 'user' });
    return !!value;
  }

  /** Cache the user's Google photo locally and sync it to their Firestore profile */
  async cacheAndSyncUserPhoto(user: User | null | undefined): Promise<string> {
    const email = user?.email?.trim().toLowerCase() ?? '';
    const rawPhotoUrl = user?.photoURL?.trim() ?? '';
    if (!email || !rawPhotoUrl) {
      return '';
    }

    let cachedPhoto = rawPhotoUrl;
    try {
      const response = await fetch(rawPhotoUrl, { referrerPolicy: 'no-referrer' });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0 && blob.size <= 250_000) {
          cachedPhoto = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () =>
              resolve(typeof reader.result === 'string' ? reader.result : rawPhotoUrl);
            reader.onerror = () => resolve(rawPhotoUrl);
            reader.readAsDataURL(blob);
          });
        }
      }
    } catch {
      cachedPhoto = rawPhotoUrl;
    }

    try {
      const rawMap = localStorage.getItem('colleague_photos_cache_v1');
      const map: Record<string, string> = rawMap ? JSON.parse(rawMap) : {};
      map[email] = cachedPhoto;
      localStorage.setItem('colleague_photos_cache_v1', JSON.stringify(map));
    } catch {
      // Ignore localStorage quota errors
    }

    try {
      const usersRef = collection(this.firestore, 'users');
      const [byEmailAddress, byEmail, byDocId] = await Promise.all([
        this.firebaseContext.run(() =>
          getDocs(query(usersRef, where('emailAddress', '==', email)))
        ).catch(() => null),
        this.firebaseContext.run(() =>
          getDocs(query(usersRef, where('email', '==', email)))
        ).catch(() => null),
        this.firebaseContext.run(() =>
          getDoc(doc(this.firestore, 'users', email))
        ).catch(() => null),
      ]);
      const matchedDocs = [
        ...(byEmailAddress?.docs ?? []),
        ...(byEmail?.docs ?? []),
        ...(byDocId?.exists() ? [byDocId] : []),
      ];
      const seenIds = new Set<string>();
      for (const userDoc of matchedDocs) {
        if (seenIds.has(userDoc.id)) continue;
        seenIds.add(userDoc.id);
        const existingPhoto = String(userDoc.data()?.['photoURL'] ?? '').trim();
        if (existingPhoto !== rawPhotoUrl) {
          await this.firebaseContext.run(() =>
            updateDoc(doc(this.firestore, 'users', userDoc.id), {
              photoURL: rawPhotoUrl,
            })
          ).catch(() => undefined);
        }
      }
    } catch {
      // Non-fatal if rules haven't been deployed yet; recordAppActivity also syncs photoURL
    }

    return cachedPhoto;
  }
}
