/**
 * init-steps.ts — Core filesystem operations for deckent init.
 *
 * Directory creation, config writing, brain file setup, DB preload,
 * IDE adapter application, gitignore management, and environment config.
 *
 * Split from init.ts (Sprint 144 Task 1).
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import type { PlanMode } from '../../core/types.js';
import type { FullStackResult } from '../../core/stack-detector.js';
import type { DetectedEnv } from '../../core/environment.js';
import type { ProjectStack } from '../../core/skill-types.js';
import {
  DECKENT_DIR,
  BRAIN_DIR,
  TASKS_DIR,
  LOCKS_DIR,
  CLAUDE_RULES_DIR,
  WORKSPACE_DIR,
  PLUGINS_DIR,
  I18N_DIR,
  DASHBOARD_FILE,
  DIRECTIVES_FILE,
  AGENTS_FILE,
  CLAUDE_FILE,
  DECKENT_FILE,
  MEMORY_FILE,
  DEBT_FILE,
  PATTERNS_FILE,
  RETRO_FILE,
  PROJECT_IDENTITY_FILE,
} from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { deepMerge } from '../../core/config.js';
import { getModePreset } from '../../core/mode-presets.js';
import { isDockerAvailable } from '../../orchestra/spawn-backend-docker.js';
import { generateProjectIdentity } from '../../orchestra/sprint-reporter.js';
import { generateProjectConventionsSkill, getGeneratedContent, generateTempAgents } from '../../orchestra/temp-skill-generator.js';
import { loadDocsConfig, saveDocsConfig } from '../../orchestra/managed-docs/docs-config.js';
import { ADR_SEED_DATA, createIdentitySeed } from '../../core/adr-seed.js';
import { MemoryStore } from '../../core/memory-store.js';
import { print } from '../helpers/output.js';
import { generateCodexConfig } from '../helpers/codex-config.js';
import { generateGeminiConfig } from '../helpers/gemini-config.js';
import { generateCursorConfig } from '../helpers/cursor-config.js';
import { generateAgentsMd, generateGeminiMd, generateCursorRules } from '../helpers/agent-templates.js';
import { createDeckTemplate, ensureDeckGitignore } from '../../core/deck-file.js';
import {
  generateDeckentContentTR,
  generateDeckentContentEN,
  generateDirectivesTemplateTR,
  generateDirectivesTemplateEN,
  generateToolsContent,
  generateBootContent,
  generateQuickStartDoc,
  generateDirectivesGuideDoc,
  generateConfigReferenceDoc,
  generateCursorDeckentMd,
  generateVscodeMcpJson,
} from './init-templates.js';

// ─── Filesystem Helpers ─────────────────────────────────────────────

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeIfNotExists(filePath: string, content: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, content);
  }
}

export function appendToGitignore(root: string, entries: string[]): void {
  const gitignorePath = join(root, '.gitignore');
  let existing = '';
  if (existsSync(gitignorePath)) {
    existing = readFileSync(gitignorePath, 'utf-8');
  }
  const linesToAdd = entries.filter((e) => !existing.includes(e));
  if (linesToAdd.length > 0) {
    const suffix = existing.endsWith('\n') || existing === '' ? '' : '\n';
    writeFileSync(gitignorePath, existing + suffix + linesToAdd.join('\n') + '\n');
  }
}

// ─── Types ──────────────────────────────────────────────────────────

/** Valid environment names for --env flag */
export type EnvName = 'codex' | 'cursor' | 'gemini' | 'vscode' | 'shell';
export const ALL_ENV_NAMES: EnvName[] = ['codex', 'cursor', 'gemini', 'vscode', 'shell'];

export interface IdeAdapterResult {
  path: string;
  action: 'created' | 'exists' | 'skipped';
}

// ─── IDE Adapter Application ────────────────────────────────────────

