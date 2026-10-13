"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError } from "@/lib/client/api";
import { useCreateJob } from "@/lib/client/hooks";
import { createJobSchema, type CreateJobInput } from "@/lib/schemas";

// Validated in the browser with the same Zod schema the server uses. If the server still says no
// (422), its per-field messages are copied onto the matching inputs.
export function CreateJobForm() {
  const createJob = useCreateJob();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema),
    defaultValues: { sourceUrl: "", title: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createJob.mutateAsync(values);
      reset();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        applyServerFieldErrors(e.fieldErrors);
      } else {
        setFormError(e instanceof Error ? e.message : "Could not create the job");
      }
    }
  });

  // Copies the server's per-field messages onto the matching inputs.
  function applyServerFieldErrors(fieldErrors: Record<string, string[]>) {
    const sourceUrlMessage = fieldErrors.sourceUrl?.[0];
    const titleMessage = fieldErrors.title?.[0];
    if (sourceUrlMessage) setError("sourceUrl", { message: sourceUrlMessage });
    if (titleMessage) setError("title", { message: titleMessage });
    if (!sourceUrlMessage && !titleMessage) setFormError("The server rejected this job");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="sourceUrl" className="mb-1 block text-sm font-medium">
          Source URL
        </label>
        <input
          id="sourceUrl"
          {...register("sourceUrl")}
          type="text"
          placeholder="https://cdn.example.com/videos/clip.mp4"
          aria-invalid={errors.sourceUrl ? true : undefined}
          aria-describedby={errors.sourceUrl ? "sourceUrl-error" : undefined}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {errors.sourceUrl && (
          <p id="sourceUrl-error" role="alert" className="mt-1 text-xs text-red-600">
            {errors.sourceUrl.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="title" className="mb-1 block text-sm font-medium">
          Title <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <input
          id="title"
          {...register("title")}
          type="text"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? "title-error" : undefined}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        {errors.title && (
          <p id="title-error" role="alert" className="mt-1 text-xs text-red-600">
            {errors.title.message}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={createJob.isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {createJob.isPending ? "Creating…" : "Create job"}
      </button>
    </form>
  );
}
