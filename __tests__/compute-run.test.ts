import { describe, expect, it } from "vitest";
import { computeRun, FAIL_URL, type RunRecord } from "@/lib/server/store";
import { TIMELINE } from "@/lib/types";

const START = 1_000_000;

function makeRecord(sourceUrl = "https://cdn.example.com/videos/clip.mp4"): RunRecord {
  return { id: "r_test", jobId: "j_test", sourceUrl, startedAt: START };
}

/** The run's state `elapsedMs` after it started. */
function runAt(elapsedMs: number, record = makeRecord()) {
  return computeRun(record, START + elapsedMs);
}

describe("computeRun — stage boundaries", () => {
  it("is QUEUED at 0ms and one millisecond before the queue ends", () => {
    expect(runAt(0).stage).toBe("QUEUED");
    expect(runAt(0).progressPct).toBe(0);
    expect(runAt(TIMELINE.queuedEndsMs - 1).stage).toBe("QUEUED");
  });

  it("moves to DOWNLOADING exactly when the queue ends", () => {
    expect(runAt(TIMELINE.queuedEndsMs).stage).toBe("DOWNLOADING");
    expect(runAt(TIMELINE.downloadingEndsMs - 1).stage).toBe("DOWNLOADING");
  });

  it("moves to TRANSCODING exactly when downloading ends", () => {
    expect(runAt(TIMELINE.downloadingEndsMs).stage).toBe("TRANSCODING");
    expect(runAt(TIMELINE.transcodingEndsMs - 1).stage).toBe("TRANSCODING");
  });

  it("is COMPLETED exactly when transcoding ends, with a result and 100%", () => {
    const run = runAt(TIMELINE.transcodingEndsMs);
    expect(run.stage).toBe("COMPLETED");
    expect(run.progressPct).toBe(100);
    expect(run.result?.renditions.length).toBeGreaterThan(0);
    expect(run.error).toBeUndefined();
  });

  it("stays COMPLETED long after the end", () => {
    expect(runAt(TIMELINE.transcodingEndsMs * 10)).toEqual(runAt(TIMELINE.transcodingEndsMs));
  });

  it("never lets progress go backwards", () => {
    let previous = -1;
    for (let ms = 0; ms <= TIMELINE.transcodingEndsMs + 1_000; ms += 100) {
      const { progressPct } = runAt(ms);
      expect(progressPct).toBeGreaterThanOrEqual(previous);
      previous = progressPct;
    }
  });
});

describe("computeRun — the corrupt source URL", () => {
  const corrupt = makeRecord(FAIL_URL);

  it("behaves normally until the failure point", () => {
    expect(runAt(TIMELINE.failAtMs - 1, corrupt).stage).toBe("TRANSCODING");
  });

  it("is FAILED exactly at the failure point, with an error and no result", () => {
    const run = runAt(TIMELINE.failAtMs, corrupt);
    expect(run.stage).toBe("FAILED");
    expect(run.error).toBeTruthy();
    expect(run.result).toBeUndefined();
  });

  it("freezes progress when it fails, and never changes again", () => {
    const failed = runAt(TIMELINE.failAtMs, corrupt);
    expect(failed.progressPct).toBeLessThan(100);
    expect(runAt(TIMELINE.failAtMs + 60_000, corrupt)).toEqual(failed);
  });
});
