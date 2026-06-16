import type { BacklogEntry } from './backlog-types.js';
import type { LlmComplete } from './goal-planner-types.js';

/** A planned task/sprint with no description yet needs JIT detail. Capability
 *  (capabilityTarget is the spec) and process (executor pending) do not. */
export function needsJitDetail(entry: BacklogEntry): boolean {
  if (!entry.planned) return false;
  if (entry.kind !== 'task' && entry.kind !== 'sprint') return false;
  return !entry.spec.description;
}

export function buildJitDetailPrompt(entry: BacklogEntry): string {
  const kindLine = entry.kind === 'sprint'
    ? 'Produce a DIRECTIVES block (one or more `## Task N:` sections with Model/Skills/Files/Scope + a Description and a Kanıt/Smoke line each).'
    : 'Produce a single worker task description: which files to change, the exact change, a Smoke/Kanıt verification line, and the constraint "do NOT run git commands; only edit files + write your .result".';
  return `You are detailing ONE autonomous backlog item just before execution. ${kindLine}
Output ONLY the detail text (no JSON, no preamble).

Title: ${entry.title}
Scope dir: ${entry.spec.scopeDir ?? '.'}
Summary: ${entry.summary ?? entry.title}`;
}

/** Phase 2: generate the full worker detail for a planned task/sprint and return
 *  a NEW entry with spec.description filled (caller persists it). */
export async function generateItemDetail(entry: BacklogEntry, complete: LlmComplete): Promise<BacklogEntry> {
  const description = (await complete(buildJitDetailPrompt(entry))).trim();
  return { ...entry, spec: { ...entry.spec, description } };
}
