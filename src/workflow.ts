import { runAgenticWorkflow } from "./agent/loop";
import { screenshot, waitForText } from "./agent/tools";
import { log } from "./logger";
import { closeSession, createSession } from "./session";

export type FormVars = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  medicalId: string;

  gender: string;
  bloodType: string;
  allergies: string;
  currentMedications: string;

  emergencyContactName: string;
  emergencyContactPhone: string;
};

export type WorkflowRunOptions = {
  url?: string;
  headless?: boolean;
  runId?: string;
};

export type WorkflowResult = {
  ok: boolean;
  reason: string;
};

export function buildGoal(vars: FormVars) {
  return (
    "Navigate this page and fill the form. " +
    `Personal Information: First Name ${vars.firstName}, Last Name ${vars.lastName}, Date of Birth ${vars.dateOfBirth}, Medical ID ${vars.medicalId}. ` +
    `Medical Information: Gender ${vars.gender}, Blood Type ${vars.bloodType}, Allergies ${vars.allergies}, Current Medications ${vars.currentMedications}. ` +
    `Emergency Contact: Emergency Contact Name ${vars.emergencyContactName}, Emergency Contact Phone ${vars.emergencyContactPhone}. ` +
    "Then click Submit."
  );
}

export function defaultVars(overrides: Partial<FormVars> = {}): FormVars {
  return {
    firstName: "John",
    lastName: "Doe",
    dateOfBirth: "1990-01-01",
    medicalId: "91927885",
    gender: "Male",
    bloodType: "O+",
    allergies: "Peanuts",
    currentMedications: "Ibuprofen",
    emergencyContactName: "Jane Doe",
    emergencyContactPhone: "5551234567",
    ...overrides,
  };
}

export async function runMedicalFormWorkflow(
  varsPartial: Partial<FormVars> = {},
  opts: WorkflowRunOptions = {},
): Promise<WorkflowResult> {
  const url =
    opts.url ??
    process.env.TARGET_URL ??
    "https://magical-medical-form.netlify.app/";

  const runId = opts.runId ?? undefined;

  const vars = defaultVars(varsPartial);
  const goal = buildGoal(vars);

  const session = await createSession(url);

  try {
    log("info", "workflow_start", { runId, url });
    await runAgenticWorkflow(session.page, goal);

    try {
      await waitForText(session.page, "submitted", 5000);
      log("info", "success_toast_found", { runId });
    } catch (err) {
      log("warn", "success_toast_not_found", { runId, err: String(err) });
    }

    await screenshot(session.page, "final", runId);

    log("info", "workflow_complete", { runId });
    return { ok: true, reason: "Submitted" };
  } finally {
    await closeSession(session);
  }
}
