import { describe, expect, it } from "vitest";
import {
  isToggleExpanded,
  resolveButtonSelector,
  resolveInputSelector,
  resolveSelectSelector,
  resolveToggleSelector,
} from "../../src/agent/resolve";
import { createMockSnapshot } from "../helpers/mocks";

const snapshot = createMockSnapshot();

// ---------------------------------------------------------------------------
// resolveInputSelector
// ---------------------------------------------------------------------------
describe("resolveInputSelector", () => {
  it("resolves exact label match", () => {
    expect(resolveInputSelector(snapshot, "First Name")).toBe("#first-name");
  });

  it("resolves case-insensitively", () => {
    expect(resolveInputSelector(snapshot, "first name")).toBe("#first-name");
  });

  it("strips trailing colons/asterisks during normalisation", () => {
    // build a snapshot where the label contains *:
    const snap = createMockSnapshot({
      inputs: [{ label: "First Name*:", selectorHint: "#fn", type: "text" }],
    });
    expect(resolveInputSelector(snap, "First Name")).toBe("#fn");
  });

  it("resolves when target is a substring of label", () => {
    expect(resolveInputSelector(snapshot, "Emergency Contact Name")).toBe(
      "#ec-name",
    );
  });

  it("returns null for nonexistent label", () => {
    expect(resolveInputSelector(snapshot, "Social Security")).toBeNull();
  });

  it("returns null for empty inputs array", () => {
    const snap = createMockSnapshot({ inputs: [] });
    expect(resolveInputSelector(snap, "First Name")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveButtonSelector
// ---------------------------------------------------------------------------
describe("resolveButtonSelector", () => {
  it("resolves Submit button", () => {
    expect(resolveButtonSelector(snapshot, "Submit")).toBe("#submit-btn");
  });

  it("resolves section toggle button by exact text", () => {
    expect(resolveButtonSelector(snapshot, "Medical Information")).toBe(
      "#toggle-medical",
    );
  });

  it("is case-insensitive", () => {
    expect(resolveButtonSelector(snapshot, "submit")).toBe("#submit-btn");
  });

  it("returns null for unknown button text", () => {
    expect(resolveButtonSelector(snapshot, "Cancel")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveSelectSelector
// ---------------------------------------------------------------------------
describe("resolveSelectSelector", () => {
  it("resolves Gender select", () => {
    expect(resolveSelectSelector(snapshot, "Gender")).toBe("#gender");
  });

  it("resolves Blood Type select", () => {
    expect(resolveSelectSelector(snapshot, "Blood Type")).toBe("#blood-type");
  });

  it("is case-insensitive", () => {
    expect(resolveSelectSelector(snapshot, "gender")).toBe("#gender");
  });

  it("returns null for unknown select label", () => {
    expect(resolveSelectSelector(snapshot, "Marital Status")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveToggleSelector + isToggleExpanded
// ---------------------------------------------------------------------------
describe("resolveToggleSelector", () => {
  it("resolves toggle by text", () => {
    expect(resolveToggleSelector(snapshot, "Personal Information")).toBe(
      "#toggle-personal",
    );
  });

  it("returns null for unknown toggle", () => {
    expect(resolveToggleSelector(snapshot, "Settings")).toBeNull();
  });
});

describe("isToggleExpanded", () => {
  it("returns true for expanded toggle", () => {
    expect(isToggleExpanded(snapshot, "Personal Information")).toBe(true);
  });

  it("returns false for collapsed toggle", () => {
    expect(isToggleExpanded(snapshot, "Medical Information")).toBe(false);
  });

  it("returns undefined for unknown toggle", () => {
    expect(isToggleExpanded(snapshot, "Other Section")).toBeUndefined();
  });
});
