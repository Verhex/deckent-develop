// ─── RoutingEngineV3 — LLM CONTENT PRODUCTION (Slice-2, batch) ───────────────
// Hand-coded (Brain 2026-07-15). Brainstorm decision-1 in its purest form: the
// LLM enriches the REQUIREMENT (work-type + summary + semantic tags) in ONE
// batch call per plan; matching itself stays deterministic (proficiency math
// over the LLM-produced work-type) and the verifier's structural cross-check
// gates every LLM claim (CONTENT_STRUCTURAL_CONFLICT → Brain, decision-5).
//
// Zero-hardcode: no provider/model names here — the completion callable is
// INJECTED by the caller (planner owns provider resolution). LLM failure or
// unparseable output degrades per-task to the structural producer, visibly
// (provenance stays honest: 'structural').

import { z } from 'zod';
import type { RequirementContent, RequirementPositional } from './requirement-vector.js';
import { produceContentStructural } from './requirement-vector.js';
import type { Task } from '../task-types.js';
import { WORK_TYPE_IDS, getWorkTypeDef, isWorkType, parseSubtype } from './vocabulary-builtin.js';
import { debugLog } from '../utils.js';

// ─── Injected completion ─────────────────────────────────────────────────────

/** One-shot LLM completion; the caller owns provider/model/timeout resolution. */
export type CompleteFn = (prompt: string) => Promise<string>;

// ─── Response schema ─────────────────────────────────────────────────────────

