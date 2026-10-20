import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  APP_ANALYTICS_COLLECTION,
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

    const [activitySnapshot, attendeesSnapshot, campaignsSnapshot] = await Promise.all([
      db.collection(APP_ANALYTICS_COLLECTION).get(),
      db.collection("users").get(),
      db.collection(CAMPAIGN_COLLECTION).orderBy("createdAt", "desc").limit(20).get(),
    ]);
    const activeCutoff = Date.now() - 15 * 60 * 1000;
    const activityByEmail = new Map();
    let activeLoggedIn = 0;
    let totalLoggedIn = 0;
    let installedUsers = 0;

    for (const activityDocument of activitySnapshot.docs) {
      const activity = activityDocument.data();
      const email = activity.email?.trim().toLowerCase();
      if (activity.firstLoginAt) {
        totalLoggedIn += 1;
      }
      if (activity.installedAt) {
        installedUsers += 1;
      }
      const active =
        activity.lastActiveAt?.toMillis?.() >= activeCutoff;
      if (active) {
        activeLoggedIn += 1;
      }
      if (email) {
        activityByEmail.set(email, {
          loggedIn: !!activity.firstLoginAt,
          active,
          installed: !!activity.installedAt,
        });
      }
    }

    const attendees = attendeesSnapshot.docs
      .map((attendeeDocument) => {
        const data = attendeeDocument.data();
        const email = attendeeDocument.id.trim();
        if (!email) {
          return null;
        }
        const day2Group = data.day2?.group;
        const day3Type = data.day3?.type;
        const day3GroupAM = data.day3?.groupAM;
        const day3GroupPM = data.day3?.groupPM;
        const participantsGroup = data.participantsGroup;

        return {
          id: attendeeDocument.id,
          email,
          name: data.displayName || data.name || "",
          day2Group: day2Group == null ? "" : String(day2Group),
          day3Type: day3Type == null ? "" : String(day3Type),
          day3GroupAM: day3GroupAM == null ? "" : String(day3GroupAM),
          day3GroupPM: day3GroupPM == null ? "" : String(day3GroupPM),
          participantsGroup:
            participantsGroup == null ? "" : String(participantsGroup),
          hasPushToken: typeof data.fcmToken === "string" && data.fcmToken.length > 0,
          ...(activityByEmail.get(email.toLowerCase()) ?? {
            loggedIn: false,
            active: false,
            installed: false,
          }),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.email.localeCompare(b.email));

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
      totalAttendees: attendees.length,
      totalLoggedIn,
      activeLoggedIn,
      installedUsers,
      pushReadyUsers: attendees.filter((attendee) => attendee.hasPushToken).length,
      attendees,
      campaigns,
    };
  }
);
