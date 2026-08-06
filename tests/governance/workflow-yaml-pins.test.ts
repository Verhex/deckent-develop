// ─── GOVERNANCE PIN-TEST SYNC (Sprint 434, Task 434-002) ─────────────────────────────
//
// Sibling task 434-001 hardened `.github/workflows/cross-platform-e2e.yml`'s required
// `packed-install` job: bounded (max 2) retry loops for `npm ci` and the packed-install
// smoke script, a 30s wait ONLY between attempts (never after the final one), npm
// fetch-retry/timeout config, and a `failure()`-only diagnostic-artifact upload reusing
// the repo's existing full-SHA-pinned `actions/upload-artifact` reference. This file
// pins that contract going forward, plus repo-wide action-pin / third-party-action /
// required-status-non-relaxation invariants — semantically (YAML-parsed structure and
// line-ordering/arithmetic relationships), not as a literal full-file snapshot, so it
// stays maintainable as the workflow evolves.
//
// No YAML-parsing dependency (`js-yaml`/`yaml`) exists in package.json, and workers may
// not run `npm install` (dependency-mutation advisory). This file therefore implements
// its own minimal indentation-based YAML-subset parser, mirroring the established
// scanner-in-test-file convention (tests/governance/release-workflow-unify.test.ts,
// tests/governance/orphan-deliverables.test.ts) rather than a shared module (each
// governance test file's write authority covers only itself).
//
// Every checker below is exercised against hermetic RED/GREEN fixtures first (proving
// the checker actually distinguishes compliant from violating shapes — not merely
// "the string exists somewhere"), then applied to the real, current workflow files in
// the "live repo-wide pin" section.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..', '..');
const WORKFLOWS_DIR = resolve(projectRoot, '.github', 'workflows');

// ═══════════════════════════════════════════════════════════════════════════
// Minimal YAML-subset parser (mappings / sequences / block scalars / flow arrays)
// ═══════════════════════════════════════════════════════════════════════════

function lineIndent(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === ' ') n++;
  return n;
}

function isBlankOrComment(line: string): boolean {
  const t = line.trim();
  return t === '' || t.startsWith('#');
}

/** Strip a trailing ` # comment`, respecting single/double-quoted spans. */
function stripInlineComment(text: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || text[i - 1] === ' ')) {
      return text.slice(0, i).trimEnd();
    }
  }
  return text;
}

/** Find the colon that separates a mapping key from its value, respecting quotes. */
function findTopLevelColon(text: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let idx = 0; idx < text.length; idx++) {
    const c = text[idx];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === ':' && !inSingle && !inDouble) {
      if (idx === text.length - 1 || text[idx + 1] === ' ') return idx;
    }
  }
  return -1;
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
    if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  }
  return t;
}

function parseFlowArray(s: string): string[] {
  const inner = s.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];
  return inner.split(',').map((p) => unquote(p.trim()));
}

