// ─── Temp Skill Generator ───────────────────────────────────────────────────
// Auto-generates temporary skills from project analysis and learning data.
// Template-based (no AI calls) — deterministic and zero-cost.

import type { SkillDefinition, SkillCategory, StackDetectionRule, ProjectStack } from '../core/skill-types.js';
import { createSkillDefinition } from '../core/skill-types.js';
import type { ActivationConfig } from '../core/routing-types.js';
import type { AgentDefinition } from '../core/agent-types.js';
import { createAgentDefinition } from '../core/agent-types.js';
import { persistTempAgentPrompts } from './temp-agent-generator.js';
import { normalizeTechStack, type TechStackKind } from '../core/work-model.js';
import { STACK_COMMANDS } from '../core/stack-detector.js';

// ─── WM-7 E1: per-stack idioms — turns the parametric "project-conventions"
// skill into a genuine, stack-correct code-expert base (a Go project gets Go
// idioms, not TypeScript). Commands come from the single source STACK_COMMANDS
// (no second command table); only the IDIOMS knowledge lives here.
const STACK_IDIOMS: Partial<Record<TechStackKind, string[]>> = {
  typescript: ['ESM imports require `.js` extensions (Node16 resolution)', 'Strict typing — avoid `any`; prefer discriminated unions + exhaustive switches', 'Tests: `describe/it/expect` + `vi.mock()`; mirror `src/` under `tests/`'],
  javascript: ['Prefer ESM modules; avoid implicit globals', 'Tests: vitest/jest `describe/it/expect`'],
  python: ['PEP 8 + type hints, keep `mypy` clean', 'pytest with fixtures; test files `test_*.py` / `*_test.py`', 'Isolate deps via venv/poetry; never commit secrets'],
  go: ['Run `gofmt` + `go vet`; wrap errors with `fmt.Errorf("…: %w", err)`', 'Table-driven tests in `*_test.go`', 'Small interfaces; accept interfaces, return concrete structs'],
  rust: ['Prefer `Result<T,E>` + `?` over panics; keep `clippy` clean', 'Unit tests in-module `#[cfg(test)]`, integration under `tests/`', 'Respect ownership/borrowing — avoid needless `.clone()`'],
  cpp: ['RAII; avoid raw `new`/`delete` (smart pointers)', 'const-correctness; pass large objects by const-ref', 'Tests via GoogleTest/Catch2 (`*_test.cc`); build with CMake + ctest'],
  c: ['Check every return code; free what you allocate', 'Header guards; minimise global state', 'Tests via Unity/CMocka + ctest'],
  java: ['Favor immutability + dependency injection', 'JUnit5; avoid raw generic types', 'Build via Maven/Gradle'],
  kotlin: ['Null-safety (`?`; use `!!` sparingly); data classes', 'JUnit5/Kotest; coroutines for async'],
  csharp: ['Nullable reference types ON; `async`/`await` end-to-end', 'xUnit/NUnit; dispose via `using`/`IDisposable`'],
  swift: ['Value types + optionals; avoid force-unwrap', 'XCTest; run with `swift test`'],
  ruby: ['Keep RuboCop clean; prefer blocks/enumerables', 'RSpec specs in `*_spec.rb`'],
  php: ['Follow PSR-12; typed properties + return types', 'PHPUnit `*Test.php`'],
  dart: ['Keep `dart analyze` clean; null-safety', 'Flutter widget tests / `dart test`'],
};

/** Resolve a representative STACK_COMMANDS entry for a TechStackKind (handles the
 *  build-tool-suffixed keys java_maven / c_cmake / kotlin_gradle). */
function commandsForStack(stack: TechStackKind, language: string): { build: string; test: string; lint: string } | undefined {
  const direct = STACK_COMMANDS[language.toLowerCase()];
  if (direct) return direct;
  const keyByStack: Partial<Record<TechStackKind, string>> = {
    cpp: 'c_cmake', c: 'c_cmake', java: 'java_maven', kotlin: 'kotlin_gradle',
  };
  const key = keyByStack[stack];
  return key ? STACK_COMMANDS[key] : STACK_COMMANDS[stack];
}

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
 * Deterministic PROJECT-CONTEXT prompt segment (CATALOG-STATS-AUTHORITY-001
 * correction, 2026-08-17): the same auto-generated conventions content, but as
 * plain prompt data — it never enters the skill pool, routing, or stats, so it
 * can no longer poison the learning loop with an always-matching pseudo-skill.
 */
export function generateProjectContextSegment(
  analysis: ProjectAnalysisInput,
): string {
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

  // WM-7 E1: stack-correct commands + idioms (parametric code-expert base).
  const techStack = normalizeTechStack(analysis.language);
  const cmds = commandsForStack(techStack, analysis.language);
  if (cmds && (cmds.build || cmds.test || cmds.lint)) {
    sections.push('## Commands');
    if (cmds.build) sections.push(`- Build: \`${cmds.build}\``);
    if (cmds.test) sections.push(`- Test: \`${cmds.test}\``);
    if (cmds.lint) sections.push(`- Lint: \`${cmds.lint}\``);
    sections.push('');
  }
  const idioms = STACK_IDIOMS[techStack];
  if (idioms && idioms.length > 0) {
    sections.push(`## ${analysis.language} Idioms`);
    for (const idiom of idioms) sections.push(`- ${idiom}`);
    sections.push('');
  }

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

  return sections.join('\n');
}

/**
 * Generate a "project-conventions" temp skill from project analysis.
 *
 * PRODUCTION-RETIRED (2026-08-17): planning no longer inserts this into the
 * skill pool — the content ships as the deterministic project-context prompt
 * segment above. The factory remains for compiled-contract compatibility and
 * legacy fixtures only.
 */
