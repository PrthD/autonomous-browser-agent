import { describe, expect, it } from "vitest";
import { extractFirstJsonObject } from "../../src/agent/json";

describe("extractFirstJsonObject", () => {
  // ------------------------------------------------------------------
  // Happy paths
  // ------------------------------------------------------------------

  it("extracts a clean JSON object", () => {
    const input = '{"actions":[{"type":"done"}],"done":true}';
    const result = extractFirstJsonObject(input);
    expect(result).toEqual({ actions: [{ type: "done" }], done: true });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const input =
      'Here is my plan:\n{"actions":[],"done":true,"reason":"ok"}\nEnd of plan.';
    const result = extractFirstJsonObject(input);
    expect(result).toEqual({ actions: [], done: true, reason: "ok" });
  });

  it("extracts JSON wrapped in markdown fences", () => {
    const input = '```json\n{"actions":[],"done":false}\n```';
    const result = extractFirstJsonObject(input);
    expect(result).toEqual({ actions: [], done: false });
  });

  it("handles nested objects correctly", () => {
    const input =
      '{"actions":[{"type":"fill","target":"Name","value":"John"}],"done":true}';
    const result = extractFirstJsonObject(input) as any;
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({
      type: "fill",
      target: "Name",
      value: "John",
    });
  });

  it("throws when outermost braces span multiple disjoint objects", () => {
    // indexOf("{") → first {, lastIndexOf("}") → last }.
    // Slice: '{"a":1} middle {"b":2}' — invalid JSON.
    const input = 'prefix {"a":1} middle {"b":2} suffix';
    expect(() => extractFirstJsonObject(input)).toThrow();
  });

  // ------------------------------------------------------------------
  // Error paths
  // ------------------------------------------------------------------

  it("throws when input has no opening brace", () => {
    expect(() => extractFirstJsonObject("no json here")).toThrow(
      "No JSON object found",
    );
  });

  it("throws when input has no closing brace", () => {
    expect(() => extractFirstJsonObject('{"broken')).toThrow(
      "No JSON object found",
    );
  });

  it("throws on empty string", () => {
    expect(() => extractFirstJsonObject("")).toThrow("No JSON object found");
  });

  it("throws when } appears before {", () => {
    expect(() => extractFirstJsonObject("} then {")).toThrow();
  });

  it("throws on invalid JSON inside braces", () => {
    expect(() => extractFirstJsonObject("{not: valid: json}")).toThrow(); // JSON.parse will throw
  });

  it("throws on truncated JSON (model cut off)", () => {
    expect(() =>
      extractFirstJsonObject('{"actions":[{"type":"fill","target":"Na'),
    ).toThrow("No JSON object found");
  });
});
