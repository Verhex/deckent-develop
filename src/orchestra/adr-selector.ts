/**
 * ADR Relevance Scoring Engine
 *
 * Scores ADRs against a task based on scope path match, keyword match,
 * intent preference, and age penalty. Returns ranked ADRs for prompt injection.
 *
 * Sprint 146 — Task 146-003
 */

import type { Task } from '../core/task-types.js';
import type { MemoryEntryV2 } from '../core/memory-types.js';
import { taskKindToAdrDomain, type AdrTaskType } from '../core/work-model.js';

// ─── Public Types ────────────────────────────────────────────────────

export interface AdrRelevance {
  adrId: string;
  title: string;
  score: number;
  matchReasons: string[];
}

// ─── Scope → ADR Path Keywords ───────────────────────────────────────

/** Map well-known directory prefixes to ADR-relevant keywords */
const SCOPE_PATH_KEYWORDS: Record<string, string[]> = {
  'src/orchestra/': ['orchestra', 'sprint', 'brain', 'routing', 'planner', 'evaluator'],
  'src/core/':      ['core', 'config', 'types', 'memory', 'provider', 'model'],
  'src/cli/':       ['cli', 'command', 'commander', 'readline', 'prompt'],
  'src/mcp/':       ['mcp', 'tool', 'resource', 'stdio'],
  'src/agents/':    ['agent', 'worker', 'spawn', 'heartbeat'],
  'src/providers/': ['provider', 'adapter', 'claude', 'codex', 'gemini'],
  'src/api/':       ['api', 'http', 'sse', 'server'],
  'src/dashboard/': ['dashboard', 'react', 'vite', 'tailwind', 'frontend'],
  'tests/':         ['test', 'vitest', 'coverage', 'mock'],
  'docs/':          ['documentation', 'docs', 'managed-docs', 'template'],
  'scripts/':       ['script', 'audit', 'ci'],
};

// ─── Task Type ADR Preset Matrix ─────────────────────────────────────

/**
 * Task type string union — matches task intent classification keys. Used in
 * TASK_TYPE_ADR_PRESETS for guaranteed ADR inclusion per type. Backward-compat
 * alias of the canonical {@link AdrTaskType} (single-sourced in
 * `core/work-model.ts`, WM-2); kept as a named re-export so existing importers
 * keep resolving. New code references `AdrTaskType`.
 */
export type TaskType = AdrTaskType;

/**
 * Preset ADR IDs guaranteed to appear in the top-N for each task type.
 * These are the most architecturally relevant ADRs for each domain.
 * Preset match provides +0.3 score bonus.
 *
 * Sprint 146 — Task 146-006
 */
// ADR-TAXONOMY (2026-06-30): remapped from the retired numeric IDs to the ADR-G/D
// taxonomy via the crosswalk (docs/adr/*.md `**Crosswalk:**`). The old numeric IDs
// (adr-001…) no longer exist in the DB — comparing them against `adr-g/d-NNN` was a
// dead no-op (every intent-preference score = 0), so selection fell back to keyword
// matching only. Mapping preserves each domain's original architectural intent.
export const TASK_TYPE_ADR_PRESETS: Record<AdrTaskType, string[]> = {
  'core-dev':      ['adr-d-001', 'adr-d-004', 'adr-g-006'],
  'docs':          ['adr-g-015'],
  // adr-d-002 (State-Path & Test Hermeticity — absorbed old adr-003/087) is THE
  // hermeticity ADR (tmpdir, no spawnSync, CI-fresh); adr-g-009 = eval/surface.
  'test':          ['adr-d-002', 'adr-g-009'],
  'cli':           ['adr-d-005', 'adr-d-006', 'adr-g-011'],
  'mcp':           ['adr-g-011', 'adr-g-008'],
  // security = adr-g-017 (Multi-Project Isolation / per-project boundary), adr-g-020
  // (Authority/Roles/RBAC), adr-g-002 (absorbed old adr-006).
  'security':      ['adr-g-017', 'adr-g-020', 'adr-g-002'],
  'observability': ['adr-g-018'],
  'orchestra':     ['adr-d-004', 'adr-g-006', 'adr-d-006'],
  'provider':      ['adr-g-008', 'adr-g-012', 'adr-g-014'],
  'dashboard':     ['adr-d-001'],
};

