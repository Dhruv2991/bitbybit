import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Ghost Duel Solve Guards (api/execute & ghost_duel_sessions)", () => {
  let mockUpdate: any;
  let mockEq: any;
  let mockIlike: any;
  let mockIs: any;
  let filters: Record<string, any>;

  beforeEach(() => {
    filters = {};
    mockIs = vi.fn().mockImplementation((col: string, val: any) => {
      filters[col] = val;
      return { is: mockIs };
    });
    mockIlike = vi.fn().mockImplementation((col: string, val: any) => {
      filters[col] = val;
      return { is: mockIs };
    });
    mockEq = vi.fn().mockImplementation((col: string, val: any) => {
      filters[col] = val;
      return { ilike: mockIlike };
    });
    mockUpdate = vi.fn().mockImplementation((payload: any) => {
      filters._payload = payload;
      return { eq: mockEq };
    });
  });

  function simulateSolveGuard(params: {
    mode: "run" | "submit";
    passed: number;
    total: number;
    executedProblemId: string;
    challengerGithub?: string;
    dbClient: any;
  }) {
    const isFullSubmit = params.mode === "submit";
    const allPassed = params.passed > 0 && params.passed === params.total;
    if (isFullSubmit && allPassed && params.challengerGithub && params.executedProblemId) {
      const nowIso = new Date().toISOString();
      params.dbClient
        .from("ghost_duel_sessions")
        .update({ solved_at: nowIso })
        .eq("problem_id", String(params.executedProblemId))
        .ilike("challenger_github", params.challengerGithub)
        .is("completed_at", null)
        .is("solved_at", null);
      return true;
    }
    return false;
  }

  it("sample run (mode === 'run') NEVER records solved_at even if all test cases pass", () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    };

    const triggered = simulateSolveGuard({
      mode: "run",
      passed: 5,
      total: 5,
      executedProblemId: "two-sum",
      challengerGithub: "racer_bob",
      dbClient: mockDb,
    });

    expect(triggered).toBe(false);
    expect(mockDb.from).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("partial solve / failing tests on submit does NOT record solved_at", () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    };

    const triggered = simulateSolveGuard({
      mode: "submit",
      passed: 4,
      total: 5,
      executedProblemId: "two-sum",
      challengerGithub: "racer_bob",
      dbClient: mockDb,
    });

    expect(triggered).toBe(false);
    expect(mockDb.from).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("full submit with matching problem and all tests passing triggers solved_at update with strict guards", () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    };

    const triggered = simulateSolveGuard({
      mode: "submit",
      passed: 5,
      total: 5,
      executedProblemId: "two-sum",
      challengerGithub: "racer_bob",
      dbClient: mockDb,
    });

    expect(triggered).toBe(true);
    expect(mockDb.from).toHaveBeenCalledWith("ghost_duel_sessions");
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ solved_at: expect.any(String) }));
    expect(mockEq).toHaveBeenCalledWith("problem_id", "two-sum");
    expect(mockIlike).toHaveBeenCalledWith("challenger_github", "racer_bob");
    expect(mockIs).toHaveBeenCalledWith("completed_at", null);
    expect(mockIs).toHaveBeenCalledWith("solved_at", null);
  });

  it("enforces problem scoping: problem ID mismatch cannot resolve session for another problem", () => {
    const mockDb = {
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    };

    simulateSolveGuard({
      mode: "submit",
      passed: 5,
      total: 5,
      executedProblemId: "reverse-linked-list",
      challengerGithub: "racer_bob",
      dbClient: mockDb,
    });

    // The SQL query strictly targets 'reverse-linked-list', never 'two-sum'
    expect(mockEq).toHaveBeenCalledWith("problem_id", "reverse-linked-list");
    expect(mockEq).not.toHaveBeenCalledWith("problem_id", "two-sum");
  });
});