const contentEntrySchema = z
  .object({
    taskId: z.string().min(1),
    workType: z.string().min(1),
    subtype: z.string().min(1).nullable().optional(),
    summary: z.string().min(1),
    semanticTags: z.array(z.string()).max(8),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const contentBatchSchema = z.array(contentEntrySchema);

export interface ContentBatchTask {
  id: string;
  title: string;
  description: string;
  /** Structural evidence shown to the model (deliverable ratios, domains). */
  positional: RequirementPositional;
}

// ─── Prompt (EN — model surface) ─────────────────────────────────────────────

export function buildContentBatchPrompt(tasks: readonly ContentBatchTask[]): string {
  const workTypeLines = WORK_TYPE_IDS.map((wt) => {
    const def = getWorkTypeDef(wt);
    return `- ${wt}: ${def?.contract ?? ''}`;
  }).join('\n');

  const taskBlocks = tasks
    .map((t) => {
      const deliverables = t.positional.deliverables
        .map((d) => `${d.type} ${(d.ratio * 100).toFixed(0)}%`)
        .join(', ') || 'none declared';
      const domains = t.positional.domains.map((d) => d.id).join(', ') || 'none';
      return [
        `### ${t.id}`,
        `Title: ${t.title}`,
        `Description: ${t.description}`,
        `Structural evidence — deliverables: [${deliverables}] · domains: [${domains}] · needsWrite: ${t.positional.needsWrite}`,
      ].join('\n');
    })
    .join('\n\n');

  return [
    'You classify software tasks into a CLOSED work-type vocabulary and produce a semantic summary for each.',
    '',
    'WORK TYPES (closed set — you MUST pick exactly one per task):',
    workTypeLines,
    '',
    'Rules:',
    '- The work-type describes what KIND of work the task is, judged from what it actually changes — never from incidental keywords. An agent name or the word "test" appearing in the text is NOT evidence.',
    '- Test-writing is part of build/fix/refactor work, never a work-type of its own.',
    '- The structural evidence lines are ground truth about WHERE the task writes; your work-type must be consistent with them (a task writing only docs is not "build").',
    '- Optional subtype: "parent:subtype" free-text refinement (e.g. "review:compliance"). Use null when none.',
    '- summary: ONE sentence, what the work accomplishes.',
    '- semanticTags: up to 8 lowercase topic tags (technologies, subsystems, concerns).',
    '- confidence: your own 0-1 calibration for the work-type choice.',
    '',
    'TASKS:',
    '',
    taskBlocks,
    '',
    'Respond with ONLY a JSON array (no prose, no code fences):',
    '[{"taskId": "...", "workType": "...", "subtype": null, "summary": "...", "semanticTags": ["..."], "confidence": 0.0}]',
  ].join('\n');
}

// ─── Parse (fail-soft per task) ──────────────────────────────────────────────

export interface ContentBatchParseResult {
  /** taskId → validated LLM content entry. */
  entries: Map<string, z.infer<typeof contentEntrySchema>>;
  /** Entries dropped with a reason (unknown taskId, invalid workType, schema fail). */
  dropped: Array<{ taskId: string | null; reason: string }>;
}

export function parseContentBatchResponse(
  raw: string,
  knownTaskIds: ReadonlySet<string>,
): ContentBatchParseResult {
  const result: ContentBatchParseResult = { entries: new Map(), dropped: [] };

  // Tolerate accidental fences/prose around the array — extract the outermost array.
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) {
    result.dropped.push({ taskId: null, reason: 'no JSON array in response' });
    return result;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    result.dropped.push({ taskId: null, reason: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}` });
    return result;
  }

  const validated = contentBatchSchema.safeParse(parsed);
  const items: unknown[] = validated.success ? validated.data : Array.isArray(parsed) ? parsed : [];

  for (const item of items) {
    const entry = contentEntrySchema.safeParse(item);
    if (!entry.success) {
      const maybeId = typeof (item as Record<string, unknown>)?.['taskId'] === 'string'
        ? String((item as Record<string, unknown>)['taskId'])
        : null;
      result.dropped.push({ taskId: maybeId, reason: 'entry schema invalid' });
      continue;
    }
    const e = entry.data;
    if (!knownTaskIds.has(e.taskId)) {
      result.dropped.push({ taskId: e.taskId, reason: 'unknown taskId' });
      continue;
    }
    const parent = e.workType.includes(':') ? e.workType.split(':')[0]! : e.workType;
    if (!isWorkType(parent)) {
      result.dropped.push({ taskId: e.taskId, reason: `invalid workType '${e.workType}'` });
      continue;
    }
    result.entries.set(e.taskId, e);
  }

  return result;
}

// ─── Batch producer ──────────────────────────────────────────────────────────

export interface ContentBatchOutcome {
  /** taskId → RequirementContent (provenance 'llm' or the structural fallback). */
  contents: Map<string, RequirementContent>;
  /** Tasks that fell back to the structural producer, with the reason. */
  fallbacks: Array<{ taskId: string; reason: string }>;
}

/**
 * Produce the content axis for a whole plan in ONE completion (retry-once on
 * a fully unparseable response). Any per-task gap degrades to the structural
 * producer — visible in `fallbacks`, honest in `provenance`.
 */
export async function produceContentBatchLLM(
  tasks: ReadonlyArray<{ task: Task; positional: RequirementPositional }>,
  complete: CompleteFn,
  structuralConfidence: number,
): Promise<ContentBatchOutcome> {
  const outcome: ContentBatchOutcome = { contents: new Map(), fallbacks: [] };
  const batch: ContentBatchTask[] = tasks.map(({ task, positional }) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    positional,
  }));
  const knownIds = new Set(batch.map((b) => b.id));
  const prompt = buildContentBatchPrompt(batch);

  let parsed: ContentBatchParseResult = { entries: new Map(), dropped: [] };
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await complete(prompt);
    } catch (err) {
      debugLog('routing:content-llm', `completion failed (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    parsed = parseContentBatchResponse(raw, knownIds);
    if (parsed.entries.size > 0) break;
  }

  for (const { task, positional } of tasks) {
    const entry = parsed.entries.get(task.id);
    if (!entry) {
      outcome.contents.set(task.id, produceContentStructural(task, positional, structuralConfidence));
      outcome.fallbacks.push({
        taskId: task.id,
        reason: parsed.dropped.find((d) => d.taskId === task.id)?.reason ?? 'no LLM entry for task',
      });
      continue;
    }
    // Requirement schema carries the BARE parent in workType; the subtype
    // refinement rides its own field (rollup form everywhere else).
    outcome.contents.set(task.id, {
      workType: parseSubtype(entry.workType).parent,
      subtype: entry.subtype ?? null,
      summary: entry.summary,
      semanticTags: entry.semanticTags,
      provenance: 'llm',
      calibratedConfidence: entry.confidence,
    });
  }

  return outcome;
}
