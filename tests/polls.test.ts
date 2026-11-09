import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getActiveDailyPollAction,
  voteDailyPollAction,
} from "@/app/actions/polls";
import { CANONICAL_DAILY_POLL } from "@/config/community";

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: () => mockSupabase,
  getSupabaseClient: () => mockSupabase,
}));

describe("Feature 3: Daily Poll & Community Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getActiveDailyPollAction", () => {
    it("returns canonical poll when database has no active polls", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "community_polls") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await getActiveDailyPollAction();
      expect(res).toBeDefined();
      expect(res.poll.id).toBe(CANONICAL_DAILY_POLL.id);
      expect(res.poll.options.length).toBeGreaterThan(0);
      expect(res.userVotedOptionId).toBeNull();
    });

    it("returns active poll from database and checks user vote status", async () => {
      const dbPoll = {
        id: "poll-uuid-1",
        question: "Tabs vs Spaces in 2026?",
        options: [
          { id: "opt-1", text: "Tabs", votes: 12 },
          { id: "opt-2", text: "Spaces", votes: 45 },
        ],
        is_active: true,
        created_at: new Date().toISOString(),
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "community_polls") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: dbPoll, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "community_poll_votes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { option_id: "opt-2" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await getActiveDailyPollAction("coder_alice");
      expect(res.poll.id).toBe("poll-uuid-1");
      expect(res.poll.question).toBe("Tabs vs Spaces in 2026?");
      expect(res.userVotedOptionId).toBe("opt-2");
    });
  });

  describe("voteDailyPollAction", () => {
    it("rejects unauthenticated user (empty github)", async () => {
      const res = await voteDailyPollAction("poll-1", "opt-1", "");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/authentication/i);
    });

    it("rejects missing pollId or optionId", async () => {
      const res1 = await voteDailyPollAction("", "opt-1", "user_1");
      expect(res1.success).toBe(false);

      const res2 = await voteDailyPollAction("poll-1", "", "user_1");
      expect(res2.success).toBe(false);
    });

    it("prevents duplicate voting by the same user", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "community_poll_votes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "vote-existing-1" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await voteDailyPollAction("poll-1", "opt-1", "alice");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already voted/i);
    });

    it("successfully records vote and updates options atomically", async () => {
      let voteInserted = false;
      let pollUpdated = false;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "community_poll_votes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation(() => {
              voteInserted = true;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === "community_polls") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "poll-1",
                    options: [
                      { id: "opt-1", text: "Option A", votes: 5 },
                      { id: "opt-2", text: "Option B", votes: 10 },
                    ],
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockImplementation((payload) => {
              pollUpdated = true;
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        return {};
      });

      const res = await voteDailyPollAction("poll-1", "opt-1", "new_voter");
      expect(res.success).toBe(true);
      expect(voteInserted).toBe(true);
      expect(pollUpdated).toBe(true);
      expect(res.updatedOptions?.[0].votes).toBe(6);
    });

    it("handles database unique constraint violation gracefully", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "community_poll_votes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({
              error: { code: "23505", message: "duplicate key value violates unique constraint" },
            }),
          };
        }
        if (table === "community_polls") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "poll-1", options: [] },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await voteDailyPollAction("poll-1", "opt-1", "concurrent_user");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already voted/i);
    });
  });
});

