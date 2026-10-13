import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/client/api";
import { CreateJobForm } from "@/components/create-job-form";

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreateJobForm />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreateJobForm", () => {
  it("shows an error and does not call the API when the URL is invalid", async () => {
    const post = vi.spyOn(api, "post");
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/source url/i), "not a url");
    await user.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByText(/enter a valid url/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("sends a valid URL to the API", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({ id: "j_1" });
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/source url/i), "https://cdn.example.com/videos/clip.mp4");
    await user.click(screen.getByRole("button", { name: /create job/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/api/jobs", expect.objectContaining({
      sourceUrl: "https://cdn.example.com/videos/clip.mp4",
    }));
  });

  it("puts the server's 422 messages on the matching field", async () => {
    vi.spyOn(api, "post").mockRejectedValue(
      new ApiError(422, "Validation failed", { sourceUrl: ["Server says no"] }),
    );
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/source url/i), "https://cdn.example.com/videos/clip.mp4");
    await user.click(screen.getByRole("button", { name: /create job/i }));

    expect(await screen.findByText("Server says no")).toBeInTheDocument();
  });
});
