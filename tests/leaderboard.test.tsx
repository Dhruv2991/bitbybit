import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import LeaderboardPage from "@/components/pages/LeaderboardPage";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: vi.fn().mockReturnValue({
    from: (table: string) => mockFrom(table),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/app/actions/squads", () => ({
  getSquadsLeaderboardAction: vi.fn().mockResolvedValue([]),
}));

describe("Feature 9: Leaderboard Clans & Mentors Tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders squads tab with encouraging empty state when database has zero squads", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    render(<LeaderboardPage />);

    // Switch to Clans & Squads tab via dropdown
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "squads" } });

    await waitFor(() => {
      expect(screen.getByText(/No Clans or Squads Formed Yet/i)).toBeDefined();
    });
  });

  it("renders mentors tab with encouraging empty state when database has zero discussions", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "members") {
        return {
          select: vi.fn().mockReturnValue({
            gt: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "problem_discussions") {
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    render(<LeaderboardPage />);

    // Switch to Mentors tab via dropdown
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "mentors" } });

    await waitFor(() => {
      expect(screen.getByText(/No Community Mentors Ranked Yet/i)).toBeDefined();
    });
  });

  it("renders mentor rankings when community discussions exist", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "members") {
        return {
          select: vi.fn().mockReturnValue({
            gt: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    { github: "mentor_alice", name: "Alice", karma_points: 675 },
                    { github: "mentor_bob", name: "Bob", karma_points: 180 },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "problem_discussions") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    });

    render(<LeaderboardPage />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "mentors" } });

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
      expect(screen.getByText("Bob")).toBeDefined();
      expect(screen.getByText(/675/)).toBeDefined();
    });
  });
});
