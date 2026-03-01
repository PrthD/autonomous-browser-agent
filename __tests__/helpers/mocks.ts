/**
 * Shared mock factories for tests.
 *
 * Provides deterministic mocks for:
 * - Playwright Page (locator chain, screenshot, evaluate, etc.)
 * - LLM generateText responses
 * - PageSnapshot / SectionCatalog fixtures
 */

import type { Page } from "playwright";
import { vi } from "vitest";
import type { SectionCatalog } from "../../src/agent/catalog";
import type { PageSnapshot } from "../../src/agent/snapshot";
import type { AgentPlan } from "../../src/agent/types";

// ---------------------------------------------------------------------------
// Playwright mock
// ---------------------------------------------------------------------------

/**
 * Build a mock Playwright Page that stubs the methods used by tools.ts,
 * catalog.ts and snapshot.ts.
 */
export function createMockPage(overrides: Partial<Page> = {}): Page {
  const locator = () => ({
    first: () => ({
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      selectOption: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
    }),
  });

  return {
    locator: vi.fn().mockImplementation(locator),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    evaluate: vi.fn().mockResolvedValue({}),
    getByText: vi.fn().mockReturnValue({
      first: () => ({
        waitFor: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    goto: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Page;
}

// ---------------------------------------------------------------------------
// PageSnapshot fixtures
// ---------------------------------------------------------------------------

export function createMockSnapshot(
  overrides: Partial<PageSnapshot> = {},
): PageSnapshot {
  return {
    url: "https://example.com/form",
    title: "Medical Form",
    inputs: [
      { label: "First Name", selectorHint: "#first-name", type: "text" },
      { label: "Last Name", selectorHint: "#last-name", type: "text" },
      {
        label: "Date of Birth",
        selectorHint: "#dob",
        type: "date",
        value: "",
      },
      { label: "Medical ID", selectorHint: "#med-id", type: "text" },
      { label: "Allergies", selectorHint: "#allergies", type: "text" },
      {
        label: "Current Medications",
        selectorHint: "#medications",
        type: "text",
      },
      {
        label: "Emergency Contact Name",
        selectorHint: "#ec-name",
        type: "text",
      },
      {
        label: "Emergency Contact Phone",
        selectorHint: "#ec-phone",
        type: "tel",
      },
    ],
    buttons: [
      { text: "Personal Information", selectorHint: "#toggle-personal" },
      { text: "Medical Information", selectorHint: "#toggle-medical" },
      { text: "Emergency Contact", selectorHint: "#toggle-emergency" },
      { text: "Submit", selectorHint: "#submit-btn" },
    ],
    selects: [
      {
        label: "Gender",
        selectorHint: "#gender",
        options: ["", "Male", "Female", "Other"],
      },
      {
        label: "Blood Type",
        selectorHint: "#blood-type",
        options: ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
      },
    ],
    toggles: [
      {
        text: "Personal Information",
        selectorHint: "#toggle-personal",
        expanded: true,
      },
      {
        text: "Medical Information",
        selectorHint: "#toggle-medical",
        expanded: false,
      },
      {
        text: "Emergency Contact",
        selectorHint: "#toggle-emergency",
        expanded: false,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SectionCatalog fixture
// ---------------------------------------------------------------------------

export function createMockCatalog(
  overrides: Partial<SectionCatalog> = {},
): SectionCatalog {
  const snap = createMockSnapshot();
  return {
    url: snap.url,
    title: snap.title,
    toggles: {
      "Personal Information": "#toggle-personal",
      "Medical Information": "#toggle-medical",
      "Emergency Contact": "#toggle-emergency",
    },
    submitSelector: "#submit-btn",
    sections: {
      "Personal Information": {
        inputs: snap.inputs.filter((i) =>
          ["First Name", "Last Name", "Date of Birth", "Medical ID"].includes(
            i.label,
          ),
        ),
        selects: [],
      },
      "Medical Information": {
        inputs: snap.inputs.filter((i) =>
          ["Allergies", "Current Medications"].includes(i.label),
        ),
        selects: snap.selects,
      },
      "Emergency Contact": {
        inputs: snap.inputs.filter((i) =>
          ["Emergency Contact Name", "Emergency Contact Phone"].includes(
            i.label,
          ),
        ),
        selects: [],
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// LLM response helpers
// ---------------------------------------------------------------------------

/**
 * Create a deterministic AgentPlan for use in mocked generateText.
 */
export function createSimplePlan(
  actions: AgentPlan["actions"] = [],
  done = true,
  reason = "Completed",
): AgentPlan {
  return { actions, done, reason };
}

/**
 * Wrap a plan (or raw string) into the shape returned by `generateText`.
 */
export function mockGenerateTextResult(planOrText: AgentPlan | string) {
  const text =
    typeof planOrText === "string" ? planOrText : JSON.stringify(planOrText);
  return {
    text,
    response: { id: "mock-id" },
    usage: { promptTokens: 10, completionTokens: 20 },
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const http = require("node:http");
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: data
          ? {
              "content-type": "application/json",
              "content-length": Buffer.byteLength(data),
            }
          : {},
      },
      (res: any) => {
        let raw = "";
        res.on("data", (c: string) => (raw += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
