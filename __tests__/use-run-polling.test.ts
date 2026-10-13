import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRunPolling } from "@/lib/client/use-run-polling";
import * as hooks from "@/lib/client/hooks";
import type { EncodeRun, Stage } from "@/lib/types";

/** Moves the fake clock forward inside act(), so React applies the state updates it causes. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function runAt(stage: Stage, message: string): EncodeRun {
  return { id: "r_1", jobId: "j_1", stage, progressPct: 10, message };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useRunPolling", () => {
  it("does not fetch anything while runId is null", async () => {
    const fetchRun = vi.spyOn(hooks, "fetchRun");
    renderHook(() => useRunPolling(null));
    await advance(5_000);
    expect(fetchRun).not.toHaveBeenCalled();
  });

  it("polls about once a second, logs each message once, and stops at a terminal stage", async () => {
    const fetchRun = vi
      .spyOn(hooks, "fetchRun")
      .mockResolvedValueOnce(runAt("QUEUED", "Waiting"))
      .mockResolvedValueOnce(runAt("QUEUED", "Waiting")) // same message again: not logged twice
      .mockResolvedValueOnce(runAt("COMPLETED", "Done"));
    const onFinished = vi.fn();

    const { result } = renderHook(() => useRunPolling("r_1", onFinished));
    await advance(5_000);

    expect(fetchRun).toHaveBeenCalledTimes(3); // nothing after the terminal stage
    expect(result.current.run?.stage).toBe("COMPLETED");
    expect(result.current.polling).toBe(false);
    expect(result.current.log).toEqual(["Waiting", "Done"]);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("stops polling when the component unmounts", async () => {
    const fetchRun = vi.spyOn(hooks, "fetchRun").mockResolvedValue(runAt("DOWNLOADING", "Downloading"));

    const { unmount } = renderHook(() => useRunPolling("r_1"));
    await advance(2_500);
    const callsBeforeUnmount = fetchRun.mock.calls.length;
    expect(callsBeforeUnmount).toBeGreaterThan(1);

    unmount();
    await advance(10_000);
    expect(fetchRun).toHaveBeenCalledTimes(callsBeforeUnmount);
  });

  it("ignores a response that arrives after unmount", async () => {
    let resolveFetch: (run: EncodeRun) => void = () => {};
    vi.spyOn(hooks, "fetchRun").mockReturnValue(
      new Promise<EncodeRun>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const onFinished = vi.fn();

    const { result, unmount } = renderHook(() => useRunPolling("r_1", onFinished));
    unmount();
    resolveFetch(runAt("COMPLETED", "Done"));
    await advance(0);

    expect(result.current.run).toBeNull();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("stops and reports an error when a request fails", async () => {
    const fetchRun = vi.spyOn(hooks, "fetchRun").mockRejectedValue(new Error("Run not found"));

    const { result } = renderHook(() => useRunPolling("r_missing"));
    await advance(5_000);

    expect(result.current.fetchError).toBe("Run not found");
    expect(result.current.polling).toBe(false);
    expect(fetchRun).toHaveBeenCalledTimes(1);
  });
});
