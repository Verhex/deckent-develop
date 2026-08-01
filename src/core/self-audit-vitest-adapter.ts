import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

import type {
  SelfAuditAdapter,
  SelfAuditEvidenceDecision,
  SelfAuditExecutedUnit,
  SelfAuditPreparation,
  SelfAuditProcessResult,
  SelfAuditRequest,
} from './self-audit-adapter.js';

const require = createRequire(import.meta.url);

interface VitestSummaryCounts {
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

/**
 * Scoped Vitest capability. It deliberately never turns a self-audit request
 * into a full-suite invocation.
 */
export class VitestSelfAuditAdapter implements SelfAuditAdapter {
  readonly id = 'vitest';

  constructor(private readonly detectCapability: () => boolean = detectVitestCapability) {}

  supports(ecosystem: string): boolean {
    return ecosystem.trim().toLowerCase() === 'vitest';
  }

  isAvailable(): boolean {
    return this.detectCapability();
  }

  prepare(request: SelfAuditRequest): SelfAuditPreparation {
    if (request.scope.kind !== 'scoped') {
      return {
        kind: 'hold',
        reason: 'invalid-request',
        detail: 'Vitest self-audit requires explicitly scoped test files',
      };
    }
    if (request.scope.testFiles.some((testFile) => testFile.trim().length === 0)) {
      return {
        kind: 'hold',
        reason: 'invalid-request',
        detail: 'Vitest self-audit test file paths must be non-empty',
      };
    }

    return {
      kind: 'ready',
      invocation: {
        executable: 'npx',
        argv: ['vitest', 'run', ...request.scope.testFiles],
        cwd: request.projectRoot,
        timeoutMs: request.timeoutMs,
      },
    };
  }

  collectEvidence(
    _request: SelfAuditRequest,
    result: SelfAuditProcessResult,
  ): SelfAuditEvidenceDecision {
    const output = `${result.stdout}\n${result.stderr}`;
    const testFiles = parseSummary(output, 'Test Files');
    const assertions = parseSummary(output, 'Tests');
    const executedFiles = testFiles.passed + testFiles.failed;
    const executedAssertions = assertions.passed + assertions.failed;

    if (executedFiles === 0 || executedAssertions === 0) {
      return {
        kind: 'hold',
        reason: 'missing-executed-evidence',
        detail: 'Vitest output did not report non-zero executed test files and assertions',
      };
    }

    return {
      kind: 'evidence',
      executedUnits: toExecutedUnits(testFiles, assertions),
      outputDigest: `sha256:${createHash('sha256').update(output).digest('hex')}`,
    };
  }
}

function detectVitestCapability(): boolean {
  try {
    require.resolve('vitest/package.json');
    return true;
  } catch {
    return false;
  }
}

function parseSummary(output: string, label: 'Test Files' | 'Tests'): VitestSummaryCounts {
  const normalized = stripAnsi(output);
  const line = normalized.split(/\r?\n/).find((candidate) => candidate.trimStart().startsWith(label));
  if (line === undefined) return { passed: 0, failed: 0, skipped: 0 };

  return ['passed', 'failed', 'skipped'].reduce<VitestSummaryCounts>((counts, status) => {
    const match = line.match(new RegExp(`(\\d+)\\s+${status}`, 'i'));
    const count = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
    return { ...counts, [status]: count };
  }, { passed: 0, failed: 0, skipped: 0 });
}

function toExecutedUnits(
  testFiles: VitestSummaryCounts,
  assertions: VitestSummaryCounts,
): readonly SelfAuditExecutedUnit[] {
  return [
    { kind: 'file', count: testFiles.passed + testFiles.failed },
    { kind: 'assertion', count: assertions.passed + assertions.failed },
    { kind: 'failed-file', count: testFiles.failed },
    { kind: 'failed-assertion', count: assertions.failed },
    { kind: 'skipped-file', count: testFiles.skipped },
    { kind: 'skipped-assertion', count: assertions.skipped },
  ];
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}
