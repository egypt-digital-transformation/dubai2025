import { createHash } from "node:crypto";

export const SEGMENT_FIELDS = new Set([
  "participantsGroup",
  "plantVisit",
]);

export function emailDocumentId(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function tokenFingerprint(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function matchesNotificationTarget(userDocument, target) {
  if (target.kind === "all") {
    return true;
  }

  if (target.kind === "user") {
    return userDocument.id === target.userId;
  }
  if (target.kind === "users") {
    return Array.isArray(target.userIds) && target.userIds.includes(userDocument.id);
  }

  if (target.kind !== "segment" || !SEGMENT_FIELDS.has(target.field)) {
    return false;
  }

  const [parent, child] = target.field.split(".");
  const data = userDocument.data();
  const value = child ? data[parent]?.[child] : data[parent];
  if (parent === "plantVisit") {
    return value === true && target.value === "true";
  }
  return String(value ?? "") === target.value;
}

export function timestampToIso(value) {
  return value?.toDate ? value.toDate().toISOString() : null;
}
