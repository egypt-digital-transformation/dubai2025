import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  APP_ANALYTICS_COLLECTION,
  db,
  FCM_PROJECT_ID,
  FieldValue,
  Timestamp,
} from "../shared/firebase.js";
import { requireAuthenticatedUser } from "../shared/admin-auth.js";
import { tokenFingerprint } from "../shared/notification-utils.js";

async function findDelegateProfiles(email) {
  const users = db.collection("users");
  const normalizedEmail = email.trim().toLowerCase();
  const findByEmail = async (value) => {
    const snapshots = await Promise.all([
      users.where("email", "==", value).get(),
      users.where("emailAddress", "==", value).get(),
    ]);
    return new Map(
      snapshots.flatMap((snapshot) =>
        snapshot.docs.map((userDocument) => [userDocument.id, userDocument])
      )
    );
  };

  let profiles = await findByEmail(normalizedEmail);
  if (!profiles.size && email.trim() !== normalizedEmail) {
    profiles = await findByEmail(email.trim());
  }
  if (!profiles.size) {
    for (const documentId of new Set([email.trim(), normalizedEmail])) {
      if (!documentId) {
        continue;
      }
      const profile = await users.doc(documentId).get();
      if (profile.exists) {
        profiles.set(profile.id, profile);
      }
    }
  }

  return [...profiles.values()];
}

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
    const profiles = await findDelegateProfiles(user.email);
    if (profiles.length > 1) {
      throw new HttpsError(
        "failed-precondition",
        "Your delegate profile matched more than one record."
      );
    }
    const profileId = profiles[0]?.id;

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(activityRef);
      const activity = {
        uid: user.uid,
        email: user.email,
        lastActiveAt: FieldValue.serverTimestamp(),
        ...(profileId ? { profileId } : {}),
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
    const deviceId = request.data?.deviceId;
    if (
      typeof deviceId !== "string" ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)
    ) {
      throw new HttpsError("invalid-argument", "A valid device identifier is required.");
    }

    const normalizedEmail = user.email.trim().toLowerCase();
    const adminRef = db.collection("admins").doc(normalizedEmail);
    const adminSnapshot = await adminRef.get();
    const isActiveAdmin = adminSnapshot.data()?.active === true;
    const profiles = await findDelegateProfiles(user.email);
    if (profiles.length > 1) {
      throw new HttpsError(
        "failed-precondition",
        "Your delegate profile matched more than one record."
      );
    }

    if (!profiles.length && !isActiveAdmin) {
      throw new HttpsError(
        "failed-precondition",
        "Your delegate profile could not be uniquely matched."
      );
    }

    const submittedTokenHash = tokenFingerprint(token);
    const ownerRefs = [
      ...(isActiveAdmin ? [adminRef] : []),
      ...profiles.map((profile) => profile.ref),
    ];
    const refreshRequired = await db.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(
        ownerRefs.map((ownerRef) => transaction.get(ownerRef))
      );
      const refreshRequired = snapshots.some((snapshot) => {
        const ownerData = snapshot.data() || {};
        const devices = Array.isArray(ownerData.devices)
          ? ownerData.devices
          : [];
        const existingDevice = devices.find(
          (device) => device.deviceId === deviceId
        );
        return (
          devices.some(
            (device) => device.invalidatedTokenHash === submittedTokenHash
          ) ||
          (!existingDevice &&
            ownerData.fcmTokenInvalidatedHash === submittedTokenHash)
        );
      });
      if (refreshRequired) {
        return true;
      }

      snapshots.forEach((snapshot, index) => {
        const ownerRef = ownerRefs[index];
        const ownerData = snapshot.data() || {};
        const devices = Array.isArray(ownerData.devices)
          ? ownerData.devices
          : [];
        const existingDevice = devices.find(
          (device) => device.deviceId === deviceId
        );
        if (
          existingDevice?.token === token &&
          existingDevice.fcmProjectId === FCM_PROJECT_ID &&
          !existingDevice.invalidatedTokenHash
        ) {
          return;
        }
        const migratedLegacyDevice =
          typeof ownerData.fcmToken === "string" &&
          ownerData.fcmToken.length > 0 &&
          ownerData.fcmToken !== token &&
          ownerData.fcmProjectId === FCM_PROJECT_ID
            ? {
                deviceId: `legacy-${tokenFingerprint(ownerData.fcmToken).slice(0, 16)}`,
                token: ownerData.fcmToken,
                fcmProjectId: ownerData.fcmProjectId,
                platform: "web",
                updatedAt:
                  ownerData.fcmTokenUpdatedAt?.toDate?.() || Timestamp.now(),
              }
            : null;
        const retainedDevices = devices.filter(
          (device) => device.deviceId !== deviceId && device.token !== token
        );
        if (
          migratedLegacyDevice &&
          !retainedDevices.some(
            (device) => device.token === migratedLegacyDevice.token
          )
        ) {
          retainedDevices.push(migratedLegacyDevice);
        }
        const registeredDevice = {
          ...(existingDevice || {}),
          deviceId,
          token,
          fcmProjectId: FCM_PROJECT_ID,
          platform: "web",
          updatedAt: Timestamp.now(),
        };
        delete registeredDevice.invalidatedTokenHash;
        delete registeredDevice.invalidatedAt;
        retainedDevices.push(registeredDevice);

        transaction.set(
          ownerRef,
          {
            devices: retainedDevices,
            fcmToken: FieldValue.delete(),
            fcmProjectId: FieldValue.delete(),
            fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
            fcmTokenInvalidatedHash: FieldValue.delete(),
            fcmTokenInvalidatedAt: FieldValue.delete(),
          },
          { merge: true }
        );
      });
      return false;
    });

    if (refreshRequired) {
      console.warn(
        `[PushToken] Device ${deviceId} for ${user.email} submitted an invalidated FCM token; ` +
        "client refresh required"
      );
      return { registered: false, refreshRequired: true };
    }

    return { registered: true };
  }
);

export const verifyUserAccess = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const email = (user.email || "").trim().toLowerCase();
    if (!email) {
      throw new HttpsError("unauthenticated", "A valid email is required.");
    }

    // 1. Check if user is an active administrator
    const adminSnapshot = await db.collection("admins").doc(email).get();
    if (adminSnapshot.exists && adminSnapshot.data()?.active === true) {
      return { allowed: true, role: "admin" };
    }

    // 2. Check if user exists in the registered users (attendees) collection
    const profiles = await findDelegateProfiles(email);
    if (profiles.length > 0) {
      return { allowed: true, role: "delegate" };
    }

    return { allowed: false, role: null };
  }
);
