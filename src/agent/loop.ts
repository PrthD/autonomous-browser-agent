import { generateText } from "ai";
import { Page } from "playwright";
import { model } from "../_internal/setup";
import { log } from "../logger";
import { extractFirstJsonObject } from "./json";
import {
  resolveButtonSelector,
  resolveInputSelector,
  resolveSelectSelector,
} from "./resolve";
import { snapshotPage } from "./snapshot";
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

    const snap = await snapshotPage(page);

    const prompt = buildPrompt(goal, snap);

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

    for (const action of plan.actions) {
      const didStop = await executeAction(page, snap, action);
      if (didStop) return;
    }

    if (plan.done) return;

    // Rate-limit model calls
    await sleep(minDelayMs);
  }
}

function buildPrompt(goal: string, snap: any) {
  const inputs = snap.inputs.map((i: any) => ({
    label: i.label,
    selectorHint: i.selectorHint,
    type: i.type,
    value: i.value ?? "",
  }));
  const buttons = snap.buttons.map((b: any) => ({
    text: b.text,
    selectorHint: b.selectorHint,
  }));
  const selects = snap.selects.map((s: any) => ({
    label: s.label,
    selectorHint: s.selectorHint,
    options: s.options.slice(0, 12),
  }));

  return [
    `You are an automation agent controlling a browser form.`,
    `Goal: ${goal}`,
    ``,
    `Current page: ${snap.url}`,
    `Title: ${snap.title}`,
    ``,
    `Available inputs (label -> selectorHint):`,
    JSON.stringify(inputs, null, 0),
    ``,
    `Available selects (label -> selectorHint + options):`,
    JSON.stringify(selects, null, 0),
    ``,
    `Available buttons (text -> selectorHint):`,
    JSON.stringify(buttons, null, 0),
    ``,
    `OUTPUT FORMAT (STRICT):`,
    `- Output ONLY JSON. No markdown. No extra text.`,
    `- JSON schema: {"actions": AgentAction[], "done": boolean, "reason": string}`,
    `- AgentAction schema:`,
    `  - {"type":"fill","target":"<EXACT input label>","value":"..."}`,
    `  - {"type":"click","target":"<EXACT button text>"}`,
    `  - {"type":"select","target":"<EXACT select label>","value":"<option label>"}`,
    `  - {"type":"done","reason":"..."}`,
    ``,
    `HARD REQUIREMENTS:`,
    `- Return a COMPLETE plan in ONE response.`,
    `- If any required field is empty/incorrect, include actions to fix it.`,
    `- Then include click Submit.`,
    `- Then set "done": true and include a final {"type":"done"} action.`,
    `- Target must match EXACTLY one of the provided labels/texts above.`,
    `- Max 10 actions.`,
    ``,
    `EXAMPLE OUTPUT (shape only):`,
    `{"actions":[{"type":"fill","target":"First Name","value":"John"},{"type":"click","target":"Submit"},{"type":"done","reason":"Submitted"}],"done":true,"reason":"Submitted"}`,
  ].join("\n");
}

async function executeAction(
  page: Page,
  snap: any,
  action: AgentAction,
): Promise<boolean> {
  if (action.type === "done") {
    log("info", "done", { reason: action.reason ?? null });
    return true;
  }

  if (action.type === "fill") {
    const sel = resolveInputSelector(snap, action.target);
    if (!sel) {
      await screenshot(page, "fail-unresolved-fill");
      throw new Error(`Could not resolve input target: "${action.target}"`);
    }
    await fill(page, sel, action.value);
    return false;
  }

  if (action.type === "click") {
    const sel = resolveButtonSelector(snap, action.target);
    if (!sel) {
      await screenshot(page, "fail-unresolved-click");
      throw new Error(`Could not resolve button target: "${action.target}"`);
    }
    await click(page, sel);
    return false;
  }

  if (action.type === "select") {
    const sel = resolveSelectSelector(snap, action.target);
    if (!sel) {
      await screenshot(page, "fail-unresolved-select");
      throw new Error(`Could not resolve select target: "${action.target}"`);
    }
    await selectOption(page, sel, action.value);
    return false;
  }

  return false;
}
