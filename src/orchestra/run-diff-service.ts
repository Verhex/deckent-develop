// ═══ run-diff-service — the ONE diff producer (583/N1, GAP-4 closes) ═════════
//
// deckent never showed a real line-level diff anywhere: every internal
// `git diff` was numstat/name-status plumbing, and result-evidence rendered
// counts. This service is the shared "what did the run actually change?"
// answer BOTH surfaces consume (terminal `deckent runs <n> --diff`, API
// `GET /api/run-flow/:flowId/diff` → Desktop diff panel) — no second
// implementation (ADR-G-011), Layer: orchestra/ (api/ and cli/ both import
// here, never each other — ADR-D-004 C3).
//
// Base semantics: `captureGitBase` records `git rev-parse HEAD` into the run
// handle at start time (additive `gitBase` field), so a completed run diffs
// `<base>..worktree` — its own durable footprint. Pre-N1 records (no base)
// fall back to `HEAD..worktree` with an honest `note: 'no-base'`; a non-git
// project answers `note: 'not-a-git-repo'` with zero files, never a throw.
//
// Freeze-class discipline (F-2): every git call is ASYNC spawn with a SIGTERM
// deadline — no spawnSync on any daemon-reachable path. Output is size-capped
// (per-file + total) with explicit `truncated` flags — silent truncation reads
// as "nothing else changed", which would be a lie.

import { spawn } from 'node:child_process';
import { loadRunHandle } from '../core/run-flow-store.js';

const GIT_TIMEOUT_MS = 15_000;
/** Per-file unified-text cap (bytes of text kept). */
export const DIFF_FILE_CAP = 64_000;
/** Whole-diff cap across files. */
export const DIFF_TOTAL_CAP = 512_000;

export interface RunDiffFile {
  readonly path: string;
  /** added | deleted | modified | renamed — derived from the diff headers. */
  readonly status: string;
  /** Unified diff text for this file (headers included), possibly truncated. */
  readonly text: string;
  readonly truncated: boolean;
}

export interface RunDiff {
  /** The commit the run started from (run handle's gitBase) — null when unknown. */
  readonly base: string | null;
  readonly files: readonly RunDiffFile[];
  /** True when the total cap dropped whole files from `files`. */
  readonly truncated: boolean;
  readonly note?: 'no-base' | 'not-a-git-repo';
}

/** Run one git command, async with a SIGTERM deadline; null on any failure. */
function runGit(root: string, args: readonly string[], timeoutMs = GIT_TIMEOUT_MS): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('git', [...args], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    let settled = false;
    const finish = (value: string | null): void => {
      if (!settled) { settled = true; resolve(value); }
    };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(null); }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => { out += d.toString('utf-8'); });
    child.on('error', () => { clearTimeout(timer); finish(null); });
    child.on('close', (code) => { clearTimeout(timer); finish(code === 0 ? out : null); });
  });
}

/**
 * The commit a run starts from — `git rev-parse HEAD`, fail-soft undefined
 * (greenfield/non-git projects run fine without a diff base). Called by the
 * detached start child right before it persists the run handle.
 */
export async function captureGitBase(root: string): Promise<string | undefined> {
  const out = await runGit(root, ['rev-parse', 'HEAD'], 5_000);
  const sha = out?.trim();
  return sha !== undefined && /^[0-9a-f]{40}$/.test(sha) ? sha : undefined;
}

/** Derive a per-file status from its diff header block. */
function fileStatus(block: string): string {
  if (/^new file mode /m.test(block)) return 'added';
  if (/^deleted file mode /m.test(block)) return 'deleted';
  if (/^rename from /m.test(block)) return 'renamed';
  return 'modified';
}

/** Extract the b-side path from a `diff --git a/x b/y` header. */
function filePath(headerLine: string): string {
  const m = /^diff --git a\/.* b\/(.*)$/.exec(headerLine);
  return m?.[1] ?? headerLine;
}

/** Split raw `git diff` output into capped per-file records. */
export function splitUnifiedDiff(raw: string): { files: RunDiffFile[]; truncated: boolean } {
  const files: RunDiffFile[] = [];
  let total = 0;
  let truncatedWhole = false;
  const blocks = raw.split(/^(?=diff --git )/m).filter((b) => b.startsWith('diff --git '));
  for (const block of blocks) {
    if (total >= DIFF_TOTAL_CAP) { truncatedWhole = true; break; }
    const headerLine = block.slice(0, block.indexOf('\n'));
    const kept = block.length > DIFF_FILE_CAP ? block.slice(0, DIFF_FILE_CAP) : block;
    total += kept.length;
    files.push({
      path: filePath(headerLine),
      status: fileStatus(block),
      text: kept,
      truncated: kept.length < block.length,
    });
  }
  return { files, truncated: truncatedWhole };
}

/**
 * The run's real footprint as a unified diff. Read-only; tolerant end-to-end.
 */
export async function computeRunDiff(root: string, flowId: string): Promise<RunDiff> {
  const inRepo = (await runGit(root, ['rev-parse', '--is-inside-work-tree'], 5_000))?.trim() === 'true';
  if (!inRepo) return { base: null, files: [], truncated: false, note: 'not-a-git-repo' };

  let base: string | undefined;
  try {
    base = loadRunHandle(root, flowId)?.gitBase;
  } catch {
    base = undefined;
  }

  const raw = await runGit(root, ['diff', '--no-color', base ?? 'HEAD']);
  if (raw === null) return { base: base ?? null, files: [], truncated: false, ...(base === undefined ? { note: 'no-base' as const } : {}) };
  const { files, truncated } = splitUnifiedDiff(raw);
  return { base: base ?? null, files, truncated, ...(base === undefined ? { note: 'no-base' as const } : {}) };
}
