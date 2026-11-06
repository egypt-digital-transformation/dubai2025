import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { db, Timestamp } from "../shared/firebase.js";
import {
  getPushRecipientsForUser,
  recordInAppNotification,
  sendPushToRecipients,
  updateInAppNotificationPushSummary,
} from "../shared/push-delivery.js";
import { emailDocumentId } from "../shared/notification-utils.js";

const EVENT_TIME_ZONE = "Africa/Cairo";
const FLIGHT_REMINDER_LEAD_MS = 40 * 60 * 1000; // 40 minutes after arrival
const MAX_FLIGHT_AGE_MS = 48 * 60 * 60 * 1000; // Do not send for flights older than 48 hours

const cairoDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: EVENT_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Converts arrivalDate and arrivalTime strings into an absolute UTC Date
 * evaluated under the Africa/Cairo timezone.
 *
 * Supported dates: "YYYY-MM-DD", "DD/MM/YYYY", "DD-MM-YYYY", "YYYY/MM/DD"
 * Supported times: "12:45 PM", "1:30 AM", "12:45", "14:45:00", "09:00 am"
 */
export function parseFlightArrivalToDate(arrivalDateStr, arrivalTimeStr) {
  if (typeof arrivalDateStr !== "string" || typeof arrivalTimeStr !== "string") {
    return null;
  }
  const dateTrimmed = arrivalDateStr.trim();
  const timeTrimmed = arrivalTimeStr.trim();
  if (!dateTrimmed || !timeTrimmed) return null;

  let year;
  let month;
  let day;

  const dmyMatch = dateTrimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  const ymdMatch = dateTrimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);

  if (dmyMatch) {
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    const rawYear = Number(dmyMatch[3]);
    year = rawYear < 100 ? 2000 + rawYear : rawYear;
  } else if (ymdMatch) {
    year = Number(ymdMatch[1]);
    month = Number(ymdMatch[2]);
    day = Number(ymdMatch[3]);
  } else {
    const parsed = new Date(dateTrimmed);
    if (isNaN(parsed.getTime())) return null;
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth() + 1;
    day = parsed.getUTCDate();
  }

  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const timeMatch = timeTrimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i);
  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  const meridiem = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

  if (meridiem === "PM" && hour < 12) {
    hour += 12;
  } else if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  const targetUtcMillis = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidateMillis = targetUtcMillis;

  for (let attempt = 0; attempt < 2; attempt++) {
    const formattedParts = Object.fromEntries(
      cairoDateFormatter
        .formatToParts(new Date(candidateMillis))
        .filter((part) => part.type !== "literal")
        .map(({ type, value }) => [type, Number(value)])
    );
    const formattedUtcMillis = Date.UTC(
      formattedParts.year,
      formattedParts.month - 1,
      formattedParts.day,
      formattedParts.hour,
      formattedParts.minute,
      formattedParts.second
    );
    candidateMillis += targetUtcMillis - formattedUtcMillis;
  }

  return new Date(candidateMillis);
}

function getAttendeeFirstName(userData) {
  const candidate = userData?.firstName || userData?.displayName || userData?.name || "";
  const cleaned = typeof candidate === "string" ? candidate.trim() : "";
  if (!cleaned) return "Delegate";
  // Return first word (e.g. "Medhat Ismail" -> "Medhat")
  return cleaned.split(/\s+/)[0];
}

/**
 * Checks all attendees with inbound flights and sends the 40-minute post-arrival
 * welcome notification (push + in-app) to eligible users.
 */
