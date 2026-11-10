import { FirebaseApp } from 'firebase/app';
import {
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firestoreByApp = new WeakMap<FirebaseApp, Firestore>();

export function getHseFirestore(app: FirebaseApp): Firestore {
  const cachedFirestore = firestoreByApp.get(app);
  if (cachedFirestore) return cachedFirestore;

  const firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
  firestoreByApp.set(app, firestore);
  return firestore;
}
