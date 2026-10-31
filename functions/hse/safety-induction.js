import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Firestore } from "@google-cloud/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "../shared/firebase.js";
import { requireAdminUser, requireAuthenticatedUser } from "../shared/admin-auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.resolve(__dirname, "../hse-service-account.json");

let hseFirestoreInstance = null;

function getHseFirestore() {
  if (!hseFirestoreInstance) {
    const options = {
      projectId: "mea-hseegyptonboarding-prod",
    };
    if (fs.existsSync(serviceAccountPath)) {
      options.keyFilename = serviceAccountPath;
    } else if (process.env.HSE_SERVICE_ACCOUNT_KEY) {
      try {
        options.credentials = JSON.parse(process.env.HSE_SERVICE_ACCOUNT_KEY);
      } catch (err) {
        console.error("[SafetyInduction] Failed to parse HSE_SERVICE_ACCOUNT_KEY:", err);
      }
    }
    hseFirestoreInstance = new Firestore(options);
  }
  return hseFirestoreInstance;
}

function withTimeout(promise, ms = 7000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("HSE Firestore connection timeout after " + ms + "ms")), ms)
    ),
  ]);
}

function parseInductionData(data) {
  if (!data || typeof data !== "object") {
    return {
      sokhnaplant: { completed: false, lastWatchedIndex: 0 },
      rmx: { completed: false, required: false },
    };
  }

  const sokhna = data.sokhnaplant ?? data.sokhnaPlant;
  const rmx = data.rmx ?? data.RMX;

  const sokhnaCompleted = sokhna?.questionnairePassed === true;
  const rmxCompleted = rmx?.questionnairePassed === true;
  const rmxRequired = rmx !== undefined && rmx !== null;
  const lastWatchedIndex = typeof sokhna?.lastWatchedIndex === "number" ? sokhna.lastWatchedIndex : 0;

  return {
    sokhnaplant: {
      completed: sokhnaCompleted,
      lastWatchedIndex,
    },
    rmx: {
      completed: rmxCompleted,
      required: rmxRequired,
    },
  };
}

export const getMySafetyInductionStatus = onCall(
  { region: "europe-west1", cors: true },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    let targetEmail = (user.email || "").trim().toLowerCase();

    // Support Admin Preview: if requested email differs from authenticated user, verify admin status
    const requestedEmail = typeof request.data?.email === "string" ? request.data.email.trim().toLowerCase() : "";
    if (requestedEmail && requestedEmail !== targetEmail) {
      const adminSnapshot = await db.collection("admins").doc(targetEmail).get();
      if (adminSnapshot.exists && adminSnapshot.data()?.active === true) {
        targetEmail = requestedEmail;
      }
    }

    if (!targetEmail) {
      throw new HttpsError("invalid-argument", "Target email is missing.");
    }

    try {
      const hseDb = getHseFirestore();
      const progressCol = hseDb.collection("userProgress");

      let snapshot = await withTimeout(
        progressCol.where("email", "==", targetEmail).limit(1).get()
      );

      if (snapshot.empty && request.data?.email?.trim() && request.data.email.trim() !== targetEmail) {
        snapshot = await withTimeout(
          progressCol.where("email", "==", request.data.email.trim()).limit(1).get()
        );
      }

      if (snapshot.empty) {
        return {
          found: false,
          ...parseInductionData(null),
        };
      }

      const docData = snapshot.docs[0].data();
      return {
        found: true,
        ...parseInductionData(docData),
      };
    } catch (error) {
      console.warn("[SafetyInduction] getMySafetyInductionStatus could not read HSE DB:", error?.message || error);
      // Return uncompleted status instead of crashing with 504
      return {
        found: false,
        unavailable: true,
        ...parseInductionData(null),
      };
    }
  }
);

export const getAdminSafetyInductionStatuses = onCall(
  { region: "europe-west1", cors: true },
  async (request) => {
    await requireAdminUser(request);

    try {
      const hseDb = getHseFirestore();
      const snapshot = await withTimeout(
        hseDb.collection("userProgress").get(),
        10000
      );
      const statuses = {};

      for (const progressDoc of snapshot.docs) {
        const data = progressDoc.data();
        const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
        if (!email) {
          continue;
        }

        const rmx = data.RMX ?? data.rmx;
        const sokhna = data.sokhnaplant ?? data.sokhnaPlant;
        const requiresRmx = rmx !== undefined && rmx !== null;
        const sokhnaComplete = sokhna?.questionnairePassed === true;
        const rmxComplete = rmx?.questionnairePassed === true;
        const completed = requiresRmx ? (sokhnaComplete && rmxComplete) : sokhnaComplete;
        const lastWatchedIndex = sokhna?.lastWatchedIndex;
        const progress = typeof lastWatchedIndex === "number" && lastWatchedIndex > 0
          ? `${lastWatchedIndex}/5`
          : "Not started";

        statuses[email] = {
          completed,
          status: completed ? "Done" : progress,
        };
      }

      return { statuses };
    } catch (error) {
      console.warn("[SafetyInduction] getAdminSafetyInductionStatuses could not read HSE DB:", error?.message || error);
      return { statuses: {} };
    }
  }
);
