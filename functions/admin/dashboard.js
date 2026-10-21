import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  CAMPAIGN_COLLECTION,
  db,
  FieldValue,
} from "../shared/firebase.js";
import { requireAdminUser } from "../shared/admin-auth.js";
import { timestampToIso } from "../shared/notification-utils.js";

export const createAdminAnnouncement = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);

    const rawTitle = request.data?.title;
    const rawDescription = request.data?.description;
    const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
    const description =
      typeof rawDescription === "string" ? rawDescription.trim() : "";
    const priority = request.data?.priority;
    if (
      title.length < 1 ||
      title.length > 120 ||
      description.length < 1 ||
      description.length > 2000 ||
      !["normal", "high"].includes(priority)
    ) {
      throw new HttpsError("invalid-argument", "Enter a valid announcement.");
    }

    await db.collection("announcements").add({
      title,
      description,
      priority,
      active: true,
      timestamp: FieldValue.serverTimestamp(),
    });
    return { created: true };
  }
);

export const getAdminDashboard = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);

    const campaignsSnapshot = await db
      .collection(CAMPAIGN_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();

    const campaigns = campaignsSnapshot.docs.map((campaignDocument) => {
      const campaign = campaignDocument.data();
      return {
        id: campaignDocument.id,
        title: campaign.title,
        targetLabel: campaign.targetLabel,
        createdAt: timestampToIso(campaign.createdAt),
        targetCount: campaign.targetCount || 0,
        pushReadyCount: campaign.pushReadyCount || 0,
        acceptedCount: campaign.acceptedCount || 0,
        failedCount: campaign.failedCount || 0,
        openedCount: campaign.openedCount || 0,
        status: campaign.status,
        scheduledAt: timestampToIso(campaign.scheduledAt),
      };
    });

    return {
      refreshedAt: new Date().toISOString(),
      totalAttendees: 0,
      totalLoggedIn: 0,
      activeLoggedIn: 0,
      installedUsers: 0,
      pushReadyUsers: 0,
      attendees: [],
      campaigns,
    };
  }
);
