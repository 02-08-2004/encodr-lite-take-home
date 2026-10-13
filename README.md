# Encodr Lite — Intern Take-Home

A small media-transcoding dashboard: a signed-in user creates an encode **job** from a media URL,
presses **Start encode**, watches the progress update live, and sees the output files when it
finishes (or a clear error and a Retry when it fails). The full brief is in [`BRIEF.md`](./BRIEF.md).

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run test:run     # tests
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

Requires **Node 20+**. **Demo login:** `demo@encodr.dev` / `password123`.
State lives in memory, so restarting the dev server wipes the jobs.

## What's working

All six tasks are done. Nothing is half-finished that I know of.

| # | Task | Status |
|---|---|---|
| 1 | Source-URL validation (`lib/schemas.ts`) | Done |
| 2 | Jobs API routes (`app/api/jobs/route.ts`) | Done |
| 3 | Run state machine (`computeRun` in `lib/server/store.ts`) | Done, tests written first |
| 4 | Create-job form (`components/create-job-form.tsx`, used by `app/(app)/jobs/page.tsx`) | Done |
| 5 | Live progress + results (`lib/client/use-run-polling.ts`, `components/run-panel.tsx`) | Done |
| 6 | Tests (`__tests__/`) | Done — 28 tests |

**Test-first:** I wrote the `computeRun` and `sourceUrlSchema` tests first, ran them and watched 14
of them fail, committed them (`Add failing tests ...`), and only then wrote the implementations.
The git history shows this order.

I also checked that the tests can fail: I temporarily broke the code (removed the polling cleanup,
changed `>=` to `>` in `computeRun`, made polling never stop) and confirmed the relevant tests failed.

## How to see the failure path

1. Sign in and create a job with the source URL `https://cdn.example.com/videos/corrupt.mp4`.
2. Open the job and press **Start encode**.
3. The run goes QUEUED → DOWNLOADING → TRANSCODING, then at about 8 seconds it **fails** at 67%.
   The detail page shows a red panel with the error message and a **Retry** button, and the job's
   status badge changes to FAILED. Retry starts a fresh run.

Any other valid URL (for example `https://cdn.example.com/videos/clip.mp4`) completes after about
12 seconds and shows the renditions table.

## Decisions and assumptions

- **`computeRun` is a pure function of elapsed time.** Boundaries are inclusive at the start and
  exclusive at the end (DOWNLOADING is `2000 <= elapsed < 6000`), so exactly on a boundary a run is
  already in the next stage. A negative elapsed time (clock slightly behind) is treated as 0.
- **Progress** is elapsed time scaled across the whole 12 s timeline, so it can only go up. A
  failed run freezes at the percentage it had reached at 8 s (67%).
- **The corrupt URL is checked before completion**, so a corrupt run can never reach COMPLETED.
- **URL validation** uses a single `superRefine` with early returns, so a bad value gets exactly one
  message (several `.refine()`s would all run and show multiple messages). The schema trims
  whitespace. A URL whose path is just `/` counts as "no path". The same schema runs in the browser
  and in `POST /api/jobs`; the server returns 422 with per-field messages, and the form puts them on
  the matching inputs. A body that isn't JSON gets a 400.
- **Detail page state** is one value derived from the polled run: `idle | running | failed |
  completed` (`getPanelState` in `components/run-panel.tsx`). It's a discriminated union rather than
  several booleans, so "running and failed" can't be expressed. Only `runId` is real state; the rest
  comes from the polled run. If the polled run's id doesn't match the current `runId` (right after
  Retry) it's treated as "starting" so the old failure doesn't flash.
- **Polling is a custom hook with a `setTimeout` chain**, not `setInterval` and not `useQuery`'s
  `refetchInterval`. The next request is only scheduled after the previous one finishes, so slow
  responses can't pile up, and the stop/cleanup rules are visible in one place.
- **Polling cleanup:** the effect returns a cleanup that does three things — `clearTimeout` (no
  future polls), `abort()` on an `AbortController` (cancels the request in flight), and sets a
  `cancelled` flag that is checked after every `await` (no state is written after unmount or after
  `runId` changes). Polling also stops by itself on COMPLETED or FAILED. `onFinished` goes through
  a ref so a parent passing a new function each render doesn't restart the effect.
- **Request errors vs run failures** are separate: if a poll request fails (network, 404), polling
  stops and `fetchError` shows a message. That's different from the run itself being FAILED.
- **The form lives in `components/create-job-form.tsx`**, not in `page.tsx`, because Next.js page
  files can't export extra components and I wanted to test the form on its own.
- **Assumption:** the title is optional; if empty, the server derives it from the URL's file name
  (this was already in the provided store).

## Tests

28 tests in `__tests__/`:

- `compute-run.test.ts` — every stage boundary (including exactly on the boundary), progress never
  goes backwards, COMPLETED has a result, the corrupt URL fails exactly at 8 s and stays failed.
- `source-url-schema.test.ts` — good URLs pass; empty, not-a-URL, wrong protocol and no-path each
  fail with the right message; only one message per bad value.
- `create-job-form.test.tsx` — invalid URL shows an error and the API is **not** called; a valid URL
  is sent; a server 422 shows on the right field.
- `use-run-polling.test.ts` — does nothing without a `runId`; polls about once a second and stops at
  a terminal stage; no more requests after unmount; a response arriving after unmount is ignored;
  a failed request stops polling and reports an error.
- `run-panel.test.tsx` — the whole detail screen against the real `computeRun` and a fake clock:
  progress and log, results table on success, failure + Retry, and no polling after navigating away.

## What was hardest

The hardest part was making sure polling stopped cleanly when navigating away or switching runs. At first I thought a standard `setInterval` with a cleanup function would be enough, but then I understood that slow requests can pile up and an in-flight network response could still resolve and update state after unmount. I handled this by using a recursive `setTimeout` chain alongside an `AbortController` and an explicit `cancelled` flag. I tested this by unmounting the component during an active poll in Vitest and verifying that no late responses were processed.

## What I'd do next

- Resume a run after a page reload or navigating back: the job already stores `latestRunId`, so the
  detail page could start polling it on load instead of showing the Start button.
- Pause polling while the browser tab is hidden (`document.visibilityState`), and retry a failed
  poll a couple of times with backoff before giving up.
- Smooth the progress bar between polls.
- A real browser test (Playwright) for the full sign-in → create → run → fail → retry flow; right
  now that flow is covered by the integration test with a fake network.
- Show a "created 2 minutes ago" time on each job.

## Time spent

About 5 hours, plus extra time reading and understanding the code, running tests, and manual verification.

## AI use

I used Claude to help build this project, which the brief allows. After that I read every file, ran the app, tested the failure path myself, and I can explain the code.
