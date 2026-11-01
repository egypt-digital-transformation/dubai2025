import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db, FCM_PROJECT_ID } from "../shared/firebase.js";
import { emailDocumentId } from "../shared/notification-utils.js";
import {
  getPushRecipientsForUser,
  recordInAppNotification,
  sendPushToRecipients,
  updateInAppNotificationPushSummary,
} from "../shared/push-delivery.js";
import { hasDetailsChanged } from "./accommodation-notification-utils.js";

async function notifyAttendeeOfTravelDetails(event, {
  collectionName,
  fields,
  category,
  title,
  body,
  metadata,
}) {
  const before = event.data ? event.data.before.data() : undefined;
  const after = event.data ? event.data.after.data() : undefined;
  if (!hasDetailsChanged(before, after, fields)) {
    return;
  }

  const userDocument = await db.collection("users").doc(event.params.userId).get();
  if (!userDocument.exists) {
    console.warn(
      `[${collectionName}] Could not find attendee ${event.params.userId} for ${category} update.`
    );
    return;
  }

  const user = userDocument.data();
  const email = String(
    user.emailAddress || user.email || event.params.userId
  ).trim();
  if (!email) {
    console.warn(
      `[${collectionName}] Attendee ${event.params.userId} has no email for ${category} update.`
    );
    return;
  }

  const recipients = getPushRecipientsForUser(userDocument);
  const campaignId = emailDocumentId(`${category}:${event.id}`);
  const link = `/tabs/journey?notificationCampaign=${campaignId}`;
  await recordInAppNotification({
    id: campaignId,
    title,
    body,
    targetLabel: category,
    emails: [email],
    link,
    metadata,
  });

  let results = [];
  if (recipients.length) {
    try {
      results = await sendPushToRecipients(recipients, {
        title,
        body,
        data: { campaignId, url: link },
        link,
      });
    } catch (error) {
      console.error(
        `[${collectionName}] Push delivery failed for attendee ${event.params.userId}; in-app notification was saved:`,
        error
      );
    }
  } else {
    console.info(
      `[${collectionName}] In-app notification saved for ${email}; no push token is registered for ${FCM_PROJECT_ID}.`
    );
  }

  await updateInAppNotificationPushSummary(campaignId, recipients, results);
  const failures = results.filter((result) => !result.success);
  if (failures.length) {
    console.error(
      `[${collectionName}] Could not notify ${failures.length} device(s) for attendee ${event.params.userId}.`,
      failures.map((failure) => failure.errorCode)
    );
  }
}

export const notifyUserOfRoomAssignment = onDocumentWritten(
  {
    document: "users/{userId}/accommodation/details",
    region: "europe-west1",
  },
  (event) =>
    notifyAttendeeOfTravelDetails(event, {
      collectionName: "AccommodationNotifications",
      fields: ["roomNumber"],
      category: "room-assignment",
      title: "Your room assignment is ready",
      body: "Your accommodation details are available in My Journey.",
      metadata: { isAccommodationNotification: true },
    })
);

export const notifyUserOfCarDetails = onDocumentWritten(
  {
    document: "users/{userId}/cardata/details",
    region: "europe-west1",
  },
  (event) =>
    notifyAttendeeOfTravelDetails(event, {
      collectionName: "CarTransferNotifications",
      fields: ["carModel", "licensePlate"],
      category: "car-transfer-details",
      title: "Your car transfer details are ready",
      body: "Your car transfer details are available in My Journey.",
      metadata: { isCarTransferNotification: true },
    })
);

export const notifyUserOfMeetAndGreetDetails = onDocumentWritten(
  {
    document: "users/{userId}/meet&greetrepresentative/details",
    region: "europe-west1",
  },
  (event) =>
    notifyAttendeeOfTravelDetails(event, {
      collectionName: "MeetAndGreetNotifications",
      fields: ["name", "phoneNumber"],
      category: "meet-and-greet-details",
      title: "Your Meet & Greet details are ready",
      body: "Your representative's name and phone number are available in My Journey.",
      metadata: { isMeetAndGreetNotification: true },
    })
);
