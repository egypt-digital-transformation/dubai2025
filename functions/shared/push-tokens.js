import { FCM_PROJECT_ID } from "./firebase.js";
import { tokenFingerprint } from "./notification-utils.js";

export function getRegisteredPushDevices(data = {}) {
  const devices = Array.isArray(data.devices)
    ? data.devices
        .filter(
          (device) =>
            device &&
            typeof device.token === "string" &&
            device.token.length > 0 &&
            device.fcmProjectId === FCM_PROJECT_ID
        )
        .map((device) => ({
          deviceId:
            typeof device.deviceId === "string" && device.deviceId
              ? device.deviceId
              : `legacy-${tokenFingerprint(device.token).slice(0, 16)}`,
          token: device.token,
          fcmProjectId: device.fcmProjectId,
          isLegacy: false,
        }))
    : [];

  if (
    typeof data.fcmToken === "string" &&
    data.fcmToken.length > 0 &&
    data.fcmProjectId === FCM_PROJECT_ID
  ) {
    devices.push({
      deviceId: `legacy-${tokenFingerprint(data.fcmToken).slice(0, 16)}`,
      token: data.fcmToken,
      fcmProjectId: data.fcmProjectId,
      isLegacy: true,
    });
  }

  const uniqueDevices = new Map();
  for (const device of devices) {
    if (!uniqueDevices.has(device.token)) {
      uniqueDevices.set(device.token, device);
    }
  }
  return [...uniqueDevices.values()];
}
