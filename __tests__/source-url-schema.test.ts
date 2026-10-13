import { describe, expect, it } from "vitest";
import { createJobSchema, sourceUrlSchema } from "@/lib/schemas";

function firstMessage(value: string): string | undefined {
  const result = sourceUrlSchema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("sourceUrlSchema", () => {
  it("accepts http and https URLs that have a file path", () => {
    expect(sourceUrlSchema.safeParse("https://cdn.example.com/videos/clip.mp4").success).toBe(true);
    expect(sourceUrlSchema.safeParse("http://media.example.com/a/b/movie.mov").success).toBe(true);
  });

  it("rejects an empty value as required", () => {
    expect(firstMessage("")).toBe("Source URL is required");
  });

  it("rejects text that is not a URL", () => {
    expect(firstMessage("not a url")).toMatch(/valid URL/i);
  });

  it("rejects protocols other than http and https", () => {
    expect(firstMessage("ftp://cdn.example.com/clip.mp4")).toMatch(/http/i);
  });

  it("rejects a URL with no path, because there is nothing to encode", () => {
    expect(firstMessage("https://cdn.example.com")).toMatch(/path/i);
    expect(firstMessage("https://cdn.example.com/")).toMatch(/path/i);
  });

  it("reports only one message per bad value", () => {
    const result = sourceUrlSchema.safeParse("not a url");
    expect(result.success ? 0 : result.error.issues.length).toBe(1);
  });
});

describe("createJobSchema", () => {
  it("uses the same URL rule for the whole form", () => {
    const result = createJobSchema.safeParse({ sourceUrl: "ftp://x.com/a.mp4" });
    expect(result.success).toBe(false);
  });
});
