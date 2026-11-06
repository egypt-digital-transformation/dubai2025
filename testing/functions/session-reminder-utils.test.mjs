import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAgendaReminderMessage,
  getDueAgendaLabels,
} from "../../functions/reminders/session-reminder-utils.js";

describe("getDueAgendaLabels", () => {
  it("parses agenda dates in dd/mm/yyyy format for reminders", () => {
    const labels = getDueAgendaLabels(
      {
        date: "09/11/2026",
        dayNumber: 1,
        labels: [{ label: "Welcome Cocktail Dinner", startTime: "19:00" }],
      },
      new Date("2026-11-09T16:59:00.000Z"),
      new Date("2026-11-09T17:01:00.000Z")
    );

    assert.equal(labels.length, 1);
    assert.equal(labels[0].startAt.toISOString(), "2026-11-09T17:00:00.000Z");
  });

  it("parses agenda dates as year-day-month for reminders", () => {
    const labels = getDueAgendaLabels(
      {
        date: "2026-09-11",
        dayNumber: 1,
        labels: [{ label: "Welcome Cocktail Dinner", startTime: "19:00" }],
      },
      new Date("2026-11-09T16:59:00.000Z"),
      new Date("2026-11-09T17:01:00.000Z")
    );

    assert.equal(labels.length, 1);
    assert.equal(labels[0].startAt.toISOString(), "2026-11-09T17:00:00.000Z");
  });

  it("uses the label start time, not the nested session start time", () => {
    const labels = getDueAgendaLabels(
      {
        date: "2026-10-11",
        dayNumber: 2,
        labels: [
          { label: "Welcome & Strategic Alignment", startTime: "09:00" },
        ],
        sessions: [
          { label: "Welcome & Strategic Alignment", startTime: "09:45" },
        ],
      },
      new Date("2026-11-10T06:59:00.000Z"),
      new Date("2026-11-10T07:01:00.000Z")
    );

    assert.equal(labels.length, 1);
    assert.equal(labels[0].label, "Welcome & Strategic Alignment");
    assert.equal(labels[0].startAt.toISOString(), "2026-11-10T07:00:00.000Z");
  });

  it("returns one reminder per label even when multiple sessions share it", () => {
    const labels = getDueAgendaLabels(
      {
        date: "2026-10-11",
        dayNumber: 2,
        labels: [
          { label: "Welcome & Strategic Alignment", startTime: "09:00" },
        ],
        sessions: [
          { label: "Welcome & Strategic Alignment", startTime: "09:00" },
          { label: "Welcome & Strategic Alignment", startTime: "09:05" },
        ],
      },
      new Date("2026-11-10T06:59:00.000Z"),
      new Date("2026-11-10T07:01:00.000Z")
    );

    assert.equal(labels.length, 1);
  });

  it("keeps repeated labels at different start times as separate reminders", () => {
    const labels = getDueAgendaLabels(
      {
        date: "2026-10-11",
        dayNumber: 2,
        labels: [
          { label: "Workshops", startTime: "13:00" },
          { label: "Workshops", startTime: "14:00" },
        ],
      },
      new Date("2026-11-10T10:59:00.000Z"),
      new Date("2026-11-10T11:01:00.000Z")
    );

    assert.equal(labels.length, 1);
    assert.equal(labels[0].index, 0);
  });

  it("makes the earliest item of the day eligible 15 minutes ahead", () => {
    const labels = getDueAgendaLabels(
      {
        date: "2026-10-11",
        dayNumber: 2,
        labels: [
          { label: "Breakfast", startTime: "09:00" },
          { label: "Opening Session", startTime: "09:30" },
        ],
      },
      new Date("2026-11-10T06:45:00.000Z"),
      new Date("2026-11-10T07:00:00.000Z")
    );

    assert.equal(labels.length, 1);
    assert.equal(labels[0].label, "Breakfast");
    assert.equal(labels[0].firstItemOfDay, true);
  });

  it("keeps later items on the existing five-minute reminder window", () => {
    const dayDocument = {
      date: "2026-10-11",
      dayNumber: 2,
      labels: [
        { label: "Breakfast", startTime: "09:00" },
        { label: "Opening Session", startTime: "09:30" },
      ],
    };
    const labelsTooEarly = getDueAgendaLabels(
      dayDocument,
      new Date("2026-11-10T07:15:00.000Z"),
      new Date("2026-11-10T07:30:00.000Z")
    );
    const labelsInStandardWindow = getDueAgendaLabels(
      dayDocument,
      new Date("2026-11-10T07:25:00.000Z"),
      new Date("2026-11-10T07:40:00.000Z")
    );

    assert.equal(labelsTooEarly.length, 0);
    assert.equal(labelsInStandardWindow.length, 1);
    assert.equal(labelsInStandardWindow[0].label, "Opening Session");
    assert.equal(labelsInStandardWindow[0].firstItemOfDay, false);
  });

  it("skips labels whose reminders have already been sent", () => {
    const labels = getDueAgendaLabels(
      {
        date: "2026-10-11",
        dayNumber: 2,
        labels: [{
          label: "Welcome & Strategic Alignment",
          startTime: "09:00",
          reminderSent: true,
        }],
      },
      new Date("2026-11-10T06:59:00.000Z"),
      new Date("2026-11-10T07:01:00.000Z")
    );

    assert.equal(labels.length, 0);
  });

  it("keeps an in-app-saved reminder eligible for push retry until accepted", () => {
    const labels = getDueAgendaLabels(
      {
        date: "2026-10-11",
        dayNumber: 2,
        labels: [{
          label: "Welcome & Strategic Alignment",
          startTime: "09:00",
          reminderInAppSaved: true,
        }],
      },
      new Date("2026-11-10T06:59:00.000Z"),
      new Date("2026-11-10T07:01:00.000Z")
    );

    assert.equal(labels.length, 1);
  });
});

