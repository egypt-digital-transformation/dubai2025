import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getMessaging, db, CAMPAIGN_COLLECTION } from "../shared/firebase.js";
import { requireAuthenticatedUser } from "../shared/admin-auth.js";
import {
  emailDocumentId,
  matchesNotificationTarget,
  SEGMENT_FIELDS,
} from "../shared/notification-utils.js";

export const sendTargetedNotification = onCall(
  { region: "europe-west1" },
  async (request) => {
    requireAuthenticatedUser(request);

    const rawTitle = request.data?.title;
    const rawBody = request.data?.body;
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    const body = typeof rawBody === "string" ? rawBody.trim() : "";
    const target = request.data?.target;
    if (
      title.length < 1 ||
      title.length > 100 ||
      body.length < 1 ||
      body.length > 1000
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a notification title (up to 100 characters) and message (up to 1,000 characters)."
      );
    }
    if (
      !target ||
      !["all", "user", "segment"].includes(target.kind) ||
      (target.kind === "user" &&
        (typeof target.userId !== "string" || target.userId.length < 1)) ||
      (target.kind === "segment" &&
        (!SEGMENT_FIELDS.has(target.field) ||
          typeof target.value !== "string" ||
          target.value.length < 1 ||
          target.value.length > 100))
    ) {
      throw new HttpsError("invalid-argument", "Choose a valid notification audience.");
    }

    const attendeesSnapshot = await db.collection("users").get();
    const targets = attendeesSnapshot.docs.filter((attendeeDocument) =>
      matchesNotificationTarget(attendeeDocument, target)
    );
    const targetLabel =
      target.kind === "all"
        ? "All attendees"
        : target.kind === "user"
          ? targets.find((attendee) => attendee.id === target.userId)?.data()
              .email || "One attendee"
          : `${target.field}: ${target.value}`;
    const recipients = targets
      .map((attendeeDocument) => ({
        email: attendeeDocument.data().email?.trim(),
        token: attendeeDocument.data().fcmToken,
      }))
      .filter(
        (recipient) =>
          recipient.email &&
          typeof recipient.token === "string" &&
          recipient.token.length > 0
      );

    if (recipients.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "No attendees in this audience have registered for push notifications."
      );
    }

    const campaignRef = db.collection(CAMPAIGN_COLLECTION).doc();
    await campaignRef.set({
      title,
      body,
      target,
      targetLabel,
      targetCount: targets.length,
      pushReadyCount: recipients.length,
      acceptedCount: 0,
      failedCount: 0,
      openedCount: 0,
      status: "sending",
      createdAt: FieldValue.serverTimestamp(),
    });

    let acceptedCount = 0;
    let failedCount = 0;
    try {
      for (let index = 0; index < recipients.length; index += 500) {
        const batch = recipients.slice(index, index + 500);
        const response = await getMessaging().sendEachForMulticast({
          tokens: batch.map((recipient) => recipient.token),
          notification: { title, body },
          data: {
            campaignId: campaignRef.id,
            url: `/tabs/home?notificationCampaign=${campaignRef.id}`,
          },
          webpush: {
            fcmOptions: {
              link: `/tabs/home?notificationCampaign=${campaignRef.id}`,
            },
          },
        });

        acceptedCount += response.successCount;
        failedCount += response.failureCount;
        await Promise.all(
          response.responses.map((sendResult, recipientIndex) => {
            const recipient = batch[recipientIndex];
            return campaignRef
              .collection("deliveries")
              .doc(emailDocumentId(recipient.email))
              .set({
                emailHash: emailDocumentId(recipient.email),
                status: sendResult.success ? "accepted" : "failed",
                errorCode: sendResult.error?.code || null,
                openedAt: null,
              });
          })
        );
      }
    } catch (error) {
      await campaignRef.set(
        {
          acceptedCount,
          failedCount: recipients.length - acceptedCount,
          status: "failed",
        },
        { merge: true }
      );
      console.error("[AdminNotifications] Failed to send campaign:", error);
      throw new HttpsError("internal", "The push notification could not be sent.");
    }

    const status =
      failedCount === 0 ? "complete" : acceptedCount === 0 ? "failed" : "partial";
    await campaignRef.set(
      { acceptedCount, failedCount, status },
      { merge: true }
    );

    return {
      campaignId: campaignRef.id,
      targetCount: targets.length,
      pushReadyCount: recipients.length,
      acceptedCount,
      failedCount,
      status,
    };
  }
);

export const recordNotificationOpen = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const campaignId = request.data?.campaignId;
    if (typeof campaignId !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(campaignId)) {
      throw new HttpsError("invalid-argument", "A valid campaign ID is required.");
    }

    const campaignRef = db.collection(CAMPAIGN_COLLECTION).doc(campaignId);
    const deliveryRef = campaignRef
      .collection("deliveries")
      .doc(emailDocumentId(user.email));

    return db.runTransaction(async (transaction) => {
      const [campaignSnapshot, deliverySnapshot] = await Promise.all([
        transaction.get(campaignRef),
        transaction.get(deliveryRef),
      ]);
      if (!campaignSnapshot.exists || deliverySnapshot.data()?.status !== "accepted") {
        return { recorded: false };
      }
      if (deliverySnapshot.data()?.openedAt) {
        return { recorded: true, alreadyRecorded: true };
      }

      transaction.update(deliveryRef, { openedAt: FieldValue.serverTimestamp() });
      transaction.update(campaignRef, { openedCount: FieldValue.increment(1) });
      return { recorded: true, alreadyRecorded: false };
    });
  }
);
