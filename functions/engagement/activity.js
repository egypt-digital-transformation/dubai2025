import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  APP_ANALYTICS_COLLECTION,
  db,
  FieldValue,
} from "../shared/firebase.js";
import { requireAuthenticatedUser } from "../shared/admin-auth.js";

export const recordAppActivity = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const installed = request.data?.installed === true;
    const activityRef = db.collection(APP_ANALYTICS_COLLECTION).doc(user.uid);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(activityRef);
      const activity = {
        uid: user.uid,
        email: user.email,
        lastActiveAt: FieldValue.serverTimestamp(),
      };

      if (!snapshot.exists) {
        activity.firstLoginAt = FieldValue.serverTimestamp();
      }
      if (installed && !snapshot.data()?.installedAt) {
        activity.installedAt = FieldValue.serverTimestamp();
      }

      transaction.set(activityRef, activity, { merge: true });
    });

    return { recorded: true };
  }
);

export const registerPushToken = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const token = request.data?.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
      throw new HttpsError("invalid-argument", "A valid push token is required.");
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    const usersRef = db.collection("users");
    let userSnapshot = await usersRef.where("email", "==", normalizedEmail).get();
    if (userSnapshot.empty && user.email !== normalizedEmail) {
      userSnapshot = await usersRef.where("email", "==", user.email).get();
    }
    if (userSnapshot.size !== 1) {
      throw new HttpsError(
        "failed-precondition",
        "Your delegate profile could not be uniquely matched."
      );
    }

    await userSnapshot.docs[0].ref.set(
      {
        fcmToken: token,
        fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { registered: true };
  }
);
