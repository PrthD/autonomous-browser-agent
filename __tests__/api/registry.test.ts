import { describe, expect, it, vi } from "vitest";
import { RunRegistry } from "../../src/api/registry";

function makeRegistry(maxRuns = 200, runTtlMs = 60_000) {
  return new RunRegistry({ maxRuns, runTtlMs });
}

// ---------------------------------------------------------------------------
// TTL pruning
// ---------------------------------------------------------------------------
describe("RunRegistry – TTL pruning", () => {
  it("removes succeeded runs older than TTL", () => {
    const reg = makeRegistry(200, 1000); // 1s TTL
    const rec = reg.enqueueRun({});
    rec.status = "succeeded";
    rec.endedAt = new Date(Date.now() - 2000).toISOString(); // 2s ago
    reg.runs.set(rec.id, rec);

    reg.pruneRuns();
    expect(reg.runs.has(rec.id)).toBe(false);
  });

  it("removes failed runs older than TTL", () => {
    const reg = makeRegistry(200, 1000);
    const rec = reg.enqueueRun({});
    rec.status = "failed";
    rec.error = "boom";
    rec.endedAt = new Date(Date.now() - 2000).toISOString();
    reg.runs.set(rec.id, rec);

    reg.pruneRuns();
    expect(reg.runs.has(rec.id)).toBe(false);
  });

  it("keeps runs within TTL", () => {
    const reg = makeRegistry(200, 60_000);
    const rec = reg.enqueueRun({});
    rec.status = "succeeded";
    rec.endedAt = new Date().toISOString(); // just now
    reg.runs.set(rec.id, rec);

    reg.pruneRuns();
    expect(reg.runs.has(rec.id)).toBe(true);
  });

  it("does not prune queued/running runs regardless of age", () => {
    const reg = makeRegistry(200, 1);
    const rec = reg.enqueueRun({});
    // status is "queued" – should survive even with 1ms TTL
    reg.pruneRuns(Date.now() + 100_000);
    expect(reg.runs.has(rec.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MAX_RUNS eviction
// ---------------------------------------------------------------------------
describe("RunRegistry – MAX_RUNS eviction", () => {
  it("evicts oldest runs when exceeding MAX_RUNS", () => {
    const reg = makeRegistry(3, 9999999);

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = reg.enqueueRun({});
      // stagger createdAt to ensure deterministic ordering
      r.createdAt = new Date(Date.now() - (5 - i) * 1000).toISOString();
      reg.runs.set(r.id, r);
      ids.push(r.id);
    }

    reg.pruneRuns();
    expect(reg.runs.size).toBe(3);

    // oldest two should be evicted
    expect(reg.runs.has(ids[0])).toBe(false);
    expect(reg.runs.has(ids[1])).toBe(false);
    // newest three should survive
    expect(reg.runs.has(ids[2])).toBe(true);
    expect(reg.runs.has(ids[3])).toBe(true);
    expect(reg.runs.has(ids[4])).toBe(true);
  });

  it("does nothing when under MAX_RUNS", () => {
    const reg = makeRegistry(10, 9999999);
    reg.enqueueRun({});
    reg.enqueueRun({});

    reg.pruneRuns();
    expect(reg.runs.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Waiter lifecycle
// ---------------------------------------------------------------------------
describe("RunRegistry – waiters", () => {
  it("resolves immediately for already-succeeded runs", async () => {
    const reg = makeRegistry();
    const rec = reg.enqueueRun({});
    rec.status = "succeeded";
    reg.runs.set(rec.id, rec);

    const result = await reg.waitForRun(rec.id, 1000);
    expect(result.status).toBe("succeeded");
  });

  it("resolves immediately for already-failed runs", async () => {
    const reg = makeRegistry();
    const rec = reg.enqueueRun({});
    rec.status = "failed";
    rec.error = "boom";
    reg.runs.set(rec.id, rec);

    const result = await reg.waitForRun(rec.id, 1000);
    expect(result.status).toBe("failed");
  });

  it("waits and resolves when notifyWaiters is called", async () => {
    const reg = makeRegistry();
    const rec = reg.enqueueRun({});

    const promise = reg.waitForRun(rec.id, 5000);

    // simulate completion
    rec.status = "succeeded";
    reg.runs.set(rec.id, rec);
    reg.notifyWaiters(rec.id, rec);

    const result = await promise;
    expect(result.status).toBe("succeeded");
    // waiters should be cleaned up
    expect(reg.waiters.has(rec.id)).toBe(false);
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();

    const reg = makeRegistry();
    const rec = reg.enqueueRun({});

    const promise = reg.waitForRun(rec.id, 100);

    vi.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow("Timed out waiting for run");

    // waiter should be cleaned up
    expect(reg.waiters.has(rec.id)).toBe(false);

    vi.useRealTimers();
  });

  it("cleans up individual waiter on timeout (others survive)", async () => {
    vi.useFakeTimers();

    const reg = makeRegistry();
    const rec = reg.enqueueRun({});

    // add two waiters with different timeouts
    const p1 = reg.waitForRun(rec.id, 50);
    const p2 = reg.waitForRun(rec.id, 5000);

    // p1 should timeout
    vi.advanceTimersByTime(100);
    await expect(p1).rejects.toThrow("Timed out");

    // p2 should still be waiting
    expect(reg.waiters.get(rec.id)?.length).toBe(1);

    // complete
    rec.status = "succeeded";
    reg.runs.set(rec.id, rec);
    reg.notifyWaiters(rec.id, rec);

    const result = await p2;
    expect(result.status).toBe("succeeded");

    vi.useRealTimers();
  });

  it("rejects for unknown runId", async () => {
    const reg = makeRegistry();
    await expect(reg.waitForRun("nonexistent", 1000)).rejects.toThrow(
      "Unknown runId",
    );
  });
});

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------
describe("RunRegistry – stats", () => {
  it("reports correct counts", () => {
    const reg = makeRegistry();
    reg.enqueueRun({});
    const r2 = reg.enqueueRun({});
    r2.status = "running";
    reg.runs.set(r2.id, r2);

    const s = reg.stats();
    expect(s.runsSize).toBe(2);
    expect(s.byStatus.queued).toBe(1);
    expect(s.byStatus.running).toBe(1);
    expect(s.queueDepth).toBe(2);
  });
});
