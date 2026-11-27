export type SolveResult = {
  passed: number;
  total: number;
};

type ProblemIdRow = {
  problem_id?: string | null;
};

export function isSuccessfulSolve(result?: SolveResult): boolean {
  return Boolean(result && result.total > 0 && result.passed === result.total);
}

export function collectApprovedProblemIds(...groups: ProblemIdRow[][]): string[] {
  return [
    ...new Set(
      groups
        .flat()
        .map(row => row.problem_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
}