function parseWorkflowYaml(source: string): Record<string, unknown> {
  const rawLines = source.split('\n');
  let i = 0;

  function peekMeaningful(): { indent: number; text: string } | null {
    while (i < rawLines.length && isBlankOrComment(rawLines[i] ?? '')) i++;
    if (i >= rawLines.length) return null;
    const raw = rawLines[i] ?? '';
    const indent = lineIndent(raw);
    const text = stripInlineComment(raw.slice(indent));
    return { indent, text };
  }

  function parseBlockScalar(baseIndent: number, chomp: string): string {
    const collected: string[] = [];
    let contentIndent: number | null = null;
    while (i < rawLines.length) {
      const raw = rawLines[i] ?? '';
      if (raw.trim() === '') {
        collected.push('');
        i++;
        continue;
      }
      const ind = lineIndent(raw);
      if (ind <= baseIndent) break;
      if (contentIndent === null) contentIndent = ind;
      collected.push(raw.slice(contentIndent));
      i++;
    }
    while (collected.length && collected[collected.length - 1] === '' && chomp !== '+') {
      collected.pop();
    }
    return collected.join('\n');
  }

  function parseValue(baseIndent: number, inlineRemainder: string): unknown {
    const trimmed = inlineRemainder.trim();
    if (['|', '|-', '|+', '>', '>-', '>+'].includes(trimmed)) {
      const chomp = trimmed.endsWith('+') ? '+' : trimmed.endsWith('-') ? '-' : '';
      return parseBlockScalar(baseIndent, chomp);
    }
    if (trimmed !== '') {
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) return parseFlowArray(trimmed);
      return unquote(trimmed);
    }
    const next = peekMeaningful();
    if (!next || next.indent <= baseIndent) return null;
    if (next.text.startsWith('- ') || next.text === '-') return parseSequence(next.indent);
    return parseMapping(next.indent);
  }

  function parseSequence(indent: number): unknown[] {
    const arr: unknown[] = [];
    for (;;) {
      const next = peekMeaningful();
      if (!next || next.indent !== indent || !next.text.startsWith('- ')) break;
      i++;
      const rest = next.text.slice(2);
      const itemIndent = indent + 2;
      const colonIdx = findTopLevelColon(rest);
      if (colonIdx === -1) {
        if (rest.trim() === '') arr.push(parseMapping(itemIndent));
        else if (rest.trim().startsWith('[')) arr.push(parseFlowArray(rest));
        else arr.push(unquote(rest));
        continue;
      }
      const key = rest.slice(0, colonIdx).trim();
      const valueRemainder = rest.slice(colonIdx + 1);
      const obj: Record<string, unknown> = {};
      obj[key] = parseValue(itemIndent, valueRemainder);
      for (;;) {
        const n2 = peekMeaningful();
        if (!n2 || n2.indent !== itemIndent || n2.text.startsWith('- ')) break;
        const c2 = findTopLevelColon(n2.text);
        if (c2 === -1) break;
        i++;
        const k2 = unquote(n2.text.slice(0, c2).trim());
        obj[k2] = parseValue(itemIndent, n2.text.slice(c2 + 1));
      }
      arr.push(obj);
    }
    return arr;
  }

  function parseMapping(indent: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (;;) {
      const next = peekMeaningful();
      if (!next || next.indent !== indent || next.text.startsWith('- ')) break;
      const colonIdx = findTopLevelColon(next.text);
      if (colonIdx === -1) break;
      i++;
      const key = unquote(next.text.slice(0, colonIdx).trim());
      obj[key] = parseValue(indent, next.text.slice(colonIdx + 1));
    }
    return obj;
  }

  return parseMapping(0);
}

// ═══════════════════════════════════════════════════════════════════════════
// Workflow-domain types + helpers
// ═══════════════════════════════════════════════════════════════════════════

interface WorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  shell?: string;
  env?: Record<string, unknown>;
  with?: Record<string, unknown>;
  'continue-on-error'?: string;
  [key: string]: unknown;
}

interface WorkflowJob {
  name?: string;
  env?: Record<string, unknown>;
  steps?: WorkflowStep[];
  'continue-on-error'?: string;
  [key: string]: unknown;
}

interface ParsedWorkflow {
  name?: string;
  on?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
  [key: string]: unknown;
}

function readWorkflow(filename: string): ParsedWorkflow {
  return parseWorkflowYaml(readFileSync(resolve(WORKFLOWS_DIR, filename), 'utf-8')) as ParsedWorkflow;
}

// ─── Action-pin helpers ───────────────────────────────────────────────────

const SHA40_RE = /^[0-9a-f]{40}$/;

function actionBaseName(uses: string): string {
  return uses.split('@')[0] ?? uses;
}

function actionRefPin(uses: string): string {
  const at = uses.indexOf('@');
  return at === -1 ? '' : uses.slice(at + 1);
}

function isFullShaPinned(uses: string): boolean {
  return SHA40_RE.test(actionRefPin(uses));
}

function collectSteps(workflow: ParsedWorkflow): WorkflowStep[] {
  const out: WorkflowStep[] = [];
  for (const job of Object.values(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) out.push(step);
  }
  return out;
}

function collectAllUses(workflows: ParsedWorkflow[]): string[] {
  const out: string[] = [];
  for (const wf of workflows) {
    for (const step of collectSteps(wf)) {
      if (step.uses) out.push(step.uses);
    }
  }
  return out;
}

/** Every action base name already present in the repo as of this task — a NEW
 *  third-party action is any base name found live that is not in this set. */
const KNOWN_ACTION_ALLOWLIST = new Set([
  'actions/checkout',
  'actions/setup-node',
  'actions/upload-artifact',
  'actions/upload-pages-artifact',
  'actions/deploy-pages',
  'softprops/action-gh-release',
]);

function thirdPartyActionsBeyondAllowlist(usesList: string[]): string[] {
  const found = new Set<string>();
  for (const u of usesList) {
    const base = actionBaseName(u);
    if (!KNOWN_ACTION_ALLOWLIST.has(base)) found.add(base);
  }
  return Array.from(found);
}

