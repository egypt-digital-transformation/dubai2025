import { getMessaging } from "./firebase.js";

export async function sendSessionReminderNotification(token, title, sessionId) {
  const data = {
    sessionId,
    title: title || "",
  };
  const stringData = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = typeof value === "string" ? value : JSON.stringify(value);
  }

  return getMessaging().send({
    token,
    notification: {
      title: "Session Starting Soon!",
      body: `Your "${title}" starts in 5 minutes.`,
    },
    data: stringData,
    webpush: {
      notification: {
        title: "Session Starting Soon!",
        body: `Your "${title}" starts in 5 minutes.`,
        icon: "/assets/icon/favicon.png",
        badge: "/assets/icon/favicon.png",
      },
      fcmOptions: {
        link: "/",
      },
    },
  });
}
