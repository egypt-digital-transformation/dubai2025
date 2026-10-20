import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, FieldValue, Timestamp } from "../shared/firebase.js";
import { requireAdminIdentity } from "../shared/admin-auth.js";
import { sendSessionReminderNotification } from "../shared/session-notification.js";

async function claimReminder(sessionRef) {
  return db.runTransaction(async (transaction) => {
    const sessionSnapshot = await transaction.get(sessionRef);
    const session = sessionSnapshot.data();
    if (!sessionSnapshot.exists || session?.reminderSent === true) {
      return false;
    }
    const claimedAt = session?.reminderClaimedAt;
    if (
      claimedAt?.toMillis &&
      Timestamp.now().toMillis() - claimedAt.toMillis() < 10 * 60 * 1000
    ) {
      return false;
    }
    transaction.update(sessionRef, {
      reminderClaimedAt: Timestamp.now(),
    });
    return true;
  });
}

async function releaseReminderClaim(sessionRef) {
  await sessionRef.update({ reminderClaimedAt: FieldValue.delete() });
}

async function sendReminderForAgendaItem(user, fcmToken, sessionDoc) {
  const claimed = await claimReminder(sessionDoc.ref);
  if (!claimed) {
    return false;
  }

  try {
    const session = sessionDoc.data();
    const messageId = await sendSessionReminderNotification(
      fcmToken,
      session.title,
      sessionDoc.id
    );
    await sessionDoc.ref.update({
      reminderSent: true,
      reminderSentAt: Timestamp.now(),
      reminderClaimedAt: FieldValue.delete(),
      fcmMessageId: messageId,
    });
    console.log(`✅ Sent FCM reminder for "${session.title}" to ${user.email}`);
    return true;
  } catch (error) {
    await releaseReminderClaim(sessionDoc.ref);
    throw error;
  }
}

export const sendSessionReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
  },
  async () => {
    try {
      const now = Timestamp.now();
      const fiveMinutesAgo = Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);
      const fiveMinutesFromNow = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000);

      console.log(`Checking agendas for sessions between ${fiveMinutesAgo.toDate()} and ${fiveMinutesFromNow.toDate()}`);

      const usersSnapshot = await db.collection("users").get();
      if (usersSnapshot.empty) {
        console.log("No users found.");
        return null;
      }

      for (const userDoc of usersSnapshot.docs) {
        const user = userDoc.data();
        const fcmToken = user.fcmToken;
        if (!fcmToken) continue;

        const agendaRef = db.collection(`users/${userDoc.id}/agenda`);
        const agendaSnapshot = await agendaRef
          .where("startTime", ">=", fiveMinutesAgo)
          .where("startTime", "<=", fiveMinutesFromNow)
          .where("reminderSent", "==", false)
          .get();

        if (agendaSnapshot.empty) continue;

        console.log(`User ${user.email} has ${agendaSnapshot.size} sessions starting soon`);

        for (const sessionDoc of agendaSnapshot.docs) {
          try {
            await sendReminderForAgendaItem(user, fcmToken, sessionDoc);
          } catch (error) {
            console.error(`❌ Failed to send FCM reminder for session ${sessionDoc.id} to ${user.email}:`, error);
          }
        }
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
          return res.status(403).json({ error: "Administrator access is required" });
        }
        throw error;
      }

      const now = Timestamp.now();
      const fiveMinutesAgo = Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);
      const fiveMinutesFromNow = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000);

      console.log(`[MANUAL] Checking agendas for sessions between ${fiveMinutesAgo.toDate()} and ${fiveMinutesFromNow.toDate()}`);

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
        const fcmToken = user.fcmToken;
        const userResult = {
          hasFcmToken: !!fcmToken,
          sessionsFound: 0,
          notificationsSent: 0,
          errors: [],
        };

        if (!fcmToken) {
          userResult.errors.push("No FCM device token found for this user");
          results.push(userResult);
          continue;
        }

        const agendaRef = db.collection(`users/${userDoc.id}/agenda`);
        const agendaSnapshot = await agendaRef
          .where("startTime", ">=", fiveMinutesAgo)
          .where("startTime", "<=", fiveMinutesFromNow)
          .where("reminderSent", "==", false)
          .get();

        userResult.sessionsFound = agendaSnapshot.size;

        if (!agendaSnapshot.empty) {
          console.log(`[MANUAL] User ${user.email} has ${agendaSnapshot.size} sessions starting soon`);

          for (const sessionDoc of agendaSnapshot.docs) {
            try {
              const sent = await sendReminderForAgendaItem(user, fcmToken, sessionDoc);
              if (sent) {
                userResult.notificationsSent++;
              }
            } catch (error) {
              const errorMsg = `Failed to send FCM notification for session "${sessionDoc.data().title}": ${error.message}`;
              userResult.errors.push(errorMsg);
              console.error(`[MANUAL] ❌ ${errorMsg}`);
            }
          }
        }

        results.push(userResult);
      }

      const totalNotifications = results.reduce((sum, r) => sum + r.notificationsSent, 0);
      const totalSessions = results.reduce((sum, r) => sum + r.sessionsFound, 0);

      console.log(`[MANUAL] Finished. Sent ${totalNotifications} notifications for ${totalSessions} sessions`);

      return res.status(200).json({
        message: "Manual FCM reminder check complete",
        timestamp: new Date().toISOString(),
        checkWindow: {
          start: fiveMinutesAgo.toDate(),
          end: fiveMinutesFromNow.toDate(),
        },
        summary: {
          totalUsers: results.length,
          totalSessions: totalSessions,
          totalNotificationsSent: totalNotifications,
          usersWithoutFcmToken: results.filter(r => !r.hasFcmToken).length,
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
