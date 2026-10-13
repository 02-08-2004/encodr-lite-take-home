import { randomUUID } from "node:crypto";
import { TIMELINE, type EncodeResult, type EncodeRun, type Job, type JobStatus } from "@/lib/types";

// Our "database" is two Maps held in memory. `next dev` is a single Node process, so this is fine
// for the exercise. Restarting the dev server wipes everything — that's expected, don't work around it.
//
// computeRun() below is the run state machine; the rest of the file is the in-memory store.

const jobs = new Map<string, Job>();
const runs = new Map<string, RunRecord>();

export interface RunRecord {
  id: string;
  jobId: string;
  sourceUrl: string;
  /** epoch milliseconds — when Start encode was pressed. */
  startedAt: number;
}

/** The one "magic" source URL that always fails partway, so you can build the error path. */
export const FAIL_URL = "https://cdn.example.com/videos/corrupt.mp4";

// ---------------------------------------------------------------------------
// The run state machine
// ---------------------------------------------------------------------------

/**
 * Works out what state a run is in right now.
 *
 * There are no server timers: the state is a pure function of `now - record.startedAt`, so the
 * same inputs always give the same output and tests can pass any `now` they like.
 *
 * Boundaries are inclusive at the start and exclusive at the end (e.g. DOWNLOADING is
 * 2000ms <= elapsed < 6000ms), so a run is already in the next stage exactly ON the boundary.
 */
export function computeRun(record: RunRecord, now: number = Date.now()): EncodeRun {
  // A clock that is slightly behind startedAt should not produce a negative percentage.
  const elapsed = Math.max(0, now - record.startedAt);
  const base = { id: record.id, jobId: record.jobId };

  if (record.sourceUrl === FAIL_URL && elapsed >= TIMELINE.failAtMs) {
    return {
      ...base,
      stage: "FAILED",
      progressPct: progressAt(TIMELINE.failAtMs), // frozen at the point of failure
      message: "Encode failed",
      error: "The source file is corrupt and could not be transcoded.",
    };
  }

  if (elapsed >= TIMELINE.transcodingEndsMs) {
    return {
      ...base,
      stage: "COMPLETED",
      progressPct: 100,
      message: "Encode complete",
      result: makeResult(),
    };
  }

  const progressPct = progressAt(elapsed);

  if (elapsed >= TIMELINE.downloadingEndsMs) {
    return { ...base, stage: "TRANSCODING", progressPct, message: "Transcoding renditions…" };
  }
  if (elapsed >= TIMELINE.queuedEndsMs) {
    return { ...base, stage: "DOWNLOADING", progressPct, message: "Downloading source file…" };
  }
  return { ...base, stage: "QUEUED", progressPct, message: "Waiting in the queue…" };
}

/** Scales elapsed time across the whole timeline to 0–100. Grows with time, so never goes back. */
function progressAt(elapsedMs: number): number {
  const fraction = elapsedMs / TIMELINE.transcodingEndsMs;
  return Math.min(100, Math.round(fraction * 100));
}

// ---------------------------------------------------------------------------
// The in-memory store
// ---------------------------------------------------------------------------

/** Fake but plausible encode output. Call this when a run reaches COMPLETED. */
export function makeResult(): EncodeResult {
  return {
    durationSec: 184,
    renditions: [
      { label: "1080p", width: 1920, height: 1080, sizeMb: 142.6 },
      { label: "720p", width: 1280, height: 720, sizeMb: 68.3 },
      { label: "480p", width: 854, height: 480, sizeMb: 24.1 },
    ],
  };
}

export function listJobs(): Job[] {
  return [...jobs.values()]
    .map(withDerivedStatus)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | null {
  const job = jobs.get(id);
  return job ? withDerivedStatus(job) : null;
}

export function createJob(input: { sourceUrl: string; title?: string }): Job {
  const sourceUrl = input.sourceUrl.trim();
  const job: Job = {
    id: `j_${randomUUID().slice(0, 8)}`,
    title: input.title?.trim() || deriveTitle(sourceUrl),
    sourceUrl,
    status: "NEW",
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  return job;
}

export function startRun(jobId: string): RunRecord | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  const record: RunRecord = {
    id: `r_${randomUUID().slice(0, 8)}`,
    jobId,
    sourceUrl: job.sourceUrl,
    startedAt: Date.now(),
  };
  runs.set(record.id, record);
  job.latestRunId = record.id;
  return record;
}

export function getRun(id: string, now: number = Date.now()): EncodeRun | null {
  const record = runs.get(id);
  return record ? computeRun(record, now) : null;
}

/**
 * A job's status is derived from its latest run rather than stored, so it can never drift out of
 * sync. So job statuses in the list update on their own as runs progress.
 */
function withDerivedStatus(job: Job): Job {
  if (!job.latestRunId) return job;
  const record = runs.get(job.latestRunId);
  if (!record) return job;

  const stage = computeRun(record).stage;
  const status: JobStatus =
    stage === "COMPLETED" ? "COMPLETED" : stage === "FAILED" ? "FAILED" : "RUNNING";
  return { ...job, status };
}

function deriveTitle(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "Untitled encode";
  } catch {
    return "Untitled encode";
  }
}

/** Test helper — resets the store between tests. */
export function __resetStore() {
  jobs.clear();
  runs.clear();
}

export { TIMELINE };
