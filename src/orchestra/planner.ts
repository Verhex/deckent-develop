// ─── Node Builtins ─────────────────────────────────────────────────
import { spawnSync } from 'node:child_process';
import { z } from 'zod';

// ─── Core (types only — NO brain.ts imports) ──────────────────────
import type {
  BrainContext, SprintSizeRecommendation, PlannerResult, ModelType,
} from '../core/types.js';
import { BRAIN_PLAN_TIMEOUT_MS, BRAIN_PLAN_MAX_CONTEXT_LINES } from '../core/constants.js';

// ─── Zod Schemas ──────────────────────────────────────────────────
const PlannerTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  model: z.enum(['opus', 'sonnet', 'haiku']),
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

export function buildPlanPrompt(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  projectName: string,
): string {
  const sections: string[] = [];

  sections.push(`Project: ${projectName}`);

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

// ─── callBrainPlanner ─────────────────────────────────────────────

export function callBrainPlanner(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  model: ModelType,
  projectName: string,
): PlannerResult | null {
  const prompt = buildPlanPrompt(context, recommendation, projectName);
  const result = spawnSync('claude', ['-p', prompt, '--model', model, '--output-format', 'json'], {
    encoding: 'utf-8',
    timeout: BRAIN_PLAN_TIMEOUT_MS,
  });

  if (result.status !== 0 || !result.stdout) return null;
  return parsePlannerResponse(result.stdout);
}
