import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentPlan } from "../../src/agent/types";
import {
  createMockCatalog,
  createMockPage,
  createSimplePlan,
  mockGenerateTextResult,
} from "../helpers/mocks";

// ---------------------------------------------------------------------------
// Module mocks – must be hoisted before imports
// ---------------------------------------------------------------------------

// Mock the AI SDK so we never call a real LLM
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

// Mock setup module so importing model doesn't require API key
vi.mock("../../src/_internal/setup", () => ({
  model: { modelId: "mock-gemini" },
}));

// Mock catalog builder to return our fixture
vi.mock("../../src/agent/catalog", () => ({
  buildSectionCatalog: vi.fn(),
}));

// Mock fs for screenshot
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

import { generateText } from "ai";
import { buildSectionCatalog } from "../../src/agent/catalog";
import { runAgenticWorkflow } from "../../src/agent/loop";

const mockGenerateText = generateText as unknown as ReturnType<typeof vi.fn>;
const mockBuildCatalog = buildSectionCatalog as unknown as ReturnType<
  typeof vi.fn
>;

describe("runAgenticWorkflow – LLM planning loop", () => {
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    page = createMockPage();
    mockGenerateText.mockReset();
    mockBuildCatalog.mockReset();
    mockBuildCatalog.mockResolvedValue(createMockCatalog());
  });

  // -----------------------------------------------------------------------
  // Happy path: model returns done immediately
  // -----------------------------------------------------------------------
  it("completes when model returns done action", async () => {
    const plan: AgentPlan = createSimplePlan(
      [{ type: "done", reason: "Completed" }],
      true,
    );
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await runAgenticWorkflow(page, "fill the form", {
      maxModelCalls: 3,
      minDelayMs: 0,
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Executes fill, select, click, expand actions
  // -----------------------------------------------------------------------
  it("executes a multi-action plan with fill/select/expand/click", async () => {
    const plan: AgentPlan = createSimplePlan(
      [
        { type: "fill", target: "First Name", value: "John" },
        { type: "fill", target: "Last Name", value: "Doe" },
        { type: "expand", target: "Medical Information" },
        { type: "select", target: "Gender", value: "Male" },
        { type: "click", target: "Submit" },
        { type: "done", reason: "Submitted" },
      ],
      true,
    );
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await runAgenticWorkflow(page, "fill the form", {
      maxModelCalls: 3,
      minDelayMs: 0,
    });

    // Locator should have been called for fill, expand, select, click
    expect(page.locator).toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // MAX_MODEL_CALLS enforcement
  // -----------------------------------------------------------------------
  it("throws when MAX_MODEL_CALLS is exceeded", async () => {
    // Return a plan with done=false so it loops
    const loopPlan: AgentPlan = createSimplePlan(
      [{ type: "fill", target: "First Name", value: "John" }],
      false,
    );

    mockGenerateText.mockResolvedValue(mockGenerateTextResult(loopPlan));

    await expect(
      runAgenticWorkflow(page, "fill the form", {
        maxModelCalls: 2,
        minDelayMs: 0,
      }),
    ).rejects.toThrow("Exceeded MAX_MODEL_CALLS=2");

    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("throws when maxModelCalls is 1 and plan is not done", async () => {
    const plan: AgentPlan = createSimplePlan(
      [{ type: "fill", target: "First Name", value: "A" }],
      false,
    );
    mockGenerateText.mockResolvedValue(mockGenerateTextResult(plan));

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 1,
        minDelayMs: 0,
      }),
    ).rejects.toThrow("Exceeded MAX_MODEL_CALLS=1");
  });

  // -----------------------------------------------------------------------
  // MIN_MODEL_DELAY_MS enforcement (timing)
  // -----------------------------------------------------------------------
  it("sleeps between iterations for at least minDelayMs", async () => {
    vi.useFakeTimers();

    // First call: not done. Second call: done.
    const plan1 = createSimplePlan(
      [{ type: "fill", target: "First Name", value: "A" }],
      false,
    );
    const plan2 = createSimplePlan([{ type: "done", reason: "ok" }], true);

    mockGenerateText
      .mockResolvedValueOnce(mockGenerateTextResult(plan1))
      .mockResolvedValueOnce(mockGenerateTextResult(plan2));

    const promise = runAgenticWorkflow(page, "fill", {
      maxModelCalls: 5,
      minDelayMs: 5000,
    });

    // Flush microtasks repeatedly – catalog build + first LLM iteration
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);

    // First iteration done, now waiting on sleep(5000)
    // Advance past the delay
    await vi.advanceTimersByTimeAsync(5000);

    // Flush microtasks for second iteration
    for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(0);

    await promise;

    expect(mockGenerateText).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // LLM returns invalid JSON
  // -----------------------------------------------------------------------
  it("throws when LLM returns non-JSON", async () => {
    mockGenerateText.mockResolvedValueOnce(
      mockGenerateTextResult("This is not JSON at all"),
    );

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow("No JSON object found");
  });

  // -----------------------------------------------------------------------
  // LLM returns JSON but plan is malformed
  // -----------------------------------------------------------------------
  it("throws when LLM returns JSON without actions array", async () => {
    mockGenerateText.mockResolvedValueOnce(
      mockGenerateTextResult('{"done":true}'),
    );

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow("Plan.actions must be an array");
  });

  it("throws on unknown action type from LLM", async () => {
    mockGenerateText.mockResolvedValueOnce(
      mockGenerateTextResult(
        '{"actions":[{"type":"hover","target":"x"}],"done":false}',
      ),
    );

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow("Unknown action type: hover");
  });

  // -----------------------------------------------------------------------
  // Action references unknown label
  // -----------------------------------------------------------------------
  it("throws when fill targets an unknown label", async () => {
    const plan = createSimplePlan(
      [{ type: "fill", target: "Social Security Number", value: "000" }],
      false,
    );
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow(/Could not resolve input/);
  });

  it("throws when select targets an unknown label", async () => {
    const plan = createSimplePlan(
      [
        { type: "expand", target: "Medical Information" },
        { type: "select", target: "Marital Status", value: "Single" },
      ],
      false,
    );
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow(/Could not resolve select/);
  });

  it("throws when expand targets an unknown section", async () => {
    const plan = createSimplePlan(
      [{ type: "expand", target: "Payment Info" }],
      false,
    );
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow(/Unknown section toggle/);
  });

  it("throws when click targets something other than Submit", async () => {
    const plan = createSimplePlan([{ type: "click", target: "Cancel" }], false);
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await expect(
      runAgenticWorkflow(page, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow('Only "Submit" click is supported');
  });

  // -----------------------------------------------------------------------
  // Playwright interaction failure propagation
  // -----------------------------------------------------------------------
  it("propagates Playwright fill error", async () => {
    const errPage = createMockPage();
    (errPage.locator as any).mockImplementation(() => ({
      first: () => ({
        scrollIntoViewIfNeeded: vi
          .fn()
          .mockRejectedValue(new Error("Element detached")),
        fill: vi.fn(),
        click: vi.fn(),
      }),
    }));

    const plan = createSimplePlan(
      [{ type: "fill", target: "First Name", value: "X" }],
      false,
    );
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await expect(
      runAgenticWorkflow(errPage, "fill", {
        maxModelCalls: 3,
        minDelayMs: 0,
      }),
    ).rejects.toThrow("Element detached");
  });

  // -----------------------------------------------------------------------
  // Expand skip when already current section
  // -----------------------------------------------------------------------
  it("skips expand when target is already the current section", async () => {
    const plan = createSimplePlan(
      [
        // Personal Information is the default current section
        { type: "expand", target: "Personal Information" },
        { type: "fill", target: "First Name", value: "John" },
        { type: "done", reason: "ok" },
      ],
      true,
    );
    mockGenerateText.mockResolvedValueOnce(mockGenerateTextResult(plan));

    await runAgenticWorkflow(page, "fill", {
      maxModelCalls: 3,
      minDelayMs: 0,
    });

    // The expand should have been skipped, but no error
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });
});
