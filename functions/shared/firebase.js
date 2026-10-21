import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";

initializeApp();

export const FCM_PROJECT_ID = "mea-egypt-ahlanapp-prd";
const notificationApp = initializeApp(
  {
    credential: applicationDefault(),
    projectId: FCM_PROJECT_ID,
  },
  "notification-sender"
);

export const db = getFirestore();
export const getMessaging = () => getAdminMessaging(notificationApp);
export { FieldValue, Timestamp };

export const ADMIN_COLLECTION = "admins";
export const APP_ANALYTICS_COLLECTION = "appAnalytics";
export const CAMPAIGN_COLLECTION = "notificationCampaigns";
