// ─── Node Builtins ─────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// ─── Core (types only — NO brain.ts imports) ──────────────────────
import type {
  BrainContext, SprintSizeRecommendation, PlannerResult, ModelType,
} from '../core/types.js';
import { ALL_MODELS } from '../core/types.js';
import { BRAIN_PLAN_TIMEOUT_MS, BRAIN_PLAN_MAX_CONTEXT_LINES } from '../core/constants.js';
import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry, ProviderError } from '../core/provider.js';
import { modelRegistry } from '../core/model-registry.js';
import { debugLog } from '../core/utils.js';
import type { TaskScope } from '../core/task-types.js';
import { getProviderForModel } from '../core/task-types.js';
import { buildAdrConstraintsPlannerBlock } from '../core/adr-constraints.js';
import {
  stripPhantomScope,
  expandScopeWithAffectedTests,
  type AffectedTestFile,
} from '../core/task-builder-scope.js';
// Dependency-ref resolution reuse (323-031): resolveDependencyRef handles
// slot-id (NNN-NNN) exact match AND title-token match (substring-trap safe);
// isPlanSlotId classifies dropped refs. No import cycle — only sprint-planner
// imports planner.js, so task-builder never re-enters this module.
import { resolveDependencyRef, isPlanSlotId } from './task-builder.js';

// ─── Model enum values for Zod schemas ───────────────────────────────────
const MODEL_ENUM_VALUES = ALL_MODELS as unknown as [string, ...string[]];

// ─── Zod Schemas ──────────────────────────────────────────────────
const PlannerTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  model: z.enum(MODEL_ENUM_VALUES),
  effort: z.enum(['low', 'normal', 'high']),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL', 'LOW']),
  reason: z.string(),
  scope: z.object({
    directories: z.array(z.string()),
    filesRead: z.array(z.string()),
    filesWrite: z.array(z.string()),
  }),
  dependencies: z.array(z.string()),
  goNogo: z.object({
    goCriteria: z.string(),
    noGoCriteria: z.string(),
    techDebtAcceptable: z.string(),
  }),
});

const PlannerResultSchema = z.object({
  tasks: z.array(PlannerTaskSchema).min(1),
  reasoning: z.string(),
});

// ─── Context Priority Section ─────────────────────────────────────

interface PrioritySection {
  text: string;
  priority: number; // 1 = highest, larger = lower priority
}

/**
 * Build context block from sections with priority-based truncation.
 * When total lines exceed maxLines, lowest-priority sections are trimmed first.
 * Priority order: DIRECTIVES(1) > MEMORY(2) > DEBT(3) > PATTERNS(4) > others(5+)
 * @internal
 */
export function buildPriorityContextBlock(
  sections: PrioritySection[],
  maxLines: number,
): string {
  // Total lines without any truncation
  const totalLines = sections.reduce((sum, s) => sum + (s.text ? s.text.split('\n').length + 1 : 0), 0);

  if (totalLines <= maxLines) {
    // No truncation needed — join all non-empty sections in order
    return sections.filter(s => s.text).map(s => s.text).join('\n\n');
  }

  // Need to truncate: allocate lines proportionally, protecting higher priority sections
  // Sort by priority (ascending = higher importance first)
  const sorted = sections.map((s, i) => ({ ...s, origIndex: i })).sort((a, b) => a.priority - b.priority);

  const included = new Set<number>();
  let linesUsed = 0;

  for (const section of sorted) {
    if (!section.text) continue;
    const sectionLines = section.text.split('\n').length + 1; // +1 for separator
    if (linesUsed + sectionLines <= maxLines) {
      included.add(section.origIndex);
      linesUsed += sectionLines;
    } else if (linesUsed < maxLines) {
      // Partially include this section
      included.add(section.origIndex);
      break;
    } else {
      break; // no more room
    }
  }

  // Reconstruct in original order, truncating partial sections
  const resultParts: string[] = [];
  let remainingLines = maxLines;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    if (!section.text || !included.has(i)) continue;
    const sectionLineArr = section.text.split('\n');
    if (sectionLineArr.length <= remainingLines) {
      resultParts.push(section.text);
      remainingLines -= sectionLineArr.length + 1;
    } else {
      // Partial inclusion
      resultParts.push(sectionLineArr.slice(0, remainingLines).join('\n'));
      break;
    }
  }

  return resultParts.join('\n\n');
}

// ─── buildPlanPrompt ──────────────────────────────────────────────

/**
 * @internal Used only within orchestra/ — builds the AI planner prompt.
 * Not part of the public API surface.
 * @param language - Prompt language: 'tr' (default) or 'en'
 */
