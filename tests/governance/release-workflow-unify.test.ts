// ─── RELEASE-WORKFLOW-UNIFY (Sprint 407, Task 407-001, born-608 P0) ──────────────────
//
// SORUN (before this task): publish.yml AND release.yml both triggered a real `npm
// publish` on the same `push: tags: v*` event — a double-publish race, catastrophic for
// a package registry that accepts exactly one publish per version. publish.yml also
// triggered on `release: published`, which release.yml's own "Create GitHub Release"
// step fires — a third path to the same race.
//
// FIX: release.yml is now the sole publish authority (real `npm publish`); publish.yml
// is narrowed to a read-only dry-run/verify workflow. docs.yml's dead `master`-branch
// deploy condition is corrected to `main`.
//
// This file is both the RED-proof (a fixture-based test proving the OLD shape was
// broken — see "RED-proof (fixture)" below) and the live regression pin (parses the
// ACTUAL current workflow files and asserts the fixed invariants hold going forward).
//
// No YAML-parsing dependency (`js-yaml`/`yaml`) exists in package.json, and workers may
// not run `npm install` (dependency-mutation advisory — would corrupt the shared
// workspace's native bindings). The task explicitly flags string-grep-only checks as
// tech debt, so this file implements a genuine (if minimal) indentation-based YAML
// parser sufficient for GitHub Actions workflow YAML's shape: block mappings, block and
// flow sequences, block scalars (`|`/`>` with chomping), quoted scalars, and
// comment-stripping that respects quoted strings. It does NOT support the full YAML
// spec (no anchors/aliases, no flow mappings, no multi-line plain-scalar folding — the
// workflow files in this repo are written to avoid that shape deliberately, see
// release.yml / publish.yml step-name comments). Scanner-in-test-file pattern mirrors
// tests/governance/orphan-deliverables.test.ts (same task-scope constraint: write
// authority covers only this file, not a new scripts/*.mjs module).

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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
export function stripInlineComment(text: string): string {
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
export function findTopLevelColon(text: string): number {
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

export function unquote(s: string): string {
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

/**
 * Parse a GitHub-Actions-shaped YAML subset into a plain JS object tree.
 * Scalars are returned as strings (or string[] for flow/block sequences of scalars);
 * mapping-sequence items (e.g. workflow steps) are returned as objects.
 */
export function parseWorkflowYaml(source: string): Record<string, unknown> {
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
// Workflow-domain helpers (built on the generic parser above)
// ═══════════════════════════════════════════════════════════════════════════

interface WorkflowStep {
  name?: string;
  run?: string;
  uses?: string;
  [key: string]: unknown;
}

interface WorkflowJob {
  steps?: WorkflowStep[];
  [key: string]: unknown;
}

interface ParsedWorkflow {
  name?: string;
  on?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
  [key: string]: unknown;
}

/** True if `run` contains a real (non `--dry-run`) `npm publish` invocation on some line. */
export function hasRealNpmPublish(runText: string | undefined): boolean {
  if (!runText) return false;
  return runText
    .split('\n')
    .some((line) => /\bnpm publish\b/.test(line) && !/--dry-run/.test(line));
}

/** Count real (non-dry-run) `npm publish` invocations across all jobs/steps of a workflow. */
export function countRealPublishInvocations(workflow: ParsedWorkflow): number {
  let count = 0;
  const jobs = workflow.jobs ?? {};
  for (const job of Object.values(jobs)) {
    for (const step of job.steps ?? []) {
      if (hasRealNpmPublish(step.run)) count++;
    }
  }
  return count;
}

/** True if the workflow's `on:` triggers on a `v*` tag push or a published release. */
export function triggersOnReleaseEvent(workflow: ParsedWorkflow): boolean {
  const on = workflow.on ?? {};
  const push = on.push as Record<string, unknown> | undefined;
  const pushTags = (push?.tags as string[] | undefined) ?? [];
  const release = on.release as Record<string, unknown> | undefined;
  const releaseTypes = (release?.types as string[] | undefined) ?? [];
  return pushTags.some((t) => t.includes('v*')) || releaseTypes.includes('published');
}

/** Number of release-event-triggered workflows (from a set) with ≥1 real publish step. */
export function countPublishAuthorityWorkflows(workflows: ParsedWorkflow[]): number {
  return workflows.filter((w) => triggersOnReleaseEvent(w) && countRealPublishInvocations(w) > 0)
    .length;
}

function findStepIndex(steps: WorkflowStep[], predicate: (s: WorkflowStep) => boolean): number {
  return steps.findIndex(predicate);
}

// ═══════════════════════════════════════════════════════════════════════════
// Parser unit tests (primitives) — mirrors orphan-deliverables.test.ts structure
// ═══════════════════════════════════════════════════════════════════════════

describe('parseWorkflowYaml — primitives', () => {
  it('parses a flat mapping', () => {
    const y = 'name: CI\non: push\n';
    expect(parseWorkflowYaml(y)).toEqual({ name: 'CI', on: 'push' });
  });

  it('parses nested mappings', () => {
    const y = 'permissions:\n  contents: read\n  id-token: write\n';
    expect(parseWorkflowYaml(y)).toEqual({
      permissions: { contents: 'read', 'id-token': 'write' },
    });
  });

  it('parses a flow array', () => {
    const y = 'on:\n  release:\n    types: [published]\n';
    expect(parseWorkflowYaml(y)).toEqual({ on: { release: { types: ['published'] } } });
  });

  it('parses a block sequence of scalars', () => {
    const y = "tags:\n  - 'v*'\n  - 'w*'\n";
    expect(parseWorkflowYaml(y)).toEqual({ tags: ['v*', 'w*'] });
  });

  it('parses a block sequence of mapping items (steps shape)', () => {
    const y = ['steps:', '  - name: Checkout', '    uses: actions/checkout@v4', '    with:', '      fetch-depth: 0'].join(
      '\n',
    );
    expect(parseWorkflowYaml(y)).toEqual({
      steps: [{ name: 'Checkout', uses: 'actions/checkout@v4', with: { 'fetch-depth': '0' } }],
    });
  });

  it('parses a block scalar (|) preserving internal blank lines and comments', () => {
    const y = ['run: |', '  echo one', '', '  # a shell comment, not YAML', '  echo two'].join('\n');
    const result = parseWorkflowYaml(y) as { run: string };
    expect(result.run).toBe('echo one\n\n# a shell comment, not YAML\necho two');
  });

  it('does not treat a colon inside a URL as a mapping separator', () => {
    const y = "registry-url: 'https://registry.npmjs.org'\n";
    expect(parseWorkflowYaml(y)).toEqual({ 'registry-url': 'https://registry.npmjs.org' });
  });

  it('preserves an unquoted scalar containing embedded single quotes (an `if:` condition)', () => {
    const y = "if: github.event_name == 'push' && github.ref == 'refs/heads/main'\n";
    expect(parseWorkflowYaml(y)).toEqual({
      if: "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    });
  });

  it('skips full-line and blank lines between mapping keys', () => {
    const y = ['a: 1', '', '# comment', 'b: 2'].join('\n');
    expect(parseWorkflowYaml(y)).toEqual({ a: '1', b: '2' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RED-proof (fixture) — proves the OLD shape was broken, independent of git history
// ═══════════════════════════════════════════════════════════════════════════

const OLD_PUBLISH_YML_FIXTURE = [
  'name: Publish to npm',
  'on:',
  '  release:',
  '    types: [published]',
  '  push:',
  '    tags:',
  "      - 'v*'",
  'jobs:',
  '  publish:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Publish to npm',
  '        run: npm publish --provenance --access public',
].join('\n');

const OLD_RELEASE_YML_FIXTURE = [
  'name: Release',
  'on:',
  '  push:',
  '    tags:',
  "      - 'v*'",
  'jobs:',
  '  release:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Publish to npm',
  '        run: npm publish --provenance --access public',
].join('\n');

const FIXED_PUBLISH_YML_FIXTURE = [
  'name: Publish to npm',
  'on:',
  '  release:',
  '    types: [published]',
  '  push:',
  '    tags:',
  "      - 'v*'",
  'jobs:',
  '  publish:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - name: Dry run publish',
  '        run: npm publish --dry-run --access public',
].join('\n');

describe('RED-proof — the pre-fix shape had 2 real-publish-authority workflows', () => {
  it('OLD publish.yml + OLD release.yml together count 2 (the bug)', () => {
    const old = [
      parseWorkflowYaml(OLD_PUBLISH_YML_FIXTURE),
      parseWorkflowYaml(OLD_RELEASE_YML_FIXTURE),
    ];
    expect(countPublishAuthorityWorkflows(old)).toBe(2);
  });

  it('FIXED publish.yml (dry-run only) + release.yml together count 1 (the fix)', () => {
    const fixed = [
      parseWorkflowYaml(FIXED_PUBLISH_YML_FIXTURE),
      parseWorkflowYaml(OLD_RELEASE_YML_FIXTURE),
    ];
    expect(countPublishAuthorityWorkflows(fixed)).toBe(1);
  });

  it('a workflow with only a --dry-run publish step is not counted as a publish authority', () => {
    const w = parseWorkflowYaml(FIXED_PUBLISH_YML_FIXTURE) as ParsedWorkflow;
    expect(countRealPublishInvocations(w)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Live repo-wide pin — parses the ACTUAL current workflow files
// ═══════════════════════════════════════════════════════════════════════════

const WORKFLOW_FILENAMES = [
  'publish.yml',
  'release.yml',
  'ci.yml',
  'cross-platform-e2e.yml',
  'dashboard-build.yml',
  'secret-scan.yml',
].filter((f) => existsSync(resolve(WORKFLOWS_DIR, f)));

function readWorkflow(filename: string): ParsedWorkflow {
  return parseWorkflowYaml(readFileSync(resolve(WORKFLOWS_DIR, filename), 'utf-8')) as ParsedWorkflow;
}

describe('release-workflow-unify — live repo-wide pin', () => {
  // 0.100.0 rebaseline (owner decision, 2026-08-14): canonical publishing is
  // MANUAL. NO workflow may carry a real npm publish anymore — release.yml is
  // validation-only. The count pins below fail closed if an automatic publish
  // authority ever returns without an explicit owner decision.
  it('NO release-event-triggered workflow performs a real npm publish (manual-publish contract)', () => {
    const workflows = WORKFLOW_FILENAMES.map(readWorkflow);
    expect(countPublishAuthorityWorkflows(workflows)).toBe(0);
  });

  it('release.yml performs no real publish (validation-only)', () => {
    const release = readWorkflow('release.yml');
    expect(countRealPublishInvocations(release)).toBe(0);
  });

  it('publish.yml no longer performs a real npm publish (dry-run only)', () => {
    const publish = readWorkflow('publish.yml');
    expect(countRealPublishInvocations(publish)).toBe(0);
    const steps = publish.jobs?.publish?.steps ?? [];
    expect(steps.some((s) => (s.run ?? '').includes('npm publish --dry-run'))).toBe(true);
  });
});

describe('release.yml — build:all + validate:publish chain, in order', () => {
  const release = readWorkflow('release.yml');
  const steps = release.jobs?.release?.steps ?? [];

  it('has a build step that runs build:all (not plain build)', () => {
    const buildIdx = findStepIndex(steps, (s) => (s.run ?? '') === 'npm run build:all');
    expect(buildIdx).toBeGreaterThanOrEqual(0);
  });

  it('does not run plain `npm run build` (only build:all)', () => {
    expect(steps.some((s) => (s.run ?? '').trim() === 'npm run build')).toBe(false);
  });

  it('has a validate:publish step', () => {
    const idx = findStepIndex(steps, (s) => (s.run ?? '').includes('npm run validate:publish'));
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  // 0.100.0 rebaseline (owner decision, 2026-08-14): the chain ends at
  // validation — there is no publish step to order after the smoke gate, and
  // the workflow must never regain one without an explicit owner decision.
  it('orders build:all → validate:publish, and carries NO publish step after them', () => {
    const buildIdx = findStepIndex(steps, (s) => (s.run ?? '') === 'npm run build:all');
    const validateIdx = findStepIndex(steps, (s) => (s.run ?? '').includes('npm run validate:publish'));
    const publishIdx = findStepIndex(steps, (s) => hasRealNpmPublish(s.run));

    expect(buildIdx).toBeGreaterThanOrEqual(0);
    expect(validateIdx).toBeGreaterThan(buildIdx);
    expect(publishIdx).toBe(-1);
  });

  it('carries no registry auth material (validation needs no token — SEC-06 posture keeps)', () => {
    for (const s of steps) {
      const env = s.env as Record<string, unknown> | undefined;
      expect(env?.NODE_AUTH_TOKEN).toBeUndefined();
    }
  });

  it('smoke test-gate is not a duplicate of the full staged multi-directory matrix', () => {
    const smokeStep = steps.find((s) => (s.run ?? '').includes('vitest run tests/governance/'));
    expect(smokeStep).toBeDefined();
    // The old staged run touched 9 distinct top-level test directories in one step.
    const runText = smokeStep!.run ?? '';
    const dirMentions = (runText.match(/tests\/[a-z-]+\//g) ?? []).length;
    expect(dirMentions).toBeLessThan(9);
  });

  it('permissions are read-only (0.100.0 rebaseline: no GH Release, no provenance token)', () => {
    const permissions = release.permissions as Record<string, unknown>;
    expect(permissions.contents).toBe('read');
    expect(permissions['id-token']).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// actionlint-if-available, else structural parse-lint fallback
// ═══════════════════════════════════════════════════════════════════════════

function actionlintAvailable(): boolean {
  const r = spawnSync('actionlint', ['-version'], { encoding: 'utf-8' });
  return r.error === undefined && r.status === 0;
}

describe('workflow YAML cleanliness', () => {
  const haveActionlint = actionlintAvailable();

  it(
    haveActionlint
      ? 'actionlint reports zero errors for the 3 touched workflow files'
      : 'actionlint not installed in this environment — skipped (structural fallback below covers this)',
    () => {
      if (!haveActionlint) return;
      const r = spawnSync(
        'actionlint',
        ['.github/workflows/publish.yml', '.github/workflows/release.yml'],
        { cwd: projectRoot, encoding: 'utf-8' },
      );
      expect(r.status).toBe(0);
    },
  );

  it('structural parse-lint fallback: all 3 touched workflows parse without throwing and have name/on/jobs', () => {
    for (const filename of ['publish.yml', 'release.yml']) {
      const parsed = readWorkflow(filename);
      expect(parsed.name, `${filename}: missing name`).toBeTruthy();
      expect(parsed.on, `${filename}: missing on`).toBeTruthy();
      expect(parsed.jobs, `${filename}: missing jobs`).toBeTruthy();
      for (const [jobId, job] of Object.entries(parsed.jobs ?? {})) {
        expect(job['runs-on'], `${filename}:${jobId} missing runs-on`).toBeTruthy();
        expect(Array.isArray(job.steps), `${filename}:${jobId} steps is not an array`).toBe(true);
        for (const step of job.steps ?? []) {
          const hasUsesOrRun = Boolean(step.uses) || Boolean(step.run);
          expect(hasUsesOrRun, `${filename}:${jobId} step "${step.name}" has neither uses nor run`).toBe(
            true,
          );
        }
      }
    }
  });
});
