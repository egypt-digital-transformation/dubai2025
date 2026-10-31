import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, FieldValue } from "../shared/firebase.js";
import {
  requireAdminUser,
  requireAuthenticatedUser,
} from "../shared/admin-auth.js";
import {
  emailDocumentId,
  matchesNotificationTarget,
  SEGMENT_FIELDS,
} from "../shared/notification-utils.js";
import {
  getTargetRecipients,
  recordInAppNotification,
  sendPushToRecipients,
  updateInAppNotificationPushSummary,
} from "../shared/push-delivery.js";

const ACTIVITY_COLLECTION = "interactiveActivities";

function validateTarget(target) {
  if (
    !target ||
    !["all", "user", "users", "segment"].includes(target.kind) ||
    (target.kind === "user" &&
      (typeof target.userId !== "string" || !target.userId.length)) ||
    (target.kind === "users" &&
      (!Array.isArray(target.userIds) ||
        target.userIds.length < 1 ||
        target.userIds.length > 5000 ||
        target.userIds.some((userId) => typeof userId !== "string" || !userId.length))) ||
    (target.kind === "segment" &&
      (!SEGMENT_FIELDS.has(target.field) ||
        typeof target.value !== "string" ||
        !target.value.length))
  ) {
    throw new HttpsError("invalid-argument", "Choose a valid activity audience.");
  }
}