export function buildPlanPrompt(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  projectName: string,
  zeroConfigDescription?: string,
  language: string = 'tr',
  worstCombinations?: string,
): string {
  const isEn = language === 'en';

  const criticalDebt = context.debt.filter(d => d.priority === 'CRITICAL' && !d.resolved);
  const critDebtText = criticalDebt.length > 0
    ? `CRITICAL DEBT:\n${criticalDebt.map(d => `- ${d.id}: ${d.description}`).join('\n')}`
    : '';

  const fileTree = context.projectState.fileTree.slice(0, 100);
  const fileTreeText = fileTree.length > 0
    ? `FILE TREE (first ${fileTree.length}):\n${fileTree.join('\n')}`
    : '';

  let zeroConfigText = '';
  if (zeroConfigDescription) {
    zeroConfigText = isEn
      ? `ZERO-CONFIG MODE:\nUser started sprint with: "${zeroConfigDescription}"\nSplit into 3-5 independent tasks. Each must be completable on its own.\nExample: "Add login page with Google OAuth" → 1) Auth API endpoints, 2) Google OAuth integration, 3) Login page UI, 4) Tests`
      : `ZERO-CONFIG MODE:\nKullanıcı tek satır doğal dil ile sprint başlattı: "${zeroConfigDescription}"\nBu açıklamayı 3-5 bağımsız göreve böl. Her görev kendi başına tamamlanabilmeli.\nÖrnek: "Add login page with Google OAuth" → 1) Auth API endpoints, 2) Google OAuth integration, 3) Login page UI, 4) Tests`;
  }

  // Sections with priority: DIRECTIVES(1) > MEMORY(2) > DEBT(3) > PATTERNS(4) > others(5+)
  const prioritySections: PrioritySection[] = [
    { text: zeroConfigText, priority: 0 },
    { text: context.directives ? `DIRECTIVES:\n${context.directives}` : '', priority: 1 },
    { text: context.memory ? `MEMORY:\n${context.memory}` : '', priority: 2 },
    { text: critDebtText, priority: 3 },
    { text: context.patterns ? `PATTERNS:\n${context.patterns}` : '', priority: 4 },
    { text: context.retro ? `RETRO:\n${context.retro}` : '', priority: 5 },
    { text: context.decisions ? `DECISIONS:\n${context.decisions}` : '', priority: 6 },
    { text: context.projectIdentity ? `PROJECT IDENTITY:\n${context.projectIdentity}` : '', priority: 7 },
    { text: fileTreeText, priority: 8 },
  ];

  const contextBlock = buildPriorityContextBlock(
    [{ text: `Project: ${projectName}`, priority: 0 }, ...prioritySections],
    BRAIN_PLAN_MAX_CONTEXT_LINES,
  );

  // Inject worst combinations from OutcomeTracker.getWorstCombinations() when available
  // Adds GECMIS SONUCLAR block so the AI planner avoids historically poor agent+skill combos
  const worstCombinationsSection = worstCombinations
    ? (isEn
      ? `\nPAST RESULTS (combinations to avoid):\n${worstCombinations}`
      : `\nGEÇMİŞ SONUCLAR (kaçınılması gereken kombinasyonlar):\n${worstCombinations}`)
    : '';

  if (isEn) {
    return `You are a software project orchestrator. Analyze the given directives and create a structured task plan.

RULES:
- Plan ALL tasks from the directives as task JSON — do not limit the task count
- max_workers (${recommendation.maxWorkers}) is only the concurrent execution limit, not the task count cap
- Each task must be independently executable (parallel execution)
- Specify dependencies in the dependencies array if any exist
- Define scope (directories + filesWrite) for each task
- Write GO/NO-GO criteria for each task

MODEL SELECTION CRITERIA (CHOOSE THE RIGHT MODEL FOR EACH TASK):
- **opus**: Complex architecture changes, tasks touching multiple modules, new patterns/abstractions, cross-cutting concerns, large features requiring test + implementation together
- **sonnet**: Standard CRUD operations, single file/module changes, adding new files following existing patterns, template/config updates, documentation, simple API endpoints, UI components (following existing patterns)
- **haiku**: Trivial tasks only — rename, typo fix, file copy, .gitignore line addition, placeholder file creation, single-line config change
- Explain the model selection in the "reason" field (why this model, how complex)

CONTEXT:
${contextBlock}${worstCombinationsSection}

OUTPUT FORMAT (JSON ONLY, nothing else):
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "model": "sonnet|opus|haiku",
      "effort": "low|normal|high",
      "priority": "CRITICAL|HIGH|NORMAL|LOW",
      "reason": "Why this model/effort",
      "scope": { "directories": [...], "filesRead": [...], "filesWrite": [...] },
      "dependencies": [],
      "goNogo": { "goCriteria": "...", "noGoCriteria": "...", "techDebtAcceptable": "..." }
    }
  ],
  "reasoning": "Plan rationale"
}`;
  }

  return `Sen bir yazılım proje orkestratörüsün. Verilen directive'leri analiz et ve yapılandırılmış görev planı oluştur.

KURALLAR:
- Directive'deki TÜM görevleri task JSON olarak planla — görev sayısını sınırlama
- max_workers (${recommendation.maxWorkers}) sadece eş zamanlı çalışma limitidir, görev sayısını etkilemez
- Her görev bağımsız çalışabilmeli (paralel execution)
- Bağımlılık varsa dependencies array'inde belirt
- Her görev için scope (directories + filesWrite) belirle
- Her görev için GO/NO-GO kriterleri yaz

${buildAdrConstraintsPlannerBlock()}
MODEL SEÇİM KRİTERLERİ (HER GÖREV İÇİN DOĞRU MODELİ SEÇ):
- **opus**: Karmaşık mimari değişiklik, birden fazla modüle dokunan görevler, yeni pattern/abstraction oluşturan işler, cross-cutting concern'ler (yeni CLI+MCP+API birlikte), test + implementasyon birlikte gereken büyük feature'lar
- **sonnet**: Standart CRUD işlemleri, tek dosya/modül değişikliği, mevcut pattern'i takip eden yeni dosya ekleme, template/config güncellemesi, dokümantasyon yazımı, basit API endpoint ekleme, UI component ekleme (mevcut pattern ile)
- **haiku**: Sadece trivial işler — rename, typo fix, dosya kopyalama, .gitignore satırı ekleme, placeholder dosya oluşturma, tek satırlık config değişikliği
- "reason" alanında model seçimini AÇIKLA (neden bu model, ne kadar karmaşık)

CONTEXT:
${contextBlock}${worstCombinationsSection}

ÇIKTI FORMAT (SADECE JSON, başka bir şey yazma):
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "model": "sonnet|opus|haiku",
      "effort": "low|normal|high",
      "priority": "CRITICAL|HIGH|NORMAL|LOW",
      "reason": "Neden bu model/effort",
      "scope": { "directories": [...], "filesRead": [...], "filesWrite": [...] },
      "dependencies": [],
      "goNogo": { "goCriteria": "...", "noGoCriteria": "...", "techDebtAcceptable": "..." }
    }
  ],
  "reasoning": "Plan gerekçesi"
}`;
}

