"use client";

import { useEffect, useRef, useState } from "react";
import { fetchRun } from "@/lib/client/hooks";
import { isTerminalStage, type EncodeRun } from "@/lib/types";

export interface RunPollingState {
  /** The latest run state we've received, or null before the first response. */
  run: EncodeRun | null;
  /** True while we're still asking the server for updates. */
  polling: boolean;
  /** A request failed (network, 404, …). Not the same thing as the RUN failing. */
  fetchError: string | null;
  /** Every message we've seen, oldest first — the log the UI renders. */
  log: string[];
}

const initialState: RunPollingState = {
  run: null,
  polling: false,
  fetchError: null,
  log: [],
};

const POLL_INTERVAL_MS = 1_000;

/**
 * Polls a run about once a second until it reaches a terminal stage (COMPLETED or FAILED).
 *
 * - `runId === null`: does nothing.
 * - Each new `message` is added to `log` (never the same message twice in a row).
 * - Stops by itself on a terminal stage, then calls `onFinished` once.
 * - Cleans up on unmount or when `runId` changes (see the comments in the effect).
 */
export function useRunPolling(runId: string | null, onFinished?: () => void): RunPollingState {
  const [state, setState] = useState<RunPollingState>(initialState);

  // Keep the newest `onFinished` in a ref, so a parent passing a new function on every render
  // does not restart the polling effect (it only depends on `runId`).
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(() => {
    if (!runId) return;

    // Two separate problems, so two separate protections:
    //  - `timer` + clearTimeout stops FUTURE polls.
    //  - `cancelled` + abort() deal with the request that is ALREADY in flight: it may still
    //    resolve after we've gone, and must not write to state for a run we no longer show.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    setState({ ...initialState, polling: true });

    // A chain of setTimeouts rather than setInterval: the next request is only scheduled after
    // the previous one has finished, so slow responses can never pile up.
    const poll = async () => {
      try {
        const run = await fetchRun(runId, controller.signal);
        if (cancelled) return;

        const finished = isTerminalStage(run.stage);
        setState((previous) => ({
          run,
          polling: !finished,
          fetchError: null,
          log: previous.log.at(-1) === run.message ? previous.log : [...previous.log, run.message],
        }));

        if (finished) {
          onFinishedRef.current?.();
          return; // terminal stage: do not schedule another poll
        }
      } catch (e) {
        if (cancelled) return; // an aborted request throws; that is expected, not an error
        setState((previous) => ({
          ...previous,
          polling: false,
          fetchError: e instanceof Error ? e.message : "Request failed",
        }));
        return;
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [runId]);

  return state;
}