export const createInteractiveActivity = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);
    const { title, question, options, kind, target, correctOptionIndex } =
      request.data ?? {};

    if (
      typeof title !== "string" ||
      title.trim().length < 1 ||
      title.trim().length > 120 ||
      typeof question !== "string" ||
      question.trim().length < 1 ||
      question.trim().length > 500 ||
      !["quiz", "poll"].includes(kind) ||
      !Array.isArray(options) ||
      options.length < 2 ||
      options.length > 6 ||
      options.some(
        (option) =>
          typeof option !== "string" ||
          !option.trim().length ||
          option.trim().length > 120
      ) ||
      (kind === "quiz" &&
        (!Number.isInteger(correctOptionIndex) ||
          correctOptionIndex < 0 ||
          correctOptionIndex >= options.length))
    ) {
      throw new HttpsError("invalid-argument", "Enter a valid quiz or poll.");
    }
    validateTarget(target);

    const activityRef = await db.collection(ACTIVITY_COLLECTION).add({
      title: title.trim(),
      question: question.trim(),
      options: options.map((option) => option.trim()),
      kind,
      target,
      correctOptionIndex: kind === "quiz" ? correctOptionIndex : null,
      active: true,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    let notificationSummary = {
      pushReadyCount: 0,
      inAppCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      deliveryError: false,
    };
    try {
      const { recipients, users } = await getTargetRecipients(target);
      const campaignId = emailDocumentId(`interactive-activity:${activityRef.id}`);
      const notificationTitle =
        `${kind === "quiz" ? "New quiz" : "New poll"}: ${title.trim()}`;
      const link = `/activities?notificationCampaign=${campaignId}`;
      await recordInAppNotification({
        id: campaignId,
        title: notificationTitle,
        body: "Open the app to participate.",
        targetLabel: "Interactive activity",
        emails: users.map((user) => {
          const data = user.data();
          return data.emailAddress || data.email || user.id;
        }),
        link,
        metadata: {
          isInteractiveActivity: true,
          activityId: activityRef.id,
        },
      });
      notificationSummary.pushReadyCount = new Set(
        recipients.map((recipient) => recipient.id)
      ).size;
      notificationSummary.inAppCount = users.length;
      let results = [];
      let pushDeliveryFailed = false;
      if (recipients.length) {
        try {
          results = await sendPushToRecipients(recipients, {
            title: notificationTitle,
            body: "Open the app to participate.",
            data: {
              activityId: activityRef.id,
              campaignId,
              kind,
              url: link,
            },
            link,
          });
        } catch (error) {
          pushDeliveryFailed = true;
          console.error(
            `[InteractiveActivities] Push delivery failed for activity ${activityRef.id}; inbox notifications were saved:`,
            error
          );
        }
      }
      await updateInAppNotificationPushSummary(campaignId, recipients, results);
      notificationSummary = {
        pushReadyCount: new Set(
          recipients.map((recipient) => recipient.id)
        ).size,
        inAppCount: users.length,
        acceptedCount: results.filter((result) => result.success).length,
        failedCount: pushDeliveryFailed
          ? recipients.length
          : results.filter((result) => !result.success).length,
        deliveryError: false,
      };
      await activityRef.set(
        { notificationSummary, notificationSentAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (error) {
      console.error(
        `[InteractiveActivities] Failed to save attendee notifications for ${kind} ${activityRef.id}:`,
        error
      );
      notificationSummary.deliveryError = true;
    }

    return { id: activityRef.id, notificationSummary };
  }
);

async function findDelegateProfile(email, uid) {
  const users = db.collection("users");
  const normalizedEmail = (email || "").trim().toLowerCase();

  const findByEmail = async (val) => {
    if (!val) return [];
    const [byEmail, byEmailAddress] = await Promise.all([
      users.where("email", "==", val).get(),
      users.where("emailAddress", "==", val).get(),
    ]);
    const docs = [...byEmail.docs, ...byEmailAddress.docs];
    const unique = new Map();
    for (const d of docs) {
      unique.set(d.id, d);
    }
    return [...unique.values()];
  };

  let profiles = await findByEmail(normalizedEmail);
  if (!profiles.length && email && email.trim() !== normalizedEmail) {
    profiles = await findByEmail(email.trim());
  }

  if (!profiles.length) {
    for (const docId of [email?.trim(), normalizedEmail, uid]) {
      if (!docId) continue;
      const snap = await users.doc(docId).get();
      if (snap.exists) {
        profiles.push(snap);
        break;
      }
    }
  }

  return profiles[0] || null;
}

async function isUserAdmin(email) {
  if (!email) return false;
  const adminDoc = await db.collection("admins").doc(email.trim().toLowerCase()).get();
  return adminDoc.exists && adminDoc.data()?.active === true;
}

export const listInteractiveActivities = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const normalizedEmail = user.email.trim().toLowerCase();

    const isAdmin = await isUserAdmin(normalizedEmail);
    const profile = await findDelegateProfile(user.email, user.uid);

    const activitiesSnapshot = await db
      .collection(ACTIVITY_COLLECTION)
      .get();

    const available = activitiesSnapshot.docs.filter((activity) => {
      if (isAdmin) return true;
      const target = activity.data().target;
      if (!target || target.kind === "all") return true;
      if (!profile) return false;
      return matchesNotificationTarget(profile, target);
    });

    const activities = await Promise.all(
      available.map(async (activity) => {
        const data = activity.data();
        const responses = await activity.ref.collection("responses").get();
        const optionCounts = data.options.map(() => 0);
        for (const response of responses.docs) {
          const optionIndex = response.data().optionIndex;
          if (
            Number.isInteger(optionIndex) &&
            optionIndex >= 0 &&
            optionIndex < optionCounts.length
          ) {
            optionCounts[optionIndex] += 1;
          }
        }
        const totalValidResponses = optionCounts.reduce(
          (total, count) => total + count,
          0
        );
        const response = responses.docs.find(
          (responseDocument) => responseDocument.id === user.uid
        );
        const userResponse = response?.data();
        let createdAt = null;
        if (data.createdAt?.toDate) {
          createdAt = data.createdAt.toDate().toISOString();
        } else if (typeof data.createdAt === "string") {
          createdAt = data.createdAt;
        }

        return {
          id: activity.id,
          title: data.title,
          question: data.question,
          options: data.options,
          kind: data.kind,
          active: data.active === true,
          submitted: Boolean(response),
          submittedOptionIndex: userResponse?.optionIndex ?? null,
          isCorrect: userResponse?.isCorrect ?? null,
          optionPercentages: optionCounts.map((count) =>
            totalValidResponses
              ? Math.round((count / totalValidResponses) * 100)
              : 0
          ),
          createdAt,
        };
      })
    );

    activities.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    return { activities };
  }
);

export const submitInteractiveActivityResponse = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const { activityId, optionIndex } = request.data ?? {};
    if (
      typeof activityId !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(activityId) ||
      !Number.isInteger(optionIndex) ||
      optionIndex < 0
    ) {
      throw new HttpsError("invalid-argument", "Choose a valid answer.");
    }

    const activityRef = db.collection(ACTIVITY_COLLECTION).doc(activityId);
    const responseRef = activityRef.collection("responses").doc(user.uid);
    return db.runTransaction(async (transaction) => {
      const activitySnapshot = await transaction.get(activityRef);
      if (!activitySnapshot.exists || activitySnapshot.data()?.active !== true) {
        throw new HttpsError("not-found", "This activity is no longer available.");
      }
      const activity = activitySnapshot.data();
      if (optionIndex >= activity.options.length) {
        throw new HttpsError("invalid-argument", "Choose a valid answer.");
      }

      const normalizedEmail = user.email.trim().toLowerCase();
      const isAdmin = await isUserAdmin(normalizedEmail);
      const profile = await findDelegateProfile(user.email, user.uid);

      if (!isAdmin) {
        if (activity.target && activity.target.kind !== "all") {
          if (!profile || !matchesNotificationTarget(profile, activity.target)) {
            throw new HttpsError("permission-denied", "This activity is not assigned to you.");
          }
        }
      }

      const existingResponse = await transaction.get(responseRef);
      if (existingResponse.exists) {
        throw new HttpsError("already-exists", "You have already responded.");
      }

      transaction.create(responseRef, {
        uid: user.uid,
        email: user.email,
        optionIndex,
        isCorrect:
          activity.kind === "quiz"
            ? optionIndex === activity.correctOptionIndex
            : null,
        submittedAt: FieldValue.serverTimestamp(),
      });
      return {
        submitted: true,
        isCorrect:
          activity.kind === "quiz"
            ? optionIndex === activity.correctOptionIndex
            : null,
      };
    });
  }
);

