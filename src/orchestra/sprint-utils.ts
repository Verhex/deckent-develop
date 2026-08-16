// ═══ Sprint Utilities ═══════════════════════════════════════════════
// Extracted from sprint-controller.ts — pure utility functions with
// minimal state dependencies. Sprint 075: God Object Split Phase 2.

import { extractStructuredGoNogo, unescapeListItem } from './directives-builder.js';
import {
  readFileSync, existsSync, writeFileSync,
  mkdirSync, unlinkSync, statSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  getProviderForModel,
} from '../core/types.js';
import {
  createGoNoGoCriterionItem,
  type GoNoGoCriteria,
  type GoNoGoCriterionItem,
  type GoNoGoCriterionPolarity,
} from '../core/task-types.js';

import type {
  Task, Sprint, SystemProfile, ResolvedConfig,
  ModelType, ProviderName,
} from '../core/types.js';

import {
  TASKS_DIR,
  SPRINT_PAUSE_STATE_FILE,
  SPRINT_STATE_FILE,
} from '../core/constants.js';

import { readJsonSafe, debugLog } from '../core/utils.js';
import { deriveBaseCriteria } from '../core/criteria-deriver.js';
import type { TaskKind, TechStackKind } from '../core/work-model.js';
import { modelRegistry } from '../core/model-registry.js';
import type { RegistryProviderName } from '../core/model-registry.js';
import { getSystemProfile } from '../core/system-profile.js';

import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry, ProviderError } from '../core/provider.js';

import { listWorkers } from './tmux.js';


// ═══ Constants ════════════════════════════════════════════════════════

/** Source code directory prefixes -- anything outside these is treated as a doc task */
const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

export {
  SPRINT_PAUSE_STATE_FILE as PAUSE_STATE_FILE,
  SPRINT_STATE_FILE,
};


// ═══ Pure Helpers ═════════════════════════════════════════════════════

export function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export function now(): string {
  return new Date().toISOString();
}


// ═══ Classification Utilities ═════════════════════════════════════════

export function isSourceCodeDir(dir: string): boolean {
  const normalized = dir === 'src' || dir === 'tests' || dir === 'lib';
  return normalized || SOURCE_CODE_PREFIXES.some(p => dir.startsWith(p));
}

/**
 * Returns true if the task is doc-only (no source code directories).
 * Source code scopes: src/, tests/, lib/ -- everything else is a doc task.
 */
export function isDocTask(task: Task): boolean {
  const dirs = task.scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => !isSourceCodeDir(d));
}

/**
 * Returns true if the task file has not been modified within maxAgeMs.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function isStaleTaskFile(filePath: string, maxAgeMs: number = 86_400_000): boolean {
  try {
    const stat = statSync(filePath);
    return Date.now() - stat.mtimeMs > maxAgeMs;
  } catch {
    return false;
  }
}

/**
 * Check whether a provider uses the local tmux-based spawn mechanism.
 * Currently only the 'claude' provider uses tmux; all others use their adapter's spawn().
 *
 * Sprint 202 Task 202-003 note: the literal `'claude'` here is NOT a default
 * fallback — it is a legitimate Claude-specific capability check (tmux is
 * exclusive to the Claude provider). Codex/Gemini/Ollama all spawn through
 * their adapter, not tmux. Do not generalize this comparison.
 * @internal
 */
export function isTmuxProvider(providerName: ProviderName): boolean {
  return providerName === 'claude';
}

