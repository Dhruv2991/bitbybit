import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getGhostRunsAction,
  getGhostRunByIdAction,
  recordGhostRunAction,
  startGhostDuelAction,
  recordGhostMatchAction,
} from "@/app/actions/ghosts";
import { SEED_GHOSTS } from "@/config/community";

// Mock Supabase Client
const mockSupabase = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseClient: () => mockSupabase,
}));

function makeMockSessionTable(elapsedSec = 110, solvedSec?: number | null) {
  const startedAt = new Date(Date.now() - elapsedSec * 1000).toISOString();
  let solvedAt: string | null = null;
  if (solvedSec === null) {
    solvedAt = null;
  } else if (typeof solvedSec === "number") {
    solvedAt = new Date(new Date(startedAt).getTime() + solvedSec * 1000).toISOString();
  } else {
    solvedAt = new Date(new Date(startedAt).getTime() + elapsedSec * 1000).toISOString();
  }

  const query: any = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "sess-1",
        started_at: startedAt,
        solved_at: solvedAt,
        completed_at: null,
      },
      error: null,
    }),
  };
  return {
    select: vi.fn().mockReturnValue(query),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  };
}

function makeDefaultMockTable(defaultData: any = { id: "sub-1", status: "approved" }) {
  const chain: any = {
    eq: vi.fn().mockImplementation(() => chain),
    neq: vi.fn().mockImplementation(() => chain),
    gte: vi.fn().mockImplementation(() => chain),
    lte: vi.fn().mockImplementation(() => chain),
    is: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data: defaultData, error: null }),
    single: vi.fn().mockResolvedValue({ data: defaultData, error: null }),
  };
  return {
    select: vi.fn().mockReturnValue(chain),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "new-ghost-uuid" }, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue(chain),
    delete: vi.fn().mockReturnValue(chain),
  };
}

