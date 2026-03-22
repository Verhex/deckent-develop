// ─── Brain Context Enrichment ───────────────────────────────────────────────
// Functions to enrich BrainContext with stack info, agent stats, skill stats,
// and sprint history for improved planning decisions.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BrainContext } from '../core/types.js';
import type { ProjectStack, SkillDefinition } from '../core/skill-types.js';
import type { AgentDefinition } from '../core/agent-types.js';
import { BRAIN_DIR, SPRINTS_DIR } from '../core/constants.js';

// ═══ Task 23: Stack Context ═══════════════════════════════════════════════

/**
 * Enrich BrainContext with ProjectStack info from cache.
 */
export function enrichContextWithStack(context: BrainContext, projectRoot: string): BrainContext {
  const stackPath = join(projectRoot, '.deckent', 'stack.json');
  let stackLine = '';
  try {
    if (existsSync(stackPath)) {
      const raw = readFileSync(stackPath, 'utf-8');
      const stack = JSON.parse(raw) as ProjectStack;
      stackLine = formatStackContext(stack);
    }
  } catch {
    // non-fatal
  }

  return {
    ...context,
    directives: stackLine
      ? `${context.directives}\n\n## Project Stack\n${stackLine}`
      : context.directives,
  };
}

/**
 * Format ProjectStack as a single-line summary.
 * "Language: TypeScript | Framework: React | Test: Vitest | Build: tsc"
 */
export function formatStackContext(stack: ProjectStack): string {
  const parts: string[] = [];
  if (stack.language) parts.push(`Language: ${stack.language}`);
  if (stack.framework) parts.push(`Framework: ${stack.framework}`);
  if (stack.testFramework) parts.push(`Test: ${stack.testFramework}`);
  if (stack.buildTool) parts.push(`Build: ${stack.buildTool}`);
  if (parts.length === 0) return 'Unknown stack';
  return parts.join(' | ');
}

// ═══ Task 24: Agent Stats ═════════════════════════════════════════════════

/**
 * Enrich BrainContext with agent performance statistics.
 */
export function enrichContextWithAgentStats(context: BrainContext, agents: AgentDefinition[]): BrainContext {
  if (!agents || agents.length === 0) return context;
  const table = formatAgentStats(agents);
  return {
    ...context,
    directives: `${context.directives}\n\n## Agent Pool Stats\n${table}`,
  };
}

/**
 * Format agent statistics as a markdown table.
 */
export function formatAgentStats(agents: AgentDefinition[]): string {
  if (agents.length === 0) return 'No agents available.';

  const lines: string[] = [
    '| Agent | Uses | Success Rate | Avg Coverage | Model |',
    '|-------|------|-------------|-------------|-------|',
  ];
  for (const agent of agents) {
    const sr = (agent.stats.successRate * 100).toFixed(0);
    lines.push(
      `| ${agent.name} | ${agent.stats.totalUses} | ${sr}% | ${agent.stats.avgCoverage}% | ${agent.preferredModel} |`,
    );
  }
  return lines.join('\n');
}

// ═══ Task 25: Skill Stats ═════════════════════════════════════════════════

/**
 * Enrich BrainContext with skill performance statistics.
 */
export function enrichContextWithSkillStats(context: BrainContext, skills: SkillDefinition[]): BrainContext {
  if (!skills || skills.length === 0) return context;
  const table = formatSkillStats(skills);
  return {
    ...context,
    directives: `${context.directives}\n\n## Skill Pool Stats\n${table}`,
  };
}

/**
 * Format skill statistics as a markdown table.
 */
export function formatSkillStats(skills: SkillDefinition[]): string {
  if (skills.length === 0) return 'No skills available.';

  const lines: string[] = [
    '| Skill | Uses | Success Rate | Avg Coverage | Category |',
    '|-------|------|-------------|-------------|----------|',
  ];
  for (const skill of skills) {
    const sr = (skill.stats.successRate * 100).toFixed(0);
    lines.push(
      `| ${skill.name} | ${skill.stats.totalUses} | ${sr}% | ${skill.stats.avgCoverage}% | ${skill.category} |`,
    );
  }
  return lines.join('\n');
}

// ═══ Task 26: History Context ═════════════════════════════════════════════