// ─── Intent → ADR Preference ────────────────────────────────────────

/**
 * Task intent → preferred ADR IDs. Remapped to the ADR-G/D taxonomy (2026-06-30)
 * via the crosswalk — the retired numeric IDs never matched the DB's `adr-g/d-NNN`
 * (dead scoring). Mapping preserves each intent's original architectural intent.
 */
const INTENT_ADR_PREFERENCES: Record<string, string[]> = {
  'core-dev':      ['adr-d-001', 'adr-g-001', 'adr-d-004', 'adr-g-006', 'adr-g-012'],
  'orchestra':     ['adr-d-004', 'adr-g-006', 'adr-d-006'],
  'cli':           ['adr-d-005', 'adr-d-006', 'adr-g-011'],
  'mcp':           ['adr-g-008', 'adr-g-011'],
  'docs':          ['adr-g-015'],
  'test':          ['adr-d-002', 'adr-g-009'],
  'security':      ['adr-g-017', 'adr-g-020', 'adr-g-002', 'adr-g-005', 'adr-g-021'],
  'observability': ['adr-g-018'],
  'provider':      ['adr-g-008', 'adr-g-012', 'adr-g-014'],
  'dashboard':     ['adr-d-001'],
};

// ─── Intent Classification ──────────────────────────────────────────

const INTENT_KEYWORDS: Record<string, string[]> = {
  'core-dev':      ['config', 'types', 'memory', 'store', 'model', 'registry', 'normalize'],
  'orchestra':     ['sprint', 'brain', 'planner', 'evaluator', 'router', 'routing', 'spawn', 'tmux'],
  'cli':           ['cli', 'command', 'commander', 'register', 'readline'],
  'mcp':           ['mcp', 'tool', 'resource', 'stdio', 'transport'],
  'docs':          ['documentation', 'doc', 'readme', 'changelog', 'template', 'managed-docs', '.md'],
  'test':          ['test', 'coverage', 'vitest', 'spec', 'mock', 'assertion', 'hermetic', 'tmpdir'],
  'security':      ['security', 'auth', 'vulnerability', 'owasp', 'rbac', 'permission'],
  'observability': ['observe', 'monitor', 'event', 'stream', 'heartbeat', 'alert'],
  'provider':      ['provider', 'adapter', 'claude', 'codex', 'gemini', 'fallback'],
  'dashboard':     ['dashboard', 'react', 'vite', 'tailwind', 'component', 'frontend', 'ui'],
};

/**
 * Classify task intent from scope directories + title + description.
 * Returns the best-matching intent key or 'core-dev' as fallback.
 */
export function classifyTaskIntent(task: Pick<Task, 'scope' | 'title' | 'description'>): string {
  const text = `${task.title ?? ''} ${task.description ?? ''} ${(task.scope?.directories ?? []).join(' ')}`.toLowerCase();

  let bestIntent = 'core-dev';
  let bestScore = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score++;
    }
    // Scope directory prefix match gives strong signal
    for (const dir of task.scope?.directories ?? []) {
      if (intent === 'cli' && dir.startsWith('src/cli')) score += 2;
      if (intent === 'mcp' && dir.startsWith('src/mcp')) score += 2;
      if (intent === 'docs' && (dir.startsWith('docs/') || dir === './')) score += 2;
      if (intent === 'test' && dir.startsWith('tests/')) score += 2;
      if (intent === 'orchestra' && dir.startsWith('src/orchestra')) score += 2;
      if (intent === 'core-dev' && dir.startsWith('src/core')) score += 2;
      if (intent === 'dashboard' && dir.startsWith('src/dashboard')) score += 2;
      if (intent === 'security' && dir.startsWith('src/core')) score += 1;
      if (intent === 'provider' && dir.startsWith('src/providers')) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  return bestIntent;
}

