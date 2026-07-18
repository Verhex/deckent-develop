// ═══ git-workflow-service — the ONE git surface for human-sealed commits ═════
//
// 583/N4 (KARAR-2, Alperen 2026-07-17: "İKİSİ-BİRDEN"). deckent had NO
// user-facing git surface — every git use was internal plumbing
// (honest-gate/result-assembler numstat, run-diff-service N1) and the only
// operator path was the bash-detour. This service is the shared use-case layer
// (587 app-service-layer, same pattern as run-flow-decision-service /
// run-diff-service): the native chat tools (deckent_git_*) and the CLI's
// post-run `runs <n> --commit` flow BOTH consume it — a second implementation
// never exists.
//
// Discipline:
//  - every subprocess is async spawn + SIGTERM deadline (F-2 freeze class —
//    this runs on REPL/CLI interactive paths);
//  - array-args, shell:false (ADR-G-002);
//  - fail-soft honesty: a non-git directory answers `note:'not-a-git-repo'`
//    (run-diff-service's own vocabulary), a failing git command returns its
//    stderr — never a silent success;
//  - PUSH IS OUT OF SCOPE by design: publishing stays a deliberate human act
//    outside deckent's tool surface (recorded in MASTER-PLAN 583/N4).

import { spawn } from 'node:child_process';
// Designed store consumer (KNOWN_CONSUMERS-pinned, run-diff-service precedent):
// the flow-aware proposal joins the run's own footprint base (gitBase, N1).
import { loadRunHandle } from '../core/run-flow-store.js';

const GIT_TIMEOUT_MS = 15_000;
/** Proposal-subject cap — a git subject line should stay scannable. */
const SUBJECT_CAP = 72;
/** Diff text cap for the read-only review surface (mirrors N1's per-file cap). */
export const GIT_DIFF_TEXT_CAP = 64_000;

export interface GitRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Run one git command — async, SIGTERM deadline, stderr captured (honest
 *  failures). `code:-1` = spawn failure or timeout. */