/**
 * Check whether a provider is a **host-spawned adapter provider** that MUST be
 * spawned via its host `ProviderAdapter.spawn(...)` rather than through a
 * container/tmux backend.
 *
 * Why this exists (Sprint 234 AS-2 Faz 2; extended Sprint 248 for codex/gemini):
 * These providers run on the host and cannot tolerate the Docker worker image:
 *   - `ollama` is host-HTTP — it reaches a daemon on the host loopback
 *     (`localhost:11434`) that the container's loopback does not route to.
 *   - `codex` / `gemini` are host-process CLIs whose OAuth/subscription session
 *     lives in the host home (`~/.codex`, `~/.gemini`). The Docker backend's
 *     `getProviderForModel` would degrade a non-claude task to the `claude` CLI
 *     inside the container — the wrong tool — and the container has no access to
 *     the host OAuth session anyway. Their `CodexAdapter`/`GeminiAdapter.spawn`
 *     invoke the real `codex`/`gemini` CLI as a host child process.
 *
 * Before this predicate existed, `sprint-spawner.ts` preferred any provided
 * spawn backend (typically `docker`) over the adapter, which silently routed
 * these tasks to `spawn-backend-docker.ts` and degraded them to `claude`.
 *
 * Extension point: when an OpenAI-compatible HTTP adapter ("openai-compat")
 * is added under the same pattern (local server, host-only), append its
 * provider name here. Keep the list tight — only providers that genuinely
 * cannot tolerate a container/tmux backend belong here.
 *
 * OPENROUTER-PROVIDER (row 477): `'openrouter'` is exactly the extension case
 * described above — it reaches OpenRouter over wire-identical OpenAI
 * `/chat/completions` and its `spawn()` launches the SAME `http-agentic-worker`
 * entry as `OpenAICompatibleAdapter.spawn()` (providers/openrouter.ts). The
 * operative criterion is host-only + owns-its-spawn, NOT literal locality:
 * OpenRouter's credential is resolved host-side from `.deck` and injected into
 * the child's env only, so it can never survive containerization, and the
 * docker backend would degrade the task to the `claude` CLI — the precise
 * failure this predicate exists to prevent. Adding it here fixes BOTH consumer
 * meanings at once: the spawn sites prefer `adapter.spawn()` over the backend,
 * and `model-selector.ts`'s forceModel path stops running dynamic OpenRouter
 * model ids through the static availability/equivalence lookup (which throws
 * `E_UNKNOWN_MODEL`, since those ids are catalog-driven, not statically listed).
 *
 * @returns true for `'ollama'`, `'codex'`, `'gemini'`, `'openrouter'`,
 * `'local-llm'`; false for `'claude'`
 * @internal
 */
export function isAdapterProvider(providerName: ProviderName): boolean {
  return providerName === 'ollama'
    || providerName === 'codex'
    || providerName === 'gemini'
    || providerName === 'openrouter'
    || providerName === 'local-llm';
}


// ═══ Config Helpers ══════════════════════════════════════════════════

/** Resolve max_workers to a number, handling 'auto' */
export function resolveMaxWorkersNumeric(config: ResolvedConfig, systemProfile?: SystemProfile): number {
  const maxWorkers = config.activeModeConfig.max_workers;
  if (maxWorkers === 'auto') {
    const profile = systemProfile ?? getSystemProfile();
    return profile.recommendedMaxWorkers;
  }
  return maxWorkers;
}


// ═══ Provider Utilities ══════════════════════════════════════════════

/**
 * Resolve the CLI binary from the default provider in the registry.
 * Returns undefined if no provider is registered.
 * @internal
 */