export function applyIdeAdapters(
  root: string,
  opts: { force?: boolean; allEnvs?: boolean } = {},
): IdeAdapterResult[] {
  const results: IdeAdapterResult[] = [];

  // 1. Cursor: .cursor/ dir exists OR --all-envs flag
  const cursorDir = join(root, '.cursor');
  if (opts.allEnvs || existsSync(cursorDir)) {
    const rulesDir = join(cursorDir, 'rules');
    const adapterPath = join(rulesDir, 'deckent.md');
    if (!existsSync(adapterPath) || opts.force) {
      mkdirSync(rulesDir, { recursive: true });
      writeFileSync(adapterPath, generateCursorDeckentMd());
      results.push({ path: adapterPath, action: 'created' });
    } else {
      results.push({ path: adapterPath, action: 'exists' });
    }
  }

  // 2. VS Code: .vscode/ dir exists OR --all-envs flag
  const vscodeDir = join(root, '.vscode');
  if (opts.allEnvs || existsSync(vscodeDir)) {
    const mcpPath = join(vscodeDir, 'mcp.json');
    if (!existsSync(mcpPath) || opts.force) {
      mkdirSync(vscodeDir, { recursive: true });
      writeFileSync(mcpPath, generateVscodeMcpJson());
      results.push({ path: mcpPath, action: 'created' });
    } else {
      results.push({ path: mcpPath, action: 'exists' });
    }
  }

  // 3. Codex: if codex.md is absent, ensure AGENTS.md has @DECKENT.md reference
  const codexMdPath = join(root, 'codex.md');
  if (!existsSync(codexMdPath)) {
    const agentsPath = join(root, AGENTS_FILE);
    ensureDeckentImport(agentsPath);
    results.push({ path: agentsPath, action: 'created' });
  }

  return results;
}

/**
 * Apply multi-environment config for a single environment name.
 * Creates environment-specific files using stack-aware templates.
 */
export function applyEnvConfig(env: EnvName, root: string, projectInfo: { name: string; language: string; framework: string; commands: { build: string; test: string; lint: string } }): void {
  if (env === 'codex') {
    generateCodexConfig(root);
    writeFileSync(join(root, 'AGENTS.md'), generateAgentsMd(projectInfo));
  } else if (env === 'gemini') {
    generateGeminiConfig(root);
    writeFileSync(join(root, 'GEMINI.md'), generateGeminiMd(projectInfo));
  } else if (env === 'cursor') {
    generateCursorConfig(root);
    const cursorRulesDir = join(root, '.cursor', 'rules');
    mkdirSync(cursorRulesDir, { recursive: true });
    writeFileSync(join(cursorRulesDir, 'deckent.mdc'), generateCursorRules(projectInfo));
  }
  // vscode and shell: CLAUDE.md already handled by default flow
}

// ─── Step Functions ─────────────────────────────────────────────────

export function createDirectories(root: string): void {
  ensureDir(join(root, DECKENT_DIR));
  ensureDir(join(root, WORKSPACE_DIR));
  ensureDir(join(root, BRAIN_DIR));
  ensureDir(join(root, BRAIN_DIR, 'sprints'));
  ensureDir(join(root, TASKS_DIR));
  ensureDir(join(root, LOCKS_DIR));
  ensureDir(join(root, CLAUDE_RULES_DIR));
  ensureDir(join(root, PLUGINS_DIR));
  ensureDir(join(root, I18N_DIR));
}

export function clearStaleCaches(root: string): void {
  const staleCaches = ['project-stack.json', 'ci-baseline.json', 'safety-point.json'];
  for (const cache of staleCaches) {
    const cachePath = join(root, DECKENT_DIR, cache);
    if (existsSync(cachePath)) {
      try { writeFileSync(cachePath, '{}'); } catch { /* non-fatal */ }
    }
  }
}

