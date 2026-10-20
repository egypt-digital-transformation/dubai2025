import { db, FCM_PROJECT_ID, getMessaging } from "./firebase.js";
import { matchesNotificationTarget } from "./notification-utils.js";

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
    results.push(
      ...response.responses.map((result, recipientIndex) => ({
        recipient: batch[recipientIndex],
        success: result.success,
        errorCode: result.error?.code || null,
      }))
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
    }))
    .filter(
      (recipient) =>
        typeof recipient.token === "string" &&
        recipient.token.length > 0 &&
        recipient.fcmProjectId === FCM_PROJECT_ID
    );
}