export const listAdminInteractiveActivities = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);
    const snapshot = await db.collection(ACTIVITY_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    const activities = await Promise.all(snapshot.docs.map(async (activityDoc) => {
      const data = activityDoc.data();
      const responses = await activityDoc.ref.collection("responses").get();
      const optionCounts = data.options.map(() => 0);
      let correctCount = 0;
      const responseDetails = responses.docs.map((response) => {
        const answer = response.data();
        const hasValidOption =
          Number.isInteger(answer.optionIndex) &&
          answer.optionIndex >= 0 &&
          answer.optionIndex < data.options.length;

        if (hasValidOption) {
          optionCounts[answer.optionIndex] += 1;
        }
        if (answer.isCorrect === true) correctCount += 1;

        return {
          email:
            typeof answer.email === "string" && answer.email.trim()
              ? answer.email.trim()
              : "Unknown attendee",
          optionIndex: hasValidOption ? answer.optionIndex : null,
          option: hasValidOption ? data.options[answer.optionIndex] : null,
          isCorrect:
            data.kind === "quiz" && typeof answer.isCorrect === "boolean"
              ? answer.isCorrect
              : null,
        };
      });
      const totalValidResponses = optionCounts.reduce(
        (total, count) => total + count,
        0
      );

      return {
        id: activityDoc.id,
        title: data.title,
        question: data.question,
        options: data.options,
        kind: data.kind,
        active: data.active === true,
        target: data.target,
        responseCount: responses.size,
        optionCounts,
        optionPercentages: optionCounts.map((count) =>
          totalValidResponses
            ? Math.round((count / totalValidResponses) * 100)
            : 0
        ),
        correctCount: data.kind === "quiz" ? correctCount : null,
        responses: responseDetails,
      };
    }));
    return { activities };
  }
);

export const setInteractiveActivityActive = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);
    const activityId = request.data?.activityId;
    const active = request.data?.active;

    if (
      typeof activityId !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(activityId) ||
      typeof active !== "boolean"
    ) {
      throw new HttpsError("invalid-argument", "Choose a valid activity status.");
    }

    const activityRef = db.collection(ACTIVITY_COLLECTION).doc(activityId);
    return db.runTransaction(async (transaction) => {
      const activitySnapshot = await transaction.get(activityRef);
      if (!activitySnapshot.exists) {
        throw new HttpsError("not-found", "This activity could not be found.");
      }

      transaction.update(activityRef, {
        active,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { active };
    });
  }
);
