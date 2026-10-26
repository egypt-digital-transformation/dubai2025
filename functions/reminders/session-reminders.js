import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, Timestamp } from "../shared/firebase.js";
import { requireAdminIdentity } from "../shared/admin-auth.js";
import {
  getPushRecipientsForUser,
  recordInAppNotification,
  sendPushToRecipients,
  updateInAppNotificationPushSummary,
} from "../shared/push-delivery.js";
import { emailDocumentId } from "../shared/notification-utils.js";
import { getDueAgendaLabels } from "./session-reminder-utils.js";

const REMINDER_WINDOW_MS = 5 * 60 * 1000;
const REMINDER_RETRY_LOOKBACK_MS = 30 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

function getUserLabel(userDoc, user) {
  const candidate =
    user?.emailAddress ||
    user?.email ||
    user?.displayName ||
    userDoc?.id;
  const label = typeof candidate === "string" ? candidate.trim() : "";
  return label && label !== "undefined" ? label : "Unknown User";
}

function getReminderWindow(now = Timestamp.now()) {
  return {
    start: new Date(now.toMillis() - REMINDER_RETRY_LOOKBACK_MS),
    end: new Date(now.toMillis() + REMINDER_WINDOW_MS),
  };
}

function matchesExpectedLabel(label, dueLabel) {
  return (
    label &&
    typeof label === "object" &&
    label.label === dueLabel.label &&
    label.startTime === dueLabel.startTime
  );
}

async function claimReminder(dayRef, dueLabel) {
  return db.runTransaction(async (transaction) => {
    const daySnapshot = await transaction.get(dayRef);
    if (!daySnapshot.exists) {
      return null;
    }

    const dayDocument = daySnapshot.data();
    const labels = Array.isArray(dayDocument.labels)
      ? [...dayDocument.labels]
      : [];
    const label = labels[dueLabel.index];
    if (!matchesExpectedLabel(label, dueLabel) || label.reminderSent === true) {
      return null;
    }

    const claimedAt = label.reminderClaimedAt;
    if (
      claimedAt?.toMillis &&
      Timestamp.now().toMillis() - claimedAt.toMillis() < CLAIM_TIMEOUT_MS
    ) {
      return null;
    }

    const claimId = randomUUID();
    labels[dueLabel.index] = {
      ...label,
      reminderClaimedAt: Timestamp.now(),
      reminderClaimId: claimId,
    };
    transaction.update(dayRef, { labels });
    return {
      claimId,
      inAppSaved: label.reminderInAppSaved === true,
    };
  });
}

async function updateReminderLabel(dayRef, dueLabel, claimId, update) {
  return db.runTransaction(async (transaction) => {
    const daySnapshot = await transaction.get(dayRef);
    if (!daySnapshot.exists) {
      return false;
    }

    const dayDocument = daySnapshot.data();
    const labels = Array.isArray(dayDocument.labels)
      ? [...dayDocument.labels]
      : [];
    const label = labels[dueLabel.index];
    if (
      !matchesExpectedLabel(label, dueLabel) ||
      label.reminderClaimId !== claimId
    ) {
      return false;
    }

    const updatedLabel = { ...label };
    delete updatedLabel.reminderClaimedAt;
    delete updatedLabel.reminderClaimId;
    labels[dueLabel.index] = { ...updatedLabel, ...update };
    transaction.update(dayRef, { labels });
    return true;
  });
}

async function recordInAppReminder(userEmail, dueLabel, dayDoc) {
  const normalizedEmail =
    typeof userEmail === "string" ? userEmail.trim().toLowerCase() : "";
  if (!normalizedEmail) {
    throw new Error("Cannot save a session reminder without the attendee email.");
  }

  const title = "Session Starting Soon!";
  const body = `Your "${dueLabel.label}" is starting soon.`;
  const campaignId = getReminderCampaignId(normalizedEmail, dayDoc, dueLabel);
  const link = getAgendaReminderLink(dueLabel, campaignId);
  await recordInAppNotification({
    id: campaignId,
    title,
    body,
    targetLabel: `Session Reminder: ${dueLabel.label}`,
    emails: [normalizedEmail],
    link,
    metadata: {
      isSessionReminder: true,
      dayNumber: dueLabel.dayNumber ?? null,
    },
  });
  return campaignId;
}