export function runGitCapture(
  root: string,
  args: readonly string[],
  timeoutMs = GIT_TIMEOUT_MS,
): Promise<GitRunResult> {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn('git', [...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      resolvePromise({ code: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err) });
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: GitRunResult): void => {
      if (!settled) { settled = true; resolvePromise(result); }
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ code: -1, stdout, stderr: `git ${args[0] ?? ''}: timed out after ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString('utf-8'); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });
    child.on('error', (err: Error) => { clearTimeout(timer); finish({ code: -1, stdout, stderr: err.message }); });
    child.on('close', (code) => { clearTimeout(timer); finish({ code: code ?? -1, stdout, stderr }); });
  });
}

async function isGitRepo(root: string): Promise<boolean> {
  const probe = await runGitCapture(root, ['rev-parse', '--is-inside-work-tree'], 5_000);
  return probe.code === 0 && probe.stdout.trim() === 'true';
}

// ─── status ──────────────────────────────────────────────────────────────────

export interface GitStatusEntry {
  path: string;
  /** Two-char XY code from porcelain v1 (`M `, ` M`, `??`, `A `, …). */
  code: string;
}

export interface GitWorkflowStatus {
  note?: 'not-a-git-repo';
  branch?: string;
  ahead?: number;
  behind?: number;
  entries: GitStatusEntry[];
  clean: boolean;
}

/** `git status --porcelain=v1 --branch` parsed — the silent-tier read. */
export async function gitWorkflowStatus(root: string): Promise<GitWorkflowStatus> {
  if (!(await isGitRepo(root))) return { note: 'not-a-git-repo', entries: [], clean: true };
  const res = await runGitCapture(root, ['status', '--porcelain=v1', '--branch']);
  if (res.code !== 0) return { note: 'not-a-git-repo', entries: [], clean: true };
  const entries: GitStatusEntry[] = [];
  let branch: string | undefined;
  let ahead: number | undefined;
  let behind: number | undefined;
  for (const line of res.stdout.split('\n')) {
    if (line.length === 0) continue;
    if (line.startsWith('## ')) {
      const head = line.slice(3);
      branch = (head.split('...')[0] ?? head).trim();
      const aheadMatch = /ahead (\d+)/.exec(head);
      const behindMatch = /behind (\d+)/.exec(head);
      if (aheadMatch) ahead = Number(aheadMatch[1]);
      if (behindMatch) behind = Number(behindMatch[1]);
      continue;
    }
    // porcelain v1: XY<space>path (rename: `XY old -> new`)
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    const path = rest.includes(' -> ') ? (rest.split(' -> ')[1] ?? rest) : rest;
    entries.push({ path, code });
  }
  return {
    ...(branch !== undefined ? { branch } : {}),
    ...(ahead !== undefined ? { ahead } : {}),
    ...(behind !== undefined ? { behind } : {}),
    entries,
    clean: entries.length === 0,
  };
}

// ─── log ─────────────────────────────────────────────────────────────────────

export interface GitLogEntry {
  sha: string;
  subject: string;
  author: string;
  date: string;
}

/** ASCII unit-separator — cannot appear in a git subject/author, so the
 *  4-field pretty-format splits unambiguously. */
const LOG_FIELD_SEP = '\u001f';
export const GIT_LOG_DEFAULT_LIMIT = 10;
export const GIT_LOG_MAX_LIMIT = 100;

/** `git log -n <limit>` parsed — the silent-tier read. Empty array on a
 *  repo with no commits (honest, not an error). */
export async function gitWorkflowLog(root: string, limit = GIT_LOG_DEFAULT_LIMIT): Promise<GitLogEntry[] | { note: 'not-a-git-repo' }> {
  if (!(await isGitRepo(root))) return { note: 'not-a-git-repo' };
  const n = Math.max(1, Math.min(Math.floor(limit), GIT_LOG_MAX_LIMIT));
  const res = await runGitCapture(root, [
    'log', `-n${n}`, `--pretty=format:%h${LOG_FIELD_SEP}%s${LOG_FIELD_SEP}%an${LOG_FIELD_SEP}%cI`,
  ]);
  if (res.code !== 0) return []; // e.g. unborn HEAD — no commits yet
  const out: GitLogEntry[] = [];
  for (const line of res.stdout.split('\n')) {
    if (line.length === 0) continue;
    const [sha, subject, author, date] = line.split(LOG_FIELD_SEP);
    if (sha !== undefined && subject !== undefined && author !== undefined && date !== undefined) {
      out.push({ sha, subject, author, date });
    }
  }
  return out;
}

// ─── diff (read-only review text) ────────────────────────────────────────────

export interface GitWorkflowDiff {
  note?: 'not-a-git-repo';
  text: string;
  truncated: boolean;
}

/** Working-tree diff (optionally staged-only) as review text, capped —
 *  the "incele" half of the incele→commit flow, silent-tier. */
export async function gitWorkflowDiff(root: string, opts: { staged?: boolean } = {}): Promise<GitWorkflowDiff> {
  if (!(await isGitRepo(root))) return { note: 'not-a-git-repo', text: '', truncated: false };
  const args = opts.staged === true ? ['diff', '--staged'] : ['diff', 'HEAD'];
  let res = await runGitCapture(root, args);
  if (res.code !== 0 && opts.staged !== true) {
    // Unborn HEAD (no commits): `diff HEAD` fails — fall back to plain worktree diff.
    res = await runGitCapture(root, ['diff']);
  }
  if (res.code !== 0) return { text: '', truncated: false };
  const truncated = res.stdout.length > GIT_DIFF_TEXT_CAP;
  return { text: truncated ? res.stdout.slice(0, GIT_DIFF_TEXT_CAP) : res.stdout, truncated };
}

// ─── add (confirm-tier) ──────────────────────────────────────────────────────

export interface GitAddOutcome {
  ok: boolean;
  note?: 'not-a-git-repo';
  /** Staged-entry count AFTER the add (from `git diff --staged --name-only`). */
  staged: number;
  error?: string;
}

/** Stage paths (or everything under `root` with `-A -- .`). The explicit
 *  `.` pathspec is a SAFETY line: since git 2.0 a bare `add -A` from a
 *  subdirectory stages the WHOLE parent worktree — a project living inside a
 *  larger repo must never silently stage its host's files. */
export async function gitWorkflowAdd(root: string, paths?: readonly string[]): Promise<GitAddOutcome> {
  if (!(await isGitRepo(root))) return { ok: false, note: 'not-a-git-repo', staged: 0 };
  const args = paths !== undefined && paths.length > 0
    ? ['add', '--', ...paths]
    : ['add', '-A', '--', '.'];
  const res = await runGitCapture(root, args);
  if (res.code !== 0) return { ok: false, staged: 0, error: res.stderr.trim() || `git add exited ${res.code}` };
  const staged = await runGitCapture(root, ['diff', '--staged', '--name-only']);
  const count = staged.code === 0 ? staged.stdout.split('\n').filter((l) => l.length > 0).length : 0;
  return { ok: true, staged: count };
}

// ─── commit (confirm-tier — the human seal itself) ──────────────────────────

export interface GitCommitOutcome {
  ok: boolean;
  note?: 'not-a-git-repo';
  sha?: string;
  error?: string;
}

/** `git commit -m <message>` (array-args — the message is never shell-parsed).
 *  Does NOT auto-stage: pair with gitWorkflowAdd so the staged set is an
 *  explicit, reviewable step. */
export async function gitWorkflowCommit(root: string, message: string): Promise<GitCommitOutcome> {
  if (!(await isGitRepo(root))) return { ok: false, note: 'not-a-git-repo' };
  const trimmed = message.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty commit message' };
  const res = await runGitCapture(root, ['commit', '-m', trimmed]);
  if (res.code !== 0) {
    return { ok: false, error: (res.stderr.trim() || res.stdout.trim()) || `git commit exited ${res.code}` };
  }
  const head = await runGitCapture(root, ['rev-parse', '--short', 'HEAD'], 5_000);
  return { ok: true, ...(head.code === 0 ? { sha: head.stdout.trim() } : {}) };
}

// ─── commit proposal (the incele→commit bridge, N1-diff-integrated) ─────────

export interface CommitProposalFile {
  path: string;
  insertions: number;
  deletions: number;
}

export interface CommitProposal {
  note?: 'not-a-git-repo' | 'clean';
  files: CommitProposalFile[];
  insertions: number;
  deletions: number;
  /** Deterministic suggestion — flow intent first, run-id fallback. The
   *  caller (CLI prompt / chat model) may replace it freely. */
  suggestedMessage: string;
}

export interface CommitProposalContext {
  /** The run's NL goal (InboxRow.intentSummary) — becomes the subject. */
  intentSummary?: string;
  /** Flow id — the deterministic fallback subject + the trailer line. */
  flowId?: string;
  /** The run's own footprint base (StoredRunHandleRecord.gitBase, N1). When
   *  set, proposal stats are `<base>..worktree` — the run's OWN feet. */
  baseSha?: string;
}

function buildSubject(context: CommitProposalContext): string {
  const intent = context.intentSummary?.trim().split('\n')[0] ?? '';
  const shortId = context.flowId?.slice(0, 8);
  if (intent.length > 0) {
    return intent.length > SUBJECT_CAP ? `${intent.slice(0, SUBJECT_CAP - 1)}…` : intent;
  }
  return shortId !== undefined ? `deckent: run ${shortId} changes` : 'deckent: run changes';
}

/**
 * Numstat the pending change-set and derive a deterministic commit message.
 * Stats prefer the run's own base (`baseSha..worktree`, N1 semantics); no
 * base → worktree vs HEAD; a clean tree answers `note:'clean'` honestly.
 */
export async function buildCommitProposal(
  root: string,
  context: CommitProposalContext = {},
): Promise<CommitProposal> {
  if (!(await isGitRepo(root))) {
    return { note: 'not-a-git-repo', files: [], insertions: 0, deletions: 0, suggestedMessage: '' };
  }
  const range = context.baseSha !== undefined ? [context.baseSha] : ['HEAD'];
  let res = await runGitCapture(root, ['diff', '--numstat', ...range]);
  if (res.code !== 0) {
    // Unborn HEAD or a gone base — fall back to the plain worktree numstat.
    res = await runGitCapture(root, ['diff', '--numstat']);
  }
  const files: CommitProposalFile[] = [];
  let insertions = 0;
  let deletions = 0;
  if (res.code === 0) {
    for (const line of res.stdout.split('\n')) {
      if (line.length === 0) continue;
      const [ins, del, path] = line.split('\t');
      if (path === undefined) continue;
      const i = ins === '-' ? 0 : Number(ins);
      const d = del === '-' ? 0 : Number(del);
      files.push({ path, insertions: Number.isFinite(i) ? i : 0, deletions: Number.isFinite(d) ? d : 0 });
      insertions += Number.isFinite(i) ? i : 0;
      deletions += Number.isFinite(d) ? d : 0;
    }
  }
  // Untracked files never appear in numstat — count them via status so a
  // brand-new-files-only run does not read as "clean" (an honest miss
  // otherwise). They carry no line counts (git itself has none pre-index).
  const status = await gitWorkflowStatus(root);
  for (const entry of status.entries) {
    if (entry.code === '??' && !files.some((f) => f.path === entry.path)) {
      files.push({ path: entry.path, insertions: 0, deletions: 0 });
    }
  }
  if (files.length === 0) {
    return { note: 'clean', files: [], insertions: 0, deletions: 0, suggestedMessage: '' };
  }
  const subject = buildSubject(context);
  const trailer = context.flowId !== undefined ? `\n\ndeckent-run: ${context.flowId}` : '';
  return { files, insertions, deletions, suggestedMessage: `${subject}${trailer}` };
}

/**
 * Flow-aware proposal for the post-run flow (`runs <n> --commit`): joins the
 * run handle's `gitBase` (N1 — the run's OWN footprint base) so the stats
 * shown before the commit are the same feet `--diff` renders. Plain
 * `buildCommitProposal` stays available for flow-less contexts (chat tools).
 */
export async function buildRunCommitProposal(
  root: string,
  flowId: string,
  intentSummary?: string,
): Promise<CommitProposal> {
  const handle = loadRunHandle(root, flowId);
  return buildCommitProposal(root, {
    flowId,
    ...(intentSummary !== undefined ? { intentSummary } : {}),
    ...(handle?.gitBase !== undefined ? { baseSha: handle.gitBase } : {}),
  });
}
