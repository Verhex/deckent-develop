// ─── Node Builtins ─────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
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
import { debugLog } from '../core/utils.js';

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
  return {
    command: firstToken,
    args: ['-p', prompt, '--model', model, '--output-format', 'json'],
  };
}

/**
 * @internal Resolve the provider adapter to use for planner calls.
 * If an adapter is explicitly provided, use it. Otherwise uses
 * ProviderRegistry.getDefault(). Throws if no provider is available —
 * callers must ensure at least one provider is registered.
 */
export function resolveAdapter(adapter?: ProviderAdapter): ProviderAdapter {
  if (adapter) return adapter;
  // Throws ProviderError('No providers registered') if registry is empty
  return providerRegistry.getDefault();
}

// ─── callBrainPlanner ─────────────────────────────────────────────

/**
 * @internal Used only within orchestra/ — invokes the AI planner subprocess.
 * Not part of the public API surface.
 *
 * @param adapter  Optional ProviderAdapter. If omitted, uses ProviderRegistry.getDefault().
 *                 Throws if no provider is available (no silent fallback).
 * @param worstCombinations  Optional output from OutcomeTracker.getWorstCombinations().
 *   Injects GECMIS SONUCLAR / past results block into the AI planner prompt so the
 *   planner avoids historically poor agent+skill combinations.
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
  const prompt = buildPlanPrompt(context, recommendation, projectName, undefined, 'tr', worstCombinations);
  const resolved = resolveAdapter(adapter);
  const { command, args } = buildPlannerSpawnArgs(resolved, prompt, model);

  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    timeout: timeout ?? BRAIN_PLAN_TIMEOUT_MS,
  });

  if (result.status !== 0 || !result.stdout) return null;
  return parsePlannerResponse(result.stdout, resolved);
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
- Her görev için GO/NO-GO kriterleri yaz
- Son görev MUTLAKA entegrasyon/test görevi olsun

ÖRNEK BÖLME:
"Add login page with Google OAuth" →
1. Auth API endpoints (backend, POST /auth/login, /auth/google-callback)
2. Google OAuth integration (oauth2 client setup, token exchange)
3. Login page UI (React component, form, redirect logic)
4. Integration tests (E2E auth flow, token validation tests)

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
  const resolved = resolveAdapter(adapter);
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
