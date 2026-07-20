// ─── Docker Spawn Backend ─────────────────────────────────────────────────
// Spawns workers in isolated Docker containers.
// Each worker gets its own filesystem namespace — no cross-worker interference.
// Results collected via shared .tasks/ volume mount.

import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync, readdirSync, renameSync, rmdirSync, chmodSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { homedir, totalmem } from 'node:os';
import type { ModelType } from '../core/types.js';
import { getProviderForModel, UnknownModelError } from '../core/task-types.js';
import { modelRegistry } from '../core/model-registry.js';
import { getProviderCommandSpec, buildProviderCommand, type ProviderCommandSpec } from '../core/provider-command-spec.js';
import { createClaudeAdapter } from '../providers/claude.js';
import { createCodexAdapter } from '../providers/codex.js';
import { createGeminiAdapter } from '../providers/gemini.js';
import { buildSuggestedImageCmd } from '../core/worker-image-check.js';
import { TASKS_DIR } from '../core/constants.js';
import { DECK_FILE_NAME } from '../core/deck-file.js';
import { debugLog } from '../core/utils.js';
import { DeckentError } from '../core/errors.js';
import { normalizeStreamEvent, writeLogEvent, type StreamLogEvent } from '../core/log-event.js';
import { assertLiveUsageBudgetSupport, hasLiveUsageCeiling } from '../core/live-execution-budget.js';
import {
  acquireSpawnLocks,
  releaseAllSpawnLocks,
  releaseStaleSpawnLocksForTask,
  SpawnLockError,
} from '../core/file-lock.js';
import { markPending, markActive, clearPending } from '../core/active-workers.js';
import { authHealthCheck } from '../agents/worker.js';
import { BASE_PROVIDER_CREDENTIAL_ENV } from '../providers/cross-provider-keys.js';
import type { SpawnBackend, SpawnBackendOptions } from './spawn-backend.js';
import { SpawnBackendError, checkLethalGuard } from './spawn-backend.js';
import { getDefaultProviderName } from './sprint-utils.js';
import { installGitGuard, buildDockerGitGuardArgs, buildGitGuardDir, CONTAINER_GIT_PATH } from './git-worker-guard.js';
import { captureStreamToLog } from './spawn-backend-subprocess.js';
import { makeActivityOnEvent, type ActivityTapContext } from '../agents/worker-activity.js';
import { extractProviderBillingEvidence } from '../core/provider-billing-evidence.js';
import {
  createRuntimeBudgetMonitor,
  readRuntimeBudgetStop,
  resolveTaskExecutionBudget,
} from './runtime-budget-monitor.js';

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_IMAGE = 'deckent-worker:latest';
/** @deprecated Use adaptive timeout via brainEstimateTimeout() + SpawnBackendOptions.taskTimeoutSeconds instead. Kept for backward compat fallback. */
const DEFAULT_TIMEOUT_SECONDS = 1200; // 20 minutes
const CONTAINER_WORKSPACE = '/workspace';
const DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15;
// Exported as the SSOT container-name prefix so the host-liveness probe
// (heartbeat-monitor.ts) derives `deckent-w-<taskId>` from the SAME constant the
// backend uses to `docker run --name` / `docker wait` — no drifting duplicate.
export const CONTAINER_PREFIX = 'deckent-w-';

const PROVIDER_AUTH_FILES: Readonly<Record<string, readonly { file: string; required: boolean }[]>> = {
  claude: [{ file: '.credentials.json', required: true }],
  codex: [{ file: 'auth.json', required: true }],
  gemini: [
    { file: 'gemini-credentials.json', required: true },
    { file: 'google_accounts.json', required: false },
  ],
};

export interface ProviderAuthIsolation {
  mountArgs: string[];
  bootstrapLines: string[];
  credentialCount: number;
  missingRequiredFiles: string[];
}

export interface GeminiAuthSelectionBootstrap {
  selectedType: string;
  bootstrapLines: string[];
}

/**
 * Copy only Gemini's selected auth mechanism into the private worker HOME.
 * The full settings.json is intentionally not mounted because it may grow MCP,
 * tool, plugin, trust, or IDE configuration unrelated to the worker task.
 */
export function buildGeminiAuthSelectionBootstrap(
  home: string,
  readText: (path: string) => string = (path) => readFileSync(path, 'utf-8'),
): GeminiAuthSelectionBootstrap | null {
  try {
    const parsed = JSON.parse(readText(join(home, '.gemini', 'settings.json'))) as {
      security?: { auth?: { selectedType?: unknown } };
    };
    const selectedType = parsed.security?.auth?.selectedType;
    if (typeof selectedType !== 'string' || !/^[a-zA-Z0-9._-]{1,64}$/.test(selectedType)) return null;
    const minimalSettings = JSON.stringify({ security: { auth: { selectedType } } });
    return {
      selectedType,
      bootstrapLines: [
        `printf '%s\\n' '${minimalSettings}' > "$HOME/.gemini/settings.json" || exit 78`,
        'chmod 600 "$HOME/.gemini/settings.json" || exit 78',
      ],
    };
  } catch {
    return null;
  }
}

/**
 * Mount only provider credential files, never the host provider home. Full
 * homes contain MCP servers, skills, plugins, transcripts, and global rules;
 * mounting them made a scoped worker inherit a large unrelated context surface.
 */
export function buildProviderAuthIsolation(
  home: string,
  provider: string,
  oauthHomeDir: string | undefined,
  useApiOnly: boolean,
  fileExists: (path: string) => boolean = existsSync,
): ProviderAuthIsolation {
  if (useApiOnly || !oauthHomeDir) {
    return { mountArgs: [], bootstrapLines: [], credentialCount: 0, missingRequiredFiles: [] };
  }
  const mountArgs: string[] = [];
  const bootstrapLines: string[] = [];
  const missingRequiredFiles: string[] = [];
  let credentialCount = 0;
  for (const entry of PROVIDER_AUTH_FILES[provider] ?? []) {
    const { file } = entry;
    const hostPath = join(home, oauthHomeDir, file);
    if (!fileExists(hostPath)) {
      if (entry.required) missingRequiredFiles.push(file);
      continue;
    }
    const source = `/run/deckent-auth-${provider}-${file.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const destination = `$HOME/${oauthHomeDir}/${file}`;
    // `--mount` handles Windows drive-letter colons correctly; legacy `-v
    // C:\\...:/target:ro` is ambiguous on native Windows Docker clients.
    mountArgs.push('--mount', `type=bind,src=${hostPath},dst=${source},readonly`);
    bootstrapLines.push(`mkdir -p "$HOME/${oauthHomeDir}" || exit 78`);
    bootstrapLines.push(`cp "${source}" "${destination}" || exit 78`);
    bootstrapLines.push(`chmod 600 "${destination}" || exit 78`);
    credentialCount += 1;
  }
  return { mountArgs, bootstrapLines, credentialCount, missingRequiredFiles };
}

/**
 * born-468 (WRAPPER-HB-GATE): the in-container wrapper's own heartbeat tick
 * writes a skeletal fallback heartbeat every 15s so the auditor's stale-worker
 * detector stays quiet even between the worker's own updates. Left unguarded,
 * that tick unconditionally overwrites $HBFILE and clobbers any richer
 * heartbeat the worker itself just wrote (currentAction etc., per
 * WORKER-GUIDE.md). 40s = ~2.5 wrapper ticks of slack — long enough that a
 * normal worker write cadence always wins, short enough that a genuinely
 * stalled worker's heartbeat still refreshes well before the auditor's >2min
 * stale threshold (auditor.md).
 *
 * TT553 (task 418-002) note: this wrapper tick is a CURRENTACTION-CARRIER
 * refresh, NOT the liveness authority. A docker worker's real liveness is the
 * HOST container-state signal (`docker wait`/`docker inspect`, see
 * monitorContainer + heartbeat-monitor.ts). Once the auditor/checkpoint kill
 * paths adopt heartbeat-monitor.ts::decideWorkerLiveness (host-primary), this
 * mtime-appeasement tick becomes vestigial — a container that stops updating
 * its `.hb` but is still Running must NOT be killed. Kept for now because those
 * two kill paths are out of this task's write scope (see .result docImpact).
 */
export const WRAPPER_HB_STALE_THRESHOLD_SECONDS = 40;

/**
 * Sprint 191 T-001: WSL2-safe memory defaults. Pre-191 hardcoded `8g/12g` proved
 * OOM-hostile on WSL2 hosts (~12-14GB total); cut to 4g/6g to break the exit-137
 * cycle. Cross-checked with `.deckent/config.json` worker_memory_limit/swap.
 */
export const DEFAULT_WORKER_MEMORY_LIMIT = '4g';
export const DEFAULT_WORKER_MEMORY_SWAP = '6g';

/**
 * Sprint 191 T-001: pure helper to normalize docker memory strings (e.g. `4g`,
 * `4096m`, `4194304k`, `0.5g`, `4294967296`, `4294967296b`) into bytes for
 * comparison. Returns null for malformed/missing/non-positive input.
 *
 * Exported for unit tests; backend internals use it to guard against config
 * drift between `--memory` and `--memory-swap`.
 */
export function parseMemoryString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([0-9]*\.?[0-9]+)\s*([kmgtb]?)$/i);
  if (!match) return null;
  const num = Number.parseFloat(match[1]!);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const multipliers: Record<string, number> = {
    '': 1,
    b: 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
    t: 1024 ** 4,
  };
  const mul = multipliers[unit];
  if (mul === undefined) return null;
  return Math.floor(num * mul);
}

/**
 * F1-LIM faz-2a (Sprint 272): Derive the docker `--memory-swap` value from a
 * limit byte count, matching the 4g/6g default ratio (× 1.5).
 *
 * The result is an integer MB string (e.g. '1152m') — docker accepts this
 * format directly. Exported for unit tests.
 */
export function deriveSwapFromLimitBytes(limitBytes: number): string {
  const swapBytes = Math.floor(limitBytes * 1.5);
  const mb = Math.floor(swapBytes / (1024 * 1024));
  return `${mb}m`;
}

// ─── Sprint 272 T-003: exit-without-result enriched marker ──────────────────
// Live pattern (3 sprints running): a worker finishes its work (git diff on disk,
// heartbeat seq high) but exits — often CLEANLY, exitCode 0, on a usage-limit /
// stream interruption — WITHOUT writing `.result`. The old EXIT-trap else-branch
// wrote a blind NO_GO ("Worker exited without writing result"), indistinguishable
// from a worker that did nothing. These two helpers (a) add a last-chance flush
// window and (b) enrich the partial with a discriminator so the FIX phase
// (Task 272-004) can tell "work present, result missing" (→ verify-and-complete)
// apart from "nothing done". The marker stays a NO_GO candidate: existing
// evaluation is unchanged; the new fields are purely additive.

/** Input for {@link buildExitWithoutResultMarker}. */
export interface ExitWithoutResultMarkerInput {
  taskId: string;
  model: string;
  /** Container exit code (`docker wait`). >128 ⇒ signal (137 = SIGKILL/OOM). */
  exitCode: number;
  /** true when a `git diff` shows ≥1 changed file on the shared volume. */
  workPresent: boolean;
  /** `git diff --shortstat` summary, e.g. `3 files changed, 45 insertions(+)`. */
  diffStat?: string;
  /** Last heartbeat status read from the `.hb` file (best-effort). */
  lastHbStatus?: string;
  /** Last heartbeat sequence read from the `.hb` file (best-effort). */
  lastHbSequence?: number;
  /** Where the marker was synthesized: container EXIT trap or host monitor. */
  source?: 'wrapper' | 'host';
}

/** Canonical EXIT_WITHOUT_RESULT partial — a NO_GO candidate carrying FIX-routing hints. */
export interface ExitWithoutResultMarker {
  taskId: string;
  workerId: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  testsPassed: boolean;
  coverage: number;
  selfAssessment: 'NO_GO';
  markerType: 'EXIT_WITHOUT_RESULT';
  workPresent: boolean;
  diffStat: string;
  lastHbStatus: string;
  lastHbSequence: number;
  exitCode: number;
  notes: string;
  tokenUsage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; provider: string; model: string };
}

/**
 * Build the canonical EXIT_WITHOUT_RESULT marker. `selfAssessment` stays `NO_GO`
 * so the evaluator is unchanged; `markerType`/`workPresent` are additive
 * discriminators the FIX phase consumes. The TS shape mirrors the JSON the
 * container EXIT trap writes (see {@link buildOnExitTrap}) so both origins
 * (wrapper + host monitor) are schema-compatible for the evaluator.
 */
export function buildExitWithoutResultMarker(input: ExitWithoutResultMarkerInput): ExitWithoutResultMarker {
  const signalInfo = input.exitCode > 128 ? ` signal=${input.exitCode - 128}` : '';
  const diffStat = (input.diffStat ?? '').trim();
  const source = input.source ?? 'host';
  const workNote = input.workPresent
    ? `work present on disk (${diffStat || 'diff detected'}) — FIX should verify-and-complete the partial work rather than restart from scratch`
    : 'no changed files detected — nothing to recover';
  return {
    taskId: input.taskId,
    workerId: `docker-${input.taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    markerType: 'EXIT_WITHOUT_RESULT',
    workPresent: input.workPresent,
    diffStat,
    lastHbStatus: input.lastHbStatus ?? 'unknown',
    lastHbSequence: input.lastHbSequence ?? 0,
    exitCode: input.exitCode,
    // Keeps the lowercase `code=<n>` form of the historical host-fallback note (the
    // wrapper EXIT trap uses `exitCode=`). The canonical classifier phrase "Worker
    // exited without writing result" is preserved either way (result-collector /
    // result-evaluator NO_RESULT_CRASH_PATTERN).
    notes:
      `Worker exited without writing result (code=${input.exitCode}${signalInfo}, source=${source}). `
      + `EXIT_WITHOUT_RESULT marker — workPresent=${input.workPresent}; ${workNote}.`,
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: input.model },
  };
}

/**
 * born-667b (RECON-DIFF, task 427-024): POSIX-single-quote every entry of a
 * task's `scope.filesWrite` list and join them into a `git ... -- <pathspec>`
 * argument string. Embedded `'` is escaped via the standard `'\''` POSIX idiom
 * (close quote, escaped literal quote, reopen quote). Blank/non-string entries
 * are dropped. Pure — exported for unit tests.
 */
export function buildScopedDiffPathspec(scopeFilesWrite: readonly string[]): string {
  return scopeFilesWrite
    .map((f) => (typeof f === 'string' ? f.trim() : ''))
    .filter((f) => f.length > 0)
    .map((f) => `'${f.split('\'').join('\'\\\'\'')}'`)
    .join(' ');
}

/** Delimiter between a path and its baseline hash in the scope-baseline manifest. */
export const SCOPE_BASELINE_DELIM = '\t';

/**
 * 455-003 (TIMEOUT-BASELINE-TRUTH): capture a task-start CONTENT baseline for the
 * scoped files so the container EXIT-trap can tell THIS worker's partial work
 * apart from files that were ALREADY dirty when the task started — a previous
 * task's leftover, an operator's local edit, or (the born-667b sibling case) a
 * concurrent worker mid-edit whose changes leak through the shared bind-mount.
 *
 * born-667b narrowed the diff to `scope.filesWrite` (sibling isolation across
 * DIFFERENT files); this closes the remaining hole: a file that IS in scope but
 * was dirty BEFORE the worker started would still have produced a false
 * TIMEOUT_WITH_WORK. The fix is a per-file content fingerprint captured at spawn.
 *
 * For each scoped entry that exists on disk at spawn, records
 * `<path>\t<gitHashObject>` — the SAME `git hash-object` blob id the in-container
 * trap recomputes at exit (git is present in both places; hash-object is
 * read-only and NOT on the worker git-guard denylist). A file that does not yet
 * exist is omitted (no entry ⇒ "created by the worker" at exit ⇒ counted as work,
 * so genuine new task-local work stays recoverable).
 *
 * Never throws — a per-file failure just omits that file (fail-open ⇒ at worst
 * that one file is counted, the pre-455-003 behavior). Exported for unit tests
 * (real-git repo). Returns '' when nothing could be baselined (⇒ the trap falls
 * through to its unfiltered legacy behavior).
 */