// ─── Bounded-retry-loop analyzer ──────────────────────────────────────────
//
// Structural (line-ordering + arithmetic), not text-grep: a violation is
// detected by where a `sleep N` line sits RELATIVE to the exhausted-attempts
// exit guard, not merely whether the substring "sleep" appears.

interface RetryLoopAnalysis {
  found: boolean;
  maxAttempts: number | null;
  sleepSeconds: number[];
  /** true = VIOLATION: a sleep can execute even after attempts are exhausted
   *  (sleep line is not strictly after the `-ge "$max_attempts"` guard's exit). */
  sleepReachableAfterExhaustion: boolean;
  /** true = VIOLATION: loop has no attempt ceiling at all (e.g. `while true`). */
  unboundedLoop: boolean;
}

function analyzeBoundedRetryLoop(runText: string | undefined): RetryLoopAnalysis {
  const empty: RetryLoopAnalysis = {
    found: false,
    maxAttempts: null,
    sleepSeconds: [],
    sleepReachableAfterExhaustion: false,
    unboundedLoop: false,
  };
  if (!runText) return empty;

  const lines = runText.split('\n');
  const loopStartIdx = lines.findIndex((l) => /^\s*(until|while)\s+.+;\s*do\s*$/.test(l));
  if (loopStartIdx === -1) return empty;

  let doneIdx = -1;
  for (let idx = loopStartIdx + 1; idx < lines.length; idx++) {
    if (/^\s*done\s*$/.test(lines[idx])) {
      doneIdx = idx;
      break;
    }
  }
  const bodyEnd = doneIdx === -1 ? lines.length : doneIdx;

  const isWhileTrue = /^\s*while\s+true\s*;\s*do\s*$/.test(lines[loopStartIdx]);
  const maxAttemptsMatch = lines.slice(0, bodyEnd).join('\n').match(/max_attempts\s*=\s*(\d+)/);
  const maxAttempts = maxAttemptsMatch ? Number(maxAttemptsMatch[1]) : null;

  let guardIdx = -1;
  for (let idx = loopStartIdx + 1; idx < bodyEnd; idx++) {
    if (/-ge\s+"?\$max_attempts"?/.test(lines[idx])) {
      guardIdx = idx;
      break;
    }
  }
  let exitIdx = -1;
  if (guardIdx !== -1) {
    for (let idx = guardIdx + 1; idx < bodyEnd; idx++) {
      if (/\bexit\s+1\b/.test(lines[idx])) {
        exitIdx = idx;
        break;
      }
    }
  }

  const sleepIdxs: number[] = [];
  const sleepSeconds: number[] = [];
  for (let idx = loopStartIdx; idx < bodyEnd; idx++) {
    const m = lines[idx].match(/^\s*sleep\s+(\d+)\b/);
    if (m) {
      sleepIdxs.push(idx);
      sleepSeconds.push(Number(m[1]));
    }
  }

  const sleepReachableAfterExhaustion =
    sleepIdxs.length > 0 && (guardIdx === -1 || exitIdx === -1 || sleepIdxs.some((s) => s <= exitIdx));

  return {
    found: true,
    maxAttempts,
    sleepSeconds,
    sleepReachableAfterExhaustion,
    unboundedLoop: isWhileTrue && maxAttempts === null,
  };
}

// ─── Diagnostic-artifact analyzer ─────────────────────────────────────────

interface DiagnosticArtifactAnalysis {
  found: boolean;
  /** true only if a failure()-gated upload-artifact step exists AND no sibling
   *  upload-artifact step runs unconditionally / on always(). */
  isFailureOnly: boolean;
  isFullShaPinned: boolean;
  coversNpmLogs: boolean;
  /** optional-log honesty: `if-no-files-found` must not be the strict default,
   *  since a tmux/server log may legitimately never materialize. */
  toleratesMissingOptionalLogs: boolean;
}

