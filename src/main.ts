import { runAgenticWorkflow } from "./agent/loop";
import { screenshot, waitForText } from "./agent/tools";
import { log } from "./logger";
import { closeSession, createSession } from "./session";

const TARGET_URL = "https://magical-medical-form.netlify.app/";

export async function main() {
  const session = await createSession(TARGET_URL);

  try {
    const goal =
      "Navigate this page and fill the form. " +
      "Personal Information: First Name John, Last Name Doe, Date of Birth 1990-01-01, Medical ID 91927885. " +
      "Medical Information: Gender Male, Blood Type O+, Allergies Peanuts, Current Medications Ibuprofen. " +
      "Emergency Contact: Emergency Contact Name Jane Doe, Emergency Contact Phone 5551234567. " +
      "Then click Submit.";

    await runAgenticWorkflow(session.page, goal);

    try {
      await waitForText(session.page, "submitted", 5000);
      log("info", "success_toast_found");
    } catch (err) {
      log("warn", "success_toast_not_found", { err: String(err) });
    }

    await screenshot(session.page, "final");
    log("info", "workflow_complete");
  } finally {
    await closeSession(session);
  }
}
