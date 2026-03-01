import { describe, expect, it } from "vitest";
import { assertPlan } from "../../src/agent/types";

describe("assertPlan – valid plans", () => {
  it("accepts a minimal done-only plan", () => {
    const plan = assertPlan({
      actions: [{ type: "done", reason: "complete" }],
      done: true,
      reason: "complete",
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.done).toBe(true);
  });

  it("accepts a fill action with required fields", () => {
    const plan = assertPlan({
      actions: [{ type: "fill", target: "First Name", value: "John" }],
      done: false,
    });
    expect(plan.actions[0].type).toBe("fill");
  });

  it("accepts a select action", () => {
    const plan = assertPlan({
      actions: [{ type: "select", target: "Gender", value: "Male" }],
    });
    expect(plan.actions[0].type).toBe("select");
  });

  it("accepts a click action", () => {
    const plan = assertPlan({
      actions: [{ type: "click", target: "Submit" }],
    });
    expect(plan.actions[0].type).toBe("click");
  });

  it("accepts an expand action", () => {
    const plan = assertPlan({
      actions: [{ type: "expand", target: "Medical Information" }],
    });
    expect(plan.actions[0].type).toBe("expand");
  });

  it("accepts a multi-action plan", () => {
    const plan = assertPlan({
      actions: [
        { type: "fill", target: "First Name", value: "John" },
        { type: "fill", target: "Last Name", value: "Doe" },
        { type: "expand", target: "Medical Information" },
        { type: "select", target: "Gender", value: "Male" },
        { type: "click", target: "Submit" },
        { type: "done", reason: "Submitted" },
      ],
      done: true,
      reason: "Submitted",
    });
    expect(plan.actions).toHaveLength(6);
  });

  it("accepts done action without reason", () => {
    const plan = assertPlan({
      actions: [{ type: "done" }],
    });
    expect(plan.actions[0].type).toBe("done");
  });

  it("accepts empty actions array", () => {
    const plan = assertPlan({ actions: [] });
    expect(plan.actions).toHaveLength(0);
  });
});

describe("assertPlan – invalid plans", () => {
  it("rejects null", () => {
    expect(() => assertPlan(null)).toThrow("Plan is not an object");
  });

  it("rejects undefined", () => {
    expect(() => assertPlan(undefined)).toThrow("Plan is not an object");
  });

  it("rejects a number", () => {
    expect(() => assertPlan(42)).toThrow("Plan is not an object");
  });

  it("rejects a string", () => {
    expect(() => assertPlan("not a plan")).toThrow("Plan is not an object");
  });

  it("rejects missing actions key", () => {
    expect(() => assertPlan({ done: true })).toThrow(
      "Plan.actions must be an array",
    );
  });

  it("rejects actions as non-array", () => {
    expect(() => assertPlan({ actions: "not array" })).toThrow(
      "Plan.actions must be an array",
    );
  });

  it("rejects action that is null", () => {
    expect(() => assertPlan({ actions: [null] })).toThrow(
      "Action must be an object",
    );
  });

  it("rejects action without type", () => {
    expect(() => assertPlan({ actions: [{ target: "x" }] })).toThrow(
      "Action.type must be string",
    );
  });

  it("rejects action with numeric type", () => {
    expect(() => assertPlan({ actions: [{ type: 123 }] })).toThrow(
      "Action.type must be string",
    );
  });

  it("rejects unknown action type", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "hover", target: "x" }] }),
    ).toThrow("Unknown action type: hover");
  });

  it("rejects fill without target", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "fill", value: "x" }] }),
    ).toThrow("fill.target invalid");
  });

  it("rejects fill with empty target", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "fill", target: "  ", value: "x" }] }),
    ).toThrow("fill.target invalid");
  });

  it("rejects fill without value", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "fill", target: "Name" }] }),
    ).toThrow("fill.value invalid");
  });

  it("rejects fill with numeric value", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "fill", target: "Name", value: 123 }] }),
    ).toThrow("fill.value invalid");
  });

  it("rejects click without target", () => {
    expect(() => assertPlan({ actions: [{ type: "click" }] })).toThrow(
      "click.target invalid",
    );
  });

  it("rejects select without target", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "select", value: "Male" }] }),
    ).toThrow("select.target invalid");
  });

  it("rejects select without value", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "select", target: "Gender" }] }),
    ).toThrow("select.value invalid");
  });

  it("rejects expand without target", () => {
    expect(() => assertPlan({ actions: [{ type: "expand" }] })).toThrow(
      "expand.target invalid",
    );
  });

  it("rejects expand with whitespace-only target", () => {
    expect(() =>
      assertPlan({ actions: [{ type: "expand", target: "   " }] }),
    ).toThrow("expand.target invalid");
  });
});
