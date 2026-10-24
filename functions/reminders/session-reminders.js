import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, Timestamp } from "../shared/firebase.js";
import { requireAdminIdentity } from "../shared/admin-auth.js";
import {
  getPushRecipientsForUser,
  sendPushToRecipients,
} from "../shared/push-delivery.js";
import { getDueAgendaLabels } from "./session-reminder-utils.js";

const REMINDER_WINDOW_MS = 5 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

function getUserLabel(userDoc, user) {
  return user.emailAddress || user.email || userDoc.id;
}

function getReminderWindow(now = Timestamp.now()) {
  return {
    start: new Date(now.toMillis() - REMINDER_WINDOW_MS),
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
    return claimId;
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

async function sendReminderForLabel(user, recipients, dayDoc, dueLabel) {
  const claimId = await claimReminder(dayDoc.ref, dueLabel);
  if (!claimId) {
    return false;
  }

  try {
    const results = await sendPushToRecipients(recipients, {
      title: "Session Starting Soon!",
      body: `Your "${dueLabel.label}" is starting soon.`,
      data: {
        dayNumber: String(dueLabel.dayNumber ?? ""),
        agendaLabel: dueLabel.label,
      },
      link: "/",
    });
    const successfulResults = results.filter((result) => result.success);
    if (!successfulResults.length) {
      throw new Error(
        `No session reminder delivery succeeded: ${results
          .map((result) => result.errorCode || "unknown")
          .join(", ")}`
      );
    }

    const markedSent = await updateReminderLabel(
      dayDoc.ref,
      dueLabel,
      claimId,
      {
        reminderSent: true,
        reminderSentAt: Timestamp.now(),
        fcmMessageId: successfulResults[0].messageId,
        fcmMessageIds: successfulResults
          .map((result) => result.messageId)
          .filter(Boolean),
      }
    );
    if (!markedSent) {
      throw new Error("Could not mark the agenda label reminder as sent.");
    }

    console.log(
      `✅ Sent FCM reminder for "${dueLabel.label}" to ${user.email}`
    );
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

async function processDueLabels(user, recipients, dueLabels, onError) {
  let notificationsSent = 0;
  for (const { dayDoc, dueLabel } of dueLabels) {
    try {
      if (await sendReminderForLabel(user, recipients, dayDoc, dueLabel)) {
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
        const recipients = getPushRecipientsForUser(userDoc);
        if (!recipients.length) {
          console.warn(
            `Skipping session reminders for ${userLabel}: no valid FCM device token is registered.`
          );
          continue;
        }

        const dueLabels = await findDueLabelsForUser(userDoc, window);
        if (!dueLabels.length) {
          continue;
        }
        console.log(
          `User ${userLabel} has ${dueLabels.length} agenda labels starting soon`
        );
        await processDueLabels(user, recipients, dueLabels, (error, dayDoc) => {
          console.error(
            `❌ Failed to send FCM reminder for label in agenda ${dayDoc.id} to ${userLabel}:`,
            error
          );
        });
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
        const recipients = getPushRecipientsForUser(userDoc);
        const userResult = {
          hasFcmToken: recipients.length > 0,
          labelsFound: 0,
          notificationsSent: 0,
          errors: [],
        };

        if (!recipients.length) {
          userResult.errors.push("No FCM device token found for this user");
          results.push(userResult);
          continue;
        }

        const dueLabels = await findDueLabelsForUser(userDoc, window);
        userResult.labelsFound = dueLabels.length;
        userResult.notificationsSent = await processDueLabels(
          user,
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
