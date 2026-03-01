import { describe, expect, it } from "vitest";
import type { FormVars } from "../../src/workflow";
import { buildGoal, defaultVars } from "../../src/workflow";

describe("workflow – buildGoal", () => {
  it("includes all form field values in the goal string", () => {
    const vars = defaultVars();
    const goal = buildGoal(vars);

    expect(goal).toContain("John");
    expect(goal).toContain("Doe");
    expect(goal).toContain("1990-01-01");
    expect(goal).toContain("91927885");
    expect(goal).toContain("Male");
    expect(goal).toContain("O+");
    expect(goal).toContain("Peanuts");
    expect(goal).toContain("Ibuprofen");
    expect(goal).toContain("Jane Doe");
    expect(goal).toContain("5551234567");
  });

  it("uses override values", () => {
    const vars = defaultVars({ firstName: "Alice", lastName: "Smith" });
    const goal = buildGoal(vars);

    expect(goal).toContain("Alice");
    expect(goal).toContain("Smith");
    expect(goal).not.toContain("John");
  });
});

describe("workflow – defaultVars", () => {
  it("returns complete defaults without overrides", () => {
    const v = defaultVars();
    const keys: (keyof FormVars)[] = [
      "firstName",
      "lastName",
      "dateOfBirth",
      "medicalId",
      "gender",
      "bloodType",
      "allergies",
      "currentMedications",
      "emergencyContactName",
      "emergencyContactPhone",
    ];
    for (const k of keys) {
      expect(v[k]).toBeDefined();
      expect(typeof v[k]).toBe("string");
      expect(v[k].length).toBeGreaterThan(0);
    }
  });

  it("overrides specific fields", () => {
    const v = defaultVars({ firstName: "Custom" });
    expect(v.firstName).toBe("Custom");
    expect(v.lastName).toBe("Doe"); // default preserved
  });
});
