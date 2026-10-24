import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDueAgendaLabels } from "../../functions/reminders/session-reminder-utils.js";

describe("getDueAgendaLabels", () => {
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
});
