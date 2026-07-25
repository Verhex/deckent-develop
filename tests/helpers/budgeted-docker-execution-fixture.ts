export const TEST_REMOTE_EXECUTION_BUDGET = { maxTurns: 1 } as const;
export const TEST_EXECUTION_LANDING_POLICY = { reserve_ratio: 0.25 } as const;

export const TEST_REMOTE_WORKER_BUDGET_POLICY = {
  state: 'allow',
  role: 'worker',
  taskKind: 'code-development',
  resolvedProvider: 'claude',
  executionCostClass: 'remote',
  profileRef: 'tests.helpers.budgeted-docker-execution-fixture',
  policyDigest: 'a'.repeat(64),
  admissionMode: 'unattended',
  landingPolicy: TEST_EXECUTION_LANDING_POLICY,
} as const;

export const TEST_MEASURED_LANDING_CAPABILITIES = {
  liveUsageBudgetSupport: 'measured-stream',
  executionLandingCapability: 'cooperative-landing',
} as const;

export const TEST_DOCKER_EXECUTION_OPTIONS = {
  executionBudget: TEST_REMOTE_EXECUTION_BUDGET,
  executionLandingPolicy: TEST_EXECUTION_LANDING_POLICY,
} as const;

export function budgetedDockerTaskJson(
  path: unknown,
  input: { authMode?: 'api' | 'subscription'; model?: string } = {},
): string {
  const match = String(path).replaceAll('\\', '/').match(/\/task-(.+)\.json$/);
  if (!match) return '{}';
  const id = match[1]!;
  const model = input.model ?? 'claude-sonnet-5';
  return JSON.stringify({
    id,
    title: 'Budgeted Docker unit fixture',
    description: 'Reach the isolated Docker seam after canonical admission.',
    model,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'ADR-G-037 fixture parity',
    type: 'code-development',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: 'the isolated Docker behavior is observed',
      noGoCriteria: 'admission is bypassed',
      techDebtAcceptable: 'none',
    },
    status: 'EXECUTING',
    provider: 'claude',
    authMode: input.authMode ?? 'subscription',
    budget: TEST_REMOTE_EXECUTION_BUDGET,
    budgetPolicy: TEST_REMOTE_WORKER_BUDGET_POLICY,
  });
}
