import { Page } from "playwright";
import { resolveButtonSelector } from "./resolve";
import { PageSnapshot, snapshotPage } from "./snapshot";

export type SectionName =
  | "Personal Information"
  | "Medical Information"
  | "Emergency Contact";

export type SectionCatalog = {
  url: string;
  title: string;
  toggles: Record<SectionName, string>;
  submitSelector: string;
  sections: Record<
    SectionName,
    {
      inputs: PageSnapshot["inputs"];
      selects: PageSnapshot["selects"];
    }
  >;
};

const SECTION_ORDER: SectionName[] = [
  "Personal Information",
  "Medical Information",
  "Emergency Contact",
];

async function clickSection(
  page: Page,
  baseSnap: PageSnapshot,
  name: SectionName,
) {
  const sel = resolveButtonSelector(baseSnap, name);
  if (!sel) throw new Error(`Could not resolve section toggle: ${name}`);
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  await page.locator(sel).first().click({ timeout: 10_000 });
}

export async function buildSectionCatalog(page: Page): Promise<SectionCatalog> {
  const baseSnap = await snapshotPage(page);

  const toggles: Record<SectionName, string> = {
    "Personal Information": resolveButtonSelector(
      baseSnap,
      "Personal Information",
    )!,
    "Medical Information": resolveButtonSelector(
      baseSnap,
      "Medical Information",
    )!,
    "Emergency Contact": resolveButtonSelector(baseSnap, "Emergency Contact")!,
  };

  const submitSelector = resolveButtonSelector(baseSnap, "Submit");
  if (!submitSelector) throw new Error(`Could not resolve Submit button`);

  for (const s of SECTION_ORDER) {
    if (!toggles[s]) throw new Error(`Missing toggle selector for: ${s}`);
  }

  // Collect per-section snapshots by opening each section
  const sections: SectionCatalog["sections"] = {
    "Personal Information": {
      inputs: baseSnap.inputs,
      selects: baseSnap.selects,
    },
    "Medical Information": { inputs: [], selects: [] },
    "Emergency Contact": { inputs: [], selects: [] },
  };

  // Visit Medical
  await clickSection(page, baseSnap, "Medical Information");
  const medicalSnap = await snapshotPage(page);
  sections["Medical Information"] = {
    inputs: medicalSnap.inputs,
    selects: medicalSnap.selects,
  };

  // Visit Emergency
  await clickSection(page, baseSnap, "Emergency Contact");
  const emergencySnap = await snapshotPage(page);
  sections["Emergency Contact"] = {
    inputs: emergencySnap.inputs,
    selects: emergencySnap.selects,
  };

  // return to Personal
  await clickSection(page, baseSnap, "Personal Information");

  return {
    url: baseSnap.url,
    title: baseSnap.title,
    toggles,
    submitSelector,
    sections,
  };
}