// ─── Scoring Functions ──────────────────────────────────────────────

/**
 * matchReason emitted by {@link scoreScopeMatch} when an ADR's text references
 * the task's scope. PROMPT-W1 (a) reuses this as the per-ADR scope-intersection
 * signal for scope-gated rendering, so the literal lives in one place to keep
 * the producer (scoreScopeMatch) and the consumer (buildAdrPromptSection) in lockstep.
 */
const SCOPE_MATCH_REASON = 'scope-path-match';

/**
 * Score based on scope path match.
 * If ADR content mentions directories or keywords related to task scope, +0.4.
 */
function scoreScopeMatch(adr: MemoryEntryV2, taskDirs: string[]): { score: number; reason: string | null } {
  if (taskDirs.length === 0) return { score: 0, reason: null };

  const adrText = `${adr.title} ${adr.content}`.toLowerCase();
  let matched = false;

  for (const dir of taskDirs) {
    // Direct path mention in ADR
    if (adrText.includes(dir.replace(/\/$/, '').toLowerCase())) {
      matched = true;
      break;
    }
    // Check scope path keywords
    for (const [prefix, keywords] of Object.entries(SCOPE_PATH_KEYWORDS)) {
      if (dir.startsWith(prefix)) {
        for (const kw of keywords) {
          if (adrText.includes(kw)) {
            matched = true;
            break;
          }
        }
      }
      if (matched) break;
    }
    if (matched) break;
  }

  return matched
    ? { score: 0.4, reason: SCOPE_MATCH_REASON }
    : { score: 0, reason: null };
}

/**
 * Score based on keyword overlap between task text and ADR text.
 * Extracts significant words (>3 chars) from task title+description,
 * checks how many appear in ADR title+content.
 */
function scoreKeywordMatch(adr: MemoryEntryV2, taskText: string): { score: number; reason: string | null } {
  const taskWords = taskText
    .toLowerCase()
    .split(/[\s/\-_.,;:()[\]{}]+/)
    .filter(w => w.length > 3);

  if (taskWords.length === 0) return { score: 0, reason: null };

  const uniqueWords = [...new Set(taskWords)];
  const adrText = `${adr.id} ${adr.title} ${adr.content}`.toLowerCase();

  let matchCount = 0;
  for (const word of uniqueWords) {
    if (adrText.includes(word)) matchCount++;
  }

  const ratio = matchCount / Math.max(uniqueWords.length, 1);

  // Require at least 15% keyword overlap for a match
  if (ratio >= 0.15) {
    return { score: 0.3 * Math.min(ratio * 3, 1), reason: 'keyword-match' };
  }
  return { score: 0, reason: null };
}

/**
 * Score based on task intent → ADR preference mapping.
 */
function scoreIntentPreference(adr: MemoryEntryV2, intent: string): { score: number; reason: string | null } {
  const preferred = INTENT_ADR_PREFERENCES[intent];
  if (!preferred) return { score: 0, reason: null };

  const adrId = adr.id.toLowerCase();
  if (preferred.some(p => p.toLowerCase() === adrId)) {
    return { score: 0.2, reason: 'intent-preference' };
  }
  return { score: 0, reason: null };
}

/**
 * Preset bonus: if the ADR is in the preset list for the detected task type → +0.3.
 * Ensures architecturally critical ADRs always appear in prompt injection.
 */
function scorePresetBonus(adr: MemoryEntryV2, taskType: string): { score: number; reason: string | null } {
  const presets = TASK_TYPE_ADR_PRESETS[taskType as AdrTaskType];
  if (!presets) return { score: 0, reason: null };

  const adrId = adr.id.toLowerCase();
  if (presets.some(p => p.toLowerCase() === adrId)) {
    return { score: 0.3, reason: 'preset-match' };
  }
  return { score: 0, reason: null };
}

