import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_JSON_RELATIVE_PATH,
  ACTIVE_MARKDOWN_RELATIVE_PATH,
  LEDGER_COLUMNS,
  MASTER_PLAN_RELATIVE_PATH,
  PROGRAM_ROOTS,
  buildActiveModel,
  generateActiveViews,
  main as mainRaw,
  normalizedSha256,
  parseArgs,
  readTrustAnchorBlob,
  resolveEntrypointIdentity,
  resolveReceiptTrustAnchor,
  splitMarkdownRow,
  validateMasterPlan,
} from '../../scripts/lint-master-plan.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Can this host actually create a symlink?
 *
 * MASTER-CLI-SYMLINK-FLAKE-001 `X` (cross-platform) evidence path: the real-CLI symlink case
 * used to be gated on `process.platform === 'win32'`, which is a GUESS about capability, not a
 * measurement. Windows with Developer Mode (or an elevated/`SeCreateSymbolicLinkPrivilege`
 * session) creates symlinks fine, and WSL always can — those hosts were being skipped for no
 * reason, so the matrix could never accumulate evidence there. Probing the capability instead
 * means the case RUNS wherever the operating system permits it and is skipped only where the
 * platform genuinely cannot express the contract — an honest `unsupported`, not a blanket
 * assumption. See AGENTS.md Law 2 (Every Environment): unsupported must fail honestly, never
 * silently generalise from one platform to another.
 */
