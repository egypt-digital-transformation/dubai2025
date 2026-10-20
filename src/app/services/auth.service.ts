import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
  signOut,
} from '@angular/fire/auth';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { FirebaseInjectionContext } from './firebase-injection-context.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
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

  /** Google Sign-In */
  async signInWithGoogle(): Promise<User | null> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await this.firebaseContext.run(() => signInWithPopup(this.auth, provider));

      if (!result?.user) throw new Error('No user returned from sign-in');
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
