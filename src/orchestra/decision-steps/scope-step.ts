// ─── Scope Merge Step ──────────────────────────────────────────────────────
// Merges task scope with agent triggerScopes and skill contexts.
// Security boundary: agent/skills CANNOT expand filesWrite -- only task defines write access.
import type { TaskScope } from '../../core/types.js';
import type { AgentDefinition } from '../../core/agent-types.js';
import type { SkillDefinition } from '../../core/skill-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Deduplicate a string array while preserving order.
 */
function deduplicate(arr: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of arr) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/**
 * Check if an agent's triggerScope matches any of the task directories.
 * A scope matches if the task directory starts with the trigger scope
 * or the trigger scope starts with the task directory.
 */
function isMatchingScope(triggerScope: string, taskDirectories: string[]): boolean {
  for (const dir of taskDirectories) {
    if (dir.startsWith(triggerScope) || triggerScope.startsWith(dir)) {
      return true;
    }
  }
  return false;
}

// ─── executeScopeStep ──────────────────────────────────────────────────────

/**
 * Merge task scope with agent and skill contexts.
 *
 * Rules:
 * - directories: task directories + agent triggerScopes (only those matching task dirs)
 * - filesRead: union of task.filesRead (agent/skills do not inject reads directly)
 * - filesWrite: task.filesWrite ONLY (security boundary -- agent/skills cannot expand write access)
 * - All arrays are deduplicated
 */
export function executeScopeStep(
  taskScope: TaskScope,
  agent: AgentDefinition | null,
  skills: SkillDefinition[],
): TaskScope {
  const directories = [...taskScope.directories];
  const filesRead = [...taskScope.filesRead];
  const filesWrite = [...taskScope.filesWrite];

  // Merge agent triggerScopes (matching only)
  if (agent) {
    for (const triggerScope of agent.triggerScopes) {
      if (isMatchingScope(triggerScope, taskScope.directories)) {
        directories.push(triggerScope);
      }
    }
  }

  // Merge skill trigger-based directories (matching only)
  for (const skill of skills) {
    // Skills can add directories via their stackDetection.files if they match task scope
    for (const file of skill.stackDetection.files) {
      // Only add if it looks like a directory reference and matches task scope
      if (file.includes('/') && isMatchingScope(file, taskScope.directories)) {
        directories.push(file);
      }
    }
  }

  return {
    directories: deduplicate(directories),
    filesRead: deduplicate(filesRead),
    filesWrite: deduplicate(filesWrite),
  };
}
