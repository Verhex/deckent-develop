// ─── Node Builtins ─────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { z } from 'zod';

// ─── Core (types only — NO brain.ts imports) ──────────────────────
import type {
  BrainContext, SprintSizeRecommendation, PlannerResult, ModelType,
} from '../core/types.js';
import { ALL_MODELS } from '../core/types.js';
import { BRAIN_PLAN_TIMEOUT_MS, BRAIN_PLAN_MAX_CONTEXT_LINES } from '../core/constants.js';
import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry, ProviderError } from '../core/provider.js';

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

// ─── buildPlanPrompt ──────────────────────────────────────────────

/**
 * @internal Used only within orchestra/ — builds the AI planner prompt.
 * Not part of the public API surface.
 */
export function buildPlanPrompt(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  projectName: string,
  zeroConfigDescription?: string,
): string {
  const sections: string[] = [];

  sections.push(`Project: ${projectName}`);

  if (zeroConfigDescription) {
    sections.push(
      `ZERO-CONFIG MODE:\nKullanıcı tek satır doğal dil ile sprint başlattı: "${zeroConfigDescription}"\n` +
      `Bu açıklamayı 3-5 bağımsız göreve böl. Her görev kendi başına tamamlanabilmeli.\n` +
      `Örnek: "Add login page with Google OAuth" → 1) Auth API endpoints, 2) Google OAuth integration, 3) Login page UI, 4) Tests`,
    );
  }

  if (context.directives) {
    sections.push(`DIRECTIVES:\n${context.directives}`);
  }
  if (context.memory) {
    sections.push(`MEMORY:\n${context.memory}`);
  }
  if (context.retro) {
    sections.push(`RETRO:\n${context.retro}`);
  }

  const criticalDebt = context.debt.filter(d => d.priority === 'CRITICAL' && !d.resolved);
  if (criticalDebt.length > 0) {
    sections.push(`CRITICAL DEBT:\n${criticalDebt.map(d => `- ${d.id}: ${d.description}`).join('\n')}`);
  }

  if (context.patterns) {
    sections.push(`PATTERNS:\n${context.patterns}`);
  }
  if (context.decisions) {
    sections.push(`DECISIONS:\n${context.decisions}`);
  }
  if (context.projectIdentity) {
    sections.push(`PROJECT IDENTITY:\n${context.projectIdentity}`);
  }

  const fileTree = context.projectState.fileTree.slice(0, 100);
  if (fileTree.length > 0) {
    sections.push(`FILE TREE (first ${fileTree.length}):\n${fileTree.join('\n')}`);
  }

  // Truncate total context
  let contextBlock = sections.join('\n\n');
  const contextLines = contextBlock.split('\n');
  if (contextLines.length > BRAIN_PLAN_MAX_CONTEXT_LINES) {
    contextBlock = contextLines.slice(0, BRAIN_PLAN_MAX_CONTEXT_LINES).join('\n');
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
${contextBlock}

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
export function parsePlannerResponse(raw: string): PlannerResult | null {
  try {
    // Strip code fences if present
    let cleaned = raw.trim();
    const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (fenceMatch?.[1]) {
      cleaned = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(cleaned) as unknown;
    const result = PlannerResultSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data as PlannerResult;
  } catch {
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
 */
export function callBrainPlanner(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  model: ModelType,
  projectName: string,
  adapter?: ProviderAdapter,
): PlannerResult | null {
  const prompt = buildPlanPrompt(context, recommendation, projectName);
  const resolved = resolveAdapter(adapter);
  const { command, args } = buildPlannerSpawnArgs(resolved, prompt, model);

  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    timeout: BRAIN_PLAN_TIMEOUT_MS,
  });

  if (result.status !== 0 || !result.stdout) return null;
  return parsePlannerResponse(result.stdout);
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
): string {
  const treeSection = fileTree.length > 0
    ? `\nFILE TREE (first ${Math.min(fileTree.length, 50)}):\n${fileTree.slice(0, 50).join('\n')}`
    : '';

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
): PlannerResult | null {
  const prompt = buildZeroConfigPlanPrompt(description, projectName, fileTree);
  const resolved = resolveAdapter(adapter);
  const { command, args } = buildPlannerSpawnArgs(resolved, prompt, model);

  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    timeout: BRAIN_PLAN_TIMEOUT_MS,
  });

  if (result.status !== 0 || !result.stdout) return null;
  return parsePlannerResponse(result.stdout);
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
