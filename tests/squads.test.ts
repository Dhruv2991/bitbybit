import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getUserSquadAction,
  getSquadsLeaderboardAction,
  createSquadAction,
  joinSquadAction,
  leaveSquadAction,
  generateSquadCodeAction,
} from "@/app/actions/squads";
import { calculateSquadContribution } from "@/config/community";

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabase", () => ({
  createServerSupabaseClient: () => mockSupabase,
  getSupabaseClient: () => mockSupabase,
}));

describe("Feature 2: Squads Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createSquadAction", () => {
    it("rejects unauthenticated user (empty github)", async () => {
      const res = await createSquadAction("ByteBusters", "BYTE", "", "Anon");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/authentication/i);
    });

    it("rejects invalid squad names (too short or too long)", async () => {
      const tooShort = await createSquadAction("ab", "AB", "user1", "User One");
      expect(tooShort.success).toBe(false);
      expect(tooShort.error).toMatch(/name/i);

      const tooLong = await createSquadAction("a".repeat(35), "BYTE", "user1", "User One");
      expect(tooLong.success).toBe(false);
      expect(tooLong.error).toMatch(/name/i);
    });

    it("rejects invalid squad tags", async () => {
      const res = await createSquadAction("ByteBusters", "!", "user1", "User One");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/tag/i);
    });

    it("prevents user already in a squad from creating another", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "sm-1" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await createSquadAction("New Squad", "NEWS", "already_in_squad", "Dev");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already a member/i);
    });

    it("creates squad with high-entropy unguessable code on happy path", async () => {
      let insertedSquad: any = null;
      let insertedMember: any = null;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload) => {
              insertedMember = payload;
              return Promise.resolve({ data: payload, error: null });
            }),
          };
        }
        if (table === "squads") {
          return {
            insert: vi.fn().mockImplementation((payload) => {
              insertedSquad = { id: "squad-uuid-1", ...payload };
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: insertedSquad,
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        return {};
      });

      const res = await createSquadAction("VIT Algo Squad", "VIT", "alice_code", "Alice C.");
      expect(res.success).toBe(true);
      expect(res.squad).toBeDefined();
      expect(insertedSquad.name).toBe("VIT Algo Squad");
      expect(insertedSquad.tag).toBe("VIT");
      expect(insertedSquad.leader_github).toBe("alice_code");

      // Verify unguessable invite code format: TAG-XXXXXXXXXX with high entropy (10 hex chars)
      expect(insertedSquad.code).toMatch(/^VIT-[A-F0-9]{10}$/);
      expect(insertedMember.github).toBe("alice_code");
      expect(insertedMember.squad_id).toBe("squad-uuid-1");
    });
  });

  describe("joinSquadAction", () => {
    it("rejects unauthenticated user", async () => {
      const res = await joinSquadAction("VIT-123456", "", "");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/authentication/i);
    });

    it("rejects user already in a squad", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "sm-existing" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await joinSquadAction("VIT-ABC123", "existing_user", "Existing");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already in a squad/i);
    });

    it("rejects invalid or non-existent invite code", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_members") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await joinSquadAction("FAKE-999999", "newbie", "Newbie");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid.*invite code/i);
    });

    it("rejects join when squad is at max 5 members", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_members") {
          return {
            select: vi.fn().mockImplementation((_fields, opts) => {
              if (opts?.count === "exact") {
                return {
                  eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              };
            }),
          };
        }
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "sq-full", name: "Full Clan" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await joinSquadAction("FULL-123456", "newbie", "Newbie");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/full|maximum 5/i);
    });

    it("successfully joins available squad", async () => {
      let addedMember: any = null;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_members") {
          return {
            select: vi.fn().mockImplementation((_fields, opts) => {
              if (opts?.count === "exact") {
                return {
                  eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              };
            }),
            insert: vi.fn().mockImplementation((payload) => {
              addedMember = payload;
              return Promise.resolve({ data: payload, error: null });
            }),
          };
        }
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "sq-open", name: "Open Clan" },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await joinSquadAction("OPEN-123456", "fresh_dev", "Fresh Dev");
      expect(res.success).toBe(true);
      expect(addedMember.squad_id).toBe("sq-open");
      expect(addedMember.github).toBe("fresh_dev");
      expect(addedMember.points_contributed).toBe(0);
    });
  });

  describe("leaveSquadAction", () => {
    it("rejects empty arguments", async () => {
      const res = await leaveSquadAction("", "");
      expect(res.success).toBe(false);
    });

    it("regular member leaves squad cleanly", async () => {
      let deleteCalled = false;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "sq-1", leader_github: "someone_else" },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "squad_members") {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation(() => {
                  deleteCalled = true;
                  return Promise.resolve({ error: null });
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await leaveSquadAction("sq-1", "regular_member");
      expect(res.success).toBe(true);
      expect(deleteCalled).toBe(true);
    });

    it("leader leaves with other members remaining: reassigns leadership", async () => {
      let updatedLeader: string | null = null;
      let deleteCalled = false;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "sq-1", leader_github: "departing_leader" },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockImplementation((payload) => {
              updatedLeader = payload.leader_github;
              return {
                eq: vi.fn().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === "squad_members") {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation(() => {
                  deleteCalled = true;
                  return Promise.resolve({ error: null });
                }),
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [{ github: "new_leader", points_contributed: 150 }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await leaveSquadAction("sq-1", "departing_leader");
      expect(res.success).toBe(true);
      expect(deleteCalled).toBe(true);
      expect(updatedLeader).toBe("new_leader");
    });

    it("leader leaves as sole member: dissolves squad", async () => {
      let squadDeleted = false;

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: "sq-sole", leader_github: "sole_member" },
                  error: null,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation(() => {
                squadDeleted = true;
                return Promise.resolve({ error: null });
              }),
            }),
          };
        }
        if (table === "squad_members") {
          return {
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [], // No other members left
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await leaveSquadAction("sq-sole", "sole_member");
      expect(res.success).toBe(true);
      expect(squadDeleted).toBe(true);
    });
  });

  describe("getUserSquadAction", () => {
    it("returns null if github is missing", async () => {
      const res = await getUserSquadAction("");
      expect(res).toBeNull();
    });

    it("returns null if user has no squad", async () => {
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }));

      const res = await getUserSquadAction("free_agent");
      expect(res).toBeNull();
    });

    it("returns full squad and member details for active member", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_members") {
          return {
            select: vi.fn().mockImplementation((fields) => {
              if (fields === "squad_id") {
                return {
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { squad_id: "squad-123" },
                      error: null,
                    }),
                  }),
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: "sm-1", github: "user1", points_contributed: 100 },
                      { id: "sm-2", github: "user2", points_contributed: 50 },
                    ],
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === "squads") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "squad-123",
                    name: "Algo Aces",
                    tag: "ACES",
                    total_points: 150,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const squad = await getUserSquadAction("user1");
      expect(squad).toBeDefined();
      expect(squad?.name).toBe("Algo Aces");
      expect(squad?.member_count).toBe(2);
      expect(squad?.members?.length).toBe(2);
    });
  });

  describe("getSquadsLeaderboardAction", () => {
    it("returns empty array when database has no squads", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const leaderboard = await getSquadsLeaderboardAction();
      expect(leaderboard).toEqual([]);
    });

    it("returns ranked squads from database with accurate member counts", async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "sq-1",
                  name: "Clan Alpha",
                  tag: "ALPH",
                  total_points: 500,
                  squad_members: [{ count: 4 }],
                },
              ],
              error: null,
            }),
          }),
        }),
      });

      const leaderboard = await getSquadsLeaderboardAction();
      expect(leaderboard.length).toBe(1);
      expect(leaderboard[0].member_count).toBe(4);
    });
  });

  describe("Invite Codes, Rate Limiting & Squad Points Formula", () => {
    it("generates 10-hex uppercase invite codes with 40 bits of entropy", async () => {
      const code1 = await generateSquadCodeAction("ALPH");
      const code2 = await generateSquadCodeAction("ALPH");

      expect(code1).toMatch(/^ALPH-[A-F0-9]{10}$/);
      expect(code2).toMatch(/^ALPH-[A-F0-9]{10}$/);
      expect(code1).not.toBe(code2); // Cryptographically random, distinct suffixes
    });

    it("enforces persistent database rate limit on join attempts (blocks after 5 tries)", async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "squad_join_attempts") {
          return {
            select: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ count: 5, error: null }), // Already 5 attempts!
              }),
            }),
          };
        }
        return {};
      });

      const res = await joinSquadAction("ALPH-1234567890", "spammer", "Spammer");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/too many squad join attempts/i);
    });

    it("calculates squad points using ONE canonical formula", () => {
      // Ghost duel victory awards exactly 50 squad XP
      expect(calculateSquadContribution("ghost_duel_win")).toBe(50);

      // Problem solve awards 10% of base points with a floor of 5 XP
      expect(calculateSquadContribution("problem_solve", 100)).toBe(10);
      expect(calculateSquadContribution("problem_solve", 250)).toBe(25);
      expect(calculateSquadContribution("problem_solve", 30)).toBe(5); // 10% of 30 is 3, but floor is 5
      expect(calculateSquadContribution("problem_solve", 0)).toBe(5);
    });
  });
});