export function generateProjectConventionsSkill(
  analysis: ProjectAnalysisInput,
): SkillDefinition {
  const content = generateProjectContextSegment(analysis);

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
    // ROUTING-V3 profile (S3): the conventions skill is DELIBERATELY broad —
    // construction lanes across every domain — so it keeps attaching to
    // build/fix/refactor work exactly as the V2 keyword lane did.
    profile: {
      profileVersion: 3,
      workTypes: [
        { type: 'build', proficiency: 'able' },
        { type: 'fix', proficiency: 'able' },
        { type: 'refactor', proficiency: 'able' },
      ],
      domains: [{ id: '*', proficiency: 'able' }],
      expertise: ['project conventions', 'stack idioms'],
      deliverables: [],
    },
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
  {
    idSuffix: 'cpp-specialist',
    name: 'C++ Specialist',
    description: 'C++ expert for RAII, modern CMake, memory safety, and GoogleTest-based verification.',
    expertise: ['cpp', 'raii', 'cmake', 'googletest', 'memory-safety'],
    triggerKeywords: ['raii', 'cmake', 'gtest', 'googletest', 'unique_ptr', 'shared_ptr', 'template', 'constexpr'],
    triggerScopes: ['src/', 'include/', 'tests/', 'CMakeLists.txt'],
    systemPromptSummary: 'C++ specialist. Focus on RAII, const-correctness, modern CMake targets, and GoogleTest/ctest verification.',
    intentHint: 'implementation',
    language: 'cpp',
    framework: '*',
  },
  {
    idSuffix: 'java-specialist',
    name: 'Java Specialist',
    description: 'Java expert for Maven projects, clean object design, and JUnit 5 testing.',
    expertise: ['java', 'maven', 'junit5', 'dependency-injection', 'immutability'],
    triggerKeywords: ['java', 'maven', 'junit', 'spring', 'class', 'interface', 'record', 'stream'],
    triggerScopes: ['src/main/java', 'src/test/java', 'pom.xml'],
    systemPromptSummary: 'Java specialist. Focus on Maven lifecycle, immutable domain models, dependency injection seams, and JUnit 5 tests.',
    intentHint: 'implementation',
    language: 'java',
    framework: '*',
  },
  {
    idSuffix: 'csharp-specialist',
    name: 'C# Specialist',
    description: 'C#/.NET expert for nullable-safe code, async patterns, and xUnit verification.',
    expertise: ['csharp', 'dotnet', 'xunit', 'nullable-reference-types', 'async-await'],
    triggerKeywords: ['csharp', 'dotnet', 'xunit', 'async', 'await', 'record', 'linq', 'nullable'],
    triggerScopes: ['src/', 'tests/', '*.csproj', '*.sln'],
    systemPromptSummary: 'C# specialist. Focus on .NET conventions, nullable reference types, async/await flow, IDisposable, and xUnit tests.',
    intentHint: 'implementation',
    language: 'csharp',
    framework: '*',
  },
  {
    idSuffix: 'kotlin-specialist',
    name: 'Kotlin Specialist',
    description: 'Kotlin expert for Gradle projects, null-safety, coroutines, and JVM testing.',
    expertise: ['kotlin', 'gradle', 'coroutines', 'null-safety', 'junit5'],
    triggerKeywords: ['kotlin', 'gradle', 'coroutine', 'suspend', 'flow', 'data class', 'sealed', 'nullable'],
    triggerScopes: ['src/main/kotlin', 'src/test/kotlin', 'build.gradle', 'build.gradle.kts'],
    systemPromptSummary: 'Kotlin specialist. Focus on Gradle builds, null-safety, coroutines, data classes, sealed models, and JUnit/Kotest tests.',
    intentHint: 'implementation',
    language: 'kotlin',
    framework: '*',
  },
  {
    idSuffix: 'swift-specialist',
    name: 'Swift Specialist',
    description: 'Swift expert for Swift Package Manager projects, value semantics, and XCTest.',
    expertise: ['swift', 'spm', 'xctest', 'value-semantics', 'optionals'],
    triggerKeywords: ['swift', 'spm', 'xctest', 'struct', 'protocol', 'optional', 'async', 'await'],
    triggerScopes: ['Sources/', 'Tests/', 'Package.swift'],
    systemPromptSummary: 'Swift specialist. Focus on SPM layout, value semantics, protocols, optionals, async/await, and XCTest coverage.',
    intentHint: 'implementation',
    language: 'swift',
    framework: '*',
  },
];

/**
 * Generate temporary agents from project stack analysis.
 * Template-based (no AI calls) — deterministic and zero-cost.
 * Returns at most one agent per template that matches the stack.
 *
 * When `projectRoot` is supplied the function also persists a Karpathy-aligned
 * PROMPT.md for each generated agent via {@link persistTempAgentPrompts}.
 * This closes the Sprint 190 "PROMPT.md missing — degraded fallback" warning
 * surfaced by `agent-pool.ts:getAgentPrompt()`. The parameter is optional to
 * preserve backward compatibility with callers that only need the in-memory
 * agent definitions.
 */
export function generateTempAgents(
  stack: ProjectStack,
  projectRoot?: string,
): AgentDefinition[] {
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

  // When a projectRoot is supplied, materialise a PROMPT.md for every
  // generated agent so agent-pool.ts:getAgentPrompt() resolves cleanly
  // (source: 'prompt-md') instead of emitting the degraded fallback warning.
  if (projectRoot && agents.length > 0) {
    persistTempAgentPrompts(projectRoot, agents);
  }

  return agents;
}