function getReminderCampaignId(userEmail, dayDoc, dueLabel) {
  return emailDocumentId(
    `reminder:${userEmail.trim().toLowerCase()}:${dayDoc.id}:${dueLabel.index}`
  );
}

function getAgendaReminderLink(dueLabel, campaignId) {
  const query = new URLSearchParams({
    notificationCampaign: campaignId,
  });
  if (Number.isInteger(dueLabel.dayNumber) && dueLabel.dayNumber > 0) {
    query.set("dayNumber", String(dueLabel.dayNumber));
  }
  return `/tabs/agenda?${query.toString()}`;
}

async function sendReminderForLabel(
  userLabel,
  userEmail,
  recipients,
  dayDoc,
  dueLabel
) {
  const claim = await claimReminder(dayDoc.ref, dueLabel);
  if (!claim) {
    return false;
  }

  const { claimId, inAppSaved } = claim;
  try {
    const campaignId = inAppSaved
      ? getReminderCampaignId(userEmail, dayDoc, dueLabel)
      : await recordInAppReminder(userEmail, dueLabel, dayDoc);
    if (!inAppSaved) {
      const saved = await updateReminderLabel(
        dayDoc.ref,
        dueLabel,
        claimId,
        { reminderInAppSaved: true }
      );
      if (!saved) {
        throw new Error("Could not record the in-app agenda reminder.");
      }
    }
    const link = getAgendaReminderLink(dueLabel, campaignId);
    let results = [];
    if (recipients.length) {
      try {
        results = await sendPushToRecipients(recipients, {
          title: "Session Starting Soon!",
          body: `Your "${dueLabel.label}" is starting soon.`,
          data: {
            campaignId,
            dayNumber: String(dueLabel.dayNumber ?? ""),
            agendaLabel: dueLabel.label,
            url: link,
          },
          link,
        });
      } catch (error) {
        console.error(
          `[SessionReminders] Push delivery failed for ${userLabel}; reminder remains in the in-app inbox:`,
          error
        );
        await updateInAppNotificationPushSummary(campaignId, recipients, []);
        throw error;
      }
    }
    await updateInAppNotificationPushSummary(campaignId, recipients, results);
    const successfulResults = results.filter((result) => result.success);
    if (successfulResults.length === 0) {
      console.warn(
        `[SessionReminders] No push device accepted the reminder for ${userLabel}; it remains pending for retry.`,
        results.map((result) => result.errorCode)
      );
      const released = await updateReminderLabel(
        dayDoc.ref,
        dueLabel,
        claimId,
        {}
      );
      if (!released) {
        throw new Error("Could not release the pending agenda reminder claim.");
      }
      return false;
    }

    const messageIds = successfulResults
      .map((result) => result.messageId)
      .filter(Boolean);
    const reminderUpdate = {
      reminderSent: true,
      reminderSentAt: Timestamp.now(),
      fcmMessageIds: messageIds,
    };
    if (messageIds[0]) {
      reminderUpdate.fcmMessageId = messageIds[0];
    }
    const markedSent = await updateReminderLabel(
      dayDoc.ref,
      dueLabel,
      claimId,
      reminderUpdate
    );
    if (!markedSent) {
      throw new Error("Could not mark the agenda label reminder as sent.");
    }

    console.log(`Recorded session reminder for "${dueLabel.label}" for ${userLabel}`);
    return true;
  } catch (error) {
    await updateReminderLabel(dayDoc.ref, dueLabel, claimId, {});
    throw error;
  }
}

async function findDueLabelsForUser(userDoc, window) {
  const agendaSnapshot = await db
    .collection(`users/${userDoc.id}/agenda`)
    .get();
  return agendaSnapshot.docs.flatMap((dayDoc) =>
    getDueAgendaLabels(dayDoc.data(), window.start, window.end).map(
      (dueLabel) => ({ dayDoc, dueLabel })
    )
  );
}

async function processDueLabels(
  userLabel,
  userEmail,
  recipients,
  dueLabels,
  onError
) {
  let notificationsSent = 0;
  for (const { dayDoc, dueLabel } of dueLabels) {
    try {
      if (
        await sendReminderForLabel(
          userLabel,
          userEmail,
          recipients,
          dayDoc,
          dueLabel
        )
      ) {
        notificationsSent++;
      }
    } catch (error) {
      onError(error, dayDoc, dueLabel);
    }
  }
  return notificationsSent;
}

