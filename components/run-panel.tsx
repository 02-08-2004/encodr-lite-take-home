"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { jobKeys, useStartRun } from "@/lib/client/hooks";
import { useRunPolling } from "@/lib/client/use-run-polling";
import type { EncodeRun } from "@/lib/types";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";

/**
 * What the panel is showing. It is worked out from the run itself (see getPanelState), so the
 * panel is in exactly one of these at a time — "running and failed" cannot be expressed.
 */
type PanelState =
  | { kind: "idle" }
  | { kind: "running"; run: EncodeRun | null } // null until the first response arrives
  | { kind: "failed"; run: EncodeRun }
  | { kind: "completed"; run: EncodeRun };

function getPanelState(runId: string | null, run: EncodeRun | null): PanelState {
  if (!runId) return { kind: "idle" };
  // `run.id !== runId` means the polled run is still the PREVIOUS one (e.g. just after Retry).
  if (!run || run.id !== runId) return { kind: "running", run: null };
  if (run.stage === "FAILED") return { kind: "failed", run };
  if (run.stage === "COMPLETED") return { kind: "completed", run };
  return { kind: "running", run };
}

export function RunPanel({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const startRun = useStartRun(jobId);
  const [runId, setRunId] = useState<string | null>(null);

  // When the run ends, refresh the job so the status badge in the page header updates.
  const polling = useRunPolling(runId, () => {
    queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
    queryClient.invalidateQueries({ queryKey: jobKeys.all });
  });

  const panel = getPanelState(runId, polling.run);

  function handleStart() {
    // A new runId makes the polling hook clean up the old run and start on the new one.
    // If starting fails, the mutation's error state is shown below — nothing to catch here.
    startRun.mutate(undefined, { onSuccess: ({ runId: newRunId }) => setRunId(newRunId) });
  }

  const startDisabled = startRun.isPending || panel.kind === "running";

  return (
    <section className="space-y-4" aria-label="Encode run">
      {(panel.kind === "idle" || panel.kind === "completed") && (
        <StartButton
          label={panel.kind === "idle" ? "Start encode" : "Run again"}
          disabled={startDisabled}
          pending={startRun.isPending}
          onClick={handleStart}
        />
      )}

      {startRun.isError && (
        <p role="alert" className="text-sm text-red-600">
          Could not start the encode: {startRun.error.message}
        </p>
      )}

      {panel.kind === "running" && (
        <RunProgress run={panel.run} log={polling.log} />
      )}

      {panel.kind === "failed" && (
        <div className="space-y-4">
          <RunProgress run={panel.run} log={polling.log} failed />
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4">
            <p className="font-medium text-red-700">Encode failed</p>
            <p className="mt-1 text-sm text-red-700">{panel.run.error}</p>
            <div className="mt-3">
              <StartButton
                label="Retry"
                disabled={startDisabled}
                pending={startRun.isPending}
                onClick={handleStart}
              />
            </div>
          </div>
        </div>
      )}

      {panel.kind === "completed" && (
        <div className="space-y-4">
          <RunProgress run={panel.run} log={polling.log} />
          <Results run={panel.run} />
        </div>
      )}

      {polling.fetchError && (
        <p role="alert" className="text-sm text-red-600">
          Could not get the latest status ({polling.fetchError}). Reload the page to check again.
        </p>
      )}
    </section>
  );
}

function StartButton(props: {
  label: string;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {props.pending ? "Starting…" : props.label}
    </button>
  );
}

function RunProgress(props: {
  run: EncodeRun | null;
  log: string[];
  failed?: boolean;
}) {
  const { run, log, failed } = props;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {run ? <StatusBadge value={run.stage} /> : <span className="text-sm text-neutral-500">Starting…</span>}
        <span className="text-sm tabular-nums text-neutral-600">{run ? `${run.progressPct}%` : ""}</span>
      </div>
      <ProgressBar value={run?.progressPct ?? 0} failed={failed} />
      <ul aria-label="Run log" className="space-y-1 rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
        {log.map((message, index) => (
          <li key={`${index}-${message}`}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function Results({ run }: { run: EncodeRun }) {
  if (!run.result) return null;
  const { durationSec, renditions } = run.result;
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Output files</h2>
      <p className="text-sm text-neutral-600">Duration: {durationSec} seconds</p>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-2 font-medium">Rendition</th>
            <th className="py-2 font-medium">Resolution</th>
            <th className="py-2 text-right font-medium">Size</th>
          </tr>
        </thead>
        <tbody>
          {renditions.map((rendition) => (
            <tr key={rendition.label} className="border-b border-neutral-100">
              <td className="py-2">{rendition.label}</td>
              <td className="py-2">
                {rendition.width}×{rendition.height}
              </td>
              <td className="py-2 text-right tabular-nums">{rendition.sizeMb} MB</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
