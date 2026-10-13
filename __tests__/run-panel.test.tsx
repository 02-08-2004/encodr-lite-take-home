import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import * as hooks from "@/lib/client/hooks";
import { RunPanel } from "@/components/run-panel";
import { computeRun, FAIL_URL } from "@/lib/server/store";

// These tests connect the real RunPanel + polling hook to the real computeRun, with the network
// replaced by a fake that starts runs and answers polls using a fake clock.

const GOOD_URL = "https://cdn.example.com/videos/clip.mp4";

function fakeServer(sourceUrl: string) {
  const startedAt = new Map<string, number>();
  let counter = 0;

  const post = vi.spyOn(api, "post").mockImplementation(async () => {
    counter += 1;
    const runId = `r_${counter}`;
    startedAt.set(runId, Date.now());
    return { runId };
  });

  const fetchRun = vi.spyOn(hooks, "fetchRun").mockImplementation(async (runId) => {
    const started = startedAt.get(runId);
    if (started === undefined) throw new Error("Run not found");
    return computeRun({ id: runId, jobId: "j_1", sourceUrl, startedAt: started }, Date.now());
  });

  return { post, fetchRun };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RunPanel jobId="j_1" />
    </QueryClientProvider>,
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function click(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  await advance(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RunPanel", () => {
  it("starts idle, then shows live progress and a log once the run starts", async () => {
    fakeServer(GOOD_URL);
    renderPanel();

    expect(screen.getByRole("button", { name: /start encode/i })).toBeEnabled();
    await click(/start encode/i);

    expect(screen.queryByRole("button", { name: /start encode/i })).not.toBeInTheDocument();
    await advance(3_000);
    expect(screen.getByText("DOWNLOADING")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: /run log/i })).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
  });

  it("shows the renditions table when the run completes", async () => {
    fakeServer(GOOD_URL);
    renderPanel();

    await click(/start encode/i);
    await advance(13_000);

    expect(screen.getByRole("heading", { name: /output files/i })).toBeInTheDocument();
    expect(screen.getByText("1080p")).toBeInTheDocument();
    expect(screen.getByText("1920×1080")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a clear error with a Retry button when the run fails, and Retry starts a fresh run", async () => {
    const { post, fetchRun } = fakeServer(FAIL_URL);
    renderPanel();

    await click(/start encode/i);
    await advance(9_000);

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/encode failed/i)).toBeInTheDocument();
    expect(within(alert).getByText(/corrupt/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /output files/i })).not.toBeInTheDocument();

    // Polling has stopped: no more requests for the failed run as time passes.
    const callsWhenFailed = fetchRun.mock.calls.length;
    await advance(5_000);
    expect(fetchRun).toHaveBeenCalledTimes(callsWhenFailed);

    await click(/retry/i);
    expect(post).toHaveBeenCalledTimes(2);
    expect(fetchRun).toHaveBeenLastCalledWith("r_2", expect.anything());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // back to running
  });

  it("stops polling when the user navigates away mid-run", async () => {
    const { fetchRun } = fakeServer(GOOD_URL);
    const { unmount } = renderPanel();

    await click(/start encode/i);
    await advance(3_000);
    unmount();
    const callsAtUnmount = fetchRun.mock.calls.length;

    await advance(20_000);
    expect(fetchRun).toHaveBeenCalledTimes(callsAtUnmount);
  });
});
