import { Browser, chromium, Page } from "playwright";

export type BrowserSession = {
  browser: Browser;
  page: Page;
};

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export async function createSession(url: string): Promise<BrowserSession> {
  const headless = envBool("HEADLESS", true);

  const browser = await chromium.launch({
    args: ["--window-size=1366,768"],
    headless,
  });

  const page = await browser.newPage();
  if (!page) {
    throw new Error("No page found");
  }

  await page.goto(url, { waitUntil: "domcontentloaded" });

  return { browser, page };
}

export async function closeSession(session: BrowserSession): Promise<void> {
  try {
    await session.page.close({ runBeforeUnload: true });
  } catch {}
  try {
    await session.browser.close();
  } catch {}
}
