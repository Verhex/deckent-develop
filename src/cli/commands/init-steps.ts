/**
 * init-steps.ts — Core filesystem operations for deckent init.
 *
 * Directory creation, config writing, brain file setup, DB preload,
 * IDE adapter application, gitignore management, and environment config.
 *
 * Split from init.ts (Sprint 144 Task 1).
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, cpSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { platform } from 'node:os';
import { fileURLToPath } from 'node:url';
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
  PATTERNS_FILE,
  RETRO_FILE,
  PROJECT_IDENTITY_FILE,
} from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { regenerateRules } from '../../core/rule-generator.js';
import { deepMerge } from '../../core/config.js';
import { getModePreset } from '../../core/mode-presets.js';
import { detectSystemCapacity, suggestMaxWorkers, suggestSpawnBackend } from '../../core/system-capacity.js';
import { generateProjectIdentity } from '../../orchestra/sprint-reporter.js';
import { generateProjectConventionsSkill, getGeneratedContent, generateTempAgents } from '../../orchestra/temp-skill-generator.js';
import { seedDocsConfig } from '../../orchestra/managed-docs/docs-config.js';
import { ADR_SEED_DATA, createIdentitySeed } from '../../core/adr-seed.js';
import { MemoryStore } from '../../core/memory-store.js';
import { print } from '../helpers/output.js';
import { generateCodexConfig } from '../helpers/codex-config.js';
import { generateGeminiConfig } from '../helpers/gemini-config.js';
import { generateCursorConfig } from '../helpers/cursor-config.js';
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
 * Apply per-environment IDE config for a single environment.
 *
 * Non-destructive (ADR-013 thin-adapter): deckent only injects a `@DECKENT.md`
 * reference into the user's AGENTS.md / GEMINI.md via ensureDeckentImport — it
 * NEVER overwrites the user's existing adapter files or their own agents.
 * Greenfield → the thin adapter is created; brownfield → the reference is
 * prepended and all existing user content is preserved. MCP/IDE config
 * (.codex/config.toml, .gemini/settings.json, .cursor/mcp.json) is upserted.
 */
