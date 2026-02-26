import { runMedicalFormWorkflow } from "./workflow";

export async function main() {
  // Example with hardcoded vars (can also be passed via API)
  await runMedicalFormWorkflow({
    firstName: "John",
    lastName: "Doe",
  });
}
