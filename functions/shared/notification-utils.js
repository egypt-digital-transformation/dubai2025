import { createHash } from "node:crypto";

export const SEGMENT_FIELDS = new Set([
  "day2.group",
  "day3.type",
  "day3.groupAM",
  "day3.groupPM",
]);

export function emailDocumentId(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function matchesNotificationTarget(userDocument, target) {
  if (target.kind === "all") {
    return true;
  }

  if (target.kind === "user") {
    return userDocument.id === target.userId;
  }

  if (target.kind !== "segment" || !SEGMENT_FIELDS.has(target.field)) {
    return false;
  }

  const [parent, child] = target.field.split(".");
  return String(userDocument.data()[parent]?.[child] ?? "") === target.value;
}

export function timestampToIso(value) {
  return value?.toDate ? value.toDate().toISOString() : null;
}
