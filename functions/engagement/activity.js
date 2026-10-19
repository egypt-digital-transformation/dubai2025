import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  APP_ANALYTICS_COLLECTION,
  db,
  FieldValue,
} from "../shared/firebase.js";
import { requireAuthenticatedUser } from "../shared/admin-auth.js";

export const listSharedContactCards = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const email = user.email.trim().toLowerCase();
    const adminSnapshot = await db.collection("admins").doc(email).get();

    if (adminSnapshot.data()?.active !== true) {
      const usersRef = db.collection("users");
      let profileSnapshot = await usersRef
        .where("emailAddress", "==", email)
        .limit(2)
        .get();
      if (profileSnapshot.empty) {
        profileSnapshot = await usersRef
          .where("email", "==", email)
          .limit(2)
          .get();
      }
      if (profileSnapshot.empty && email !== user.email) {
        profileSnapshot = await usersRef
          .where("emailAddress", "==", user.email)
          .limit(2)
          .get();
      }
      if (profileSnapshot.empty && email !== user.email) {
        profileSnapshot = await usersRef
          .where("email", "==", user.email)
          .limit(2)
          .get();
      }
      if (profileSnapshot.size !== 1) {
        throw new HttpsError(
          "permission-denied",
          "An attendee profile is required to view the directory."
        );
      }
    }

    const contactsSnapshot = await db
      .collection("users")
      .where("shareContactCard", "==", true)
      .get();
    const contacts = contactsSnapshot.docs
      .map((document) => {
        const data = document.data();
        const value = (field) =>
          typeof data[field] === "string" ? data[field].trim() : "";
        const firstName = value("firstName");
        const lastName = value("lastName");
        const mobileFields = [
          "mobileNumber",
          "mobile",
          "mobileNo",
          "phoneNumber",
          "phone",
          "phoneNo",
          "telephone",
          "contactNumber",
          "Mobile Number",
          "Phone Number",
        ];

        return {
          name:
            [firstName, lastName].filter(Boolean).join(" ") ||
            value("displayName") ||
            "Attendee",
          email: value("emailAddress") || value("email"),
          mobile: mobileFields.map(value).find(Boolean) || "",
          position: value("currentPosition"),
        };
      })
      .filter((contact) => contact.email);

    return { contacts };
  }
);

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