function analyzeDiagnosticArtifactStep(steps: WorkflowStep[]): DiagnosticArtifactAnalysis {
  const uploadSteps = steps.filter((s) => (s.uses ?? '').startsWith('actions/upload-artifact'));
  const failureStep = uploadSteps.find((s) => /failure\(\)/.test(String(s.if ?? '')));
  if (!failureStep) {
    return {
      found: false,
      isFailureOnly: false,
      isFullShaPinned: false,
      coversNpmLogs: false,
      toleratesMissingOptionalLogs: false,
    };
  }
  const alwaysOrUnconditional = uploadSteps.some(
    (s) => s !== failureStep && (!s.if || /always\(\)/.test(String(s.if))),
  );
  const pathText = String((failureStep.with as Record<string, unknown> | undefined)?.path ?? '');
  const ifNoFilesFound = String(
    (failureStep.with as Record<string, unknown> | undefined)?.['if-no-files-found'] ?? '',
  );

  // born-695: upload-artifact v4 rejects workspace-OUTSIDE paths (windows npm
  // cache lives on another drive), so npm logs are now COPIED into a
  // workspace-local diag dir by a failure()-only collect step and uploaded
  // from there. "Covers npm logs" therefore holds when EITHER the upload path
  // itself names npm, OR it names the diag dir AND a failure()-only collect
  // step demonstrably copies the npm _logs directory into it.
  const collectStep = steps.find(
    (s) => /failure\(\)/.test(String(s.if ?? '')) && /xplat-diag/.test(String(s.run ?? '')),
  );
  const collectCopiesNpmLogs = /_logs/.test(String(collectStep?.run ?? ''));

  return {
    found: true,
    isFailureOnly: !alwaysOrUnconditional,
    isFullShaPinned: isFullShaPinned(failureStep.uses ?? ''),
    coversNpmLogs:
      /npm/i.test(pathText) || (/xplat-diag/.test(pathText) && collectCopiesNpmLogs),
    toleratesMissingOptionalLogs: ifNoFilesFound === 'ignore',
  };
}

// ─── Required-status / continue-on-error allowlist ────────────────────────

function collectContinueOnErrorLocations(workflowsByFile: Record<string, ParsedWorkflow>): string[] {
  const locations: string[] = [];
  for (const [filename, wf] of Object.entries(workflowsByFile)) {
    for (const [jobId, job] of Object.entries(wf.jobs ?? {})) {
      if (String(job['continue-on-error'] ?? '') === 'true') locations.push(`${filename}:${jobId}`);
      for (const step of job.steps ?? []) {
        if (String(step['continue-on-error'] ?? '') === 'true') {
          locations.push(`${filename}:${jobId}:${step.name ?? '(unnamed step)'}`);
        }
      }
    }
  }
  return locations;
}

/** The exact, already-known set of continue-on-error relaxations as of this task —
 *  each pre-dates 434-001/434-002 and is independently commented/justified in ci.yml.
 *  Any location outside this set is a NEW status relaxation. */
const KNOWN_CONTINUE_ON_ERROR_ALLOWLIST = new Set([
  'ci.yml:test-docs-scripts',
  'ci.yml:test-windows',
  'ci.yml:test-windows:Run core tests (Windows informational)',
]);

// ─── npm fetch retry/timeout env ──────────────────────────────────────────

