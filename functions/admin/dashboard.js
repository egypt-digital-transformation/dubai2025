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

export const removeAdminHomeAnnouncement = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);

    const campaignId = request.data?.campaignId;
    if (
      typeof campaignId !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(campaignId)
    ) {
      throw new HttpsError("invalid-argument", "A valid announcement ID is required.");
    }

    const campaignRef = db.collection(CAMPAIGN_COLLECTION).doc(campaignId);
    const campaignSnapshot = await campaignRef.get();
    if (
      !campaignSnapshot.exists ||
      campaignSnapshot.data()?.homeHighlightActive !== true
    ) {
      throw new HttpsError("not-found", "The highlighted announcement is no longer active.");
    }

    await campaignRef.update({
      homeHighlightActive: false,
      homeHighlightRemovedAt: FieldValue.serverTimestamp(),
    });
    return { removed: true };
  }
);

export const activateAdminHomeAnnouncement = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);

    const campaignId = request.data?.campaignId;
    if (
      typeof campaignId !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(campaignId)
    ) {
      throw new HttpsError("invalid-argument", "A valid campaign ID is required.");
    }

    const campaignRef = db.collection(CAMPAIGN_COLLECTION).doc(campaignId);
    const campaignSnapshot = await campaignRef.get();
    const campaign = campaignSnapshot.data();
    if (
      !campaignSnapshot.exists ||
      !campaign?.target ||
      typeof campaign.title !== "string" ||
      typeof campaign.body !== "string" ||
      !["complete", "partial", "in_app"].includes(campaign.status)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Only a sent audience notification can be highlighted on Home."
      );
    }

    await campaignRef.update({
      highlightOnHome: true,
      homeHighlightActive: true,
      homeHighlightRemovedAt: FieldValue.delete(),
    });
    return { active: true };
  }
);

export const getAdminDashboard = onCall(
  { region: "europe-west1" },
  async (request) => {
    await requireAdminUser(request);

    const campaignsRef = db.collection(CAMPAIGN_COLLECTION);
    const [campaignsSnapshot, featuredAnnouncementsSnapshot] =
      await Promise.all([
        campaignsRef.orderBy("createdAt", "desc").limit(20).get(),
        campaignsRef.where("homeHighlightActive", "==", true).get(),
      ]);

    const campaigns = campaignsSnapshot.docs.map((campaignDocument) => {
      const campaign = campaignDocument.data();
      return {
        id: campaignDocument.id,
        title: campaign.title,
        targetLabel: campaign.targetLabel,
        createdAt: timestampToIso(campaign.createdAt),
        targetCount: campaign.targetCount || 0,
        inAppCount: campaign.inAppCount || campaign.targetCount || 0,
        pushReadyCount: campaign.pushReadyCount || 0,
        acceptedCount: campaign.acceptedCount || 0,
        failedCount: campaign.failedCount || 0,
        openedCount: campaign.openedCount || 0,
        status: campaign.status,
        scheduledAt: timestampToIso(campaign.scheduledAt),
        highlightOnHome: campaign.highlightOnHome === true,
        homeHighlightActive: campaign.homeHighlightActive === true,
        canHighlightOnHome: Boolean(campaign.target),
      };
    });
    const featuredAnnouncements = featuredAnnouncementsSnapshot.docs
      .map((campaignDocument) => {
        const campaign = campaignDocument.data();
        return {
          id: campaignDocument.id,
          title: campaign.title,
          body: campaign.body,
          targetLabel: campaign.targetLabel,
          createdAt: timestampToIso(campaign.createdAt),
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return {
      refreshedAt: new Date().toISOString(),
      totalAttendees: 0,
      totalLoggedIn: 0,
      activeLoggedIn: 0,
      installedUsers: 0,
      pushReadyUsers: 0,
      attendees: [],
      campaigns,
      featuredAnnouncements,
    };
  }
);
