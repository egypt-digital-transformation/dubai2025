import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./shared/firebase.js";
import { requireAuthenticatedUser } from "./shared/admin-auth.js";

const EVENT_CONFIGURATION_PATH = "appConfiguration/event";

export const getEventArchiveStatus = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAuthenticatedUser(request);
    const snapshot = await db.doc(EVENT_CONFIGURATION_PATH).get();
    const eventEndAt = snapshot.data()?.eventEndAt;
    if (
      eventEndAt !== undefined &&
      eventEndAt !== null &&
      typeof eventEndAt.toMillis !== "function"
    ) {
      throw new HttpsError("internal", "The saved event end time is invalid.");
    }

    return {
      serverNowMs: Date.now(),
      eventEndAtMs:
        eventEndAt && typeof eventEndAt.toMillis === "function"
          ? eventEndAt.toMillis()
          : null,
    };
  }
);
