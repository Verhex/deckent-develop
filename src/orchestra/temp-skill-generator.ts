// ─── Temp Skill Generator ───────────────────────────────────────────────────
// Auto-generates temporary skills from project analysis and learning data.
// Template-based (no AI calls) — deterministic and zero-cost.

import type { SkillDefinition, SkillCategory, StackDetectionRule } from '../core/skill-types.js';
import { createSkillDefinition } from '../core/skill-types.js';
import type { ActivationConfig } from '../core/routing-types.js';

// ─── Internal helpers ───────────────────────────────────────────────────────

/** Extends SkillDefinition with the generated SKILL.md content (internal only). */
type SkillWithContent = SkillDefinition & { _generatedContent?: string };

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectAnalysisInput {
  language: string;
  framework: string;
  testFramework: string;
  buildTool: string;
  dependencies: string[];
  detectedLanguages?: string[];
  subProjects?: string[];
}

// ─── Project Conventions Skill ──────────────────────────────────────────────

/**
 * Generate a "project-conventions" temp skill from project analysis.
 * This is the highest-value temp skill — zero risk, always relevant.
 */
export function generateProjectConventionsSkill(
  analysis: ProjectAnalysisInput,
): SkillDefinition {
  const sections: string[] = [];

  sections.push('# Project Conventions (Auto-Generated)');
  sections.push('');

  // Stack section
  sections.push('## Stack');
  sections.push(`- Language: ${analysis.language}`);
  if (analysis.framework && analysis.framework !== 'none') {
    sections.push(`- Framework: ${analysis.framework}`);
  }
  sections.push(`- Build: ${analysis.buildTool || 'unknown'}`);
  sections.push(`- Test: ${analysis.testFramework || 'unknown'}`);
  sections.push('');

  // Key dependencies
  if (analysis.dependencies.length > 0) {
    sections.push('## Key Dependencies');
    const topDeps = analysis.dependencies.slice(0, 15);
    for (const dep of topDeps) {
      sections.push(`- ${dep}`);
    }
    sections.push('');
  }

  // Multi-language note
  if (analysis.detectedLanguages && analysis.detectedLanguages.length > 1) {
    sections.push('## Languages');
    sections.push(`This project uses multiple languages: ${analysis.detectedLanguages.join(', ')}`);
    sections.push('');
  }

  // Sub-projects
  if (analysis.subProjects && analysis.subProjects.length > 0) {
    sections.push('## Sub-Projects');
    for (const sub of analysis.subProjects.slice(0, 5)) {
      sections.push(`- ${sub}`);
    }
    sections.push('');
  }

  // Testing conventions
  sections.push('## Testing');
  sections.push(`- Framework: ${analysis.testFramework}`);
  if (analysis.testFramework.toLowerCase().includes('vitest')) {
    sections.push('- Pattern: `describe/it/expect` with `vi.mock()` for mocking');
    sections.push('- Tests mirror src/ structure in tests/');
  }
  sections.push('');

  const content = sections.join('\n');

  // Build activation config — always active for this project's language
  const activation: ActivationConfig = {
    rules: [
      {
        name: 'project-conventions-always',
        when: { 'intent.primary': { $not: 'unknown' } },
        score: 4,
      },
    ],
    exclude: [],
    minScore: 3,
  };

  const skill = createSkillDefinition({
    id: 'project-conventions',
    name: 'Project Conventions',
    version: '1.0.0',
    description: `Auto-generated conventions for ${analysis.language} project`,
    entrypoint: 'SKILL.md',
    category: 'domain' as SkillCategory,
    triggers: [analysis.language.toLowerCase(), analysis.testFramework.toLowerCase()].filter(Boolean),
    stackDetection: {
      files: [],
      dependencies: analysis.dependencies.slice(0, 5),
      commands: [],
    } as StackDetectionRule,
    composableWith: [],
    priority: 3,
    enabled: true,
    manifestVersion: 2,
    activation,
  });
  // Content stored separately as SKILL.md — this field carries the generated content
  (skill as SkillWithContent)._generatedContent = content;
  return skill;
}

/**
 * Get the generated SKILL.md content from a project-conventions skill.
 */
export function getGeneratedContent(skill: SkillDefinition): string | undefined {
  return (skill as SkillWithContent)._generatedContent;
}

// ─── Data-Driven Domain Skills ──────────────────────────────────────────────

export interface DomainAccumulation {
  domain: string;
  taskCount: number;
  successRate: number;
  commonFiles: string[];
  commonDeps: string[];
}

/**
 * Generate temp skills from accumulated learning data about specific domains.
 * Only generates when there's enough data (5+ tasks, 70%+ success).
 */
export function generateDataDrivenSkills(
  accumulations: DomainAccumulation[],
  existingSkillIds: Set<string>,
): SkillDefinition[] {
  const skills: SkillDefinition[] = [];

  for (const acc of accumulations) {
    if (acc.taskCount < 5) continue;
    if (acc.successRate < 0.7) continue;

    const skillId = `${acc.domain}-domain-learned`;
    if (existingSkillIds.has(skillId)) continue;

    const sections: string[] = [];
    sections.push(`# ${acc.domain} Domain Expertise (Auto-Generated)`);
    sections.push('');

    if (acc.commonFiles.length > 0) {
      sections.push('## Key Files');
      for (const f of acc.commonFiles.slice(0, 10)) {
        sections.push(`- ${f}`);
      }
      sections.push('');
    }

    if (acc.commonDeps.length > 0) {
      sections.push('## Dependencies');
      for (const d of acc.commonDeps.slice(0, 10)) {
        sections.push(`- ${d}`);
      }
      sections.push('');
    }

    sections.push('## Historical Performance');
    sections.push(`- ${acc.taskCount} tasks, ${Math.round(acc.successRate * 100)}% success rate`);

    const activation: ActivationConfig = {
      rules: [
        {
          name: `domain-${acc.domain}`,
          when: { domains: { $contains: acc.domain } },
          score: 5,
        },
      ],
      exclude: [],
      minScore: 3,
    };

    const skill = createSkillDefinition({
      id: skillId,
      name: `${acc.domain} Domain (Learned)`,
      version: '1.0.0',
      description: `Auto-learned domain expertise for ${acc.domain} (${acc.taskCount} tasks, ${Math.round(acc.successRate * 100)}% success)`,
      entrypoint: 'SKILL.md',
      category: 'domain' as SkillCategory,
      triggers: [acc.domain],
      stackDetection: { files: [], dependencies: acc.commonDeps.slice(0, 3), commands: [] } as StackDetectionRule,
      composableWith: [],
      priority: 2,
      enabled: true,
      manifestVersion: 2,
      activation,
    });
    (skill as SkillWithContent)._generatedContent = sections.join('\n');

    skills.push(skill);
  }

  return skills;
}
