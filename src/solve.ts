import type { ToolOptions } from './types';
import type { SolveInput } from './solve-input.generated';
export type { SolveInput } from './solve-input.generated';

/** Solve accepts transport options, but does not support receipt metadata. */
export type SolveOptions = SolveInput & Omit<ToolOptions, 'memo' | 'valueTag' | 'decisionContext'>;

export type SolveProblem = SolveInput['problem'];

/** `solution` of a `routing` result, as specified in docs/design/solve.md section 3. */
export interface SolveRoutingSolution {
  routes: Array<{
    vehicle: string;
    stops: Array<{ id: string; arrival: number; departure: number; load_after: number }>;
    distance: number;
    time: number;
  }>;
  unserved: string[];
}

/** `solution` of an `allocation` result, as specified in docs/design/solve.md. */
export interface SolveAllocationSolution {
  assignments: Array<{ item: string; option: string; quantity: number; fraction: number; cost: number; value: number | null }>;
  per_option: Array<{ option: string; quantity: number; share: number; cost: number; value: number | null }>;
  unassigned: Array<{ item: string; quantity: number }>;
}

/** `solution` of a `packing` result; `left_out` is present for the `knapsack` variant only. */
export interface SolvePackingSolution {
  bins: Array<{
    bin: string;
    index: number;
    items: Array<{ id: string; count: number }>;
    used: Record<string, number>;
  }>;
  left_out?: Array<{ id: string; count: number }>;
}

/** `solution` of a `schedule` result: each job's start, end, resource allocation and lateness. */
export interface SolveScheduleSolution {
  starts: Array<{ job: string; start: number; end: number; resources: Record<string, number>; tardiness: number }>;
  makespan: number;
}

/** The solution shape per problem. Adding a problem is one entry here (and its `SolveInput` variant). */
export interface SolveSolutions {
  routing: SolveRoutingSolution;
  allocation: SolveAllocationSolution;
  packing: SolvePackingSolution;
  schedule: SolveScheduleSolution;
}

/** Completed job result for exactly one problem, as specified in docs/design/solve.md. */
export interface SolveProblemResult<P extends SolveProblem> {
  status: 'optimal' | 'feasible' | 'infeasible' | 'timeout';
  objective_value: number | null;
  bound: number | null;
  gap: number | null;
  solution: SolveSolutions[P] | null;
  checks: Array<{ name: string; satisfied: boolean; worst_violation: number; detail: string }>;
  conflicts: Array<{
    constraints: Array<{ family: string; ref: string; label: string }>;
    explanation: string;
  }>;
  meta: {
    problem: P;
    size: Record<string, number>;
    variables_estimated: number;
    variables_built: number;
    solve_time_s: number;
    time_limit_s: number;
    conflicts_complete: boolean | null;
  };
}

/**
 * Completed job result for the problem(s) in `P`. A union of problems distributes into one correlated
 * variant per problem (`meta.problem` and `solution` agree), so a request typed as the whole `SolveInput`
 * union yields a `SolveResult`, never one object with independent unions.
 */
export type SolveResultFor<P extends SolveProblem> = P extends SolveProblem ? SolveProblemResult<P> : never;

/** Completed job result, discriminated by `meta.problem`: it narrows `solution` to the problem's shape. */
export type SolveResult = SolveResultFor<SolveProblem>;

/** `P` when it names exactly one problem, `never` when it is a union of problems. */
type SingleProblem<P extends SolveProblem, Each = P> = P extends unknown ? ([Each] extends [P] ? P : never) : never;

/**
 * Narrows a `SolveResult` to one problem's result. TypeScript does not narrow a union through a nested
 * check such as `result.meta.problem === 'packing'`, so a caller holding a `SolveResult` uses this guard.
 *
 * Only a single literal problem narrows. For a problem chosen at runtime (typed as a union of problems)
 * the guard is a plain boolean: a type predicate for the whole union would make the reachable false
 * branch `never`.
 */
export function isSolveResultFor<P extends SolveProblem>(result: SolveResult, problem: SingleProblem<P>): result is SolveResultFor<P>;
export function isSolveResultFor(result: SolveResult, problem: SolveProblem): boolean;
export function isSolveResultFor(result: SolveResult, problem: SolveProblem): boolean {
  return result.meta.problem === problem;
}
