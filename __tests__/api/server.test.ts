import http from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunRegistry } from "../../src/api/registry";
import { httpRequest } from "../helpers/mocks";

// Mock the workflow so it never launches a real browser
vi.mock("../../src/workflow", () => ({
  runMedicalFormWorkflow: vi.fn(),
  defaultVars: vi.fn().mockReturnValue({}),
  buildGoal: vi.fn().mockReturnValue("mock goal"),
}));

// Mock dotenv-defaults to avoid loading .env during tests
vi.mock("dotenv-defaults/config", () => ({}));

import { processQueue, startApiServer } from "../../src/api/server";
import { runMedicalFormWorkflow } from "../../src/workflow";

const mockWorkflow = vi.mocked(runMedicalFormWorkflow);

describe("API server – integration", () => {
  let server: http.Server;
  let port: number;
  let registry: RunRegistry;

  beforeEach(async () => {
    registry = new RunRegistry({ maxRuns: 200, runTtlMs: 60_000 });
    mockWorkflow.mockReset();

    // Use random port to avoid conflicts
    port = 30000 + Math.floor(Math.random() * 10000);
    process.env.PORT = String(port);

    server = startApiServer(registry, mockWorkflow);

    // Wait for server to be listening
    await new Promise<void>((resolve) => {
      server.on("listening", resolve);
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------
  it("GET /health returns ok", async () => {
    const res = await httpRequest(port, "GET", "/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // -----------------------------------------------------------------------
  // POST /run enqueues and returns 202
  // -----------------------------------------------------------------------
  it("POST /run enqueues a run and returns 202", async () => {
    mockWorkflow.mockResolvedValue({ ok: true, reason: "Submitted" });

    const res = await httpRequest(port, "POST", "/api/v1/run", {
      firstName: "Alice",
    });

    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.runId).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Run lifecycle: queued → running → succeeded
  // -----------------------------------------------------------------------
  it("full lifecycle: POST /run then GET /runs/:id", async () => {
    mockWorkflow.mockImplementation(async () => {
      // Simulate some work
      return { ok: true, reason: "Submitted" };
    });

    const postRes = await httpRequest(port, "POST", "/api/v1/run", {
      firstName: "Bob",
    });
    const runId = postRes.body.runId;

    // Process the queue manually
    await processQueue(registry, mockWorkflow);

    const getRes = await httpRequest(port, "GET", `/api/v1/runs/${runId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.run.status).toBe("succeeded");
    expect(getRes.body.run.result).toEqual({
      ok: true,
      reason: "Submitted",
    });
  });

  // -----------------------------------------------------------------------
  // Run failure lifecycle
  // -----------------------------------------------------------------------
  it("failed run sets status and error", async () => {
    mockWorkflow.mockRejectedValue(new Error("Browser crashed"));

    const postRes = await httpRequest(port, "POST", "/api/v1/run", {});
    const runId = postRes.body.runId;

    await processQueue(registry, mockWorkflow);

    const getRes = await httpRequest(port, "GET", `/api/v1/runs/${runId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.run.status).toBe("failed");
    expect(getRes.body.run.error).toContain("Browser crashed");
  });

  // -----------------------------------------------------------------------
  // Unknown runId returns 404
  // -----------------------------------------------------------------------
  it("GET /runs/:id returns 404 for unknown id", async () => {
    const res = await httpRequest(port, "GET", "/api/v1/runs/bogus-id");
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 404 for unknown routes
  // -----------------------------------------------------------------------
  it("returns 404 for unknown paths", async () => {
    const res = await httpRequest(port, "GET", "/api/v1/nonexistent");
    expect(res.status).toBe(404);
  });

  // -----------------------------------------------------------------------
  // wait=true returns synchronously
  // -----------------------------------------------------------------------
  it("POST /run?wait=true waits for completion", async () => {
    mockWorkflow.mockImplementation(async () => {
      return { ok: true, reason: "Done" };
    });

    // Need to start processing before the wait resolves
    const promise = httpRequest(
      port,
      "POST",
      "/api/v1/run?wait=true&timeoutMs=5000",
      { firstName: "Charlie" },
    );

    // Give time for the enqueue, then process
    await new Promise((r) => setTimeout(r, 50));
    await processQueue(registry, mockWorkflow);

    const res = await promise;
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.run.status).toBe("succeeded");
  });

  // -----------------------------------------------------------------------
  // wait=true with failed run returns 500
  // -----------------------------------------------------------------------
  it("POST /run?wait=true returns 500 on failure", async () => {
    mockWorkflow.mockRejectedValue(new Error("LLM error"));

    const promise = httpRequest(
      port,
      "POST",
      "/api/v1/run?wait=true&timeoutMs=5000",
      {},
    );

    await new Promise((r) => setTimeout(r, 50));
    await processQueue(registry, mockWorkflow);

    const res = await promise;
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.run.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// processQueue – single-worker enforcement
// ---------------------------------------------------------------------------
describe("processQueue – single-worker enforcement", () => {
  it("does not process two runs concurrently", async () => {
    const registry = new RunRegistry({ maxRuns: 200, runTtlMs: 60_000 });
    let concurrency = 0;
    let maxConcurrency = 0;

    const slowWorkflow = vi.fn().mockImplementation(async () => {
      concurrency++;
      maxConcurrency = Math.max(maxConcurrency, concurrency);
      await new Promise((r) => setTimeout(r, 50));
      concurrency--;
      return { ok: true, reason: "Done" };
    });

    registry.enqueueRun({ firstName: "A" });
    registry.enqueueRun({ firstName: "B" });

    await processQueue(registry, slowWorkflow as any);

    // Let second run process
    await new Promise((r) => setTimeout(r, 200));

    expect(maxConcurrency).toBe(1);
    expect(slowWorkflow).toHaveBeenCalledTimes(2);
  });

  it("skips processing when already running", async () => {
    const registry = new RunRegistry({ maxRuns: 200, runTtlMs: 60_000 });
    registry.running = true;

    const mockWf = vi.fn();
    registry.enqueueRun({});

    await processQueue(registry, mockWf as any);

    // Should not have started the workflow
    expect(mockWf).not.toHaveBeenCalled();
  });

  it("does nothing when queue is empty", async () => {
    const registry = new RunRegistry({ maxRuns: 200, runTtlMs: 60_000 });
    const mockWf = vi.fn();

    await processQueue(registry, mockWf as any);

    expect(mockWf).not.toHaveBeenCalled();
  });
});
