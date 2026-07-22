import {
  PlannedItemSchema,
  type PlannedItem,
  type PlannedItemKind,
  type LlmComplete,
} from './goal-planner-types.js';
import type { BacklogEntry, BacklogTrigger } from './backlog-types.js';

export interface PlanGoalInput {
  goal: string;
  /** Optional seed lines from an artifact-ref (extractArtifactSeeds). */
  seeds?: string[];
  /** Compact project context (e.g. .brain/exports/summary.md). */
  context?: string;
  /** Cap on returned items (default 30). */
  maxItems?: number;
  /** Default per-item policy when the model does not upgrade it (e.g. 'approval-required'). */
  defaultPolicy?: string;
  /** Runtime-admitted kinds, injected by a concrete execution surface. */
  allowedKinds?: readonly PlannedItemKind[];
  complete: LlmComplete;
}

const DEFAULT_MAX = 30;

/** System+task prompt instructing the model to emit `{ items: PlannedItem[] }`. */
export function buildGoalPlanPrompt(input: Omit<PlanGoalInput, 'complete'>): string {
  const seeds = input.seeds && input.seeds.length > 0
    ? `\n\nSeed items (open checklist lines from the referenced artifact — group/refine, assign kind):\n${input.seeds.map((s) => `- ${s}`).join('\n')}`
    : '';
  const ctx = input.context ? `\n\nProject context:\n${input.context}` : '';
  const policyLine = input.defaultPolicy
    ? `\nDefault policy for items is "${input.defaultPolicy}" unless a rule above upgrades it (e.g. destructive → approval-required).`
    : '';
  const admittedKindsLine = input.allowedKinds && input.allowedKinds.length > 0
    ? `\nRuntime-admitted kinds for this plan: ${input.allowedKinds.join(', ')}. Emit ONLY these kinds; split larger work into admitted items instead of selecting an unavailable runner.`
    : '';
  return `You are the Deckent autonomous planner. Decompose the GOAL into a LIGHTWEIGHT backlog — titles + kind + scope only, NO implementation detail (detail is generated later, just in time).

Output STRICT JSON: { "items": PlannedItem[] }. Each PlannedItem:
{ "id": kebab-slug, "title": short, "kind": "task"|"sprint"|"capability"|"process",
  "scopeDir": repo-relative dir (e.g. "src/api/"), "summary": one line WHAT,
  "policy": "auto"|"approval-required"|"risk-tagged",
  "trigger": "one-off" | {"recurring":"<cron>"} | {"reactive":"<detector>"},
  "fanOut"?: {"over": string, "concurrency": number},
  "capabilityTarget"?: {"capability": dotted-verb, "connector"?: string, "args"?: object} }

Rules: single-file/tight change → task; multi-file/multi-module feature → sprint;
non-code connector op (db.query/erp.read/mail.send/http.get) → capability;
multi-step workflow/DAG → process; "continuously …" → recurring cron;
"N agents over X" → fanOut.concurrency=N; destructive/irreversible → approval-required.${policyLine}${admittedKindsLine}
At most ${input.maxItems ?? DEFAULT_MAX} items. Output ONLY the JSON, no prose.

GOAL: ${input.goal}${seeds}${ctx}`;
}

/** Strip code fences and a leading non-JSON preamble, then JSON.parse. */
function stripToJson(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  return i >= 0 && j > i ? s.slice(i, j + 1) : s;
}

/** Parse the model output into validated, de-duplicated PlannedItems. Invalid
 *  items are dropped (never throws). */
export function parsePlannedItems(raw: string): PlannedItem[] {
  let parsed: unknown;
  try { parsed = JSON.parse(stripToJson(raw)); } catch { return []; }
  // Provider-envelope tolerance: a Claude CLI `--output-format json` envelope wraps
  // the model text in a `result` string. When the top level has no `items` array but
  // a string `result`, parse that inner text instead (it holds the fenced {items:[…]}).
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as { items?: unknown; result?: unknown };
    if (!Array.isArray(obj.items) && typeof obj.result === 'string') {
      try { parsed = JSON.parse(stripToJson(obj.result)); } catch { return []; }
    }
  }
  const arr = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: PlannedItem[] = [];
  for (const candidate of arr) {
    const r = PlannedItemSchema.safeParse(candidate);
    if (!r.success) continue;
    if (seen.has(r.data.id)) continue;
    seen.add(r.data.id);
    out.push(r.data);
  }
  return out;
}

/** Phase 1: decompose a goal into validated PlannedItems (capped to maxItems). */
export async function planGoal(input: PlanGoalInput): Promise<PlannedItem[]> {
  const max = input.maxItems ?? DEFAULT_MAX;
  const raw = await input.complete(buildGoalPlanPrompt(input));
  return parsePlannedItems(raw).slice(0, max);
}

function toTrigger(t: PlannedItem['trigger']): BacklogTrigger {
  if (t === 'one-off') return { type: 'one-off' };
  if ('recurring' in t) return { type: 'recurring', cron: t.recurring };
  return { type: 'reactive', detector: t.reactive };
}

/** Map a PlannedItem to a pending, `planned: true` BacklogEntry (no description —
 *  that is generated JIT at dispatch). */
export function plannedItemToBacklogEntry(item: PlannedItem): BacklogEntry {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    spec: {
      scopeDir: item.scopeDir,
      ...(item.capabilityTarget ? { capabilityTarget: item.capabilityTarget } : {}),
    },
    policy: item.policy,
    trigger: toTrigger(item.trigger),
    status: 'pending',
    planned: true,
    summary: item.summary,
    ...(item.fanOut ? { fanOut: item.fanOut } : {}),
    lastRun: null,
    lastResult: null,
  };
}
