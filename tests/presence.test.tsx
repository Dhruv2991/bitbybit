import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import ProblemLivePresence from "@/components/problem/ProblemLivePresence";

// Mock Supabase Realtime Hook
vi.mock("@/hooks/useRealtimeChannel", () => ({
  useRealtimeChannel: vi.fn(),
}));

describe("Feature 5: Workspace Extras & Problem Live Presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders live coder count correctly with active problem", () => {
    render(
      <ProblemLivePresence
        problemId="two-sum"
        problemTitle="Two Sum"
        user={null}
        failedAttempts={0}
      />
    );

    const presenceHeading = screen.getByText(/coders/i);
    expect(presenceHeading).toBeDefined();
  });

  it("does not show Socratic nudge when failedAttempts is 0 or 1", () => {
    const { rerender } = render(
      <ProblemLivePresence
        problemId="two-sum"
        problemTitle="Two Sum"
        user={null}
        failedAttempts={1}
      />
    );

    expect(screen.queryByText(/Socratic Nudge/i)).toBeNull();

    rerender(
      <ProblemLivePresence
        problemId="two-sum"
        problemTitle="Two Sum"
        user={null}
        failedAttempts={0}
      />
    );
    expect(screen.queryByText(/Socratic Nudge/i)).toBeNull();
  });

  it("displays Socratic nudge when user encounters 2 or more test failures", () => {
    render(
      <ProblemLivePresence
        problemId="two-sum"
        problemTitle="Two Sum"
        user={null}
        failedAttempts={2}
      />
    );

    const nudge = screen.getByText(/Socratic Nudge/i);
    expect(nudge).toBeDefined();
    expect(screen.getByText(/edge cases/i)).toBeDefined();
  });
});