describe("getAgendaReminderMessage", () => {
  it("returns customized engaging messages for all known event labels", () => {
    const allLabels = [
      "Welcome Cocktail Dinner",
      "Welcome & Strategic Alignment",
      "HEALTH & SAFETY: Challenge the Green and Embrace the Red",
      "Growth in Attractive Markets: Unlocking AMEA’s Growth Potential",
      "Break",
      "Beyond Cement: Expanding AMEA’s Building Solutions",
      "Group Photo",
      "Lunch Break",
      "WORKSHOPS: From Strategy to Execution- Driving Growth Across AMEA",
      "PEOPLE PANEL",
      "OUR GROWTH AGENDA",
      "AMEA FINANCE",
      "Ask the Group Leadership Team",
      "Leadership Dialogue: Strategic Priorities to Deliver Growth Across AMEA",
      "Closing Remarks and Wrap up",
      "Gala Dinner",
      "Move from Four Seasons to SOK Plant",
      "Lounge",
      "Sokhna Plant Line 5 Inauguration",
      "Lunch",
      "Leadership Team will depart SOK Plant to the Hotel",
      " Sokhna Plant Tour",
      "Depart from Sokhna Plant to Four Seasons Hotel",
      "Move from Hotel to Grand Egyptian Museum (GEM)",
      "GEM Experience",
      "Leave GEM to the Great Pyramids of Giza",
      "Touring Great Pyramids of Giza",
      "Arrive at Laduree by the Pyramids for Lunch with a Historic View",
      "Move from Four Seasons to the Grand Egyptian Museum (GEM)",
      "Start of A New Era of Excellence (Holcim Egypt Rebranding Event)",
      "Leave GEM to Four Seasons",
    ];

    for (const label of allLabels) {
      const message = getAgendaReminderMessage(label);
      assert.ok(message.title, `Missing title for ${label}`);
      assert.ok(message.body, `Missing body for ${label}`);
      assert.notEqual(
        message.title,
        "Up Next on Your Agenda",
        `Expected custom title for "${label}", got fallback`
      );
      assert.notEqual(
        message.title,
        "Departure Reminder",
        `Expected custom title for "${label}", got generic departure fallback`
      );
    }
  });

  it("uses sensible fallbacks for unknown labels", () => {
    const transferFallback = getAgendaReminderMessage(
      "Move from Lobby to Conference Hall"
    );
    assert.equal(transferFallback.title, "Departure Reminder");
    assert.equal(
      transferFallback.body,
      "Up next on your agenda: Move from Lobby to Conference Hall."
    );

    const sessionFallback = getAgendaReminderMessage("Special Keynote");
    assert.equal(sessionFallback.title, "Up Next on Your Agenda");
    assert.equal(sessionFallback.body, "\"Special Keynote\" is starting shortly.");
  });
});
