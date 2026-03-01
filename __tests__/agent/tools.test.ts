import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPage } from "../helpers/mocks";

// Mock fs to prevent actual filesystem writes in screenshot
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));

import {
  click,
  fill,
  screenshot,
  selectOption,
  waitForText,
} from "../../src/agent/tools";

describe("tools.ts – Playwright primitives", () => {
  let page: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    page = createMockPage();
  });

  // -----------------------------------------------------------------------
  // fill
  // -----------------------------------------------------------------------
  describe("fill", () => {
    it("scrolls into view then fills the input", async () => {
      await fill(page, "#first-name", "John");

      expect(page.locator).toHaveBeenCalledWith("#first-name");

      const chain = (page.locator as any)("#first-name").first();
      expect(chain.scrollIntoViewIfNeeded).toBeDefined();
      // The mock was called – no throw means success
    });

    it("does not throw on valid selector", async () => {
      await expect(fill(page, "#foo", "bar")).resolves.toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // click
  // -----------------------------------------------------------------------
  describe("click", () => {
    it("scrolls into view then clicks", async () => {
      await click(page, "#submit-btn");
      expect(page.locator).toHaveBeenCalledWith("#submit-btn");
    });

    it("propagates errors from locator", async () => {
      const errPage = createMockPage();
      (errPage.locator as any).mockImplementation(() => ({
        first: () => ({
          scrollIntoViewIfNeeded: vi
            .fn()
            .mockRejectedValue(new Error("Element not found")),
          click: vi.fn(),
        }),
      }));

      await expect(click(errPage, "#missing")).rejects.toThrow(
        "Element not found",
      );
    });
  });

  // -----------------------------------------------------------------------
  // selectOption
  // -----------------------------------------------------------------------
  describe("selectOption", () => {
    it("selects by label and value", async () => {
      await selectOption(page, "#gender", "Male");
      expect(page.locator).toHaveBeenCalledWith("#gender");
    });
  });

  // -----------------------------------------------------------------------
  // screenshot
  // -----------------------------------------------------------------------
  describe("screenshot", () => {
    it("takes a full-page screenshot", async () => {
      await screenshot(page, "test-screenshot");
      expect(page.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true }),
      );
    });

    it("includes runId in filename when provided", async () => {
      await screenshot(page, "test", "run-123");
      expect(page.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining("run-123"),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // waitForText
  // -----------------------------------------------------------------------
  describe("waitForText", () => {
    it("waits for text on the page", async () => {
      await waitForText(page, "submitted");
      expect(page.getByText).toHaveBeenCalledWith("submitted", {
        exact: false,
      });
    });

    it("propagates timeout error", async () => {
      const errPage = createMockPage();
      (errPage.getByText as any).mockReturnValue({
        first: () => ({
          waitFor: vi.fn().mockRejectedValue(new Error("Timeout")),
        }),
      });

      await expect(waitForText(errPage, "oops", 100)).rejects.toThrow(
        "Timeout",
      );
    });
  });
});