// ─── parsePlannerResponse ─────────────────────────────────────────

/**
 * @internal Used only within orchestra/ — parses the AI planner response JSON.
 * Not part of the public API surface.
 */
/**
 * Strip markdown code fences from a text block and return the inner content.
 * Handles ` ```json ... ``` ` and plain ` ``` ... ``` ` wrappers.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return fence?.[1] ? fence[1].trim() : trimmed;
}

/**
 * Parse the planner CLI stdout into a PlannerResult.
 *
 * Provider-agnostic: when `adapter` is supplied and implements `parseAgentResponse`,
 * the adapter unwraps its provider-specific envelope first (Claude/Gemini/Codex differ).
 * If no adapter is given, treats stdout as raw text and code-fence-strips it.
 *
 * Returns null when stdout is empty, not valid JSON, or fails schema validation.
 *
 * @param raw      Full stdout captured from spawnSync
 * @param adapter  Provider adapter — when present, used to unwrap CLI envelopes
 */
export function parsePlannerResponse(raw: string, adapter?: ProviderAdapter): PlannerResult | null {
  try {
    // Step 1: provider-specific envelope unwrap (Claude/Gemini/Codex)
    const unwrapped = adapter?.parseAgentResponse ? adapter.parseAgentResponse(raw) : raw;

    // Step 2: strip outer code fences
    let cleaned = stripCodeFences(unwrapped);

    // Step 3: first JSON.parse — may yield wrapped envelope if adapter didn't unwrap
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Some adapter unwraps leave a string that's still wrapped in fences/quotes — retry once
      cleaned = stripCodeFences(cleaned.replace(/^"|"$/g, ''));
      parsed = JSON.parse(cleaned);
    }

    // Step 4: defensive fallback unwrap for callers that pass raw without an adapter
    // Mirrors ClaudeAdapter.parseAgentResponse so direct CLI-format stdout still parses.
    if (
      parsed !== null
      && typeof parsed === 'object'
      && (parsed as { type?: unknown }).type === 'result'
      && typeof (parsed as { result?: unknown }).result === 'string'
    ) {
      const inner = stripCodeFences((parsed as { result: string }).result);
      parsed = JSON.parse(inner);
    }

    const result = PlannerResultSchema.safeParse(parsed);
    if (!result.success) {
      debugLog('parsePlannerResponse:validation', result.error);
      return null;
    }
    return result.data as PlannerResult;
  } catch (e) {
    debugLog('parsePlannerResponse:parse', e);
    return null;
  }
}

// ─── Provider Command Extraction ──────────────────────────────────

/**
 * @internal Build planner-specific spawn args from a ProviderAdapter.
 * If the adapter implements buildPlannerCommand(), delegates entirely to it.
 * Otherwise extracts CLI binary from adapter.buildCommand() and builds
 * generic args (first token as command, standard flags).
 */
export function buildPlannerSpawnArgs(
  adapter: ProviderAdapter,
  prompt: string,
  model: ModelType,
): { command: string; args: string[] } {
  // Delegate to adapter if it provides its own planner command builder
  if (typeof adapter.buildPlannerCommand === 'function') {
    return adapter.buildPlannerCommand(prompt, model);
  }

  // Generic fallback: extract CLI binary from adapter.buildCommand()
  const shellCommand = adapter.buildCommand(model, '/dev/null');
  const firstToken = shellCommand.split(/\s+/)[0];
  if (!firstToken) {
    throw new ProviderError(`Provider "${adapter.name}" returned empty buildCommand result`, adapter.name);
  }
  // Sprint 238 İŞ5: pass the real model name (apiId, e.g. claude-opus-4-8) to the
  // brain planner CLI, not the alias — so AI planning targets the exact version
  // (no 4-6/4-8 confusion), matching the worker-spawn fix (Sprint 237). Falls back
  // to the raw model for unregistered tags (ollama) / custom CLIs.
  const apiId = modelRegistry.get(model)?.apiId ?? model;
  return {
    command: firstToken,
    args: ['-p', prompt, '--model', apiId, '--output-format', 'json'],
  };
}