function isBoundedFetchRetryConfig(env: Record<string, unknown>): boolean {
  const retries = Number(env.npm_config_fetch_retries);
  const timeout = Number(env.npm_config_fetch_timeout);
  const mintimeout = Number(env.npm_config_fetch_retry_mintimeout);
  const maxtimeout = Number(env.npm_config_fetch_retry_maxtimeout);
  return (
    Number.isFinite(retries) &&
    retries >= 1 &&
    retries <= 5 &&
    Number.isFinite(timeout) &&
    timeout > 0 &&
    Number.isFinite(mintimeout) &&
    Number.isFinite(maxtimeout) &&
    mintimeout > 0 &&
    maxtimeout > mintimeout
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Parser primitives (condensed — proves this file's own parser copy works on
// the shapes this test suite actually relies on)
// ═══════════════════════════════════════════════════════════════════════════

describe('parseWorkflowYaml — primitives', () => {
  it('parses a job env block with underscored keys and quoted numeric strings', () => {
    const y = ["env:", "  npm_config_fetch_retries: '3'", "  npm_config_fetch_timeout: '300000'"].join('\n');
    expect(parseWorkflowYaml(y)).toEqual({
      env: { npm_config_fetch_retries: '3', npm_config_fetch_timeout: '300000' },
    });
  });

  it('parses steps with a run block scalar containing a retry loop', () => {
    const y = [
      'steps:',
      '  - name: retry step',
      '    shell: bash',
      '    run: |',
      '      until npm ci; do',
      '        sleep 30',
      '      done',
    ].join('\n');
    const result = parseWorkflowYaml(y) as { steps: WorkflowStep[] };
    expect(result.steps[0].shell).toBe('bash');
    expect(result.steps[0].run).toBe('until npm ci; do\n  sleep 30\ndone');
  });

  it('parses a with: block containing a nested path block scalar and if-no-files-found', () => {
    const y = [
      '- uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2',
      '  if: failure()',
      '  with:',
      '    path: |',
      '      ${{ steps.npm-diag.outputs.logs-glob }}',
      '      .tasks/task-*.log',
      '    if-no-files-found: ignore',
    ].join('\n');
    const result = parseWorkflowYaml(`steps:\n${y
      .split('\n')
      .map((l) => '  ' + l)
      .join('\n')}`) as { steps: WorkflowStep[] };
    const step = result.steps[0];
    expect(step.uses).toBe('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    expect(step.if).toBe('failure()');
    expect((step.with as Record<string, unknown>).path).toBe(
      '${{ steps.npm-diag.outputs.logs-glob }}\n.tasks/task-*.log',
    );
    expect((step.with as Record<string, unknown>)['if-no-files-found']).toBe('ignore');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Action-pin / third-party-allowlist — hermetic RED/GREEN fixtures
// ═══════════════════════════════════════════════════════════════════════════

describe('action-pin helpers — fixtures', () => {
  it('recognizes a full-SHA-pinned action', () => {
    expect(isFullShaPinned('actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5')).toBe(true);
  });

  it('rejects a tag-pinned action as not full-SHA-pinned', () => {
    expect(isFullShaPinned('actions/checkout@v4')).toBe(false);
  });

  it('rejects a short/partial-hex ref as not full-SHA (must be exactly 40 hex chars)', () => {
    expect(isFullShaPinned('actions/checkout@34e1148')).toBe(false);
  });

  it('GREEN: only known base names → no third-party action beyond allowlist', () => {
    const uses = ['actions/checkout@v4', 'actions/setup-node@v4', 'actions/upload-artifact@deadbeef'];
    expect(thirdPartyActionsBeyondAllowlist(uses)).toEqual([]);
  });

  it('RED: a new third-party action base name is flagged', () => {
    const uses = ['actions/checkout@v4', 'some-org/some-action@v1'];
    expect(thirdPartyActionsBeyondAllowlist(uses)).toEqual(['some-org/some-action']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bounded-retry-loop analyzer — hermetic RED/GREEN fixtures
// ═══════════════════════════════════════════════════════════════════════════

describe('analyzeBoundedRetryLoop — fixtures', () => {
  const GREEN_LOOP = [
    'set -uo pipefail',
    'max_attempts=2',
    'attempt=1',
    'until npm ci; do',
    '  if [ "$attempt" -ge "$max_attempts" ]; then',
    '    echo "::error::npm ci failed after ${max_attempts} attempt(s)" >&2',
    '    exit 1',
    '  fi',
    '  attempt=$((attempt + 1))',
    '  echo "retrying after 30s..." >&2',
    '  sleep 30',
    'done',
  ].join('\n');

  it('GREEN: bounded 2-attempt loop with sleep only reachable between attempts', () => {
    const result = analyzeBoundedRetryLoop(GREEN_LOOP);
    expect(result.found).toBe(true);
    expect(result.maxAttempts).toBe(2);
    expect(result.sleepSeconds).toEqual([30]);
    expect(result.sleepReachableAfterExhaustion).toBe(false);
    expect(result.unboundedLoop).toBe(false);
  });

  it('RED: unbounded loop (while true, no max_attempts) is flagged', () => {
    const runText = ['while true; do', '  npm ci && break', '  sleep 5', 'done'].join('\n');
    const result = analyzeBoundedRetryLoop(runText);
    expect(result.unboundedLoop).toBe(true);
  });

  it('RED: sleep executes unconditionally BEFORE the exhausted-attempts exit guard', () => {
    const runText = [
      'max_attempts=2',
      'attempt=1',
      'until npm ci; do',
      '  sleep 30',
      '  attempt=$((attempt + 1))',
      '  if [ "$attempt" -ge "$max_attempts" ]; then',
      '    exit 1',
      '  fi',
      'done',
    ].join('\n');
    const result = analyzeBoundedRetryLoop(runText);
    expect(result.sleepReachableAfterExhaustion).toBe(true);
  });

  it('RED: more than 2 bounded attempts is out of contract (max_attempts=5)', () => {
    const runText = GREEN_LOOP.replace('max_attempts=2', 'max_attempts=5');
    const result = analyzeBoundedRetryLoop(runText);
    expect(result.maxAttempts).toBe(5);
    expect(result.maxAttempts).not.toBe(2);
  });

  it('RED: a duplicate/extra sleep beyond (max_attempts - 1) is flagged by count', () => {
    const runText = GREEN_LOOP.replace('sleep 30\n', 'sleep 30\n  sleep 30\n');
    const result = analyzeBoundedRetryLoop(runText);
    expect(result.sleepSeconds.length).toBeGreaterThan((result.maxAttempts ?? 0) - 1);
  });

  it('no retry loop present → found: false (distinguishes absence from violation)', () => {
    const result = analyzeBoundedRetryLoop('npm ci');
    expect(result.found).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Diagnostic-artifact analyzer — hermetic RED/GREEN fixtures
// ═══════════════════════════════════════════════════════════════════════════

describe('analyzeDiagnosticArtifactStep — fixtures', () => {
  const GREEN_STEPS: WorkflowStep[] = [
    {
      name: 'Upload diagnostics on failure',
      if: 'failure()',
      uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
      with: {
        name: 'packed-install-diagnostics',
        path: '${{ steps.npm-diag.outputs.logs-glob }}\n.tasks/task-*.log',
        'if-no-files-found': 'ignore',
      },
    },
  ];

  it('GREEN: failure()-only, SHA-pinned, covers npm logs, tolerates missing optional logs', () => {
    const result = analyzeDiagnosticArtifactStep(GREEN_STEPS);
    expect(result.found).toBe(true);
    expect(result.isFailureOnly).toBe(true);
    expect(result.isFullShaPinned).toBe(true);
    expect(result.coversNpmLogs).toBe(true);
    expect(result.toleratesMissingOptionalLogs).toBe(true);
  });

  it('RED: an always()-conditioned sibling upload makes it not failure-only', () => {
    const steps: WorkflowStep[] = [
      ...GREEN_STEPS,
      {
        name: 'Upload dist always',
        if: 'always()',
        uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
        with: { name: 'dist', path: 'dist/' },
      },
    ];
    const result = analyzeDiagnosticArtifactStep(steps);
    expect(result.isFailureOnly).toBe(false);
  });

  it('RED: an unconditional (no if:) sibling upload makes it not failure-only', () => {
    const steps: WorkflowStep[] = [
      ...GREEN_STEPS,
      { name: 'Upload always (no if)', uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02' },
    ];
    const result = analyzeDiagnosticArtifactStep(steps);
    expect(result.isFailureOnly).toBe(false);
  });

  it('RED: tag-pinned upload-artifact is not full-SHA-pinned', () => {
    const steps: WorkflowStep[] = [{ ...GREEN_STEPS[0], uses: 'actions/upload-artifact@v4' }];
    const result = analyzeDiagnosticArtifactStep(steps);
    expect(result.isFullShaPinned).toBe(false);
  });

  it('RED: a path that never mentions npm logs fails npm-log coverage', () => {
    const steps: WorkflowStep[] = [
      { ...GREEN_STEPS[0], with: { ...GREEN_STEPS[0].with, path: 'dist/**/*' } },
    ];
    const result = analyzeDiagnosticArtifactStep(steps);
    expect(result.coversNpmLogs).toBe(false);
  });

  it('no failure()-gated upload-artifact step present → found: false', () => {
    const result = analyzeDiagnosticArtifactStep([{ name: 'Build', run: 'npm run build' }]);
    expect(result.found).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Required-status / continue-on-error allowlist — fixtures
// ═══════════════════════════════════════════════════════════════════════════

describe('collectContinueOnErrorLocations — fixtures', () => {
  it('GREEN: a workflow with no continue-on-error yields zero locations', () => {
    const wf: ParsedWorkflow = { jobs: { build: { steps: [{ run: 'npm run build' }] } } };
    expect(collectContinueOnErrorLocations({ 'fixture.yml': wf })).toEqual([]);
  });

  it('RED: job-level continue-on-error is captured as a location', () => {
    const wf: ParsedWorkflow = { jobs: { flaky: { 'continue-on-error': 'true', steps: [] } } };
    expect(collectContinueOnErrorLocations({ 'fixture.yml': wf })).toEqual(['fixture.yml:flaky']);
  });

  it('RED: step-level continue-on-error is captured with job + step name', () => {
    const wf: ParsedWorkflow = {
      jobs: { build: { steps: [{ name: 'risky step', 'continue-on-error': 'true' }] } },
    };
    expect(collectContinueOnErrorLocations({ 'fixture.yml': wf })).toEqual(['fixture.yml:build:risky step']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// npm fetch retry/timeout env — fixtures
// ═══════════════════════════════════════════════════════════════════════════

describe('isBoundedFetchRetryConfig — fixtures', () => {
  it('GREEN: sane bounded retry/timeout config', () => {
    expect(
      isBoundedFetchRetryConfig({
        npm_config_fetch_retries: '3',
        npm_config_fetch_retry_mintimeout: '5000',
        npm_config_fetch_retry_maxtimeout: '60000',
        npm_config_fetch_timeout: '300000',
      }),
    ).toBe(true);
  });

  it('RED: missing retries entirely is not a bounded config', () => {
    expect(isBoundedFetchRetryConfig({ npm_config_fetch_timeout: '300000' })).toBe(false);
  });

  it('RED: retries above the sane ceiling (unbounded-in-spirit) is rejected', () => {
    expect(
      isBoundedFetchRetryConfig({
        npm_config_fetch_retries: '50',
        npm_config_fetch_retry_mintimeout: '5000',
        npm_config_fetch_retry_maxtimeout: '60000',
        npm_config_fetch_timeout: '300000',
      }),
    ).toBe(false);
  });

  it('RED: mintimeout >= maxtimeout is an incoherent backoff window', () => {
    expect(
      isBoundedFetchRetryConfig({
        npm_config_fetch_retries: '3',
        npm_config_fetch_retry_mintimeout: '60000',
        npm_config_fetch_retry_maxtimeout: '5000',
        npm_config_fetch_timeout: '300000',
      }),
    ).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Live repo-wide pin — parses the ACTUAL current workflow files
// ═══════════════════════════════════════════════════════════════════════════

const WORKFLOW_FILENAMES = [
  'ci.yml',
  'cross-platform-e2e.yml',
  'dashboard-build.yml',
  'docs.yml',
  'publish.yml',
  'release.yml',
  'secret-scan.yml',
].filter((f) => existsSync(resolve(WORKFLOWS_DIR, f)));

describe('live repo-wide pin — packed-install retry-hardening (task 434-001 contract)', () => {
  const xplat = readWorkflow('cross-platform-e2e.yml');
  const packedInstall = xplat.jobs?.['packed-install'];
  const steps = packedInstall?.steps ?? [];

  it('packed-install job exists with the expected required-check name', () => {
    expect(packedInstall).toBeDefined();
    expect(String(packedInstall?.name ?? '')).toContain('Packed Install');
  });

  it('npm ci step is a bounded 2-attempt retry loop, sleep only reachable between attempts', () => {
    const step = steps.find((s) => /npm ci/i.test(s.name ?? '') && /retry/i.test(s.name ?? ''));
    expect(step, 'expected an "npm ci ... retry" step').toBeDefined();
    expect(step!.shell, 'must pin bash — windows-latest default shell is pwsh, not bash').toBe('bash');
    const analysis = analyzeBoundedRetryLoop(step!.run);
    expect(analysis.found).toBe(true);
    expect(analysis.maxAttempts).toBe(2);
    expect(analysis.sleepSeconds).toEqual([30]);
    expect(analysis.sleepReachableAfterExhaustion).toBe(false);
    expect(analysis.unboundedLoop).toBe(false);
  });

  it('packed-install smoke step is a bounded 2-attempt retry loop, sleep only reachable between attempts', () => {
    const step = steps.find((s) => /packed-install smoke/i.test(s.name ?? ''));
    expect(step, 'expected a "packed-install smoke" step').toBeDefined();
    expect(step!.shell, 'must pin bash — windows-latest default shell is pwsh, not bash').toBe('bash');
    const analysis = analyzeBoundedRetryLoop(step!.run);
    expect(analysis.found).toBe(true);
    expect(analysis.maxAttempts).toBe(2);
    expect(analysis.sleepSeconds).toEqual([30]);
    expect(analysis.sleepReachableAfterExhaustion).toBe(false);
    expect(analysis.unboundedLoop).toBe(false);
  });

  it('npm install, dashboard install and npm pack/install-smoke are SEPARATE bounded-retry flows (not one shared loop)', () => {
    // 531 süpürme: the packed-install job gained a third receipted bounded-retry
    // flow (dashboard `npm ci --prefix src/dashboard`, CI-PACKED-DASHBOARD-
    // TOOLCHAIN-001) — the pin tracks the measured set, still all separate.
    const retrySteps = steps.filter((s) => analyzeBoundedRetryLoop(s.run).found);
    expect(retrySteps.length).toBe(3);
  });

  it('job env carries bounded npm fetch-retry/timeout settings', () => {
    expect(isBoundedFetchRetryConfig(packedInstall?.env ?? {})).toBe(true);
  });

  it('diagnostic artifact upload is failure()-only, SHA-pinned, covers npm logs, tolerates missing optional logs', () => {
    const result = analyzeDiagnosticArtifactStep(steps);
    expect(result.found).toBe(true);
    expect(result.isFailureOnly).toBe(true);
    expect(result.isFullShaPinned).toBe(true);
    expect(result.coversNpmLogs).toBe(true);
    expect(result.toleratesMissingOptionalLogs).toBe(true);
  });

  it('diagnostic artifact reuses the EXISTING upload-artifact SHA pin (release.yml) — no divergent new pin', () => {
    const release = readWorkflow('release.yml');
    const releaseUpload = collectSteps(release).find((s) => (s.uses ?? '').startsWith('actions/upload-artifact'));
    const xplatUpload = steps.find(
      (s) => (s.uses ?? '').startsWith('actions/upload-artifact') && /failure\(\)/.test(String(s.if ?? '')),
    );
    expect(releaseUpload).toBeDefined();
    expect(xplatUpload).toBeDefined();
    expect(actionRefPin(xplatUpload!.uses!)).toBe(actionRefPin(releaseUpload!.uses!));
  });

  it('required-status semantics are not relaxed: zero continue-on-error in this workflow', () => {
    const locations = collectContinueOnErrorLocations({ 'cross-platform-e2e.yml': xplat });
    expect(locations).toEqual([]);
  });
});

describe('live repo-wide pin — repo-wide action/status invariants', () => {
  const workflows = WORKFLOW_FILENAMES.map(readWorkflow);
  const workflowsByFile = Object.fromEntries(WORKFLOW_FILENAMES.map((f) => [f, readWorkflow(f)]));

  it('no third-party action beyond the current known allowlist exists anywhere in the workflow set', () => {
    const usesList = collectAllUses(workflows);
    expect(thirdPartyActionsBeyondAllowlist(usesList)).toEqual([]);
  });

  it('continue-on-error usage repo-wide matches exactly the known pre-existing allowlist (no new relaxation)', () => {
    const locations = new Set(collectContinueOnErrorLocations(workflowsByFile));
    expect(locations).toEqual(KNOWN_CONTINUE_ON_ERROR_ALLOWLIST);
  });

  it('every currently full-SHA-pinned action reference stays full-SHA-pinned (regression pin)', () => {
    for (const [filename, wf] of Object.entries(workflowsByFile)) {
      for (const step of collectSteps(wf)) {
        if (!step.uses) continue;
        const pin = actionRefPin(step.uses);
        // A 40-char pin that is ALSO valid lowercase-hex is a SHA; anything else
        // (a short tag like v4, v4.6.2) is intentionally tag-pinned and out of scope here.
        if (pin.length === 40) {
          expect(isFullShaPinned(step.uses), `${filename}: ${step.uses}`).toBe(true);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Structural parse-lint fallback — cheap regression net across all workflows
// ═══════════════════════════════════════════════════════════════════════════

describe('workflow YAML structural sanity (all files)', () => {
  it('every workflow file parses without throwing and has name/on/jobs', () => {
    for (const filename of WORKFLOW_FILENAMES) {
      const parsed = readWorkflow(filename);
      expect(parsed.name, `${filename}: missing name`).toBeTruthy();
      expect(parsed.on, `${filename}: missing on`).toBeTruthy();
      expect(parsed.jobs, `${filename}: missing jobs`).toBeTruthy();
      for (const [jobId, job] of Object.entries(parsed.jobs ?? {})) {
        expect(Array.isArray(job.steps), `${filename}:${jobId} steps is not an array`).toBe(true);
        for (const step of job.steps ?? []) {
          const hasUsesOrRun = Boolean(step.uses) || Boolean(step.run);
          expect(hasUsesOrRun, `${filename}:${jobId} step "${step.name}" has neither uses nor run`).toBe(true);
        }
      }
    }
  });
});
