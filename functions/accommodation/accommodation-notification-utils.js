function normalizeDetail(value) {
  return value == null ? "" : String(value).trim();
}

export function hasDetailsChanged(before, after, fields) {
  if (!after) {
    return false;
  }
  return fields.some((field) => {
    const previousValue = normalizeDetail(before ? before[field] : "");
    const currentValue = normalizeDetail(after[field]);
    return Boolean(currentValue && currentValue !== previousValue);
  });
}

export function hasRoomAssignmentChanged(before, after) {
  return hasDetailsChanged(before, after, ["roomNumber"]);
}