/**
 * Age penalty: older ADRs get a small negative score.
 * ADRs with sprint_num === 0 (no sprint) get no penalty.
 * Max penalty: -0.1 for ADRs older than 50 sprints.
 */
function scoreAgePenalty(adr: MemoryEntryV2, currentSprintNum: number): { score: number; reason: string | null } {
  if (adr.sprint_num <= 0 || currentSprintNum <= 0) return { score: 0, reason: null };

  const age = currentSprintNum - adr.sprint_num;
  if (age <= 0) return { score: 0, reason: null };

  // Linear penalty: -0.002 per sprint, capped at -0.1
  const penalty = -Math.min(age * 0.002, 0.1);
  return { score: penalty, reason: 'age-penalty' };
}

// ─── Explicit ADR Reference Extraction ─────────────────────────────

/**
 * Normalize an ADR id to canonical form: lowercase "adr-NNN" with 3-digit zero-padding.
 * Handles "ADR-12", "adr-012", "ADR012" → "adr-012".
 */
function normalizeAdrId(raw: string): string {
  // ADR-TAXONOMY: canonical form is `adr-<class>-NNN` (class g|d) for the current
  // taxonomy, or legacy `adr-NNN` when no class letter is present. 3-digit padded.
  const m = /adr-?([gd])?-?0*(\d+)/i.exec(raw);
  if (!m) return raw.toLowerCase();
  const cls = m[1] ? `${m[1].toLowerCase()}-` : '';
  return `adr-${cls}${m[2]!.padStart(3, '0')}`;
}

/**
 * Extract explicit ADR references from task text.
 * Pattern: /ADR-?(\d{1,3})/gi — matches "ADR-012", "ADR012", "adr-12" etc.
 * Returns deduplicated canonical ids like ["adr-012", "adr-037"].
 */
export function extractExplicitAdrRefs(text: string): string[] {
  // ADR-TAXONOMY: match the current taxonomy `ADR-G-025` / `adr-d-2` (class letter)
  // AND the legacy `ADR-025` (no class). This is what makes a task's explicit
  // `Governing: ADR-G-025` pin actually force-include that ADR — previously the
  // class letter broke the digit match, so every new-format pin silently no-op'd.
  const pattern = /ADR-?([GD])?-?(\d{1,3})/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const cls = m[1] ? `${m[1].toLowerCase()}-` : '';
    seen.add(normalizeAdrId(`adr-${cls}${m[2]!}`));
  }
  return [...seen];
}

// ─── Main API ───────────────────────────────────────────────────────

/**
 * Select the most relevant ADRs for a task.
 *
 * Pre-phase: any ADR explicitly referenced in task title/description (e.g. "ADR-012")
 * is forced into the result at the front, regardless of relevance score.
 * Remaining slots are filled by the scoring engine.
 * Design choice: total output = max(topN, explicitRefCount) — explicit refs never truncated.
 *
 * Scoring: scope path match (+0.4), keyword match (+0.3), intent preference (+0.2), age penalty (max -0.1).
 *
 * @param task - The task to score ADRs against
 * @param allAdrs - All ADR entries from memory store
 * @param topN - Maximum number of ADRs to return (default: 3)
 * @param currentSprintNum - Current sprint number for age penalty (default: 146)
 * @returns Ranked list of relevant ADRs with scores and match reasons
 */
