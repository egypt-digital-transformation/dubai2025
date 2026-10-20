import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, FieldValue } from "../shared/firebase.js";
import {
  requireAdminUser,
  requireAuthenticatedUser,
} from "../shared/admin-auth.js";
import {
  matchesNotificationTarget,
  SEGMENT_FIELDS,
} from "../shared/notification-utils.js";
import {
  getTargetRecipients,
  sendPushToRecipients,
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
      acceptedCount: 0,
      failedCount: 0,
      deliveryError: false,
    };
    try {
      const { recipients } = await getTargetRecipients(target);
      notificationSummary.pushReadyCount = recipients.length;
      const results = await sendPushToRecipients(recipients, {
        title: `${kind === "quiz" ? "New quiz" : "New poll"}: ${title.trim()}`,
        body: "Open the app to participate.",
        data: {
          activityId: activityRef.id,
          kind,
          url: "/activities",
        },
        link: "/activities",
      });
      notificationSummary = {
        acceptedCount: results.filter((result) => result.success).length,
        failedCount: results.filter((result) => !result.success).length,
        deliveryError: false,
      };
      await activityRef.set(
        { notificationSummary, notificationSentAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (error) {
      console.error(
        `[InteractiveActivities] Failed to notify attendees about ${kind} ${activityRef.id}:`,
        error
      );
      notificationSummary.deliveryError = true;
    }

    return { id: activityRef.id, notificationSummary };
  }
);

export const listInteractiveActivities = onCall(
  { region: "europe-west1" },
  async (request) => {
    const user = requireAuthenticatedUser(request);
    const normalizedEmail = user.email.trim().toLowerCase();
    const usersRef = db.collection("users");
    let userSnapshot = await usersRef.where("email", "==", normalizedEmail).get();
    if (userSnapshot.empty && normalizedEmail !== user.email) {
      userSnapshot = await usersRef.where("email", "==", user.email).get();
    }
    if (userSnapshot.size !== 1) {
      throw new HttpsError(
        "failed-precondition",
        "Your delegate profile could not be uniquely matched."
      );
    }
    const profile = userSnapshot.docs[0];

    const activitiesSnapshot = await db
      .collection(ACTIVITY_COLLECTION)
      .where("active", "==", true)
      .get();
    const available = activitiesSnapshot.docs.filter((activity) =>
      matchesNotificationTarget(profile, activity.data().target)
    );
    const activities = await Promise.all(
      available.map(async (activity) => {
        const response = await activity.ref
          .collection("responses")
          .doc(user.uid)
          .get();
        const data = activity.data();
        return {
          id: activity.id,
          title: data.title,
          question: data.question,
          options: data.options,
          kind: data.kind,
          submitted: response.exists,
        };
      })
    );

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
      const usersRef = db.collection("users");
      let profileSnapshot = await usersRef
        .where("email", "==", normalizedEmail)
        .limit(2)
        .get();
      if (profileSnapshot.empty && normalizedEmail !== user.email) {
        profileSnapshot = await usersRef
          .where("email", "==", user.email)
          .limit(2)
          .get();
      }
      if (
        profileSnapshot.size !== 1 ||
        !matchesNotificationTarget(profileSnapshot.docs[0], activity.target)
      ) {
        throw new HttpsError("permission-denied", "This activity is not assigned to you.");
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
      for (const response of responses.docs) {
        const answer = response.data();
        if (Number.isInteger(answer.optionIndex) &&
            answer.optionIndex >= 0 &&
            answer.optionIndex < optionCounts.length) {
          optionCounts[answer.optionIndex] += 1;
        }
        if (answer.isCorrect === true) correctCount += 1;
      }

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
        correctCount: data.kind === "quiz" ? correctCount : null,
      };
    }));
    return { activities };
  }
);
