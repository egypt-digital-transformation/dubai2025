import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

/**
 * Helper to send a notification via Firebase Cloud Messaging (FCM)
 * @param {string} token - FCM registration device token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional payload data key-value pairs
 */
async function sendFcmNotification(token, title, body, data = {}) {
  // Convert any data object values to strings (FCM data payload requirement: map<string, string>)
  const stringData = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = typeof value === "string" ? value : JSON.stringify(value);
  }

  const message = {
    token,
    notification: {
      title,
      body,
    },
    data: stringData,
    webpush: {
      notification: {
        title,
        body,
        icon: "/assets/icon/favicon.png",
        badge: "/assets/icon/favicon.png",
      },
      fcmOptions: {
        link: "/",
      },
    },
  };

  return await getMessaging().send(message);
}

// 🔔 Send reminders every minute
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
            const messageId = await sendFcmNotification(
              fcmToken,
              "Session Starting Soon!",
              `Your "${session.title}" starts in 5 minutes.`,
              { sessionId, title: session.title || "" }
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

// 🧪 Manual trigger for testing - ACTUALLY SENDS NOTIFICATIONS
export const sendSessionRemindersManual = onRequest(
  { region: "europe-west1" },
  async (req, res) => {
    try {
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
          userId: userDoc.id,
          email: user.email,
          hasFcmToken: !!fcmToken,
          fcmToken: fcmToken || null,
          sessionsFound: 0,
          notificationsSent: 0,
          errors: [],
        };

        // Skip users without FCM Token
        if (!fcmToken) {
          userResult.errors.push("No FCM device token found for this user");
          results.push(userResult);
          continue;
        }

        // Query user's agenda for sessions starting in 5 minutes
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
              // Send FCM notification
              const messageId = await sendFcmNotification(
                fcmToken,
                "Session Starting Soon!",
                `Your "${session.title}" starts in 5 minutes.`,
                { sessionId, title: session.title || "" }
              );

              // Update session document
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

      res.status(200).json({
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
        results,
      });
    } catch (error) {
      console.error("[MANUAL] Error:", error);
      res.status(500).json({
        error: "Error processing manual reminder check",
        message: error.message,
        stack: error.stack,
      });
    }
  }
);