export const sendSessionReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
  },
  async () => {
    try {
      const window = getReminderWindow();
      console.log(
        `Checking agenda label start times between ${window.start} and ${window.end}`
      );

      const usersSnapshot = await db.collection("users").get();
      if (usersSnapshot.empty) {
        console.log("No users found.");
        return null;
      }

      for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        const userLabel = getUserLabel(userDoc, user);
        const userEmail = user.emailAddress || user.email || "";
        const recipients = getPushRecipientsForUser(userDoc);
        const dueLabels = await findDueLabelsForUser(userDoc, window);
        if (!dueLabels.length) {
          continue;
        }
        if (!recipients.length) {
          console.warn(
            `No valid FCM device token for ${userLabel}; due reminders will be saved to the in-app inbox.`
          );
        }

        console.log(
          `User ${userLabel} has ${dueLabels.length} agenda labels starting soon`
        );
        await processDueLabels(
          userLabel,
          userEmail,
          recipients,
          dueLabels,
          (error, dayDoc, dueLabel) => {
            console.error(
              `❌ Failed to record reminder for label "${dueLabel?.label || ""}" in agenda ${dayDoc.id} for ${userLabel}:`,
              error
            );
          }
        );
      }

      console.log("Finished processing all user reminders.");
      return null;
    } catch (error) {
      console.error("Error in sendSessionReminders:", error);
      return null;
    }
  }
);

export const sendSessionRemindersManual = onRequest(
  { region: "europe-west1", invoker: "private" },
  async (req, res) => {
    try {
      const authorization = req.get("authorization") || "";
      if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Authentication is required" });
      }

      let decodedToken;
      try {
        decodedToken = await getAuth().verifyIdToken(authorization.slice(7));
      } catch (error) {
        return res.status(401).json({ error: "Authentication is invalid" });
      }

      try {
        await requireAdminIdentity(decodedToken);
      } catch (error) {
        if (error.code === "permission-denied") {
          return res
            .status(403)
            .json({ error: "Administrator access is required" });
        }
        throw error;
      }

      const window = getReminderWindow();
      console.log(
        `[MANUAL] Checking agenda label start times between ${window.start} and ${window.end}`
      );

      const usersSnapshot = await db.collection("users").get();
      const results = [];

      if (usersSnapshot.empty) {
        return res.status(200).json({
          message: "No users found",
          results: [],
        });
      }

      for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        const userLabel = getUserLabel(userDoc, user);
        const userEmail = user.emailAddress || user.email || "";
        const recipients = getPushRecipientsForUser(userDoc);
        const userResult = {
          hasFcmToken: recipients.length > 0,
          labelsFound: 0,
          notificationsSent: 0,
          errors: [],
        };

        const dueLabels = await findDueLabelsForUser(userDoc, window);
        userResult.labelsFound = dueLabels.length;
        userResult.notificationsSent = await processDueLabels(
          userLabel,
          userEmail,
          recipients,
          dueLabels,
          (error, dayDoc, dueLabel) => {
            const errorMessage =
              `Failed to send FCM notification for label "${dueLabel.label}" ` +
              `in agenda ${dayDoc.id} for ${userLabel}: ${error.message}`;
            userResult.errors.push(errorMessage);
            console.error(`[MANUAL] ❌ ${errorMessage}`);
          }
        );
        results.push(userResult);
      }

      const totalNotifications = results.reduce(
        (sum, result) => sum + result.notificationsSent,
        0
      );
      const totalLabels = results.reduce(
        (sum, result) => sum + result.labelsFound,
        0
      );

      console.log(
        `[MANUAL] Finished. Sent ${totalNotifications} notifications for ${totalLabels} agenda labels`
      );

      return res.status(200).json({
        message: "Manual FCM reminder check complete",
        timestamp: new Date().toISOString(),
        checkWindow: {
          start: window.start,
          end: window.end,
        },
        summary: {
          totalUsers: results.length,
          totalLabels,
          totalNotificationsSent: totalNotifications,
          usersWithoutFcmToken: results.filter((result) => !result.hasFcmToken)
            .length,
        },
      });
    } catch (error) {
      console.error("[MANUAL] Error:", error);
      return res.status(500).json({
        error: "Error processing manual reminder check",
        message: error.message,
        stack: error.stack,
      });
    }
  }
);
