// ─── CLI: deckent sync — provenance truth (MASTER 7104 SYNC-PROVENANCE-TRUTH-001) ──
//
// Hermetic, REAL-FS proof that `deckent sync --json`'s `summary` (built by
// `buildSyncAggregate`) is the single source of truth for adapter/prompt/
// manifest/skill/git counts, and that the text-mode presentation built on top
// of it (per-conflict lines, the one-line missing-baseline notice, the
// aggregate footer) matches that summary exactly in both languages.
//
// No node:fs mock: every fixture is a real tmpdir project (DECKENT.md +
// .deckent/config.json), and `syncBuiltinAgentPrompts` / `syncBuiltinAgentManifests`
// read the REAL `src/core/builtins/agents/` tree via their own
// `resolveBuiltinAgentsDir()` (derived from each module's own `import.meta.url`,
// not test-overridable) — so this proves the wiring against the actual builtin
// agent catalog, not a fixture stand-in. `../../src/core/utils.js` is mocked
// (mirrors tests/cli/sync.test.ts) purely to no-op the CLAUDE.md/AGENTS.md
// @DECKENT.md import-line mutation, which is orthogonal to what this file proves.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

vi.mock('../../src/core/utils.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/core/utils.js')>(),
  ensureDeckentImport: vi.fn(),
  countBrainLines: vi.fn().mockReturnValue(100),
}));

import { registerSync } from '../../src/cli/commands/sync.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { isSyncAggregateSummary } from '../../src/cli/helpers/sync-aggregate.js';
import type { SyncAggregateSummary } from '../../src/cli/helpers/sync-aggregate.js';
import type { AgentCapabilitiesSyncReport, SyncResult } from '../../src/cli/commands/sync.js';
import type { AgentManifestSyncReport } from '../../src/core/agent-manifest-sync.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

// The real builtin-agent catalog this worktree's src/core/agent-prompt-sync.ts
// and agent-manifest-sync.ts resolve on their own (import.meta.url-derived,
// not overridable) — used only to compute expected counts dynamically, never
// to fake or seed anything.
const BUILTIN_AGENTS_DIR = fileURLToPath(new URL('../../src/core/builtins/agents', import.meta.url));

/** Number of builtin agent dirs that carry a non-empty `fileName` — mirrors the
 * exact `builtinContent === undefined || builtinContent.trim().length === 0`
 * skip condition both core sync modules apply, so this is never a hardcoded
 * agent count. */
function countSyncableBuiltinAgents(fileName: 'PROMPT.md' | 'agent.json'): number {
  const entries = readdirSync(BUILTIN_AGENTS_DIR, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = join(BUILTIN_AGENTS_DIR, entry.name, fileName);
    if (existsSync(filePath) && readFileSync(filePath, 'utf8').trim().length > 0) count++;
  }
  return count;
}

function listSyncableBuiltinAgentIds(): string[] {
  const entries = readdirSync(BUILTIN_AGENTS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => {
      const p = join(BUILTIN_AGENTS_DIR, id, 'PROMPT.md');
      return existsSync(p) && readFileSync(p, 'utf8').trim().length > 0;
    })
    .sort();
}

let ORIGINAL_CWD: string;
const fixtureDirs: string[] = [];

// `getLanguage()` (src/cli/helpers/messages.ts's `resolveLanguage`) falls back
// through DECKENT_LANGUAGE > DECKENT_LANG > configLanguage > LC_ALL > LANG, so
// an EN-expecting assertion is only hermetic if DECKENT_LANGUAGE is pinned —
// a lane/CI shell with e.g. LANG=tr_TR.UTF-8 would otherwise flip every
// EN-language expectation to TR non-deterministically. Every test defaults to
// 'en'; the TR test overrides it for its own body only. The prior value
// (almost always undefined in a real run) is captured and restored, never
// just deleted, so this file never leaks an ambient env mutation onto tests
// that run after it in the same worker process.
let PRIOR_DECKENT_LANGUAGE: string | undefined;