export interface SprintHistoryData {
  taskTypes: Record<string, number>;
  models: Record<string, number>;
  successRate: number;
  noGoPatterns: string[];
}

/**
 * Enrich BrainContext with sprint history data.
 * sprintRange: how many past sprints to analyze (default: 5).
 */
export function enrichContextWithHistory(context: BrainContext, projectRoot: string, sprintRange?: number): BrainContext {
  const history = _loadSprintHistory(projectRoot, sprintRange ?? 5);
  if (!history) return context;
  const formatted = formatHistoryContext(history);
  return {
    ...context,
    directives: `${context.directives}\n\n## Sprint History\n${formatted}`,
  };
}

/**
 * Format sprint history data as a concise string (max 500 chars).
 */
export function formatHistoryContext(history: SprintHistoryData): string {
  const parts: string[] = [];

  // Success rate
  parts.push(`Success: ${(history.successRate * 100).toFixed(0)}%`);

  // Model distribution
  const modelParts: string[] = [];
  for (const [model, count] of Object.entries(history.models)) {
    modelParts.push(`${model}:${count}`);
  }
  if (modelParts.length > 0) {
    parts.push(`Models: ${modelParts.join(', ')}`);
  }

  // Task types
  const typeParts: string[] = [];
  const sortedTypes = Object.entries(history.taskTypes).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes.slice(0, 5)) {
    typeParts.push(`${type}:${count}`);
  }
  if (typeParts.length > 0) {
    parts.push(`Tasks: ${typeParts.join(', ')}`);
  }

  // No-go patterns
  if (history.noGoPatterns.length > 0) {
    parts.push(`NoGo patterns: ${history.noGoPatterns.slice(0, 3).join('; ')}`);
  }

  const result = parts.join(' | ');
  // Enforce max 500 chars
  if (result.length > 500) {
    return result.slice(0, 497) + '...';
  }
  return result;
}

// ─── Internal ────────────────────────────────────────────────────────────

function _loadSprintHistory(projectRoot: string, maxSprints: number): SprintHistoryData | null {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsPath)) return null;

  try {
    const files = readdirSync(sprintsPath)
      .filter(f => f.endsWith('.md'))
      .sort()
      .slice(-maxSprints);

    if (files.length === 0) return null;

    const taskTypes: Record<string, number> = {};
    const models: Record<string, number> = {};
    let totalTasks = 0;
    let doneTasks = 0;
    const noGoPatterns: string[] = [];

    for (const file of files) {
      const content = _readFileSafe(join(sprintsPath, file));
      const lines = content.split('\n');

      for (const line of lines) {
        // Parse task lines like "- 001-001: Task Title (DONE)"
        const taskMatch = line.match(/^- [\w-]+: (.+?) \((\w+)\)$/);
        if (taskMatch) {
          totalTasks++;
          const title = taskMatch[1] ?? '';
          const status = taskMatch[2] ?? '';

          if (status === 'DONE' || status === 'GO_WITH_TECH_DEBT') {
            doneTasks++;
          }

          if (status === 'NO_GO') {
            // Extract pattern from title
            const pattern = title.length > 50 ? title.slice(0, 47) + '...' : title;
            if (!noGoPatterns.includes(pattern)) {
              noGoPatterns.push(pattern);
            }
          }

          // Infer task type from title keywords
          const type = _inferTaskType(title);
          taskTypes[type] = (taskTypes[type] ?? 0) + 1;
        }

        // Parse model from metrics table
        // e.g., "| opus | 5 |"
        const modelMatch = line.match(/\| (opus|sonnet|haiku|gpt-4\.1|o3|o4-mini|gemini-2\.5-pro|gemini-2\.5-flash) \|/);
        if (modelMatch?.[1]) {
          const model = modelMatch[1];
          models[model] = (models[model] ?? 0) + 1;
        }
      }
    }

    const successRate = totalTasks > 0 ? doneTasks / totalTasks : 0;

    return { taskTypes, models, successRate, noGoPatterns };
  } catch {
    return null;
  }
}

function _inferTaskType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('test')) return 'test';
  if (lower.includes('fix') || lower.includes('bug')) return 'fix';
  if (lower.includes('refactor')) return 'refactor';
  if (lower.includes('doc')) return 'docs';
  if (lower.includes('integration')) return 'integration';
  return 'feature';
}

function _readFileSafe(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}
