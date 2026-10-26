import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import { db, FCM_PROJECT_ID } from "../shared/firebase.js";
import {
  emailDocumentId,
} from "../shared/notification-utils.js";
import {
  getActiveAdminEmails,
  getAdminRecipients,
  getPushRecipientsForUser,
  recordInAppNotification,
  sendPushToRecipients,
  updateInAppNotificationPushSummary,
} from "../shared/push-delivery.js";

export const notifyAdminsOfNewRequest = onDocumentCreated(
  {
    document: "requests/{requestId}",
    region: "europe-west1",
  },
  async (event) => {
    const request = event.data?.data();
    if (!request) {
      return;
    }

    const [admins, adminEmails] = await Promise.all([
      getAdminRecipients(),
      getActiveAdminEmails(),
    ]);
    if (!adminEmails.length) {
      console.warn(
        `[RequestNotifications] No active admin inbox is available for request ${event.params.requestId}.`
      );
      return;
    }

    const title = "New attendee request";
    const body = `${request.type || "Help"} request from ${request.userName || "an attendee"}.`;
    const campaignId = emailDocumentId(`request-created:${event.id}`);
    const link = `/admin?section=requests&notificationCampaign=${campaignId}`;
    await recordInAppNotification({
      id: campaignId,
      title,
      body,
      targetLabel: "Active administrators",
      emails: adminEmails,
      link,
      metadata: { isRequestNotification: true },
    });
    if (!admins.length) {
      await updateInAppNotificationPushSummary(campaignId, admins, []);
      console.warn(
        `[RequestNotifications] Admin inboxes saved without push tokens for request ${event.params.requestId}.`
      );
      return;
    }

    let results = [];
    try {
      results = await sendPushToRecipients(admins, {
        title,
        body,
        data: {
          campaignId,
          requestId: event.params.requestId,
          url: link,
        },
        link,
      });
    } catch (error) {
      console.error(
        `[RequestNotifications] Push delivery failed for request ${event.params.requestId}; inbox notifications were saved:`,
        error
      );
    }
    await updateInAppNotificationPushSummary(campaignId, admins, results);
    const failures = results.filter((result) => !result.success);
    if (failures.length) {
      console.error(
        `[RequestNotifications] Could not notify ${failures.length} admin device(s) for request ${event.params.requestId}.`,
        failures.map((failure) => failure.errorCode)
      );
    }
  }
);

export const notifyUserOfRequestUpdate = onDocumentUpdated(
  {
    document: "requests/{requestId}",
    region: "europe-west1",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (
      !before ||
      !after ||
      (before.status === after.status &&
        before.adminComment === after.adminComment)
    ) {
      return;
    }

    const normalizedEmail = String(after.userEmail || "").trim().toLowerCase();
    if (!normalizedEmail) {
      console.warn(
        `[RequestNotifications] Request ${event.params.requestId} has no requester email.`
      );
      return;
    }

    const users = db.collection("users");
    let userSnapshot = await users.where("email", "==", normalizedEmail).limit(2).get();
    if (userSnapshot.empty) {
      userSnapshot = await users
        .where("emailAddress", "==", normalizedEmail)
        .limit(2)
        .get();
    }
    if (userSnapshot.empty && after.userEmail !== normalizedEmail) {
      userSnapshot = await users
        .where("email", "==", after.userEmail)
        .limit(2)
        .get();
    }
    if (userSnapshot.size !== 1) {
      console.warn(
        `[RequestNotifications] Could not uniquely match requester ${normalizedEmail} to a user profile.`
      );
      return;
    }

    const userDocument = userSnapshot.docs[0];
    const recipients = getPushRecipientsForUser(userDocument);
    const title = "Your request was updated";
    const body = `An administrator updated your ${after.type || "help"} request. Status: ${after.status || "updated"}.`;
    const campaignId = emailDocumentId(`request-updated:${event.id}`);
    const link = `/tabs/requests?notificationCampaign=${campaignId}`;
    await recordInAppNotification({
      id: campaignId,
      title,
      body,
      targetLabel: "Request update",
      emails: [normalizedEmail],
      link,
      metadata: { isRequestNotification: true },
    });
    if (!recipients.length) {
      await updateInAppNotificationPushSummary(campaignId, recipients, []);
      console.warn(
        `[RequestNotifications] Request update saved to ${normalizedEmail}'s inbox; no push token for project ${FCM_PROJECT_ID}.`
      );
      return;
    }

    let results = [];
    try {
      results = await sendPushToRecipients(recipients, {
        title,
        body,
        data: {
          campaignId,
          requestId: event.params.requestId,
          url: link,
        },
        link,
      });
    } catch (error) {
      console.error(
        `[RequestNotifications] Push delivery failed for requester ${normalizedEmail}; inbox notification was saved:`,
        error
      );
    }
    await updateInAppNotificationPushSummary(campaignId, recipients, results);
    const failure = results.find((result) => !result.success);
    if (failure) {
      console.error(
        `[RequestNotifications] Could not notify requester ${normalizedEmail} for request ${event.params.requestId}: ${failure.errorCode}`
      );
    }
  }
);