/**
 * @internal Resolve the provider adapter to use for planner calls.
 * If an adapter is explicitly provided, use it. Otherwise, when a `model`
 * is given, resolve the adapter that OWNS that model (born-690: the default
 * provider and the requested model are independent axes — spawning the
 * default CLI with a foreign model name is a hard 400, e.g. `codex exec
 * --model sonnet`). Falls back to ProviderRegistry.getDefault() when the
 * model is unknown to the registry or its provider is not registered
 * (custom ollama tags keep their historical default-provider behavior).
 * Throws if no provider is available at all — callers must ensure at least
 * one provider is registered.
 */
export function resolveAdapter(adapter?: ProviderAdapter, model?: ModelType): ProviderAdapter {
  if (adapter) return adapter;
  if (model) {
    try {
      return providerRegistry.getProvider(getProviderForModel(model));
    } catch {
      // UnknownModelError or ProviderNotFoundError → historical default path.
    }
  }
  // Throws ProviderError('No providers registered') if registry is empty
  return providerRegistry.getDefault();
}

// ─── callBrainPlanner ─────────────────────────────────────────────

/**
 * Discriminated failure reason for AI planner invocation.
 *
 * - `spawn_failed`: subprocess could not start, exited non-zero, or returned empty stdout
 * - `timeout`: subprocess killed by SIGTERM after exceeding `brain_plan_timeout_ms`
 * - `parse_failed`: stdout could not be JSON-parsed or stripped of provider envelope
 * - `validation_failed`: parsed JSON failed Zod schema validation (PlannerResultSchema)
 * - `no_providers`: ProviderRegistry empty or requested provider missing
 */
export type PlannerFailureReason =
  | 'spawn_failed'
  | 'timeout'
  | 'parse_failed'
  | 'validation_failed'
  | 'no_providers';

/**
 * Discriminated union returned by `callBrainPlanner`. Replaces the legacy
 * `PlannerResult | null` shape so callers can distinguish *why* the AI planner
 * failed and surface the real reason instead of silently dropping to structured.
 *
 * See [[feedback_ai_planner_silent_fallback]].
 */
export type PlannerCallResult =
  | { ok: true; data: PlannerResult }
  | { ok: false; reason: PlannerFailureReason; message: string };

/**
 * @internal Used only within orchestra/ — invokes the AI planner subprocess and
 * returns a discriminated `PlannerCallResult`. On failure, `reason` names the
 * exact category (`spawn_failed` / `timeout` / `parse_failed` / `validation_failed`
 * / `no_providers`) and `message` carries provider/stderr/timeout detail so the
 * caller (planSprint) can surface it to the user instead of falling back silently.
 *
 * This is the canonical entry point for Sprint 224 task 224-001's honest-fallback
 * contract. The legacy `callBrainPlanner()` thin wrapper below delegates to this
 * function and collapses failure to `null` for backward compatibility with older
 * call sites (other test files that mock `callBrainPlanner` returning null).
 *
 * @param adapter  Optional ProviderAdapter. If omitted, uses ProviderRegistry.getDefault().
 *                 Returns `{ok: false, reason: 'no_providers'}` if no provider is available.
 * @param timeout  Subprocess timeout in milliseconds. Defaults to BRAIN_PLAN_TIMEOUT_MS.
 *                 Configurable via `brain_plan_timeout_ms` (sprint-planner wires it
 *                 from ResolvedConfig). Default is 900s (Sprint 184) for opus on
 *                 large zero-config prompts.
 * @param worstCombinations  Optional output from OutcomeTracker.getWorstCombinations().
 *   Injects GECMIS SONUCLAR / past results block into the AI planner prompt so the
 *   planner avoids historically poor agent+skill combinations.
 */
export function callBrainPlannerWithReason(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  model: ModelType,
  projectName: string,
  adapter?: ProviderAdapter,
  timeout?: number,
  worstCombinations?: string,
): PlannerCallResult {
  const prompt = buildPlanPrompt(context, recommendation, projectName, undefined, 'tr', worstCombinations);

  // resolveAdapter throws ProviderError when registry is empty or provider missing.
  // Surface as `no_providers` reason so the caller does not silently fall back.
  let resolved: ProviderAdapter;
  try {
    resolved = resolveAdapter(adapter, model);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: 'no_providers',
      message: `Provider registry empty or missing requested provider: ${detail}`,
    };
  }

  let cmdInfo: { command: string; args: string[] };
  try {
    cmdInfo = buildPlannerSpawnArgs(resolved, prompt, model);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: 'spawn_failed',
      message: `Could not build planner command for provider=${resolved.name}: ${detail}`,
    };
  }

  const effectiveTimeout = timeout ?? BRAIN_PLAN_TIMEOUT_MS;

  let result: SpawnSyncReturns<string>;
  try {
    result = spawnSync(cmdInfo.command, cmdInfo.args, {
      encoding: 'utf-8',
      timeout: effectiveTimeout,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: 'spawn_failed',
      message: `spawnSync threw for provider=${resolved.name}: ${detail}`,
    };
  }

  // SIGTERM signal from spawnSync indicates the process was killed at the
  // configured timeout. Surface as `timeout` so the caller can suggest
  // raising brain_plan_timeout_ms.
  if (result.signal === 'SIGTERM') {
    return {
      ok: false,
      reason: 'timeout',
      message:
        `Subscription spawn timed out after ${effectiveTimeout}ms (provider=${resolved.name}). ` +
        `Consider raising brain_plan_timeout_ms in config or passing a larger timeout.`,
    };
  }

  if (result.error) {
    return {
      ok: false,
      reason: 'spawn_failed',
      message: `spawnSync error for provider=${resolved.name}: ${result.error.message}`,
    };
  }

  if (result.status !== 0 || !result.stdout) {
    const stderr = (result.stderr ?? '').toString().slice(0, 500);
    return {
      ok: false,
      reason: 'spawn_failed',
      message:
        `provider=${resolved.name} exited with status=${result.status ?? 'null'}, ` +
        `stdout=${result.stdout ? `${result.stdout.length} bytes` : 'empty'}, stderr=${stderr}`,
    };
  }

  const parsed = parsePlannerResponse(result.stdout, resolved);
  if (!parsed) {
    const snippet = result.stdout.slice(0, 200).replace(/\n/g, ' ');
    return {
      ok: false,
      reason: 'parse_failed',
      message:
        `provider=${resolved.name} returned unparseable output (length=${result.stdout.length}): ${snippet}`,
    };
  }

  return { ok: true, data: parsed };
}

