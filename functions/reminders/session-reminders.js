import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { db, Timestamp } from "../shared/firebase.js";
import { sendSessionReminderNotification } from "../shared/session-notification.js";

export const sendSessionReminders = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "europe-west1",
  },
  async () => {
    try {
      const now = Timestamp.now();
      const fiveMinutesFromNow = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000);
      const sixMinutesFromNow = Timestamp.fromMillis(now.toMillis() + 6 * 60 * 1000);

      console.log(`Checking agendas for sessions between ${fiveMinutesFromNow.toDate()} and ${sixMinutesFromNow.toDate()}`);

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
          .where("startTime", ">=", fiveMinutesFromNow)
          .where("startTime", "<=", sixMinutesFromNow)
          .where("reminderSent", "==", false)
          .get();

        if (agendaSnapshot.empty) continue;

        console.log(`User ${user.email} has ${agendaSnapshot.size} sessions starting soon`);

        for (const sessionDoc of agendaSnapshot.docs) {
          const session = sessionDoc.data();
          const sessionId = sessionDoc.id;

          try {
            const messageId = await sendSessionReminderNotification(
              fcmToken,
              session.title,
              sessionId
            );

            await sessionDoc.ref.update({
              reminderSent: true,
              reminderSentAt: Timestamp.now(),
              fcmMessageId: messageId,
            });

            console.log(`✅ Sent FCM reminder for "${session.title}" to ${user.email}`);
          } catch (err) {
            console.error(`❌ Failed to send FCM reminder for session ${sessionId} to ${user.email}:`, err);
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
  { region: "europe-west1" },
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

      const now = Timestamp.now();
      const fiveMinutesFromNow = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000);
      const sixMinutesFromNow = Timestamp.fromMillis(now.toMillis() + 6 * 60 * 1000);

      console.log(`[MANUAL] Checking agendas for sessions between ${fiveMinutesFromNow.toDate()} and ${sixMinutesFromNow.toDate()}`);

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
          .where("startTime", ">=", fiveMinutesFromNow)
          .where("startTime", "<=", sixMinutesFromNow)
          .where("reminderSent", "==", false)
          .get();

        userResult.sessionsFound = agendaSnapshot.size;

        if (!agendaSnapshot.empty) {
          console.log(`[MANUAL] User ${user.email} has ${agendaSnapshot.size} sessions starting soon`);

          for (const sessionDoc of agendaSnapshot.docs) {
            const session = sessionDoc.data();
            const sessionId = sessionDoc.id;

            try {
              const messageId = await sendSessionReminderNotification(
                fcmToken,
                session.title,
                sessionId
              );

              await sessionDoc.ref.update({
                reminderSent: true,
                reminderSentAt: Timestamp.now(),
                fcmMessageId: messageId,
              });

              userResult.notificationsSent++;
              console.log(`[MANUAL] ✅ Sent FCM reminder for "${session.title}" to ${user.email}`);
            } catch (err) {
              const errorMsg = `Failed to send FCM notification for session "${session.title}": ${err.message}`;
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
          start: fiveMinutesFromNow.toDate(),
          end: sixMinutesFromNow.toDate(),
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
