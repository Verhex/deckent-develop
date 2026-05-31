// ═══ Container Path Sanitizer ═════════════════════════════════════
// Sprint 201 — host-facing container-path leakage gate.
//
// Docker workers run with WORKDIR=/workspace (the project is mounted there,
// read-only — see spawn-backend-docker.ts CONTAINER_WORKSPACE). When a worker
// writes a path INTO a host-facing config file (a hook command in
// .claude/settings.json, a script in package.json, a step in a CI workflow),
// it naturally hard-codes its own container working directory, e.g.
//   "command": "node /workspace/scripts/sync.mjs"
// That path does NOT exist on the user's host machine, so the hook/script
// fails at runtime with MODULE_NOT_FOUND. This is a silent product bug that
// affects BOTH deckent self-dev and end-user projects.
//
// Worker prompts already carry a prevention rule (prompt-god-template.ts:285),
// but a prompt rule is advisory — this module is the deterministic post-process
// gate that guarantees the fix. Pure-core where possible; the fs sweep is
// synchronous and acts only on the small set of host-facing files.

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Constants ─────────────────────────────────────────────────────

/**
 * The container workspace mount point — must match
 * `spawn-backend-docker.ts` CONTAINER_WORKSPACE. Any occurrence of this
 * prefix inside a host-facing artifact is a leak.
 */
export const CONTAINER_WORKSPACE = '/workspace';

/**
 * Portable replacement. Claude Code expands `$CLAUDE_PROJECT_DIR` in hook
 * command strings and the shell expands it in package.json scripts / CI run
 * steps, so it resolves correctly on the host regardless of where the project
 * lives. A relative path would also work in some contexts, but the env-var
 * form is unambiguous across hooks, scripts, and workflows.
 */
export const PORTABLE_PROJECT_DIR = '$CLAUDE_PROJECT_DIR';

/** Alias retained for callers/tests that reference the portable token by a
 *  host-centric name. Same value as {@link PORTABLE_PROJECT_DIR}. */
export const HOST_PROJECT_DIR_TOKEN = PORTABLE_PROJECT_DIR;

/**
 * Audit event channel emitted when a host-facing file's leaked container path
 * is rewritten. Mirrors disk-verify.ts's exported channel constant pattern so
 * the contract lives next to the gate that triggers it.
 */
export const CONTAINER_PATH_SANITIZED_CHANNEL =
  'BRAIN→AUDITOR:CONTAINER_PATH_SANITIZED';

/**
 * Match `/workspace` as a COMPLETE leading path segment only.
 *
 * - Left boundary `(?<![\w.])` — the `/` must NOT be preceded by a word char
 *   or a dot. This protects project-relative paths that legitimately contain a
 *   `workspace` segment, most importantly `.deckent/workspace/IDENTITY.md`
 *   (deckent's own managed dir) and `my-workspace/...`, and nested host paths
 *   like `cd /home/x/workspace/y` (the `/` after `home/x` is preceded by `x`).
 * - Right boundary (positive lookahead) — `/workspace` must be followed by a
 *   path separator, end-of-string, whitespace, or a shell operator/quote/
 *   punctuation. This rewrites `/workspace/foo` and a bare `/workspace`, but
 *   NOT dash/dot SUFFIX paths (`/workspace-old`, `/workspace.bak`) or
 *   `/workspaces/...` (GitHub Codespaces).
 */
export const CONTAINER_WORKSPACE_RE =
  /(?<![\w.])\/workspace(?=\/|$|\s|["'`)\]};:&|><,])/g;

/**
 * Relative paths (from project root) of files a worker may legitimately write
 * that are then consumed on the HOST. These are the only files swept — source
 * files keeping `/workspace` in a comment or test fixture are out of scope.
 */
export function isHostFacingFile(relPath: string): boolean {
  // Normalize windows separators and strip a leading ./ or /workspace/ prefix
  // so the same predicate works on host-relative and container-absolute forms.
  const p = relPath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/workspace\//, '');
  const base = p.split('/').pop() ?? p;
  return (
    // .claude host config
    p === '.claude/settings.json' ||
    p === '.claude/settings.local.json' ||
    // package.json (npm scripts run on host)
    base === 'package.json' ||
    // GitHub Actions workflows
    /^\.github\/workflows\/.+\.(ya?ml)$/.test(p) ||
    // docker / compose orchestration (host-invoked)
    base === 'docker-compose.yml' ||
    base === 'docker-compose.yaml' ||
    base === 'compose.yml' ||
    base === 'compose.yaml' ||
    // pre-commit hooks (host git executes these)
    base === '.pre-commit-config.yaml' ||
    // Makefile (host make executes targets)
    base === 'Makefile' ||
    // shell scripts anywhere (host-executed)
    /\.sh$/.test(p)
  );
}

// ─── Types ─────────────────────────────────────────────────────────

export interface FileSanitizeResult {
  /** Project-relative path of the file. */
  file: string;
  /** Number of `/workspace` occurrences rewritten. */
  rewrites: number;
}

export interface SanitizeReport {
  /** Host-facing files inspected. */
  scanned: number;
  /** Files actually modified (rewrites > 0). */
  rewritten: FileSanitizeResult[];
  /** Total `/workspace` occurrences rewritten across all files. */
  totalRewrites: number;
}

// ─── Pure core ─────────────────────────────────────────────────────

/**
 * Rewrite container-workspace path leaks in a string. Pure — no I/O.
 * Returns the sanitized content and the number of rewrites applied.
 */
export function sanitizeContainerPaths(content: string): { content: string; rewrites: number } {
  let rewrites = 0;
  const out = content.replace(CONTAINER_WORKSPACE_RE, () => {
    rewrites++;
    return PORTABLE_PROJECT_DIR;
  });
  return { content: out, rewrites };
}

// ─── FS sweep ──────────────────────────────────────────────────────

/**
 * Sweep the host-facing files among `changedFiles`, rewriting any leaked
 * container-workspace paths in place. Idempotent — re-running on already-clean
 * files is a no-op. Files that don't exist or aren't host-facing are skipped.
 *
 * @param projectRoot Absolute path to the project root on the host.
 * @param changedFiles Project-relative (or `/workspace/`-prefixed) file paths,
 *   typically a worker result's `filesChanged`.
 */
export function sanitizeHostFacingFiles(
  projectRoot: string,
  changedFiles: readonly string[],
): SanitizeReport {
  const rewritten: FileSanitizeResult[] = [];
  let scanned = 0;
  let totalRewrites = 0;

  // De-dup while preserving the host-facing subset.
  const seen = new Set<string>();
  for (const raw of changedFiles) {
    if (!raw || !isHostFacingFile(raw)) continue;
    const rel = raw.replace(/^\.\//, '').replace(/^\/workspace\//, '');
    if (seen.has(rel)) continue;
    seen.add(rel);

    const abs = join(projectRoot, rel);
    if (!existsSync(abs)) continue;
    scanned++;

    let content: string;
    try {
      content = readFileSync(abs, 'utf-8');
    } catch {
      continue;
    }
    const { content: cleaned, rewrites } = sanitizeContainerPaths(content);
    if (rewrites > 0) {
      try {
        writeFileSync(abs, cleaned, 'utf-8');
        rewritten.push({ file: rel, rewrites });
        totalRewrites += rewrites;
      } catch {
        // Best-effort: a write failure leaves the file untouched; the prompt
        // rule remains the prevention layer. Don't throw — this runs in the
        // result-collection hot path.
      }
    }
  }

  return { scanned, rewritten, totalRewrites };
}