export function computeScopeBaselineManifest(dir: string, scopeFilesWrite: readonly string[]): string {
  const lines: string[] = [];
  for (const raw of scopeFilesWrite) {
    const rel = typeof raw === 'string' ? raw.trim() : '';
    if (!rel) continue;
    let abs: string;
    try { abs = resolve(dir, rel); } catch { continue; }
    if (!existsSync(abs)) continue;
    try {
      const res = spawnSync('git', ['hash-object', '--', rel], {
        cwd: dir, encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const hash = (res.stdout ?? '').trim();
      if (res.status === 0 && /^[0-9a-f]{40,64}$/.test(hash)) {
        lines.push(`${rel}${SCOPE_BASELINE_DELIM}${hash}`);
      }
    } catch (e) {
      debugLog('docker-backend:scope-baseline', e);
    }
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

/**
 * Build the container EXIT-trap shell function (`on_exit`). Extracted from the
 * inline `spawn()` body so it is unit-testable. Behavior:
 *  - `.result` already present → fsync + return (normal worker exit; unchanged).
 *  - Sprint 272 T-003 last-chance window: if `.result` is missing, wait up to 5s
 *    re-checking — catches a late flush from a clean exit-0 (limit/stream cut).
 *  - non-zero exit + git diff ⇒ TIMEOUT_WITH_WORK (unchanged; Brain reconciles).
 *  - else ⇒ enriched EXIT_WITHOUT_RESULT marker (workPresent + diffStat + last hb),
 *    still a NO_GO candidate. The JSON mirrors {@link buildExitWithoutResultMarker}.
 *
 * born-667b (RECON-DIFF, task 427-024): `scopeFilesWrite` narrows BOTH the
 * TIMEOUT_WITH_WORK file-count and the EXIT_WITHOUT_RESULT workPresent/diffStat
 * signal to this task's own `scope.filesWrite` via a native git `-- <pathspec>`
 * filter — the docker backend bind-mounts the WHOLE project root read-write, so
 * an UNFILTERED `git diff` inside one worker's container also shows every OTHER
 * concurrently-running worker's uncommitted changes (TT550 phantom-vakası: a
 * worker that touched nothing itself still got workPresent=true because a
 * sibling worker was mid-edit). Optional + defaults to the pre-existing
 * unscoped behavior so the 2-arg call in
 * tests/orchestra/docker-exit-marker.test.ts is untouched. An explicitly empty
 * list (as opposed to omitted) has an empty intersection by construction —
 * `changed_files`/`diff_stat` are set directly with no git call at all, the
 * honest answer per born-667b's goCriteria ("kesişim-boş → workPresent=false
 * dürüst yazılır").
 */
export function buildOnExitTrap(taskId: string, model: string, scopeFilesWrite?: readonly string[]): string {
  const scoped = scopeFilesWrite !== undefined;
  const pathspec = scoped ? buildScopedDiffPathspec(scopeFilesWrite) : '';
  const scopedButEmpty = scoped && pathspec.length === 0;

  const changedFilesLine = !scoped
    ? '  changed_files=$({ git diff --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u || true)'
    : scopedButEmpty
      ? '  changed_files=""'
      : `  changed_files=$({ git diff --name-only -- ${pathspec}; git ls-files --others --exclude-standard -- ${pathspec}; } 2>/dev/null | sort -u || true)`;

  const diffStatLine = !scoped
    ? '    diff_stat=$(git diff --shortstat 2>/dev/null | sed \'s/^[[:space:]]*//\' | tr -d \'"\' || true)'
    : scopedButEmpty
      ? '    diff_stat=""'
      : `    diff_stat=$(git diff --shortstat -- ${pathspec} 2>/dev/null | sed 's/^[[:space:]]*//' | tr -d '"' || true)`;

  return [
    'on_exit() {',
    // born-466: $? here is the LAST command's code (rm/echo masked it to 0 on
    // every path) — prefer CLAUDE_EXIT captured right after the worker command,
    // so TIMEOUT_WITH_WORK and signal_info see the REAL worker exit code.
    '  local exit_code=${CLAUDE_EXIT:-$?}',
    // 455-003: default BASEFILE so an unset var never errors (2-arg legacy trap
    // and any caller that does not export a scope-baseline manifest).
    '  BASEFILE="${BASEFILE:-}"',
    // If .result already exists (worker wrote it normally), just fsync and exit
    '  if [ -f "$RFILE" ]; then',
    '    fsync_file "$RFILE"',
    '    fsync_file "$HBFILE"',
    '    rm -f "$PRFILE" 2>/dev/null',
    '    kill $HB_PID 2>/dev/null',
    '    return',
    '  fi',
    // Sprint 272 T-003: last-chance window — a clean exit-0 (usage-limit / stream
    // interruption) can land just before the worker's .result write flushes to the
    // shared volume. Wait up to 5s, re-checking, before synthesizing a marker.
    '  lc_wait=0',
    '  while [ ! -f "$RFILE" ] && [ "$lc_wait" -lt 5 ]; do',
    '    sleep 1',
    '    lc_wait=$((lc_wait + 1))',
    '  done',
    '  if [ -f "$RFILE" ]; then',
    '    fsync_file "$RFILE"',
    '    fsync_file "$HBFILE"',
    '    rm -f "$PRFILE" 2>/dev/null',
    '    kill $HB_PID 2>/dev/null',
    '    return',
    '  fi',
    // Non-zero exit: check git diff for partial work
    `  cd "${CONTAINER_WORKSPACE}" 2>/dev/null || true`,
    '  local changed_files=""',
    // born-467: tracked diff alone misses NEW files (most deckent tasks create
    // new test files) — include untracked-but-not-ignored so workPresent is
    // honest when a worker produced only new files before dying.
    // born-667b: scoped to scope.filesWrite when provided — see buildScopedDiffPathspec.
    changedFilesLine,
    // 455-003 (TIMEOUT-BASELINE-TRUTH): subtract files whose CURRENT content is
    // byte-identical to the task-start baseline (BASEFILE manifest, computed by
    // computeScopeBaselineManifest at spawn). A scoped file that was ALREADY dirty
    // when the worker started — a previous task's leftover, an operator's local
    // edit, or a sibling worker's leak through the shared bind-mount — is NOT this
    // worker's partial work and must never produce a false TIMEOUT_WITH_WORK. A
    // file whose hash CHANGED since baseline (further edited) or that has no
    // baseline entry (newly created) is kept, so genuine task-local work stays
    // recoverable. No BASEFILE (2-arg legacy / no manifest) ⇒ unfiltered, exactly
    // as before this task. `git hash-object` is read-only + not git-guard-denied.
    '  if [ -n "$BASEFILE" ] && [ -f "$BASEFILE" ] && [ -n "$changed_files" ]; then',
    '    baseline_filtered=""',
    '    while IFS= read -r bf; do',
    '      [ -z "$bf" ] && continue',
    '      bf_cur=$(git hash-object "$bf" 2>/dev/null || echo __MISSING__)',
    '      bf_base=$(awk -F "\\t" -v p="$bf" \'$1==p{print $2; exit}\' "$BASEFILE" 2>/dev/null || true)',
    '      if [ -n "$bf_base" ] && [ "$bf_base" = "$bf_cur" ]; then continue; fi',
    '      baseline_filtered="$baseline_filtered$bf',
    '"',
    '    done <<BASEEOF',
    '$changed_files',
    'BASEEOF',
    '    changed_files=$(printf \'%s\' "$baseline_filtered" | sed \'/^$/d\')',
    '  fi',
    '  if [ -n "$changed_files" ] && [ "$exit_code" -ne 0 ]; then',
    // Build JSON array from changed files using pure POSIX sh (no jq dependency)
    '    local json_array="["',
    '    local first=1',
    '    local count=0',
    '    while IFS= read -r f; do',
    '      [ -z "$f" ] && continue',
    '      count=$((count + 1))',
    '      if [ "$first" -eq 1 ]; then',
    '        first=0',
    '      else',
    '        json_array="$json_array,"',
    '      fi',
    '      local escaped=$(printf "%s" "$f" | sed \'s/\\\\/\\\\\\\\/g; s/"/\\\\"/g\')',
    '      json_array="$json_array\\"$escaped\\""',
    '    done <<GITEOF',
    '$changed_files',
    'GITEOF',
    '    json_array="$json_array]"',
    // Sprint 149: Add signal_info for signal-killed containers
    '    local signal_info=""',
    '    [ "$exit_code" -gt 128 ] && signal_info=" signal=$((exit_code - 128))"',
    '    cat > "$RFILE" <<RESULTEOF',
    `{"taskId":"${taskId}","selfAssessment":"TIMEOUT_WITH_WORK","filesChanged":$json_array,"exitCode":$exit_code,"notes":"Worker timeout/killed (exitCode=$exit_code$signal_info) but git diff shows $count files modified. Brain should reconcile via Spurious NO_GO helper.","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"${model}"}}`,
    'RESULTEOF',
    '  else',
    // Sprint 272 T-003: enriched EXIT_WITHOUT_RESULT marker (was a blind NO_GO).
    // workPresent = git diff shows >=1 file; diffStat = shortstat summary; last
    // heartbeat status/sequence pulled from $HBFILE. Stays a NO_GO candidate so the
    // evaluator is unchanged, but the FIX phase can verify-and-complete disk work.
    // The "exited without writing result (exitCode=" phrase is preserved — note
    // classifiers match it (nogo-note-accuracy).
    '    local work_present=false',
    '    [ -n "$changed_files" ] && work_present=true',
    '    local diff_stat=""',
    // born-667b: scoped to scope.filesWrite when provided — see buildScopedDiffPathspec.
    // 455-003: gate the shortstat on the (baseline-filtered) changed_files so a
    // pre-existing-dirty file removed by the baseline filter can never leak back
    // into diffStat while workPresent is already false.
    '    if [ -n "$changed_files" ]; then',
    diffStatLine,
    '    fi',
    '    local hb_status="unknown"',
    '    local hb_seq=0',
    '    if [ -f "$HBFILE" ]; then',
    '      hb_status=$(sed -n \'s/.*"status":"\\([^"]*\\)".*/\\1/p\' "$HBFILE" 2>/dev/null | head -1)',
    '      hb_seq=$(sed -n \'s/.*"sequence":\\([0-9][0-9]*\\).*/\\1/p\' "$HBFILE" 2>/dev/null | head -1)',
    '      [ -z "$hb_status" ] && hb_status="unknown"',
    '      [ -z "$hb_seq" ] && hb_seq=0',
    '    fi',
    '    local signal_info_nw=""',
    '    [ "$exit_code" -gt 128 ] && signal_info_nw=" signal=$((exit_code - 128))"',
    '    cat > "$RFILE" <<NORESULTEOF',
    `{"taskId":"${taskId}","workerId":"docker-${taskId}","filesChanged":[],"linesAdded":0,"linesRemoved":0,"testsPassed":false,"coverage":0,"selfAssessment":"NO_GO","markerType":"EXIT_WITHOUT_RESULT","workPresent":$work_present,"diffStat":"$diff_stat","lastHbStatus":"$hb_status","lastHbSequence":$hb_seq,"exitCode":$exit_code,"notes":"Worker exited without writing result (exitCode=$exit_code$signal_info_nw, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=$work_present diff [$diff_stat]. Brain FIX: workPresent=true -> verify-and-complete disk work.","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"${model}"}}`,
    'NORESULTEOF',
    '  fi',
    '  fsync_file "$RFILE"',
    '  fsync_file "$HBFILE"',
    // Sprint 151: Clean up .partial-result — EXIT trap wrote a proper .result
    '  rm -f "$PRFILE" 2>/dev/null',
    '  kill $HB_PID 2>/dev/null',
    '}',
  ].join('\n');
}

// ─── Sprint 163 T-002: Health Check + Retry Policy ──────────────────────────
// container_start_failed previously masked four distinct failure modes
// (image-missing, port-collision, resource-limit, instant-exit-success).
// We retry transient failures up to MAX_SPAWN_ATTEMPTS times and surface a
// stable error code so Brain/Auditor can act on it.

/** How long to wait (ms) after `docker run -d` before inspecting state. */
export const HEALTH_CHECK_DELAY_MS = 3_000;
/** Maximum number of spawn attempts (1 = no retry). */
export const MAX_SPAWN_ATTEMPTS = 2;
/** Delay (ms) between consecutive spawn attempts. */
export const SPAWN_RETRY_DELAY_MS = 5_000;

/** Stable error codes for container_start_failed root causes. */
export const DOCKER_ERROR_CODES = {
  IMAGE_NOT_FOUND: 'DECKENT_E081',
  PORT_COLLISION: 'DECKENT_E082',
  RESOURCE_LIMIT: 'DECKENT_E083',
  UNKNOWN: 'DECKENT_E084',
  // 455-003 (DOCKER-PREFLIGHT-TRUTH): distinct pre-spawn failure classes. These
  // MUST never collapse into IMAGE_NOT_FOUND — a down/forbidden daemon or an
  // absent docker binary is a fundamentally different operator remedy than a
  // missing image, and reporting one as the other sends the operator to the
  // wrong fix (rebuild an image when the real problem is `sudo`/`dockerd`).
  DAEMON_UNAVAILABLE: 'DECKENT_E085', // docker CLI present, daemon not reachable (socket down / dockerd stopped)
  DAEMON_PERMISSION: 'DECKENT_E086', // docker CLI present, daemon reachable, but the socket is permission-denied
  DOCKER_ABSENT: 'DECKENT_E087',     // docker binary itself is not on PATH (spawn ENOENT / status 127)
  IMAGE_CLI_MISSING: 'DECKENT_E088', // image present, but the provider's CLI binary was not baked into it
} as const;

export type DockerErrorCode = (typeof DOCKER_ERROR_CODES)[keyof typeof DOCKER_ERROR_CODES];

/** Distinct pre-spawn Docker failure classes (455-003). */
export type DockerPreflightCode =
  | typeof DOCKER_ERROR_CODES.DOCKER_ABSENT
  | typeof DOCKER_ERROR_CODES.DAEMON_PERMISSION
  | typeof DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE;

/** Structured verdict of a Docker daemon preflight probe. `null` ⇒ daemon healthy. */
export interface DockerPreflightFailure {
  code: DockerPreflightCode;
  message: string;
  /** Raw probe evidence (trimmed stderr / spawn-error text) that justified the code. */
  evidence: string;
}

/**
 * 455-003 (DOCKER-PREFLIGHT-TRUTH): classify the result of a `docker info` (or
 * `docker images`) probe into a DISTINCT daemon/permission/absent failure — or
 * `null` when the daemon is healthy. Pure function — exported for unit tests.
 *
 * Separation of concerns vs {@link classifyDockerError}: that classifier reasons
 * about a container that already tried to start (image-missing, port-collision,
 * resource-limit). THIS classifier reasons about whether we can talk to the
 * Docker daemon AT ALL, before any image lookup — so a permission-denied socket
 * or a stopped daemon is never mis-reported as "image not ready".
 *
 * Discrimination (matched against real docker CLI phrasing):
 *  - DOCKER_ABSENT      — the spawn itself failed (ENOENT) or exited 127: the
 *    `docker` binary is not installed / not on PATH.
 *  - DAEMON_PERMISSION  — "permission denied" while dialing the socket
 *    (`dial unix /var/run/docker.sock: connect: permission denied`,
 *    `Got permission denied while trying to connect to the Docker daemon socket`).
 *  - DAEMON_UNAVAILABLE — daemon unreachable for any other reason
 *    ("Cannot connect to the Docker daemon", "Is the docker daemon running?").
 *
 * A permission-denied string is checked BEFORE the generic can't-connect string
 * because docker emits BOTH together ("...connect: permission denied. ... Is the
 * docker daemon running?") and permission is the more actionable, specific cause.
 */
export function classifyDockerPreflight(probe: {
  status: number | null;
  stderr: string | null | undefined;
  spawnError?: Error | { code?: string } | null;
}): DockerPreflightFailure | null {
  const stderr = (probe.stderr ?? '').trim();
  const s = stderr.toLowerCase();

  // 1) docker binary absent — the spawn never reached a daemon at all.
  const spawnErrCode = (probe.spawnError as { code?: string } | undefined)?.code;
  if (
    probe.spawnError != null ||
    spawnErrCode === 'ENOENT' ||
    probe.status === 127 ||
    s.includes('command not found') ||
    s.includes('executable file not found') ||
    s.includes('no such file or directory')
  ) {
    return {
      code: DOCKER_ERROR_CODES.DOCKER_ABSENT,
      message: `${DOCKER_ERROR_CODES.DOCKER_ABSENT}: docker binary not found on PATH (install Docker / add it to PATH)`,
      evidence: stderr || spawnErrCode || 'spawn failed (ENOENT)',
    };
  }

  // Daemon healthy — nothing to report (status 0 with no error).
  if (probe.status === 0) return null;

  // 2) permission denied on the docker socket (checked before generic connect).
  if (
    s.includes('permission denied') ||
    s.includes('got permission denied') ||
    s.includes('dial unix') && s.includes('connect: permission denied')
  ) {
    return {
      code: DOCKER_ERROR_CODES.DAEMON_PERMISSION,
      message: `${DOCKER_ERROR_CODES.DAEMON_PERMISSION}: permission denied talking to the Docker daemon socket (add the user to the docker group or run with sufficient privileges)`,
      evidence: stderr,
    };
  }

  // 3) daemon unreachable / not running.
  if (
    s.includes('cannot connect to the docker daemon') ||
    s.includes('is the docker daemon running') ||
    s.includes('docker daemon is not running') ||
    s.includes('error during connect')
  ) {
    return {
      code: DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE,
      message: `${DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE}: cannot connect to the Docker daemon (is dockerd running?)`,
      evidence: stderr,
    };
  }

  // Non-zero status with an unrecognized reason: still a daemon-unavailable class
  // (we could not confirm a healthy daemon) — honest fail, never image-missing.
  return {
    code: DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE,
    message: `${DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE}: docker daemon probe failed (status=${probe.status ?? 'null'})`,
    evidence: stderr || `status=${probe.status ?? 'null'}`,
  };
}

/**
 * 455-003: run the `docker info` daemon preflight synchronously and classify it.
 * Returns `null` when the daemon is healthy. Kept as a thin seam (spawnSync +
 * {@link classifyDockerPreflight}) so the pure classifier stays unit-testable
 * without a real docker. Exported for the backend's own use + tests.
 */
export function probeDockerDaemon(): DockerPreflightFailure | null {
  const probe = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return classifyDockerPreflight({
    status: probe.status,
    stderr: probe.stderr,
    spawnError: probe.error ?? null,
  });
}

// Sprint 194 T-004 (W-M M-2): tell V8 inside the worker container to size its
// max old-space heap as a percentage of the container's memory cgroup, rather
// than the host RAM. Requires Node ≥20.6 (`--max-old-space-size-percentage`
// landed in Node 20.6; Deckent runtime is Node ≥24).
export const WORKER_NODE_OPTIONS = 'NODE_OPTIONS=--max-old-space-size-percentage=75';

/**
 * Returns the CLI binary name for a given model.
 *
 * Sprint 234 AS-2 Faz 2 — host-HTTP defensive honest-fail:
 * Ollama is a host-HTTP provider; `sprint-spawner.ts:isAdapterProvider` should
 * route ollama tasks to the host `OllamaAdapter.spawn(...)` BEFORE this
 * function is ever consulted. If routing fails and ollama still reaches the
 * Docker backend, we emit an explicit warning (no longer silent) so the
 * regression surfaces in logs immediately, then preserve the legacy 'claude'
 * fallback so the in-flight container does not crash mid-sprint. The warning
 * is the defensive honest-fail signal that Layer-2 routing dropped the task.
 *
 * Unknown models also fall back to 'claude' as a safe default (legacy).
 */
/** Provider CLI binary → adapter factory, for parsing the worker's usage envelope. */
const USAGE_ADAPTER_FACTORIES: Record<string, (root: string) => { extractUsage?: (raw: string) => unknown }> = {
  claude: createClaudeAdapter,
  codex: createCodexAdapter,
  gemini: createGeminiAdapter,
};

/**
 * Patch a worker's `.result` with the REAL token usage parsed from its CLI envelope
 * (captured container stdout). Provider-agnostic: dispatches to the model's provider
 * adapter, whose extractUsage parses its native usage shape incl. cacheCreation. The
 * agent cannot self-report token counts (they live only in the CLI envelope), and the
 * orchestrator's post-collect enrichment races the post-exit `.log` dump — so writing
 * the real usage HERE (at the source, the moment the envelope is captured) is the
 * authoritative fix. No-op + never throws when no parseable envelope is present.
 */
export function patchResultUsageFromEnvelope(
  tasksDir: string,
  taskId: string,
  model: ModelType,
  logContent: string,
): void {
  try {
    const factory = USAGE_ADAPTER_FACTORIES[getProviderBinaryForModel(model)];
    if (!factory) return;
    const usage = factory(process.cwd()).extractUsage?.(logContent) as
      | { inputTokens?: number; outputTokens?: number; provider?: string; model?: string }
      | null
      | undefined;
    if (!usage || ((usage.inputTokens ?? 0) <= 0 && (usage.outputTokens ?? 0) <= 0)) return;
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    if (!existsSync(resultPath)) return;
    const r = JSON.parse(readFileSync(resultPath, 'utf-8')) as {
      tokenUsage?: { provider?: string; model?: string };
      providerBilling?: unknown;
    };
    r.tokenUsage = {
      ...usage,
      provider: usage.provider ?? r.tokenUsage?.provider,
      model: r.tokenUsage?.model ?? usage.model ?? model,
    };
    const provider = getProviderBinaryForModel(model);
    const billing = extractProviderBillingEvidence(provider, logContent);
    if (billing) r.providerBilling = billing;
    writeFileSync(resultPath, JSON.stringify(r, null, 2), 'utf-8');
  } catch (e) {
    debugLog('docker-backend:usage-patch', e);
  }
}

/**
 * born-637 (TRACE-CONTENT-PARITY docker-parity): normalize a captured
 * `docker logs` blob into the structured LogEvent JSONL contract
 * (`writeLogEvent`/`normalizeStreamEvent`, core/log-event.ts) and write it to
 * `logPath` — the SAME contract the subprocess backend's reference
 * implementation targets (spawn-backend-subprocess.ts `captureStreamToLog`),
 * adapted for a post-exit blob instead of a live stream (`docker logs` only
 * arrives once the container has already exited — see `monitorContainer`).
 *
 * Never throws: a malformed/plain-text line degrades to a `text` event
 * (`normalizeStreamEvent` never drops), and `writeLogEvent` itself is
 * fail-safe. Blank lines are skipped (NDJSON inter-record whitespace).
 *
 * Exported for unit tests (tests/orchestra/trace-content-parity.test.ts) —
 * proves a stream-json docker-logs fixture round-trips through
 * `OutputCollector.readLogEvents` with a non-zero event count.
 *
 * @returns The number of LogEvent rows written.
 */
export function writeNormalizedDockerLog(logPath: string, logContent: string, provider: string): number {
  // born-639 (404-005 TRACE-TAIL): a provider whose docker spec has no NDJSON
  // stream flag (gemini's docker spec is `--output-format json` — ONE envelope,
  // which may be pretty-printed across several lines) dumps a SINGLE JSON value
  // for the whole run. Splitting that by newline FIRST would shred it into
  // unparsable fragments (each individually degrading to a raw-text passthrough
  // instead of one coherent event). Try the whole trimmed content as one JSON
  // value first — a genuine NDJSON stream (claude stream-json, codex --json) is
  // always MULTIPLE top-level JSON values and fails this parse, falling through
  // to the per-line path below completely unchanged.
  const trimmed = logContent.trim();
  if (trimmed.length > 0 && isSingleJsonValue(trimmed)) {
    const raw = normalizeDockerLogLine(trimmed, provider);
    writeLogEvent(logPath, normalizeStreamEvent(raw, provider), 1);
    return 1;
  }

  let seq = 1;
  let written = 0;
  for (const line of logContent.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const raw = normalizeDockerLogLine(line, provider);
    writeLogEvent(logPath, normalizeStreamEvent(raw, provider), seq);
    seq += 1;
    written += 1;
  }
  return written;
}

/** True iff `text` parses as exactly one JSON value (object/array/scalar). */
function isSingleJsonValue(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * born-639 (404-005 TRACE-TAIL): pre-normalization bridge applied to a single
 * docker-logs line/envelope BEFORE it reaches `normalizeStreamEvent`. Provider
 * event shapes that `normalizeStreamEvent` cannot classify on its own are
 * translated onto one of its own recognized literal `type` values (see
 * {@link bridgeCodexEvent}). A no-op for every provider other than codex
 * (gemini's single-envelope shape is ALREADY correctly classified by
 * `normalizeStreamEvent`'s generic `response`-field detection — no bridge
 * needed), and a no-op for any line that is not a JSON object — both fall
 * through to `normalizeStreamEvent`'s own text-fallback exactly as before this
 * task, so claude's existing, already-tested behavior is byte-identical.
 */
function normalizeDockerLogLine(line: string, provider: string): string | Record<string, unknown> {
  if (provider !== 'codex') return line;
  const trimmed = line.trim();
  if (trimmed[0] !== '{') return line;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return line;
  }
  return isPlainObject(obj) ? bridgeCodexEvent(obj) : line;
}

/**
 * born-639 (404-005 TRACE-TAIL): bridge codex's real v2 thread/turn/item event
 * stream (verified against a live capture, codex-cli 0.138.0 —
 * `.brain/archive/sprints/sprint-366-tasks/task-366-001.log`, the born-366-001
 * evidence) onto normalizeStreamEvent's own recognized literal `type` values
 * (LOG_EVENT_TYPES, core/log-event.ts). Codex's flat event names
 * (`thread.started`, `turn.started`, `item.started`/`item.completed`,
 * `turn.completed`) match none of `normalizeStreamEvent`'s `directType()`
 * cases, so every one of them previously degraded to a generic `text`
 * passthrough (safe — never dropped — but flat: a real turn/tool_use/
 * tool_result/lifecycle distinction was available and simply unused).
 * `turn.completed` was ALREADY correctly detected as `usage` via
 * `hasUsageShape` (its payload carries a `usage` object) — mapped here too,
 * explicitly, purely for self-documentation; it changes nothing.
 *
 * Never throws, never drops: an event/item-type this function does not
 * recognize (anything outside the two item types verified in the reference
 * capture — `file_change`, `agent_message` — or any unlisted top-level type)
 * is returned UNCHANGED, so `normalizeStreamEvent`'s own passthrough still
 * classifies it (degrading to `text`, exactly as before this task). Whenever
 * this function DOES override `type`, the original codex discriminator string
 * is preserved under a `codexEventType` sibling key — no information is lost.
 *
 * Exported for unit tests (tests/orchestra/trace-tail-parity.test.ts).
 */
export function bridgeCodexEvent(obj: Record<string, unknown>): Record<string, unknown> {
  const t = obj['type'];
  const remap = (logType: string): Record<string, unknown> => ({ ...obj, type: logType, codexEventType: t });
  if (t === 'thread.started') return remap('lifecycle');
  if (t === 'turn.started') return remap('turn');
  if (t === 'turn.completed') return remap('usage');
  if (t === 'item.started' || t === 'item.completed') {
    const item = obj['item'];
    const itemType = isPlainObject(item) ? item['type'] : undefined;
    if (itemType === 'file_change') return remap(t === 'item.started' ? 'tool_use' : 'tool_result');
    if (itemType === 'agent_message') return remap('text');
  }
  return obj;
}

/** Narrow to a plain object (not null, not array). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * born-637 (TRACE-CONTENT-PARITY docker-parity): docker-container-LOCAL
 * override of the claude {@link ProviderCommandSpec}'s `baseArgs` —
 * `--output-format json` (a single final envelope) becomes `--output-format
 * stream-json` (the full NDJSON event stream) + `--verbose` (required by the
 * claude CLI alongside `--print` + `stream-json`; mirrors
 * cli/entry.ts:streamingArgsForProvider's own flag pairing).
 *
 * This is a LOCAL clone applied only to the docker-spawned command string —
 * the shared `PROVIDER_COMMAND_SPECS.claude` (core/provider-command-spec.ts)
 * is never mutated, so tmux.ts's claude invocation (and any other consumer of
 * the shared spec) keeps requesting the single envelope, unaffected.
 *
 * Why this is safe for token-usage capture: `ClaudeAdapter.extractUsage`
 * (providers/claude.ts) already scans EVERY line of the captured output for a
 * usage-bearing JSON payload and keeps the last match — stream-json's final
 * `type:"result"` NDJSON line carries the identical `usage{...}` shape as the
 * old single-envelope dump, so real token counts are unchanged (proven by the
 * usage-patch regression fixture in tests/orchestra/trace-content-parity.test.ts).
 *
 * A no-op (returns a shallow copy) when `baseArgs` does not carry
 * `--output-format json` in the exact expected shape — defensive against a
 * future spec edit changing the flag pairing out from under this override.
 *
 * Exported for unit tests.
 */
export function claudeStreamJsonBaseArgs(baseArgs: readonly string[]): string[] {
  const idx = baseArgs.indexOf('--output-format');
  if (idx === -1 || baseArgs[idx + 1] !== 'json') return [...baseArgs];
  const next = [...baseArgs];
  next[idx + 1] = 'stream-json';
  next.push('--verbose');
  return next;
}

export function getProviderBinaryForModel(model: ModelType): string {
  let provider: string;
  try {
    provider = getProviderForModel(model);
  } catch (e) {
    if (e instanceof UnknownModelError) {
      provider = 'claude';
    } else {
      throw e;
    }
  }
  if (provider === 'codex') return 'codex';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'ollama') {
    // Routing fix (sprint-spawner isAdapterProvider) should have prevented
    // ollama from reaching this function. Surface the regression honestly
    // instead of silently degrading to the claude CLI.
    const warning = `[deckent:spawn-backend-docker] Ollama provider routed to Docker backend for model "${model}" — `
      + 'host adapter routing missed this task (sprint-spawner.ts isAdapterProvider). '
      + 'Falling back to "claude" CLI to avoid mid-sprint crash, but the spawn is INCORRECT. '
      + 'Investigate: providerRegistry must have an OllamaAdapter registered and isAdapterProvider(\'ollama\') must return true.';
    console.warn(warning);
    debugLog('docker-backend:ollama-misroute', warning);
    return 'claude';
  }
  if (provider === 'openrouter') {
    // OPENROUTER-PROVIDER (row 477): same honest-fail contract as the ollama branch
    // above — `isAdapterProvider('openrouter')` is true, so reaching this function
    // means host-adapter routing was missed. The container has no path to the
    // `.deck`-resolved OpenRouter credential, so a "fallback" here is not a degraded
    // OpenRouter run — it is a CLAUDE run wearing an OpenRouter label. Warn loudly
    // rather than let that pass as an openrouter result.
    // (In practice the ProviderCommandSpec guard rejects earlier and louder; this is
    // defense-in-depth so the two providers behave symmetrically.)
    const warning = `[deckent:spawn-backend-docker] OpenRouter provider routed to Docker backend for model "${model}" — `
      + 'host adapter routing missed this task (sprint-spawner.ts isAdapterProvider). '
      + 'Falling back to "claude" CLI to avoid mid-sprint crash, but the spawn is INCORRECT. '
      + 'Investigate: providerRegistry must have an OpenRouterProvider registered '
      + '(config.openrouter.enabled + $DECK:OPENROUTER_API_KEY) and isAdapterProvider(\'openrouter\') must return true.';
    console.warn(warning);
    debugLog('docker-backend:openrouter-misroute', warning);
    return 'claude';
  }
  return 'claude';
}

// ─── SURF-3 S3 — live tool-by-tool activity from `docker logs -f` ─────────────

/** Injectable spawn for {@link followContainerActivity} (tests pass a fake). */
export type FollowSpawnFn = typeof nodeSpawn;

/**
 * Start a `docker logs -f <container>` follow child and stream its output
 * through the activity tap: each Claude-CLI stream-json line → per-tool
 * `WORKER→*:ACTIVITY` (SURF-3 S3). ADDITIVE + ACTIVITY-ONLY — the authoritative
 * `.log` is still written post-exit by writeNormalizedDockerLog, so
 * captureStreamToLog runs with `writeLog:false` (no double-write). When
 * `ctx.enabled` is false it is a zero-cost no-op. Fully fail-soft: a spawn/read
 * error only loses live activity, never touches the container or the .result.
 * Returns a stop() the caller invokes on container exit.
 *
 * The `docker logs -f` SPAWN itself is a thin shim (the real-docker path is the
 * honest verification gap); the activity mapping is exercised via
 * captureStreamToLog + a fake stream in tests.
 */
export function followContainerActivity(
  containerName: string,
  provider: string,
  ctx: ActivityTapContext,
  spawnFn: FollowSpawnFn = nodeSpawn,
  eventTap?: (event: StreamLogEvent) => void,
): () => void {
  if (!ctx.enabled && !eventTap) return () => { /* no observer needs the stream */ };
  let child: ReturnType<FollowSpawnFn> | undefined;
  try {
    child = spawnFn('docker', ['logs', '-f', containerName], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return () => { /* spawn failed — activity is best-effort */ };
  }
  child.once('error', () => { /* never let a follow error escape */ });
  if (child.stdout) {
    const activityTap = ctx.enabled ? makeActivityOnEvent(ctx) : undefined;
    void captureStreamToLog(child.stdout, {
      logPath: '', // unused: writeLog:false skips the .log append (post-exit writer is authoritative)
      provider,
      writeLog: false,
      onEvent: (event) => {
        activityTap?.(event);
        eventTap?.(event);
      },
    }).catch(() => { /* fail-soft: capture errors never break the worker */ });
  }
  return () => { try { child?.kill(); } catch { /* already exited */ } };
}

/**
 * F1-005 (Sprint 332): assemble the provider-aware `docker build` invocation a
 * worker's provider needs — the build-arg threading the spawn side surfaces when
 * the worker image cannot run the requested provider's CLI.
 *
 * Delegates the build-arg mapping to {@link buildSuggestedImageCmd} (core, the
 * single source of truth shared with `deckent image build` / doctor /
 * `checkWorkerImage`) so the codex/gemini opt-in args stay in lock-step with
 * `Dockerfile.worker`:
 *   - claude → no `--build-arg` (today's lean default image, byte-for-byte);
 *   - codex  → `--build-arg INSTALL_CODEX=true`;
 *   - gemini → `--build-arg INSTALL_GEMINI=true`;
 *   - any other / host-only (e.g. ollama, which never reaches the docker backend)
 *     → no `--build-arg` (lean image).
 *
 * Pure — exported for unit tests; never executed here. We only surface the command
 * in an honest-fail so the operator rebuilds the image with the right CLI, instead
 * of a silent claude fallback that would run a codex/gemini task on a claude-only
 * image (Yasa #2 + the ADR-076 auth-precedence lesson). The build context stays
 * the literal `.` from buildSuggestedImageCmd (operator runs it from the project
 * root) — no `process.cwd()` is consulted.
 */
export function workerImageBuildCmdForProvider(image: string, provider: string): string {
  return buildSuggestedImageCmd(image, [provider]);
}

/**
 * F1-IMG-SPAWN (364-004 DOCKER-PROVIDER-CLI): synchronous "image-reality" probe —
 * is `binary` actually on PATH inside `image` (not merely: does an image with
 * this tag exist)? `docker images -q` (the existing runSpawn() guard) only proves
 * the latter — a stale image (built before a codex/gemini opt-in, or without the
 * INSTALL_CODEX/INSTALL_GEMINI build-arg, F1-005/Sprint 332) passes it and only
 * fails deep inside the container ("command not found") instead of an actionable
 * pre-flight error.
 *
 * core/worker-image-check.ts's `checkWorkerImage()` already answers this exact
 * question for doctor/init/upgrade, but it is Promise-based (its injectable
 * `spawnImpl` is async `node:child_process.spawn`) while this backend's `spawn()`
 * is synchronous end-to-end (`SpawnBackend.spawn(...): void`, and every other
 * pre-container-start guard in this file uses `spawnSync`). This mirrors its
 * `command -v <bin>` probe technique via `spawnSync` instead of importing the
 * async function, to stay inside that sync contract.
 *
 * Fail-open (returns true) when the probe itself could not run at all (docker
 * daemon hiccup, timeout) — mirrors `healthCheckContainer`'s existing fail-open
 * convention in this file. The real `docker run -d` right after this still has
 * its own retry + health-check path (runDockerWithRetry) for genuine docker
 * failures; this probe's only job is to catch "image built without the CLI".
 *
 * Exported for unit tests (spawnSync mock seam, same pattern as the rest of
 * this file's docker-arg helpers).
 */
export function probeProviderCliPresentInImage(image: string, binary: string): boolean {
  const probe = spawnSync(
    'docker',
    ['run', '--rm', image, 'sh', '-c', `command -v ${binary}`],
    { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (probe.error || probe.status === null || probe.status === undefined) return true;
  return probe.status === 0;
}

/** Result of a single health-check inspect call. */
export interface HealthCheckResult {
  /** Container is running normally — proceed with monitor. */
  healthy: boolean;
  /** Container started then exited with code 0 (gracefully). */
  instantExitSuccess: boolean;
  /** Exit code reported by docker inspect, -1 if inspect failed entirely. */
  exitCode: number;
  /** Raw inspect stdout (debug). */
  raw: string;
}

/**
 * Classify a docker stderr blob into a stable error code.
 * Pure function — exported for unit tests.
 */
export function classifyDockerError(stderr: string, exitCode: number): {
  code: DockerErrorCode;
  message: string;
} {
  const s = (stderr ?? '').toLowerCase();
  if (
    s.includes('pull access denied') ||
    s.includes('image not found') ||
    s.includes('unable to find image') ||
    s.includes('no such image') ||
    s.includes('manifest unknown')
  ) {
    return {
      code: DOCKER_ERROR_CODES.IMAGE_NOT_FOUND,
      message: `${DOCKER_ERROR_CODES.IMAGE_NOT_FOUND}: Docker image bulunamadı`,
    };
  }
  if (
    s.includes('port is already allocated') ||
    s.includes('address already in use') ||
    s.includes('bind: address already in use') ||
    s.includes('port already in use')
  ) {
    return {
      code: DOCKER_ERROR_CODES.PORT_COLLISION,
      message: `${DOCKER_ERROR_CODES.PORT_COLLISION}: Port çakışması`,
    };
  }
  if (
    s.includes('cannot allocate memory') ||
    s.includes('resource temporarily unavailable') ||
    s.includes('no space left on device') ||
    s.includes('memory limit') ||
    s.includes('oom')
  ) {
    return {
      code: DOCKER_ERROR_CODES.RESOURCE_LIMIT,
      message: `${DOCKER_ERROR_CODES.RESOURCE_LIMIT}: Docker resource limit`,
    };
  }
  const stderrSummary = (stderr ?? '').trim().slice(0, 200);
  return {
    code: DOCKER_ERROR_CODES.UNKNOWN,
    message: `${DOCKER_ERROR_CODES.UNKNOWN}: container_start_failed (exitCode=${exitCode}, stderr=${stderrSummary})`,
  };
}

/**
 * Parse `docker inspect --format '{{.State.Running}}|{{.State.ExitCode}}'` output.
 * Format: "true|0" or "false|137". Returns null on malformed input.
 */
export function parseInspectOutput(stdout: string): { running: boolean; exitCode: number } | null {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('|');
  if (parts.length !== 2) return null;
  const runningRaw = parts[0];
  const exitCodeRaw = parts[1];
  if (runningRaw === undefined || exitCodeRaw === undefined) return null;
  const running = runningRaw.trim() === 'true';
  const exitCode = parseInt(exitCodeRaw.trim(), 10);
  if (Number.isNaN(exitCode)) return null;
  return { running, exitCode };
}

/**
 * DECK-WORKER-ISOLATION (ADR-G-005): build the read-only shadow mount that hides
 * the project's `.deck` secret file from a worker container.
 *
 * The docker backend bind-mounts the WHOLE project root read-write at
 * `/workspace`, and `.deck` lives in the project root — so without this a worker
 * can `read('/workspace/.deck')` and see every deckent secret (verified live).
 * Overlaying an empty regular file at that path read-only makes the worker see a
 * 0-byte `.deck` while the host file is untouched; the provider credential the
 * worker legitimately needs still arrives via the per-provider env allowlist
 * (F1-014r), so nothing breaks.
 *
 * **CONDITIONAL by design — only shadow when the host `.deck` exists.** A nested
 * bind mount materializes its target on the host underlying dir before mounting,
 * and `/workspace` IS the project root (same inode). Shadowing a non-existent
 * `.deck` therefore makes docker CREATE a phantom empty `${dir}/.deck` on the
 * host that persists after the container exits (verified: regular empty file) —
 * deckent silently writing a secret file into the user's repo and colliding with
 * `createDeckTemplate` / DECK-OVERWRITE-GUARD. No file to hide ⇒ no mount.
 *
 * Pure — exported for unit tests. The caller creates the empty shadow source file
 * (a regular 0-byte file, so docker cannot create a `.deck` *directory* instead).
 *
 * NOTE (honest scope): this closes the file-exposure half of zero-worker-exposure
 * for the DOCKER backend only. The subprocess backend runs the worker as a host
 * process inside the project root, so `.deck` stays disk-readable there (mitigated
 * by env-scrubbing, not mount-isolation) until the host-side credential broker
 * lands — see ADR-G-005.
 */
export function buildDeckShadowMountArgs(deckExists: boolean, shadowHostPath: string): string[] {
  if (!deckExists) return [];
  return ['-v', `${shadowHostPath}:${CONTAINER_WORKSPACE}/${DECK_FILE_NAME}:ro`];
}

/**
 * DECK-WORKER-ISOLATION (ADR-G-005): create/refresh the empty host file that the
 * `.deck` shadow mount overlays, returning its path.
 *
 * The shadow source lives at `${tasksDir}/.deck-shadow` — a single path shared by
 * EVERY worker in a sprint, so the write MUST be idempotent. It is written
 * owner-writable (`0o600`), never `0o400`: a read-only file would make the second
 * worker's `writeFileSync` (which opens `O_WRONLY|O_TRUNC`) throw `EACCES` and
 * crash the spawn, breaking every multi-worker docker sprint. Read-only INSIDE the
 * container is enforced by the mount's `:ro` flag (buildDeckShadowMountArgs), not
 * by the host file mode, so host write permission does not weaken the isolation.
 *
 * Exported for unit tests (idempotency regression).
 *
 * STALE-SHADOW-PERMS fix (Sprint 349): `writeFileSync`'s `mode` option only
 * applies when the file is CREATED — against a pre-existing file the call
 * opens `O_WRONLY|O_TRUNC` and `mode` is ignored entirely. A shadow left
 * read-only (0o400) by an older build (or a foreign-permission artifact)
 * therefore makes the O_TRUNC write throw `EACCES` and fail the whole SPAWN
 * phase (live-observed: sprint-347 first launch). Converge ANY pre-existing
 * perm state to writable before writing: try `chmodSync` first (cheap,
 * preserves the file/inode); if that fails (e.g. Windows ACL semantics, or a
 * foreign-owned file chmod can't fix), fall back to removing the stale file
 * so the write below re-creates it fresh via its CREATE-path `mode`. Both
 * guards are best-effort and never throw through — a genuinely unwritable
 * path still surfaces an honest error from the final `writeFileSync`.
 */
export function ensureDeckShadowFile(tasksDir: string): string {
  const shadowHostPath = join(tasksDir, '.deck-shadow');
  if (existsSync(shadowHostPath)) {
    try {
      chmodSync(shadowHostPath, 0o600);
    } catch (e) {
      debugLog('docker-backend:deck-shadow-chmod', e);
      try {
        unlinkSync(shadowHostPath);
      } catch (unlinkErr) {
        debugLog('docker-backend:deck-shadow-unlink', unlinkErr);
      }
    }
  }
  writeFileSync(shadowHostPath, '', { mode: 0o600 });
  return shadowHostPath;
}

// ─── born-644 (428-012 BUILD-VIOLATION-GUARD, B542): dist read-only mount guard ──
// The dist-mtime sentinel further below (computeDistFingerprint/distFingerprintsChanged/
// applyDistMutationAdvisory, wired in monitorContainer) only DETECTS a dist/ mutation
// AFTER the container has already exited — advisory-only, mirroring the NPM-ADVISORY
// precedent (born-454), never blocking. This is the MECHANICAL half: a nested read-only
// bind mount of the host `dist/` directory over the container's `${CONTAINER_WORKSPACE}/dist`
// — same overlay technique as buildDeckShadowMountArgs (ADR-G-005): the whole project
// root is already bind-mounted READ-WRITE at CONTAINER_WORKSPACE, and a nested
// `-v ...:ro` mount on top of one subtree shadows only that subtree read-only. A worker
// container that runs `npm run build`/`tsc`/`build:all` now hits a real filesystem-level
// EROFS/EACCES immediately, instead of silently writing through to host dist/ — the
// WORKER-GUIDE.md "no build in worker" rule becomes structurally unavoidable rather than
// advisory-only. The two layers are independent and both stay wired: this mount blocks
// the write; the sentinel still catches it (defense-in-depth) if the mount is ever
// bypassed or misconfigured.

/**
 * Build the read-only dist/ overlay mount args for `docker run`.
 *
 * **CONDITIONAL by design — only mounts when the host `dist/` already exists.**
 * Mirrors {@link buildDeckShadowMountArgs}: a nested bind mount over a MISSING target
 * materializes a phantom directory on the host underlying dir before mounting
 * (CONTAINER_WORKSPACE IS the project root, same inode) — mounting a not-yet-built
 * `dist/` read-only would make docker create an empty, host-created `dist/` directory
 * that then blocks the very next legitimate `npm run build`. No `dist/` yet (fresh
 * clone / pre-first-build) ⇒ no mount; the dist-mtime sentinel already treats a null
 * fingerprint as the honest "not built yet" state, so nothing regresses.
 *
 * Pure — exported for unit tests.
 */
export function buildDistReadOnlyMountArgs(distExists: boolean, distHostPath: string): string[] {
  if (!distExists) return [];
  return ['-v', `${distHostPath}:${CONTAINER_WORKSPACE}/dist:ro`];
}

// ─── born-468: WRAPPER-HB-GATE (heartbeat staleness gate) ──────────────────
// The wrapper's background heartbeat tick used to unconditionally overwrite
// $HBFILE every 15s with a skeletal {workerId,taskId,status,sequence,
// timestamp,backend} payload — clobbering any richer heartbeat the worker
// itself just wrote. Gate the write on staleness: only refresh $HBFILE when
// it is missing or older than WRAPPER_HB_STALE_THRESHOLD_SECONDS, and write
// it atomically (tmp+mv — same directory ⇒ a single rename syscall) so a
// concurrent reader (auditor stale-worker scan) never observes a torn write.

/**
 * Build the POSIX `sh` `write_hb_if_stale()` function definition. Extracted
 * from {@link buildHeartbeatWrapperLoop} so it is independently invokable in
 * tests (write it to a script, call `write_hb_if_stale <seq>`) without
 * running the real 15s-interval background loop.
 */
export function buildHeartbeatGateFn(taskId: string): string {
  return [
    'write_hb_if_stale() {',
    '  hb_seq="$1"',
    '  if [ -f "$HBFILE" ]; then',
    '    hb_mtime=$(stat -c %Y "$HBFILE" 2>/dev/null || echo 0)',
    '    hb_now=$(date -u +%s)',
    '    hb_age=$((hb_now - hb_mtime))',
    `    if [ "$hb_age" -lt ${WRAPPER_HB_STALE_THRESHOLD_SECONDS} ]; then`,
    // Fresh heartbeat already on disk — the worker itself is writing it.
    // Do NOT touch it (born-468: this is the fix — the old loop always wrote).
    '      return 0',
    '    fi',
    '  fi',
    '  hb_tmp="$HBFILE.hbwrap.$$"',
    `  echo "{\\"workerId\\":\\"docker-${taskId}\\",\\"taskId\\":\\"${taskId}\\",\\"status\\":\\"EXECUTING\\",\\"sequence\\":$hb_seq,\\"timestamp\\":\\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\\",\\"backend\\":\\"docker\\"}" > "$hb_tmp"`,
    '  mv "$hb_tmp" "$HBFILE"',
    '}',
  ].join('\n');
}

/**
 * Build the full wrapper heartbeat loop: the gate function above plus its
 * background 15s-interval driver. This is what actually goes into the
 * generated worker script.
 */
export function buildHeartbeatWrapperLoop(taskId: string): string {
  return [
    buildHeartbeatGateFn(taskId),
    '( SEQ=2; while true; do sleep 15; SEQ=$((SEQ+1)); write_hb_if_stale "$SEQ"; done ) &',
  ].join('\n');
}

// ─── born-471: ALLOWLIST-SSOT ───────────────────────────────────────────────
// sprint-spawner.ts's buildAllowedWriteTargets merges scope.directories into
// the SAME Write()/Edit() target list as scope.filesWrite unconditionally.
// The worker PROMPT disagrees (prompt-god-template.ts PCOMP-W1, "single write
// authority"): once an explicit filesWrite list exists it is the SOLE write
// authority and the directory list is READ/context scope only — a worker told
// "you may only write these N files" must not simultaneously hold a
// --allowedTools grant of Write()/Edit() over an entire read-context
// directory (e.g. docs/adr/ listed for read-context, with no matching docs/
// entry in filesWrite, would otherwise still be writable). The docker backend
// is the last hop before the flag reaches the CLI, so it re-derives the
// allowlist HERE from the task's own on-disk scope, applying the same
// canonical rule as the prompt — independent of whatever opts.allowedTools
// the caller computed. (sprint-spawner.ts itself is out of this task's write
// scope; importing its helpers here would also create an import cycle —
// sprint-spawner → spawn-backend → spawn-backend-docker → sprint-spawner.)

/** Pure scope shape this module needs — subset of `TaskScope` (core/task-types.ts). */
export interface DockerAllowedToolsScope {
  directories?: readonly string[];
  filesWrite?: readonly string[];
}

/**
 * Derive the docker backend's `--allowedTools` string from a task's scope.
 * `filesWrite` present → SOLE write authority (directories excluded — they
 * stay read-only context, reachable only via the unscoped Read/Glob/Grep).
 * `filesWrite` absent → directories become the write-fallback target
 * (mirrors the prompt's own "no explicit Files list — you may write to any
 * file within the directories above" wording). `.tasks/` is always included
 * so the worker can write its own heartbeat/result files — this also means
 * a task with neither directories nor filesWrite still narrows Write/Edit to
 * `.tasks/` only, never falls open to unrestricted Write/Edit (a scope-less
 * task must not silently get the widest possible grant). Pure — exported for
 * unit tests.
 */
export function buildDockerAllowedTools(scope: DockerAllowedToolsScope): string {
  const directories = normalizeNonEmptyStrings(scope.directories);
  const filesWrite = normalizeNonEmptyStrings(scope.filesWrite);
  const writeSource = filesWrite.length > 0 ? filesWrite : directories;
  const writeTargets = dedupeTrimmed(['.tasks/', ...writeSource]);
  return `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`;
}

function normalizeNonEmptyStrings(values: readonly string[] | undefined): string[] {
  return (values ?? []).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function dedupeTrimmed(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of paths) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// ─── born-644 (408-002 BUILD-VIOLATION-GUARD): dist-mtime sentinel ─────────
// Live incident (2026-07-11): host `dist/` was found rebuilt mid-sprint — suspected an
// in-container `npm run build`/`tsc`/`build:all`. The docker backend bind-mounts the WHOLE
// project root read-write (`-v ${dir}:${CONTAINER_WORKSPACE}`, see runSpawn's dockerArgs), so
// any such command run inside a container writes straight through to host `dist/`, poisoning
// every other worker's ESM module cache mid-sprint (a live-loaded `dist/` module can be
// half-rewritten under a concurrent worker's require). This is advisory-only, mirroring the
// NPM-ADVISORY precedent (born-454, see the worker-prompt's own dependency-mutation
// escalation contract): it NEVER blocks a spawn or alters a worker's own selfAssessment — it
// only flags `.result.distMutated` + a loud stderr warning once the mutation is observed after
// container exit, so Brain/the operator see it without any worker being punished for it.

/** Cheap content-mutation snapshot of a directory tree — not a cryptographic hash. */
export interface DistFingerprint {
  fileCount: number;
  maxMtimeMs: number;
}

/**
 * Snapshot `distDir` for later mutation comparison. Returns null when the directory does not
 * exist (fresh clone / pre-first-build — absence is not itself a mutation signal).
 *
 * Per-entry `statSync` failures are swallowed (entry vanished mid-walk, e.g. a concurrent
 * build actively deleting/recreating files) — never let the sentinel itself crash a spawn.
 * Exported for unit tests.
 */
export function computeDistFingerprint(distDir: string): DistFingerprint | null {
  if (!existsSync(distDir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(distDir, { recursive: true }) as string[];
  } catch (e) {
    debugLog('docker-backend:dist-fingerprint', e);
    return null;
  }
  let fileCount = 0;
  let maxMtimeMs = 0;
  for (const rel of entries) {
    try {
      const st = statSync(join(distDir, rel));
      if (!st.isFile()) continue;
      fileCount++;
      if (st.mtimeMs > maxMtimeMs) maxMtimeMs = st.mtimeMs;
    } catch (e) {
      debugLog('docker-backend:dist-fingerprint-entry', e);
    }
  }
  return { fileCount, maxMtimeMs };
}

/**
 * Pure comparison — true iff the two snapshots indicate `dist/` was mutated (file added,
 * removed, or an existing file's content rewritten) between capture points. A null<->non-null
 * transition (dist/ appeared or disappeared entirely) also counts as a mutation.
 */
export function distFingerprintsChanged(
  before: DistFingerprint | null,
  after: DistFingerprint | null,
): boolean {
  if (before === null && after === null) return false;
  if (before === null || after === null) return true;
  return before.fileCount !== after.fileCount || before.maxMtimeMs !== after.maxMtimeMs;
}

/**
 * Advisory-only `.result` patch: merges `distMutated: true` into the existing result JSON when
 * `mutated` is true AND the file exists. A no-op (returns false, writes nothing) when not
 * mutated, when `.result` is missing, or when the existing JSON cannot be parsed — this must
 * never throw out and never fabricate a `.result` the worker did not write itself (that would
 * cross from advisory into blocking). Exported for unit tests.
 */
export function applyDistMutationAdvisory(resultPath: string, mutated: boolean): boolean {
  if (!mutated || !existsSync(resultPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    parsed.distMutated = true;
    writeFileSync(resultPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return true;
  } catch (e) {
    debugLog('docker-backend:dist-mutation-patch', e);
    return false;
  }
}

// ─── born-671 (416-001 CAPTURE-TRUTH): streamed docker-logs capture ─────────
// TT549 live incident (CC-doğrulandı): monitorContainer captured `docker logs`
// via spawnSync with NO maxBuffer → Node's 1 MiB default SILENTLY truncated 44%
// (16/36) of the trace corpus at the 1.075–1.171 MB band, AND the ENOBUFS error
// spawnSync sets on that overflow was never checked. The cut dropped the terminal
// usage envelope → patchResultUsageFromEnvelope got truncated input → cost-heuristic
// 293× drift (413-001). This replaces the fixed-buffer spawnSync with an async
// STREAM: chunks accumulate with only a generous 256 MiB SAFETY ceiling (an honest
// on-disk marker + loud warn on the rare overflow — NEVER a silent cut), and a
// spawn-error / non-zero-exit / terminating-signal is surfaced (captureIncomplete +
// named loud warn) with the partial data STILL returned, never hidden. A raw
// maxBuffer bump cannot do any of this — the streaming child + honest ceiling are
// the structural difference (why the NO_GO "stream'siz maxBuffer-büyütme" is avoided).

/**
 * Safety ceiling for a single streamed `docker logs` capture (256 MiB). This is
 * NOT the old 1 MiB maxBuffer cut — it exists only to stop a runaway/adversarial
 * log from exhausting host memory, and hitting it is surfaced HONESTLY (marker +
 * warn + captureIncomplete), never silently. Realistic worker traces are 1–10 MB.
 */
export const DOCKER_LOG_CAPTURE_CEILING_BYTES = 256 * 1024 * 1024;

/**
 * Wall-clock cap for reading `docker logs` off an already-exited container (30 s).
 * On timeout the child is killed and the partial capture returned as incomplete so
 * a hung `docker logs` never stalls the downstream `docker rm -f` / lock release.
 * Deliberately higher than the old spawnSync 10 s — a large (but legitimate) log must
 * not be cut for speed; completeness wins (the whole point of this fix).
 */
export const DOCKER_LOG_CAPTURE_TIMEOUT_MS = 30_000;

/**
 * Honest, self-identifying marker appended to captured content when the safety
 * ceiling is hit. It flows into the `.log` as a `text` LogEvent (writeNormalizedDockerLog
 * splits on newline), so the truncation is visible ON DISK, not merely in a warning.
 */
export const DOCKER_LOG_TRUNCATION_MARKER =
  '\n[deckent:docker-logs-capture] TRUNCATED at the 256MiB safety ceiling — capture '
  + 'stopped here (honest marker, NOT a silent 1MiB cut). captureIncomplete=true\n';

/**
 * Minimal child shape {@link captureDockerLogs} needs — the SpawnImpl pattern from
 * core/worker-image-check.ts, extended with `kill()` for the ceiling cut. A real
 * `node:child_process` ChildProcess satisfies it structurally.
 */
export interface DockerLogsChildLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

/** Injectable async spawn for {@link captureDockerLogs} (defaults to node spawn). */
export type DockerLogsSpawnImpl = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => DockerLogsChildLike;

/** Result of a streamed docker-logs capture. */
export interface DockerLogCapture {
  /** Full captured output — stdout THEN stderr, matching the old `(stdout)+(stderr)` concat. */
  content: string;
  /** True when the 256 MiB safety ceiling was hit — `content` carries the honest marker. */
  truncated: boolean;
  /** True when data may be missing: truncation, spawn error, non-zero exit, or signal. */
  captureIncomplete: boolean;
  /** docker-logs exit code, or null when the spawn errored / was killed before a clean exit. */
  exitCode: number | null;
  /** Terminating signal, if any. */
  signal: NodeJS.Signals | null;
  /** Bytes retained (equals the ceiling when truncated). */
  bytesCaptured: number;
}

/**
 * Stream `docker logs <container>` into memory with NO fixed 1 MiB cap — the core
 * fix for TT549. stdout+stderr chunks accumulate as they arrive; the only bound is
 * the generous {@link DOCKER_LOG_CAPTURE_CEILING_BYTES} safety ceiling, and hitting
 * it (or any spawn-error / non-zero-exit / signal) is surfaced honestly rather than
 * swallowed. The returned `content` is the SAME pristine string the old spawnSync
 * path produced, so its two consumers (writeNormalizedDockerLog +
 * patchResultUsageFromEnvelope) are byte-for-byte unchanged — only their INPUT is
 * now full-data instead of 1 MiB-truncated.
 *
 * Injectable `spawnImpl` (SpawnImpl pattern, core/worker-image-check.ts) keeps the
 * regression tests hermetic — no real docker. Exported for unit tests. Never throws:
 * a synchronous spawn failure resolves to an empty, `captureIncomplete` result.
 */
export function captureDockerLogs(
  containerName: string,
  spawnImpl?: DockerLogsSpawnImpl,
  opts?: { ceilingBytes?: number; timeoutMs?: number },
): Promise<DockerLogCapture> {
  const ceiling = opts?.ceilingBytes ?? DOCKER_LOG_CAPTURE_CEILING_BYTES;
  const timeoutMs = opts?.timeoutMs ?? DOCKER_LOG_CAPTURE_TIMEOUT_MS;
  const doSpawn: DockerLogsSpawnImpl =
    spawnImpl ?? ((command, args, options) => nodeSpawn(command, args, options));

  return new Promise<DockerLogCapture>((resolveCapture) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: {
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      spawnError?: Error;
    }): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      let content =
        Buffer.concat(stdoutChunks).toString('utf8') + Buffer.concat(stderrChunks).toString('utf8');
      // A deliberate ceiling-kill sets neither exitCode nor signal here (we own the
      // cut) — `truncated` alone carries that meaning, so it is NOT double-counted as
      // an abnormal exit below.
      const exitDishonest =
        outcome.spawnError !== undefined ||
        outcome.signal !== null ||
        (outcome.exitCode !== null && outcome.exitCode !== 0);
      const captureIncomplete = truncated || exitDishonest;
      if (truncated) {
        content += DOCKER_LOG_TRUNCATION_MARKER;
        console.warn(
          `[deckent:spawn-backend-docker] captureDockerLogs: '${containerName}' hit the `
          + `${ceiling}-byte capture ceiling — output truncated with an honest on-disk marker `
          + `(retained ${totalBytes} bytes). SAFETY cap, not the old 1MiB silent cut.`,
        );
      }
      if (outcome.spawnError !== undefined) {
        console.warn(
          `[deckent:spawn-backend-docker] captureDockerLogs: docker logs spawn/read error for `
          + `'${containerName}' — ${outcome.spawnError.message}. captureIncomplete=true; returning `
          + `${totalBytes} bytes of partial log (loss surfaced, not hidden).`,
        );
      } else if (exitDishonest) {
        console.warn(
          `[deckent:spawn-backend-docker] captureDockerLogs: docker logs for '${containerName}' `
          + `exited abnormally (exitCode=${outcome.exitCode}, signal=${outcome.signal}). `
          + `captureIncomplete=true; returning ${totalBytes} bytes of partial log (loss surfaced, not hidden).`,
        );
      }
      resolveCapture({
        content,
        truncated,
        captureIncomplete,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        bytesCaptured: totalBytes,
      });
    };

    let child: DockerLogsChildLike;
    try {
      child = doSpawn('docker', ['logs', containerName], { shell: false });
    } catch (err) {
      finish({ exitCode: null, signal: null, spawnError: err instanceof Error ? err : new Error(String(err)) });
      return;
    }

    const absorb = (chunks: Buffer[], chunk: string | Buffer): void => {
      if (truncated || settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = ceiling - totalBytes;
      if (buf.length >= remaining) {
        // Ceiling hit — retain only what fits, mark truncated, stop the stream.
        if (remaining > 0) {
          chunks.push(buf.subarray(0, remaining));
          totalBytes += remaining;
        }
        truncated = true;
        try { child.kill('SIGKILL'); } catch { /* best-effort — process may already be gone */ }
        finish({ exitCode: null, signal: null });
        return;
      }
      chunks.push(buf);
      totalBytes += buf.length;
    };

    child.stdout?.on('data', (c: string | Buffer) => absorb(stdoutChunks, c));
    child.stderr?.on('data', (c: string | Buffer) => absorb(stderrChunks, c));
    child.on('error', (err) => finish({ exitCode: null, signal: null, spawnError: err }));
    child.on('close', (code, signal) => finish({ exitCode: code, signal }));

    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* best-effort */ }
      finish({
        exitCode: null,
        signal: null,
        spawnError: new Error(`docker logs read timed out after ${timeoutMs}ms`),
      });
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

// ─── Docker Spawn Backend ─────────────────────────────────────────────────

export class DockerSpawnBackend implements SpawnBackend {
  readonly name = 'docker';

  private readonly projectDir: string;
  private readonly image: string;
  private readonly timeoutSeconds: number;
  private readonly gracefulTimeoutSeconds: number;
  private readonly memoryLimit: string;
  private readonly memorySwap: string;
  private readonly kindMemoryLimits: Record<string, string>;
  private readonly verifyProviderCliInImage: boolean;
  private readonly containers = new Map<string, { containerId: string; model: string }>(); // taskId → container info

  constructor(projectDir: string, opts?: { image?: string; timeoutSeconds?: number; gracefulTimeoutSeconds?: number; memoryLimit?: string; memorySwap?: string; kindMemoryLimits?: Record<string, string>; verifyProviderCliInImage?: boolean }) {
    this.projectDir = resolve(projectDir);
    this.image = opts?.image ?? DEFAULT_IMAGE;
    this.timeoutSeconds = opts?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    this.gracefulTimeoutSeconds = opts?.gracefulTimeoutSeconds ?? DEFAULT_GRACEFUL_TIMEOUT_SECONDS;
    this.memoryLimit = opts?.memoryLimit ?? DEFAULT_WORKER_MEMORY_LIMIT;
    this.memorySwap = opts?.memorySwap ?? DEFAULT_WORKER_MEMORY_SWAP;
    const rawKindLimits = opts?.kindMemoryLimits ?? {};
    // Validate kind limits at construction time — fail fast on invalid values
    for (const [kind, limitStr] of Object.entries(rawKindLimits)) {
      if (parseMemoryString(limitStr) === null) {
        throw new DeckentError('DECKENT_E004', `Invalid memory limit for kind '${kind}': '${limitStr}'. Expected docker memory string (e.g. '768m', '1536m', '1.5g').`);
      }
    }
    this.kindMemoryLimits = rawKindLimits;
    // F1-IMG-SPAWN (364-004): opt-in, default false — see probeProviderCliPresentInImage
    // doc comment for why this cannot be default-on yet (SpawnBackendFactory wiring
    // is out of this task's DISTINCT-FILE scope, and several existing docker-backend
    // test suites assert exactly one `docker run` call per spawn).
    this.verifyProviderCliInImage = opts?.verifyProviderCliInImage ?? false;
  }

  /**
   * Spawn a worker in an isolated Docker container.
   *
   * Container setup:
   * - Project directory mounted READ-WRITE at /workspace (worker writes code);
   *   dist/ is remounted read-only on top (born-644 host-dist-ezme guard'ı)
   * - .tasks/ mounted read-write (shared volume for results)
   * - Claude auth cache mounted read-only
   * - API keys passed as env vars if available
   * - timeout wrapper kills container after limit
   */
  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    // GATE-W2 toggle-independent SAFETY_FLOOR guard — MUST run before any side
    // effect (markPending/mkdir/docker). The default backend previously skipped
    // it while tmux/subprocess enforced it: a lethal actionId could spawn here.
    checkLethalGuard(opts?.actionId, this.name);
    const dir = opts?.projectDir ?? this.projectDir;
    const executionBudget = resolveTaskExecutionBudget(dir, taskId, opts?.executionBudget);
    if (typeof executionBudget?.maxUsd === 'number') {
      assertLiveUsageBudgetSupport(executionBudget, undefined, this.name);
    }
    if (hasLiveUsageCeiling(executionBudget)) {
      const provider = getProviderForModel(model);
      const spec = getProviderCommandSpec(provider);
      if (spec?.liveUsage !== 'incremental') {
        throw new SpawnBackendError(
          `Docker provider "${provider}" does not expose incremental measured usage; live execution budget cannot be enforced. Spawn blocked before provider work.`,
          this.name,
        );
      }
    }
    const resolvedOpts = executionBudget === opts?.executionBudget
      ? opts
      : { ...opts, executionBudget };
    // Adaptive timeout: prefer per-task override from brainEstimateTimeout(),
    // fall back to constructor value, then DEFAULT_TIMEOUT_SECONDS
    const effectiveTimeout = opts?.taskTimeoutSeconds ?? this.timeoutSeconds;
    const tasksDir = join(dir, TASKS_DIR);
    mkdirSync(tasksDir, { recursive: true });

    // Sprint 170 P0-5: mark as pending BEFORE prompt write + lock acquisition.
    // Bridges the ~3s race window between prompt write and .hb creation during
    // which a concurrent cleanup (sibling kill()) would see no .hb and delete
    // the new worker's prompt file. clearPending is called on all error paths.
    markPending(taskId);

    // Sprint 156 Task 10: spawn-time per-file lock acquisition.
    // Reject the spawn if any file in this task's scope.filesWrite is already
    // claimed by a different active task — prevents concurrent worker writes
    // to the same file. Acquired locks are released on container exit
    // (monitorContainer) or forced kill().
    this.acquireSpawnTimeLocks(dir, taskId);

    // Sprint 156 Task 10 (fix): every code path between here and the
    // successful handoff to monitorContainer() must release the spawn locks
    // if it fails — otherwise a transient docker error permanently blocks
    // the file scope for the next worker. monitorContainer's exit handler
    // is what releases on the happy path.
    try {
      this.runSpawn(taskId, model, prompt, resolvedOpts, dir, effectiveTimeout, tasksDir);
    } catch (err) {
      clearPending(taskId);
      try { releaseAllSpawnLocks(dir, taskId); } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }
      throw err;
    }
  }

  private runSpawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts: SpawnBackendOptions | undefined,
    dir: string,
    effectiveTimeout: number,
    tasksDir: string,
  ): void {
    // F1-005 (Sprint 332): resolve this worker's provider up-front so the image
    // readiness honest-fail below can name the EXACT provider-aware rebuild
    // command. codex/gemini CLIs are opt-in build-args in Dockerfile.worker; claude
    // is the lean default. (Re-used downstream for the ProviderCommandSpec lookup.)
    const provider = modelRegistry.get(model)?.provider ?? getDefaultProviderName();

    // 455-003 (DOCKER-PREFLIGHT-TRUTH): daemon preflight BEFORE the image lookup.
    // A stopped/forbidden daemon (or an absent docker binary) makes `docker images
    // -q` return empty stdout too — the pre-455-003 code then threw the SAME
    // "image not ready" error, mis-reporting a daemon/permission problem as a
    // missing image and sending the operator to rebuild an image that was never
    // the issue. Classify the daemon reachability first so daemon-permission /
    // daemon-unavailable / docker-absent surface as their OWN distinct codes with
    // evidence, never collapsed into IMAGE_NOT_FOUND.
    const daemonPreflight = probeDockerDaemon();
    if (daemonPreflight) {
      throw new SpawnBackendError(
        `${daemonPreflight.message} (task ${taskId}, provider '${provider}', evidence: ${daemonPreflight.evidence})`,
        'docker',
      );
    }

    // Guard: verify Docker image exists before attempting spawn.
    const imageCheck = spawnSync('docker', ['images', '-q', this.image], {
      encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Defensive re-check: if the image query ITSELF reports a daemon/permission/
    // absent failure (the daemon could drop between the preflight and here), honor
    // that distinct classification rather than falling through to image-missing.
    if (imageCheck.error || (imageCheck.status !== null && imageCheck.status !== 0)) {
      const pf = classifyDockerPreflight({
        status: imageCheck.status,
        stderr: imageCheck.stderr,
        spawnError: imageCheck.error ?? null,
      });
      if (pf) {
        throw new SpawnBackendError(
          `${pf.message} (task ${taskId}, provider '${provider}', evidence: ${pf.evidence})`,
          'docker',
        );
      }
    }
    if (!imageCheck.stdout?.trim()) {
      // Distinct IMAGE-MISSING failure (daemon already confirmed healthy above):
      // the image TAG does not exist locally — a genuinely different remedy than a
      // missing provider-CLI (E088 below) or an unreachable daemon (E085/E086).
      // Provider-aware rebuild command: codex/gemini need their build-arg, claude
      // is the lean default image (Yasa #2 + the ADR-076 auth-precedence lesson).
      throw new SpawnBackendError(
        `${DOCKER_ERROR_CODES.IMAGE_NOT_FOUND}: Docker image '${this.image}' not found locally for provider '${provider}' `
        + `(task ${taskId}) — the image tag does not exist on this host. This is an IMAGE-MISSING failure, `
        + `distinct from an unreachable daemon or a missing provider CLI. `
        + `Build it with: ${workerImageBuildCmdForProvider(this.image, provider)}`,
        'docker',
      );
    }

    // WSL2 memory warning — Docker containers share WSL2 memory pool
    if (process.platform === 'linux') {
      try {
        const procVersion = readFileSync('/proc/version', 'utf-8');
        if (procVersion.includes('microsoft') || procVersion.includes('WSL')) {
          const totalGB = Math.round(totalmem() / (1024 * 1024 * 1024));
          if (totalGB < 6) {
            debugLog('docker-backend:wsl2-memory',
              `WSL2 total memory ${totalGB}GB — Docker workers need ~4GB each. Consider increasing .wslconfig memory.`);
          }
        }
      } catch { /* /proc/version not readable — skip WSL2 check */ }
    }

    // Write prompt to shared .tasks/ volume
    // Hash-based naming: .prompt-{taskId}-{hash} for initial workers,
    // .prompt-{taskId}-{hash}-fix for fix/retry workers (isPriorityFix flag)
    const promptId = randomBytes(8).toString('hex');
    const fixSuffix = opts?.isPriorityFix ? '-fix' : '';
    const promptFileName = `.prompt-${taskId}-${promptId}${fixSuffix}.txt`;
    const promptHostPath = join(tasksDir, promptFileName);
    writeFileSync(promptHostPath, prompt, 'utf-8');

    // Build the in-container worker command from the provider's declarative
    // ProviderCommandSpec (PSL-1, Sprint 252) — NO claude-hardcode. The spec is
    // the single, centrally-maintained per-provider command definition; this
    // replaces the old block that emitted claude-CLI syntax (`-p -`,
    // `--dangerously-skip-permissions`) for EVERY provider (Sprint 249 root
    // cause: codex/gemini binaries rejected the claude-only flags).
    const containerPromptPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/${promptFileName}`;
    const spec = getProviderCommandSpec(provider);
    if (!spec) {
      // Host-only / unknown provider (e.g. ollama) reached the docker backend.
      // MF-2 routes host-adapter providers away before here; if one slips
      // through with no container command spec, honest-fail instead of degrading
      // to the claude CLI (which produced misleading results in Sprint 249).
      const reason =
        `Docker backend has no ProviderCommandSpec for provider "${provider}" (task ${taskId}). `
        + `Host-only providers (e.g. ollama) must run via their host adapter (isAdapterProvider). `
        + `Refusing to spawn a degraded worker.`;
      const honestFail = {
        taskId,
        workerId: `docker-honestfail-${taskId}`,
        filesChanged: [] as string[],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: false,
        selfAssessment: 'NO_GO',
        notes: reason,
        tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider, model },
      };
      try {
        writeFileSync(join(tasksDir, `task-${taskId}.result`), JSON.stringify(honestFail, null, 2), 'utf-8');
      } catch (e) { debugLog('docker-backend:no-spec-honestfail', e); }
      console.warn(`[deckent:spawn-backend-docker] ${reason}`);
      return;
    }
    const providerBinary = spec.binary;

    // F1-IMG-SPAWN (364-004 DOCKER-PROVIDER-CLI): image-reality gate — opt-in
    // (see probeProviderCliPresentInImage doc comment for why this cannot be
    // default-on yet). claude is always baked in (no build-arg) so it is never
    // probed. codex/gemini absent from the image → honest-fail BEFORE any
    // `docker run -d` for the actual worker, never a silent claude fallback
    // (Yasa #2). Suggests both the exact rebuild command (workerImageBuildCmdForProvider)
    // and the subprocess backend as an alternative — 364-002 (SUBPROC-PROVIDER-CLI)
    // fixed that backend to resolve the correct CLI per provider, so it is now a
    // genuinely correct fallback route for codex/gemini, not a degraded one.
    if (
      this.verifyProviderCliInImage
      && providerBinary !== 'claude'
      && !probeProviderCliPresentInImage(this.image, providerBinary)
    ) {
      throw new SpawnBackendError(
        `${DOCKER_ERROR_CODES.IMAGE_CLI_MISSING}: Docker image '${this.image}' does not have the '${providerBinary}' CLI `
        + `installed for provider '${provider}' (task ${taskId}) — the image EXISTS but was built without it. `
        + `This is a CLI-MISSING failure, distinct from a missing image or an unreachable daemon. `
        + `Rebuild with: ${workerImageBuildCmdForProvider(this.image, provider)} `
        + `— or route this task to the subprocess backend instead by adding `
        + `\`- Backend: subprocess\` to its directive.`,
        'docker',
      );
    }

    // Sprint 194 W-AUTH A-1 (host-side wire — A23): before spawning a claude
    // container we run the auth health-check on the HOST. The container executes
    // the raw `claude` CLI (no Deckent JS worker process), so the documented
    // CLAUDE_AUTH_REQUIRED check could never fire container-side — authHealthCheck
    // was a zero-caller dead mechanism, and a worker losing Claude auth produced a
    // silent exit-0 with no `.result` (the exact bug it was built to prevent). The
    // container mounts the host ~/.claude credentials, so the host's `claude
    // --version` is representative. On failure authHealthCheck writes an honest
    // AUTH_FAILED NO_GO `.result` (+ emits WORKER→BRAIN:AUTH_FAILED); we then skip
    // the doomed container spawn — Brain collects the real NO_GO instead of timing
    // out on a phantom worker. DECKENT_AUTH_SKIP=1 bypasses the check (test/local).
    if (providerBinary === 'claude') {
      const auth = authHealthCheck(dir, taskId, undefined, { ...process.env, CLAUDE_AUTH_REQUIRED: '1' });
      if (!auth.ok) {
        console.warn(
          `[deckent:spawn-backend-docker] claude auth health-check failed for task ${taskId} `
          + `— wrote AUTH_FAILED NO_GO, skipping container spawn`,
        );
        return;
      }
    }

    // Sprint 237/252: wire model name (apiId, e.g. claude-opus-4-8, gpt-5.5), not alias.
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    // born-637 (TRACE-CONTENT-PARITY docker-parity): claude-only, docker-local
    // stream-json override — see claudeStreamJsonBaseArgs for why this is safe
    // (token-usage capture unaffected) and why it does NOT touch the shared
    // spec (tmux.ts's claude command is untouched). codex/gemini keep spec as-is
    // (their docker-parity is a tracked follow-up, not silently changed here).
    const dockerSpec: ProviderCommandSpec = providerBinary === 'claude'
      ? { ...spec, baseArgs: claudeStreamJsonBaseArgs(spec.baseArgs) }
      : spec;
    // IMMUTABLE — deckent workers run with full autonomy (autoApprove). The spec
    // maps that to the correct per-provider flag (claude --dangerously-skip-
    // permissions, codex --dangerously-bypass-approvals-and-sandbox, gemini yolo).
    const workerCmd = buildProviderCommand(dockerSpec, apiId, containerPromptPath, {
      // born-471 (ALLOWLIST-SSOT): re-derived from the task's own on-disk
      // scope, not trusted verbatim from opts.allowedTools — see the
      // ALLOWLIST-SSOT block comment above resolveAllowedTools.
      allowedTools: this.resolveAllowedTools(dir, taskId, opts?.allowedTools),
      autoApprove: true,
      // F1-RE (Sprint 252): resolved model reasoning-effort (claude --effort,
      // codex -c model_reasoning_effort); undefined → no flag (CLI default).
      reasoningEffort: opts?.reasoningEffort,
      // F3.1: prefix-stable system prompt inside the container (per-machine sections
      // → first user message). Only the claude spec emits the flag; others ignore it.
      excludeDynamicPromptSections: opts?.excludeDynamicPromptSections,
    });
    // WORKER-GIT-GUARD (381-001): shadow `git` inside the container with a
    // denylist shim (stash/reset/checkout/clean/rebase/commit/revert -> exit
    // 97). Host-writes the shim then bind-mounts it READ-ONLY (same
    // technique as the .deck shadow-mount below) so a worker cannot
    // delete/edit it to bypass the guard. See git-worker-guard.ts's
    // CONTAINER_GIT_PATH doc comment for why the real-git path is a hardcoded
    // constant rather than probed per-spawn.
    //
    // The mount-args/PATH-export are pure string computations, resolved here;
    // the actual shim FILE is written further below, right after the real
    // worker script (scriptHostPath) is written. Both scripts start with the
    // literal `#!/bin/sh` line, and this repo's test suite is already
    // grandfathered on finding the worker script via a
    // `startsWith('#!/bin/sh')` scan of every writeFileSync call — writing
    // the shim first would make it the (wrong) first match. `docker run`
    // itself happens well after both writes, so the container never sees an
    // unfinished mount either way.
    const gitGuardHostDir = buildGitGuardDir(taskId);
    const gitGuard = buildDockerGitGuardArgs(gitGuardHostDir, CONTAINER_WORKSPACE);

    const resultPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.result`;
    const timeoutPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.timeout`;
    // Build docker run args
    // Run as host user to avoid root — Claude CLI blocks --dangerously-skip-permissions as root
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const home = homedir();

    // Container HOME: use /tmp/deckent-home to avoid missing host HOME directory
    // Host HOME (e.g. /home/alperen) doesn't exist in container filesystem.
    // Claude CLI needs a writable HOME for config + cache.
    const containerHome = '/tmp/deckent-home';

    // Per-task auth mode override (Sprint 193+). Subscription workers receive
    // only credential files; global provider homes/settings/MCP/skills never
    // enter the container.
    const taskAuthMode = this.readTaskAuthMode(dir, taskId);
    const useApiOnly = taskAuthMode === 'api';
    // OPENROUTER-PROVIDER (row 477): `BASE_PROVIDER_CREDENTIAL_ENV` intentionally
    // does NOT cover every ProviderName — it is the ADR-076 cross-leak/scrub map of
    // providers whose credential travels through `process.env`. `ollama` (local, no
    // key) and `openrouter` are both absent BY DESIGN: OpenRouter's key is read from
    // `.deck` host-side and injected only into its own spawned child's env, never
    // into this process's `process.env` (`applyDeckSecretsToEnv` has no OpenRouter
    // branch), so there is nothing here to leak or scrub. Adding an entry to satisfy
    // the compiler would encode a credential path that does not exist. The lookup is
    // typed as possibly-absent instead; the `!providerCredentialEnv` guard below
    // already handles that case and is the pre-existing behavior for `ollama`.
    const providerCredentialEnv: string | undefined =
      (BASE_PROVIDER_CREDENTIAL_ENV as Record<string, string | undefined>)[provider];
    if (useApiOnly && (!providerCredentialEnv || !process.env[providerCredentialEnv])) {
      throw new SpawnBackendError(
        `Task ${taskId} declares "Auth: api" but ${providerCredentialEnv ?? 'the provider credential env'} ` +
        `for ${providerBinary} is not set. ` +
        `Either set the env var or change the task to "Auth: subscription".`,
        'docker',
      );
    }
    const providerAuth = buildProviderAuthIsolation(
      home,
      providerBinary,
      // `ProviderCommandSpec.oauthHomeDir` is `string | null` (null = provider has
      // no host OAuth home to isolate — true for key-only providers); the helper
      // takes `string | undefined`. Both spell "nothing to mount", so normalize.
      // Surfaced by the row-477 ProviderName widening, but pre-existing.
      spec.oauthHomeDir ?? undefined,
      useApiOnly,
    );
    if (!useApiOnly && spec.oauthHomeDir && providerAuth.missingRequiredFiles.length > 0) {
      throw new SpawnBackendError(
        `Required isolated ${providerBinary} credential file(s) are unavailable for task ${taskId}: ` +
        `${providerAuth.missingRequiredFiles.join(', ')}. ` +
        `refusing to mount the full host provider home.`,
        'docker',
      );
    }
    if (!useApiOnly && providerBinary === 'gemini') {
      const geminiAuthSelection = buildGeminiAuthSelectionBootstrap(home);
      if (!geminiAuthSelection) {
        throw new SpawnBackendError(
          `Gemini subscription auth selection is unavailable for task ${taskId}; ` +
          `refusing to mount the full host provider settings.`,
          'docker',
        );
      }
      providerAuth.bootstrapLines.push(...geminiAuthSelection.bootstrapLines);
    }

    // Write worker script to .tasks/ — avoids shell quoting issues with allowedTools parentheses
    const scriptFileName = `.worker-${taskId}.sh`;
    const scriptHostPath = join(tasksDir, scriptFileName);
    const hbContainerPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.hb`;
    // Sprint 139: fsync_file helper ensures data hits disk before SIGKILL arrives.
    // Uses dd + sync as POSIX-portable fsync (no Python/perl dependency in Alpine).
    // Sprint 145: TIMEOUT_WITH_WORK EXIT trap function — detects partial work via git diff
    // When worker is killed (non-zero exit) but has modified files, writes TIMEOUT_WITH_WORK
    // result instead of blind NO_GO. Brain can then reconcile via Spurious NO_GO helper.
    // Sprint 272 T-003: EXIT-trap extracted to buildOnExitTrap() — adds a
    // last-chance flush window + enriched EXIT_WITHOUT_RESULT marker (workPresent +
    // diffStat + last hb) for clean exit-0 without .result, while preserving the
    // TIMEOUT_WITH_WORK path. See buildOnExitTrap above.
    // born-667b (RECON-DIFF, task 427-024): narrow the container's git-diff
    // work-present signal to THIS task's own scope.filesWrite — see
    // buildOnExitTrap's doc comment for why an unfiltered diff false-positives
    // on concurrent sibling workers (TT550 phantom-vakası).
    const scopeFilesWrite = this.readTaskFilesWrite(dir, taskId);
    const onExitFn = buildOnExitTrap(taskId, model, scopeFilesWrite);

    // 455-003 (TIMEOUT-BASELINE-TRUTH): the container path of the task-start
    // content baseline manifest (written host-side below, before `docker run`).
    // buildOnExitTrap reads $BASEFILE to subtract pre-existing / sibling dirt from
    // the TIMEOUT_WITH_WORK / workPresent signal.
    const baselineContainerPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.scope-baseline`;

    // Sprint 151: .partial-result path — intermediate checkpoint for OOM kill recovery
    const partialResultPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.partial-result`;
    const scriptContent = [
      '#!/bin/sh',
      // WORKER-GIT-GUARD (381-001): shadow real git for the whole script,
      // including whatever the worker CLI's own tool-calls spawn.
      gitGuard.exportPathLine,
      `RFILE="${resultPath}"`,
      `HBFILE="${hbContainerPath}"`,
      `PRFILE="${partialResultPath}"`,
      `BASEFILE="${baselineContainerPath}"`,
      // POSIX-portable fsync: copy file to itself via dd conv=fsync
      // This forces OS buffer cache → disk. Survives SIGKILL after return.
      'fsync_file() { [ -f "$1" ] && dd if="$1" of="$1.fsync" bs=4096 conv=fsync 2>/dev/null && mv "$1.fsync" "$1" 2>/dev/null; }',
      // Sprint 145: git-diff-aware EXIT trap function
      onExitFn,
      // Ensure session-env exists (Claude CLI requires it)
      `mkdir -p "${containerHome}/.claude" 2>/dev/null || true`,
      `touch "${containerHome}/.claude/session-env" 2>/dev/null || true`,
      ...providerAuth.bootstrapLines,
      // Sprint 151: Write .partial-result BEFORE Claude CLI starts — OOM kill safety net.
      // If container is SIGKILL'd (OOM), this file survives on the shared volume.
      // Host-side monitorContainer promotes it to .result with NO_GO_PARTIAL assessment.
      `cat > "$PRFILE" <<PARTIALEOF`,
      `{"taskId":"${taskId}","selfAssessment":"NO_GO","notes":"Worker started but did not complete — partial-result written at startup. If you see this, the container was likely OOM-killed or force-stopped before the worker CLI could write a .result.","partialMarker":true,"tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"${provider}","model":"${model}"}}`,
      'PARTIALEOF',
      'fsync_file "$PRFILE"',
      // EXIT trap: Sprint 145 — calls on_exit() which detects partial work via git diff
      'trap on_exit EXIT',
      // SIGTERM trap: on graceful stop, fsync .result immediately (before grace
      // period expires). born-466: exit 143 (128+TERM), NOT 0 — exiting 0 made
      // on_exit classify a docker-stop as a clean run (TIMEOUT_WITH_WORK dead).
      `trap 'fsync_file "$RFILE"; fsync_file "$HBFILE"; exit 143' TERM`,
      // born-468: heartbeat update loop (every 15s) — staleness-gated so it
      // never clobbers a richer heartbeat the worker itself just wrote; the
      // fallback write itself is atomic (tmp+mv). See buildHeartbeatWrapperLoop.
      buildHeartbeatWrapperLoop(taskId),
      'HB_PID=$!',
      `TIMEOUT=\${TASK_TIMEOUT:-${effectiveTimeout}}`,
      // PSL-1 (Sprint 252): feed the prompt per the spec's promptFeed — 'stdin'
      // providers (claude `-p -`, codex `exec`) read the prompt FILE via `< …`;
      // 'inline' providers (gemini `-p "$(cat …)"`) already embed it in workerCmd.
      // born-466: -k 30 hard-KILLs a TERM-swallowing worker; the exit code is
      // captured in CLAUDE_EXIT (read by on_exit) instead of being masked by
      // `|| echo` + the trailing rm. The .timeout marker is timeout-PURE now:
      // only 124 (TERM-timeout) / 137 (KILL) qualify — a crash/CLI-arg error is
      // NOT a timeout — and never when a real .result already exists.
      `timeout -k 30 $TIMEOUT ${workerCmd}${spec.promptFeed === 'stdin' ? ` < "${containerPromptPath}"` : ''}`,
      'CLAUDE_EXIT=$?',
      `if [ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 137 ]; then [ ! -f "$RFILE" ] && echo "WORKER_TIMEOUT" > "${timeoutPath}"; fi`,
      // Sprint 151: Clean up .partial-result on normal exit — on_exit/EXIT trap handles abnormal exit
      'rm -f "$PRFILE" 2>/dev/null',
    ].join('\n');
    writeFileSync(scriptHostPath, scriptContent, { mode: 0o755 });

    // WORKER-GIT-GUARD (381-001): materialize the shim now (see the
    // gitGuardHostDir/gitGuard comment above for why this write is deferred
    // to after the real worker script). `docker run` — the earliest point the
    // container could actually read the bind-mounted shim — still happens
    // well after this synchronous call returns.
    installGitGuard(gitGuardHostDir, CONTAINER_GIT_PATH);

    const containerCmd = `sh ${CONTAINER_WORKSPACE}/${TASKS_DIR}/${scriptFileName}`;

    const containerName = `${CONTAINER_PREFIX}${taskId}`;

    // F1-LIM faz-2a (Sprint 272): kind-based memory limit — opt-in override.
    // Falls back to constructor memoryLimit/memorySwap when kind not configured.
    const kindLimits = this.resolveKindMemoryLimits(dir, taskId);
    const effectiveMemory = kindLimits?.memory ?? this.memoryLimit;
    const effectiveSwap = kindLimits?.swap ?? this.memorySwap;
    // DECK-WORKER-ISOLATION (ADR-G-005): hide the project's `.deck` secret file
    // from the worker. The project root is bind-mounted read-write at /workspace,
    // so `.deck` would otherwise be worker-readable. Overlay an empty read-only
    // file at /workspace/.deck — ONLY when a real `.deck` exists (shadowing a
    // missing file would materialize a phantom host `.deck` via the nested bind
    // mount; see buildDeckShadowMountArgs). The shadow source is a regular 0-byte
    // file so docker cannot create a `.deck` directory on the target.
    const deckExists = existsSync(join(dir, DECK_FILE_NAME));
    const deckShadowHostPath = deckExists
      ? ensureDeckShadowFile(tasksDir)
      : join(tasksDir, '.deck-shadow');
    const deckShadowMountArgs = buildDeckShadowMountArgs(deckExists, deckShadowHostPath);

    // born-644 (428-012 BUILD-VIOLATION-GUARD, B542): read-only dist/ overlay — see
    // buildDistReadOnlyMountArgs doc comment. Mechanical enforcement of the
    // WORKER-GUIDE.md "no build in worker" rule, complementing (not replacing) the
    // post-exit dist-mtime sentinel (distFingerprintBefore/After below).
    const distHostPath = join(dir, 'dist');
    const distReadOnlyMountArgs = buildDistReadOnlyMountArgs(existsSync(distHostPath), distHostPath);

    const dockerArgs: string[] = [
      'run', '-d',
      '--name', containerName,
      // Run as host user (non-root) — required for --dangerously-skip-permissions
      '--user', `${uid}:${gid}`,
      // HOME must point to a directory that EXISTS in the container
      '-e', `HOME=${containerHome}`,
      // Memory limits — Claude CLI peak ~4-6GB (Sprint 166 Bug G OOM forensic), 8g + 12g headroom
      // F1-LIM faz-2a: kind-based override when worker_memory_limit_by_kind configured
      '--memory', effectiveMemory,
      '--memory-swap', effectiveSwap,
      // Writable HOME via tmpfs — Claude CLI needs to write config/cache here
      '--tmpfs', `${containerHome}:size=100m,uid=${uid},gid=${gid}`,
      // Project mounted read-write — workers need to create/edit files in scope
      '-v', `${dir}:${CONTAINER_WORKSPACE}`,
      // born-644 (428-012 BUILD-VIOLATION-GUARD, B542): read-only dist/ overlay —
      // mechanical "no build in worker" enforcement (nested mount, shadows only
      // /workspace/dist as read-only; see buildDistReadOnlyMountArgs).
      ...distReadOnlyMountArgs,
      // DECK-WORKER-ISOLATION (ADR-G-005): read-only empty overlay hiding .deck
      // (nested mount, applied after the project root so it shadows /workspace/.deck)
      ...deckShadowMountArgs,
      // WORKER-GIT-GUARD (381-001): read-only git-shim overlay (see above).
      ...gitGuard.mountArgs,
      // .tasks/ mounted read-write (results, heartbeats, prompts)
      '-v', `${tasksDir}:${CONTAINER_WORKSPACE}/${TASKS_DIR}`,
      // .locks/ mounted read-write (file locking)
      '-v', `${join(dir, '.locks')}:${CONTAINER_WORKSPACE}/.locks`,
      // Auth-only isolation: never mount the complete host provider home. The
      // worker script copies read-only credential mounts into its private tmpfs
      // HOME before invoking the provider CLI.
      ...providerAuth.mountArgs,
      // Working directory
      '-w', CONTAINER_WORKSPACE,
    ];

    // Pass Deckent worker context env vars (for SIGTERM handler in worker.ts)
    dockerArgs.push('-e', `DECKENT_TASK_ID=${taskId}`);
    dockerArgs.push('-e', `DECKENT_PROJECT_ROOT=${CONTAINER_WORKSPACE}`);
    // Adaptive timeout: pass computed timeout to container as env var
    dockerArgs.push('-e', `TASK_TIMEOUT=${effectiveTimeout}`);
    // Sprint 156 T-006: stable per-spawn idempotency key — promptId is already a fresh
    // 16-hex-char random token unique to this worker invocation. Workers should use this
    // value as the `Idempotency-Key` header for any external API call so retries are safe.
    dockerArgs.push('-e', `IDEMPOTENCY_KEY=${promptId}`);
    // Surface effective auth mode to the container (used by worker prompt for
    // model self-awareness; not required by Claude CLI itself).
    dockerArgs.push('-e', `DECKENT_AUTH_MODE=${useApiOnly ? 'api' : 'subscription'}`);
    // Sprint 194 W-AUTH A-1: surface the auth-required state to the container
    // (used by the worker prompt / DECKENT_AUTH_MODE self-awareness). The ACTUAL
    // auth health-check now runs HOST-side, pre-spawn (see A23 wire above) —
    // because the container executes the raw claude CLI with no Deckent JS worker
    // to read this flag, the original container-side check could never fire. This
    // env var is kept for parity/observability and the WM-5 provider-gate contract.
    // WM-5: gate to claude-only — codex/gemini/ollama must not receive this flag.
    if (providerBinary === 'claude') {
      dockerArgs.push('-e', 'CLAUDE_AUTH_REQUIRED=1');
    }
    // Sprint 194 T-004 (W-M M-2): bind V8 heap to the container memory cap.
    // Explicit -e overrides any leaked process.env.NODE_OPTIONS — workers must
    // get the deterministic Deckent value, not whatever the host shell carries.
    dockerArgs.push('-e', WORKER_NODE_OPTIONS);

    // Sprint 214 T-214-001 + F1-014r (Sprint 331) — provider + auth-aware env
    // forwarding with a RUNTIME per-worker NON-LEAK invariant: each container
    // receives ONLY its own provider's credential env var, never a foreign one
    // (canonical provider→key map mirrors provider.ts applyDeckSecretsToEnv:
    // claude→ANTHROPIC_API_KEY, codex→OPENAI_API_KEY, gemini→GOOGLE_API_KEY).
    //
    // - claude: ANTHROPIC_API_KEY MUST NOT leak in subscription mode — the claude
    //   CLI prefers the env var over the mounted ~/.claude session, so forwarding
    //   the host key silently demotes `auth_mode: subscription` into API mode →
    //   Tier-1 timeout → the exact mass-synthetic-NO_GO that killed Sprint 213
    //   (ADR-076). Forward it ONLY in api mode (useApiOnly; the throw above already
    //   requires the key to be present for that branch).
    // - codex API mode → OPENAI_API_KEY only; gemini API mode → GOOGLE_API_KEY
    //   only. Subscription mode uses the isolated OAuth credential files above
    //   and MUST NOT inherit an API key that changes billing/auth precedence.
    //   The previous
    //   blanket `providerBinary !== 'claude'` guard forwarded BOTH OPENAI and
    //   GOOGLE to ANY non-claude worker, so a codex worker leaked GOOGLE_API_KEY
    //   and a gemini worker leaked OPENAI_API_KEY whenever a dev had several
    //   provider keys in the host env (mixed-provider sprint). Gating each key to
    //   its own provider makes the cross-leak structurally impossible (F1-014r).
    // - ollama is host-only: getProviderCommandSpec returns null and the spawn
    //   honest-fails above before reaching here, so it never receives any key.
    // This is an explicit per-provider allowlist by design — a new provider must
    // add its own credential forward here (auditable), never inherit one.
    // DECKENT_DEBUG is auth-orthogonal and always forwarded when set on the host.
    //
    // F1-014 phase-2: the credential env var NAME for each provider is sourced from
    // the shared BASE_PROVIDER_CREDENTIAL_ENV map (providers/cross-provider-keys.ts)
    // — the SAME single source of truth the subprocess backend's scrub set derives
    // from, so the two allowlists can never drift. Behaviour is byte-for-byte the
    // prior explicit literals while applying the auth-mode gate uniformly:
    // claude/codex/gemini forward their own credential env ONLY in api mode.
    const claudeKeyEnv = BASE_PROVIDER_CREDENTIAL_ENV.claude;
    const codexKeyEnv = BASE_PROVIDER_CREDENTIAL_ENV.codex;
    const geminiKeyEnv = BASE_PROVIDER_CREDENTIAL_ENV.gemini;
    if (providerBinary === 'claude') {
      if (useApiOnly && process.env[claudeKeyEnv]) {
        dockerArgs.push('-e', `${claudeKeyEnv}=${process.env[claudeKeyEnv]}`);
      }
    } else if (providerBinary === 'codex' && useApiOnly && process.env[codexKeyEnv]) {
      dockerArgs.push('-e', `${codexKeyEnv}=${process.env[codexKeyEnv]}`);
    } else if (providerBinary === 'gemini' && useApiOnly && process.env[geminiKeyEnv]) {
      dockerArgs.push('-e', `${geminiKeyEnv}=${process.env[geminiKeyEnv]}`);
    }
    if (process.env.DECKENT_DEBUG) {
      dockerArgs.push('-e', `DECKENT_DEBUG=${process.env.DECKENT_DEBUG}`);
    }

    // Container image and command
    dockerArgs.push(this.image, 'sh', '-c', containerCmd);

    debugLog('docker-backend:spawn', `taskId=${taskId} container=${containerName} model=${model}`);

    // born-644 (BUILD-VIOLATION-GUARD): snapshot dist/ BEFORE the container starts — see the
    // dist-mtime sentinel block comment above computeDistFingerprint for why this is the
    // right moment (this is the last host-side checkpoint before the container gains write
    // access to the mounted project root).
    const distFingerprintBefore = computeDistFingerprint(join(dir, 'dist'));

    // 455-003 (TIMEOUT-BASELINE-TRUTH): capture the task-start CONTENT baseline of
    // this task's scoped files — SAME host-side checkpoint as the dist snapshot,
    // the last moment before the container can write to the shared bind-mount. The
    // in-container EXIT-trap reads it via $BASEFILE to subtract pre-existing /
    // sibling dirt from the TIMEOUT_WITH_WORK / workPresent signal. Fail-soft: a
    // write error only loses the baseline (trap degrades to its unfiltered legacy
    // behavior), never blocks the spawn.
    try {
      const baselineManifest = computeScopeBaselineManifest(dir, scopeFilesWrite);
      writeFileSync(join(tasksDir, `task-${taskId}.scope-baseline`), baselineManifest, 'utf-8');
    } catch (e) {
      debugLog('docker-backend:scope-baseline-write', e);
    }

    // Sprint 163 T-002: retry spawn with health check.
    // Each attempt: docker run + 3s wait + docker inspect. If inspect reports
    // Running=true OR Running=false+ExitCode=0 (instant-exit success), proceed.
    // Otherwise, classify stderr and retry up to MAX_SPAWN_ATTEMPTS.
    const spawnOutcome = this.runDockerWithRetry(taskId, containerName, dockerArgs);

    if (!spawnOutcome.ok) {
      debugLog('docker-backend:spawn-error', `taskId=${taskId} ${spawnOutcome.error.message}`);
      // Write .timeout marker with the stable error code so result-collector and
      // downstream tools can act on the failure category, not the bare string.
      // Marker payload is 'container_start_failed' base + ":<code>:<message>" suffix
      // so legacy substring grep ('container_start_failed') still matches.
      const baseMarker = 'container_start_failed';
      writeFileSync(
        join(tasksDir, `task-${taskId}.timeout`),
        `${baseMarker}:${spawnOutcome.error.code}:${spawnOutcome.error.message}`,
        'utf-8',
      );
      // Sprint 156 Task 10 (fix): release spawn locks so a retry / fix-worker
      // for this scope is not permanently blocked by a transient docker error.
      try { releaseAllSpawnLocks(dir, taskId); } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }
      // Sprint 170 P0-5: spawn failed — clear pending so Set doesn't leak
      clearPending(taskId);
      return;
    }

    const { containerId, instantExitSuccess } = spawnOutcome;
    this.containers.set(taskId, { containerId, model });
    debugLog(
      'docker-backend:spawn-ok',
      `taskId=${taskId} containerId=${containerId.slice(0, 12)} instantExit=${instantExitSuccess}`,
    );

    // Write initial heartbeat.
    // TT553 (task 418-002): `livenessSource:'host'` is an ADDITIVE marker — this
    // worker's liveness is decided by the HOST (`docker wait`/`docker inspect`
    // container-state, see monitorContainer + heartbeat-monitor.ts's `container-state`
    // signal), NOT by this `.hb`'s freshness. The `.hb` remains a currentAction
    // carrier only; a stale/hardcoded timestamp here can never justify a kill.
    // Backward-compatible: legacy readers ignore the extra key.
    const hbPath = join(tasksDir, `task-${taskId}.hb`);
    writeFileSync(hbPath, JSON.stringify({
      workerId: `docker-${taskId}`,
      taskId,
      status: 'EXECUTING',
      sequence: 1,
      timestamp: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      backend: 'docker',
      containerId: containerId.slice(0, 12),
      livenessSource: 'host',
    }, null, 2), 'utf-8');

    // Sprint 170 P0-5: .hb is now on disk — heartbeat is authoritative, race window closed
    markActive(taskId);

    // SURF-3 S3 — live tool-by-tool activity context (flag-gated; a no-op when
    // live_trace is off). Coordinator-process config is the source of truth
    // (opts.liveTraceEnabled), NOT the worker's disk-cache.
    const liveCtx: ActivityTapContext = {
      projectRoot: dir,
      taskId,
      workerId: `docker-${taskId}`,
      enabled: opts?.liveTraceEnabled === true,
      ...(opts?.sprintId ? { sprintId: opts.sprintId } : {}),
    };

    // Set up container monitoring (async, fire-and-forget)
    this.monitorContainer(
      taskId,
      containerName,
      tasksDir,
      model,
      dir,
      distFingerprintBefore,
      liveCtx,
      opts?.executionBudget,
    );
  }

  /**
   * Sprint 163 T-002: attempt `docker run` up to MAX_SPAWN_ATTEMPTS times,
   * verifying container health after each attempt via `docker inspect`.
   *
   * Returns:
   * - `{ ok: true, containerId, instantExitSuccess: false }` — container is running
   * - `{ ok: true, containerId, instantExitSuccess: true }` — container started and gracefully exited (ExitCode 0)
   * - `{ ok: false, error }` — all attempts failed, error classified into a stable code
   *
   * Between attempts the previous container is force-removed so the name slot
   * is free for the next try.
   */
  private runDockerWithRetry(
    taskId: string,
    containerName: string,
    dockerArgs: string[],
  ): { ok: true; containerId: string; instantExitSuccess: boolean }
    | { ok: false; error: { code: DockerErrorCode; message: string; exitCode: number; stderr: string } } {
    let lastStderr = '';
    let lastExitCode = -1;

    for (let attempt = 1; attempt <= MAX_SPAWN_ATTEMPTS; attempt++) {
      debugLog('docker-backend:spawn-attempt', `taskId=${taskId} attempt=${attempt}/${MAX_SPAWN_ATTEMPTS}`);

      const result = spawnSync('docker', dockerArgs, {
        encoding: 'utf-8',
        timeout: 30_000, // 30s to start container
      });

      if (result.status !== 0) {
        // docker run itself failed (image missing, syntax error, daemon down, …)
        lastStderr = result.stderr ?? '';
        lastExitCode = result.status ?? -1;
        debugLog(
          'docker-backend:spawn-attempt-fail',
          `taskId=${taskId} attempt=${attempt} status=${result.status} stderr=${lastStderr.trim().slice(0, 200)}`,
        );
        // Force-remove the (probably non-existent) container in case it was
        // half-created, then retry.
        this.forceRemoveContainer(containerName);
        if (attempt < MAX_SPAWN_ATTEMPTS) {
          this.sleepSync(SPAWN_RETRY_DELAY_MS);
        }
        continue;
      }

      const containerId = result.stdout?.trim() ?? '';

      // docker run succeeded — now confirm the container is actually alive.
      const health = this.healthCheckContainer(containerName);
      if (health.healthy) {
        return { ok: true, containerId, instantExitSuccess: false };
      }
      if (health.instantExitSuccess) {
        // Container started and gracefully exited with code 0 — this is not a
        // failure. Workers that complete inside the health-check window are rare
        // but legitimate.
        return { ok: true, containerId, instantExitSuccess: true };
      }

      // Real container_start_failed: container died with a non-zero exit code.
      // Pull docker logs to capture stderr for classification before removing.
      const logResult = spawnSync('docker', ['logs', containerName], {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      lastStderr = `${logResult.stdout ?? ''}${logResult.stderr ?? ''}`;
      lastExitCode = health.exitCode;
      debugLog(
        'docker-backend:spawn-health-fail',
        `taskId=${taskId} attempt=${attempt} exitCode=${lastExitCode} stderr=${lastStderr.trim().slice(0, 200)}`,
      );
      this.forceRemoveContainer(containerName);
      if (attempt < MAX_SPAWN_ATTEMPTS) {
        this.sleepSync(SPAWN_RETRY_DELAY_MS);
      }
    }

    const classification = classifyDockerError(lastStderr, lastExitCode);
    return {
      ok: false,
      error: {
        code: classification.code,
        message: classification.message,
        exitCode: lastExitCode,
        stderr: lastStderr,
      },
    };
  }

  /**
   * Sprint 163 T-002: after `docker run -d` returns successfully, wait
   * HEALTH_CHECK_DELAY_MS then ask docker about the container's real state.
   *
   * - Running=true             → healthy (proceed)
   * - Running=false, exit=0    → graceful instant exit (proceed, no error)
   * - Running=false, exit>0    → real container_start_failed (retry candidate)
   * - inspect fails / malformed → fail-open: assume healthy. We have a clean
   *   `docker run` ack already; optimistically hand off to monitorContainer
   *   instead of burning a retry on inspect noise. Real failures still trip
   *   the `Running=false + ExitCode>0` branch because docker inspect emits
   *   exactly that format in real environments.
   */
  healthCheckContainer(containerName: string, delayMs: number = HEALTH_CHECK_DELAY_MS): HealthCheckResult {
    if (delayMs > 0) this.sleepSync(delayMs);

    const inspect = spawnSync(
      'docker',
      ['inspect', containerName, '--format', '{{.State.Running}}|{{.State.ExitCode}}'],
      { encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    if (inspect.status !== 0) {
      // inspect command itself failed — fail-open. `docker wait` in the
      // monitor will catch genuine container death.
      return { healthy: true, instantExitSuccess: false, exitCode: 0, raw: inspect.stderr ?? '' };
    }

    const parsed = parseInspectOutput(inspect.stdout ?? '');
    if (!parsed) {
      // Malformed inspect output — same reasoning, fail-open.
      return { healthy: true, instantExitSuccess: false, exitCode: 0, raw: inspect.stdout ?? '' };
    }

    if (parsed.running) {
      return { healthy: true, instantExitSuccess: false, exitCode: parsed.exitCode, raw: inspect.stdout ?? '' };
    }
    if (parsed.exitCode === 0) {
      return { healthy: false, instantExitSuccess: true, exitCode: 0, raw: inspect.stdout ?? '' };
    }
    return { healthy: false, instantExitSuccess: false, exitCode: parsed.exitCode, raw: inspect.stdout ?? '' };
  }

  /**
   * Sprint 163 T-002 helper: force-remove a container by name. Used between
   * retry attempts so the container-name slot is free for the next `docker run`.
   * Errors are swallowed — the next `docker run` will fail loudly if removal
   * really did not work, and we already log via debugLog.
   */
  private forceRemoveContainer(containerName: string): void {
    try {
      spawnSync('docker', ['rm', '-f', containerName], {
        encoding: 'utf-8',
        timeout: 5_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      debugLog('docker-backend:force-remove-error', e);
    }
  }

  /**
   * Blocking sleep using `spawnSync('sleep', …)` so the retry loop stays
   * synchronous (matches the rest of this file's spawn-time path).
   */
  private sleepSync(ms: number): void {
    if (ms <= 0) return;
    const seconds = (ms / 1000).toFixed(3);
    spawnSync('sleep', [seconds], { timeout: ms + 2_000 });
  }

  /**
   * Stop for a budget breach without removing the container or releasing locks.
   * `monitorContainer` exclusively owns final log capture, evidence settlement,
   * removal and lock release after `docker wait` observes the exit.
   */
  private stopContainerForBudget(taskId: string): void {
    const containerName = `${CONTAINER_PREFIX}${taskId}`;
    const grace = this.gracefulTimeoutSeconds;
    const stopped = spawnSync('docker', ['stop', `--time=${grace}`, containerName], {
      encoding: 'utf-8',
      timeout: (grace + 5) * 1000,
    });
    if (stopped.status !== 0) {
      spawnSync('docker', ['kill', '--signal=SIGTERM', containerName], {
        encoding: 'utf-8',
        timeout: 10_000,
      });
    }
  }

  /**
   * Gracefully stop a running worker container.
   *
   * Sprint 139 fix: increased grace period from 10s to 15s and added post-stop
   * result file verification. The sequence:
   * 1. `docker stop --time=15` sends SIGTERM → worker's trap runs fsync_file
   * 2. If .result exists after stop, verify it's readable (fsync confirmation)
   * 3. If .result missing + non-zero exit, write fallback NO_GO result
   * 4. Remove container
   *
   * This closes the 5-sprint exit-137 bug: even if SIGKILL fires after 15s,
   * the SIGTERM trap has already fsync'd .result to disk.
   */
  kill(taskId: string): void {
    const containerName = `${CONTAINER_PREFIX}${taskId}`;
    const grace = this.gracefulTimeoutSeconds;
    debugLog('docker-backend:kill', `taskId=${taskId} (graceful stop --time=${grace})`);

    try {
      // Graceful: SIGTERM + configurable grace period (Sprint 151: was hardcoded 15s, now configurable)
      const stopResult = spawnSync('docker', ['stop', `--time=${grace}`, containerName], {
        encoding: 'utf-8', timeout: (grace + 5) * 1000, // grace + 5s buffer to avoid race
      });
      if (stopResult.status !== 0) {
        // Fallback: send SIGTERM (not SIGKILL) so EXIT trap can still run
        // Sprint 149: changed from bare `docker kill` (SIGKILL) to --signal=SIGTERM
        debugLog('docker-backend:stop-failed', `Falling back to docker kill --signal=SIGTERM: ${stopResult.stderr?.trim()}`);
        spawnSync('docker', ['kill', '--signal=SIGTERM', containerName], { encoding: 'utf-8', timeout: 10_000 });
      }
    } catch (e) { debugLog('docker-backend:kill-error', e); }

    // Sprint 149: Poll for .result file after stop (max 5s, 500ms intervals)
    // Gives EXIT trap time to write result after SIGTERM
    const resultPath = join(this.projectDir, TASKS_DIR, `task-${taskId}.result`);
    if (!existsSync(resultPath)) {
      for (let i = 0; i < 10; i++) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
        if (existsSync(resultPath)) break;
      }
    }

    // Post-stop verification: ensure .result was persisted to disk
    this.verifyResultAfterStop(taskId);

    try {
      spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
    } catch (e) { debugLog('docker-backend:rm-error', e); }

    // Sprint 156 Task 10: forced shutdown — release any spawn locks left over
    try {
      const released = releaseAllSpawnLocks(this.projectDir, taskId);
      if (released > 0) debugLog('docker-backend:spawn-lock', `taskId=${taskId} released ${released} spawn lock(s) on kill`);
    } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }

    this.containers.delete(taskId);
  }

  /**
   * Verify .result file exists and is readable after container stop.
   * If the file exists, fsync it from host side as belt-and-suspenders.
   * If missing, log a warning (monitorContainer EXIT trap should have written fallback).
   */
  private verifyResultAfterStop(taskId: string): void {
    const resultPath = join(this.projectDir, TASKS_DIR, `task-${taskId}.result`);
    try {
      if (existsSync(resultPath)) {
        // Belt-and-suspenders: fsync from host side to ensure container writes are flushed
        const fd = openSync(resultPath, 'r');
        try { fsyncSync(fd); } finally { closeSync(fd); }
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result verified + fsynced`);
      } else {
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result MISSING after stop — EXIT trap should write fallback`);
      }
    } catch (e) {
      debugLog('docker-backend:post-stop-verify-error', `taskId=${taskId} ${e}`);
    }
  }

  /**
   * List currently active worker task IDs.
   */
  list(): string[] {
    return [...this.containers.keys()];
  }

  /**
   * Check if Docker is available.
   */
  async isAvailable(): Promise<boolean> {
    const result = spawnSync('docker', ['info'], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  }

  /**
   * Acquire spawn-time `.spawnlock` files for every entry in the task's
   * `scope.filesWrite`. Reads `<tasksDir>/task-<taskId>.json` to recover
   * the file list — if the JSON is missing or malformed, locking is
   * silently skipped (graceful degradation; we never block a spawn over
   * a parse failure). Throws `SpawnBackendError` on a real conflict so
   * the caller can surface the conflicting task id.
   */
  /**
   * F1-LIM faz-2a (Sprint 272): Resolve kind-based memory limits for a task.
   * Reads the task JSON to get the canonical TaskKind (`type` field), then
   * looks it up in `this.kindMemoryLimits`. Returns undefined when no kind
   * limit is configured for this task (caller falls back to constructor defaults).
   */
  private resolveKindMemoryLimits(projectDir: string, taskId: string): { memory: string; swap: string } | undefined {
    if (Object.keys(this.kindMemoryLimits).length === 0) return undefined;
    const taskKind = this.readTaskKind(projectDir, taskId);
    if (!taskKind) return undefined;
    const limitStr = this.kindMemoryLimits[taskKind];
    if (!limitStr) return undefined;
    const limitBytes = parseMemoryString(limitStr);
    if (limitBytes === null) return undefined; // already validated in constructor; guard for safety
    const swapStr = deriveSwapFromLimitBytes(limitBytes);
    return { memory: limitStr, swap: swapStr };
  }

  /**
   * Read the canonical TaskKind from `task-<taskId>.json` (`type` field).
   * Returns undefined when the file is missing, malformed, or type is unset.
   */
  private readTaskKind(projectDir: string, taskId: string): string | undefined {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return undefined;
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { type?: unknown };
      if (typeof parsed.type === 'string' && parsed.type.length > 0) {
        return parsed.type;
      }
    } catch (err) {
      debugLog('docker-backend:kind-limit', `taskId=${taskId} failed to read task kind: ${(err as Error).message}`);
    }
    return undefined;
  }

  /**
   * Read the per-task auth mode override from `task-<taskId>.json`.
   * Returns 'api' or 'subscription' when explicitly set on the task, or
   * undefined when missing/malformed (caller treats undefined as subscription
   * for backward compatibility).
   */
  private readTaskAuthMode(projectDir: string, taskId: string): 'subscription' | 'api' | undefined {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return undefined;
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { authMode?: unknown };
      if (parsed.authMode === 'api' || parsed.authMode === 'subscription') {
        return parsed.authMode;
      }
    } catch (err) {
      debugLog('docker-backend:auth-mode', `taskId=${taskId} failed to read authMode: ${(err as Error).message}`);
    }
    return undefined;
  }

  /**
   * born-667b (RECON-DIFF, task 427-024): read `scope.filesWrite` from
   * `task-<taskId>.json` for {@link buildOnExitTrap}'s scoped git-diff signal.
   * Returns `[]` (never throws/blocks a spawn) when the task JSON is missing,
   * unreadable, or malformed — mirrors {@link readTaskKind}/{@link readTaskAuthMode}'s
   * graceful-degradation contract. An empty return is itself meaningful here:
   * buildOnExitTrap treats "task JSON has no filesWrite entries" the same as
   * "task JSON unreadable" — both produce an honest empty-intersection signal
   * rather than silently reverting to the unscoped sprint-wide diff.
   */
  private readTaskFilesWrite(projectDir: string, taskId: string): string[] {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return [];
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { scope?: { filesWrite?: unknown } };
      const candidate = parsed.scope?.filesWrite;
      return Array.isArray(candidate) ? candidate.filter((f): f is string => typeof f === 'string' && f.length > 0) : [];
    } catch (err) {
      debugLog('docker-backend:diff-scope', `taskId=${taskId} failed to parse task JSON: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * born-471 (ALLOWLIST-SSOT): read `scope.directories` + `scope.filesWrite`
   * from `task-<taskId>.json` and derive the `--allowedTools` string via
   * {@link buildDockerAllowedTools}. Falls back to the caller-supplied value
   * when the task JSON is missing/malformed — never blocks a spawn over a
   * parse failure, mirroring {@link readTaskAuthMode}/{@link readTaskKind}.
   */
  private resolveAllowedTools(projectDir: string, taskId: string, fallback: string | undefined): string | undefined {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return fallback;
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { scope?: { directories?: unknown; filesWrite?: unknown } };
      const rawDirs = parsed.scope?.directories;
      const rawFiles = parsed.scope?.filesWrite;
      const directories = Array.isArray(rawDirs) ? rawDirs.filter((d): d is string => typeof d === 'string') : [];
      const filesWrite = Array.isArray(rawFiles) ? rawFiles.filter((f): f is string => typeof f === 'string') : [];
      return buildDockerAllowedTools({ directories, filesWrite });
    } catch (err) {
      debugLog('docker-backend:allowed-tools', `taskId=${taskId} failed to parse task JSON: ${(err as Error).message}`);
      return fallback;
    }
  }

  private acquireSpawnTimeLocks(projectDir: string, taskId: string): void {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) {
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} no task JSON found at ${taskJsonPath} — skipping spawn locks`);
      return;
    }

    let filesWrite: string[] = [];
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { scope?: { filesWrite?: unknown } };
      const candidate = parsed.scope?.filesWrite;
      if (Array.isArray(candidate)) {
        filesWrite = candidate.filter((f): f is string => typeof f === 'string' && f.length > 0);
      }
    } catch (err) {
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} failed to parse task JSON: ${(err as Error).message}`);
      return;
    }

    if (filesWrite.length === 0) return;

    try {
      acquireSpawnLocks(projectDir, taskId, filesWrite);
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} acquired ${filesWrite.length} spawn lock(s)`);
    } catch (err) {
      if (err instanceof SpawnLockError) {
        throw new SpawnBackendError(
          `Spawn lock conflict on ${err.filePath}: file is currently held by task ${err.conflictingTaskId}`,
          'docker',
        );
      }
      throw err;
    }
  }

  /**
   * Monitor container until it exits, then update heartbeat and cleanup.
   *
   * `projectDir` + `distFingerprintBefore` (born-644 BUILD-VIOLATION-GUARD): the pre-spawn
   * dist/ snapshot from runSpawn, carried through so the exit handler can compare against the
   * post-exit state — see the dist-mtime sentinel block comment above computeDistFingerprint.
   */
  private monitorContainer(
    taskId: string,
    containerName: string,
    tasksDir: string,
    model: string,
    projectDir: string,
    distFingerprintBefore: DistFingerprint | null,
    liveCtx?: ActivityTapContext,
    executionBudget?: import('../core/work-model.js').ExecutionBudget,
  ): void {
    const child = nodeSpawn('docker', ['wait', containerName], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // SURF-3 S3 — start the live activity follow WHILE the container runs
    // (a no-op when live_trace is off); stop it once the container exits below.
    const budgetMonitor = createRuntimeBudgetMonitor({
      projectRoot: projectDir,
      taskId,
      backend: this.name,
      budget: executionBudget,
      onStop: () => {
        queueMicrotask(() => {
          try { this.stopContainerForBudget(taskId); } catch (e) { debugLog('docker-backend:budget-stop', e); }
        });
      },
    });
    const stopFollow = liveCtx
      ? followContainerActivity(
          containerName,
          getProviderBinaryForModel(model),
          liveCtx,
          nodeSpawn,
          budgetMonitor ? event => budgetMonitor.observe(event) : undefined,
        )
      : (): void => { /* no ctx — no follow */ };

    child.stdout?.on('data', async (data: Buffer) => {
      const exitCode = parseInt(data.toString().trim(), 10);
      debugLog('docker-backend:exit', `taskId=${taskId} exitCode=${exitCode}`);
      stopFollow(); // container exited — the `docker logs -f` follow can end.

      // Sprint 139: fsync .result from host side before reading
      // Container's fsync_file trap may have run, but belt-and-suspenders from host
      const resultPath = join(tasksDir, `task-${taskId}.result`);
      try {
        if (existsSync(resultPath)) {
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
        }
      } catch { /* fsync best-effort — continue with reconciliation */ }

      // Determine heartbeat status: check .result file for reconciliation
      // If .result exists with DONE/GO_WITH_TECH_DEBT, treat as DONE regardless of exitCode
      // This prevents false "FAILED exitCode 137" alerts when container was SIGKILL'd
      // after worker already wrote a successful result
      let hbStatus: string = exitCode === 0 ? 'DONE' : 'FAILED';
      let hbExitCode = exitCode;

      if (exitCode !== 0) {
        try {
          if (existsSync(resultPath)) {
            const raw = readFileSync(resultPath, 'utf-8');
            // safe: result files written by writeResult with TaskResult shape
            const result = JSON.parse(raw) as { selfAssessment?: string };
            if (
              !readRuntimeBudgetStop(projectDir, taskId)
              && (result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT')
            ) {
              hbStatus = 'DONE';
              hbExitCode = 0;
              debugLog('docker-backend:reconcile', `taskId=${taskId} exitCode=${exitCode} but .result=${result.selfAssessment} → HB DONE`);
            } else if (result.selfAssessment === 'TIMEOUT_WITH_WORK') {
              // Sprint 145: partial work detected — not DONE but not a clean failure either
              hbStatus = 'TIMEOUT_WITH_WORK';
              debugLog('docker-backend:reconcile', `taskId=${taskId} exitCode=${exitCode} .result=TIMEOUT_WITH_WORK → partial work, Brain reconciles`);
            }
          }
        } catch {
          // JSON parse fail or fs error → keep honest FAILED status
        }
      }

      // Update heartbeat
      const hbPath = join(tasksDir, `task-${taskId}.hb`);
      try {
        writeFileSync(hbPath, JSON.stringify({
          workerId: `docker-${taskId}`,
          taskId,
          status: hbStatus,
          sequence: 99,
          timestamp: new Date().toISOString(),
          exitCode: hbExitCode,
          backend: 'docker',
        }, null, 2), 'utf-8');
      } catch (e) { debugLog('docker-backend:hb-update', e); }

      // If no .result file and exit != 0, write fallback result + timeout marker.
      // Sprint 148 root cause fix: SIGKILL (exit 137, OOM kill) bypasses all shell
      // traps — the container's EXIT trap never runs. The host-side monitor must
      // write the fallback .result so Brain's result-collector doesn't wait forever.
      const timeoutPath = join(tasksDir, `task-${taskId}.timeout`);
      // Sprint 149: Partial write detection — .result exists but corrupt JSON
      // This catches cases where container was SIGKILL'd mid-write
      if (existsSync(resultPath) && exitCode !== 0) {
        try {
          const raw = readFileSync(resultPath, 'utf-8');
          JSON.parse(raw); // Just validate — if corrupt, overwrite below
        } catch {
          debugLog('docker-backend:partial-write', `taskId=${taskId} .result exists but corrupt JSON — overwriting with NO_GO`);
          try { unlinkSync(resultPath); } catch { /* ok */ }
          // Fall through to the fallback writer below
        }
      }

      // Sprint 151: Promote .partial-result → .result when container died without writing .result
      // This catches OOM kills (exit 137) where SIGKILL bypasses all shell traps but the
      // .partial-result file written at script start survives on the shared volume.
      const partialPath = join(tasksDir, `task-${taskId}.partial-result`);
      if (!existsSync(resultPath) && exitCode !== 0 && existsSync(partialPath)) {
        try {
          const partialRaw = readFileSync(partialPath, 'utf-8');
          const partial = JSON.parse(partialRaw) as Record<string, unknown>;
          // Enrich with exit code and signal info
          const signalInfo = exitCode > 128 ? ` signal=${exitCode - 128}` : '';
          const isOom = exitCode === 137;
          partial.notes = isOom
            ? `Container OOM-killed (exit 137, SIGKILL). Partial-result promoted by host monitor. No .result was written by worker.`
            : `Container killed (exitCode=${exitCode}${signalInfo}). Partial-result promoted by host monitor.`;
          partial.exitCode = exitCode;
          partial.selfAssessment = 'NO_GO';
          const enrichedResult = JSON.stringify(partial);
          writeFileSync(resultPath, enrichedResult, 'utf-8');
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
          try { unlinkSync(partialPath); } catch { /* ok */ }
          debugLog('docker-backend:partial-promote', `taskId=${taskId} exitCode=${exitCode} → promoted .partial-result to .result`);
        } catch (e) {
          debugLog('docker-backend:partial-promote-error', `taskId=${taskId} ${e}`);
          // Fall through to host fallback below
          try { unlinkSync(partialPath); } catch { /* ok */ }
        }
      }

      // Clean up .partial-result if .result already exists (normal exit or promoted above)
      if (existsSync(partialPath)) {
        try { unlinkSync(partialPath); } catch { /* ok */ }
      }

      if (!existsSync(resultPath) && exitCode !== 0) {
        // Sprint 272 T-003: enriched EXIT_WITHOUT_RESULT marker. This host fallback
        // fires when the container EXIT trap was bypassed (e.g. SIGKILL/OOM), so the
        // wrapper never wrote a marker. workPresent is unknown host-side (the container
        // is gone) → false; lastHb defaults to unknown (the .hb was already clobbered
        // with the host verdict above). Keeps the same NO_GO + "exited without writing
        // result (exitCode=" shape, now schema-compatible with the wrapper marker.
        const hostFallbackResult = JSON.stringify(
          buildExitWithoutResultMarker({
            taskId,
            model,
            exitCode,
            workPresent: false,
            source: 'host',
          }),
        );
        try {
          writeFileSync(resultPath, hostFallbackResult, 'utf-8');
          // fsync from host side to ensure data hits disk
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
          debugLog('docker-backend:host-fallback', `taskId=${taskId} exitCode=${exitCode} → wrote fallback .result`);
        } catch (e) {
          debugLog('docker-backend:host-fallback-error', `taskId=${taskId} ${e}`);
        }
        // Also write .timeout marker for backward compat
        if (!existsSync(timeoutPath)) {
          writeFileSync(timeoutPath, `container_exit_${exitCode}`, 'utf-8');
        }
      }

      // born-644 (BUILD-VIOLATION-GUARD): advisory-only dist/ mutation check — compares
      // against the pre-spawn snapshot from runSpawn. Runs AFTER the fallback/reconciliation
      // block above so whatever `.result` ends up on disk (worker-written or host-fallback)
      // is the one that gets flagged. Never blocks: wrapped in its own try/catch, and
      // applyDistMutationAdvisory/computeDistFingerprint already swallow their own errors.
      try {
        const distFingerprintAfter = computeDistFingerprint(join(projectDir, 'dist'));
        if (distFingerprintsChanged(distFingerprintBefore, distFingerprintAfter)) {
          const patched = applyDistMutationAdvisory(resultPath, true);
          const warning =
            `[deckent:spawn-backend-docker] BUILD-VIOLATION-GUARD: dist/ mutated during the `
            + `container run for task ${taskId} (advisory only — NOT blocking). Suspect an `
            + `in-container build command (npm run build / tsc / build:all) — the docker `
            + `backend mounts the project root read-write, so this writes straight through to `
            + `host dist/. resultPatched=${patched}`;
          console.warn(warning);
          debugLog('docker-backend:dist-mutation', warning);
        }
      } catch (e) {
        debugLog('docker-backend:dist-fingerprint-after', e);
      }

      // Extract container logs BEFORE removal (docker logs requires container to exist).
      // born-671 (416-001 CAPTURE-TRUTH): STREAM the capture instead of the old
      // spawnSync — that path had NO maxBuffer, so Node's 1 MiB default silently cut
      // 44% of trace corpora at ~1.1 MB and killed the terminal usage envelope (293×
      // cost drift, 413-001). captureDockerLogs streams stdout+stderr with only a
      // 256 MiB honest-marker safety ceiling and surfaces any error/non-zero-exit
      // instead of swallowing it. AWAITED so the `docker rm -f` below never races the
      // reader off the still-existing container. `content` is the SAME pristine string
      // the old path produced, so the two consumers below are byte-for-byte unchanged.
      try {
        const capture = await captureDockerLogs(containerName);
        const logContent = capture.content;
        if (logContent.trim()) {
          const logPath = join(tasksDir, `task-${taskId}.log`);
          // born-637 (TRACE-CONTENT-PARITY docker-parity): claude's container CLI
          // runs `--output-format stream-json` (claudeStreamJsonBaseArgs, runSpawn)
          // — its docker-logs dump is the FULL NDJSON event stream, not one final
          // envelope. born-639 (404-005 TRACE-TAIL): codex (already `--json`
          // NDJSON, provider-command-spec.ts) and gemini (`--output-format json`,
          // a single envelope) get the SAME normalize-write treatment now —
          // writeNormalizedDockerLog is provider-agnostic (whole-envelope fast
          // path + the codex event-bridge + normalizeStreamEvent's own never-drop
          // fallback), so readLogEvents/recordSprintWorkerTrace (dashboard SSE
          // tail + TRN-1 training-trace) see every provider's real trace instead
          // of the previous raw dump, which those readers always saw as zero
          // events (no `ts`/`seq`/`content` LogEvent shape on a raw CLI line).
          const logProviderBinary = getProviderBinaryForModel(model);
          if (budgetMonitor) {
            for (const line of logContent.split(/\r?\n/)) {
              if (!line.trim()) continue;
              try { budgetMonitor.observe(normalizeStreamEvent(line, logProviderBinary)); } catch { /* marker/stop already handled */ }
            }
          }
          writeNormalizedDockerLog(logPath, logContent, logProviderBinary);
          // Patch the .result with REAL token usage parsed from the CLI envelope in the
          // captured container stdout — at the SOURCE, sidestepping the orchestrator
          // enrich-timing race (the .log lands only after the container exits, which can
          // lag the agent-written .result by 20-30s). The agent cannot know its own token
          // counts; they live only in the --output-format json / --json envelope here.
          // Uses the PRISTINE logContent (not the normalized .log now on disk) —
          // extractUsage already scans every line for a usage-bearing envelope
          // (providers/claude.ts), so this stays byte-identical across both the old
          // single-envelope and the new stream-json format (see the usage-patch
          // regression fixture in tests/orchestra/trace-content-parity.test.ts).
          patchResultUsageFromEnvelope(tasksDir, taskId, model, logContent);
        }
      } catch (e) { debugLog('docker-backend:log-extract', e); }
      try { budgetMonitor?.settle(); } catch (e) { debugLog('docker-backend:budget-settle', e); }

      // Cleanup container
      try {
        spawnSync('docker', ['rm', '-f', containerName], { encoding: 'utf-8', timeout: 10_000 });
      } catch (e) { debugLog('docker-backend:cleanup', e); }

      // Sprint 156 Task 10: release every spawn lock owned by this task
      try {
        const released = releaseAllSpawnLocks(this.projectDir, taskId);
        if (released > 0) debugLog('docker-backend:spawn-lock', `taskId=${taskId} released ${released} spawn lock(s) on exit`);
      } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }

      // Sprint 168 C0b: defensive sad-path safety net — releaseStaleSpawnLocksForTask
      // catches any spawnlock missed by releaseAllSpawnLocks (e.g. corrupted file,
      // partial unlink). Both helpers are idempotent and cheap when no locks remain.
      try {
        releaseStaleSpawnLocksForTask(this.projectDir, taskId);
      } catch (e) { debugLog('docker-backend:spawn-lock-stale-release', e); }

      this.containers.delete(taskId);

      // 455-003: the container has exited, so the in-container EXIT-trap has
      // already consumed $BASEFILE (the task-start scope baseline). Remove it —
      // it is a per-spawn transient with no post-exit value, and unlike the
      // .prompt/.worker forensic tmpfiles below it carries no debugging signal.
      try {
        const baselinePath = join(tasksDir, `task-${taskId}.scope-baseline`);
        if (existsSync(baselinePath)) unlinkSync(baselinePath);
      } catch (e) { debugLog('docker-backend:scope-baseline-cleanup', e); }

      // Sprint 156 Task 4: .prompt-*.txt AND .worker-*.sh tmpfiles persist until sprint cleanup.
      // Both are archived together by archivePromptFiles() during sprint cleanup phase.
      // Rationale: worker scripts (.worker-*.sh) contain spawn invocation and env state useful for
      // post-mortem debugging when a container fails mid-execution. Previous behavior deleted them
      // immediately after each container exit, losing forensic value.
    });

    child.on('error', (err) => {
      debugLog('docker-backend:monitor-error', `taskId=${taskId} ${err.message}`);
      this.containers.delete(taskId);
    });
  }
}

// ─── Docker Availability Check (sync) ─────────────────────────────────────

export function isDockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

// ─── Prompt File Archive ───────────────────────────────────────────────────

/**
 * Archive .prompt-*.txt AND .worker-*.sh tmpfiles from .tasks/ into .tasks/archive/sprint-{sprintId}/.
 *
 * Called during sprint finalize/cleanup — tmpfiles persist during the sprint
 * for analysis, then are moved to the archive directory on completion.
 *
 * Sprint 156 Task 4 extension: worker scripts (.worker-*.sh) are archived alongside
 * prompt files. They contain spawn invocation context (env, claude args, taskId) that is
 * essential for post-mortem debugging when a container fails mid-execution.
 *
 * @param tasksDir  Absolute path to .tasks/ directory
 * @param sprintId  Sprint identifier (e.g. "sprint-139")
 * @param retentionSprints  How many past sprint archives to keep (default 5)
 */
export function archivePromptFiles(
  tasksDir: string,
  sprintId: string,
  retentionSprints = 5,
): { archived: number; cleaned: number } {
  let archived = 0;
  let cleaned = 0;

  if (!existsSync(tasksDir)) return { archived, cleaned };

  // Create archive directory for this sprint
  const archiveDir = join(tasksDir, 'archive', sprintId);
  mkdirSync(archiveDir, { recursive: true });

  // Move all .prompt-*.txt AND .worker-*.sh tmpfiles to archive
  try {
    const files = readdirSync(tasksDir) as string[];
    for (const f of files) {
      const isPromptFile = f.startsWith('.prompt-') && f.endsWith('.txt');
      const isWorkerScript = f.startsWith('.worker-') && f.endsWith('.sh');
      if (isPromptFile || isWorkerScript) {
        const src = join(tasksDir, f);
        const dst = join(archiveDir, f);
        try {
          renameSync(src, dst);
          archived++;
        } catch { /* skip files that can't be moved */ }
      }
    }
  } catch { /* ok — tasksDir may be empty */ }

  // F0.3: drain the mid-sprint orphan staging bucket (.tasks/archive/_orphaned/,
  // populated by ClaudeAdapter.archiveOrphanPromptFile when a prompt is cleaned
  // before sprint-end) into this sprint's archive dir, so those prompts inherit
  // the same retention instead of accumulating unbounded in staging.
  const orphanStaging = join(tasksDir, 'archive', '_orphaned');
  if (existsSync(orphanStaging)) {
    try {
      for (const f of readdirSync(orphanStaging) as string[]) {
        try { renameSync(join(orphanStaging, f), join(archiveDir, f)); archived++; }
        catch { /* skip files that can't be moved */ }
      }
    } catch { /* ok */ }
  }

  // Apply retention policy: remove old sprint archives beyond retentionSprints
  if (retentionSprints > 0) {
    const archiveRoot = join(tasksDir, 'archive');
    try {
      const sprintDirs = (readdirSync(archiveRoot) as string[])
        .filter(d => d.startsWith('sprint-'))
        .sort(); // alphabetical sort = chronological for sprint-NNN format
      const toRemove = sprintDirs.slice(0, Math.max(0, sprintDirs.length - retentionSprints));
      for (const dir of toRemove) {
        const dirPath = join(archiveRoot, dir);
        try {
          // Remove all files in the old archive sprint dir
          const oldFiles = readdirSync(dirPath) as string[];
          for (const f of oldFiles) {
            try { unlinkSync(join(dirPath, f)); cleaned++; } catch { /* ok */ }
          }
          // Remove the now-empty directory
          rmdirSync(dirPath);
        } catch { /* ok */ }
      }
    } catch { /* archive root may not exist yet */ }
  }

  return { archived, cleaned };
}