export async function writeConfig(
  root: string,
  mode: PlanMode,
  language: string,
  projectName: string,
): Promise<void> {
  const configPath = join(root, DECKENT_DIR, 'config.json');
  const newConfig: Record<string, unknown> = { mode, language, projectName };
  // Apply tier-based model_strategy from mode preset
  const modePreset = getModePreset(mode);
  if (modePreset) {
    newConfig.model_strategy = modePreset.model_strategy;
  }
  // Auto-detect best spawn backend
  if (platform() === 'win32') {
    newConfig.spawn_backend = 'subprocess';
  } else if (!newConfig.spawn_backend) {
    // Detect Docker — if available, recommend it for isolated workers
    if (isDockerAvailable()) {
      newConfig.spawn_backend = 'docker';
      print('  ✓ Docker detected → spawn_backend: docker (isolated worker containers)');
      // Check if worker image exists
      const { spawnSync: sp } = await import('node:child_process');
      const imgCheck = sp('docker', ['images', '-q', 'deckent-worker:latest'], {
        encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (!(imgCheck.stdout?.trim())) {
        print('  ⚠ deckent-worker image not found — build with:');
        print('    docker build -f Dockerfile.worker -t deckent-worker:latest .');
      }
    }
  }
  if (existsSync(configPath)) {
    try {
      const existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      const merged = deepMerge(existing, newConfig);
      writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');
    } catch {
      writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
    }
  } else {
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n');
  }
}

export function writeStackAndDeckentFile(
  root: string,
  language: string,
  projectName: string,
  stackResult: FullStackResult,
  stackDetected: boolean,
): { buildCmd: string; testCmd: string; lintCmd: string } {
  let buildCmd = 'tsc';
  let testCmd = 'npx vitest run';
  let lintCmd = 'tsc --noEmit';
  if (stackDetected) {
    // Empty string is valid (e.g. Python has no build step) — use explicit check
    if (stackResult.commands.build !== undefined) buildCmd = stackResult.commands.build || 'echo "no build step"';
    if (stackResult.commands.test) testCmd = stackResult.commands.test;
    if (stackResult.commands.lint) lintCmd = stackResult.commands.lint;
  }

  const deckentContent = language === 'tr'
    ? generateDeckentContentTR(projectName, buildCmd, testCmd, lintCmd)
    : generateDeckentContentEN(projectName, buildCmd, testCmd, lintCmd);
  writeIfNotExists(join(root, DECKENT_FILE), deckentContent);

  return { buildCmd, testCmd, lintCmd };
}

export function writeAgentFiles(
  root: string,
  detectedEnv: DetectedEnv,
  options: { force?: boolean; allEnvs?: boolean },
): void {
  // 7. Agent files — additive injection, never overwrite
  writeIfNotExists(join(root, AGENTS_FILE), `@${DECKENT_FILE}\n`);
  ensureDeckentImport(join(root, AGENTS_FILE));
  ensureDeckentImport(join(root, CLAUDE_FILE));

  // 7b. Environment-aware config files
  if (detectedEnv === 'codex') {
    const agentsMdContent = `# AGENTS.md — Deckent Integration
This project uses Deckent for AI agent orchestration.
## Sprint Instructions
- Read DIRECTIVES.md for current sprint goals
- Follow task scope boundaries strictly
- Write tests for all changes
## Project Context
@DECKENT.md
`;
    writeIfNotExists(join(root, AGENTS_FILE), agentsMdContent);
  } else if (detectedEnv === 'gemini') {
    const geminiMdContent = `# GEMINI.md — Deckent Integration
This project uses Deckent for AI agent orchestration.
## Context
@DECKENT.md
## Rules
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion
`;
    writeIfNotExists(join(root, 'GEMINI.md'), geminiMdContent);
  } else if (detectedEnv === 'cursor') {
    const cursorRulesDir = join(root, '.cursor', 'rules');
    const cursorRulePath = join(cursorRulesDir, 'deckent.mdc');
    if (!existsSync(cursorRulePath)) {
      mkdirSync(cursorRulesDir, { recursive: true });
      writeFileSync(cursorRulePath, `---
description: Deckent orchestration rules
globs: ["**/*"]
---
# Deckent Integration
@DECKENT.md
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion
`);
    }
  }

  // 7b2. IDE adapter auto-detection (directory-based)
  try {
    const ideResults = applyIdeAdapters(root, { force: options.force, allEnvs: options.allEnvs });
    for (const r of ideResults) {
      if (r.action === 'created') {
        if (r.path.includes('.cursor')) {
          print('  Created .cursor/rules/deckent.md for Cursor integration');
        } else if (r.path.includes('.vscode')) {
          print('  Created .vscode/mcp.json for VS Code MCP registration');
        }
      }
    }
  } catch { /* non-fatal — IDE adapters are best-effort */ }
}

export function writeMultiEnvConfig(
  root: string,
  projectName: string,
  requestedEnvs: EnvName[],
  stackResult: FullStackResult,
  options: { upgrade?: boolean; force?: boolean },
): void {
  if (requestedEnvs.length === 0) return;

  const envFileMap: Record<string, string> = {
    codex: join(root, 'AGENTS.md'),
    gemini: join(root, 'GEMINI.md'),
    cursor: join(root, '.cursor', 'rules', 'deckent.mdc'),
  };

  // Conflict detection: warn and skip if env files exist without --force or --upgrade
  const envsToApply: EnvName[] = [];
  for (const env of requestedEnvs) {
    const envFile = envFileMap[env];
    if (envFile && existsSync(envFile) && !options.upgrade && !options.force) {
      print(`  Warning: ${envFile} already exists. Overwrite? (use --force)`);
    } else {
      envsToApply.push(env);
    }
  }

  if (envsToApply.length > 0) {
    const projectInfo = {
      name: projectName,
      language: stackResult.language,
      framework: stackResult.framework,
      commands: stackResult.commands,
    };

    for (const env of envsToApply) {
      applyEnvConfig(env, root, projectInfo);
    }
  }

  // Set multi_ide_mode if multiple envs requested
  if (requestedEnvs.length > 1) {
    const multiConfigPath = join(root, DECKENT_DIR, 'config.json');
    try {
      const existing = JSON.parse(readFileSync(multiConfigPath, 'utf-8')) as Record<string, unknown>;
      existing['multi_ide_mode'] = true;
      writeFileSync(multiConfigPath, JSON.stringify(existing, null, 2) + '\n');
    } catch {
      writeFileSync(multiConfigPath, JSON.stringify({ multi_ide_mode: true }, null, 2) + '\n');
    }
  }
}

export function writeDeckSecurityFiles(root: string): void {
  try {
    createDeckTemplate(root);
    ensureDeckGitignore(root);
  } catch { /* non-fatal */ }
}

export function writeClaudeRules(
  root: string,
  writeFile: (path: string, content: string) => void,
  lintCmd: string,
  testCmd: string,
): void {
  writeFile(
    join(root, CLAUDE_RULES_DIR, 'brain.md'),
    `---\npaths: [".tasks/*", ".brain/*", ".contracts/*"]\n---\n# Brain Rules\n- Always read DIRECTIVES.md first\n- Always check usage before planning\n- Plan mode required before execution\n- Write sprint plan as task JSON files in .tasks/\n- Assign model and effort per task with reason\n- Define scope (directories, filesRead, filesWrite) for each task\n- Define GO/NO-GO criteria for each task\n- Evaluate every result: DONE / GO_WITH_TECH_DEBT / NO_GO\n- Cross-dependency: if A's NO-GO caused by B's output, B gets priority fix\n- Update MEMORY.md after every sprint (max 300 lines)\n- Write RETRO.md (overwrite, max 100 lines)\n- Trigger decay if .brain/ exceeds 900 lines\n- Sprint is NEVER left incomplete\n`,
  );
  writeFile(
    join(root, CLAUDE_RULES_DIR, 'auditor.md'),
    `---\npaths: [".dashboard", ".brain/PATTERNS.md"]\n---\n# Auditor Rules\n- NEVER write source code\n- Scan every 30 seconds\n- Read all heartbeat files → detect stale agents (>2min = alert)\n- Run git diff --stat → detect boundary violations\n- Check .locks/ → detect stale locks (>5min)\n- Detect circular dependencies / deadlocks\n- Overwrite .dashboard on every scan (never append)\n- Append new patterns to PATTERNS.md (never overwrite)\n- Write alerts for critical issues\n`,
  );
  writeFile(
    join(root, CLAUDE_RULES_DIR, 'worker-default.md'),
    `---\npaths: ["src/**", "tests/**"]\n---\n# Worker Rules\n- Read your task file first\n- Write plan before writing code\n- Check .locks/ before writing any file\n- Create and update heartbeat file (.tasks/task-{id}.hb)\n- Run lint before marking done (${lintCmd})\n- Run tests before marking done (${testCmd})\n- Coverage goal: minimum 80%\n- Document changes\n- Stay within your assigned scope\n- Write result file (.tasks/task-{id}.result) — REQUIRED\n`,
  );
}

export function writeDirectivesFile(
  root: string,
  language: string,
  stackResult: FullStackResult,
  projectName: string,
): void {
  const directivesContent = language === 'tr'
    ? generateDirectivesTemplateTR(stackResult, projectName)
    : generateDirectivesTemplateEN(stackResult, projectName);
  writeIfNotExists(join(root, DIRECTIVES_FILE), directivesContent);
}

export function writeBrainFiles(
  root: string,
  projectName: string,
  mode: PlanMode,
  language: string,
  stackResult: FullStackResult,
  detectedAnalysis?: { language?: string; framework?: string; testFramework?: string; buildTool?: string },
): void {
  // 10. Brain files (Memory V2: DB-first, .md files are legacy exports)
  writeIfNotExists(join(root, BRAIN_DIR, MEMORY_FILE), '# Learned Patterns\n');
  writeIfNotExists(join(root, BRAIN_DIR, DEBT_FILE), '# Tech Debt\n');
  writeIfNotExists(join(root, BRAIN_DIR, PATTERNS_FILE), '# Detected Patterns\n');
  writeIfNotExists(join(root, BRAIN_DIR, RETRO_FILE), '# Sprint Retrospective\n');
  ensureDir(join(root, BRAIN_DIR, 'exports'));

  // 10-db. Memory V2 DB preload — seed ADRs + identity entry on fresh init
  const dbPath = join(root, BRAIN_DIR, 'memory.db');
  if (!existsSync(dbPath)) {
    try {
      const store = new MemoryStore(dbPath);
      for (const adr of ADR_SEED_DATA) {
        store.insert(adr);
      }
      store.insert(createIdentitySeed(projectName));
      store.close();
    } catch { /* non-fatal — DB preload failure doesn't block init */ }
  }

  // 10a. PROJECT-IDENTITY.md
  const identityLanguage = detectedAnalysis?.language ?? stackResult.language ?? 'unknown';
  const identityFramework = detectedAnalysis?.framework ?? stackResult.framework ?? 'unknown';
  const identityTestFramework = detectedAnalysis?.testFramework ?? stackResult.testFramework ?? 'unknown';
  const identityBuildTool = detectedAnalysis?.buildTool ?? stackResult.buildTool ?? 'unknown';
  try {
    writeIfNotExists(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), generateProjectIdentity({
      projectName,
      sprintId: 'sprint-000',
      totalSprints: 0,
      mode,
      language: identityLanguage,
      framework: identityFramework,
      testFramework: identityTestFramework,
      buildTool: identityBuildTool,
    }));
  } catch {
    writeIfNotExists(join(root, BRAIN_DIR, PROJECT_IDENTITY_FILE), generateProjectIdentity({
      projectName,
      sprintId: 'sprint-000',
      totalSprints: 0,
      mode,
    }));
  }

  // 10a2. Workspace IDENTITY.md
  const runtimeName = identityLanguage.toLowerCase().includes('typescript') || identityLanguage.toLowerCase().includes('javascript')
    ? 'Node.js' : identityLanguage.toLowerCase().includes('python')
    ? 'Python' : identityLanguage.toLowerCase().includes('go')
    ? 'Go' : identityLanguage.toLowerCase().includes('rust')
    ? 'Rust' : identityLanguage.toLowerCase().includes('java')
    ? 'Java' : identityLanguage.toLowerCase().includes('c#') || identityLanguage.toLowerCase().includes('csharp')
    ? '.NET' : identityLanguage !== 'unknown' ? identityLanguage : 'unknown';
  const identityContent = `# Project Identity
Name: ${projectName}
Language: ${identityLanguage !== 'unknown' ? identityLanguage : '(not detected — update manually)'}
Framework: ${identityFramework !== 'unknown' && identityFramework !== 'none' ? identityFramework : '(not detected)'}
Test: ${identityTestFramework !== 'unknown' ? identityTestFramework : '(not detected)'}
Build: ${identityBuildTool !== 'unknown' ? identityBuildTool : '(not detected)'}
Runtime: ${runtimeName !== 'unknown' ? runtimeName : '(not detected)'}
Platform: ${platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'}
`;
  writeIfNotExists(join(root, WORKSPACE_DIR, 'IDENTITY.md'), identityContent);

  // 10a3. TempSkill + TempAgent
  if (identityLanguage !== 'unknown') {
    try {
      let deps: string[] = [];
      try {
        const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
        deps = Object.keys(pkg.dependencies ?? {}).concat(Object.keys(pkg.devDependencies ?? {}));
      } catch {
        try {
          const reqTxt = readFileSync(join(root, 'requirements.txt'), 'utf-8');
          deps = reqTxt.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('==')[0]!.split('>=')[0]!.trim());
        } catch { /* no deps file found */ }
      }

      const projectStack: ProjectStack = {
        language: identityLanguage,
        framework: identityFramework,
        dependencies: deps,
        buildTool: identityBuildTool,
        testFramework: identityTestFramework,
        detectedAt: new Date().toISOString(),
        detectedLanguages: stackResult.detectedLanguages,
      };

      const conventionsSkill = generateProjectConventionsSkill({
        language: identityLanguage,
        framework: identityFramework,
        testFramework: identityTestFramework,
        buildTool: identityBuildTool,
        dependencies: deps,
      });
      const skillDir = join(root, DECKENT_DIR, 'skills', conventionsSkill.id);
      ensureDir(skillDir);
      writeIfNotExists(join(skillDir, 'manifest.json'), JSON.stringify(conventionsSkill, null, 2) + '\n');
      const skillContent = getGeneratedContent(conventionsSkill);
      if (skillContent) {
        writeIfNotExists(join(skillDir, 'SKILL.md'), skillContent);
      }

      const tempAgents = generateTempAgents(projectStack);
      for (const agent of tempAgents) {
        const agentDir = join(root, DECKENT_DIR, 'agents', agent.id);
        ensureDir(agentDir);
        writeIfNotExists(join(agentDir, 'agent.json'), JSON.stringify(agent, null, 2) + '\n');
      }
    } catch { /* non-fatal — temp skills/agents are best-effort */ }
  }

  // 10b. Workspace: TOOLS.md + BOOT.md
  writeIfNotExists(join(root, WORKSPACE_DIR, 'TOOLS.md'), generateToolsContent(root));
  writeIfNotExists(join(root, WORKSPACE_DIR, 'BOOT.md'), generateBootContent(language));

  // 10b2. .deckent/docs/ — user guides
  const docsDir = join(root, DECKENT_DIR, 'docs');
  ensureDir(docsDir);
  writeIfNotExists(join(docsDir, 'quick-start.md'), generateQuickStartDoc(language));
  writeIfNotExists(join(docsDir, 'directives-guide.md'), generateDirectivesGuideDoc(language));
  writeIfNotExists(join(docsDir, 'config-reference.md'), generateConfigReferenceDoc(language));

  // 10c. Bootstrap docs.json
  try {
    if (!loadDocsConfig(root)) {
      saveDocsConfig(root, {
        version: 1,
        docs: [{
          id: 'claude-md',
          path: 'CLAUDE.md',
          autoSections: ['Sprint Metrics'],
          protectedSections: [],
        }],
      });
    }
  } catch { /* non-fatal */ }
}