export function selectRelevantAdrs(
  task: Pick<Task, 'scope' | 'title' | 'description' | 'type'>,
  allAdrs: MemoryEntryV2[],
  topN: number = 3,
  currentSprintNum: number = 146,
): AdrRelevance[] {
  if (!allAdrs || allAdrs.length === 0) return [];

  // Canonical path (WM-2c): task.type (TaskKind) set → derive ADR domain from SSOT adapter.
  // Legacy fallback: classifyTaskIntent, backward-compatible when task.type absent.
  const intent = task.type != null ? taskKindToAdrDomain(task.type) : classifyTaskIntent(task);
  const taskText = `${task.title ?? ''} ${task.description ?? ''}`;
  const taskDirs = task.scope?.directories ?? [];

  // Build a normalized-id lookup map for the pool
  const adrPool = allAdrs.filter(adr => adr.type === 'adr' && adr.status === 'accepted');
  const poolByNormId = new Map<string, MemoryEntryV2>();
  for (const adr of adrPool) {
    poolByNormId.set(normalizeAdrId(adr.id), adr);
  }

  // Pre-phase: extract explicit ADR-NNN references from task text and force-include them
  const explicitRefs = extractExplicitAdrRefs(taskText);
  const forcedIds = new Set<string>();
  const forcedEntries: AdrRelevance[] = [];

  for (const ref of explicitRefs) {
    const entry = poolByNormId.get(ref);
    if (!entry) continue; // ADR-999 or any non-existent ref → silently skip

    const normId = normalizeAdrId(entry.id);
    if (forcedIds.has(normId)) continue; // deduplicate
    forcedIds.add(normId);

    // Score normally so matchReasons are informative, but always include regardless
    const reasons: string[] = ['explicit-ref'];
    let totalScore = 1.0; // base score ensures explicit refs sort to the front if needed

    const scope = scoreScopeMatch(entry, taskDirs);
    if (scope.reason) { totalScore += scope.score; reasons.push(scope.reason); }

    const keyword = scoreKeywordMatch(entry, taskText);
    if (keyword.reason) { totalScore += keyword.score; reasons.push(keyword.reason); }

    const intentPref = scoreIntentPreference(entry, intent);
    if (intentPref.reason) { totalScore += intentPref.score; reasons.push(intentPref.reason); }

    const preset = scorePresetBonus(entry, intent);
    if (preset.reason) { totalScore += preset.score; reasons.push(preset.reason); }

    const age = scoreAgePenalty(entry, currentSprintNum);
    if (age.reason) { totalScore += age.score; reasons.push(age.reason); }

    forcedEntries.push({
      adrId: entry.id,
      title: entry.title,
      score: Math.round(totalScore * 1000) / 1000,
      matchReasons: reasons,
    });
  }

  // Remaining slots for scored selection (exclude already-forced ADRs)
  const remainingSlots = Math.max(0, topN - forcedEntries.length);

  const scored: AdrRelevance[] = adrPool
    .filter(adr => !forcedIds.has(normalizeAdrId(adr.id)))
    .map(adr => {
      const reasons: string[] = [];
      let totalScore = 0;

      const scope = scoreScopeMatch(adr, taskDirs);
      if (scope.reason) { totalScore += scope.score; reasons.push(scope.reason); }

      const keyword = scoreKeywordMatch(adr, taskText);
      if (keyword.reason) { totalScore += keyword.score; reasons.push(keyword.reason); }

      const intentPref = scoreIntentPreference(adr, intent);
      if (intentPref.reason) { totalScore += intentPref.score; reasons.push(intentPref.reason); }

      const preset = scorePresetBonus(adr, intent);
      if (preset.reason) { totalScore += preset.score; reasons.push(preset.reason); }

      const age = scoreAgePenalty(adr, currentSprintNum);
      if (age.reason) { totalScore += age.score; reasons.push(age.reason); }

      return {
        adrId: adr.id,
        title: adr.title,
        score: Math.round(totalScore * 1000) / 1000,
        matchReasons: reasons,
      };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Explicit refs at front, then scored results fill remaining slots
  return [...forcedEntries, ...scored.slice(0, remainingSlots)];
}

// ─── Operative Extract ───────────────────────────────────────────────

const OPERATIVE_START = '<!-- worker-operative-start -->';
const OPERATIVE_END = '<!-- worker-operative-end -->';

/**
 * Extract the operative section from ADR content when markers are present.
 * Returns null if no valid marker pair found (caller falls back to full content).
 */
/**
 * PCOMP-W4 (tiered injection): classify a selected ADR's injection tier.
 * - 'governing' — explicitly referenced in the task text (`Governing: ADR-G-025`,
 *   or any ADR-id mention): the task's contract ADR → full operative body.
 * - 'constraint' — selected by scoring only (scope/keyword/intent): a background
 *   constraint → condensed render (Active-constraint line + Contract section +
 *   pointer). Full-body injection of marginal matches was measured at ~40-50%
 *   dead weight per worker prompt (sprint-348-005 analysis).
 */
export function classifyInjectionTier(adr: AdrRelevance): 'governing' | 'constraint' {
  return adr.matchReasons.includes('explicit-ref') ? 'governing' : 'constraint';
}

/**
 * PCOMP-W4: extract the `## Contract` section (through the next `## ` header).
 * ADR-D house style keeps the immutable core there — for a Tier-2 (constraint)
 * ADR it is the one section a worker must still honor verbatim.
 */
export function extractContractSection(content: string): string | null {
  const m = /^##\s+Contract\b.*$/im.exec(content);
  if (!m) return null;
  const after = content.slice(m.index + m[0].length);
  const nextHdr = /^##\s+/m.exec(after);
  const body = (nextHdr ? after.slice(0, nextHdr.index) : after).trim();
  return body || null;
}

export function extractOperativeSection(content: string): string | null {
  const startIdx = content.indexOf(OPERATIVE_START);
  const endIdx = content.indexOf(OPERATIVE_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return content.slice(startIdx + OPERATIVE_START.length, endIdx).trim();
  }
  // ADR-TAXONOMY fallback: the current ADR format carries no operative-marker
  // comments — the `## Decision (Today)` section IS the operative rule set. Return
  // it (through to the next `## ` header) so a worker sees the decision, not the
  // full Context + Roadmap + Consequences + References body (the token bloat).
  const decMatch = /^##\s+Decision\b.*$/im.exec(content);
  if (decMatch) {
    const after = content.slice(decMatch.index + decMatch[0].length);
    const nextHdr = /^##\s+/m.exec(after);
    const body = (nextHdr ? after.slice(0, nextHdr.index) : after).trim();
    if (body) return body;
  }
  return null;
}

// ─── Prompt Section Builder ──────────────────────────────────────────

/**
 * Build a markdown prompt section from ranked ADRs.
 *
 * @param adrs - Ranked ADR relevance results (from selectRelevantAdrs)
 * @param mode - 'full' embeds full ADR content, 'summary' embeds 3-5 line summaries
 * @param allAdrs - Original ADR entries (needed to get content/summary)
 * @param adrRender - 'full' (default): full content; 'operative': emit only the
 *   `<!-- worker-operative-start --> / <!-- worker-operative-end -->` section when
 *   present, with a footnote. ADRs without markers fall back to full content.
 * @param scopeGated - PROMPT-W1 (a). When true (code-development tasks), an ADR
 *   that does NOT intersect the task scope (no `scope-path-match` reason) is
 *   rendered condensed — `Active constraint` head + summary + `[full: …]` pointer
 *   — instead of its full amendment-log body. Scope-intersecting ADRs still print
 *   the full body. Defaults to false → byte-for-byte legacy rendering.
 * @returns Formatted markdown string for prompt injection
 */
export function buildAdrPromptSection(
  adrs: AdrRelevance[],
  mode: 'full' | 'summary',
  allAdrs?: MemoryEntryV2[],
  adrRender: 'full' | 'operative' = 'full',
  scopeGated: boolean = false,
): string {
  if (adrs.length === 0) return '';

  const adrMap = new Map<string, MemoryEntryV2>();
  if (allAdrs) {
    for (const a of allAdrs) adrMap.set(a.id, a);
  }

  const sections: string[] = [];

  for (const adr of adrs) {
    const entry = adrMap.get(adr.adrId);

    if (mode === 'full') {
      const rawContent = entry?.content ?? `(content not available for ${adr.adrId})`;

      // PCOMP-W4 (tiered injection): in operative render, only the GOVERNING ADR
      // (explicit-ref — the task's contract) gets a full operative body. Every
      // scoring-selected ADR is a background constraint: render the Active-
      // constraint line + the Contract section (if any) + a pointer. This is what
      // removes the measured ~40-50% dead weight (full D-004/G-006 bodies on a
      // CRASH-REDACT task) while keeping the binding rule text verbatim.
      if (adrRender === 'operative' && classifyInjectionTier(adr) === 'constraint') {
        const distilled = distillActiveConstraint(rawContent, entry?.summary);
        const constraintHead = distilled ? `**Active constraint:** ${distilled}\n\n` : '';
        const contract = extractContractSection(rawContent);
        const contractBlock = contract ? `### Contract (binding)\n\n${contract}\n\n` : '';
        sections.push(
          `## ${adr.adrId}: ${adr.title}\n\n${constraintHead}${contractBlock}[background constraint — full text: .brain/memory.db ${adr.adrId}]`,
        );
        continue;
      }

      // PROMPT-W1 (a): scope-gating. For code-development tasks, an ADR whose
      // text does NOT reference the task scope (no scope-path-match) is a
      // background constraint — the worker needs its operative rule, not the
      // full amendment-log history. Emit a condensed head + summary + pointer
      // and skip the body. Scope-intersecting ADRs fall through to full render.
      const scopeIntersect = adr.matchReasons.includes(SCOPE_MATCH_REASON);
      if (scopeGated && !scopeIntersect) {
        const distilled = distillActiveConstraint(rawContent, entry?.summary);
        const constraintHead = distilled ? `**Active constraint:** ${distilled}\n\n` : '';
        const summaryText = entry?.summary?.trim()
          ? entry.summary.trim()
          : entry?.content
            ? extractSummary(entry.content)
            : '';
        const summaryBlock = summaryText ? `${summaryText}\n\n` : '';
        sections.push(
          `## ${adr.adrId}: ${adr.title}\n\n${constraintHead}${summaryBlock}[full: .brain/memory.db ${adr.adrId}]`,
        );
        continue;
      }

      let content = rawContent;
      if (adrRender === 'operative') {
        const operative = extractOperativeSection(rawContent);
        if (operative !== null) {
          content = `${operative}\n\n[full text: .brain/memory.db ${adr.adrId}]`;
        }
      }
      // WP-20: surface the operative constraint as a 1-line head ABOVE the full
      // body. The body (amendment history included) stays contiguous below it, so
      // there is zero content loss (completeness rule) — the distillation only
      // fixes "middle-loss" by putting the actionable line where attention is high.
      const distilled = distillActiveConstraint(rawContent, entry?.summary);
      const constraintHead = distilled ? `**Active constraint:** ${distilled}\n\n` : '';
      // Dedupe: outer header carries adrId+title only; content body already has status/date.
      sections.push(`## ${adr.adrId}: ${adr.title}\n\n${constraintHead}${content}`);
    } else {
      // Summary mode: use entry.summary if available, otherwise extract first 3-5 meaningful lines
      let summaryText: string;
      if (entry?.summary) {
        summaryText = entry.summary;
      } else if (entry?.content) {
        summaryText = extractSummary(entry.content);
      } else {
        summaryText = `(summary not available for ${adr.adrId})`;
      }
      sections.push(`- **${adr.adrId}: ${adr.title}** — ${summaryText}`);
    }
  }

  return sections.join('\n\n---\n\n');
}

/** Max chars of the WP-20 distilled "Active constraint" head line. */
const ACTIVE_CONSTRAINT_CAP = 240;

/**
 * Distill an ADR's operative constraint into a single line (WP-20).
 *
 * Priority: (1) an explicit `entry.summary`, else (2) the `**Decision:**`
 * statement (the operative core of an MADR ADR), else (3) the first meaningful
 * non-header / non-metadata content line. Collapses whitespace to one line and
 * caps the length so the head stays scannable. Returns '' when nothing usable is
 * found (caller then omits the head — no stranded label).
 *
 * Deterministic (no Date/random) so the prompt-determinism guard stays green.
 */
export function distillActiveConstraint(content: string, summary?: string | null): string {
  const cap = (s: string): string => {
    const one = s.replace(/\s+/g, ' ').trim();
    return one.length > ACTIVE_CONSTRAINT_CAP ? one.slice(0, ACTIVE_CONSTRAINT_CAP - 1).trimEnd() + '…' : one;
  };

  if (summary && summary.trim()) return cap(summary);

  const lines = content.split('\n');
  // ADR-TAXONOMY 1. The `**Enforcement:** today=<rule> → tomorrow=…` header line is
  // the operative constraint in the current taxonomy. Take the `today=` clause.
  for (const raw of lines) {
    const m = /\*\*Enforcement:\*\*\s*(.+)$/i.exec(raw.trim());
    if (!m || !m[1]) continue;
    const t = m[1].replace(/^today\s*=\s*/i, '').split(/→\s*tomorrow/i)[0]!.trim();
    if (t) return cap(t);
  }
  // 2. The Decision statement (`## Decision (Today)` or `**Decision:**`) — same-line
  //    text, else the next prose/list line.
  for (let i = 0; i < lines.length; i++) {
    const m = /^#*\s*\**\s*Decision\b[^:*]*\**\s*:?\s*(.*)$/i.exec(lines[i]!.trim());
    if (!m) continue;
    let text = m[1]!.replace(/^\**\s*/, '').replace(/^\(today\)\s*/i, '').trim();
    if (!text) {
      for (let j = i + 1; j < lines.length; j++) {
        const nxt = lines[j]!.trim();
        if (nxt && !nxt.startsWith('#') && !nxt.startsWith('---') && !nxt.startsWith('```')) { text = nxt; break; }
      }
    }
    if (text) return cap(text);
  }
  // 3. First meaningful content line (skip headers, rules, tables, quotes, code
  //    fences, and ALL metadata header lines — new taxonomy + legacy).
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l.startsWith('#') || l.startsWith('---') || l.startsWith('|') || l.startsWith('>') || l.startsWith('```')) continue;
    if (/^\**\s*(status|date|accepted|class|scope|immutable|source|enforcement|crosswalk|absorbs|supersedes)\b/i.test(l)) continue;
    const s = l.replace(/^\**\s*/, '').replace(/\s*\**$/, '');
    if (s) return cap(s);
  }
  return '';
}

/**
 * Extract a 3-5 line summary from ADR content.
 * Prefers Context + Decision paragraphs. Falls back to first non-empty lines.
 */
function extractSummary(content: string): string {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('|'));

  // Try to find "Context:" or "Decision:" sections
  const contextIdx = lines.findIndex(l => l.toLowerCase().startsWith('**context'));
  const decisionIdx = lines.findIndex(l => l.toLowerCase().startsWith('**decision'));

  const summary: string[] = [];

  if (contextIdx >= 0 && contextIdx + 1 < lines.length) {
    summary.push(lines[contextIdx + 1]!);
  }
  if (decisionIdx >= 0 && decisionIdx + 1 < lines.length) {
    summary.push(lines[decisionIdx + 1]!);
  }

  // If we found context/decision lines, return them
  if (summary.length > 0) {
    return summary.slice(0, 3).join(' ');
  }

  // Fallback: first 3 non-empty content lines
  return lines.slice(0, 3).join(' ');
}
