import "dotenv-defaults/config";
import http from "node:http";
import { log } from "../logger";
import { FormVars, runMedicalFormWorkflow } from "../workflow";

const API_BASE = process.env.API_BASE ?? "/api/v1";

function readJson(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, code: number, body: any) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

function isString(x: any) {
  return typeof x === "string" && x.trim().length > 0;
}

function validateVars(input: any): Partial<FormVars> {
  if (!input || typeof input !== "object") return {};

  const out: any = {};
  const fields: Array<keyof FormVars> = [
    "firstName",
    "lastName",
    "dateOfBirth",
    "medicalId",
    "gender",
    "bloodType",
    "allergies",
    "currentMedications",
    "emergencyContactName",
    "emergencyContactPhone",
  ];

  for (const f of fields) {
    if (f in input) {
      if (!isString(input[f])) {
        throw new Error(
          `Invalid field "${String(f)}" (must be non-empty string)`,
        );
      }
      out[f] = String(input[f]).trim();
    }
  }
  return out;
}

export function startApiServer() {
  const port = Number(process.env.PORT ?? 3000);

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === `${API_BASE}/health`) {
        return send(res, 200, { ok: true });
      }

      if (req.method === "POST" && req.url === `${API_BASE}/run`) {
        const body = await readJson(req);
        const vars = validateVars(body?.vars ?? body);
        const result = await runMedicalFormWorkflow(vars);
        return send(res, 200, { ok: true, result });
      }

      return send(res, 404, { ok: false, error: "Not found" });
    } catch (err: any) {
      log("error", "api_error", { err: String(err?.message ?? err) });
      return send(res, 400, { ok: false, error: String(err?.message ?? err) });
    }
  });

  server.listen(port, () => {
    log("info", "api_listening", { port });
  });

  return server;
}

if (require.main === module) {
  startApiServer();
}
