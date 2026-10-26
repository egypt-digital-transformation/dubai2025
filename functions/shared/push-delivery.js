import {
  CAMPAIGN_COLLECTION,
  db,
  FCM_PROJECT_ID,
  FieldValue,
  getMessaging,
  Timestamp,
} from "./firebase.js";
import {
  emailDocumentId,
  matchesNotificationTarget,
  tokenFingerprint,
} from "./notification-utils.js";
import { getRegisteredPushDevices } from "./push-tokens.js";

const INVALID_REGISTRATION_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

async function removeInvalidToken(recipient) {
  if (!recipient.tokenOwner || !recipient.token) {
    return false;
  }

  const ownerRef = db
    .collection(recipient.tokenOwner.collection)
    .doc(recipient.tokenOwner.id);
  const invalidated = await db.runTransaction(async (transaction) => {
    const ownerSnapshot = await transaction.get(ownerRef);
    if (!ownerSnapshot.exists) {
      return false;
    }

    const ownerData = ownerSnapshot.data();
    if (recipient.isLegacy) {
      if (ownerData.fcmToken !== recipient.token) {
        return false;
      }
      transaction.update(ownerRef, {
        fcmToken: FieldValue.delete(),
        fcmProjectId: FieldValue.delete(),
        fcmTokenInvalidatedHash: tokenFingerprint(recipient.token),
        fcmTokenInvalidatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    }

    const devices = Array.isArray(ownerData.devices) ? ownerData.devices : [];
    const deviceIndex = devices.findIndex((device) => {
      const deviceId =
        typeof device.deviceId === "string" && device.deviceId
          ? device.deviceId
          : `legacy-${tokenFingerprint(device.token || "").slice(0, 16)}`;
      return deviceId === recipient.deviceId && device.token === recipient.token;
    });
    if (deviceIndex < 0) {
      return false;
    }

    const invalidatedDevice = {
      ...devices[deviceIndex],
      invalidatedTokenHash: tokenFingerprint(recipient.token),
      invalidatedAt: Timestamp.now(),
    };
    delete invalidatedDevice.token;
    delete invalidatedDevice.fcmProjectId;
    const updatedDevices = [...devices];
    updatedDevices[deviceIndex] = invalidatedDevice;
    transaction.update(ownerRef, { devices: updatedDevices });
    return true;
  });

  if (invalidated) {
    console.info(
      `[PushDelivery] Invalidated stale FCM registration for ${recipient.email} ` +
      `(device ${recipient.deviceId || "legacy"})`
    );
  }
  return invalidated;
}

function recipientsFromDocument(document, collection) {
  const data = document.data();
  const email = String(
    data.emailAddress || data.email || document.id
  ).trim();
  return getRegisteredPushDevices(data).map((device) => ({
    id: document.id,
    email,
    ...device,
    tokenOwner: {
      collection,
      id: document.id,
    },
  }));
}

export function getPushRecipientsForUser(userDocument) {
  return recipientsFromDocument(userDocument, "users");
}

export async function getTargetRecipients(target) {
  const attendeesSnapshot = await db.collection("users").get();
  const targets = attendeesSnapshot.docs.filter((attendeeDocument) =>
    matchesNotificationTarget(attendeeDocument, target)
  );
  const recipients = targets.flatMap((attendeeDocument) =>
    recipientsFromDocument(attendeeDocument, "users")
  );

  return { targetCount: targets.length, recipients, users: targets };
}

export async function recordInAppNotification({
  id,
  title,
  body,
  targetLabel,
  emails,
  link,
  metadata = {},
}) {
  const normalizedEmails = [
    ...new Set(
      emails
        .filter((email) => typeof email === "string")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  if (!normalizedEmails.length) {
    return null;
  }

  const campaignRef = id
    ? db.collection(CAMPAIGN_COLLECTION).doc(id)
    : db.collection(CAMPAIGN_COLLECTION).doc();
  await campaignRef.set(
    {
      title,
      body,
      ...(targetLabel ? { targetLabel } : {}),
      targetCount: normalizedEmails.length,
      inAppCount: normalizedEmails.length,
      pushReadyCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      status: "complete",
      createdAt: FieldValue.serverTimestamp(),
      ...metadata,
    },
    { merge: true }
  );

  for (let offset = 0; offset < normalizedEmails.length; offset += 500) {
    const batch = db.batch();
    for (const email of normalizedEmails.slice(offset, offset + 500)) {
      const deliveryRef = campaignRef
        .collection("deliveries")
        .doc(`in-app-${emailDocumentId(email)}`);
      batch.set(
        deliveryRef,
        {
          emailHash: emailDocumentId(email),
          deviceHash: "in-app",
          status: "accepted",
          errorCode: null,
          title,
          body,
          link: link || null,
          receivedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
  return campaignRef.id;
}

export async function updateInAppNotificationPushSummary(
  campaignId,
  recipients,
  results
) {
  const acceptedCount = results.filter((result) => result.success).length;
  const failedCount =
    results.length > 0 ? results.length - acceptedCount : recipients.length;
  const status =
    !recipients.length || acceptedCount === 0
      ? "in_app"
      : failedCount
        ? "partial"
        : "complete";
  await db.collection(CAMPAIGN_COLLECTION).doc(campaignId).set(
    {
      pushReadyCount: new Set(recipients.map((recipient) => recipient.id)).size,
      acceptedCount,
      failedCount,
      status,
    },
    { merge: true }
  );
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
    messageData.title = title;
    messageData.body = body;
    if (link && !messageData.url) {
      messageData.url = link;
    }
    const message = {
      tokens: batch.map((recipient) => recipient.token),
      data: messageData,
    };
    const response = await getMessaging().sendEachForMulticast(message);
    const batchResults = response.responses.map((result, recipientIndex) => {
      if (!result.success) {
        console.warn(
          `[PushDelivery] Push failed for recipient ${batch[recipientIndex].email} ` +
          `(device ${batch[recipientIndex].deviceId || "legacy"}):`,
          result.error?.code
        );
      }
      return {
        recipient: batch[recipientIndex],
        success: result.success,
        errorCode: result.error?.code || null,
        messageId: result.messageId || null,
      };
    });
    results.push(...batchResults);
    await Promise.all(
      batchResults
        .filter((result) =>
          INVALID_REGISTRATION_TOKEN_CODES.has(result.errorCode)
        )
        .map(async ({ recipient, errorCode }) => {
          try {
            await removeInvalidToken(recipient);
          } catch (error) {
            console.error(
              `[PushDelivery] Failed to invalidate FCM registration for ${recipient.email} ` +
              `(device ${recipient.deviceId || "legacy"}, ${errorCode}):`,
              error?.message || String(error)
            );
          }
        })
    );
  }

  return results;
}

export async function getAdminRecipients() {
  const adminsSnapshot = await db.collection("admins")
    .where("active", "==", true)
    .get();
  return adminsSnapshot.docs.flatMap((adminDocument) =>
    recipientsFromDocument(adminDocument, "admins")
  );
}

export async function getActiveAdminEmails() {
  const adminsSnapshot = await db.collection("admins")
    .where("active", "==", true)
    .get();
  return adminsSnapshot.docs
    .map((adminDocument) => {
      const data = adminDocument.data();
      return String(data.emailAddress || data.email || adminDocument.id)
        .trim()
        .toLowerCase();
    })
    .filter(Boolean);
}
