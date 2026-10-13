import { z } from "zod";

// These schemas are used in TWO places:
//   1. in the browser, as the React Hook Form resolver (instant inline errors), and
//   2. on the server, inside the API route (never trust the browser).
// Sharing them means one set of rules, and the same error messages in both places.

/**
 * A media source URL: http(s) only, and it must have a path (so there is a file to encode).
 *
 * One `superRefine` with early returns, instead of several `.refine()`s, so a bad value gets
 * exactly ONE message — Zod would otherwise run every refine and report them all.
 */
export const sourceUrlSchema = z
  .string()
  .trim()
  .min(1, "Source URL is required")
  .superRefine((value, ctx) => {
    if (value.length === 0) return; // the "required" message above already covers this

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid URL, e.g. https://cdn.example.com/videos/clip.mp4",
      });
      return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: "Only http and https URLs are supported" });
      return;
    }

    if (url.pathname === "/") {
      ctx.addIssue({
        code: "custom",
        message: "The URL must include a file path, e.g. /videos/clip.mp4",
      });
    }
  });

export const createJobSchema = z.object({
  sourceUrl: sourceUrlSchema,
  title: z
    .string()
    .trim()
    .max(80, "Keep the title under 80 characters")
    .optional()
    .or(z.literal("")),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

// Provided, and already used by the working sign-in page. Read it as a reference for the style
// we're after in sourceUrlSchema.
export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const startRunSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
});
