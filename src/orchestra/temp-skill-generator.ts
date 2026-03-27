// ─── Temp Skill Generator ───────────────────────────────────────────────────
// Auto-generates temporary skills from project analysis and learning data.
// Template-based (no AI calls) — deterministic and zero-cost.

import type { SkillDefinition, SkillCategory, StackDetectionRule, ProjectStack } from '../core/skill-types.js';
import { createSkillDefinition } from '../core/skill-types.js';
import type { ActivationConfig } from '../core/routing-types.js';
import type { AgentDefinition } from '../core/agent-types.js';
import { createAgentDefinition } from '../core/agent-types.js';

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

// ─── Temp Agent Generator ────────────────────────────────────────────────────

/**
 * Describes a single agent template: which stack combination it targets
 * and how the generated agent should be configured.
 */
interface AgentTemplate {
  /** Agent ID prefix — will become "temp-{idSuffix}" */
  idSuffix: string;
  name: string;
  description: string;
  expertise: string[];
  triggerKeywords: string[];
  triggerScopes: string[];
  systemPromptSummary: string;
  /** Primary intent that activates this agent */
  intentHint: string;
  /** Required language (lowercase) or '*' for any */
  language: string;
  /** Required framework substring (lowercase) or '*' for any */
  framework: string;
  /** Optional additional dependency substring required */
  depHint?: string;
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    idSuffix: 'react-ts-specialist',
    name: 'React TypeScript Specialist',
    description: 'Expert in React + TypeScript component architecture, hooks, and testing with Vitest/RTL.',
    expertise: ['react', 'typescript', 'hooks', 'vite', 'component-architecture'],
    triggerKeywords: ['component', 'hook', 'jsx', 'tsx', 'react', 'props', 'state', 'context'],
    triggerScopes: ['src/dashboard', 'src/components', 'src/pages', 'src/ui'],
    systemPromptSummary: 'React + TypeScript specialist. Focus on functional components, custom hooks, strict typing, and Vitest/RTL test patterns.',
    intentHint: 'implementation',
    language: 'typescript',
    framework: 'react',
  },
  {
    idSuffix: 'react-specialist',
    name: 'React Specialist',
    description: 'Expert in React component architecture, hooks, and state management.',
    expertise: ['react', 'hooks', 'vite', 'component-architecture', 'css-modules'],
    triggerKeywords: ['component', 'hook', 'jsx', 'react', 'props', 'context', 'state'],
    triggerScopes: ['src/components', 'src/pages', 'src/ui'],
    systemPromptSummary: 'React specialist. Focus on functional components, custom hooks, and testable component patterns.',
    intentHint: 'implementation',
    language: '*',
    framework: 'react',
  },
  {
    idSuffix: 'ts-architect',
    name: 'TypeScript Architect',
    description: 'TypeScript type system expert for complex generics, ESM modules, and strict-mode patterns.',
    expertise: ['typescript', 'generics', 'esm', 'strict-mode', 'utility-types'],
    triggerKeywords: ['type', 'interface', 'generic', 'infer', 'extends', 'mapped', 'conditional'],
    triggerScopes: ['src/core', 'src/types'],
    systemPromptSummary: 'TypeScript architect. Deep expertise in type system design, generics, ESM imports (.js extensions), and strict-mode patterns.',
    intentHint: 'implementation',
    language: 'typescript',
    framework: 'none',
  },
  {
    idSuffix: 'python-api-specialist',
    name: 'Python API Specialist',
    description: 'Expert in Python FastAPI/Flask REST API design, Pydantic models, and async patterns.',
    expertise: ['python', 'fastapi', 'flask', 'pydantic', 'async', 'rest-api'],
    triggerKeywords: ['endpoint', 'route', 'schema', 'model', 'request', 'response', 'middleware'],
    triggerScopes: ['src/', 'app/', 'api/'],
    systemPromptSummary: 'Python API specialist. Focus on FastAPI/Flask endpoints, Pydantic validation, async/await, and pytest patterns.',
    intentHint: 'implementation',
    language: 'python',
    framework: 'fastapi',
  },
  {
    idSuffix: 'python-specialist',
    name: 'Python Specialist',
    description: 'Python expert for idiomatic code, async patterns, and pytest-based testing.',
    expertise: ['python', 'async', 'pytest', 'type-hints', 'dataclasses'],
    triggerKeywords: ['def', 'class', 'async', 'await', 'decorator', 'generator', 'pytest'],
    triggerScopes: ['src/', 'app/', 'tests/'],
    systemPromptSummary: 'Python specialist. Write idiomatic Python with type hints, async/await, dataclasses, and pytest test patterns.',
    intentHint: 'implementation',
    language: 'python',
    framework: '*',
  },
  {
    idSuffix: 'go-specialist',
    name: 'Go Specialist',
    description: 'Go expert for idiomatic concurrent code, error handling, and testing patterns.',
    expertise: ['go', 'goroutines', 'channels', 'error-handling', 'interfaces'],
    triggerKeywords: ['goroutine', 'channel', 'error', 'interface', 'struct', 'go', 'defer'],
    triggerScopes: ['cmd/', 'pkg/', 'internal/', 'api/'],
    systemPromptSummary: 'Go specialist. Idiomatic Go patterns: error wrapping, interfaces, goroutines, table-driven tests.',
    intentHint: 'implementation',
    language: 'go',
    framework: '*',
  },
  {
    idSuffix: 'rust-specialist',
    name: 'Rust Specialist',
    description: 'Rust expert for ownership, lifetime patterns, async/await, and cargo ecosystem.',
    expertise: ['rust', 'ownership', 'lifetimes', 'async', 'tokio', 'serde'],
    triggerKeywords: ['lifetime', 'borrow', 'trait', 'impl', 'enum', 'match', 'cargo', 'tokio'],
    triggerScopes: ['src/', 'crates/', 'tests/'],
    systemPromptSummary: 'Rust specialist. Deep expertise in ownership, lifetimes, trait objects, async/await with Tokio.',
    intentHint: 'implementation',
    language: 'rust',
    framework: '*',
  },
];

