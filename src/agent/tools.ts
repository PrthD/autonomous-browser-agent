import fs from "node:fs";
import path from "node:path";
import { Page } from "playwright";
import { log } from "../logger";

const ARTIFACT_DIR = path.resolve(process.cwd(), "artifacts");

function ensureArtifactsDir() {
  if (!fs.existsSync(ARTIFACT_DIR))
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

export async function screenshot(page: Page, name: string, runId?: string) {
  ensureArtifactsDir();
  const prefix = runId ? `${runId}-` : "";
  const file = path.join(ARTIFACT_DIR, `${Date.now()}-${prefix}${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log("info", "screenshot_saved", { file, runId });
}

export async function fill(page: Page, selector: string, value: string) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.locator(selector).first().fill(value);
  log("info", "filled", { selector, valuePreview: value.slice(0, 32) });
}

export async function click(page: Page, selector: string) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page.locator(selector).first().click({ timeout: 10_000 });
  log("info", "clicked", { selector });
}

export async function selectOption(
  page: Page,
  selector: string,
  valueOrLabel: string,
) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await page
    .locator(selector)
    .first()
    .selectOption([{ label: valueOrLabel }, { value: valueOrLabel }]);
  log("info", "selected", { selector, valueOrLabel });
}

export async function waitForText(
  page: Page,
  text: string,
  timeoutMs = 10_000,
) {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ timeout: timeoutMs });
  log("info", "wait_for_text_ok", { text });
}