const symlinkCapability = (() => {
  const probeRoot = mkdtempSync(join(tmpdir(), 'deckent-symlink-probe-'));
  try {
    const target = join(probeRoot, 'target.txt');
    writeFileSync(target, 'probe\n', 'utf8');
    symlinkSync(target, join(probeRoot, 'link.txt'));
    return { supported: true, reason: 'symlink creation permitted' };
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : 'UNKNOWN';
    return { supported: false, reason: `symlink creation refused (${code})` };
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
})();

// ═══ XPLAT-SKIP-GUARD-001 (MASTER 32, Dalga-2) ═════════════════════════════
// Skip-visibility is GATE-INVARIANT: the zero-skip observation on runs
// 30832207675/30833491791 was RUN evidence, not a rule the gate imposed. A
// future runner image that quietly refuses symlinks would have skipped the
// cases while the leg stayed green — the exact silent-generalization Law 2
// forbids. This block turns the invariant into a fail-closed rule on every
// Validator Contract leg (the 3-OS REQUIRED matrix).
describe('XPLAT-SKIP-GUARD-001 — symlink coverage may not silently vanish', () => {
  // POSIX platforms ALWAYS support symlinks: a probe refusal there is an
  // environment DEFECT, never an honest `unsupported`.
  const EXPECTED_CAPABLE = new Set(['linux', 'darwin']);

  it('declared-capable platforms run the symlink cases (no silent skip)', () => {
    if (EXPECTED_CAPABLE.has(process.platform)) {
      expect(
        symlinkCapability.supported,
        `symlink probe refused on declared-capable ${process.platform}: `
          + `${symlinkCapability.reason} — environment defect, leg must fail`,
      ).toBe(true);
    } else {
      // win32: a skip is legitimate ONLY as a typed, visible record.
      expect(symlinkCapability.reason).toMatch(
        /^symlink creation (permitted|refused \([A-Z0-9_]+\))$/,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[xplat-skip-guard] ${process.platform}: symlink capability = `
          + `${symlinkCapability.supported} (${symlinkCapability.reason})`,
      );
    }
  });
});

const TEST_NOW_MS = Date.parse('2026-07-26T18:30:00+03:00');
const execFileAsync = promisify(execFile);
const LEDGER_HEADER = `| ${LEDGER_COLUMNS.join(' | ')} |`;
const LEDGER_SEPARATOR =
  '|---:|---|---|---|---|---|---|---|---|---|---|---|---|';
const G1_MANIFEST =
  '`docs/MASTER-PLAN.md@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`';
const TEST_BUDGET_POLICY_DIGEST = 'b'.repeat(64);
const COMPLETE_G7_MANIFEST = [
  'provider=codex',
  'surface=terminal',
  'binary=1.0.0',
  'model=gpt-5.6-sol',
  'stage=TASK-A',
  'authClass=subscription',
  'accountClass=owner',
  'tenant=t1',
  'project=p1',
  'task=TASK-A',
  'attempt=a1',
  'promptDataClass=source',
  'tools=none',
  'filesystem=read-only',
  'network=provider-only',
  'maxWallClock=30s',
  'authorizationTtl=15m',
  `budget=100@iso4217-usd-minor#${TEST_BUDGET_POLICY_DIGEST}`,
  'expiresAt=2026-07-26T17:15:00+03:00',
  'fallback=hold',
  'killRollback=owner',
].join(';');

type FixtureRow = {
  order: number;
  id: string;
  parent?: string;
  program?: string;
  outcome?: string;
  priority?: string;
  dependsOn?: string[];
  gates?: string[];
  state?: string;
  truth?: string;
  acceptance?: string;
  evidence?: string;
  updated?: string;
  sectionRoot?: string;
};

type FixtureReceipt = {
  id: string;
  workIds: string[];
  gates?: string[];
  manifest?: string;
  ownerDecision?: string;
  recorded?: string;
  state?: string;
};

type FixtureBlocker = {
  code: string;
  workIds: string[];
  remedy?: string;
};

const scratchRoots: string[] = [];

afterEach(() => {
  for (const root of scratchRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function row(input: FixtureRow): string {
  return [
    input.order,
    input.id,
    input.parent ?? 'P00',
    input.program ?? 'TRUTH',
    input.outcome ?? `Outcome ${input.id}`,
    input.priority ?? 'P0',
    input.dependsOn?.join(', ') || '—',
    input.gates?.join(',') ?? 'G0',
    input.state ?? 'OPEN',
    input.truth ?? '0/0/0/?/0/-/-',
    input.acceptance ?? `Acceptance ${input.id}`,
    input.evidence ?? `Evidence ${input.id}`,
    input.updated ?? '2026-07-26',
  ].join(' | ');
}

function planFixture({
  rows,
  receipts = [],
  blockers = [],
}: {
  rows: FixtureRow[];
  receipts?: FixtureReceipt[];
  blockers?: FixtureBlocker[];
}): string {
  const receiptRows = receipts.map(
    (receipt) =>
      `| \`${receipt.id}\` | ${receipt.workIds.join(', ')} | ${
        receipt.gates?.join(',') ?? 'G1'
      } | ${receipt.manifest ?? G1_MANIFEST} | ${
        receipt.ownerDecision ??
        'owner=Alperen;decision=APPROVED;scope=exact-fixture;exclusions=everything-else'
      } | ${receipt.recorded ?? '2026-07-26T17:00:00+03:00'} | ${
        receipt.state ?? '`ONE_SHOT`: consumed@2026-07-26T17:01:00+03:00'
      } |`,
  );
  const blockerRows = blockers.map(
    (blocker) =>
      `| \`${blocker.code}\` | ${blocker.workIds
        .map((id) => `\`${id}\``)
        .join(', ')} | ${blocker.remedy ?? 'exact `DependsOn`'} |`,
  );
  const groupedRows = new Map(PROGRAM_ROOTS.map((root) => [root, [] as FixtureRow[]]));
  for (const item of rows) {
    const root =
      item.sectionRoot ??
      (PROGRAM_ROOTS.includes(item.parent ?? 'P00') ? item.parent ?? 'P00' : 'P00');
    groupedRows.get(root)!.push(item);
  }

  return [
    '# Deckent — Canonical Master Plan',
    '',
    '### 3.4 Gate receipt contract',
    '',
    '| Receipt ID | Work IDs | Gate | Exact manifest and baseline | Owner decision | Recorded | State |',
    '|---|---|---|---|---|---|---|',
    ...receiptRows,
    '',
    '### 3.5 Typed blocker register',
    '',
    '| Blocker code | Work IDs | Remedy IDs / authority |',
    '|---|---|---|',
    ...blockerRows,
    '',
    '## 4. Kaynak disposition katalo\u011fu',
    '',
    'fixture',
    '',
    '## 7. Canonical execution ledger',
    '',
    ...PROGRAM_ROOTS.flatMap((root) => [
      `### ${root} — fixture`,
      '',
      LEDGER_HEADER,
      LEDGER_SEPARATOR,
      ...groupedRows.get(root)!.map((item) => `| ${row(item)} |`),
      '',
    ]),
    '## 8. Legacy reconciliation manifest',
    '',
    'fixture',
    '',
  ].join('\n');
}

function findingCodes(source: string): string[] {
  return validateMasterPlan(source, {
    nowMs: TEST_NOW_MS,
    baselineMode: 'structural-only',
  }).findings.map((finding) => finding.code);
}

function makeScratchPlan(source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-master-plan-'));
  scratchRoots.push(root);
  const target = join(root, MASTER_PLAN_RELATIVE_PATH);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source, 'utf8');
  return root;
}

function bootstrapViews(root: string, source: string): void {
  const validation = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root });
  if (!validation.ok) {
    throw new Error(
      `invalid bootstrap fixture: ${validation.findings
        .map((finding) => finding.code)
        .join(',')}`,
    );
  }
  for (const [relativePath, content] of Object.entries(
    generateActiveViews(validation),
  )) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
}

function memorySink(): { text: () => string; stream: NodeJS.WritableStream } {
  let value = '';
  return {
    text: () => value,
    stream: {
      write(chunk: string | Uint8Array) {
        value += String(chunk);
        return true;
      },
    } as NodeJS.WritableStream,
  };
}

function main(
  argv: string[],
  io: {
    stdout?: NodeJS.WritableStream;
    stderr?: NodeJS.WritableStream;
    beforeProjectionWrite?: () => void;
  } = {},
): number {
  return mainRaw(argv, { ...io, nowMs: TEST_NOW_MS });
}

describe('splitMarkdownRow', () => {
  it('treats escaped pipes as cell content and unescaped pipes as structure', () => {
    expect(splitMarkdownRow('| a | b \\| c | d |')).toEqual(['a', 'b | c', 'd']);
    expect(splitMarkdownRow('not a row')).toBeNull();
  });

  it('uses CommonMark backslash parity for structural pipes', () => {
    expect(splitMarkdownRow(String.raw`| a \\| b |`)).toEqual(['a \\', 'b']);
    expect(splitMarkdownRow(String.raw`| a \|`)).toBeNull();
  });
});

describe('canonical MASTER validation', () => {
  it('validates the repository MASTER snapshot without pinning today\u2019s row counts', () => {
    const source = readFileSync(join(REPO_ROOT, MASTER_PLAN_RELATIVE_PATH), 'utf8');
    // The ledger can carry ACTIVE admission receipts whose manifests pin real files by
    // digest; those baselines are only checkable against a physical tree, so the repository
    // snapshot is validated with the repository root. Validating it rootless would report
    // RECEIPT_BASELINE_ROOT_REQUIRED for every active receipt and mask real findings.
    const result = validateMasterPlan(source, { root: REPO_ROOT });
    expect(result.findings).toEqual([]);
    expect(result.items.length).toBeGreaterThan(0);
    expect(new Set(result.items.map((item) => item.id)).size).toBe(result.items.length);
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it('normalizes LF/CRLF only for source digests and generated content', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const lf = validateMasterPlan(source);
    const crlf = validateMasterPlan(source.replace(/\n/g, '\r\n'));
    expect(lf.ok).toBe(true);
    expect(crlf.ok).toBe(true);
    expect(crlf.sourceSha256).toBe(lf.sourceSha256);
    expect(generateActiveViews(crlf)).toEqual(generateActiveViews(lf));
  });

  it('fails closed on an extra unescaped pipe / wrong column count', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', outcome: 'bad | split' }],
    });
    expect(findingCodes(source)).toContain('LEDGER_COLUMN_COUNT');
  });

  it('accepts a literal escaped pipe in a ledger cell', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', outcome: 'safe \\| literal' }],
    });
    const result = validateMasterPlan(source);
    expect(result.ok).toBe(true);
    expect(result.items[0]!.outcome).toBe('safe | literal');
  });

  it('rejects duplicate IDs, duplicate/non-monotonic orders and invalid enums', () => {
    const source = planFixture({
      rows: [
        { order: 20, id: 'TASK-A' },
        {
          order: 20,
          id: 'TASK-A',
          program: 'UNKNOWN',
          priority: 'P9',
          gates: ['G9'],
          state: 'MAGIC',
          truth: '1/2',
          updated: '2026-02-31',
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining([
        'ORDER_NOT_STRICT',
        'ORDER_DUPLICATE',
        'ID_DUPLICATE',
        'PROGRAM_ENUM',
        'PRIORITY_ENUM',
        'GATE_ENUM',
        'STATE_ENUM',
        'TRUTH_SHAPE',
        'UPDATED_DATE',
      ]),
    );
  });

  it('rejects future Updated chronology', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', updated: '9999-12-31' }],
    });
    expect(findingCodes(source)).toContain('UPDATED_DATE');
  });

  it('returns a structured finding for clocks outside the JavaScript Date domain', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    for (const nowMs of [Number.MAX_VALUE, -Number.MAX_VALUE]) {
      const result = validateMasterPlan(source, {
        nowMs,
        baselineMode: 'structural-only',
      });
      expect(result.ok).toBe(false);
      expect(result.findings.map((finding) => finding.code)).toContain(
        'VALIDATION_CLOCK',
      );
    }
  });

  it('fails closed on a non-numeric row instead of silently dropping it', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] }).replace(
      '| 10 | TASK-A |',
      '| ten | TASK-A |',
    );
    expect(findingCodes(source)).toContain('ORDER_FORMAT');
  });

  it('fails closed when a ledger row loses its leading or trailing pipe', () => {
    const valid = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const noLeading = valid.replace('| 10 | TASK-A |', '10 | TASK-A |');
    const noTrailing = valid.replace(
      /(\| 10 \| TASK-A \|[^\n]+) \|(\n)/,
      '$1$2',
    );
    expect(findingCodes(noLeading)).toContain('LEDGER_ROW_SYNTAX');
    expect(findingCodes(noTrailing)).toContain('LEDGER_ROW_SYNTAX');
  });

  it('fails closed on table rows hidden before a program header', () => {
    const valid = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const hiddenRow = `| ${row({ order: 20, id: 'TASK-HIDDEN' })} |`;
    const source = valid.replace(
      `### P00 — fixture\n\n${LEDGER_HEADER}`,
      `### P00 — fixture\n\n${hiddenRow}\n\n${LEDGER_HEADER}`,
    );
    const result = validateMasterPlan(source, { nowMs: TEST_NOW_MS });
    expect(result.findings.map((finding) => finding.code)).toContain(
      'PROGRAM_PREHEADER_ROW',
    );
    expect(result.items.some((item) => item.id === 'TASK-HIDDEN')).toBe(false);
  });

  it('rejects ledger-shaped shadow work outside canonical §7 bodies', () => {
    const fixture = planFixture({
      rows: [{ order: 10, id: 'TASK-A' }],
    });
    const fullShadow = `| ${row({ order: 999_999, id: 'SHADOW-001' })} |`;
    const missingUpdated = `| ${row({ order: 1_000_000, id: 'SHADOW-002' })
      .split(' | ')
      .slice(0, -1)
      .join(' | ')} |`;
    const missingOuterPipes = row({ order: 1_000_001, id: 'SHADOW-003' });
    const source = `${fixture}${fullShadow}\n${missingUpdated}\n${missingOuterPipes}\n`;
    const result = validateMasterPlan(source, { nowMs: TEST_NOW_MS });
    expect(
      result.findings.filter((finding) => finding.code === 'SHADOW_LEDGER_ROW'),
    ).toHaveLength(3);
    expect(
      result.items.some((item) => item.id.startsWith('SHADOW-')),
    ).toBe(false);
    expect(
      result.findings
        .filter((finding) => finding.code === 'SHADOW_LEDGER_ROW')
        .map((finding) => finding.workId),
    ).toEqual(
      expect.arrayContaining(['SHADOW-001', 'SHADOW-002', 'SHADOW-003']),
    );
  });

  it('rejects receipt/blocker-shaped shadow authority outside §3.4/§3.5', () => {
    const fixture = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const shadowReceipt =
      '| `GR-2026-07-26-SHADOW-01` | TASK-A | G1 | manifest | owner | 2026-07-26T17:00:00+03:00 | `ONE_SHOT`: consumed@2026-07-26T17:01:00+03:00 |';
    const shadowBlocker =
      '| `SHADOW_BLOCKER` | `TASK-A` | exact `TASK-A` |';
    const result = validateMasterPlan(
      `${fixture}${shadowReceipt}\n${shadowBlocker}\n`,
      { nowMs: TEST_NOW_MS },
    );
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['SHADOW_RECEIPT_ROW', 'SHADOW_BLOCKER_ROW']),
    );
    expect(result.receipts.some((receipt) => receipt.id.includes('SHADOW'))).toBe(false);
    expect(result.blockers.some((blocker) => blocker.code === 'SHADOW_BLOCKER')).toBe(
      false,
    );
  });

  it('rejects missing/self/program-root dependencies', () => {
    const source = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          dependsOn: ['TASK-A', 'MISSING-ID', 'P00'],
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining([
        'DEPENDENCY_SELF',
        'DEPENDENCY_MISSING',
        'DEPENDENCY_PROGRAM_ROOT',
      ]),
    );
  });

  it('rejects empty segments in every canonical comma-delimited authority list', () => {
    const ledger = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          dependsOn: ['TASK-B'],
          gates: ['G1'],
        },
        { order: 20, id: 'TASK-B' },
      ],
    })
      .replace('TASK-B | G1 | OPEN', 'TASK-B, | G1,, | OPEN');
    expect(findingCodes(ledger)).toEqual(
      expect.arrayContaining(['DEPENDENCY_LIST_FORMAT', 'GATE_LIST_FORMAT']),
    );

    const receipt = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIST-01',
          workIds: ['TASK-A'],
          gates: ['G1'],
        },
      ],
    }).replace('| TASK-A | G1 |', '| TASK-A, | G1, |');
    expect(findingCodes(receipt)).toEqual(
      expect.arrayContaining([
        'RECEIPT_WORK_LIST_FORMAT',
        'RECEIPT_GATE_LIST_FORMAT',
      ]),
    );

    const blocker = planFixture({
      rows: [{ order: 10, id: 'TASK-A', state: 'BLOCKED' }],
      blockers: [
        { code: 'OWNER_DECISION_REQUIRED', workIds: ['TASK-A'] },
      ],
    }).replace('| `TASK-A` | exact', '| `TASK-A`, | exact');
    expect(findingCodes(blocker)).toContain('BLOCKER_WORK_LIST_FORMAT');
  });

  it('detects dependency cycles, parent cycles and mixed closure deadlocks', () => {
    const dependencyCycle = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', dependsOn: ['TASK-B'] },
        { order: 20, id: 'TASK-B', dependsOn: ['TASK-A'] },
      ],
    });
    expect(findingCodes(dependencyCycle)).toContain('CLOSURE_CYCLE');

    const parentCycle = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', parent: 'TASK-B' },
        { order: 20, id: 'TASK-B', parent: 'TASK-A' },
      ],
    });
    expect(findingCodes(parentCycle)).toContain('CLOSURE_CYCLE');

    const mixedCycle = planFixture({
      rows: [
        { order: 10, id: 'TASK-A' },
        { order: 20, id: 'TASK-B', parent: 'TASK-A', dependsOn: ['TASK-A'] },
      ],
    });
    expect(findingCodes(mixedCycle)).toContain('CLOSURE_CYCLE');
  });

  it(
    'validates a deep 15k dependency DAG without recursive stack overflow',
    () => {
      const count = 15_000;
      const rows = Array.from({ length: count }, (_, index) => ({
        order: (index + 1) * 10,
        id: `TASK-${index + 1}`,
        dependsOn: index + 1 < count ? [`TASK-${index + 2}`] : [],
      }));
      const result = validateMasterPlan(planFixture({ rows }), {
        nowMs: TEST_NOW_MS,
      });
      expect(result.ok).toBe(true);
      expect(result.items).toHaveLength(count);
    },
    15_000,
  );

  it(
    'resolves a deep 25k aggregate-parent chain in linear-scale time',
    () => {
      const count = 25_000;
      const rows = Array.from({ length: count }, (_, index) => ({
        order: (index + 1) * 10,
        id: `TASK-${index + 1}`,
        parent: index + 1 < count ? `TASK-${index + 2}` : 'P00',
      }));
      const result = validateMasterPlan(planFixture({ rows }), {
        nowMs: TEST_NOW_MS,
      });
      expect(result.ok).toBe(true);
      expect(result.items).toHaveLength(count);
    },
    10_000,
  );

  it('rejects a row listed under a program section different from its parent root', () => {
    const source = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', parent: 'P00' },
        {
          order: 20,
          id: 'TASK-B',
          parent: 'TASK-A',
          sectionRoot: 'P01',
        },
      ],
    });
    expect(findingCodes(source)).toContain('PROGRAM_SECTION_SCOPE');
  });

  it('enforces dependency readiness and aggregate-parent closure', () => {
    const source = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'READY',
          gates: ['G0'],
        },
        {
          order: 20,
          id: 'TASK-B',
          parent: 'TASK-A',
          state: 'OPEN',
        },
        {
          order: 30,
          id: 'TASK-C',
          dependsOn: ['TASK-B'],
          state: 'IN_PROGRESS',
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining(['AGGREGATE_PARENT_PREMATURE', 'DEPENDENCY_STATE_UNSATISFIED']),
    );
  });

  it('does not treat DISPOSED prerequisites as satisfied and closes disposed aggregates', () => {
    const source = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G2'],
          state: 'DISPOSED',
          evidence:
            'owner-approved=cancelled-outcome;decision-date=2026-07-26;`receipt=GR-2026-07-26-DISPOSE-A`',
        },
        {
          order: 20,
          id: 'TASK-B',
          dependsOn: ['TASK-A'],
          state: 'READY',
        },
        {
          order: 30,
          id: 'TASK-PARENT',
          gates: ['G2'],
          state: 'DISPOSED',
          evidence:
            'owner-approved=cancelled-parent;decision-date=2026-07-26;`receipt=GR-2026-07-26-DISPOSE-P`',
        },
        {
          order: 40,
          id: 'TASK-CHILD',
          parent: 'TASK-PARENT',
          state: 'OPEN',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-DISPOSE-A',
          workIds: ['TASK-A'],
          gates: ['G2'],
        },
        {
          id: 'GR-2026-07-26-DISPOSE-P',
          workIds: ['TASK-PARENT'],
          gates: ['G2'],
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining([
        'DEPENDENCY_STATE_UNSATISFIED',
        'AGGREGATE_PARENT_PREMATURE',
      ]),
    );
  });

  it('requires every BLOCKED item exactly once and rejects stale blocker assignments', () => {
    const missing = planFixture({
      rows: [{ order: 10, id: 'TASK-A', state: 'BLOCKED' }],
    });
    expect(findingCodes(missing)).toContain('BLOCKED_REGISTER_CARDINALITY');

    const duplicate = planFixture({
      rows: [{ order: 10, id: 'TASK-A', state: 'BLOCKED' }],
      blockers: [
        { code: 'FIRST_BLOCKER', workIds: ['TASK-A'] },
        { code: 'SECOND_BLOCKER', workIds: ['TASK-A'] },
      ],
    });
    expect(findingCodes(duplicate)).toContain('BLOCKED_REGISTER_CARDINALITY');

    const stale = planFixture({
      rows: [{ order: 10, id: 'TASK-A', state: 'OPEN' }],
      blockers: [{ code: 'STALE_BLOCKER', workIds: ['TASK-A'] }],
    });
    expect(findingCodes(stale)).toContain('BLOCKER_STATE_MISMATCH');
  });

  it('rejects a malformed typed blocker code instead of silently ignoring it', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', state: 'BLOCKED' }],
      blockers: [{ code: 'lower-case', workIds: ['TASK-A'] }],
    });
    expect(findingCodes(source)).toContain('BLOCKER_CODE_FORMAT');
  });

  it('rejects orphan and duplicate blocker work scopes', () => {
    const orphan = planFixture({
      rows: [{ order: 10, id: 'TASK-A' }],
      blockers: [{ code: 'ORPHAN_BLOCKER', workIds: [] }],
    });
    expect(findingCodes(orphan)).toContain('BLOCKER_WORK_EMPTY');

    const duplicate = planFixture({
      rows: [{ order: 10, id: 'TASK-A', state: 'BLOCKED' }],
      blockers: [
        {
          code: 'DUPLICATE_SCOPE',
          workIds: ['TASK-A', 'TASK-A'],
        },
      ],
    });
    expect(findingCodes(duplicate)).toContain('BLOCKER_WORK_DUPLICATE');
  });

  it('accepts exactly one typed blocker assignment with a canonical remedy', () => {
    const source = planFixture({
      rows: [
        { order: 10, id: 'TASK-A' },
        {
          order: 20,
          id: 'TASK-B',
          state: 'BLOCKED',
          dependsOn: ['TASK-A'],
        },
      ],
      blockers: [
        {
          code: 'DEPENDENCY_UNSATISFIED',
          workIds: ['TASK-B'],
          remedy: '`TASK-A`',
        },
      ],
    });
    expect(validateMasterPlan(source).ok).toBe(true);
  });

  it('binds explicit blocker remedies exactly to DependsOn and declared gates', () => {
    const source = planFixture({
      rows: [
        { order: 10, id: 'TASK-A' },
        { order: 20, id: 'TASK-C' },
        {
          order: 30,
          id: 'TASK-B',
          state: 'BLOCKED',
          dependsOn: ['TASK-A'],
          gates: ['G1'],
        },
      ],
      blockers: [
        {
          code: 'DEPENDENCY_UNSATISFIED',
          workIds: ['TASK-B'],
          remedy: '`TASK-C`; `gate:G2`',
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining(['BLOCKER_REMEDY_SCOPE', 'BLOCKER_REMEDY_GATE_SCOPE']),
    );
  });

  it('rejects negated or mixed exact-DependsOn delegation', () => {
    const rows: FixtureRow[] = [
      { order: 10, id: 'TASK-A' },
      { order: 20, id: 'TASK-C' },
      {
        order: 30,
        id: 'TASK-B',
        state: 'BLOCKED',
        dependsOn: ['TASK-A'],
      },
    ];
    const negated = planFixture({
      rows,
      blockers: [
        {
          code: 'DEPENDENCY_UNSATISFIED',
          workIds: ['TASK-B'],
          remedy: 'not `DependsOn`',
        },
      ],
    });
    expect(findingCodes(negated)).toEqual(
      expect.arrayContaining([
        'BLOCKER_REMEDY_DELEGATION',
        'BLOCKER_REMEDY_SCOPE',
      ]),
    );

    const mixed = planFixture({
      rows,
      blockers: [
        {
          code: 'DEPENDENCY_UNSATISFIED',
          workIds: ['TASK-B'],
          remedy: 'exact `DependsOn` + `TASK-C`',
        },
      ],
    });
    expect(findingCodes(mixed)).toContain('BLOCKER_REMEDY_SCOPE');
  });

  it('fails closed on malformed receipt/blocker table structure', () => {
    const validReceipt = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [{ id: 'GR-2026-07-26-FIXTURE-01', workIds: ['TASK-A'] }],
    });
    expect(
      findingCodes(
        validReceipt.replace(
          '| `GR-2026-07-26-FIXTURE-01` |',
          '`GR-2026-07-26-FIXTURE-01` |',
        ),
      ),
    ).toContain('RECEIPT_ROW_SYNTAX');
    expect(
      findingCodes(
        validReceipt.replace(
          '|---|---|---|---|---|---|---|',
          '|---|---|---|---|---|---|',
        ),
      ),
    ).toContain('RECEIPT_SEPARATOR_SCHEMA');
    expect(
      findingCodes(
        validReceipt.replace(
          '|---|---|---|---|---|---|---|',
          '|---|---|---|---|---|---|-|',
        ),
      ),
    ).toContain('RECEIPT_SEPARATOR_SCHEMA');
    const receiptLine = validReceipt
      .split('\n')
      .find((line) => line.includes('GR-2026-07-26-FIXTURE-01'))!;
    expect(
      findingCodes(
        validReceipt.replace(
          receiptLine,
          `${receiptLine.slice(0, -1)}\\|`,
        ),
      ),
    ).toContain('RECEIPT_COLUMN_COUNT');

    const validBlocker = planFixture({
      rows: [{ order: 10, id: 'TASK-A', state: 'BLOCKED' }],
      blockers: [{ code: 'OWNER_DECISION_REQUIRED', workIds: ['TASK-A'] }],
    });
    expect(
      findingCodes(
        validBlocker.replace(
          '| `OWNER_DECISION_REQUIRED` |',
          '`OWNER_DECISION_REQUIRED` |',
        ),
      ),
    ).toContain('BLOCKER_ROW_SYNTAX');
    expect(
      findingCodes(
        validBlocker.replace(
          '| Blocker code | Work IDs | Remedy IDs / authority |\n|---|---|---|',
          '| Blocker code | Work IDs | Remedy IDs / authority |\n|---|---|',
        ),
      ),
    ).toContain('BLOCKER_SEPARATOR_SCHEMA');
    const blockerLine = validBlocker
      .split('\n')
      .find((line) => line.includes('OWNER_DECISION_REQUIRED'))!;
    expect(
      findingCodes(
        validBlocker.replace(
          blockerLine,
          `${blockerLine.slice(0, -1)}\\|`,
        ),
      ),
    ).toContain('BLOCKER_COLUMN_COUNT');
  });

  it('requires scoped provenance for VERIFY mutation claims', () => {
    const missing = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'VERIFY' }],
    });
    expect(findingCodes(missing)).toContain('VERIFY_PROVENANCE');

    const historical = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'VERIFY',
          evidence: '`historical-authority=legacy-a;historical-gates=G1;proof=disk-slice`',
        },
      ],
    });
    expect(validateMasterPlan(historical).ok).toBe(true);

    const receipted = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'VERIFY',
          evidence: '`receipt=GR-2026-07-26-FIXTURE-01`; proof',
        },
      ],
      receipts: [{ id: 'GR-2026-07-26-FIXTURE-01', workIds: ['TASK-A'] }],
    });
    expect(validateMasterPlan(receipted).ok).toBe(true);
  });

  it('never turns raw or negated receipt prose into mutation authority', () => {
    const source = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence:
            'GR-2026-07-26-NEGATED-01 was NOT used or authorized; proof=unit-suite',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-NEGATED-01',
          workIds: ['TASK-A'],
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining(['EVIDENCE_RECEIPT_GRAMMAR', 'DONE_PROVENANCE']),
    );

    const negatedStructuredProof = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence:
            '`receipt=GR-2026-07-26-NEGATED-02`; `proof=unit-suite`; proof was NOT verified',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-NEGATED-02',
          workIds: ['TASK-A'],
        },
      ],
    });
    expect(findingCodes(negatedStructuredProof)).toContain(
      'DONE_EVIDENCE_PENDING',
    );

    const embeddedProof = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence: 'NO `proof=made-up` exists',
        },
      ],
    });
    expect(findingCodes(embeddedProof)).toContain('DONE_PROOF');

    const embeddedReceipt = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence:
            'NOT `receipt=GR-2026-07-26-NEGATED-03` was used; `proof=unit`',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-NEGATED-03',
          workIds: ['TASK-A'],
        },
      ],
    });
    expect(findingCodes(embeddedReceipt)).toEqual(
      expect.arrayContaining(['EVIDENCE_RECEIPT_GRAMMAR', 'DONE_PROVENANCE']),
    );

    const embeddedHistorical = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'VERIFY',
          evidence:
            'NOT `historical-authority=legacy-a;historical-gates=G1;proof=disk-slice`',
        },
      ],
    });
    expect(findingCodes(embeddedHistorical)).toEqual(
      expect.arrayContaining([
        'HISTORICAL_PROVENANCE_INVALID',
        'VERIFY_PROVENANCE',
      ]),
    );
  });

  it('rejects generic, empty and gate-incomplete historical provenance', () => {
    const empty = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'VERIFY',
          evidence: '`historical-authority=none;historical-gates=G1;proof=unknown`',
        },
      ],
    });
    expect(findingCodes(empty)).toEqual(
      expect.arrayContaining(['HISTORICAL_PROVENANCE_INVALID', 'VERIFY_PROVENANCE']),
    );

    const uncovered = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1', 'G2'],
          state: 'VERIFY',
          evidence: '`historical-authority=legacy-a;historical-gates=G1;proof=disk-slice`',
        },
      ],
    });
    expect(findingCodes(uncovered)).toEqual(
      expect.arrayContaining(['HISTORICAL_GATE_COVERAGE', 'VERIFY_PROVENANCE']),
    );
  });

  it('rejects malformed receipt IDs and unbound/unsafe target manifests', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'BAD',
          workIds: ['TASK-A'],
          manifest: '`../outside.md@ABSENT`; `docs/unbound.md`; `package.json`',
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining([
        'RECEIPT_ID_FORMAT',
        'RECEIPT_TARGET_PATH',
        'RECEIPT_TARGET_UNBOUND',
      ]),
    );
  });

  it('rejects non-normalized and portable-case-colliding receipt targets', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          manifest:
            '`docs//MASTER-PLAN.md@ABSENT`; `docs/Plan.md@ABSENT`; `DOCS/plan.md@ABSENT`; `docs/Stra\u00dfe.txt@ABSENT`; `docs/STRASSE.txt@ABSENT`; `docs/CON .txt@ABSENT`; `docs/evil\u202Ecod.exe@ABSENT`',
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining([
        'RECEIPT_TARGET_PATH',
        'RECEIPT_TARGET_PORTABLE_DUPLICATE',
      ]),
    );

    const portableSpaces = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-02',
          workIds: ['TASK-A'],
          manifest: '`docs/a=b;c @ Plan.md@ABSENT`',
        },
      ],
    });
    expect(
      validateMasterPlan(portableSpaces, { nowMs: TEST_NOW_MS }).ok,
    ).toBe(true);
  });

  it('rejects duplicate/conflicting authority fields, rejected owners and impossible instants', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          manifest: `${G1_MANIFEST};provider=codex;provider=claude`,
          ownerDecision: 'owner=Alperen;owner=Mallory;decision=REJECTED',
          recorded: '2026-02-31T17:00:00+03:00',
          state: '`ONE_SHOT`: consumed@2026-07-26T17:01:00+03:00',
        },
      ],
    });
    expect(findingCodes(source)).toEqual(
      expect.arrayContaining([
        'RECEIPT_MANIFEST_FIELD_DUPLICATE',
        'RECEIPT_OWNER_FIELD_DUPLICATE',
        'RECEIPT_OWNER_DECISION',
        'RECEIPT_RECORDED',
        'ADMISSION_RECEIPT_MISSING',
      ]),
    );

    const missingScope = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-02',
          workIds: ['TASK-A'],
          ownerDecision: 'owner=Alperen;decision=APPROVED',
        },
      ],
    });
    expect(findingCodes(missingScope)).toContain('RECEIPT_OWNER_DECISION');

    const confusableOwner = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-03',
          workIds: ['TASK-A'],
          ownerDecision:
            'owner=Alper\u0435n;decision=APPROVED;scope=fixture;exclusions=other',
        },
      ],
    });
    expect(findingCodes(confusableOwner)).toContain('RECEIPT_OWNER_DECISION');

    const nonCanonicalOwnerCase = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-04',
          workIds: ['TASK-A'],
          ownerDecision:
            'Owner=Alperen;decision=APPROVED;scope=fixture;exclusions=other',
        },
      ],
    });
    expect(findingCodes(nonCanonicalOwnerCase)).toContain(
      'RECEIPT_OWNER_DECISION',
    );
  });

  it('invalidates active receipts outside their exact time window', () => {
    const expired = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          manifest: `${G1_MANIFEST};expiresAt=2026-07-26T18:00:00+03:00`,
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    expect(findingCodes(expired)).toEqual(
      expect.arrayContaining(['RECEIPT_ACTIVE_EXPIRED', 'ADMISSION_RECEIPT_MISSING']),
    );

    const future = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          recorded: '2026-07-26T19:00:00+03:00',
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    expect(findingCodes(future)).toEqual(
      expect.arrayContaining(['RECEIPT_NOT_YET_VALID', 'ADMISSION_RECEIPT_MISSING']),
    );

    const negated = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-02',
          workIds: ['TASK-A'],
          state: '`ONE_SHOT`: NOT ACTIVE',
        },
      ],
    });
    expect(findingCodes(negated)).toEqual(
      expect.arrayContaining(['RECEIPT_STATE', 'ADMISSION_RECEIPT_MISSING']),
    );

    const futureConsumed = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'VERIFY' }],
      receipts: [
        {
          id: 'GR-2099-07-26-FIXTURE-03',
          workIds: ['TASK-A'],
          recorded: '2099-07-26T17:00:00+03:00',
          state: '`ONE_SHOT`: consumed@2099-07-26T17:01:00+03:00',
        },
      ],
    });
    expect(findingCodes(futureConsumed)).toContain('RECEIPT_NOT_YET_VALID');

    const mismatchedDateAndExpiry = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-04',
          workIds: ['TASK-A'],
          recorded: '2026-07-25T17:00:00+03:00',
          state: '`ONE_SHOT`: expired@2026-07-25T17:01:00+03:00',
        },
      ],
    });
    expect(findingCodes(mismatchedDateAndExpiry)).toEqual(
      expect.arrayContaining(['RECEIPT_ID_DATE', 'RECEIPT_BOUNDARY']),
    );
  });

  it('requires every receipt to be one-shot or explicitly expiring', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          state: 'ACTIVE',
        },
      ],
    });
    expect(findingCodes(source)).toContain('RECEIPT_BOUNDARY');
  });

  it('requires VERIFY/DONE evidence receipts to cover every mutation gate', () => {
    const source = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1', 'G7'],
          state: 'VERIFY',
          evidence: '`receipt=GR-2026-07-26-FIXTURE-01`; partial receipt',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          gates: ['G1'],
        },
      ],
    });
    expect(findingCodes(source)).toContain('EVIDENCE_GATE_COVERAGE');
  });

  it('requires an active receipt for every READY/IN_PROGRESS mutation gate', () => {
    const missing = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1', 'G2'], state: 'READY' }],
    });
    expect(findingCodes(missing).filter((code) => code === 'ADMISSION_RECEIPT_MISSING')).toHaveLength(
      2,
    );

    const admitted = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1', 'G2'],
          state: 'READY',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          gates: ['G1', 'G2'],
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    expect(
      validateMasterPlan(admitted, { nowMs: TEST_NOW_MS }).findings.map(
        (finding) => finding.code,
      ),
    ).toEqual(
      expect.arrayContaining([
        'RECEIPT_BASELINE_ROOT_REQUIRED',
        'ADMISSION_RECEIPT_MISSING',
      ]),
    );
    expect(
      validateMasterPlan(admitted, {
        nowMs: TEST_NOW_MS,
        baselineMode: 'structural-only',
      }).ok,
    ).toBe(true);
  });

  it('rejects portable target collisions across active receipts only', () => {
    const activeCollision = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' },
        { order: 20, id: 'TASK-B', gates: ['G1'], state: 'READY' },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-COLLIDE-01',
          workIds: ['TASK-A'],
          state: '`ONE_SHOT`: active',
        },
        {
          id: 'GR-2026-07-26-COLLIDE-02',
          workIds: ['TASK-B'],
          manifest:
            '`DOCS/MASTER-PLAN.MD@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`',
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    expect(findingCodes(activeCollision)).toEqual(
      expect.arrayContaining([
        'RECEIPT_ACTIVE_TARGET_COLLISION',
        'ADMISSION_RECEIPT_MISSING',
      ]),
    );

    const consumedHistory = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', gates: ['G1'] },
        { order: 20, id: 'TASK-B', gates: ['G1'] },
      ],
      receipts: [
        { id: 'GR-2026-07-26-HISTORY-01', workIds: ['TASK-A'] },
        { id: 'GR-2026-07-26-HISTORY-02', workIds: ['TASK-B'] },
      ],
    });
    expect(
      validateMasterPlan(consumedHistory, {
        nowMs: TEST_NOW_MS,
        baselineMode: 'structural-only',
      }).ok,
    ).toBe(true);
  });

  it('rejects split receipts for one multi-gate Work authority', () => {
    const splitAdmission = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1', 'G2'],
          state: 'READY',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-SPLIT-01',
          workIds: ['TASK-A'],
          gates: ['G1'],
          manifest: '`a.txt@ABSENT`',
          state: '`ONE_SHOT`: active',
        },
        {
          id: 'GR-2026-07-26-SPLIT-02',
          workIds: ['TASK-A'],
          gates: ['G2'],
          manifest: '`b.txt@ABSENT`',
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    expect(findingCodes(splitAdmission)).toContain(
      'ADMISSION_RECEIPT_SPLIT_SCOPE',
    );

    const splitEvidence = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1', 'G2'],
          state: 'VERIFY',
          evidence:
            '`receipt=GR-2026-07-26-SPLIT-03`; `receipt=GR-2026-07-26-SPLIT-04`',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-SPLIT-03',
          workIds: ['TASK-A'],
          gates: ['G1'],
          manifest: '`a.txt@ABSENT`',
        },
        {
          id: 'GR-2026-07-26-SPLIT-04',
          workIds: ['TASK-A'],
          gates: ['G2'],
          manifest: '`b.txt@ABSENT`',
        },
      ],
    });
    expect(findingCodes(splitEvidence)).toContain('EVIDENCE_GATE_COVERAGE');
  });

  it('enforces G7 field completeness and single-use state', () => {
    const incomplete = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-01',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};provider=codex`,
          state: 'ACTIVE',
        },
      ],
    });
    expect(findingCodes(incomplete)).toEqual(
      expect.arrayContaining(['G7_MANIFEST_FIELD', 'G7_SINGLE_USE']),
    );

    const complete = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-01',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`,
          state: '`ONE_SHOT`: consumed@2026-07-26T17:01:00+03:00',
        },
      ],
    });
    expect(
      validateMasterPlan(complete, {
        nowMs: TEST_NOW_MS,
        baselineMode: 'structural-only',
      }).ok,
    ).toBe(true);

    const distinctStage = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-STAGE-01',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`.replace(
            'stage=TASK-A',
            'stage=CANARY-STAGE-A',
          ),
        },
      ],
    });
    expect(
      validateMasterPlan(distinctStage, {
        nowMs: TEST_NOW_MS,
        baselineMode: 'structural-only',
      }).ok,
    ).toBe(true);

    const placeholder = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-02',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`
            .replace('provider=codex', 'provider=unknown')
            .replace('binary=1.0.0', 'binary=unknown')
            .replace('model=gpt-5.6-sol', 'model=none')
            .replace('maxWallClock=30s', 'maxWallClock=forever')
            .replace(
              `budget=100@iso4217-usd-minor#${TEST_BUDGET_POLICY_DIGEST}`,
              'budget=unlimited',
            )
            .concat(';mystery=value'),
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    expect(findingCodes(placeholder)).toEqual(
      expect.arrayContaining(['G7_MANIFEST_VALUE', 'G7_MANIFEST_UNKNOWN_FIELD']),
    );

    const multiWork = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' },
        { order: 20, id: 'TASK-B', gates: ['G7'], state: 'OPEN' },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-03',
          workIds: ['TASK-A', 'TASK-B'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`,
          state: '`ONE_SHOT`: consumed@2026-07-26T17:01:00+03:00',
        },
      ],
    });
    expect(findingCodes(multiWork)).toContain('G7_MANIFEST_VALUE');

    const unbounded = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-04',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`
            .replace('authorizationTtl=15m', 'authorizationTtl=7d')
            .replace(
              'expiresAt=2026-07-26T17:15:00+03:00',
              'expiresAt=2099-07-26T17:00:00+03:00',
            )
            .replace('maxWallClock=30s', 'maxWallClock=604800000.00000000001ms')
            .replace(
              `budget=100@iso4217-usd-minor#${TEST_BUDGET_POLICY_DIGEST}`,
              `budget=9223372036854775808@unit#${TEST_BUDGET_POLICY_DIGEST}`,
            ),
          state: '`ONE_SHOT`: consumed@2026-07-26T17:01:00+03:00',
        },
      ],
    });
    expect(findingCodes(unbounded)).toEqual(
      expect.arrayContaining(['G7_MANIFEST_VALUE', 'G7_TTL']),
    );

    const duplicateAttempt = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-05',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`,
        },
        {
          id: 'GR-2026-07-26-LIVE-06',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`,
        },
      ],
    });
    expect(findingCodes(duplicateAttempt)).toContain('G7_ATTEMPT_DUPLICATE');

    const caseReplay = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-07',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`,
        },
        {
          id: 'GR-2026-07-26-LIVE-08',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`.replace(
            'provider=codex',
            'provider=CODEX',
          ),
        },
      ],
    });
    expect(findingCodes(caseReplay)).toContain('G7_MANIFEST_VALUE');

    const contradictorySegment = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-09',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST};DO NOT CALL PROVIDER`,
        },
      ],
    });
    expect(findingCodes(contradictorySegment)).toContain(
      'G7_MANIFEST_UNKEYED_SEGMENT',
    );

    const hiddenInlineContradiction = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-10',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST};\`provider=claude\``,
        },
      ],
    });
    expect(findingCodes(hiddenInlineContradiction)).toContain(
      'RECEIPT_MANIFEST_FIELD_MALFORMED',
    );

    const nonCanonicalFieldCase = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G7'], state: 'OPEN' }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-13',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`.replace(
            'provider=codex',
            'Provider=codex',
          ),
        },
      ],
    });
    expect(findingCodes(nonCanonicalFieldCase)).toContain(
      'G7_MANIFEST_FIELD_CASE',
    );
  });

  it('requires complete truth/evidence/provenance for DONE', () => {
    const invalid = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'DONE',
          truth: '1/1/0/?/0/-/-',
          evidence: 'proof pending',
        },
      ],
    });
    expect(findingCodes(invalid)).toEqual(
      expect.arrayContaining(['DONE_TRUTH_INCOMPLETE', 'DONE_EVIDENCE_PENDING', 'DONE_PROVENANCE']),
    );

    const valid = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence: '`receipt=GR-2026-07-26-FIXTURE-01`; `proof=exact-slice`',
        },
      ],
      receipts: [{ id: 'GR-2026-07-26-FIXTURE-01', workIds: ['TASK-A'] }],
    });
    expect(validateMasterPlan(valid).ok).toBe(true);

    const authorizationWithoutProof = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence: '`receipt=GR-2026-07-26-FIXTURE-01`',
        },
      ],
      receipts: [{ id: 'GR-2026-07-26-FIXTURE-01', workIds: ['TASK-A'] }],
    });
    expect(findingCodes(authorizationWithoutProof)).toContain('DONE_PROOF');

    const revokedAuthorization = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          gates: ['G1'],
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence: '`receipt=GR-2026-07-26-FIXTURE-02`; `proof=exact-slice`',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-02',
          workIds: ['TASK-A'],
          state: '`ONE_SHOT`: revoked@2026-07-26T17:01:00+03:00',
        },
      ],
    });
    expect(findingCodes(revokedAuthorization)).toContain('DONE_PROVENANCE');

    const allNotApplicable = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DONE',
          truth: '-/-/-/-/-/-/-',
          evidence: '`proof=unit-suite`',
        },
      ],
    });
    expect(findingCodes(allNotApplicable)).toContain('DONE_TRUTH_INCOMPLETE');
  });

  it('requires review-date for DEFERRED and dated owner authority for DISPOSED', () => {
    const invalid = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', state: 'DEFERRED' },
        { order: 20, id: 'TASK-B', state: 'DISPOSED' },
      ],
    });
    expect(findingCodes(invalid)).toEqual(
      expect.arrayContaining(['DEFERRED_AUTHORITY', 'DISPOSED_AUTHORITY']),
    );

    const valid = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DEFERRED',
          evidence: 'reason=capacity-window;review-date=2099-08-01',
        },
        {
          order: 20,
          id: 'TASK-B',
          state: 'DISPOSED',
          gates: ['G2'],
          evidence:
            'owner-approved=not-a-product-outcome;decision-date=2026-07-26;`receipt=GR-2026-07-26-DISPOSE-01`',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-DISPOSE-01',
          workIds: ['TASK-B'],
          gates: ['G2'],
        },
      ],
    });
    expect(validateMasterPlan(valid).ok).toBe(true);

    const contradictory = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DEFERRED',
          evidence:
            'reason=capacity-window;review-date=2099-08-01;decision=REJECTED;THIS IS NOT APPROVED;`decision=REJECTED`',
        },
        {
          order: 20,
          id: 'TASK-B',
          state: 'DISPOSED',
          gates: ['G2'],
          evidence:
            'owner-approved=retired;decision-date=2026-07-26;decision=REJECTED;OWNER DENIED;`receipt=GR-2026-07-26-DISPOSE-02`',
        },
      ],
      receipts: [
        {
          id: 'GR-2026-07-26-DISPOSE-02',
          workIds: ['TASK-B'],
          gates: ['G2'],
        },
      ],
    });
    expect(findingCodes(contradictory)).toEqual(
      expect.arrayContaining(['DEFERRED_AUTHORITY', 'DISPOSED_AUTHORITY']),
    );

    const nonCanonicalDeferredCase = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DEFERRED',
          evidence: 'Reason=capacity-window;review-date=2099-08-01',
        },
      ],
    });
    expect(findingCodes(nonCanonicalDeferredCase)).toContain(
      'DEFERRED_AUTHORITY',
    );

    const falseClosure = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DEFERRED',
          evidence: 'reason=;review-date=2026-02-31',
        },
        {
          order: 20,
          id: 'TASK-B',
          gates: ['G2'],
          state: 'DISPOSED',
          evidence: 'owner-approved=;decision-date=9999-99-99',
        },
      ],
    });
    expect(findingCodes(falseClosure)).toEqual(
      expect.arrayContaining(['DEFERRED_AUTHORITY', 'DISPOSED_AUTHORITY']),
    );
  });
});

describe('deterministic active projections', () => {
  it('excludes terminal rows and carries dependency/child/blocker relationships', () => {
    const source = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence: '`proof=exact-slice`',
        },
        {
          order: 20,
          id: 'TASK-B',
          state: 'BLOCKED',
          dependsOn: ['TASK-A'],
        },
        {
          order: 30,
          id: 'TASK-C',
          parent: 'TASK-B',
        },
      ],
      blockers: [{ code: 'OWNER_DECISION_REQUIRED', workIds: ['TASK-B'] }],
    });
    const validation = validateMasterPlan(source);
    expect(validation.ok).toBe(true);
    const model = buildActiveModel(validation);
    expect(model.workItems.map((item) => item.id)).toEqual(['TASK-B', 'TASK-C']);
    expect(model.workItems[0]).toMatchObject({
      blockerCode: 'OWNER_DECISION_REQUIRED',
      children: ['TASK-C'],
      closureBlockedBy: ['TASK-C'],
    });
    expect(model.summary).toMatchObject({ total: 3, active: 2, terminal: 1 });
    expect(
      model.identityRegistry.map(({ order, id }) => ({ order, id })),
    ).toEqual([
      { order: 10, id: 'TASK-A' },
      { order: 20, id: 'TASK-B' },
      { order: 30, id: 'TASK-C' },
    ]);
  });

  it('renders byte-stable JSON and Markdown with a normalized source digest', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const validation = validateMasterPlan(source);
    const first = generateActiveViews(validation);
    const second = generateActiveViews(validateMasterPlan(source));
    expect(first).toEqual(second);
    expect(first[ACTIVE_JSON_RELATIVE_PATH]).toContain(normalizedSha256(source));
    expect(first[ACTIVE_MARKDOWN_RELATIVE_PATH]).toContain('# Deckent Active Work View');
    expect(first[ACTIVE_MARKDOWN_RELATIVE_PATH].endsWith('\n')).toBe(true);
  });
});

describe('CLI contract', () => {
  it('is fail-closed across lint, release, publish, and projection entry points', () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };
    const scripts = pkg.scripts ?? {};

    expect(scripts['lint:master-plan']).toBe(
      'node scripts/lint-master-plan.mjs --check',
    );
    expect(scripts['docs:master-plan']).toBe(
      'node scripts/lint-master-plan.mjs --write',
    );
    // Fail-closed means "present in the && chain", not "last in it": every link in
    // an && chain gates the rest. The trailing-\$ anchor was incidental (the gate
    // happened to be last until build-design-tokens was appended) and matched neither
    // the intent nor the sibling assertions below, which use (?: && |$).
    expect(scripts['lint:gates']).toMatch(
      /(?:^| && )node scripts\/lint-master-plan\.mjs --check(?: &&|$)/,
    );
    expect(scripts['release']).toMatch(/^npm run lint:master-plan(?: && |$)/);
    expect(scripts['prepublishOnly']).toMatch(
      /^npm run lint:master-plan(?: && |$)/,
    );
  });

  it('parses check/write/json/root and rejects conflicting or unknown args', () => {
    const portableRoot = resolve(tmpdir(), 'deckent-master-plan-args');
    expect(parseArgs(['--json']).mode).toBe('check');
    expect(parseArgs(['--write', '--root', portableRoot])).toMatchObject({
      mode: 'write',
      root: portableRoot,
    });
    expect(() => parseArgs(['--check', '--write'])).toThrow(/mutually exclusive/);
    expect(() => parseArgs(['--bootstrap-identities'])).toThrow(/unknown argument/);
    expect(() => parseArgs(['--unknown'])).toThrow(/unknown argument/);
  });

  it('fails check on missing projections, writes them, then passes check', () => {
    const root = makeScratchPlan(planFixture({ rows: [{ order: 10, id: 'TASK-A' }] }));
    const stdout = memorySink();
    const stderr = memorySink();
    expect(main(['--check', '--root', root], { stdout: stdout.stream, stderr: stderr.stream })).toBe(
      1,
    );
    expect(stderr.text()).toContain('IDENTITY_REGISTRY_MISSING');

    bootstrapViews(root, readFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), 'utf8'));
    expect(existsSync(join(root, ACTIVE_MARKDOWN_RELATIVE_PATH))).toBe(true);
    expect(existsSync(join(root, ACTIVE_JSON_RELATIVE_PATH))).toBe(true);

    const finalOut = memorySink();
    expect(main(['--check', '--root', root], { stdout: finalOut.stream })).toBe(0);
    expect(finalOut.text()).toContain('[master-plan] OK');

    for (const target of [ACTIVE_MARKDOWN_RELATIVE_PATH, ACTIVE_JSON_RELATIVE_PATH]) {
      const path = join(root, target);
      writeFileSync(path, readFileSync(path, 'utf8').replace(/\n/g, '\r\n'), 'utf8');
    }
    const crlfOut = memorySink();
    expect(main(['--check', '--root', root], { stdout: crlfOut.stream })).toBe(0);
    expect(crlfOut.text()).toContain('[master-plan] OK');
  });

  it('refuses stale-source CAS writes', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const root = makeScratchPlan(source);
    bootstrapViews(root, source);
    const priorRegistry = readFileSync(
      join(root, ACTIVE_JSON_RELATIVE_PATH),
      'utf8',
    );
    const stderr = memorySink();
    expect(
      main(['--write', '--root', root], {
        stderr: stderr.stream,
        beforeProjectionWrite: () => {
          writeFileSync(
            join(root, MASTER_PLAN_RELATIVE_PATH),
            planFixture({
              rows: [
                {
                  order: 10,
                  id: 'TASK-A',
                  evidence: 'Concurrent source change',
                },
              ],
            }),
            'utf8',
          );
        },
      }),
    ).toBe(2);
    expect(stderr.text()).toContain('changed before locked generation');
    expect(readFileSync(join(root, ACTIVE_JSON_RELATIVE_PATH), 'utf8')).toBe(
      priorRegistry,
    );
  });

  it('does not expose the projection write capability as a module API', async () => {
    const module = await import('../../scripts/lint-master-plan.mjs');
    expect('writeActiveViews' in module).toBe(false);
  });

  it('refuses a competing projection writer lock without changing outputs', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const root = makeScratchPlan(source);
    bootstrapViews(root, source);
    const priorRegistry = readFileSync(
      join(root, ACTIVE_JSON_RELATIVE_PATH),
      'utf8',
    );
    const lockPath = join(root, 'docs', 'generated', '.master-plan-write.lock');
    mkdirSync(dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, '{"nonce":"other-owner"}\n', 'utf8');

    const stderr = memorySink();
    expect(main(['--write', '--root', root], { stderr: stderr.stream })).toBe(2);
    expect(stderr.text()).toContain('write lock already exists');
    expect(readFileSync(lockPath, 'utf8')).toBe('{"nonce":"other-owner"}\n');
    expect(readFileSync(join(root, ACTIVE_JSON_RELATIVE_PATH), 'utf8')).toBe(
      priorRegistry,
    );
  });

  it('rechecks exact prior authority under lock before writing', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const root = makeScratchPlan(source);
    bootstrapViews(root, source);
    const registryPath = join(root, ACTIVE_JSON_RELATIVE_PATH);
    const markdownPath = join(root, ACTIVE_MARKDOWN_RELATIVE_PATH);
    const originalMarkdown = readFileSync(markdownPath, 'utf8');
    const stderr = memorySink();
    expect(
      main(['--write', '--root', root], {
        stderr: stderr.stream,
        beforeProjectionWrite: () => {
          writeFileSync(registryPath, '{not-json\n', 'utf8');
        },
      }),
    ).toBe(2);
    expect(stderr.text()).toMatch(/prior authority registry changed|failed continuity/);
    expect(readFileSync(registryPath, 'utf8')).toBe('{not-json\n');
    expect(readFileSync(markdownPath, 'utf8')).toBe(originalMarkdown);
  });

  it('ratchets published Work IDs and Orders across regeneration', () => {
    const source = planFixture({
      rows: [
        { order: 10, id: 'TASK-A' },
        { order: 20, id: 'TASK-B' },
      ],
    });
    const root = makeScratchPlan(source);
    bootstrapViews(root, source);

    const deleted = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), deleted, 'utf8');
    const stderr = memorySink();
    expect(main(['--write', '--root', root], { stderr: stderr.stream })).toBe(1);
    expect(stderr.text()).toContain('IDENTITY_DELETION');
    expect(readFileSync(join(root, ACTIVE_JSON_RELATIVE_PATH), 'utf8')).toContain(
      '"id": "TASK-B"',
    );

    const reordered = planFixture({
      rows: [
        { order: 10, id: 'TASK-A' },
        { order: 30, id: 'TASK-B' },
      ],
    });
    writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), reordered, 'utf8');
    const orderError = memorySink();
    expect(main(['--check', '--root', root], { stderr: orderError.stream })).toBe(1);
    expect(orderError.text()).toContain('IDENTITY_ORDER_DRIFT');
  });

  it('ratchets terminal closures and immutable receipt authority', () => {
    const receiptSource = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
        },
      ],
    });
    const receiptRoot = makeScratchPlan(receiptSource);
    bootstrapViews(receiptRoot, receiptSource);
    writeFileSync(
      join(receiptRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({ rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }] }),
      'utf8',
    );
    const receiptError = memorySink();
    expect(main(['--write', '--root', receiptRoot], { stderr: receiptError.stream })).toBe(1);
    expect(receiptError.text()).toContain('RECEIPT_DELETION');

    const terminalSource = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence: '`proof=terminal-suite`',
        },
      ],
    });
    const terminalRoot = makeScratchPlan(terminalSource);
    bootstrapViews(terminalRoot, terminalSource);
    writeFileSync(
      join(terminalRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({ rows: [{ order: 10, id: 'TASK-A', state: 'OPEN' }] }),
      'utf8',
    );
    const terminalError = memorySink();
    expect(main(['--check', '--root', terminalRoot], { stderr: terminalError.stream })).toBe(1);
    expect(terminalError.text()).toContain('STATE_TRANSITION_INVALID');
    expect(terminalError.text()).toContain('TERMINAL_CLOSURE_DRIFT');
  });

  it('ratchets definitions, terminal proof, receipt authority and lifecycle', () => {
    const definitionSource = planFixture({
      rows: [{ order: 10, id: 'TASK-A' }],
    });
    const definitionRoot = makeScratchPlan(definitionSource);
    bootstrapViews(definitionRoot, definitionSource);
    writeFileSync(
      join(definitionRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({ rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }] }),
      'utf8',
    );
    const definitionError = memorySink();
    expect(
      main(['--check', '--root', definitionRoot], {
        stderr: definitionError.stream,
      }),
    ).toBe(1);
    expect(definitionError.text()).toContain('IDENTITY_DEFINITION_DRIFT');

    const terminalSource = planFixture({
      rows: [
        {
          order: 10,
          id: 'TASK-A',
          state: 'DONE',
          truth: '1/1/1/1/1/-/-',
          evidence: '`proof=terminal-one`',
        },
      ],
    });
    const terminalRoot = makeScratchPlan(terminalSource);
    bootstrapViews(terminalRoot, terminalSource);
    writeFileSync(
      join(terminalRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          {
            order: 10,
            id: 'TASK-A',
            state: 'DONE',
            truth: '1/1/1/1/1/-/-',
            evidence: '`proof=terminal-two`',
          },
        ],
      }),
      'utf8',
    );
    const terminalError = memorySink();
    expect(
      main(['--check', '--root', terminalRoot], {
        stderr: terminalError.stream,
      }),
    ).toBe(1);
    expect(terminalError.text()).toContain('TERMINAL_CLOSURE_DRIFT');

    const terminalPriorityRoot = makeScratchPlan(terminalSource);
    bootstrapViews(terminalPriorityRoot, terminalSource);
    writeFileSync(
      join(terminalPriorityRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          {
            order: 10,
            id: 'TASK-A',
            priority: 'P2',
            state: 'DONE',
            truth: '1/1/1/1/1/-/-',
            evidence: '`proof=terminal-one`',
          },
        ],
      }),
      'utf8',
    );
    const terminalPriorityError = memorySink();
    expect(
      main(['--check', '--root', terminalPriorityRoot], {
        stderr: terminalPriorityError.stream,
      }),
    ).toBe(1);
    expect(terminalPriorityError.text()).toContain(
      'TERMINAL_CLOSURE_DRIFT',
    );

    const receiptSource = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-AUTHORITY-01',
          workIds: ['TASK-A'],
        },
      ],
    });
    const receiptRoot = makeScratchPlan(receiptSource);
    bootstrapViews(receiptRoot, receiptSource);
    const rewrittenReceipt = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-AUTHORITY-01',
          workIds: ['TASK-A'],
          ownerDecision:
            'owner=Alperen;decision=APPROVED;scope=rewritten-scope;exclusions=everything-else',
        },
      ],
    });
    writeFileSync(
      join(receiptRoot, MASTER_PLAN_RELATIVE_PATH),
      rewrittenReceipt,
      'utf8',
    );
    const receiptError = memorySink();
    expect(
      main(['--check', '--root', receiptRoot], {
        stderr: receiptError.stream,
      }),
    ).toBe(1);
    expect(receiptError.text()).toContain('RECEIPT_AUTHORITY_DRIFT');

    const lifecycleRoot = makeScratchPlan(receiptSource);
    bootstrapViews(lifecycleRoot, receiptSource);
    writeFileSync(
      join(lifecycleRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [{ order: 10, id: 'TASK-A', gates: ['G1'] }],
        receipts: [
          {
            id: 'GR-2026-07-26-AUTHORITY-01',
            workIds: ['TASK-A'],
            state: '`ONE_SHOT`: revoked@2026-07-26T17:02:00+03:00',
          },
        ],
      }),
      'utf8',
    );
    const lifecycleError = memorySink();
    expect(
      main(['--check', '--root', lifecycleRoot], {
        stderr: lifecycleError.stream,
      }),
    ).toBe(1);
    expect(lifecycleError.text()).toContain('RECEIPT_LIFECYCLE_REPLAY');
  });

  it('rejects cross-regeneration G7 attempt identity replay', () => {
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1', 'G7'] }],
      receipts: [
        {
          id: 'GR-2026-07-26-LIVE-11',
          workIds: ['TASK-A'],
          gates: ['G7'],
          manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`,
        },
      ],
    });
    const root = makeScratchPlan(source);
    bootstrapViews(root, source);
    writeFileSync(
      join(root, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [{ order: 10, id: 'TASK-A', gates: ['G1', 'G7'] }],
        receipts: [
          {
            id: 'GR-2026-07-26-LIVE-11',
            workIds: ['TASK-A'],
            gates: ['G1'],
          },
          {
            id: 'GR-2026-07-26-LIVE-12',
            workIds: ['TASK-A'],
            gates: ['G7'],
            manifest: `${G1_MANIFEST};${COMPLETE_G7_MANIFEST}`,
          },
        ],
      }),
      'utf8',
    );
    const stderr = memorySink();
    expect(main(['--check', '--root', root], { stderr: stderr.stream })).toBe(1);
    expect(stderr.text()).toContain('RECEIPT_AUTHORITY_DRIFT');
    expect(stderr.text()).toContain('G7_ATTEMPT_REPLAY');
  });

  it('keeps the receipt registry append-only and order-stable', () => {
    const first = {
      id: 'GR-2026-07-26-ORDER-01',
      workIds: ['TASK-A'],
      gates: ['G1'],
    };
    const second = {
      id: 'GR-2026-07-26-ORDER-02',
      workIds: ['TASK-B'],
      gates: ['G1'],
    };
    const source = planFixture({
      rows: [
        { order: 10, id: 'TASK-A', gates: ['G1'] },
        { order: 20, id: 'TASK-B', gates: ['G1'] },
      ],
      receipts: [first, second],
    });
    const root = makeScratchPlan(source);
    bootstrapViews(root, source);
    writeFileSync(
      join(root, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          { order: 10, id: 'TASK-A', gates: ['G1'] },
          { order: 20, id: 'TASK-B', gates: ['G1'] },
        ],
        receipts: [second, first],
      }),
      'utf8',
    );
    const stderr = memorySink();
    expect(main(['--check', '--root', root], { stderr: stderr.stream })).toBe(1);
    expect(stderr.text()).toContain('RECEIPT_ORDER_DRIFT');
  });

  it('fails closed without overwriting corrupt, legacy or inconsistent registries', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const cases: Array<{
      mutate: (registry: string) => string;
      expected: string;
    }> = [
      {
        mutate: () => '{not-json\n',
        expected: 'IDENTITY_REGISTRY_INVALID',
      },
      {
        mutate: (registry) =>
          `${JSON.stringify(
            { ...JSON.parse(registry), schemaVersion: 2 },
            null,
            2,
          )}\n`,
        expected: 'IDENTITY_REGISTRY_MIGRATION_REQUIRED',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.summary.total += 1;
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INVALID',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.generatedFrom = 'docs/forged.md';
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INTEGRITY',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.sourceDigest.value = 'f'.repeat(64);
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INTEGRITY',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.summary.byPriority.P0 -= 1;
          value.summary.byPriority.P1 += 1;
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INTEGRITY',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.workItems[0].outcome = 'Forged outcome';
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INTEGRITY',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.workItems = {};
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INVALID',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.identityRegistry = [null];
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INVALID',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.receiptRegistry = [null];
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'RECEIPT_REGISTRY_INVALID',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.identityRegistry[0].updated = ['2026-07-26'];
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INVALID',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.workItems[0].updated = ['2026-07-26'];
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'IDENTITY_REGISTRY_INVALID',
      },
      {
        mutate: (registry) => {
          const value = JSON.parse(registry);
          value.receiptRegistry = [
            {
              id: 'GR-2026-07-26-CORRUPT-01',
              authorityDigest: 'a'.repeat(64),
              lifecycle: {
                mode: 'ONE_SHOT',
                status: 'consumed',
                transitionAt: '2026-07-26T17:01:00+03:00',
              },
              g7AttemptIdentity: {
                provider: ['codex'],
                tenant: 'tenant-a',
                project: 'project-a',
                task: 'TASK-A',
                attempt: 'attempt-a',
                stage: 'TASK-A',
              },
            },
          ];
          return `${JSON.stringify(value, null, 2)}\n`;
        },
        expected: 'RECEIPT_REGISTRY_INVALID',
      },
    ];
    for (const testCase of cases) {
      const root = makeScratchPlan(source);
      bootstrapViews(root, source);
      const registryPath = join(root, ACTIVE_JSON_RELATIVE_PATH);
      const markdownPath = join(root, ACTIVE_MARKDOWN_RELATIVE_PATH);
      const originalRegistry = readFileSync(registryPath, 'utf8');
      const originalMarkdown = readFileSync(markdownPath, 'utf8');
      const corrupted = testCase.mutate(originalRegistry);
      writeFileSync(registryPath, corrupted, 'utf8');
      const stderr = memorySink();
      expect(main(['--write', '--root', root], { stderr: stderr.stream })).toBe(1);
      expect(stderr.text()).toContain(testCase.expected);
      expect(readFileSync(registryPath, 'utf8')).toBe(corrupted);
      expect(readFileSync(markdownPath, 'utf8')).toBe(originalMarkdown);
    }
  });

  it('ratchets Updated chronology while allowing reviewed same-day progress', () => {
    const priorDaySource = planFixture({
      rows: [{ order: 10, id: 'TASK-A', updated: '2026-07-25' }],
    });

    const rollbackRoot = makeScratchPlan(priorDaySource);
    bootstrapViews(rollbackRoot, priorDaySource);
    writeFileSync(
      join(rollbackRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [{ order: 10, id: 'TASK-A', updated: '2026-07-24' }],
      }),
      'utf8',
    );
    const rollbackError = memorySink();
    expect(
      main(['--check', '--root', rollbackRoot], {
        stderr: rollbackError.stream,
      }),
    ).toBe(1);
    expect(rollbackError.text()).toContain('WORK_UPDATED_ROLLBACK');

    const staleRoot = makeScratchPlan(priorDaySource);
    bootstrapViews(staleRoot, priorDaySource);
    writeFileSync(
      join(staleRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          {
            order: 10,
            id: 'TASK-A',
            evidence: 'Changed historical evidence',
            updated: '2026-07-25',
          },
        ],
      }),
      'utf8',
    );
    const staleError = memorySink();
    expect(
      main(['--check', '--root', staleRoot], {
        stderr: staleError.stream,
      }),
    ).toBe(1);
    expect(staleError.text()).toContain('WORK_UPDATED_STALE');

    const blockerSource = planFixture({
      rows: [
        { order: 10, id: 'TASK-B', updated: '2026-07-25' },
        {
          order: 20,
          id: 'TASK-A',
          state: 'BLOCKED',
          dependsOn: ['TASK-B'],
          updated: '2026-07-25',
        },
      ],
      blockers: [
        {
          code: 'DEPENDENCY_UNSATISFIED',
          workIds: ['TASK-A'],
          remedy: '`TASK-B`',
        },
      ],
    });
    const blockerRoot = makeScratchPlan(blockerSource);
    bootstrapViews(blockerRoot, blockerSource);
    writeFileSync(
      join(blockerRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          { order: 10, id: 'TASK-B', updated: '2026-07-25' },
          {
            order: 20,
            id: 'TASK-A',
            state: 'BLOCKED',
            dependsOn: ['TASK-B'],
            updated: '2026-07-25',
          },
        ],
        blockers: [
          {
            code: 'DEPENDENCY_REVIEW_REQUIRED',
            workIds: ['TASK-A'],
            remedy: '`TASK-B`',
          },
        ],
      }),
      'utf8',
    );
    const blockerError = memorySink();
    expect(
      main(['--check', '--root', blockerRoot], {
        stderr: blockerError.stream,
      }),
    ).toBe(1);
    expect(blockerError.text()).toContain('WORK_UPDATED_STALE');

    const priorityRoot = makeScratchPlan(priorDaySource);
    bootstrapViews(priorityRoot, priorDaySource);
    writeFileSync(
      join(priorityRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          {
            order: 10,
            id: 'TASK-A',
            priority: 'P2',
            updated: '2026-07-25',
          },
        ],
      }),
      'utf8',
    );
    const priorityError = memorySink();
    expect(
      main(['--check', '--root', priorityRoot], {
        stderr: priorityError.stream,
      }),
    ).toBe(1);
    expect(priorityError.text()).toContain('WORK_UPDATED_STALE');

    const sameDaySource = planFixture({
      rows: [{ order: 10, id: 'TASK-A', updated: '2026-07-26' }],
    });
    const sameDayRoot = makeScratchPlan(sameDaySource);
    bootstrapViews(sameDayRoot, sameDaySource);
    writeFileSync(
      join(sameDayRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          {
            order: 10,
            id: 'TASK-A',
            evidence: 'Changed same-day evidence',
            updated: '2026-07-26',
          },
        ],
      }),
      'utf8',
    );
    const sameDayOut = memorySink();
    expect(
      main(['--write', '--root', sameDayRoot], {
        stdout: sameDayOut.stream,
      }),
    ).toBe(0);

    const forwardRoot = makeScratchPlan(priorDaySource);
    bootstrapViews(forwardRoot, priorDaySource);
    writeFileSync(
      join(forwardRoot, MASTER_PLAN_RELATIVE_PATH),
      planFixture({
        rows: [
          {
            order: 10,
            id: 'TASK-A',
            evidence: 'Changed forward evidence',
            updated: '2026-07-26',
          },
        ],
      }),
      'utf8',
    );
    const forwardOut = memorySink();
    expect(
      main(['--write', '--root', forwardRoot], {
        stdout: forwardOut.stream,
      }),
    ).toBe(0);
  });

  it('never overwrites an unsafe or unreadable prior authority registry', () => {
    const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
    const root = makeScratchPlan(source);
    bootstrapViews(root, source);
    const registry = join(root, ACTIVE_JSON_RELATIVE_PATH);
    rmSync(registry);
    mkdirSync(registry);
    const stderr = memorySink();
    expect(main(['--write', '--root', root], { stderr: stderr.stream })).toBe(2);
    expect(stderr.text()).toContain('IDENTITY_REGISTRY_UNREADABLE');
    expect(readFileSync(join(root, ACTIVE_MARKDOWN_RELATIVE_PATH), 'utf8')).toContain(
      '# Deckent Active Work View',
    );
  });

  it('checks every active receipt baseline against the physical repository root', () => {
    const packageBytes = '{"name":"fixture"}\n';
    const packageDigest = createHash('sha256').update(packageBytes).digest('hex');
    const source = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-01',
          workIds: ['TASK-A'],
          manifest: `\`package.json@${packageDigest}\``,
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    const root = makeScratchPlan(source);
    writeFileSync(join(root, 'package.json'), packageBytes, 'utf8');
    const unauthenticated = validateMasterPlan(source, {
      nowMs: TEST_NOW_MS,
      root,
    });
    // Owner decision 2026-08-03 (option B): an active receipt whose manifest does not pin
    // the ledger itself is admitted under the documented reviewed-Git-parent trust anchor
    // (MASTER §3.3). The former blanket EXTERNAL_GRANT_REQUIRED made READY unreachable by
    // construction and contradicted that documented anchor.
    expect(unauthenticated.findings.map((finding) => finding.code)).not.toContain(
      'EXTERNAL_GRANT_REQUIRED',
    );
    expect(unauthenticated.findings.map((finding) => finding.code)).not.toContain(
      'ADMISSION_RECEIPT_MISSING',
    );
    expect(
      validateMasterPlan(source, {
        nowMs: TEST_NOW_MS,
        root,
        baselineMode: 'structural-only',
      }).ok,
    ).toBe(true);

    writeFileSync(join(root, 'package.json'), '{"name":"drift"}\n', 'utf8');
    const drift = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root });
    expect(drift.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['RECEIPT_BASELINE_DRIFT', 'ADMISSION_RECEIPT_MISSING']),
    );

    const absentSource = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-02',
          workIds: ['TASK-A'],
          manifest: '`fresh-output.txt@ABSENT`',
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    const absentRoot = makeScratchPlan(absentSource);
    // An ABSENT baseline that is genuinely absent is a satisfied precondition, so the
    // receipt stays active and admits its work item.
    expect(
      validateMasterPlan(absentSource, {
        nowMs: TEST_NOW_MS,
        root: absentRoot,
      }).findings.map((finding) => finding.code),
    ).toEqual([]);

    // The narrow gate that replaced the blanket rejection: an active receipt may not pin
    // the ledger that carries it, because writing the receipt changes those very bytes.
    const selfReferentialSource = planFixture({
      rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
      receipts: [
        {
          id: 'GR-2026-07-26-FIXTURE-03',
          workIds: ['TASK-A'],
          manifest: '`docs/MASTER-PLAN.md@ABSENT`',
          state: '`ONE_SHOT`: active',
        },
      ],
    });
    const selfReferentialRoot = makeScratchPlan(selfReferentialSource);
    expect(
      validateMasterPlan(selfReferentialSource, {
        nowMs: TEST_NOW_MS,
        root: selfReferentialRoot,
      }).findings.map((finding) => finding.code),
    ).toEqual(
      expect.arrayContaining([
        'RECEIPT_SELF_REFERENTIAL',
        'ADMISSION_RECEIPT_MISSING',
      ]),
    );
  });

  // These two were still gated on `process.platform === 'win32'` — the exact blanket GUESS the
  // capability probe at the top of this file exists to replace, left behind when the real-CLI
  // case was converted. The first Windows matrix run disproved the guess directly: the real-CLI
  // symlink case PASSED on windows-latest, so that runner can create symlinks, and these two
  // were being skipped for no reason at all. Two unexplained skips on the platform we are trying
  // to gather evidence for is precisely the silent coverage hole Law 2 forbids, so they now ask
  // the same measured question every other symlink case asks.
  it.skipIf(!symlinkCapability.supported)(
    'refuses a generated target symlink instead of writing through it',
    () => {
      const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
      const root = makeScratchPlan(source);
      const outside = mkdtempSync(join(tmpdir(), 'deckent-master-plan-outside-'));
      scratchRoots.push(outside);
      bootstrapViews(root, source);
      rmSync(join(root, ACTIVE_MARKDOWN_RELATIVE_PATH));
      symlinkSync(join(outside, 'escaped.md'), join(root, ACTIVE_MARKDOWN_RELATIVE_PATH));
      const stderr = memorySink();
      expect(main(['--write', '--root', root], { stderr: stderr.stream })).toBe(2);
      expect(stderr.text()).toContain('non-regular generated target');
      expect(existsSync(join(outside, 'escaped.md'))).toBe(false);
    },
  );

  it.skipIf(!symlinkCapability.supported)(
    'returns structured scan exit 2 for source and projection symlinks',
    () => {
      const source = planFixture({ rows: [{ order: 10, id: 'TASK-A' }] });
      const sourceRoot = makeScratchPlan(source);
      const outside = mkdtempSync(join(tmpdir(), 'deckent-master-plan-outside-'));
      scratchRoots.push(outside);
      const outsideSource = join(outside, 'MASTER-PLAN.md');
      writeFileSync(outsideSource, source, 'utf8');
      rmSync(join(sourceRoot, MASTER_PLAN_RELATIVE_PATH));
      symlinkSync(outsideSource, join(sourceRoot, MASTER_PLAN_RELATIVE_PATH));
      const sourceOut = memorySink();
      expect(
        main(['--check', '--json', '--root', sourceRoot], {
          stdout: sourceOut.stream,
        }),
      ).toBe(2);
      expect(JSON.parse(sourceOut.text()).error).toMatch(/symlink|non-regular/i);

      const projectionRoot = makeScratchPlan(source);
      bootstrapViews(projectionRoot, source);
      const projection = join(projectionRoot, ACTIVE_MARKDOWN_RELATIVE_PATH);
      const outsideProjection = join(outside, 'active.md');
      writeFileSync(outsideProjection, readFileSync(projection, 'utf8'), 'utf8');
      rmSync(projection);
      symlinkSync(outsideProjection, projection);
      const projectionOut = memorySink();
      expect(
        main(['--check', '--json', '--root', projectionRoot], {
          stdout: projectionOut.stream,
        }),
      ).toBe(2);
      expect(
        JSON.parse(projectionOut.text()).projections,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ACTIVE_MARKDOWN_RELATIVE_PATH,
            state: 'unsafe-or-unreadable',
          }),
        ]),
      );
    },
  );

  // ─── MASTER-CLI-SYMLINK-FLAKE-001 — entrypoint identity determinism ─────────
  //
  // The old guard swallowed every realpath error into "not the entrypoint", so a symlinked or
  // transiently unreadable entry made the CLI exit 0 with no output — indistinguishable from
  // success, and dependent on whether realpath happened to work rather than on the contract.
  // These cases pin the decision itself; they need no child process, so they are hermetic and
  // cannot flake on process/filesystem timing.
  describe('entrypoint identity', () => {
    // Every fixture path goes through `resolve()` so it is native-absolute on the host running
    // it. Bare POSIX literals are NOT platform-neutral: on Windows the function `resolve()`s the
    // entry argument but the literal `modulePath` stayed a POSIX string, so path normalization —
    // not the contract — decided the outcome. That produced two visible failures and, worse, one
    // SILENT one: 'does not run for an unrelated entry' passed on Windows for the wrong reason,
    // returning false from path mangling rather than from the paths genuinely differing. A test
    // that passes for the wrong reason is not testing anything. `resolve()` is idempotent on
    // POSIX, so the Linux/macOS assertions are byte-identical to before.
    const MODULE = resolve('/repo/scripts/lint-master-plan.mjs');
    const LINKED_ENTRY = resolve('/tmp/link.mjs');
    const UNRELATED_ENTRY = resolve('/repo/other.mjs');

    it('stays silent when imported as a library (no entry argument)', () => {
      expect(resolveEntrypointIdentity(MODULE, undefined)).toEqual({
        isMain: false,
        basis: 'no-entry',
      });
    });

    it('runs when a symlinked entry resolves to this module', () => {
      const realpath = (candidate: string) =>
        candidate === LINKED_ENTRY ? MODULE : candidate;
      expect(resolveEntrypointIdentity(MODULE, LINKED_ENTRY, realpath)).toEqual({
        isMain: true,
        basis: 'canonical',
      });
    });

    it('does not run for an unrelated entry', () => {
      const realpath = (candidate: string) => candidate;
      expect(resolveEntrypointIdentity(MODULE, UNRELATED_ENTRY, realpath)).toEqual({
        isMain: false,
        basis: 'canonical',
      });
    });

    it('falls back lexically instead of swallowing a realpath failure', () => {
      const failing = () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      };
      // Same path: the invocation IS the entrypoint and must still run rather than
      // silently exit 0 — this is the exact regression the flake came from.
      expect(resolveEntrypointIdentity(MODULE, MODULE, failing)).toEqual({
        isMain: true,
        basis: 'lexical-fallback',
      });
      // Different path: still a decision, still reported as degraded, never swallowed.
      expect(resolveEntrypointIdentity(MODULE, UNRELATED_ENTRY, failing)).toEqual({
        isMain: false,
        basis: 'lexical-fallback',
      });
    });

    it('reports degraded resolution when only one side resolves', () => {
      const partial = (candidate: string) => {
        if (candidate === MODULE) throw new Error('EACCES');
        return candidate;
      };
      expect(resolveEntrypointIdentity(MODULE, MODULE, partial).basis).toBe(
        'lexical-fallback',
      );
    });
  });

  it('declares this host\'s symlink capability instead of assuming it', () => {
    // Runs on EVERY platform, including hosts that cannot create symlinks. Law 2 forbids
    // silently generalising one platform's result to another: the capability is measured and
    // reported here, so a matrix leg that skips the real-CLI case still leaves a visible,
    // typed record of WHY. The entrypoint contract itself is pure and must hold everywhere,
    // capability or not — that is what makes the skip safe rather than a coverage hole.
    expect(typeof symlinkCapability.supported).toBe('boolean');
    expect(symlinkCapability.reason).toMatch(/symlink creation (permitted|refused)/);
    const selfEntry = resolve('/m.mjs');
    expect(resolveEntrypointIdentity(selfEntry, selfEntry, (candidate) => candidate)).toEqual({
      isMain: true,
      basis: 'canonical',
    });
  });

  it.skipIf(!symlinkCapability.supported)(
    'executes the real CLI contract when invoked through a symlink',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'deckent-master-plan-entry-'));
      scratchRoots.push(root);
      const linkedEntry = join(root, 'lint-master-plan-link.mjs');
      symlinkSync(join(REPO_ROOT, 'scripts', 'lint-master-plan.mjs'), linkedEntry);
      const { stdout } = await execFileAsync(process.execPath, [linkedEntry, '--help'], {
        cwd: root,
      });
      expect(stdout).toContain('canonical MASTER validator');
      expect(stdout).toContain('Usage:');
    },
  );

  it('reports malformed canonical input as JSON without creating projections', () => {
    const root = makeScratchPlan(
      planFixture({ rows: [{ order: 10, id: 'TASK-A', state: 'MAGIC' }] }),
    );
    const stdout = memorySink();
    expect(main(['--check', '--json', '--root', root], { stdout: stdout.stream })).toBe(1);
    const result = JSON.parse(stdout.text()) as {
      ok: boolean;
      findings: Array<{ code: string }>;
    };
    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.code)).toContain('STATE_ENUM');
    expect(existsSync(join(root, ACTIVE_JSON_RELATIVE_PATH))).toBe(false);
  });

  it('returns scan-error exit 2 for a missing MASTER source', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-master-plan-missing-'));
    scratchRoots.push(root);
    const stderr = memorySink();
    expect(main(['--check', '--root', root], { stderr: stderr.stream })).toBe(2);
    expect(stderr.text()).toContain('scan error');
  });
});

