import { google } from "@ai-sdk/google";

const modelId = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
export const model = google(modelId);