/**
 * @internal Legacy thin wrapper preserved for backward compatibility with
 * pre-Sprint-224 call sites and test mocks that expect `PlannerResult | null`.
 *
 * New code (and Sprint 224 task 224-001's honest-fallback path) MUST call
 * `callBrainPlannerWithReason` instead so failure details (`reason`, `message`)
 * surface to the user. This wrapper drops them.
 *
 * Note: when no provider is registered this wrapper throws (mirrors the original
 * behavior — see `tests/orchestra/planner.test.ts` "throws when registry is empty"),
 * because `no_providers` was originally a thrown ProviderError, not a null return.
 */
export function callBrainPlanner(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  model: ModelType,
  projectName: string,
  adapter?: ProviderAdapter,
  timeout?: number,
  worstCombinations?: string,
): PlannerResult | null {
  const result = callBrainPlannerWithReason(
    context, recommendation, model, projectName, adapter, timeout, worstCombinations,
  );
  if (result.ok) return result.data;
  if (result.reason === 'no_providers') {
    // Preserve legacy throw contract (ProviderError surfaces via thrown Error).
    throw new ProviderError(result.message, adapter?.name ?? '');
  }
  return null;
}

// ─── Zero-Config AI Planner ───────────────────────────────────────

const ZERO_CONFIG_MIN_TASKS = 3;
const ZERO_CONFIG_MAX_TASKS = 5;

/**
 * Build a prompt specifically for splitting a single natural-language description
 * into 3–5 structured tasks that the AI planner can assign to workers.
 */
export function buildZeroConfigPlanPrompt(
  description: string,
  projectName: string,
  fileTree: string[] = [],
  language: string = 'tr',
): string {
  const treeSection = fileTree.length > 0
    ? `\nFILE TREE (first ${Math.min(fileTree.length, 50)}):\n${fileTree.slice(0, 50).join('\n')}`
    : '';

  const isEn = language === 'en';

  if (isEn) {
    return `You are a software project orchestrator. A user requested a feature in natural language.
Split this request into ${ZERO_CONFIG_MIN_TASKS}-${ZERO_CONFIG_MAX_TASKS} independent, parallel-executable tasks.

PROJECT: ${projectName}
USER REQUEST: "${description}"${treeSection}

TASK SPLITTING RULES:
- Each task must be independently executable (parallel execution possible)
- Specify dependencies if any (e.g., UI depends on backend API)
- Create exactly ${ZERO_CONFIG_MIN_TASKS}-${ZERO_CONFIG_MAX_TASKS} tasks (no more, no less)
- Define scope (directories + filesWrite) for each task
- EVERY task's scope.filesWrite MUST contain at least one file path — an empty filesWrite array is invalid
- A task's "title" MUST NOT contain a comma (,) character — rephrase with "and"/a dash instead
- Write GO/NO-GO criteria for each task
- The last task MUST be an integration/test task

EXAMPLE SPLIT:
"Add login page with Google OAuth" →
1. Auth API endpoints (backend, POST /auth/login, /auth/google-callback)
2. Google OAuth integration (oauth2 client setup, token exchange)
3. Login page UI (React component, form, redirect logic)
4. Integration tests (E2E auth flow, token validation tests)

MODEL SELECTION:
- **opus**: Complex architecture, multiple modules, new patterns/abstractions
- **sonnet**: Standard implementation, single module, follows existing patterns
- **haiku**: Trivial tasks only — rename, typo fix, placeholder creation

OUTPUT FORMAT (JSON ONLY, nothing else):
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "model": "sonnet|opus|haiku",
      "effort": "low|normal|high",
      "priority": "CRITICAL|HIGH|NORMAL|LOW",
      "reason": "Why this model/effort",
      "scope": { "directories": [...], "filesRead": [...], "filesWrite": [...] },
      "dependencies": [],
      "goNogo": { "goCriteria": "...", "noGoCriteria": "...", "techDebtAcceptable": "..." }
    }
  ],
  "reasoning": "Why you split it this way"
}`;
  }

  return `Sen bir yazılım proje orkestratörüsün. Kullanıcı tek satır doğal dil ile bir özellik talep etti.
Bu talebi ${ZERO_CONFIG_MIN_TASKS}-${ZERO_CONFIG_MAX_TASKS} bağımsız, paralel çalışabilir göreve böl.

PROJE: ${projectName}
KULLANICI TALEBİ: "${description}"${treeSection}

GÖREV BÖLME KURALLARI:
- Her görev bağımsız çalışabilmeli (paralel execution mümkün olmalı)
- Bağımlılık varsa dependencies array'inde belirt (örn. UI, backend API'ye bağlıysa)
- Toplam ${ZERO_CONFIG_MIN_TASKS}-${ZERO_CONFIG_MAX_TASKS} görev oluştur (ne az ne fazla)
- Her görev için scope (directories + filesWrite) belirle
- HER görevin scope.filesWrite alanı EN AZ bir dosya yolu içermeli — boş filesWrite array'i geçersizdir
- Bir görevin "title" alanı VİRGÜL (,) karakteri İÇEREMEZ — bunun yerine "ve" bağlacı veya tire kullan
- Her görev için GO/NO-GO kriterleri yaz
- Son görev MUTLAKA entegrasyon/test görevi olsun

ÖRNEK BÖLME:
"Add login page with Google OAuth" →
1. Auth API endpoints (backend, POST /auth/login, /auth/google-callback)
2. Google OAuth integration (oauth2 client setup, token exchange)
3. Login page UI (React component, form, redirect logic)
4. Integration tests (E2E auth flow, token validation tests)

${buildAdrConstraintsPlannerBlock()}
MODEL SEÇİM KRİTERLERİ:
- **opus**: Karmaşık mimari, çoklu modül, yeni pattern/abstraction
- **sonnet**: Standart implementasyon, tek modül, mevcut pattern takip
- **haiku**: Sadece trivial işler — rename, typo fix, placeholder oluşturma

ÇIKTI FORMAT (SADECE JSON, başka bir şey yazma):
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "model": "sonnet|opus|haiku",
      "effort": "low|normal|high",
      "priority": "CRITICAL|HIGH|NORMAL|LOW",
      "reason": "Neden bu model/effort",
      "scope": { "directories": [...], "filesRead": [...], "filesWrite": [...] },
      "dependencies": [],
      "goNogo": { "goCriteria": "...", "noGoCriteria": "...", "techDebtAcceptable": "..." }
    }
  ],
  "reasoning": "Neden bu şekilde böldün"
}`;
}