beforeAll(() => {
  ORIGINAL_CWD = process.cwd();
});

beforeEach(() => {
  PRIOR_DECKENT_LANGUAGE = process.env['DECKENT_LANGUAGE'];
  process.env['DECKENT_LANGUAGE'] = 'en';
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  for (const dir of fixtureDirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup — a leftover tmp fixture dir is harmless
    }
  }
  if (PRIOR_DECKENT_LANGUAGE === undefined) {
    delete process.env['DECKENT_LANGUAGE'];
  } else {
    process.env['DECKENT_LANGUAGE'] = PRIOR_DECKENT_LANGUAGE;
  }
  vi.restoreAllMocks();
});

/** Creates a fresh real tmpdir project (DECKENT.md + .deckent/config.json) and chdirs into it. */
function newProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'deckent-sync-truth-'));
  fixtureDirs.push(dir);
  writeFileSync(join(dir, 'DECKENT.md'), '# Fixture Project\n', 'utf8');
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  writeFileSync(join(dir, '.deckent', 'config.json'), '{}', 'utf8');
  process.chdir(dir);
  return dir;
}

// ─── Real-git setup helper (unborn-branch fixture, 7104 correction-3) ────────
// Async spawn only — used exclusively in test setup (hermeticity), the same
// pattern tests/cli/sync-git-detection.test.ts already establishes.

function gitRunTruth(cwd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += String(d); });
    child.stderr.on('data', (d: Buffer) => { stderr += String(d); });
    child.on('error', () => resolve({ code: -1, stdout, stderr }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * A fresh real project (`newProject()`) turned into a real git repository
 * with `git init -q` and NO commit at all — HEAD stays unborn — plus a
 * recorded sprint file so `getLastSprintTimestamp` (src/cli/commands/sync.ts)
 * finds one via its mtime fallback (git log on the unborn branch also fails
 * for that path, same as for `--since`). Sprint-record shape mirrors
 * `proof/actual-sync-cli-v1.mjs`'s case 5/6 fixture
 * (`.brain/sprints/sprint-0001.md`, a private FIXTURE record, not a
 * canonical sprint).
 */
async function setupUnbornRepoWithSprint(): Promise<string> {
  const dir = newProject();
  expect((await gitRunTruth(dir, ['init', '-q'])).code).toBe(0);
  // Hermeticity: never let a host/global hook or gpg prompt touch the test.
  await gitRunTruth(dir, ['config', '--local', 'core.hooksPath', '/dev/null']);
  await gitRunTruth(dir, ['config', '--local', 'commit.gpgsign', 'false']);

  mkdirSync(join(dir, '.brain', 'sprints'), { recursive: true });
  writeFileSync(
    join(dir, '.brain', 'sprints', 'sprint-0001.md'),
    '# fixture sprint record (private, not a canonical sprint)\n',
    'utf8',
  );
  return dir;
}

// ─── Command runner ──────────────────────────────────────────────────────────

interface RunResult {
  /** Every non-empty line written to stdout, in order. */
  lines: string[];
  /** The parsed `deckent sync --json` stdout payload, if `--json` was passed. */
  output: (Record<string, unknown> & { summary?: SyncAggregateSummary }) | undefined;
  /** Shorthand for `output.summary`. */
  summary: SyncAggregateSummary | undefined;
}

/** Runs `deckent sync <args>` through a fresh Command instance and captures
 * every process.stdout.write call (both `print()` and `console.log()` route
 * through it) — the same capture technique tests/cli/limits-command.test.ts
 * already uses for this codebase's other `--json` CLI commands. */
async function runSync(args: string[]): Promise<RunResult> {
  const writes: string[] = [];
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  });
  // Under vitest the worker's `console` is intercepted and forwarded to the runner, so the
  // `--json` line (emitted via console.log in sync.ts) never reaches process.stdout.write.
  // Capture it explicitly; each call becomes one line, matching a real terminal.
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
    writes.push(`${parts.map((part) => (typeof part === 'string' ? part : String(part))).join(' ')}\n`);
  });
  try {
    const program = new Command();
    program.exitOverride();
    registerSync(program);
    await program.parseAsync(['sync', ...args], { from: 'user' });
  } finally {
    logSpy.mockRestore();
    writeSpy.mockRestore();
  }

  const lines = writes.join('').split('\n').filter((line) => line.length > 0);

  let output: (Record<string, unknown> & { summary?: SyncAggregateSummary }) | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      output = JSON.parse(lines[i] as string) as Record<string, unknown> & { summary?: SyncAggregateSummary };
      break;
    } catch {
      continue;
    }
  }

  return { lines, output, summary: output?.summary };
}