/**
 * Generate temporary agents from project stack analysis.
 * Template-based (no AI calls) — deterministic and zero-cost.
 * Returns at most one agent per template that matches the stack.
 */
export function generateTempAgents(stack: ProjectStack): AgentDefinition[] {
  const lang = stack.language.toLowerCase();
  const fw = stack.framework.toLowerCase();
  const deps = stack.dependencies.map((d) => d.toLowerCase());

  const agents: AgentDefinition[] = [];

  // For "mixed" language projects, check detectedLanguages for broader matching
  const detectedLangs = (stack.detectedLanguages ?? []).map(d => d.toLowerCase());

  for (const tpl of AGENT_TEMPLATES) {
    // Language filter — "mixed" matches if any detectedLanguage includes the template language
    if (tpl.language !== '*' && !lang.includes(tpl.language)) {
      if (lang !== 'mixed' || !detectedLangs.some(dl => dl.includes(tpl.language))) continue;
    }
    // Framework filter
    if (tpl.framework !== '*' && tpl.framework !== 'none') {
      const fwMatch = fw.includes(tpl.framework) || deps.some((d) => d.includes(tpl.framework));
      if (!fwMatch) continue;
    }
    // 'none' framework means only activate when no framework is detected
    if (tpl.framework === 'none' && fw !== 'none' && fw !== '') continue;
    // Optional dependency hint
    if (tpl.depHint && !deps.some((d) => d.includes(tpl.depHint!))) continue;

    const activation: ActivationConfig = {
      rules: [
        {
          name: `temp-agent-${tpl.idSuffix}`,
          when: { 'intent.primary': tpl.intentHint },
          score: 6,
        },
      ],
      exclude: [],
      minScore: 5,
    };

    const agent = createAgentDefinition({
      id: `temp-${tpl.idSuffix}`,
      name: tpl.name,
      description: tpl.description,
      systemPrompt: tpl.systemPromptSummary,
      expertise: tpl.expertise,
      triggerKeywords: tpl.triggerKeywords,
      triggerScopes: tpl.triggerScopes,
      source: 'learned',
      persistent: false,
      enabled: true,
      manifestVersion: 2,
      activation,
    });

    agents.push(agent);
  }

  return agents;
}