export function writeI18nFiles(root: string): void {
  const enMessages = {
    sprint_started: 'Sprint {id} started with {count} tasks',
    sprint_complete: 'Sprint {id} complete',
    task_done: 'Task {id}: DONE',
    task_nogo: 'Task {id}: NO_GO',
    plan_approved: 'Plan approved',
    plan_rejected: 'Plan rejected',
  };
  const trMessages = {
    sprint_started: 'Sprint {id} baslatildi, {count} gorev',
    sprint_complete: 'Sprint {id} tamamlandi',
    task_done: 'Gorev {id}: TAMAMLANDI',
    task_nogo: 'Gorev {id}: BASARISIZ',
    plan_approved: 'Plan onaylandi',
    plan_rejected: 'Plan reddedildi',
  };
  writeIfNotExists(join(root, I18N_DIR, 'en.json'), JSON.stringify(enMessages, null, 2) + '\n');
  writeIfNotExists(join(root, I18N_DIR, 'tr.json'), JSON.stringify(trMessages, null, 2) + '\n');
}

export function updateGitignore(root: string): void {
  appendToGitignore(root, [
    TASKS_DIR + '/',
    LOCKS_DIR + '/',
    DASHBOARD_FILE,
    BRAIN_DIR + '/archive/',
  ]);
}

export function writeProviderConfig(
  root: string,
  mode: PlanMode,
  language: string,
  projectName: string,
  providerConfig: { brain_provider: string; worker_provider: string; fallback_provider?: string },
): void {
  const providerConfigPath = join(root, DECKENT_DIR, 'config.json');
  const providerMerge: Record<string, unknown> = {
    brain_provider: providerConfig.brain_provider,
    worker_provider: providerConfig.worker_provider,
  };
  if (providerConfig.fallback_provider) {
    providerMerge['fallback_provider'] = providerConfig.fallback_provider;
  }
  try {
    const existing = JSON.parse(readFileSync(providerConfigPath, 'utf-8')) as Record<string, unknown>;
    const merged = deepMerge(existing, providerMerge);
    writeFileSync(providerConfigPath, JSON.stringify(merged, null, 2) + '\n');
  } catch {
    const freshConfig: Record<string, unknown> = { mode, language, projectName, ...providerMerge };
    writeFileSync(providerConfigPath, JSON.stringify(freshConfig, null, 2) + '\n');
  }
}
