import { error, json, readJson, validationError, withAuth } from "@/lib/server/http";
import { createJob, listJobs } from "@/lib/server/store";
import { createJobSchema } from "@/lib/schemas";

// GET /api/jobs — the signed-in user's jobs, newest first.
export async function GET(req: Request) {
  return withAuth(req, () => json(listJobs()));
}

// POST /api/jobs — create a job.
// The server validates with the same schema as the browser form: a request can reach this route
// without ever going through the form (curl, another client, a bug), so it must not trust the client.
export async function POST(req: Request) {
  return withAuth(req, async () => {
    const body = await readJson(req);
    if (body === null) return error(400, "Request body must be valid JSON");

    const parsed = createJobSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    return json(createJob(parsed.data), 201);
  });
}
