// ─── Skill Selector ─────────────────────────────────────────────────────────
import type { SkillDefinition, ProjectStack, SkillSelectionResult } from './skill-types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_SKILLS = 3;

// ─── selectSkills ──────────────────────────────────────────────────────────

/**
 * Select the best skills from the pool for a given task.
 *
 * Scoring algorithm:
 * 1. Match projectStack.language -> language skills (score +3)
 * 2. Match projectStack.framework -> framework skills (score +3)
 * 3. Match task keywords -> skill triggers (score +2 per match)
 * 4. Agent expertise bonus (+1 per expertise/trigger overlap)
 * 5. Filter by enabled
 * 6. Check composableWith conflicts
 * 7. Sort by score descending, then priority
 * 8. Cap at maxSkills (default 3)
 */
export function selectSkills(
  task: { title: string; description: string; scope?: { directories?: string[]; filesWrite?: string[] } },
  projectStack: ProjectStack | null,
  pool: Map<string, SkillDefinition>,
  agent?: { id: string; expertise?: string[] },
  maxSkills?: number,
): SkillSelectionResult {
  const cap = maxSkills ?? DEFAULT_MAX_SKILLS;
  const taskText = `${task.title} ${task.description}`.toLowerCase();
  const scores = new Map<string, number>();
  const matched: Array<{ skill: SkillDefinition; score: number }> = [];

  for (const [, skill] of pool) {
    if (!skill.enabled) continue;

    let score = 0;

    // 1. Match projectStack.language -> language skills (+3)
    if (projectStack && skill.category === 'language') {
      const langTriggers = skill.triggers.map((t) => t.toLowerCase());
      if (langTriggers.includes(projectStack.language.toLowerCase())) {
        score += 3;
      }
    }

    // 2. Match projectStack.framework -> framework skills (+3)
    if (projectStack && skill.category === 'framework') {
      const fwTriggers = skill.triggers.map((t) => t.toLowerCase());
      if (fwTriggers.includes(projectStack.framework.toLowerCase())) {
        score += 3;
      }
    }

    // 3. Match task keywords -> skill triggers (+2 per match)
    for (const trigger of skill.triggers) {
      if (taskText.includes(trigger.toLowerCase())) {
        score += 2;
      }
    }

    // 3b. Match task scope directories -> skill category/triggers (+2)
    if (task.scope?.directories) {
      for (const dir of task.scope.directories) {
        const dirLower = dir.toLowerCase();
        // Domain-specific directory matching
        if (dirLower.includes('test') && (skill.category === 'domain' || skill.triggers.some(t => t.toLowerCase().includes('test')))) {
          score += 2;
        }
        if (dirLower.includes('api') && skill.triggers.some(t => t.toLowerCase().includes('api') || t.toLowerCase().includes('rest'))) {
          score += 2;
        }
        if ((dirLower.includes('doc') || dirLower.includes('readme')) && skill.triggers.some(t => t.toLowerCase().includes('doc'))) {
          score += 2;
        }
        if (dirLower.includes('security') && skill.triggers.some(t => t.toLowerCase().includes('security') || t.toLowerCase().includes('owasp'))) {
          score += 2;
        }
      }
    }

    // 4. Agent expertise bonus (+1 per expertise/trigger overlap)
    if (agent?.expertise) {
      for (const exp of agent.expertise) {
        const expLower = exp.toLowerCase();
        for (const trigger of skill.triggers) {
          if (trigger.toLowerCase() === expLower) {
            score += 1;
          }
        }
      }
    }

    // Stack detection scoring: +2 per dependency match, +2 per file match
    if (projectStack) {
      for (const dep of skill.stackDetection.dependencies) {
        if (projectStack.dependencies.includes(dep)) {
          score += 2;
        }
      }
      for (const file of skill.stackDetection.files) {
        if (projectStack.language === file || projectStack.framework === file) {
          score += 2;
        }
      }
    }

    // Priority bonus: +1 for skill priority > 0
    if (skill.priority > 0) {
      score += 1;
    }

    scores.set(skill.id, score);

    if (score > 0) {
      matched.push({ skill, score });
    }
  }

  // Sort by score descending, then by priority descending
  matched.sort((a, b) => b.score - a.score || b.skill.priority - a.skill.priority);

  // Resolve composition conflicts
  const selectedSkills = matched.map((m) => m.skill);
  const { resolved } = resolveComposition(selectedSkills);

  const truncated = resolved.length > cap;
  const capped = resolved.slice(0, cap);

  // Auto-activate testing-expert if task touches tests
  const scopeHasTests = task.scope?.directories?.some(d => d.startsWith('tests/')) ?? false;
  const writesTest = task.scope?.filesWrite?.some(f =>
    f.endsWith('.test.ts') || f.endsWith('.spec.ts') || f.endsWith('.test.tsx')
  ) ?? false;

  if ((scopeHasTests || writesTest) && !capped.some(s => s.id === 'testing-expert')) {
    const testingExpert = pool.get('testing-expert');
    if (testingExpert) {
      capped.push(testingExpert);
    }
  }

  return {
    skills: capped,
    scores,
    truncated,
  };
}

// ─── resolveComposition ───────────────────────────────────────────────────

/**
 * Resolve composition conflicts between skills.
 * A skill can only be included if all other included skills are in its
 * composableWith list (or if composableWith is empty, meaning no restrictions).
 * Returns the resolved list and any conflict descriptions.
 */
export function resolveComposition(
  skills: SkillDefinition[],
): { resolved: SkillDefinition[]; conflicts: string[] } {
  if (skills.length <= 1) {
    return { resolved: [...skills], conflicts: [] };
  }

  const resolved: SkillDefinition[] = [];
  const conflicts: string[] = [];

  for (const skill of skills) {
    // If composableWith is empty, skill has no restrictions
    if (skill.composableWith.length === 0) {
      resolved.push(skill);
      continue;
    }

    // Check if this skill conflicts with any already-resolved skill
    let hasConflict = false;
    for (const existing of resolved) {
      // If existing skill has composableWith restrictions and this skill is not in the list
      if (existing.composableWith.length > 0 && !existing.composableWith.includes(skill.id)) {
        conflicts.push(`"${skill.name}" conflicts with "${existing.name}": not in composableWith`);
        hasConflict = true;
        break;
      }
      // If this skill has composableWith restrictions and existing skill is not in the list
      if (!skill.composableWith.includes(existing.id)) {
        conflicts.push(`"${skill.name}" conflicts with "${existing.name}": not in composableWith`);
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      resolved.push(skill);
    }
  }

  return { resolved, conflicts };
}
