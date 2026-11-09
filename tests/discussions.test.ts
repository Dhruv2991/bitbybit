import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDiscussionsAction,
  createDiscussionAction,
  upvoteDiscussionAction,
  unvoteDiscussionAction,
} from "@/app/actions/discussions";

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: () => mockSupabase,
  getSupabaseClient: () => mockSupabase,
}));

describe("Feature 4: Discussions & Mentor Karma Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDiscussionsAction", () => {
    it("returns empty array when database has no discussions", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const discussions = await getDiscussionsAction("two-sum");
      expect(discussions).toEqual([]);
    });

    it("marks has_upvoted correctly for authenticated user", async () => {
      const mockDiscs = [
        {
          id: "disc-1",
          problem_id: "two-sum",
          github: "author_1",
          title: "My Intuition",
          content: "Detailed explanation of two sum with hash map...",
          approach_type: "intuitive",
          upvotes: 5,
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "problem_discussions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: mockDiscs, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "problem_discussion_votes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [{ discussion_id: "disc-1" }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await getDiscussionsAction("two-sum", "viewer_bob");
      expect(res.length).toBe(1);
      expect(res[0].id).toBe("disc-1");
      expect(res[0].has_upvoted).toBe(true);
    });
  });

  describe("createDiscussionAction", () => {
    it("rejects unauthenticated user", async () => {
      const res = await createDiscussionAction({
        problemId: "two-sum",
        userGithub: "",
        userName: "Anon",
        title: "Valid Title",
        content: "Valid content here with enough characters...",
        approachType: "intuitive",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/authentication/i);
    });

    it("rejects titles that are too short or too long", async () => {
      const tooShort = await createDiscussionAction({
        problemId: "two-sum",
        userGithub: "alice",
        userName: "Alice",
        title: "ab",
        content: "Valid content here with enough characters...",
        approachType: "intuitive",
      });
      expect(tooShort.success).toBe(false);
      expect(tooShort.error).toMatch(/title/i);

      const tooLong = await createDiscussionAction({
        problemId: "two-sum",
        userGithub: "alice",
        userName: "Alice",
        title: "x".repeat(150),
        content: "Valid content here with enough characters...",
        approachType: "intuitive",
      });
      expect(tooLong.success).toBe(false);
      expect(tooLong.error).toMatch(/title/i);
    });

    it("rejects content that is too short", async () => {
      const res = await createDiscussionAction({
        problemId: "two-sum",
        userGithub: "alice",
        userName: "Alice",
        title: "Valid Title",
        content: "short",
        approachType: "intuitive",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/content/i);
    });

    it("creates discussion starting at 0 upvotes (no self-upvote) on happy path", async () => {
      let insertedPayload: any = null;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "problem_discussions") {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              insertedPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: "new-disc-uuid", ...payload },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const res = await createDiscussionAction({
        problemId: "two-sum",
        userGithub: "alice",
        userName: "Alice Dev",
        title: "Clear hash map guide <script>alert(1)</script>",
        content: "Here is why the hash map approach is optimal for this problem in linear time.",
        approachType: "intuitive",
      });

      expect(res.success).toBe(true);
      expect(insertedPayload).toBeDefined();
      expect(insertedPayload.upvotes).toBe(0); // Starts at 0
      expect(insertedPayload.title).not.toContain("<script>");
      expect(insertedPayload.github).toBe("alice");
    });
  });

  describe("upvoteDiscussionAction", () => {
    it("rejects unauthenticated user", async () => {
      const res = await upvoteDiscussionAction("disc-1", "");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/authentication/i);
    });

    it("STRICT: rejects self-upvote by discussion author", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "problem_discussions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "disc-author-1", github: "author_alice", upvotes: 3 },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await upvoteDiscussionAction("disc-author-1", "author_alice");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/cannot upvote your own/i);
    });

    it("rejects duplicate upvote by same user", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "problem_discussions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "disc-1", github: "someone_else", upvotes: 3 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "problem_discussion_votes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "vote-already-cast" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await upvoteDiscussionAction("disc-1", "duplicate_voter");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already upvoted/i);
    });

    it("records upvote and increments upvote count on happy path", async () => {
      let voteInserted = false;
      let discussionUpdated = false;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "problem_discussions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "disc-1", github: "mentor_dan", upvotes: 10 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockImplementation((payload) => {
              if (payload.upvotes === 11) {
                discussionUpdated = true;
              }
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === "problem_discussion_votes") {
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
        if (table === "members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { github: "mentor_dan", total_points: 500 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      });

      const res = await upvoteDiscussionAction("disc-1", "student_sam");
      expect(res.success).toBe(true);
      expect(voteInserted).toBe(true);
      expect(discussionUpdated).toBe(true);
      expect(res.newUpvotes).toBe(11);
    });

    it("unvotes successfully, decrementing upvotes and karma", async () => {
      let voteDeleted = false;
      let discussionUpdated = false;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "problem_discussions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "disc-1", github: "mentor_dan", upvotes: 11 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockImplementation(() => {
              discussionUpdated = true;
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === "problem_discussion_votes") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "vote-123", discussion_id: "disc-1", github: "student_sam" },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                voteDeleted = true;
                return Promise.resolve({ error: null });
              }),
            }),
          };
        }
        if (table === "members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { github: "mentor_dan", total_points: 515 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      });

      const res = await unvoteDiscussionAction("disc-1", "student_sam");
      expect(res.success).toBe(true);
      expect(voteDeleted).toBe(true);
      expect(discussionUpdated).toBe(true);
      expect(res.newUpvotes).toBe(10);
    });
  });
});

