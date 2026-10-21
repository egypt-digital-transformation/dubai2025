import { db, FCM_PROJECT_ID, FieldValue, getMessaging } from "./firebase.js";
import {
  matchesNotificationTarget,
  tokenFingerprint,
} from "./notification-utils.js";

const INVALID_REGISTRATION_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

async function removeInvalidToken(recipient) {
  if (!recipient.tokenOwner || !recipient.token) {
    return;
  }

  const ownerRef = db
    .collection(recipient.tokenOwner.collection)
    .doc(recipient.tokenOwner.id);
  await db.runTransaction(async (transaction) => {
    const ownerSnapshot = await transaction.get(ownerRef);
    if (!ownerSnapshot.exists || ownerSnapshot.data()?.fcmToken !== recipient.token) {
      return;
    }

    transaction.update(ownerRef, {
      fcmToken: FieldValue.delete(),
      fcmProjectId: FieldValue.delete(),
      fcmTokenInvalidatedHash: tokenFingerprint(recipient.token),
      fcmTokenInvalidatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function getTargetRecipients(target) {
  const attendeesSnapshot = await db.collection("users").get();
  const targets = attendeesSnapshot.docs.filter((attendeeDocument) =>
    matchesNotificationTarget(attendeeDocument, target)
  );
  const recipients = targets
    .map((attendeeDocument) => ({
      id: attendeeDocument.id,
      email: String(
        attendeeDocument.data().emailAddress ||
        attendeeDocument.data().email ||
        attendeeDocument.id
      ).trim(),
      token: attendeeDocument.data().fcmToken,
      fcmProjectId: attendeeDocument.data().fcmProjectId,
      tokenOwner: { collection: "users", id: attendeeDocument.id },
    }))
    .filter(
      (recipient) =>
        recipient.email &&
        typeof recipient.token === "string" &&
        recipient.token.length > 0 &&
        recipient.fcmProjectId === FCM_PROJECT_ID
    );

  return { targetCount: targets.length, recipients };
}

export async function sendPushToRecipients(recipients, { title, body, data = {}, link }) {
  const results = [];
  for (let index = 0; index < recipients.length; index += 500) {
    const batch = recipients.slice(index, index + 500);
    const messageData = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        typeof value === "string" ? value : JSON.stringify(value),
      ])
    );
    const message = {
      tokens: batch.map((recipient) => recipient.token),
      notification: { title, body },
      data: messageData,
    };
    if (link) {
      message.webpush = { fcmOptions: { link } };
    }
    const response = await getMessaging().sendEachForMulticast(message);
    const batchResults = response.responses.map((result, recipientIndex) => ({
      recipient: batch[recipientIndex],
      success: result.success,
      errorCode: result.error?.code || null,
    }));
    results.push(...batchResults);
    await Promise.all(
      batchResults
        .filter((result) =>
          INVALID_REGISTRATION_TOKEN_CODES.has(result.errorCode)
        )
        .map(({ recipient, errorCode }) =>
          removeInvalidToken(recipient).catch((error) => {
            console.error(
              `[PushDelivery] Failed to remove an invalid token (${errorCode}):`,
              error
            );
          })
        )
    );
  }

  return results;
}

export async function getAdminRecipients() {
  const adminsSnapshot = await db.collection("admins")
    .where("active", "==", true)
    .get();
  return adminsSnapshot.docs
    .map((adminDocument) => ({
      email: adminDocument.id,
      token: adminDocument.data().fcmToken,
      fcmProjectId: adminDocument.data().fcmProjectId,
      tokenOwner: { collection: "admins", id: adminDocument.id },
    }))
    .filter(
      (recipient) =>
        typeof recipient.token === "string" &&
        recipient.token.length > 0 &&
        recipient.fcmProjectId === FCM_PROJECT_ID
    );
}
