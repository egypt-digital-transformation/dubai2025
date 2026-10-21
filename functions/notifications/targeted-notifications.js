import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  FieldValue,
  db,
  CAMPAIGN_COLLECTION,
  Timestamp,
} from "../shared/firebase.js";
import { requireAdminUser, requireAuthenticatedUser } from "../shared/admin-auth.js";
import {
  emailDocumentId,
  SEGMENT_FIELDS,
  tokenFingerprint,
} from "../shared/notification-utils.js";
import {
  getTargetRecipients,
  sendPushToRecipients,
} from "../shared/push-delivery.js";

function validateNotification(request) {
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
    !["all", "user", "users", "segment"].includes(target.kind) ||
    (target.kind === "user" &&
      (typeof target.userId !== "string" || target.userId.length < 1)) ||
    (target.kind === "users" &&
      (!Array.isArray(target.userIds) ||
        target.userIds.length < 1 ||
        target.userIds.length > 5000 ||
        target.userIds.some((userId) => typeof userId !== "string" || !userId.length))) ||
    (target.kind === "segment" &&
      (!SEGMENT_FIELDS.has(target.field) ||
        typeof target.value !== "string" ||
        target.value.length < 1 ||
        target.value.length > 100))
  ) {
    throw new HttpsError("invalid-argument", "Choose a valid notification audience.");
  }

  return { title, body, target };
}

function getTargetLabel(target, recipients) {
  if (target.kind === "all") {
    return "All attendees";
  }
  if (target.kind === "user") {
    return recipients.find((recipient) => recipient.id === target.userId)?.email ||
      "One attendee";
  }
  if (target.kind === "users") {
    return `${target.userIds.length} selected users`;
  }
  return `${target.field}: ${target.value}`;
}

async function createCampaign(title, body, target, scheduledAt = null) {
  const { targetCount, recipients } = await getTargetRecipients(target);
  if (!recipients.length) {
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
    targetLabel: getTargetLabel(target, recipients),
    targetCount,
    pushReadyCount: new Set(recipients.map((recipient) => recipient.id)).size,
    acceptedCount: 0,
    failedCount: 0,
    openedCount: 0,
    status: scheduledAt ? "scheduled" : "sending",
    scheduledAt,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { campaignRef, targetCount, recipients };
}

async function deliverCampaign(campaignRef, campaign, recipients) {
  let acceptedCount = 0;
  let failedCount = 0;
  try {
    const results = await sendPushToRecipients(recipients, {
      title: campaign.title,
      body: campaign.body,
      data: {
        campaignId: campaignRef.id,
        url: `/tabs/home?notificationCampaign=${campaignRef.id}`,
      },
      link: `/tabs/home?notificationCampaign=${campaignRef.id}`,
    });
    acceptedCount = results.filter((result) => result.success).length;
    failedCount = results.length - acceptedCount;
    await Promise.all(
      results.map(({ recipient, success, errorCode }) =>
        campaignRef
          .collection("deliveries")
          .doc(
            emailDocumentId(
              `${recipient.email}:${tokenFingerprint(recipient.token)}`
            )
          )
          .set({
            emailHash: emailDocumentId(recipient.email),
            deviceHash: tokenFingerprint(recipient.token),
            status: success ? "accepted" : "failed",
            errorCode,
            openedAt: null,
          })
      )
    );
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
    throw error;
  }

  const status =
    failedCount === 0 ? "complete" : acceptedCount === 0 ? "failed" : "partial";
  await campaignRef.set(
    { acceptedCount, failedCount, status },
    { merge: true }
  );
  return { acceptedCount, failedCount, status };
}

export const sendTargetedNotification = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);
    const { title, body, target } = validateNotification(request);
    const { campaignRef, targetCount, recipients } = await createCampaign(
      title,
      body,
      target
    );

    try {
      const result = await deliverCampaign(
        campaignRef,
        { title, body },
        recipients
      );
      return {
        campaignId: campaignRef.id,
        targetCount,
        pushReadyCount: new Set(recipients.map((recipient) => recipient.id)).size,
        ...result,
      };
    } catch (error) {
      console.error("[sendTargetedNotification] Delivery failed:", error);
      throw new HttpsError(
        "internal",
        error?.message || "The push notification could not be sent."
      );
    }
  }
);