/**
 * Call the AI planner with a zero-config (single natural-language) description.
 * The AI splits the description into 3–5 structured tasks.
 *
 * Falls back to null if the AI call fails; callers should fall back to
 * structured (single-task) mode in that case.
 *
 * @param adapter  Optional ProviderAdapter. If omitted, uses ProviderRegistry.getDefault().
 *                 Throws if no provider is available (no silent fallback).
 */
export function callZeroConfigPlanner(
  description: string,
  model: ModelType,
  projectName: string,
  fileTree: string[] = [],
  adapter?: ProviderAdapter,
  timeout?: number,
): PlannerResult | null {
  const prompt = buildZeroConfigPlanPrompt(description, projectName, fileTree);
  const resolved = resolveAdapter(adapter, model);
  const { command, args } = buildPlannerSpawnArgs(resolved, prompt, model);

  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    timeout: timeout ?? BRAIN_PLAN_TIMEOUT_MS,
  });

  if (result.status !== 0 || !result.stdout) return null;
  return parsePlannerResponse(result.stdout, resolved);
}

// ─── Bug Y2: Plan-time Ground-Truth Audit (Sprint 166) ───────────────
//
// Plans coming out of the AI planner may carry stale numeric claims
// (e.g. "16 agents" when the codebase only ships 15). The runtime Auditor
// catches mismatches via verifyDocSyncGroundTruth, but failing fast at
// plan-time avoids spawning workers that would then emit boundary violations.

export interface PlannerGroundTruthIssue {
  taskIndex: number;
  taskTitle: string;
  metric: string;
  claimed: number;
  measured: number;
  raw: string;
}

const PLANNER_AGENTS_CLAIM_RE = /\b(\d{1,3})\s+(?:built-?in\s+)?agents?\b/gi;

function plannerMeasureAgentsCount(projectRoot: string): number {
  const agentsDir = join(projectRoot, 'src/core/builtins/agents');
  if (!existsSync(agentsDir)) return -1;
  try {
    return readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .length;
  } catch {
    return -1;
  }
}

function plannerLoadOverrides(projectRoot: string): Array<{
  metric: string;
  expected: number;
  until_sprint: number;
}> {
  const path = join(projectRoot, '.deckent', 'ground-truth-overrides.json');
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as {
      overrides?: Array<{ metric: string; expected: number; until_sprint: number }>;
    };
    return parsed?.overrides ?? [];
  } catch {
    return [];
  }
}

function plannerSprintNumber(sprintId: string | undefined | null): number {
  if (!sprintId) return Number.NaN;
  const m = /sprint-(\d+)/i.exec(sprintId);
  if (!m || !m[1]) return Number.NaN;
  return Number.parseInt(m[1], 10);
}

/**
 * Audit a planner result for doc-sync ground-truth mismatches across all
 * task descriptions. Returns the list of issues found (empty when no claim
 * disagrees with the filesystem measurement, or every divergent claim is
 * covered by an active whitelist override).
 *
 * Never throws — measurement failures yield an empty result (fail-safe).
 */
