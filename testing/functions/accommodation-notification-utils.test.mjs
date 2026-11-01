import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasDetailsChanged,
  hasRoomAssignmentChanged,
} from "../../functions/accommodation/accommodation-notification-utils.js";

describe("hasRoomAssignmentChanged", () => {
  it("notifies when the room is assigned after the hotel-only record", () => {
    assert.equal(
      hasRoomAssignmentChanged(
        { hotel: "Conference Hotel" },
        { hotel: "Conference Hotel", roomNumber: "1204" }
      ),
      true
    );
  });

  it("does not notify for hotel-only records or unrelated accommodation updates", () => {
    assert.equal(hasRoomAssignmentChanged({}, { hotel: "Conference Hotel" }), false);
    assert.equal(
      hasRoomAssignmentChanged(
        { hotel: "Conference Hotel", roomNumber: "1204" },
        { hotel: "Conference Hotel", roomNumber: "1204", floor: "12" }
      ),
      false
    );
  });

  it("notifies when an assigned room changes", () => {
    assert.equal(
      hasRoomAssignmentChanged({ roomNumber: "1204" }, { roomNumber: "1205" }),
      true
    );
  });

  it("ignores whitespace-only room numbers", () => {
    assert.equal(hasRoomAssignmentChanged({}, { roomNumber: "   " }), false);
  });

  it("notifies when car details are first added or changed", () => {
    assert.equal(
      hasDetailsChanged({}, { carModel: "Kia Rio" }, ["carModel", "licensePlate"]),
      true
    );
    assert.equal(
      hasDetailsChanged(
        { carModel: "Kia Rio", licensePlate: "123" },
        { carModel: "Kia Rio", licensePlate: "456" },
        ["carModel", "licensePlate"]
      ),
      true
    );
  });

  it("notifies when representative contact details are first added or changed", () => {
    assert.equal(
      hasDetailsChanged(
        {},
        { name: "Representative", phoneNumber: "+1 555 0100" },
        ["name", "phoneNumber"]
      ),
      true
    );
    assert.equal(
      hasDetailsChanged(
        { name: "Representative", phoneNumber: "+1 555 0100" },
        { name: "Representative", phoneNumber: "+1 555 0101" },
        ["name", "phoneNumber"]
      ),
      true
    );
  });

  it("ignores metadata-only changes, removals, and unchanged travel details", () => {
    assert.equal(
      hasDetailsChanged(
        { carModel: "Kia Rio", updatedAt: "old" },
        { carModel: "Kia Rio", updatedAt: "new" },
        ["carModel", "licensePlate"]
      ),
      false
    );
    assert.equal(
      hasDetailsChanged(
        { name: "Representative" },
        { name: " ", updatedAt: "new" },
        ["name", "phoneNumber"]
      ),
      false
    );
    assert.equal(
      hasDetailsChanged({ carModel: "Kia Rio" }, undefined, ["carModel"]),
      false
    );
  });
});