export async function processFlightArrivalReminders() {
  const now = Date.now();
  const [usersSnapshot, flightsSnapshot] = await Promise.all([
    db.collection("users").get(),
    db.collectionGroup("flightDetails").get().catch(() => ({ docs: [] })),
  ]);

  if (usersSnapshot.empty) {
    return { checkedCount: 0, sentCount: 0 };
  }

  // Map subcollection documents users/{userId}/flightDetails/flightInfo
  const flightsByUserId = new Map();
  for (const flightDoc of flightsSnapshot.docs || []) {
    if (flightDoc.id === "flightInfo") {
      const parentUserDoc = flightDoc.ref.parent?.parent;
      if (parentUserDoc?.id) {
        flightsByUserId.set(parentUserDoc.id, flightDoc.data());
      }
    }
  }

  let sentCount = 0;
  let checkedCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const data = userDoc.data();
    checkedCount++;

    // Skip if already sent
    if (data.flightWelcomeSent === true) {
      continue;
    }

    // Extract inbound flight info from userDoc or users/{userId}/flightDetails/flightInfo subcollection
    const flightSubDocData = flightsByUserId.get(userDoc.id);
    const inbound =
      data.inbound ||
      data.flightDetails?.inbound ||
      flightSubDocData?.inbound ||
      flightSubDocData?.arrival;

    if (!inbound || typeof inbound !== "object") {
      continue;
    }

    const arrivalDateStr = inbound.arrivalDate || inbound.date;
    const arrivalTimeStr = inbound.arrivalTime || inbound.time;
    const flightNo = inbound.flightNo || inbound.flight
      ? String(inbound.flightNo || inbound.flight).trim()
      : "";

    if (!arrivalDateStr || !arrivalTimeStr) {
      continue;
    }

    const arrivalDate = parseFlightArrivalToDate(arrivalDateStr, arrivalTimeStr);
    if (!arrivalDate || isNaN(arrivalDate.getTime())) {
      continue;
    }

    const arrivalMillis = arrivalDate.getTime();
    const triggerMillis = arrivalMillis + FLIGHT_REMINDER_LEAD_MS;

    // Check if 40 minutes have elapsed since arrival, and flight is not older than 48 hours
    if (now < triggerMillis) {
      continue; // Not yet due
    }
    if (now > triggerMillis + MAX_FLIGHT_AGE_MS) {
      continue; // Flight was in the distant past
    }

    const email = String(data.emailAddress || data.email || userDoc.id).trim().toLowerCase();
    if (!email) {
      continue;
    }

    const firstName = getAttendeeFirstName(data);
    const title = `Welcome to the Land of Pharaohs, ${firstName}!`;
    const body =
      "We are excited to have you join us for the AMEA Management Meeting 2026.\n" +
      "Your Ahlan app is your personal companion for the event - check it out to connect with fellow leaders and stay updated on every session!";

    const campaignId = emailDocumentId(`flight-welcome:${userDoc.id}`);
    const link = "/tabs/home?welcome=flight";

    try {
      // 1. Record In-App Notification (always saved regardless of push token)
      await recordInAppNotification({
        id: campaignId,
        title,
        body,
        targetLabel: "Flight Arrival Welcome",
        emails: [email],
        link,
        metadata: {
          isFlightWelcome: true,
          flightNo: flightNo || null,
        },
      });

      // 2. Dispatch push notification if device tokens are registered
      const recipients = getPushRecipientsForUser(userDoc);
      let results = [];
      if (recipients.length > 0) {
        try {
          results = await sendPushToRecipients(recipients, {
            title,
            body,
            android: { priority: "high" },
            webpush: { headers: { Urgency: "high" } },
            data: {
              campaignId,
              type: "flight-welcome",
              url: link,
            },
            link,
          });
        } catch (pushErr) {
          console.warn(`[FlightReminders] Push dispatch failed for ${email}:`, pushErr);
        }
      }

      await updateInAppNotificationPushSummary(campaignId, recipients, results);

      // 3. Mark sent on user document to ensure it only ever sends once
      await userDoc.ref.set(
        {
          flightWelcomeSent: true,
          flightWelcomeSentAt: Timestamp.now(),
          flightWelcomeFlightNo: flightNo || null,
        },
        { merge: true }
      );

      sentCount++;
      console.log(
        `[FlightReminders] Sent arrival welcome notification to ${email} (flight: ${flightNo || "N/A"})`
      );
    } catch (err) {
      console.error(`[FlightReminders] Error delivering arrival welcome for ${email}:`, err);
    }
  }

  return { checkedCount, sentCount };
}

/**
 * Scheduled Cloud Function running every 2 minutes
 */
export const sendFlightArrivalWelcome = onSchedule(
  {
    schedule: "every 2 minutes",
    region: "europe-west1",
  },
  async () => {
    try {
      const summary = await processFlightArrivalReminders();
      console.log(`[FlightArrivalWelcome] Finished check: ${JSON.stringify(summary)}`);
      return null;
    } catch (error) {
      console.error("[FlightArrivalWelcome] Scheduled job error:", error);
      return null;
    }
  }
);

/**
 * Manual trigger endpoint for testing or immediate admin runs
 */
export const sendFlightArrivalWelcomeManual = onRequest(
  { region: "europe-west1", invoker: "private" },
  async (req, res) => {
    try {
      const summary = await processFlightArrivalReminders();
      return res.status(200).json({
        success: true,
        summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(500).json({
        error: error.message,
        stack: error.stack,
      });
    }
  }
);