export const scheduleTargetedNotification = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);
    const { title, body, target } = validateNotification(request);
    const scheduledAtValue = request.data?.scheduledAt;
    const scheduledAtMs =
      typeof scheduledAtValue === "string" ? Date.parse(scheduledAtValue) : NaN;
    if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
      throw new HttpsError(
        "invalid-argument",
        "Choose a valid future send time."
      );
    }

    const scheduledAt = Timestamp.fromMillis(scheduledAtMs);
    const { campaignRef, targetCount, recipients } = await createCampaign(
      title,
      body,
      target,
      scheduledAt
    );
    return {
      campaignId: campaignRef.id,
      targetCount,
      pushReadyCount: new Set(recipients.map((recipient) => recipient.id)).size,
      status: "scheduled",
      scheduledAt: scheduledAt.toDate().toISOString(),
    };
  }
);

export const dispatchScheduledNotifications = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
  },
  async () => {
    const now = Timestamp.now();
    const dueCampaigns = await db
      .collection(CAMPAIGN_COLLECTION)
      .where("status", "==", "scheduled")
      .where("scheduledAt", "<=", now)
      .limit(50)
      .get();

    for (const campaignDocument of dueCampaigns.docs) {
      const campaignRef = campaignDocument.ref;
      const claimed = await db.runTransaction(async (transaction) => {
        const freshCampaign = await transaction.get(campaignRef);
        if (freshCampaign.data()?.status !== "scheduled") {
          return false;
        }
        transaction.update(campaignRef, {
          status: "sending",
          sendingAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!claimed) {
        continue;
      }

      const campaign = campaignDocument.data();
      try {
        const { targetCount, recipients } = await getTargetRecipients(
          campaign.target
        );
        if (!recipients.length) {
          await campaignRef.set(
            {
              targetCount,
              pushReadyCount: 0,
              acceptedCount: 0,
              failedCount: 0,
              status: "failed",
              failureReason: "No audience members have push notifications enabled.",
            },
            { merge: true }
          );
          continue;
        }
        await campaignRef.set(
          {
            targetCount,
            pushReadyCount: new Set(
              recipients.map((recipient) => recipient.id)
            ).size,
          },
          { merge: true }
        );
        await deliverCampaign(campaignRef, campaign, recipients);
      } catch (error) {
        console.error(
          `[AdminNotifications] Failed to deliver scheduled campaign ${campaignRef.id}:`,
          error
        );
        await campaignRef.set(
          { status: "failed", failureReason: "Push delivery failed." },
          { merge: true }
        );
      }
    }
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
    const deliveriesQuery = campaignRef
      .collection("deliveries")
      .where("emailHash", "==", emailDocumentId(user.email));

    return db.runTransaction(async (transaction) => {
      const [campaignSnapshot, deliveriesSnapshot] = await Promise.all([
        transaction.get(campaignRef),
        transaction.get(deliveriesQuery),
      ]);
      const deliveries = deliveriesSnapshot.docs.filter(
        (delivery) => delivery.data().status === "accepted"
      );
      if (!campaignSnapshot.exists || !deliveries.length) {
        return { recorded: false };
      }
      const unopenedDelivery = deliveries.find(
        (delivery) => !delivery.data().openedAt
      );
      if (!unopenedDelivery) {
        return { recorded: true, alreadyRecorded: true };
      }

      transaction.update(unopenedDelivery.ref, {
        openedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(campaignRef, { openedCount: FieldValue.increment(1) });
      return { recorded: true, alreadyRecorded: false };
    });
  }
);

export const listUserNotifications = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const deliveriesSnapshot = await db
      .collectionGroup("deliveries")
      .where("emailHash", "==", emailDocumentId(user.email))
      .where("status", "==", "accepted")
      .get();
    const campaignsById = new Map();

    for (const delivery of deliveriesSnapshot.docs) {
      const data = delivery.data();
      const campaignRef = delivery.ref.parent.parent;
      if (!campaignRef) {
        continue;
      }

      const existing = campaignsById.get(campaignRef.id);
      campaignsById.set(campaignRef.id, {
        ref: campaignRef,
        opened: Boolean(data.openedAt) || existing?.opened === true,
      });
    }

    const notifications = await Promise.all(
      [...campaignsById.entries()].map(async ([id, delivery]) => {
        const campaignSnapshot = await delivery.ref.get();
        if (!campaignSnapshot.exists) {
          return null;
        }

        const campaign = campaignSnapshot.data();
        return {
          id,
          title: campaign.title,
          body: campaign.body,
          createdAt: campaign.createdAt?.toDate?.().toISOString() ?? null,
          opened: delivery.opened,
        };
      })
    );

    return notifications
      .filter((notification) => notification !== null)
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }
);
