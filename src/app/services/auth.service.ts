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
  doc,
  getDoc,
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
  private initPromise: Promise<void>;

  constructor(private auth: Auth) {
    this.initPromise = this.initializeAuth();
  }

  /** Initialize Firebase Auth listener once */
  private async initializeAuth(): Promise<void> {
    return new Promise((resolve) => {
      this.firebaseContext.run(() =>
        onAuthStateChanged(this.auth, async (user) => {
          this._user.next(user);

          if (user) {
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
            await Preferences.remove({ key: 'user' });
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

    // 1. Try server-side Cloud Function verifyUserAccess first
    try {
      const functions = getFunctions(undefined, 'europe-west1');
      const verifyFn = httpsCallable<object, { allowed: boolean; role: string | null }>(
        functions,
        'verifyUserAccess'
      );
      const res = await verifyFn({});
      if (res?.data && typeof res.data.allowed === 'boolean') {
        return res.data.allowed;
      }
    } catch (cfError) {
      console.warn('[AuthService] verifyUserAccess function call failed, falling back to direct Firestore check:', cfError);
    }

    // 2. Direct Firestore fallback
    try {
      // Check admin status
      const adminDoc = await this.firebaseContext.run(() =>
        getDoc(doc(this.firestore, 'admins', normalizedEmail))
      );
      if (adminDoc.exists() && adminDoc.data()?.['active'] === true) {
        return true;
      }

      // Check users collection by document ID
      const userDocById = await this.firebaseContext.run(() =>
        getDoc(doc(this.firestore, 'users', normalizedEmail))
      );
      if (userDocById.exists()) {
        return true;
      }

      // Check users collection by email / emailAddress fields
      const usersRef = collection(this.firestore, 'users');
      const [emailQuery, emailAddressQuery] = await Promise.all([
        this.firebaseContext.run(() =>
          getDocs(query(usersRef, where('email', '==', normalizedEmail)))
        ).catch(() => null),
        this.firebaseContext.run(() =>
          getDocs(query(usersRef, where('emailAddress', '==', normalizedEmail)))
        ).catch(() => null),
      ]);

      if ((emailQuery && !emailQuery.empty) || (emailAddressQuery && !emailAddressQuery.empty)) {
        return true;
      }

      if (email.trim() !== normalizedEmail) {
        const [rawEmailQuery, rawEmailAddressQuery] = await Promise.all([
          this.firebaseContext.run(() =>
            getDocs(query(usersRef, where('email', '==', email.trim())))
          ).catch(() => null),
          this.firebaseContext.run(() =>
            getDocs(query(usersRef, where('emailAddress', '==', email.trim())))
          ).catch(() => null),
        ]);
        if ((rawEmailQuery && !rawEmailQuery.empty) || (rawEmailAddressQuery && !rawEmailAddressQuery.empty)) {
          return true;
        }
      }
    } catch (firestoreError) {
      console.error('[AuthService] Firestore verification error:', firestoreError);
    }

    return false;
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
      await Preferences.remove({ key: 'user' });
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
}
