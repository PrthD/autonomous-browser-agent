import { generateText } from "ai";
import { Page } from "playwright";
import { model } from "../_internal/setup";
import { log } from "../logger";
import { buildSectionCatalog, SectionCatalog, SectionName } from "./catalog";
import { extractFirstJsonObject } from "./json";
import { resolveInputSelector, resolveSelectSelector } from "./resolve";
import { click, fill, screenshot, selectOption } from "./tools";
import { AgentAction, assertPlan } from "./types";

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

type RunOptions = {
  maxModelCalls?: number; // quota safety
  minDelayMs?: number; // RPM safety
};

export async function runAgenticWorkflow(
  page: Page,
  goal: string,
  opts: RunOptions = {},
) {
  const maxModelCalls =
    opts.maxModelCalls ?? Number(process.env.MAX_MODEL_CALLS ?? 3);
  const minDelayMs =
    opts.minDelayMs ?? Number(process.env.MIN_MODEL_DELAY_MS ?? 15000);

  let modelCalls = 0;

  for (;;) {
    if (modelCalls >= maxModelCalls) {
      await screenshot(page, "fail-max-model-calls");
      throw new Error(`Exceeded MAX_MODEL_CALLS=${maxModelCalls}`);
    }

    const catalog = await buildSectionCatalog(page);
    // console.log("PAGE CATALOG:", JSON.stringify(catalog, null, 2)); // DEBUG
    const prompt = buildPrompt(goal, catalog);

    modelCalls += 1;
    log("info", "llm_call", { modelCalls, maxModelCalls });

    const resp = await generateText({
      model,
      temperature: 0,
      prompt,
    });

    const raw = resp.text ?? "";
    log("info", "llm_raw_len", { chars: raw.length });

    const json = extractFirstJsonObject(raw);
    const plan = assertPlan(json);

    log("info", "plan_received", {
      actions: plan.actions.map((a) => a.type),
      done: Boolean(plan.done),
      reason: plan.reason ?? null,
    });

    let currentSection: SectionName = "Personal Information";

    for (const action of plan.actions) {
      const didStop = await executeAction(
        page,
        catalog,
        action,
        () => currentSection,
        (s) => {
          currentSection = s;
        },
      );
      if (didStop) return;
    }

    if (plan.done) return;

    // Rate-limit model calls
    await sleep(minDelayMs);
  }
}

function buildPrompt(goal: string, catalog: SectionCatalog) {
  const sectionPayload = (name: SectionName) => ({
    section: name,
    inputs: catalog.sections[name].inputs.map((i) => ({
      label: i.label,
      selectorHint: i.selectorHint,
      type: i.type,
      value: i.value ?? "",
    })),
    selects: catalog.sections[name].selects.map((s) => ({
      label: s.label,
      selectorHint: s.selectorHint,
      options: s.options,
    })),
  });

  const sections = [
    sectionPayload("Personal Information"),
    sectionPayload("Medical Information"),
    sectionPayload("Emergency Contact"),
  ];

  const toggles = Object.entries(catalog.toggles).map(([k, v]) => ({
    text: k,
    selectorHint: v,
  }));

  return [
    `You are an automation agent controlling a browser form.`,
    `Goal: ${goal}`,
    ``,
    `Current page: ${catalog.url}`,
    `Title: ${catalog.title}`,
    ``,
    `IMPORTANT UI BEHAVIOR: This is an accordion. Only ONE section can be open at a time.`,
    ``,
    `Available section toggles (text -> selectorHint):`,
    JSON.stringify(toggles, null, 0),
    ``,
    `Form controls by section (these are collected by opening each section):`,
    JSON.stringify(sections, null, 0),
    ``,
    `OUTPUT FORMAT (STRICT):`,
    `- Output ONLY valid JSON. No markdown. No extra text.`,
    `- JSON schema: {"actions": AgentAction[], "done": boolean, "reason": string}`,
    `- AgentAction schema:`,
    `  - {"type":"expand","target":"<EXACT section toggle text>"}`,
    `  - {"type":"fill","target":"<EXACT input label>","value":"..."}`,
    `  - {"type":"select","target":"<EXACT select label>","value":"<option label>"}`,
    `  - {"type":"click","target":"Submit"}`,
    `  - {"type":"done","reason":"..."}`,
    ``,
    `HARD REQUIREMENTS:`,
    `1) Fill strictly TOP to BOTTOM in this order:`,
    `   a) Personal Information`,
    `   b) Medical Information`,
    `   c) Emergency Contact`,
    `2) Because only one section can be open, you MUST:`,
    `   - Use {"type":"expand"} before filling/selecting fields in a different section.`,
    `   - Do NOT expand the same section twice in a row.`,
    `3) Use "select" ONLY for dropdown fields (they are listed under selects).`,
    `4) Do NOT guess fields or options. Only use labels/options shown in the section catalog above.`,
    `5) After all fields are correctly filled, click Submit.`,
    `6) Then include a final {"type":"done"} action and set done=true.`,
    `7) Targets MUST match EXACTLY one of the provided labels/texts above.`,
    `8) Maximum 15 actions.`,
    `9) Return a COMPLETE plan in ONE response. Do not rely on a second model call.`,
    ``,
    `EXAMPLE OUTPUT (shape only):`,
    `{"actions":[{"type":"fill","target":"First Name","value":"John"},{"type":"expand","target":"Medical Information"},{"type":"select","target":"Gender","value":"Male"},{"type":"click","target":"Submit"},{"type":"done","reason":"Submitted"}],"done":true,"reason":"Submitted"}`,
  ].join("\n");
}

async function executeAction(
  page: Page,
  catalog: SectionCatalog,
  action: AgentAction,
  getSection: () => SectionName,
  setSection: (s: SectionName) => void,
): Promise<boolean> {
  if (action.type === "done") {
    log("info", "done", { reason: action.reason ?? null });
    return true;
  }

  if (action.type === "expand") {
    const target = action.target as SectionName;
    const current = getSection();

    if (target === current) {
      log("info", "expand_skip_already_current", { target });
      return false;
    }

    const sel = catalog.toggles[target];
    if (!sel) {
      await screenshot(page, "fail-unresolved-expand");
      throw new Error(`Unknown section toggle: "${action.target}"`);
    }

    await click(page, sel);
    setSection(target);
    log("info", "expanded", { target, selector: sel });
    return false;
  }

  if (action.type === "fill") {
    const current = getSection();

    const snapLike = {
      inputs: catalog.sections[current].inputs,
    } as any;

    const sel = resolveInputSelector(snapLike, action.target);
    if (!sel) {
      await screenshot(page, "fail-unresolved-fill");
      throw new Error(
        `Could not resolve input "${action.target}" in section "${current}". Likely missing expand.`,
      );
    }

    await fill(page, sel, action.value);
    return false;
  }

  if (action.type === "select") {
    const current = getSection();

    const snapLike = {
      selects: catalog.sections[current].selects,
    } as any;

    const sel = resolveSelectSelector(snapLike, action.target);
    if (!sel) {
      await screenshot(page, "fail-unresolved-select");
      throw new Error(
        `Could not resolve select "${action.target}" in section "${current}". Likely missing expand.`,
      );
    }

    await selectOption(page, sel, action.value);
    return false;
  }

  if (action.type === "click") {
    if (action.target !== "Submit") {
      await screenshot(page, "fail-unexpected-click");
      throw new Error(`Only "Submit" click is supported.`);
    }

    await click(page, catalog.submitSelector);
    return false;
  }

  return false;
}