// ─── TRUST-ANCHOR-001 — reviewed-parent baseline verification ─────────────────
//
// Born from the 2026-08-03 cross-provider xverify (codex-analysis/
// xverify-wp0-2026-08-03.md, axis E): the validator hashed current working-tree
// bytes, so "change the source and mint a matching active receipt in the same
// patch" passed every check. These cases pin the closure: the anchor decision
// logic hermetically (fake git, no processes), and the actual forgery scenario
// against a REAL git repository, including the exact 5-step attack from the
// report.
describe('trust anchor', () => {
  const gitCapability = (() => {
    try {
      execFileSync('git', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
      return { supported: true, reason: 'git available' };
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : 'UNKNOWN';
      return { supported: false, reason: `git unavailable (${code})` };
    }
  })();

  const fakeGit = (responses: Record<string, string | null>) =>
    (args: string[]): Buffer => {
      const key = args.join(' ');
      for (const [prefix, value] of Object.entries(responses)) {
        if (key.startsWith(prefix)) {
          if (value === null) throw new Error(`fake git failure for ${key}`);
          return Buffer.from(value, 'utf8');
        }
      }
      throw new Error(`fake git has no response for ${key}`);
    };

  describe('anchor resolution (hermetic, no processes)', () => {
    it('degrades to a typed no-git mode outside a work tree', () => {
      const git = fakeGit({ 'rev-parse --is-inside-work-tree': null });
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'no-git',
        anchor: null,
      });
    });

    it('reports no-history for a repository without commits', () => {
      const git = fakeGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --verify HEAD': null,
      });
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'no-history',
        anchor: null,
      });
    });

    it('anchors an uncommitted receipt to HEAD — the last reviewed state', () => {
      const git = fakeGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --verify HEAD': 'aaa111\n',
        'rev-parse --is-shallow-repository': 'false\n',
        'log --follow --format=%H -SGR-X-01': '\n',
        'rev-parse HEAD': 'aaa111\n',
        // Committed plan does NOT contain the receipt — genuinely working-tree-only.
        'show HEAD:docs/MASTER-PLAN.md': '# plan without the receipt\n',
      });
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'git',
        anchor: 'aaa111',
      });
    });

    it('anchors a committed receipt to the PARENT of its registration commit', () => {
      const git = fakeGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --verify HEAD': 'ccc333\n',
        'rev-parse --is-shallow-repository': 'false\n',
        'log --follow --format=%H -SGR-X-01': 'ccc333\nbbb222\n',
        'rev-list --parents -n 1 bbb222': 'bbb222 aaa111\n',
        'rev-parse --verify --quiet bbb222^': 'aaa111\n',
      });
      // Oldest -S hit (bbb222) is the registration; its parent is the anchor.
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'git',
        anchor: 'aaa111',
      });
    });

    it('fails closed with no-parent when the receipt was registered in the root commit', () => {
      const git = fakeGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --verify HEAD': 'bbb222\n',
        'rev-parse --is-shallow-repository': 'false\n',
        'log --follow --format=%H -SGR-X-01': 'bbb222\n',
        'rev-list --parents -n 1 bbb222': 'bbb222\n',
        'rev-parse --verify --quiet bbb222^': null,
      });
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'no-parent',
        anchor: null,
      });
    });

    // xverify-E: a depth-1 clone grafts HEAD into a root commit; the old resolver saw a
    // registration with an unreachable parent and degraded into a WARN pass.
    it('fails closed in a shallow repository instead of degrading', () => {
      const git = fakeGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --verify HEAD': 'aaa111\n',
        'rev-parse --is-shallow-repository': 'true\n',
      });
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'shallow',
        anchor: null,
      });
    });

    // xverify-E: `git log -S` does not open merge diffs, so a merge-introduced receipt was
    // invisible to the search, mistaken for uncommitted, and anchored to its own HEAD bytes.
    it('fails closed when the receipt is committed but invisible to the -S search', () => {
      const git = fakeGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --verify HEAD': 'mmm999\n',
        'rev-parse --is-shallow-repository': 'false\n',
        'log --follow --format=%H -SGR-X-01': '\n',
        'rev-parse HEAD': 'mmm999\n',
        'show HEAD:docs/MASTER-PLAN.md': '| `GR-X-01` | registry row |\n',
      });
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'history-unresolved',
        anchor: null,
      });
    });

    it('fails closed when the registration commit is a merge — no single reviewed pre-state', () => {
      const git = fakeGit({
        'rev-parse --is-inside-work-tree': 'true\n',
        'rev-parse --verify HEAD': 'mmm999\n',
        'rev-parse --is-shallow-repository': 'false\n',
        'log --follow --format=%H -SGR-X-01': 'mmm999\n',
        'rev-list --parents -n 1 mmm999': 'mmm999 aaa111 bbb222\n',
      });
      expect(resolveReceiptTrustAnchor('GR-X-01', '/scratch', git)).toEqual({
        mode: 'merge-introduction',
        anchor: null,
      });
    });

    it('readTrustAnchorBlob reports a path absent at the anchor as absent', () => {
      const git = fakeGit({
        'show aaa111:missing.ts': null,
        'cat-file -e aaa111:missing.ts': null,
      });
      expect(readTrustAnchorBlob('aaa111', 'missing.ts', '/scratch', git)).toEqual({
        status: 'absent',
      });
    });

    // OQ-XVE-05: an object-read error must never satisfy an ABSENT baseline.
    it('readTrustAnchorBlob distinguishes a read error from absence', () => {
      const git = fakeGit({
        'show aaa111:broken.ts': null,
        'cat-file -e aaa111:broken.ts': '\n',
      });
      expect(readTrustAnchorBlob('aaa111', 'broken.ts', '/scratch', git)).toEqual({
        status: 'error',
      });
    });

    it('readTrustAnchorBlob returns the blob bytes for a readable path', () => {
      const git = fakeGit({ 'show aaa111:ok.ts': 'export const ok = true;\n' });
      const read = readTrustAnchorBlob('aaa111', 'ok.ts', '/scratch', git);
      expect(read.status).toBe('ok');
      expect(read.status === 'ok' && read.blob.toString('utf8')).toBe(
        'export const ok = true;\n',
      );
    });
  });

  describe.skipIf(!gitCapability.supported)('real-git forgery scenarios', () => {
    const TARGET = 'src-example.ts';
    const RECEIPT_ID = 'GR-2026-07-26-ANCHOR-FIXTURE-01';

    const gitEnv = (root: string) => ({
      ...process.env,
      GIT_CONFIG_GLOBAL: join(root, '.empty-gitconfig'),
      GIT_CONFIG_SYSTEM: join(root, '.empty-gitconfig'),
      GIT_AUTHOR_NAME: 'fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    });
    const git = (root: string, ...args: string[]) =>
      execFileSync('git', args, {
        cwd: root,
        env: gitEnv(root),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

    const planWithReceipt = (targetDigest: string) =>
      planFixture({
        rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'READY' }],
        receipts: [
          {
            id: RECEIPT_ID,
            workIds: ['TASK-A'],
            manifest: `\`${TARGET}@${targetDigest}\``,
            state: '`ONE_SHOT`: active',
          },
        ],
      });

    /** Scratch git repo whose initial commit holds the plan WITHOUT the receipt. */
    const makeAnchoredRepo = (targetBytes: string) => {
      const source = planFixture({
        rows: [{ order: 10, id: 'TASK-A', gates: ['G1'], state: 'OPEN' }],
      });
      const root = makeScratchPlan(source);
      writeFileSync(join(root, TARGET), targetBytes, 'utf8');
      writeFileSync(join(root, '.empty-gitconfig'), '', 'utf8');
      git(root, 'init', '-q');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'reviewed base state');
      return root;
    };

    it('admits an uncommitted receipt whose baseline pins committed, reviewed bytes', () => {
      const committed = 'export const value = 1;\n';
      const root = makeAnchoredRepo(committed);
      const digest = createHash('sha256').update(committed).digest('hex');
      const source = planWithReceipt(digest);
      writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), source, 'utf8');
      const result = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root });
      expect(result.findings.map((finding) => finding.code)).not.toContain(
        'RECEIPT_BASELINE_UNREVIEWED',
      );
      expect(result.findings.map((finding) => finding.code)).not.toContain(
        'ADMISSION_RECEIPT_MISSING',
      );
    });

    it('rejects a receipt vouching for uncommitted working-tree edits', () => {
      const root = makeAnchoredRepo('export const value = 1;\n');
      const forged = 'export const value = "forged";\n';
      writeFileSync(join(root, TARGET), forged, 'utf8');
      const digest = createHash('sha256').update(forged).digest('hex');
      const source = planWithReceipt(digest);
      writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), source, 'utf8');
      // The old working-tree check ALONE would pass here — bytes match the manifest.
      // The anchor check must catch that those bytes were never committed, let alone reviewed.
      const codes = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root })
        .findings.map((finding) => finding.code);
      expect(codes).toContain('RECEIPT_BASELINE_UNREVIEWED');
      expect(codes).toContain('ADMISSION_RECEIPT_MISSING');
    });

    it('rejects the xverify 5-step attack: source change and receipt in the same commit', () => {
      const root = makeAnchoredRepo('export const value = 1;\n');
      const forged = 'export const value = "forged";\n';
      writeFileSync(join(root, TARGET), forged, 'utf8');
      const digest = createHash('sha256').update(forged).digest('hex');
      const source = planWithReceipt(digest);
      writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), source, 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'attack: mutate source and mint matching receipt');
      // Post-commit, working tree and HEAD both agree with the manifest; only the
      // registration-parent anchor still knows the state a reviewer actually saw.
      const codes = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root })
        .findings.map((finding) => finding.code);
      expect(codes).toContain('RECEIPT_BASELINE_UNREVIEWED');
      expect(codes).toContain('ADMISSION_RECEIPT_MISSING');
    });

    it('accepts the legitimate two-commit flow: receipt registered against reviewed state', () => {
      const committed = 'export const value = 1;\n';
      const root = makeAnchoredRepo(committed);
      const digest = createHash('sha256').update(committed).digest('hex');
      const source = planWithReceipt(digest);
      writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), source, 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'register admission receipt');
      const result = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root });
      expect(result.findings.map((finding) => finding.code)).not.toContain(
        'RECEIPT_BASELINE_UNREVIEWED',
      );
    });

    // xverify-E variant: the receipt lands inside a MERGE commit. Plain `git log -S` never
    // opens merge diffs, so the search comes back empty; the old resolver mistook that for
    // an uncommitted receipt and anchored it to its own HEAD bytes.
    it('rejects the xverify merge-introduction attack: receipt lands only in a merge commit', () => {
      const root = makeAnchoredRepo('export const value = 1;\n');
      // Side branch mutates the target; main gains an unrelated commit.
      git(root, 'checkout', '-q', '-b', 'side');
      const forged = 'export const value = "forged";\n';
      writeFileSync(join(root, TARGET), forged, 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'side: mutate target');
      git(root, 'checkout', '-q', '-');
      writeFileSync(join(root, 'unrelated.txt'), 'noise\n', 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'main: unrelated');
      // Merge WITHOUT committing, then smuggle the matching receipt into the merge commit
      // itself — its diff is invisible to a plain `-S` search.
      git(root, 'merge', '--no-commit', '--no-ff', 'side');
      const digest = createHash('sha256').update(forged).digest('hex');
      const source = planWithReceipt(digest);
      writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), source, 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'merge introduces receipt');
      const codes = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root })
        .findings.map((finding) => finding.code);
      expect(codes).toContain('RECEIPT_BASELINE_UNREVIEWED');
      expect(codes).toContain('ADMISSION_RECEIPT_MISSING');
    });

    // xverify-E variant: register the receipt under the plan's old filename, mutate the
    // target with a matching baseline, then rename the plan into place. Without --follow
    // the rename commit was mistaken for the registration, anchoring PAST the mutation.
    it('rejects the xverify rename attack: rename must not advance the trust anchor', () => {
      const committed = 'export const value = 1;\n';
      const root = makeAnchoredRepo(committed);
      // Move the canonical plan aside FIRST so registration happens under the old name.
      const oldPath = 'docs/OLD-PLAN.md';
      git(root, 'mv', MASTER_PLAN_RELATIVE_PATH, oldPath);
      git(root, 'commit', '-q', '-m', 'plan lives under old name');
      const forged = 'export const value = "forged";\n';
      const digest = createHash('sha256').update(forged).digest('hex');
      const source = planWithReceipt(digest);
      writeFileSync(join(root, oldPath), source, 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'register receipt under old name');
      // Mutate the target AFTER registration, then rename the plan into canonical place.
      writeFileSync(join(root, TARGET), forged, 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'mutate target after registration');
      git(root, 'mv', oldPath, MASTER_PLAN_RELATIVE_PATH);
      git(root, 'commit', '-q', '-m', 'rename plan to canonical path');
      // --follow resolves the TRUE registration commit under the old name; its parent
      // predates the mutation, so the baseline cannot match reviewed state.
      const codes = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root })
        .findings.map((finding) => finding.code);
      expect(codes).toContain('RECEIPT_BASELINE_UNREVIEWED');
      expect(codes).toContain('ADMISSION_RECEIPT_MISSING');
    });

    // xverify-E variant: a depth-1 clone of an attacked repo previously produced a
    // `no-parent` WARN and passed. Shallow history is now a fail-closed finding.
    it('rejects the same-commit attack from a depth-1 shallow clone', () => {
      const root = makeAnchoredRepo('export const value = 1;\n');
      const forged = 'export const value = "forged";\n';
      writeFileSync(join(root, TARGET), forged, 'utf8');
      const digest = createHash('sha256').update(forged).digest('hex');
      const source = planWithReceipt(digest);
      writeFileSync(join(root, MASTER_PLAN_RELATIVE_PATH), source, 'utf8');
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '-m', 'attack: mutate source and mint matching receipt');
      const shallowRoot = `${root}-shallow`;
      execFileSync(
        'git',
        ['clone', '-q', '--depth', '1', `file://${root}`, shallowRoot],
        { env: gitEnv(root), stdio: ['ignore', 'pipe', 'pipe'] },
      );
      writeFileSync(join(shallowRoot, '.empty-gitconfig'), '', 'utf8');
      const codes = validateMasterPlan(source, { nowMs: TEST_NOW_MS, root: shallowRoot })
        .findings.map((finding) => finding.code);
      expect(codes).toContain('RECEIPT_BASELINE_UNREVIEWED');
      expect(codes).toContain('ADMISSION_RECEIPT_MISSING');
    });
  });

  it('declares this host\'s git capability instead of assuming it', () => {
    expect(typeof gitCapability.supported).toBe('boolean');
    expect(gitCapability.reason).toMatch(/git (available|unavailable)/);
  });
});
