import { describe, expect, it } from 'vitest';
import { collectApprovedProblemIds, isSuccessfulSolve } from '@/lib/solvedProblems';

describe('solved problem state', () => {
  it('marks only full passing results as successful solves', () => {
    expect(isSuccessfulSolve()).toBe(false);
    expect(isSuccessfulSolve({ passed: 0, total: 5 })).toBe(false);
    expect(isSuccessfulSolve({ passed: 4, total: 5 })).toBe(false);
    expect(isSuccessfulSolve({ passed: 0, total: 0 })).toBe(false);
    expect(isSuccessfulSolve({ passed: 5, total: 5 })).toBe(true);
  });

  it('builds solved state only from approved submission rows', () => {
    expect(
      collectApprovedProblemIds(
        [{ problem_id: 'normal-1' }, { problem_id: 'shared' }],
        [{ problem_id: 'weekly-1' }, { problem_id: 'shared' }, { problem_id: null }],
      ),
    ).toEqual(['normal-1', 'shared', 'weekly-1']);
  });

  it('returns an empty solved state when the account has no approved rows', () => {
    expect(collectApprovedProblemIds([], [])).toEqual([]);
  });
});
