import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import { db } from "../shared/firebase.js";
import { getAdminRecipients, sendPushToRecipients } from "../shared/push-delivery.js";

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

    const admins = await getAdminRecipients();
    if (!admins.length) {
      console.warn(
        `[RequestNotifications] No active admin has registered a push token for request ${event.params.requestId}.`
      );
      return;
    }

    const results = await sendPushToRecipients(admins, {
      title: "New attendee request",
      body: `${request.type || "Help"} request from ${request.userName || "an attendee"}.`,
      data: {
        requestId: event.params.requestId,
        url: "/admin",
      },
      link: "/admin",
    });
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

    const profile = userSnapshot.docs[0].data();
    if (typeof profile.fcmToken !== "string" || !profile.fcmToken) {
      console.warn(
        `[RequestNotifications] Requester ${normalizedEmail} has no registered push token.`
      );
      return;
    }

    const results = await sendPushToRecipients(
      [{ email: normalizedEmail, token: profile.fcmToken }],
      {
        title: "Your request was updated",
        body: `An administrator updated your ${after.type || "help"} request. Status: ${after.status || "updated"}.`,
        data: {
          requestId: event.params.requestId,
          url: "/tabs/requests",
        },
        link: "/tabs/requests",
      }
    );
    const failure = results.find((result) => !result.success);
    if (failure) {
      console.error(
        `[RequestNotifications] Could not notify requester ${normalizedEmail} for request ${event.params.requestId}: ${failure.errorCode}`
      );
    }
  }
);
