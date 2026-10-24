const EVENT_TIME_ZONE = "Africa/Cairo";

const eventTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: EVENT_TIME_ZONE,
  calendar: "gregory",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parseEventDate(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const [, yearText, dayText, monthText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function parseEventTime(value) {
  if (typeof value !== "string") {
    return null;
  }
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  return { hour, minute, second };
}

function eventLocalTimeToDate(dateParts, timeParts) {
  const targetUtcMillis = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
    timeParts.second
  );
  let candidateMillis = targetUtcMillis;

  for (let attempt = 0; attempt < 2; attempt++) {
    const formattedParts = Object.fromEntries(
      eventTimeFormatter
        .formatToParts(new Date(candidateMillis))
        .filter((part) => part.type !== "literal")
        .map(({ type, value }) => [type, Number(value)])
    );
    const formattedUtcMillis = Date.UTC(
      formattedParts.year,
      formattedParts.month - 1,
      formattedParts.day,
      formattedParts.hour,
      formattedParts.minute,
      formattedParts.second
    );
    candidateMillis += targetUtcMillis - formattedUtcMillis;
  }

  const result = new Date(candidateMillis);
  const resolved = Object.fromEntries(
    eventTimeFormatter
      .formatToParts(result)
      .filter((part) => part.type !== "literal")
      .map(({ type, value }) => [type, Number(value)])
  );
  if (
    resolved.year !== dateParts.year ||
    resolved.month !== dateParts.month ||
    resolved.day !== dateParts.day ||
    resolved.hour !== timeParts.hour ||
    resolved.minute !== timeParts.minute ||
    resolved.second !== timeParts.second
  ) {
    return null;
  }
  return result;
}

export function getDueAgendaLabels(dayDocument, windowStart, windowEnd) {
  const dateParts = parseEventDate(dayDocument?.date);
  if (!dateParts || !Array.isArray(dayDocument?.labels)) {
    return [];
  }

  return dayDocument.labels.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }
    if (value.reminderSent === true) {
      return [];
    }
    const label = typeof value.label === "string" ? value.label.trim() : "";
    const timeParts = parseEventTime(value.startTime);
    if (!label || !timeParts) {
      return [];
    }
    const startAt = eventLocalTimeToDate(dateParts, timeParts);
    if (
      !startAt ||
      startAt < windowStart ||
      startAt > windowEnd
    ) {
      return [];
    }
    return [{
      index,
      label,
      startTime: value.startTime,
      startAt,
      dayNumber: dayDocument.dayNumber,
    }];
  });
}