export function resolveDefaultUsageCli(): string | undefined {
  try {
    const defaultAdapter = providerRegistry.getDefault();
    // Sprint 202 Task 202-003: resolve the registered default provider's tier
    // model instead of hard-coding `('claude', 'premium')`. Pure-Ollama configs
    // would otherwise silently fall through to `'opus'`, which Ollama cannot run.
    // Ollama is registered in the catalog (Sprint 190 ollama-models.ts) but its
    // type lives outside RegistryProviderName — cast follows the existing
    // pattern documented in model-registry.ts.
    const defaultProviderName = defaultAdapter.name as RegistryProviderName;
    const defaultModelDefinition = (
      modelRegistry.getByProviderAndTier(defaultProviderName, 'premium_plus')
      ?? modelRegistry.getByProviderAndTier(defaultProviderName, 'premium')
      ?? modelRegistry.getByProviderAndTier(defaultProviderName, 'standard')
      ?? modelRegistry.getByProviderAndTier(defaultProviderName, 'economy')
    );
    if (!defaultModelDefinition) throw new Error(`E_DEFAULT_MODEL_UNAVAILABLE: provider=${defaultProviderName}`);
    const defaultModel = defaultModelDefinition.id as ModelType;
    const cmdStr = defaultAdapter.buildCommand(defaultModel, '/dev/null');
    const firstToken = cmdStr.split(/\s+/)[0];
    return firstToken || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get the default registered ProviderAdapter from the provider registry.
 * Returns null if none is registered or an error occurs
 */
export function getDefaultProvider(): ProviderAdapter | null {
  try {
    return providerRegistry.getDefault();
  } catch {
    return null;
  }
}

/**
 * Resolve a default ProviderName from the registry, falling back to the
 * built-in `'claude'` literal only when the registry is empty.
 *
 * Sprint 202 Task 202-003 (F1 Provider Independence): this is the canonical
 * last-resort floor for provider-neutral modules. Other modules MUST call
 * `getDefaultProviderName()` instead of spelling `?? 'claude'` again — that
 * keeps the literal contained to this single site (plus the `config.ts`
 * factory default by design). The helper lives in `sprint-utils.ts` rather
 * than `core/provider.ts` because the test suite consistently mocks
 * `sprint-utils.ts` via `importOriginal()`, so adding new exports here does
 * not break vi.mock factory-style mocks of `core/provider.ts`.
 *
 * @returns The registry's default provider name, or `'claude'` as final floor
 */
export function getDefaultProviderName(): ProviderName {
  const adapter = getDefaultProvider();
  return ((adapter?.name as ProviderName | undefined) ?? 'claude');
}

/**
 * Resolve the provider for a task.
 * Uses task.provider if explicitly set, otherwise infers from model via getProviderForModel().
 * Falls back to the registry's default provider if the model is unrecognized.
 * If no default provider is registered, returns 'claude' as the built-in ProviderName.
 * @internal
 */
export function resolveTaskProvider(task: Task): ProviderName {
  if (task.provider) return task.provider;
  try {
    return getProviderForModel(task.model);
  } catch (e) {
    debugLog('resolveTaskProvider:getProviderForModel', e);
    // Model unrecognized — try default provider from registry
    try {
      return providerRegistry.getDefault().name as ProviderName;
    } catch (e2) {
      debugLog('resolveTaskProvider:getDefault', e2);
      throw new ProviderError(`No providers registered and model '${task.model}' is unrecognized — cannot resolve provider`, 'unknown');
    }
  }
}

/**
 * Get a ProviderAdapter from the registry for the given provider name.
 * Returns null if the provider is not registered (logs no error — caller decides).
 * @internal
 */
export function getProviderAdapterForTask(providerName: ProviderName): ProviderAdapter | null {
  try {
    return providerRegistry.getProvider(providerName);
  } catch {
    return null;
  }
}


// ═══ Subprocess Worker Log Utilities ═════════════════════════════════

/**
 * Get the log file path for a subprocess worker.
 */
export function getSubprocessWorkerLogPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
}

/**
 * Read the log contents of a subprocess worker.
 * Returns the log file contents if it exists, or null if the log file is not found.
 */
export function readSubprocessWorkerLog(projectRoot: string, taskId: string): string | null {
  const logPath = getSubprocessWorkerLogPath(projectRoot, taskId);
  if (!existsSync(logPath)) return null;
  try {
    return readFileSync(logPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check whether a subprocess worker log file exists.
 */
export function hasSubprocessWorkerLog(projectRoot: string, taskId: string): boolean {
  return existsSync(getSubprocessWorkerLogPath(projectRoot, taskId));
}


// ═══ Sprint State Persistence ════════════════════════════════════════

export interface SprintState {
  sprintId: string;
  phase: import('../core/types.js').SprintPhase;
  status: string;
  startedAt: string;
  updatedAt: string;
  taskIds: string[];
}

/**
 * Persist current sprint phase state to disk for crash recovery.
 * Non-fatal: errors are silently ignored.
 */
export function writeSprintState(projectRoot: string, sprint: Sprint): void {
  try {
    const statePath = join(projectRoot, SPRINT_STATE_FILE);
    const state: SprintState = {
      sprintId: sprint.id,
      phase: sprint.phase,
      status: sprint.status,
      startedAt: sprint.startedAt ?? now(),
      updatedAt: now(),
      taskIds: sprint.tasks.map(t => t.id),
    };
    mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    debugLog('persistSprintState:writeFile', e);
  }
}

/**
 * Read persisted sprint state from disk. Returns null if no state file exists.
 */
export function readSprintState(projectRoot: string): SprintState | null {
  const statePath = join(projectRoot, SPRINT_STATE_FILE);
  return readJsonSafe<SprintState>(statePath) ?? null;
}

/**
 * Remove sprint state file after sprint completion.
 */
export function clearSprintState(projectRoot: string): void {
  try {
    const statePath = join(projectRoot, SPRINT_STATE_FILE);
    if (existsSync(statePath)) unlinkSync(statePath);
  } catch (e) {
    debugLog('clearSprintState:unlinkSync', e);
  }
}


// ═══ Orphan / Retry Utilities ════════════════════════════════════════

/**
 * Detect orphan tmux windows from a previous crashed sprint.
 * Returns list of orphaned worker IDs that have tmux windows but no active sprint.
 */
export function detectOrphanWorkers(projectRoot: string): string[] {
  try {
    const workers = listWorkers();
    const state = readSprintState(projectRoot);
    if (!state) {
      // No sprint state — any existing workers are orphans
      return workers;
    }
    // Workers not in the current sprint's task list are orphans
    const validWorkers = new Set(state.taskIds.map(id => `w-${id}`));
    return workers.filter(w => !validWorkers.has(w));
  } catch {
    return [];
  }
}

// ─── Spawn attempt-history diagnosability (RECOVERY-DO-DOGFOOD visibility) ──
// runSpawnPhase retries spawn twice, and only the LAST error ever reached the
// operator — the first attempt's error was swallowed by the catch. Measured cost
// (2026-08-09): attempt 2 failed with EXACT_PLAN_TASK_ARTIFACT_DRIFT, which was
// itself a retry artifact (buildWorkerPrompt mutates the approved task in place
// during attempt 1), so the reported error MASKED the real first-attempt spawn
// failure — and it was absent from the detached child log too, leaving the root
// cause unrecoverable from artifacts for a whole session. Same class as the #112
// drift diagnosis: the detail rides the terminal Error MESSAGE, so every run
// surface (start / run / runs / do / goal / process) inherits it by construction.
// Behaviour-neutral: attempt count, retry decision and gate outcome are unchanged.

/** Keep one attempt line readable in a terminal; a full stack would bury it. */
const SPAWN_ATTEMPT_MESSAGE_MAX_CHARS = 300;

function describeSpawnAttemptError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
  const rendered = code ? `${code}: ${message}` : message;
  return rendered.length > SPAWN_ATTEMPT_MESSAGE_MAX_CHARS
    ? `${rendered.slice(0, SPAWN_ATTEMPT_MESSAGE_MAX_CHARS)}…`
    : rendered;
}

/**
 * Render the per-attempt failure history for a spawn phase that retried.
 *
 * Returns `''` for zero or one recorded attempt — with a single failure nothing
 * was ever hidden, and the caller already reports that error verbatim. Pure;
 * exported for unit tests and for any surface wanting the composed history.
 */
export function summarizeSpawnAttemptFailures(errors: readonly unknown[]): string {
  if (errors.length < 2) return '';
  return errors
    .map((error, index) => `attempt ${index + 1}: ${describeSpawnAttemptError(error)}`)
    .join(' | ');
}

/**
 * Build a retry recommendation message after spawn failure.
 * Suggests model downgrade or scope simplification based on error analysis.
 */
export function buildSpawnRetryHint(error: unknown, sprint: Sprint): string {
  const msg = error instanceof Error ? error.message : String(error);
  const hints: string[] = [];

  if (msg.includes('landing scope')) {
    // KN4: an empty landing scope means a task carries no file scope at all —
    // usually a narrative line that was mis-parsed as a task, or DIRECTIVES
    // missing Files:/Scope: directives. The generic credentials hint was wrong.
    hints.push(
      'A task has an EMPTY file scope, so execution-landing admission refused it — '
      + 'check DIRECTIVES: every task needs real Files:/Scope: paths (narrative/goal lines are not tasks); re-plan after fixing',
    );
  }
  if (msg.includes('execution budget') || msg.includes('budget-policy') || msg.includes('Spawn blocked before provider work')) {
    // KN2: the budget-admission refusal used to fall through to the generic
    // "check provider credentials" hint — the WRONG remedy for a budget gap.
    hints.push(
      'Execution-budget admission refused the spawn — the task carries no budget/policy snapshot. '
      + 'Check `execution_budget` in .deckent/config.json (init authors a default worker policy) and '
      + 'the `estimator` block in .deckent/cost-config.json; re-plan so tasks are stamped, or see docs/MASTER-PLAN.md KN2',
    );
  }
  if (msg.includes('EXACT_PLAN_')) {
    // Dogfood 2026-08-09: the first real run died on EXACT_PLAN_TASK_ARTIFACT_DRIFT
    // and fell through to the generic "check provider credentials" hint — the WRONG
    // remedy again (same class as KN4/KN2 above). This is an artifact-identity
    // refusal: the approved exact plan and the materialized task files disagree.
    // The error message itself now names the task and the drifting field(s).
    hints.push(
      'The approved exact plan and the materialized task artifacts DISAGREE — an artifact-identity refusal, '
      + 'not a credential/resource fault. The message above names the task and the drifting field(s). '
      + 'Re-plan so the artifacts are rewritten from the approved plan, or clear stale `.tasks/task-*.json` '
      + 'left by an earlier failed run that reused the same sprint id',
    );
  }
  if (msg.includes('rate') || msg.includes('limit') || msg.includes('429')) {
    hints.push('Rate limit hit — consider downgrading task models (opus→sonnet, sonnet→haiku)');
  }
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    hints.push('Connection timeout — check network or provider availability');
  }
  if (msg.includes('tmux') || msg.includes('session')) {
    hints.push('tmux session error — run `deckent doctor` to verify tmux setup');
  }
  if (sprint.tasks.length > 6) {
    hints.push(`High task count (${sprint.tasks.length}) — consider reducing max_workers or splitting the sprint`);
  }
  if (hints.length === 0) {
    hints.push('Unexpected spawn error — check provider credentials and system resources');
  }
  return hints.join('; ');
}


// ═══ Directive Parsing Utilities ═════════════════════════════════════

/**
 * Proof/verification label prefix matcher (WP-13).
 *
 * Matches the leading label of a DIRECTIVES proof line — `Kanıt:`, `Proof:`,
 * `Test:`, `Doğrulama:`, `Verify(ication):` — in EVERY markdown form a directive
 * author uses, so the same regex powers both detection and stripping:
 *   - `Kanıt:`              (plain)
 *   - `**Kanıt:**`          (colon INSIDE the bold — the dominant DIRECTIVES form)
 *   - `**Kanıt**:`          (colon OUTSIDE the bold)
 *   - `- **Proof:**`        (bulleted)
 *
 * The previous strip regex only handled the colon-OUTSIDE form (`**Label**:`),
 * so the colon-inside `**Kanıt:**` slipped through and the `[-*]` bullet
 * fallback then chewed a single `*` off, splicing a broken `*Kanıt:**` token
 * into the worker's Definition-of-Done block. A trailing `:` (adjacent to the
 * label or to its closing `**`) is required, so prose like "Verify the output"
 * is NOT mistaken for a directive.
 */
const PROOF_LABEL_PREFIX_RE =
  /^\s*[-*]?\s*\*{0,2}\s*(?:Kan[ıi]t|Proof|Doğrulama|Verification|Verify|Test|go[-_\s]?criteria)\*{0,2}:\*{0,2}\s*/i;

/**
 * NO-GO label prefix matcher (F0.2). Recognizes the `nogo:` / `no-go:` /
 * `noGoCriteria:` prohibition lines a DIRECTIVES author writes under `### goNogo`,
 * in the same markdown forms as PROOF_LABEL_PREFIX_RE. These were previously
 * unmatched, so a task's explicit prohibitions ("do not make description required")
 * never reached the machine-visible noGoCriteria and every task fell back to the
 * generic "build/tests fail" contract — a mechanical violation of the "GO/NO-GO
 * must be task-specific, not generic" rule (brain.md).
 */
const NOGO_LABEL_PREFIX_RE =
  /^\s*[-*]?\s*\*{0,2}\s*(?:no[-_\s]?go(?:[-_\s]?criteria)?)\*{0,2}:\*{0,2}\s*/i;

/**
 * Strip the proof-label prefix from a directive line (WP-13). When no label
 * prefix is present (e.g. an inline `- \`grep …\`` command line caught by the
 * fallback branch), only a leading bullet is removed so the command survives.
 */
function stripProofLabel(line: string): string {
  const withoutLabel = line.replace(PROOF_LABEL_PREFIX_RE, '');
  if (withoutLabel !== line) return withoutLabel.trim();
  return line.replace(/^\s*[-*]\s*/, '').trim();
}

/** Strip the NO-GO label prefix from a directive line (F0.2). */
function stripNoGoLabel(line: string): string {
  const withoutLabel = line.replace(NOGO_LABEL_PREFIX_RE, '');
  if (withoutLabel !== line) return withoutLabel.trim();
  return line.replace(/^\s*[-*]\s*/, '').trim();
}

function genericCriterionItem(
  polarity: GoNoGoCriterionPolarity,
  statement: string,
): GoNoGoCriterionItem {
  return createGoNoGoCriterionItem({
    polarity,
    statement,
    evidenceRequirements: [statement],
  });
}

function attachStructuredCriteria(
  display: Omit<GoNoGoCriteria, 'items'>,
  base: Pick<GoNoGoCriteria, 'goCriteria' | 'noGoCriteria'>,
  specificItems: readonly GoNoGoCriterionItem[],
): GoNoGoCriteria {
  const items = [
    genericCriterionItem('go', base.goCriteria),
    genericCriterionItem('no-go', base.noGoCriteria),
    ...specificItems,
  ];
  return {
    ...display,
    items: [...new Map(items.map(item => [item.id, item])).values()],
  };
}

/**
 * Extract task-specific GO/NOGO criteria from DIRECTIVES description.
 * Parses "Kanıt:", "Proof:", "Doğrulama:", "Verify:" lines for goCriteria.
 * Falls back to generic criteria if no specific proof lines found.
 */
export function extractGoNogoCriteria(
  description: string,
  testTarget?: string,
  // WM-7: optional kind×stack context. When supplied, the BASE criteria are
  // derived from the task kind + detected project stack (doc→disk-verify,
  // code→stack commands, never `tsc` on a non-TS project). When ABSENT, the
  // legacy TypeScript-centric output is preserved verbatim (backward compatible).
  opts?: { kind?: TaskKind; stack?: TechStackKind; commands?: { build?: string; test?: string; typecheck?: string } },
): GoNoGoCriteria {
  const lines = description.split('\n');
  const proofLines: string[] = [];
  const noGoLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // NO-GO prohibition lines (`nogo:` / `noGoCriteria:`) — checked FIRST so a
    // `nogo:` line is never mis-collected as a GO/proof line (F0.2).
    if (NOGO_LABEL_PREFIX_RE.test(trimmed)) {
      noGoLines.push(trimmed);
    }
    // Match proof/verification + GO directive lines (Kanıt/Proof/Test/Verify/
    // goCriteria…) in any markdown form — see PROOF_LABEL_PREFIX_RE (WP-13/F0.2).
    else if (PROOF_LABEL_PREFIX_RE.test(trimmed)) {
      proofLines.push(trimmed);
    }
    // Match inline grep/command verification patterns (bulleted commands w/o a label)
    else if (/^\s*[-*]\s*`(?:grep|find|wc|ls|cat|npx)\s/.test(trimmed)) {
      proofLines.push(trimmed);
    }
  }

  // PCOMP-6 D5: DIRECTIVES writers escape intra-item ';' as '\;' (born-677
  // round-trip). This reader previously kept the escape, so '\;' leaked into
  // task.goNogo and every downstream prompt (28/31 corpus prompts). Unescape
  // per line with the SAME helper the canonical reader uses.
  const specificCriteria = proofLines
    .slice(0, 3)
    .map(stripProofLabel)
    .map(unescapeListItem)
    .join('; ');
  const specificNoGo = noGoLines
    .slice(0, 3)
    .map(stripNoGoLabel)
    .map(unescapeListItem)
    .join('; ');
  const hasSpecific = proofLines.length > 0 || noGoLines.length > 0;
  const directiveCriteria = extractStructuredGoNogo(description);
  const fallbackSpecificItems = [
    ...proofLines.slice(0, 3).map(line => genericCriterionItem(
      'go',
      unescapeListItem(stripProofLabel(line)),
    )),
    ...noGoLines.slice(0, 3).map(line => genericCriterionItem(
      'no-go',
      unescapeListItem(stripNoGoLabel(line)),
    )),
  ];
  // A canonical `### goNogo` block owns reversible array boundaries and may
  // carry planner-authored evidence requirements. Otherwise one labelled line
  // is one item; punctuation inside that line is never treated as structure.
  const specificItems = directiveCriteria.items.length > 0
    ? directiveCriteria.items
    : fallbackSpecificItems;

  // ── WM-7 path: kind × stack aware base ──────────────────────────────────
  if (opts?.kind) {
    const base = deriveBaseCriteria(opts.kind, opts.stack ?? 'generic', opts.commands);
    if (hasSpecific) {
      // Compose the task-specific GO proof lines + NO-GO prohibitions on top of
      // the kind-aware base. For doc/audit/data the base already says "no
      // build/test"; for code it carries the stack commands — neither path glues
      // `tsc` onto a doc task.
      return attachStructuredCriteria(
        {
          goCriteria: proofLines.length > 0 ? `${base.goCriteria}; ${specificCriteria}` : base.goCriteria,
          noGoCriteria: specificNoGo ? `${base.noGoCriteria}; ${specificNoGo}` : base.noGoCriteria,
          techDebtAcceptable: base.techDebtAcceptable,
        },
        base,
        specificItems,
      );
    }
    return attachStructuredCriteria(base, base, []);
  }

  // ── Legacy path (no kind context): preserved verbatim ───────────────────
  const baseCriteria = testTarget ? `${testTarget}; Tests pass` : 'Tests pass; tsc clean';

  if (hasSpecific) {
    const base = {
      goCriteria: baseCriteria,
      noGoCriteria: 'Build fails or verification commands fail',
      techDebtAcceptable: 'Minor issues if all verification commands pass',
    };
    return attachStructuredCriteria(
      {
        ...base,
        goCriteria: proofLines.length > 0 ? `${base.goCriteria}; ${specificCriteria}` : base.goCriteria,
        noGoCriteria: specificNoGo
          ? `${base.noGoCriteria}; ${specificNoGo}`
          : base.noGoCriteria,
      },
      base,
      specificItems,
    );
  }

  const base = {
    goCriteria: baseCriteria,
    noGoCriteria: 'Build fails or tests fail',
    techDebtAcceptable: 'Minor style issues if tests pass',
  };
  return attachStructuredCriteria(base, base, []);
}