const runJsonSync = () => runSync(['--json']);
const runTextSync = () => runSync([]);

// ─── The one-line aggregate footer's EN template, as a parser ──────────────

const AGGREGATE_LINE_RE =
  /^Sync summary: (\d+) adapter\(s\) · (\d+) skill\(s\) · (\d+) commit\(s\) · (\d+) conflict\(s\) · (\d+) without baseline$/;

function parseAggregateLine(line: string): {
  adapters: number;
  skills: number;
  commits: number;
  conflicts: number;
  missing: number;
} {
  const match = AGGREGATE_LINE_RE.exec(line);
  if (!match) {
    throw new Error(`line did not match the sync.aggregate_summary EN template: ${JSON.stringify(line)}`);
  }
  return {
    adapters: Number(match[1]),
    skills: Number(match[2]),
    commits: Number(match[3]),
    conflicts: Number(match[4]),
    missing: Number(match[5]),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CLI: deckent sync — provenance truth (7104)', () => {
  it('fresh project, no git: creates every builtin agent prompt/manifest, no conflicts, git summary is null', async () => {
    const dir = newProject();
    const promptCount = countSyncableBuiltinAgents('PROMPT.md');
    const manifestCount = countSyncableBuiltinAgents('agent.json');
    expect(promptCount).toBeGreaterThan(0);

    const { summary } = await runJsonSync();
    expect(summary).toBeDefined();
    const s = summary as SyncAggregateSummary;

    expect(s.git).toBeNull();
    expect(s.warnings).toBeGreaterThanOrEqual(1);
    expect(s.agentPrompts.created).toBe(promptCount);
    expect(s.agentManifests.created).toBe(manifestCount);
    expect(s.conflicts).toEqual([]);
    expect(s.missingBaseline).toEqual({ count: 0, agentIds: [] });

    for (const id of listSyncableBuiltinAgentIds()) {
      const shadowPath = join(dir, '.deckent', 'agents', id, 'PROMPT.md');
      const builtinPath = join(BUILTIN_AGENTS_DIR, id, 'PROMPT.md');
      expect(existsSync(shadowPath)).toBe(true);
      expect(readFileSync(shadowPath, 'utf8')).toBe(readFileSync(builtinPath, 'utf8'));
    }
  });

  it('is idempotent: reruns create/update nothing and the third run reproduces the second run\'s summary exactly', async () => {
    newProject();

    await runJsonSync(); // first run: materializes every shadow + baseline
    const second = await runJsonSync();
    const third = await runJsonSync();

    const secondSummary = second.summary as SyncAggregateSummary;
    const thirdSummary = third.summary as SyncAggregateSummary;

    expect(secondSummary.agentPrompts.created).toBe(0);
    expect(secondSummary.agentPrompts.updated).toBe(0);
    expect(secondSummary.agentManifests.created).toBe(0);
    expect(secondSummary.agentManifests.updated).toBe(0);
    expect(secondSummary.conflicts).toEqual([]);
    expect(secondSummary.missingBaseline).toEqual({ count: 0, agentIds: [] });

    expect(thirdSummary).toEqual(secondSummary);
  });

  it('missing-baseline shadow is reported once, is NOT a conflict, and its content is preserved byte-for-byte', async () => {
    const dir = newProject();
    await runJsonSync(); // establishes a real baseline for every agent

    const [pickedId] = listSyncableBuiltinAgentIds();
    const stateFilePath = join(dir, '.deckent', 'agents', '.prompt-sync-state.json');
    expect(existsSync(stateFilePath)).toBe(true);
    rmSync(stateFilePath, { force: true }); // wipes recorded provenance for every agent

    const shadowPath = join(dir, '.deckent', 'agents', pickedId as string, 'PROMPT.md');
    const beforeEdit = readFileSync(shadowPath, 'utf8');
    const edited = `${beforeEdit}\n<!-- local note, no recorded baseline -->\n`;
    writeFileSync(shadowPath, edited, 'utf8');

    const { summary } = await runJsonSync();
    const s = summary as SyncAggregateSummary;

    expect(s.missingBaseline).toEqual({ count: 1, agentIds: [pickedId] });
    expect(s.conflicts).toEqual([]);
    expect(readFileSync(shadowPath, 'utf8')).toBe(edited);

    const { lines } = await runTextSync();
    const expectedLine = getMessage('sync.missing_baseline_summary', 'en', {
      count: '1',
      ids: pickedId as string,
    });
    expect(lines.filter((line) => line === expectedLine)).toHaveLength(1);
    expect(lines.some((line) => line.startsWith('Conflict:'))).toBe(false);
  });

  it('a shadow that diverges from BOTH the recorded baseline and the builtin is a real local-edit conflict', async () => {
    const dir = newProject();
    await runJsonSync(); // establishes a real (correct) baseline for every agent

    const [pickedId] = listSyncableBuiltinAgentIds();
    const stateFilePath = join(dir, '.deckent', 'agents', '.prompt-sync-state.json');
    const state = JSON.parse(readFileSync(stateFilePath, 'utf8')) as {
      agents: Record<string, { builtinHash: string; syncedAt: string }>;
    };
    expect(state.agents[pickedId as string]).toBeDefined();
    // Simulate the builtin having changed since the last sync: the recorded
    // baseline hash no longer matches anything real.
    state.agents[pickedId as string]!.builtinHash = '0'.repeat(40);
    writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');

    const shadowPath = join(dir, '.deckent', 'agents', pickedId as string, 'PROMPT.md');
    const beforeEdit = readFileSync(shadowPath, 'utf8');
    const edited = `${beforeEdit}\n<!-- genuinely local edit -->\n`;
    writeFileSync(shadowPath, edited, 'utf8');

    const { summary } = await runJsonSync();
    const s = summary as SyncAggregateSummary;

    expect(s.conflicts).toContainEqual({ scope: 'agent-prompt', agentId: pickedId, kind: 'local-edit' });
    expect(s.missingBaseline).toEqual({ count: 0, agentIds: [] });
    expect(readFileSync(shadowPath, 'utf8')).toBe(edited);

    const { lines } = await runTextSync();
    const expectedLine = getMessage('sync.conflict_local_edit', 'en', {
      scope: getMessage('sync.scope_prompt', 'en'),
      id: pickedId as string,
      path: shadowPath,
    });
    expect(lines).toContain(expectedLine);
  });

  it('the text-mode aggregate footer is numerically identical to an equivalent fresh run\'s JSON summary', async () => {
    newProject();
    const { summary } = await runJsonSync();
    const s = summary as SyncAggregateSummary;

    newProject(); // a second, equally-fresh sibling fixture — same starting state
    const { lines } = await runTextSync();
    const footerLine = lines.find((line) => AGGREGATE_LINE_RE.test(line));
    expect(footerLine).toBeDefined();
    const parsed = parseAggregateLine(footerLine as string);

    expect(parsed.adapters).toBe(s.adapters.synced);
    expect(parsed.skills).toBe(s.skills.created + s.skills.updated);
    expect(parsed.commits).toBe(s.git ? s.git.commits : 0);
    expect(parsed.conflicts).toBe(s.conflicts.length);
    expect(parsed.missing).toBe(s.missingBaseline.count);
  });

  it('prints Turkish-localized lines when DECKENT_LANGUAGE=tr', async () => {
    process.env['DECKENT_LANGUAGE'] = 'tr';
    newProject();

    const { lines } = await runTextSync();

    expect(lines).toContain(getMessage('sync.complete', 'tr'));
    expect(lines).toContain(getMessage('sync.not_git_repo', 'tr'));
    expect(lines.some((line) => line.startsWith('Senkron özeti:'))).toBe(true);
  });

  // ─── F1 (external review, 7104): a shadow the manifest sync kept local ────
  // (missing baseline OR a real local edit) must never be read or migrated
  // by the downstream capabilities sync either — it stays byte-untouched and
  // is reported as `protected`, never as `migrated`.

  it('manifest shadow with missing baseline is kept byte-identical and never migrated', async () => {
    const dir = newProject();
    await runJsonSync(); // clean sync: materializes every shadow + baseline

    const stateFilePath = join(dir, '.deckent', 'agents', '.manifest-sync-state.json');
    const state = JSON.parse(readFileSync(stateFilePath, 'utf8')) as {
      agents: Record<string, { builtinHash: string; syncedAt: string }>;
    };
    const [pickedId] = Object.keys(state.agents).sort();
    expect(pickedId).toBeDefined();

    // Rewrite the shadow as a v2 manifest (capabilities stripped) carrying an
    // unmistakable local marker, then wipe its recorded sync baseline so
    // provenance can no longer be verified — exactly what syncBuiltinAgentManifests
    // classifies as kind 'missing-baseline'.
    const shadowPath = join(dir, '.deckent', 'agents', pickedId as string, 'agent.json');
    const manifest = JSON.parse(readFileSync(shadowPath, 'utf8')) as Record<string, unknown>;
    delete manifest['capabilities'];
    manifest['_privateNote'] = 'locally owned — do not overwrite';
    const edited = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(shadowPath, edited, 'utf8');

    delete state.agents[pickedId as string];
    writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');

    const { output } = await runJsonSync();
    expect(readFileSync(shadowPath, 'utf8')).toBe(edited);

    const manifestSync = output?.['agentManifestSync'] as AgentManifestSyncReport;
    const conflict = manifestSync.conflicts.find((c) => c.agentId === pickedId);
    expect(conflict).toBeDefined();
    expect(conflict?.kind).toBe('missing-baseline');

    const capsSync = output?.['agentCapabilitiesSync'] as AgentCapabilitiesSyncReport;
    expect(capsSync.protected).toContain(pickedId);
    expect(capsSync.migrated).not.toContain(pickedId);

    const { lines } = await runTextSync();
    expect(readFileSync(shadowPath, 'utf8')).toBe(edited);
    const expectedLine = getMessage('sync.capabilities_protected', 'en', {
      count: '1',
      ids: pickedId as string,
    });
    expect(lines).toContain(expectedLine);
  });

  it('manifest shadow with a real local edit is kept byte-identical and never migrated', async () => {
    const dir = newProject();
    await runJsonSync(); // clean sync: materializes every shadow + baseline

    const stateFilePath = join(dir, '.deckent', 'agents', '.manifest-sync-state.json');
    const state = JSON.parse(readFileSync(stateFilePath, 'utf8')) as {
      agents: Record<string, { builtinHash: string; syncedAt: string }>;
    };
    const [pickedId] = Object.keys(state.agents).sort();
    expect(pickedId).toBeDefined();
    expect(state.agents[pickedId as string]).toBeDefined();
    // Simulate the builtin having changed since the last sync: the recorded
    // baseline hash no longer matches anything real, so a shadow that now
    // differs from both it and the current builtin is a genuine local edit.
    state.agents[pickedId as string]!.builtinHash = 'f'.repeat(40);
    writeFileSync(stateFilePath, JSON.stringify(state, null, 2), 'utf8');

    const shadowPath = join(dir, '.deckent', 'agents', pickedId as string, 'agent.json');
    const manifest = JSON.parse(readFileSync(shadowPath, 'utf8')) as Record<string, unknown>;
    delete manifest['capabilities'];
    manifest['_privateNote'] = 'locally owned — do not overwrite';
    const edited = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(shadowPath, edited, 'utf8');

    const { output } = await runJsonSync();
    expect(readFileSync(shadowPath, 'utf8')).toBe(edited);

    const manifestSync = output?.['agentManifestSync'] as AgentManifestSyncReport;
    const conflict = manifestSync.conflicts.find((c) => c.agentId === pickedId);
    expect(conflict).toBeDefined();
    expect(conflict?.kind).toBe('local-edit');

    const capsSync = output?.['agentCapabilitiesSync'] as AgentCapabilitiesSyncReport;
    expect(capsSync.protected).toContain(pickedId);
    expect(capsSync.migrated).not.toContain(pickedId);
  });
});

