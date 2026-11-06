const EVENT_TIME_ZONE = "Africa/Cairo";
const STANDARD_REMINDER_LEAD_MS = 5 * 60 * 1000;
export const MAX_REMINDER_LEAD_MS = 15 * 60 * 1000;

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
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Primary format: DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY (e.g. "09/11/2026", "10/11/2026", "09/11/26")
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const rawYear = Number(dmyMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      ) {
        return { year, month, day };
      }
    }
    return null;
  }

  // 2. Format: YYYY-MM-DD or YYYY-DD-MM (e.g. "2026-11-09" or legacy "2026-09-11")
  const ymdMatch = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const p2 = Number(ymdMatch[2]);
    const p3 = Number(ymdMatch[3]);

    // Check if p3 is month 11 (November event) and p2 is a valid day (legacy YYYY-DD-MM)
    if (p3 === 11 && p2 !== 11 && p2 >= 1 && p2 <= 31) {
      const dmyDate = new Date(Date.UTC(year, p3 - 1, p2));
      if (
        dmyDate.getUTCFullYear() === year &&
        dmyDate.getUTCMonth() === p3 - 1 &&
        dmyDate.getUTCDate() === p2
      ) {
        return { year, month: p3, day: p2 };
      }
    }

    // Standard ISO: YYYY-MM-DD
    if (p2 >= 1 && p2 <= 12 && p3 >= 1 && p3 <= 31) {
      const isoDate = new Date(Date.UTC(year, p2 - 1, p3));
      if (
        isoDate.getUTCFullYear() === year &&
        isoDate.getUTCMonth() === p2 - 1 &&
        isoDate.getUTCDate() === p3
      ) {
        return { year, month: p2, day: p3 };
      }
    }

    // General YYYY-DD-MM
    if (p3 >= 1 && p3 <= 12 && p2 >= 1 && p2 <= 31) {
      const dmyDate = new Date(Date.UTC(year, p3 - 1, p2));
      if (
        dmyDate.getUTCFullYear() === year &&
        dmyDate.getUTCMonth() === p3 - 1 &&
        dmyDate.getUTCDate() === p2
      ) {
        return { year, month: p3, day: p2 };
      }
    }
  }

  return null;
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

  const scheduledLabels = dayDocument.labels.flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }
    const label = typeof value.label === "string" ? value.label.trim() : "";
    const timeParts = parseEventTime(value.startTime);
    if (!label || !timeParts) {
      return [];
    }
    const startAt = eventLocalTimeToDate(dateParts, timeParts);
    if (!startAt) {
      return [];
    }
    return [{
      index,
      label,
      startTime: value.startTime,
      startAt,
      dayNumber: dayDocument.dayNumber,
      reminderSent: value.reminderSent === true,
    }];
  });

  const firstItem = scheduledLabels.reduce(
    (earliest, candidate) =>
      !earliest || candidate.startAt < earliest.startAt ? candidate : earliest,
    null
  );
  const standardWindowEnd = new Date(
    Math.min(
      windowEnd.getTime(),
      windowStart.getTime() + STANDARD_REMINDER_LEAD_MS
    )
  );

  return scheduledLabels.flatMap((scheduledLabel) => {
    const firstItemOfDay = scheduledLabel.index === firstItem?.index;
    const labelWindowEnd = firstItemOfDay ? windowEnd : standardWindowEnd;
    if (
      scheduledLabel.reminderSent ||
      scheduledLabel.startAt < windowStart ||
      scheduledLabel.startAt > labelWindowEnd
    ) {
      return [];
    }

    const { reminderSent, ...dueLabel } = scheduledLabel;
    return [{ ...dueLabel, firstItemOfDay }];
  });
}