export function auditPlanGroundTruth(
  projectRoot: string,
  plan: PlannerResult,
  currentSprintId: string,
): PlannerGroundTruthIssue[] {
  if (!plan?.tasks?.length) return [];
  const agentsMeasured = plannerMeasureAgentsCount(projectRoot);
  if (agentsMeasured < 0) return [];
  const overrides = plannerLoadOverrides(projectRoot);
  const currentSprint = plannerSprintNumber(currentSprintId);

  const issues: PlannerGroundTruthIssue[] = [];
  plan.tasks.forEach((task, idx) => {
    const description = task.description ?? '';
    if (!description) return;
    let m: RegExpExecArray | null;
    PLANNER_AGENTS_CLAIM_RE.lastIndex = 0;
    while ((m = PLANNER_AGENTS_CLAIM_RE.exec(description)) !== null) {
      const numStr = m[1];
      if (!numStr) continue;
      const claimed = Number.parseInt(numStr, 10);
      if (!Number.isFinite(claimed)) continue;
      if (claimed === agentsMeasured) continue;
      const overrideActive = overrides.some((o) => {
        if (o.metric !== 'agents_count') return false;
        if (o.expected !== claimed) return false;
        if (Number.isNaN(currentSprint)) return true;
        return currentSprint < o.until_sprint;
      });
      if (overrideActive) continue;
      issues.push({
        taskIndex: idx,
        taskTitle: task.title,
        metric: 'agents_count',
        claimed,
        measured: agentsMeasured,
        raw: m[0],
      });
    }
  });
  return issues;
}

/**
 * Build a minimal structured fallback plan from a zero-config description.
 * Used when the AI planner is unavailable or returns an invalid response.
 * Produces a single task that wraps the full description.
 */
export function buildZeroConfigFallbackPlan(description: string): PlannerResult {
  return {
    tasks: [
      {
        title: description.slice(0, 80),
        description,
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'Zero-config fallback: single task wrapping the full description',
        scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: {
          goCriteria: 'Feature implemented and tests pass',
          noGoCriteria: 'Build fails or tests do not pass',
          techDebtAcceptable: 'Minor style issues acceptable',
        },
      },
    ],
    reasoning: `Zero-config fallback plan for: ${description}`,
  };
}

// ─── AI-Plan Dependency Normalization (323-031) ──────────────────────────────
//
// The AI planner emits each `task.dependencies` entry as free text — usually the
// *title* of the depended-on task, because it cannot know the final `NNN-NNN`
// slot id at plan time. `buildDependencyGraph` (dependency-scheduler.ts) matches
// strictly by task id, so a title ref is silently dropped and the dependency
// pipeline is never wired (cleanup-last never runs, just-wired code can be
// deleted). This pass rewrites every AI task's `dependencies` into concrete
// same-sprint ids AFTER the tasks have been created (so each carries its real
// id + title), and reports anything it could not resolve instead of dropping it
// silently.

/** A dependency ref that failed to resolve to any sibling task (and was dropped). */
export interface DroppedDependency {
  /** Id of the task whose dependency could not be resolved. */
  taskId: string;
  /** The raw ref string the planner emitted (title or id-shaped). */
  ref: string;
  /**
   * True when `ref` looked like a concrete plan-slot id (`NNN-NNN`) — i.e. it
   * referenced a task id that does not exist in the sprint, rather than a title
   * the planner failed to spell exactly.
   */
  looksLikePlanSlotId: boolean;
}

/** Outcome of `normalizePlannerDependencies`. */
export interface DependencyNormalizationResult {
  /** Count of dependency refs resolved to a concrete same-sprint id. */
  resolvedCount: number;
  /** Refs that could not be resolved — dropped, but never silently (logged + returned). */
  dropped: DroppedDependency[];
}

/**
 * Normalize AI-planner task dependencies into concrete same-sprint task IDs.
 *
 * Rewrites each task's `dependencies` array IN PLACE:
 *   - a ref already a slot id (`323-007`) that names a real sibling → kept
 *   - a ref that is a sibling task title → resolved to that task's id
 *   - multiple deps are supported and de-duplicated (first occurrence wins)
 *   - a self-reference is dropped (a task cannot depend on itself) without being
 *     reported as unresolvable
 *   - an unresolvable ref is dropped AND reported (returned in `dropped` +
 *     `debugLog`) — never silently lost
 *
 * Resolution reuses `resolveDependencyRef` (task-builder), which already handles
 * slot-id exact match and substring-trap-safe title-token matching.
 *
 * Behaviour-preserving for plans that already use correct slot ids: every ref
 * resolves to itself and `dropped` is empty.
 *
 * @param tasks AI-created tasks (mutated: `dependencies` rewritten to ids).
 *   Only `id`, `title`, and `dependencies` are read/written.
 * @returns resolved count + the list of dropped refs for operator visibility.
 */
export function normalizePlannerDependencies(
  tasks: Array<{ id: string; title: string; dependencies?: string[] }>,
): DependencyNormalizationResult {
  const dropped: DroppedDependency[] = [];
  let resolvedCount = 0;

  for (const task of tasks) {
    const rawDeps = task.dependencies;
    if (!rawDeps || rawDeps.length === 0) continue;

    const resolved: string[] = [];
    const seen = new Set<string>();

    for (const ref of rawDeps) {
      const id = resolveDependencyRef(ref, tasks);

      if (id && id !== task.id) {
        if (!seen.has(id)) {
          seen.add(id);
          resolved.push(id);
          resolvedCount++;
        }
        continue;
      }

      if (id === task.id) {
        // Self-reference — drop without flagging as unresolvable.
        debugLog('planner:normalizeDeps', `Task ${task.id}: self-dependency "${ref}" dropped`);
        continue;
      }

      // Unresolvable — drop, but make it visible (never silent).
      const looksLikePlanSlotId = isPlanSlotId(ref);
      dropped.push({ taskId: task.id, ref, looksLikePlanSlotId });
      debugLog(
        'planner:normalizeDeps',
        `Task ${task.id}: unresolvable dependency "${ref}" dropped (` +
        `${looksLikePlanSlotId ? 'id-shaped — no such task in sprint' : 'title not found among sprint tasks'})`,
      );
    }

    task.dependencies = resolved;
  }

  return { resolvedCount, dropped };
}