// ─── Git provenance truth — unborn branch (7104 correction-3) ────────────────
//
// A real repository whose branch has never received a commit (`git init`,
// no commit at all) makes `git log --since=...` fail (exit 128, "your
// current branch ... does not have any commits yet") — the SAME shape of
// failure `probeCommitsSince` types as `GIT_LOG_FAILED`. This must surface
// as the typed `unavailable` warning, NEVER as `sync.no_changes` — a silent
// "no changes" over an unverified working tree is exactly the bug 7104
// closes. Real git, real fs, no mocks (beyond the pre-existing
// core/utils.js no-op at the top of this file).

describe('git provenance truth — unborn branch (7104 correction-3)', () => {
  it('(a) --json: gitChanges + summary report GIT_LOG_FAILED as unavailable, not a successful zero', async () => {
    await setupUnbornRepoWithSprint();

    const { output, summary } = await runJsonSync();

    expect(output).toBeDefined();
    const gitChanges = output?.['gitChanges'] as SyncResult | undefined;
    expect(gitChanges).toBeDefined();
    expect(gitChanges?.commits).toBe(0);
    expect(gitChanges?.detection).toEqual({
      mode: 'unavailable',
      issue: { code: 'GIT_LOG_FAILED', detail: expect.any(String) },
    });
    expect(gitChanges?.detection.issue?.detail.length ?? 0).toBeGreaterThan(0);

    expect(summary).toBeDefined();
    const s = summary as SyncAggregateSummary;
    expect(s.git?.detection).toBe('unavailable');
    expect(s.git?.issueCode).toBe('GIT_LOG_FAILED');
    expect(isSyncAggregateSummary(summary)).toBe(true);
  });

  it('(b) text (EN): prints the unavailable warning with the exact detail from the same repo state, never "no changes"', async () => {
    await setupUnbornRepoWithSprint();

    const { output: jsonOutput } = await runJsonSync();
    const gitChanges = jsonOutput?.['gitChanges'] as SyncResult | undefined;
    const detail = gitChanges?.detection.issue?.detail;
    expect(typeof detail).toBe('string');
    expect((detail as string).length).toBeGreaterThan(0);

    const { lines } = await runTextSync();
    const expectedLine = getMessage('sync.git_change_detection_unavailable', 'en', {
      code: 'GIT_LOG_FAILED',
      detail: detail as string,
    });
    expect(lines).toContain(expectedLine);
    expect(lines).not.toContain(getMessage('sync.no_changes', 'en'));
  });

  it('(c) text (TR): same, localized', async () => {
    process.env['DECKENT_LANGUAGE'] = 'tr';
    await setupUnbornRepoWithSprint();

    const { output: jsonOutput } = await runJsonSync();
    const gitChanges = jsonOutput?.['gitChanges'] as SyncResult | undefined;
    const detail = gitChanges?.detection.issue?.detail;
    expect(typeof detail).toBe('string');
    expect((detail as string).length).toBeGreaterThan(0);

    const { lines } = await runTextSync();
    const expectedLine = getMessage('sync.git_change_detection_unavailable', 'tr', {
      code: 'GIT_LOG_FAILED',
      detail: detail as string,
    });
    expect(lines).toContain(expectedLine);
    expect(lines).not.toContain(getMessage('sync.no_changes', 'tr'));
  });
});
