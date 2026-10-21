import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";

const app = initializeApp();

export const FCM_PROJECT_ID = "mea-egypt-ahlanapp-prd";

export const db = getFirestore(app);
export const getMessaging = () => getAdminMessaging(app);
export { FieldValue, Timestamp };

export const ADMIN_COLLECTION = "admins";
export const APP_ANALYTICS_COLLECTION = "appAnalytics";
export const CAMPAIGN_COLLECTION = "notificationCampaigns";
