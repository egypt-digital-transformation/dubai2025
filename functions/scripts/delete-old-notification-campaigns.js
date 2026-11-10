import {initializeApp} from "firebase-admin/app";
import {getFirestore, Timestamp} from "firebase-admin/firestore";
import {FCM_PROJECT_ID} from "../shared/firebase.js";

const COLLECTION = "notificationCampaigns";
const PAGE_SIZE = 200;
const DELIVERY_BATCH_SIZE = 400;
const DEFAULT_CUTOFF = "2026-11-06T00:00:00+02:00";
const app = initializeApp(
    {projectId: FCM_PROJECT_ID},
    "notification-campaign-cleanup",
);
const db = getFirestore(app);

/**
 * Reads a named command-line option.
 * @param {string} name Option name without its leading dashes.
 * @param {string} fallback Value to use when the option is omitted.
 * @return {string} The option value.
 */
function getArgument(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

/**
 * Parses the cutoff and converts it to a Firestore timestamp.
 * @return {{rawCutoff: string, timestamp: Timestamp}} Parsed cutoff.
 */
function getCutoff() {
  const rawCutoff = getArgument("cutoff", DEFAULT_CUTOFF);
  const cutoffDate = new Date(rawCutoff);
  if (Number.isNaN(cutoffDate.getTime())) {
    throw new Error(`Invalid cutoff date: ${rawCutoff}`);
  }
  return {rawCutoff, timestamp: Timestamp.fromDate(cutoffDate)};
}

/**
 * Creates a paginated query for campaigns before the cutoff.
 * @param {Timestamp} cutoff Exclusive creation-time cutoff.
 * @return {FirebaseFirestore.Query} Campaign query.
 */
function getCampaignQuery(cutoff) {
  return db.collection(COLLECTION)
      .where("createdAt", "<", cutoff)
      .orderBy("createdAt")
      .limit(PAGE_SIZE);
}

/**
 * Counts matching campaigns and captures a small preview.
 * @param {Timestamp} cutoff Exclusive creation-time cutoff.
 * @return {Promise<{total: number, samples: object[]}>} Preview details.
 */
async function previewCampaigns(cutoff) {
  const samples = [];
  let total = 0;
  let cursor;
  let hasMore = true;

  while (hasMore) {
    let query = getCampaignQuery(cutoff);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    hasMore = !snapshot.empty;
    if (!hasMore) continue;

    total += snapshot.size;
    for (const document of snapshot.docs) {
      if (samples.length < 20) {
        const data = document.data();
        const createdAt = data.createdAt;
        samples.push({
          id: document.id,
          title: data.title || "(untitled)",
          createdAt: createdAt && typeof createdAt.toDate === "function" ?
            createdAt.toDate().toISOString() :
            "(unknown)",
        });
      }
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
  }

  return {total, samples};
}

/**
 * Deletes all delivery documents under one campaign.
 * @param {FirebaseFirestore.DocumentReference} campaignRef Campaign document.
 * @return {Promise<number>} Number of deleted deliveries.
 */
async function deleteDeliveries(campaignRef) {
  let deleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await campaignRef
        .collection("deliveries")
        .limit(DELIVERY_BATCH_SIZE)
        .get();
    hasMore = !snapshot.empty;
    if (!hasMore) continue;

    const batch = db.batch();
    for (const delivery of snapshot.docs) {
      batch.delete(delivery.ref);
    }
    await batch.commit();
    deleted += snapshot.size;
  }

  return deleted;
}

/**
 * Deletes all matching campaigns and their delivery documents.
 * @param {Timestamp} cutoff Exclusive creation-time cutoff.
 * @return {Promise<{campaignsDeleted: number, deliveriesDeleted: number}>}
 *     Deletion totals.
 */
async function deleteMatchingCampaigns(cutoff) {
  let campaignsDeleted = 0;
  let deliveriesDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await getCampaignQuery(cutoff).get();
    hasMore = !snapshot.empty;
    if (!hasMore) continue;

    for (const campaign of snapshot.docs) {
      deliveriesDeleted += await deleteDeliveries(campaign.ref);
      await campaign.ref.delete();
      campaignsDeleted += 1;
      console.log(`Deleted campaign ${campaign.id}`);
    }
  }

  return {campaignsDeleted, deliveriesDeleted};
}

/**
 * Previews the cleanup and deletes only with an exact confirmation token.
 * @return {Promise<void>} Resolves when the operation completes.
 */
async function main() {
  const projectId = app.options.projectId;
  if (projectId !== FCM_PROJECT_ID) {
    throw new Error(
        `Refusing to run against project "${projectId || "unknown"}"; expected "${FCM_PROJECT_ID}".`,
    );
  }

  const {rawCutoff, timestamp} = getCutoff();
  const {total, samples} = await previewCampaigns(timestamp);
  console.log(`Project: ${projectId}`);
  console.log(`Collection: ${COLLECTION}`);
  console.log(`Cutoff (exclusive): ${rawCutoff}`);
  console.log(`Matching campaigns: ${total}`);
  console.log("The cleanup also deletes each matching campaign's deliveries subcollection.");
  console.table(samples);

  if (!process.argv.includes("--delete")) {
    console.log("Preview only. Add --delete and the exact confirmation token to delete.");
    return;
  }

  const confirmation = `DELETE_NOTIFICATION_CAMPAIGNS_BEFORE_${rawCutoff}`;
  if (getArgument("confirm", "") !== confirmation) {
    throw new Error(`Deletion not confirmed. Add --confirm=${confirmation}`);
  }

  const result = await deleteMatchingCampaigns(timestamp);
  console.log(
      `Cleanup complete: deleted ${result.campaignsDeleted} campaigns and ` +
    `${result.deliveriesDeleted} delivery documents.`,
  );
}

main().catch((error) => {
  console.error("[notification-campaign-cleanup] Failed:", error);
  process.exitCode = 1;
});