describe("Feature 1: Ghost Duels Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getGhostRunsAction", () => {
    it("returns seed ghosts when database is empty", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      });

      const runs = await getGhostRunsAction();
      expect(runs).toBeDefined();
      expect(runs.length).toBeGreaterThan(0);
      expect(runs[0].id).toBe(SEED_GHOSTS[0].id);
    });

    it("filters seed ghosts by problemId when database is empty", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      });

      const runs = await getGhostRunsAction("two-sum");
      expect(runs.every((g) => g.problem_id === "two-sum")).toBe(true);
    });

    it("returns database ghosts when available", async () => {
      const dbGhost = {
        id: "real-uuid-1",
        problem_id: "two-sum",
        problem_title: "Two Sum",
        github: "tester",
        user_name: "Tester",
        time_seconds: 120,
        language: "python",
        code_length: 150,
        checkpoints: [{ at: 10, label: "Started" }],
        is_verified: true,
        created_at: new Date().toISOString(),
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [dbGhost], error: null }),
            }),
          }),
        }),
      });

      const runs = await getGhostRunsAction();
      expect(runs.length).toBe(1);
      expect(runs[0].id).toBe("real-uuid-1");
    });
  });

  describe("getGhostRunByIdAction", () => {
    it("returns matching seed ghost when querying by seed ID", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      const ghost = await getGhostRunByIdAction(SEED_GHOSTS[0].id);
      expect(ghost).toBeDefined();
      expect(ghost?.problem_title).toBe("Two Sum");
    });

    it("returns null for non-existent ghost ID", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      });

      const ghost = await getGhostRunByIdAction("non-existent-id-9999");
      expect(ghost).toBeNull();
    });
  });

  describe("recordGhostRunAction (Validation & Safety)", () => {
    it("rejects invalid inputs with missing problem_id or non-positive time", async () => {
      const result = await recordGhostRunAction({
        problem_id: "",
        problem_title: "Test",
        github: "user",
        user_name: "User",
        time_seconds: -10,
        language: "python",
        code_length: 50,
        checkpoints: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid/i);
    });

    it("inserts a new ghost run if none existed", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "new-ghost-uuid" }, error: null }),
              }),
            }),
          };
        }
        return makeDefaultMockTable();
      });

      const result = await recordGhostRunAction({
        problem_id: "two-sum",
        problem_title: "Two Sum",
        github: "speedy_coder",
        user_name: "Speedy",
        time_seconds: 90,
        language: "python",
        code_length: 120,
        checkpoints: [{ at: 10, label: "Done" }],
      });

      expect(result.success).toBe(true);
      expect(result.ghostId).toBe("new-ghost-uuid");
    });

    it("only updates if the new time is faster than the existing record", async () => {
      const updateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "existing-uuid" }, error: null }),
          }),
        }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "existing-uuid", time_seconds: 100 },
                    error: null,
                  }),
                }),
              }),
            }),
            update: updateFn,
          };
        }
        return makeDefaultMockTable();
      });

      // Slower attempt: 120s vs existing 100s -> should not update
      const slowerRes = await recordGhostRunAction({
        problem_id: "two-sum",
        problem_title: "Two Sum",
        github: "speedy_coder",
        user_name: "Speedy",
        time_seconds: 120,
        language: "python",
        code_length: 120,
        checkpoints: [],
      });
      expect(slowerRes.success).toBe(true);
      expect(updateFn).not.toHaveBeenCalled();

      // Faster attempt: 85s vs existing 100s -> should update
      const fasterRes = await recordGhostRunAction({
        problem_id: "two-sum",
        problem_title: "Two Sum",
        github: "speedy_coder",
        user_name: "Speedy",
        time_seconds: 85,
        language: "python",
        code_length: 120,
        checkpoints: [],
      });
      expect(fasterRes.success).toBe(true);
      expect(updateFn).toHaveBeenCalled();
    });
  });

  describe("recordGhostMatchAction (Server-Side Verification & Anti-Abuse)", () => {
    it("rejects invalid completion time", async () => {
      const res = await recordGhostMatchAction({
        ghost_run_id: SEED_GHOSTS[0].id,
        problem_id: "two-sum",
        problem_title: "Two Sum",
        challenger_github: "test_user",
        challenger_name: "Test User",
        challenger_time_seconds: -5,
      });

      expect(res.success).toBe(false);
      expect(res.pointsAwarded).toBe(0);
    });

    it("verifies victory server-side against actual ghost time", async () => {
      // Seed ghost 1 has time_seconds: 145s
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: SEED_GHOSTS[0].id, time_seconds: 145 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return makeMockSessionTable(110);
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        if (table === "members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { total_points: 200, duels_won: 0 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "squad_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { squad_id: "squad-123", points_contributed: 50 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { total_points: 500 },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return makeDefaultMockTable();
      });

      // User finished in 110s (faster than 145s) -> Victory!
      const outcome = await recordGhostMatchAction({
        ghost_run_id: SEED_GHOSTS[0].id,
        problem_id: "two-sum",
        problem_title: "Two Sum",
        challenger_github: "test_user",
        challenger_name: "Test User",
        challenger_time_seconds: 110,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.result).toBe("won");
      expect(outcome.timeDiffSeconds).toBe(35); // 145 - 110 = 35
      expect(outcome.pointsAwarded).toBe(100);
      expect(outcome.squadPointsAwarded).toBe(50);
    });

    it("marks result as lost if user time is greater than ghost time", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: SEED_GHOSTS[0].id, time_seconds: 145 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return makeMockSessionTable(170);
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return makeDefaultMockTable();
      });

      // User finished in 160s (slower than 145s)
      const outcome = await recordGhostMatchAction({
        ghost_run_id: SEED_GHOSTS[0].id,
        problem_id: "two-sum",
        problem_title: "Two Sum",
        challenger_github: "test_user",
        challenger_name: "Test User",
        challenger_time_seconds: 160,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.result).toBe("lost");
      expect(outcome.pointsAwarded).toBe(0);
      expect(outcome.squadPointsAwarded).toBe(0);
    });

    it("prevents double-claiming points on the same ghost", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: SEED_GHOSTS[0].id, time_seconds: 145 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return makeMockSessionTable(100);
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    // User ALREADY won against this ghost in the past!
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: "prior-match-id", result: "won" },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return makeDefaultMockTable();
      });

      const outcome = await recordGhostMatchAction({
        ghost_run_id: SEED_GHOSTS[0].id,
        problem_id: "two-sum",
        problem_title: "Two Sum",
        challenger_github: "test_user",
        challenger_name: "Test User",
        challenger_time_seconds: 100,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.result).toBe("won");
      expect(outcome.alreadyClaimed).toBe(true);
      expect(outcome.pointsAwarded).toBe(0); // Zero points for repeat win!
      expect(outcome.squadPointsAwarded).toBe(0);
    });

    it("rejects creating ghost runs without an approved submission (prevents self-farming)", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "submissions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return makeDefaultMockTable();
      });

      const res = await recordGhostRunAction({
        problem_id: "two-sum",
        problem_title: "Two Sum",
        github: "cheater_user",
        user_name: "Cheater",
        time_seconds: 45,
        language: "javascript",
        code_length: 50,
        checkpoints: [],
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("no approved submission found");
    });

    it("rejects challenge against own ghost in both start and match recording", async () => {
      // Mock ghost belonging to "own_coder"
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "ghost-own-1",
                    github: "own_coder",
                    time_seconds: 120,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return makeDefaultMockTable();
      });

      const startRes = await startGhostDuelAction("ghost-own-1", "own_coder", "two-sum");
      expect(startRes.success).toBe(false);
      expect(startRes.error).toContain("cannot challenge your own ghost");

      const matchRes = await recordGhostMatchAction({
        ghost_run_id: "ghost-own-1",
        problem_id: "two-sum",
        challenger_github: "own_coder",
        challenger_time_seconds: 100,
      });
      expect(matchRes.success).toBe(false);
      expect(matchRes.result).toBe("lost");
      expect(matchRes.error).toContain("cannot challenge your own ghost");
    });

    it("rejects win claim if no solve was recorded during duel session (replay of old solve without solve during session)", async () => {
      const sessionStartedAt = new Date(Date.now() - 60000).toISOString();

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "ghost-uuid-99", github: "other_user", time_seconds: 150 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { id: "sess-99", started_at: sessionStartedAt, solved_at: null, completed_at: null },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        return makeDefaultMockTable();
      });

      const outcome = await recordGhostMatchAction({
        ghost_run_id: "ghost-uuid-99",
        problem_id: "two-sum",
        challenger_github: "replay_attacker",
        challenger_time_seconds: 50,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.result).toBe("lost");
      expect(outcome.error).toContain("No verified solve recorded for this duel session");
      expect(outcome.pointsAwarded).toBe(0);
    });

    it("enforces daily cap on duel XP (500 XP maximum per day)", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "ghost-daily-1", github: "someone_else", time_seconds: 150 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return makeMockSessionTable(100);
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  gte: vi.fn().mockResolvedValue({
                    // Already has 5 wins today! (5 * 100 = 500 cap)
                    data: [{ id: "m1" }, { id: "m2" }, { id: "m3" }, { id: "m4" }, { id: "m5" }],
                    error: null,
                  }),
                })),
              })),
            })),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return makeDefaultMockTable();
      });

      const outcome = await recordGhostMatchAction({
        ghost_run_id: "ghost-daily-1",
        problem_id: "two-sum",
        challenger_github: "active_duelist",
        challenger_time_seconds: 100,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.result).toBe("won");
      expect(outcome.pointsAwarded).toBe(0); // Daily cap reached -> 0 XP awarded
      expect(outcome.squadPointsAwarded).toBe(0);
    });

    it("uses submission.created_at - session.started_at for elapsed time: fast solve claimed late correctly wins", async () => {
      // Session started 10 minutes ago (600s)
      const sessionStartedAt = new Date(Date.now() - 600 * 1000).toISOString();
      // Submission was actually approved 60s after session started (9 minutes ago)
      const sessionSolvedAt = new Date(Date.now() - 540 * 1000).toISOString();
      const submissionCreatedAt = sessionSolvedAt;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  // Ghost took 145 seconds
                  data: { id: "ghost-uuid-fast", github: "target_user", time_seconds: 145 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { id: "sess-late-claim", started_at: sessionStartedAt, solved_at: sessionSolvedAt, completed_at: null },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "submissions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    gte: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockReturnValue({
                          maybeSingle: vi.fn().mockResolvedValue({
                            data: { id: "sub-123", created_at: submissionCreatedAt, status: "approved" },
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return makeDefaultMockTable();
      });

      // Claiming now (600s after start, but true solve took only 60s)
      const outcome = await recordGhostMatchAction({
        ghost_run_id: "ghost-uuid-fast",
        problem_id: "two-sum",
        challenger_github: "late_claimer",
        challenger_time_seconds: 600,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.result).toBe("won"); // 60s < 145s -> Win!
      expect(outcome.timeDiffSeconds).toBe(85); // 145 - 60 = 85s
      expect(outcome.pointsAwarded).toBe(100);
    });

    it("concurrent claims on different ghosts succeed independently", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col, val) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: val, github: "other_user", time_seconds: 150 },
                  error: null,
                }),
              })),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return makeMockSessionTable(80);
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return makeDefaultMockTable();
      });

      const [resGhostA, resGhostB] = await Promise.all([
        recordGhostMatchAction({
          ghost_run_id: "00000000-0000-0000-0000-000000000001",
          problem_id: "two-sum",
          challenger_github: "concurrent_duelist",
          challenger_time_seconds: 80,
        }),
        recordGhostMatchAction({
          ghost_run_id: "00000000-0000-0000-0000-000000000002",
          problem_id: "valid-parentheses",
          challenger_github: "concurrent_duelist",
          challenger_time_seconds: 80,
        }),
      ]);

      expect(resGhostA.success).toBe(true);
      expect(resGhostA.result).toBe("won");
      expect(resGhostA.pointsAwarded).toBe(100);

      expect(resGhostB.success).toBe(true);
      expect(resGhostB.result).toBe("won");
      expect(resGhostB.pointsAwarded).toBe(100);
    });

    it("earlier failed attempt then solve during duel (must win if fast enough)", async () => {
      // Prior failed attempt occurred before or during duel, but judge recorded solved_at 60s after start
      const sessionStartedAt = new Date(Date.now() - 70000).toISOString();
      const sessionSolvedAt = new Date(Date.now() - 10000).toISOString(); // 60s elapsed

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "ghost-fail-then-win", github: "other_user", time_seconds: 145 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { id: "sess-fail-then-win", started_at: sessionStartedAt, solved_at: sessionSolvedAt, completed_at: null },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return makeDefaultMockTable();
      });

      const outcome = await recordGhostMatchAction({
        ghost_run_id: "ghost-fail-then-win",
        problem_id: "two-sum",
        challenger_github: "persistent_coder",
        challenger_time_seconds: 60,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.result).toBe("won");
      expect(outcome.timeDiffSeconds).toBe(85); // 145 - 60 = 85s
      expect(outcome.pointsAwarded).toBe(100);
    });

    it("previously solved problem re-solved in duel (must win with duel solve elapsed time)", async () => {
      // Problem was solved in the past, but in this duel session user re-solved in 50s
      const sessionStartedAt = new Date(Date.now() - 50000).toISOString();
      const sessionSolvedAt = new Date().toISOString(); // 50s solve in duel

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "ghost-prev-solved", github: "other_user", time_seconds: 145 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { id: "sess-prev-solved", started_at: sessionStartedAt, solved_at: sessionSolvedAt, completed_at: null },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === "ghost_duel_matches") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => ({
                eq: vi.fn().mockImplementation(() => ({
                  eq: vi.fn().mockImplementation(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                  gte: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return makeDefaultMockTable();
      });

      const outcome = await recordGhostMatchAction({
        ghost_run_id: "ghost-prev-solved",
        problem_id: "two-sum",
        challenger_github: "veteran_solver",
        challenger_time_seconds: 50,
      });

      expect(outcome.success).toBe(true);
      expect(outcome.result).toBe("won");
      expect(outcome.timeDiffSeconds).toBe(95); // 145 - 50 = 95s
      expect(outcome.pointsAwarded).toBe(100);
    });

    it("replay of an old solve with no solve during the session (must lose)", async () => {
      // User starts duel session but never solves it in this session (solved_at remains null)
      const sessionStartedAt = new Date(Date.now() - 40000).toISOString();

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "ghost_runs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "ghost-replay-no-solve", github: "other_user", time_seconds: 145 },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "ghost_duel_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { id: "sess-no-solve", started_at: sessionStartedAt, solved_at: null, completed_at: null },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        return makeDefaultMockTable();
      });

      const outcome = await recordGhostMatchAction({
        ghost_run_id: "ghost-replay-no-solve",
        problem_id: "two-sum",
        challenger_github: "replay_cheater",
        challenger_time_seconds: 40,
      });

      expect(outcome.success).toBe(false);
      expect(outcome.result).toBe("lost");
      expect(outcome.error).toContain("No verified solve recorded for this duel session");
      expect(outcome.pointsAwarded).toBe(0);
    });
  });
});