export function applyEnvConfig(env: EnvName, root: string): void {
  if (env === 'codex') {
    generateCodexConfig(root);
    ensureDeckentImport(join(root, AGENTS_FILE));
  } else if (env === 'gemini') {
    generateGeminiConfig(root);
    ensureDeckentImport(join(root, 'GEMINI.md'));
  } else if (env === 'cursor') {
    // generateCursorConfig writes .cursor/mcp.json + .cursor/rules/deckent.mdc
    generateCursorConfig(root);
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
  // ─── System Capacity Auto-Detection (Sprint 150 MVP) ───────────────
  const capacity = detectSystemCapacity();

  // Auto-detect spawn_backend
  if (platform() === 'win32') {
    newConfig.spawn_backend = 'subprocess';
  } else if (!newConfig.spawn_backend) {
    const suggestedBackend = suggestSpawnBackend(capacity);
    newConfig.spawn_backend = suggestedBackend;
    if (suggestedBackend === 'docker') {
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

  // Auto-suggest max_workers if user hasn't configured it
  if (existsSync(configPath)) {
    try {
      const existing = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      if (existing['max_workers'] === undefined) {
        const suggested = suggestMaxWorkers(capacity);
        newConfig.max_workers = suggested;
        newConfig._auto_detected = { max_workers: true, totalRamGB: capacity.totalRamGB, cpuCores: capacity.cpuCores };
        print(`  ✓ System capacity → max_workers: ${suggested} (${capacity.totalRamGB}GB RAM, ${capacity.cpuCores} cores)`);
      }
    } catch { /* existing config parse fail — handled by merge below */ }
  } else {
    // Fresh init — always suggest
    const suggested = suggestMaxWorkers(capacity);
    newConfig.max_workers = suggested;
    newConfig._auto_detected = { max_workers: true, totalRamGB: capacity.totalRamGB, cpuCores: capacity.cpuCores };
    print(`  ✓ System capacity → max_workers: ${suggested} (${capacity.totalRamGB}GB RAM, ${capacity.cpuCores} cores)`);
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

export function writeMultiEnvConfig(root: string, requestedEnvs: EnvName[]): void {
  if (requestedEnvs.length === 0) return;

  // Additive injection — applyEnvConfig only prepends a @DECKENT.md reference
  // and upserts MCP config; it never overwrites the user's adapter files. No
  // overwrite gate / --force needed — brownfield projects are wired safely.
  for (const env of requestedEnvs) {
    applyEnvConfig(env, root);
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

/**
 * Generate rule files for ALL supported providers (Claude, Codex, Gemini,
 * Cursor) from the canonical rule-generator templates. Single source —
 * replaces the old hardcoded inline `.claude/rules/` writes so every provider
 * gets self-contained rules at init time. regenerateRules() also picks up
 * ADRs from .brain/memory.db when re-run on an existing project.
 */
export async function writeRuleFiles(root: string): Promise<void> {
  await regenerateRules(root);
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
  // Task #4e: no DEBT.md stub — tech debt is DB-first (memory.db).
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

  // 10a2b. Seed built-in agents + skills from bundled builtins (Sprint 150 T-031)
  seedBuiltins(root);

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

  // 10c. Bootstrap docs.json (template-based)
  try {
    seedDocsConfig(root);
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
    // Memory V2: memory.db (+ WAL sidecars, backups) and the ERRORS.md
    // runtime log are generated artifacts — never commit them (B11).
    BRAIN_DIR + '/memory.db*',
    BRAIN_DIR + '/ERRORS.md',
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

// ─── Built-in Seed ──────────────────────────────────────────────────

/**
 * Seed built-in agents and skills from the bundled builtins directory.
 * Uses writeIfNotExists pattern — existing user overrides are preserved.
 *
 * The builtins are stored in dist/core/builtins/ (npm package) or
 * src/core/builtins/ (dev workspace). This function resolves the correct
 * path at runtime and copies agent/skill definitions to the user's
 * .deckent/agents/ and .deckent/skills/ directories.
 *
 * Sprint 150 Task 031 — P0 Beta GA Blocker.
 */
export function seedBuiltins(root: string): void {
  try {
    const builtinsDir = resolveBuiltinsDir();
    if (!builtinsDir) return;

    for (const category of ['agents', 'skills'] as const) {
      const srcDir = join(builtinsDir, category);
      if (!existsSync(srcDir)) continue;

      const dstDir = join(root, DECKENT_DIR, category);
      ensureDir(dstDir);

      let entries: string[];
      try {
        entries = readdirSync(srcDir);
      } catch { continue; }

      for (const entry of entries) {
        const srcEntry = join(srcDir, entry);
        try {
          // Only process directories
          const stat = statSync(srcEntry);
          if (!stat.isDirectory()) continue;
        } catch { continue; }

        const dstEntry = join(dstDir, entry);
        // Idempotent: only seed if directory doesn't exist (preserve user overrides)
        if (!existsSync(dstEntry)) {
          try {
            cpSync(srcEntry, dstEntry, { recursive: true });
          } catch { /* best-effort — non-fatal */ }
        }
      }
    }
  } catch { /* non-fatal — built-in seeding failure doesn't block init */ }
}

/**
 * Resolve the builtins directory at runtime.
 * Checks dist/core/builtins/ first (npm install), then src/core/builtins/ (dev).
 */
function resolveBuiltinsDir(): string | null {
  // This file lives at {root}/dist/cli/commands/init-steps.js (npm) or
  // {root}/src/cli/commands/init-steps.ts (dev). Either way, builtins
  // are at ../../core/builtins/ relative to this file's directory.
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const thisDir = dirname(thisFile);
    const builtinsDir = join(thisDir, '..', '..', 'core', 'builtins');
    if (existsSync(builtinsDir)) return builtinsDir;
  } catch { /* no builtins available */ }
  return null;
}