function normalizeAgendaLabelKey(label) {
  if (typeof label !== "string") {
    return "";
  }
  return label
    .trim()
    .replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u2032`]/g, "'")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const CUSTOM_AGENDA_REMINDERS = new Map(
  [
    [
      "Welcome Cocktail Dinner",
      {
        title: "Welcome to Cairo!",
        body: "Join us shortly for the Welcome Cocktail Dinner — an evening of great conversations, connections, and warm hospitality.",
      },
    ],
    [
      "Welcome & Strategic Alignment",
      {
        title: "Kickoff: Welcome & Strategic Alignment",
        body: "We are about to begin! Join us in the Versailles Ballroom as we set the vision and strategic direction for AMEA.",
      },
    ],
    [
      "HEALTH & SAFETY: Challenge the Green and Embrace the Red",
      {
        title: "Health & Safety in Focus",
        body: "\"Challenge the Green and Embrace the Red\" starts shortly — join us as we reinforce our commitment to safety leadership across AMEA.",
      },
    ],
    [
      "Growth in Attractive Markets: Unlocking AMEA's Growth Potential",
      {
        title: "Unlocking AMEA’s Growth Potential",
        body: "Our session on \"Growth in Attractive Markets\" starts shortly — discover the key opportunities shaping our region's future.",
      },
    ],
    [
      "Beyond Cement: Expanding AMEA's Building Solutions",
      {
        title: "Expanding AMEA’s Building Solutions",
        body: "Join us shortly for \"Beyond Cement\" as we explore how innovative building solutions are driving our next chapter of growth.",
      },
    ],
    [
      "Group Photo",
      {
        title: "Time for Our Group Photo!",
        body: "Let’s capture this moment together! Please gather shortly at the photo area for the official Group Photo.",
      },
    ],
    [
      "Lunch Break",
      {
        title: "Time to Refuel & Connect!",
        body: "Lunch Break is starting shortly. Enjoy a delicious meal and great conversations with colleagues!",
      },
    ],
    [
      "WORKSHOPS: From Strategy to Execution- Driving Growth Across AMEA",
      {
        title: "From Strategy to Execution!",
        body: "Your interactive workshop on Driving Growth Across AMEA starts shortly. Head to The Foyer - Outside Versailles and bring your insights!",
      },
    ],
    [
      "PEOPLE PANEL",
      {
        title: "Spotlight on Our People!",
        body: "The People Panel begins shortly — get ready for an engaging discussion and valuable perspectives from our speakers!",
      },
    ],
    [
      "OUR GROWTH AGENDA",
      {
        title: "Shaping Our Growth Agenda",
        body: "Join us shortly for \"Our Growth Agenda\" as we align on our priorities and ambitions ahead.",
      },
    ],
    [
      "AMEA FINANCE",
      {
        title: "AMEA Finance in Focus",
        body: "The AMEA Finance session starts shortly — make sure you're in your seat for key insights and updates!",
      },
    ],
    [
      "Ask the Group Leadership Team",
      {
        title: "Live Q&A: Ask the Leadership Team!",
        body: "\"Ask the Group Leadership Team\" starts shortly. Bring your questions for an open, candid discussion!",
      },
    ],
    [
      "Leadership Dialogue: Strategic Priorities to Deliver Growth Across AMEA",
      {
        title: "Leadership Dialogue: Strategic Priorities",
        body: "Join our Leadership Dialogue shortly as we discuss the strategic priorities driving growth across AMEA!",
      },
    ],
    [
      "Closing Remarks and Wrap up",
      {
        title: "Closing Remarks & Key Takeaways",
        body: "Stay tuned as we wrap up our sessions and bring everything together with our final takeaways and next steps!",
      },
    ],
    [
      "Gala Dinner",
      {
        title: "An Evening to Celebrate: Gala Dinner!",
        body: "Get ready for a memorable night! Our Gala Dinner begins shortly — join us for an evening of celebration and entertainment.",
      },
    ],
    [
      "Move from Four Seasons to SOK Plant",
      {
        title: "Next Stop: Sokhna Plant!",
        body: "We are departing shortly from the Hotel to Sokhna Plant. Please head to the departure point.",
      },
    ],
    [
      "Lounge",
      {
        title: "Welcome & Unwind at the Lounge",
        body: "The Lounge is open! Grab a refreshment, relax, and connect before our next activity.",
      },
    ],
    [
      "Sokhna Plant Line 5 Inauguration",
      {
        title: "Celebrating a Historic Milestone!",
        body: "History in the making! Get ready to celebrate the official Sokhna Plant Line 5 Inauguration — a proud landmark achievement for our team and our future!",
      },
    ],
    [
      "Break",
      {
        title: "Time for a Quick Recharge!",
        body: "Take a short break to grab a coffee, refresh, and network before we continue.",
      },
    ],
    [
      "Lunch",
      {
        title: "Time to Refuel & Connect!",
        body: "Lunch is being served shortly. Enjoy a great meal and catch up with colleagues!",
      },
    ],
    [
      "Leadership Team will depart SOK Plant to Hotel",
      {
        title: "Leadership Team Departure",
        body: "The Leadership Team will be departing Sokhna Plant for the hotel shortly. Please make your way to the vehicles.",
      },
    ],
    [
      "Sokhna Plant Tour",
      {
        title: "Explore Sokhna Plant in Action!",
        body: "Get ready for our guided tour of the Sokhna Plant — see our operations and innovation up close.",
      },
    ],
    [
      "Depart from Sokhna Plant to Four Seasons Hotel",
      {
        title: "Heading Back to the Hotel",
        body: "We are getting ready to depart from Sokhna Plant back to the Hotel.",
      },
    ],
    [
      "Move from Hotel to Grand Egyptian Museum (GEM)",
      {
        title: "Off to the Grand Egyptian Museum!",
        body: "Time to head out! We are departing the hotel shortly for the Grand Egyptian Museum (GEM).",
      },
    ],
    [
      "GEM Experience",
      {
        title: "Step Into History at the GEM!",
        body: "Your exclusive Grand Egyptian Museum experience begins shortly. Get ready to explore thousands of years of wonder!",
      },
    ],
    [
      "Leave GEM to the Great Pyramids of Giza",
      {
        title: "Next Stop: The Great Pyramids!",
        body: "We are departing the Grand Egyptian Museum shortly and heading to the Great Pyramids of Giza.",
      },
    ],
    [
      "Touring Great Pyramids of Giza",
      {
        title: "Timeless Wonders Await!",
        body: "We are about to begin our tour of the Great Pyramids of Giza — an unforgettable journey through ancient history.",
      },
    ],
    [
      "Arrive at Laduree by the Pyramids for Lunch with a Historic View",
      {
        title: "Lunch with a Historic View!",
        body: "Welcome to Ladurée by the Pyramids — sit back, connect, and enjoy an unforgettable lunch overlooking the Pyramids.",
      },
    ],
    [
      "Move from Four Seasons to the Grand Egyptian Museum (GEM)",
      {
        title: "An Iconic Evening at the GEM!",
        body: "We are departing the Hotel shortly for the Grand Egyptian Museum. Please gather at the departure point.",
      },
    ],
    [
      "Start of A New Era of Excellence (Holcim Egypt Rebranding Event)",
      {
        title: "A New Era of Excellence Begins!",
        body: "The wait is over! Get ready for an unforgettable celebration as we proudly unveil a bold new chapter at the Holcim Egypt Rebranding Event!",
      },
    ],
    [
      "Leave GEM to Four Seasons",
      {
        title: "Wrapping Up an Unforgettable Day!",
        body: "What an incredible day of milestones and celebrations! It is now time to head back to the Hotel — have a wonderful and restful night!",
      },
    ],
  ].map(([key, value]) => [normalizeAgendaLabelKey(key), value])
);

export function getAgendaReminderMessage(label) {
  const cleanLabel = typeof label === "string" ? label.trim() : "";
  const normalizedKey = normalizeAgendaLabelKey(cleanLabel);
  const customMessage = CUSTOM_AGENDA_REMINDERS.get(normalizedKey);
  if (customMessage) {
    return customMessage;
  }

  if (/^(move|depart|leave)\b|\bwill depart\b/i.test(cleanLabel)) {
    return {
      title: "Departure Reminder",
      body: `Up next on your agenda: ${cleanLabel}.`,
    };
  }

  return {
    title: "Up Next on Your Agenda",
    body: cleanLabel
      ? `"${cleanLabel}" is starting shortly.`
      : "Your next agenda item is starting shortly.",
  };
}