// ─── SCOPE-W2 → G1b (sprint-399): the plan-time scope-sufficiency check now lives in
// scope-satisfiability.ts (lintScopeSatisfiability), wired into evaluatePromptGate.
// The original validateGoCriteriaScope helper here was dead since birth (its only
// caller was its own test) and was removed with that wiring — see the verification
// doc .analysis/prompt-contract-verification-2026-07-10.md (N3).

// ─── Plan-time Scope Preflight (423-003: born-653 phantom-strip + born-661 expansion) ─
//
// A single in-place pass over finalized tasks (mirrors normalizePlannerDependencies:
// mutate + report, never silent). Two concerns:
//   - born-653: strip phantom scope entries a naive derivation produced from the
//     declared Files (file-path-as-directory, substring-derived phantom paths). Requires
//     the task's DECLARED Files (its true write intent) — supplied via `declaredFilesOf`,
//     because by this stage scope.filesWrite already carries the derived extras.
//   - born-661: expand write scope with the test files that import a task's source
//     modules (capped ≤25) so a worker can update the tests its change breaks in-scope.
//
// The full-dependency-graph vision (born-661) is intentionally NOT built here — this is a
// bounded import-mention scan. Live wiring (a single call in sprint-planner.ts just before
// evaluatePromptGate) is the remaining follow-up; sprint-planner.ts is outside this task's
// write authority. See the .result docImpact note.

/** Minimal task read-shape for the scope preflight (id + mutable scope). */
interface PreflightTask {
  id: string;
  scope?: TaskScope;
}

export interface ScopePreflightOptions {
  /**
   * The candidate test-file corpus (typically tests/** from the tracked-file list, with
   * optional content for import-matching). When absent, the born-661 expansion is skipped.
   */
  testFiles?: readonly AffectedTestFile[];
  /**
   * Returns a task's DECLARED Files (original write intent) for born-653 phantom grounding.
   * When absent, phantom-strip is skipped (a post-derivation filesWrite cannot self-ground
   * without the original Files — the fix's true home is the derivation in task-builder).
   */
  declaredFilesOf?: (task: PreflightTask) => readonly string[];
  /** Max affected tests added per task (defaults to AFFECTED_TEST_CAP = 25). */
  cap?: number;
}

/** Per-task outcome of the scope preflight. */
export interface ScopePreflightEntry {
  taskId: string;
  addedTests: string[];
  removedPhantoms: string[];
  /** True when the affected-test match count exceeded the cap and was truncated. */
  capped: boolean;
}

/** Outcome of `preflightTaskScopes`: per-task detail + human-readable report lines. */
export interface ScopePreflightResult {
  entries: ScopePreflightEntry[];
  /** One line per task that changed — surfaced to the operator (never silent). */
  reportLines: string[];
}

/**
 * Run the plan-time scope preflight over `tasks`, mutating each task's `scope` IN PLACE
 * (born-653 phantom-strip then born-661 affected-test expansion). Behaviour-preserving
 * for a task whose scope is already clean and has no affected tests: nothing changes and
 * it contributes no report line. Both passes are individually opt-in via `options`, so a
 * caller with only a tracked-test corpus (no declared-Files map) still gets 661.
 */
export function preflightTaskScopes(
  tasks: PreflightTask[],
  options: ScopePreflightOptions = {},
): ScopePreflightResult {
  const entries: ScopePreflightEntry[] = [];
  const reportLines: string[] = [];

  for (const task of tasks) {
    if (!task.scope) continue;
    let scope = task.scope;
    const removedPhantoms: string[] = [];

    // born-653: strip phantoms against the task's declared write intent.
    if (options.declaredFilesOf) {
      const stripped = stripPhantomScope(scope, options.declaredFilesOf(task));
      scope = stripped.scope;
      removedPhantoms.push(...stripped.removed);
    }

    // born-661: expand with affected tests.
    let addedTests: string[] = [];
    let capped = false;
    if (options.testFiles && options.testFiles.length > 0) {
      const expanded = expandScopeWithAffectedTests(scope, options.testFiles, { cap: options.cap });
      scope = expanded.scope;
      addedTests = expanded.scan.added;
      capped = expanded.scan.capped;
      if (addedTests.length > 0) reportLines.push(`[${task.id}] ${expanded.scan.report}`);
    }

    if (removedPhantoms.length > 0) {
      reportLines.push(`[${task.id}] phantom-scope-strip: -${removedPhantoms.length} (${removedPhantoms.join(', ')})`);
    }

    task.scope = scope;
    if (addedTests.length > 0 || removedPhantoms.length > 0) {
      entries.push({ taskId: task.id, addedTests, removedPhantoms, capped });
    }
  }

  return { entries, reportLines };
}
