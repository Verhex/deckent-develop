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
 * Task type string union — matches task intent classification keys.
 * Used in TASK_TYPE_ADR_PRESETS for guaranteed ADR inclusion per type.
 */
export type TaskType =
  | 'core-dev'
  | 'docs'
  | 'test'
  | 'cli'
  | 'mcp'
  | 'security'
  | 'observability'
  | 'orchestra'
  | 'provider'
  | 'dashboard';

/**
 * Preset ADR IDs guaranteed to appear in the top-N for each task type.
 * These are the most architecturally relevant ADRs for each domain.
 * Preset match provides +0.3 score bonus.
 *
 * Sprint 146 — Task 146-006
 */
export const TASK_TYPE_ADR_PRESETS: Record<TaskType, string[]> = {
  'core-dev':      ['adr-001', 'adr-002', 'adr-008', 'adr-015'],
  'docs':          ['adr-029', 'adr-030', 'adr-032'],
  'test':          ['adr-003', 'adr-019'],
  'cli':           ['adr-010', 'adr-011', 'adr-012', 'adr-022-v2'],
  'mcp':           ['adr-022-v2', 'adr-017'],
  'security':      ['adr-006', 'adr-037', 'adr-038'],
  'observability': ['adr-035'],
  'orchestra':     ['adr-008', 'adr-015', 'adr-024', 'adr-026'],
  'provider':      ['adr-017', 'adr-023', 'adr-027'],
  'dashboard':     ['adr-001', 'adr-002'],
};

// ─── Intent → ADR Preference ────────────────────────────────────────

/** Task type inferred from scope + description → preferred ADR IDs */
const INTENT_ADR_PREFERENCES: Record<string, string[]> = {
  'core-dev':      ['adr-001', 'adr-002', 'adr-004', 'adr-008', 'adr-015', 'adr-023'],
  'orchestra':     ['adr-008', 'adr-015', 'adr-024', 'adr-026', 'adr-028'],
  'cli':           ['adr-010', 'adr-011', 'adr-012', 'adr-022-v2'],
  'mcp':           ['adr-017', 'adr-022-v2'],
  'docs':          ['adr-029', 'adr-030', 'adr-031', 'adr-032'],
  'test':          ['adr-003', 'adr-019'],
  'security':      ['adr-006', 'adr-014', 'adr-037', 'adr-038', 'adr-039'],
  'observability': ['adr-035'],
  'provider':      ['adr-017', 'adr-023', 'adr-027'],
  'dashboard':     ['adr-001', 'adr-002'],
};

// ─── Intent Classification ──────────────────────────────────────────

const INTENT_KEYWORDS: Record<string, string[]> = {
  'core-dev':      ['config', 'types', 'memory', 'store', 'model', 'registry', 'normalize'],
  'orchestra':     ['sprint', 'brain', 'planner', 'evaluator', 'router', 'routing', 'spawn', 'tmux'],
  'cli':           ['cli', 'command', 'commander', 'register', 'readline'],
  'mcp':           ['mcp', 'tool', 'resource', 'stdio', 'transport'],
  'docs':          ['documentation', 'doc', 'readme', 'changelog', 'template', 'managed-docs', '.md'],
  'test':          ['test', 'coverage', 'vitest', 'spec', 'mock', 'assertion'],
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
    ? { score: 0.4, reason: 'scope-path-match' }
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
  const presets = TASK_TYPE_ADR_PRESETS[taskType as TaskType];
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

// ─── Main API ───────────────────────────────────────────────────────

/**
 * Select the most relevant ADRs for a task.
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
  task: Pick<Task, 'scope' | 'title' | 'description'>,
  allAdrs: MemoryEntryV2[],
  topN: number = 3,
  currentSprintNum: number = 146,
): AdrRelevance[] {
  if (!allAdrs || allAdrs.length === 0) return [];

  const intent = classifyTaskIntent(task);
  const taskText = `${task.title ?? ''} ${task.description ?? ''}`;
  const taskDirs = task.scope?.directories ?? [];

  const scored: AdrRelevance[] = allAdrs
    .filter(adr => adr.type === 'adr' && adr.status === 'accepted')
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

  return scored.slice(0, topN);
}

/**
 * Build a markdown prompt section from ranked ADRs.
 *
 * @param adrs - Ranked ADR relevance results (from selectRelevantAdrs)
 * @param mode - 'full' embeds full ADR content, 'summary' embeds 3-5 line summaries
 * @param allAdrs - Original ADR entries (needed to get content/summary)
 * @returns Formatted markdown string for prompt injection
 */
export function buildAdrPromptSection(
  adrs: AdrRelevance[],
  mode: 'full' | 'summary',
  allAdrs?: MemoryEntryV2[],
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
      const content = entry?.content ?? `(content not available for ${adr.adrId})`;
      sections.push(`## ${adr.adrId}: ${adr.title}\n\n**Status:** accepted\n\n${content}`);
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
