import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

initializeApp();

export const db = getFirestore();
export { FieldValue, Timestamp, getMessaging };

export const ADMIN_COLLECTION = "admins";
export const APP_ANALYTICS_COLLECTION = "appAnalytics";
export const CAMPAIGN_COLLECTION = "notificationCampaigns";
