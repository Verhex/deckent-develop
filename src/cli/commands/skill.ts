import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { Command } from 'commander';
import type { SkillDefinition } from '../../core/skill-types.js';
import { createSkillDefinition } from '../../core/skill-types.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { snapshotSkillCatalog } from '../../core/skill-pool.js';
import { registerSkillMarketplace } from './skill-marketplace.js';
import { ErrorRegistry } from '../../core/errors.js';
import { readCatalogStats } from '../../core/catalog-stats-read-model.js';
import { analyzeNewSkill, persistSkillActivation } from '../../orchestra/ecosystem-intelligence.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';
// Note: `skill publish` is registered by registerSkillMarketplace() below —
// the unified pipeline (sandbox + Ed25519 sign + registry upload) lives there.

// ─── Constants ──────────────────────────────────────────────────────

const SKILLS_DIR = '.deckent/skills';

// ─── Helpers ────────────────────────────────────────────────────────

function getSkillsDir(root: string): string {
  return join(root, SKILLS_DIR);
}

function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name) && name.length <= 64;
}

export function loadSkillManifest(skillDir: string): SkillDefinition {
  const manifestPath = join(skillDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw ErrorRegistry.createError('DECKENT_E023', { message: `Skill manifest not found: ${manifestPath}` });
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillDefinition;
}

/**
 * Derive display-safe trigger keywords from a v2 manifest's `activation.rules`
 * when the manifest has no `triggers` array of its own (v2 skills route via
 * structured TaskDNA conditions, not literal keywords). Reads the
 * string-valued conditions (e.g. `{"intent.primary":"security"}` -> "security")
 * as a display stand-in, deduped. Returns [] when there are no rules either.
 */
function deriveTriggersFromActivation(activation: SkillDefinition['activation']): string[] {
  if (!activation?.rules?.length) return [];
  const values = new Set<string>();
  for (const rule of activation.rules) {
    for (const value of Object.values(rule.when)) {
      if (typeof value === 'string') values.add(value);
    }
  }
  return Array.from(values);
}

/**
 * Read-only render-safety normalization. v2 manifests (`manifestVersion: 2`,
 * e.g. the shipped `secure-coding` skill) may omit v1-only fields entirely,
 * which previously crashed `skill list`'s table render on
 * `undefined.slice()`. Fills in safe in-memory defaults for every field the
 * render touches — never migrates the schema or writes back to disk.
 */
function normalizeSkillForRender(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    name: typeof skill.name === 'string' && skill.name.length > 0 ? skill.name : skill.id,
    description: typeof skill.description === 'string' ? skill.description : '',
    category: skill.category ?? 'domain',
    enabled: typeof skill.enabled === 'boolean' ? skill.enabled : true,
    priority: typeof skill.priority === 'number' ? skill.priority : 0,
    triggers: Array.isArray(skill.triggers) ? skill.triggers : deriveTriggersFromActivation(skill.activation),
  };
}

export function loadAllSkills(root: string): SkillDefinition[] {
  const skillsDir = getSkillsDir(root);
  if (!existsSync(skillsDir)) {
    return [];
  }
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skills: SkillDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(skillsDir, entry.name, 'manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillDefinition;
        skills.push(normalizeSkillForRender(raw));
      } catch {
        // Skip malformed skill manifests
      }
    }
  }
  return skills;
}

export function saveSkillManifest(root: string, skill: SkillDefinition): void {
  const skillDir = join(getSkillsDir(root), skill.id);
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true });
  }
  writeFileSync(
    join(skillDir, 'manifest.json'),
    JSON.stringify(skill, null, 2) + '\n',
  );
}

// H) Zod schema for manifest validation — stricter than the old type guard
const SkillManifestSchema = z.object({
  id: z.string().min(1, 'id must be a non-empty string'),
  name: z.string().min(1, 'name must be a non-empty string'),
  version: z.string().min(1, 'version must be a non-empty string'),
  description: z.string().optional(),
  category: z.string().optional(),
});

/**
 * H) Validate a skill manifest using Zod for more descriptive error messages.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateManifestWithZod(data: unknown): { valid: boolean; errors: string[] } {
  const result = SkillManifestSchema.safeParse(data);
  if (result.success) return { valid: true, errors: [] };
  return { valid: false, errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
}

function validateManifest(data: unknown): data is SkillDefinition {
  // H) Use Zod for validation
  return validateManifestWithZod(data).valid;
}

function isGitUrl(source: string): boolean {
  return (
    source.startsWith('https://') ||
    source.startsWith('git://') ||
    source.startsWith('git@') ||
    source.endsWith('.git')
  );
}

/**
 * Parse git URL with optional version pinning.
 * Supports: https://github.com/user/repo#v1.0.0 or https://github.com/user/repo@v1.0.0
 * Returns { url, ref } where ref is the git ref (branch/tag/commit).
 */
export function parseGitSource(source: string): { url: string; ref?: string } {
  // Check for #ref suffix
  const hashIdx = source.lastIndexOf('#');
  if (hashIdx > 0 && !source.startsWith('#')) {
    return { url: source.slice(0, hashIdx), ref: source.slice(hashIdx + 1) };
  }
  // Check for @ref suffix (but not @host part of git@github.com)
  const atIdx = source.lastIndexOf('@');
  if (atIdx > 0 && !source.startsWith('git@')) {
    return { url: source.slice(0, atIdx), ref: source.slice(atIdx + 1) };
  }
  return { url: source };
}

/**
 * Compute SHA-256 hash of all files in a directory (for checksum verification).
 */
export function computeDirectoryHash(dirPath: string): string {
  const hash = createHash('sha256');
  const files: string[] = [];

  function collectFiles(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  collectFiles(dirPath);
  files.sort(); // Deterministic order

  for (const file of files) {
    hash.update(readFileSync(file));
  }
  return hash.digest('hex');
}

/**
 * Copy a directory, excluding node_modules.
 * Uses cpSync with a filter function to skip node_modules directories.
 */
function cpSyncExcludeNodeModules(src: string, dest: string): void {
  cpSync(src, dest, {
    recursive: true,
    filter: (source: string) => !source.includes('node_modules'),
  });
}

const SKILL_TEMPLATE = `# Skill: {name}

## Expertise
Describe what this skill specializes in.

## Patterns
- Follow project conventions
- Apply best practices for this domain
- Write clean, maintainable code

## Triggers
Keywords or patterns that should activate this skill.
`;

// ─── Source tracking for update support ─────────────────────────────

interface SkillSourceMeta {
  source: string;
  type: 'git' | 'local';
  installedAt: string;
  checksum?: string;
}

function saveSourceMeta(skillDir: string, meta: SkillSourceMeta): void {
  writeFileSync(join(skillDir, '.source.json'), JSON.stringify(meta, null, 2) + '\n');
}

function loadSourceMeta(skillDir: string): SkillSourceMeta | null {
  const metaPath = join(skillDir, '.source.json');
  if (!existsSync(metaPath)) return null;
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8')) as SkillSourceMeta;
  } catch {
    return null;
  }
}

// ─── Registration ───────────────────────────────────────────────────

export function registerSkill(program: Command): void {
  const skillCmd = program.command('skill').description(getMessage('cli.skill.desc', getLanguage(undefined)));

  // ─── skill list ─────────────────────────────────────────────────
  skillCmd
    .command('list')
    .description(getMessage('cli.skill.list.desc', getLanguage(undefined)))
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
    .option('--category <cat>', memoryCatalogMessage('cli.memcat.skill.opt.category', getLanguage(undefined)))
    .action(async (opts: { json?: boolean; category?: string }) => {
      try {
        const root = resolveProjectRoot();
        // S5 (sprint-523 task 7): the list consumes the canonical catalog
        // snapshot — same read model as MCP and the S8 determinism gate. The
        // legacy raw scan (loadAllSkills) stays only for non-catalog commands.
        const snapshot = snapshotSkillCatalog(root);
        const catalogStats = readCatalogStats(root);
        let skills = snapshot.entries.map((entry) => {
          const rendered = normalizeSkillForRender(entry.definition as unknown as SkillDefinition);
          // The catalog normalizer stamps `triggers: []` on a manifest that
          // declared none, which starved the v2 activation-derived triggers the
          // raw-scan path used to render (born-558 pin) — an EMPTY list still
          // derives; an authored list still wins.
          if (rendered.triggers.length === 0) {
            rendered.triggers = deriveTriggersFromActivation((entry.definition as SkillDefinition).activation);
          }
          return {
          ...rendered,
          layer: entry.layer,
          disposition: entry.disposition,
          masked: entry.masked,
          profileState: (entry.definition as { routing?: { profileState?: string } }).routing?.profileState ?? null,
          stats: catalogStats.skills[entry.id] ?? null,
        };});

        if (opts.category) {
          skills = skills.filter((s) => s.category === opts.category);
        }

        // JSON first: an empty catalog is `[]` on stdout, not the human "create one"
        // hint — the machine surface owes exactly one document.
        if (opts.json) {
          print(JSON.stringify(skills, null, 2));
          return;
        }

        if (skills.length === 0) {
          print('No skills found. Create one with: deckent skill create <name>');
          return;
        }

        const headers = ['Name', 'Category', 'Status', 'Triggers', 'Priority'];
        const rows = skills.map((s) => [
          s.name,
          s.category,
          s.enabled ? 'enabled' : 'disabled',
          s.triggers.slice(0, 3).join(', ') + (s.triggers.length > 3 ? '...' : ''),
          String(s.priority),
        ]);
        print(formatTable(headers, rows));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── skill create ───────────────────────────────────────────────
  skillCmd
    .command('create')
    .argument('<name>', memoryCatalogMessage('cli.memcat.skill.arg.new_name', getLanguage(undefined)))
    .description(getMessage('cli.skill.create.desc', getLanguage(undefined)))
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();

        if (!isValidSkillName(name)) {
          throw ErrorRegistry.createError('DECKENT_E024', {
            message: `Invalid skill name "${name}". Use alphanumeric characters and hyphens only.`,
          });
        }

        const skillDir = join(getSkillsDir(root), name);
        if (existsSync(join(skillDir, 'manifest.json'))) {
          throw ErrorRegistry.createError('DECKENT_E025', { message: `Skill "${name}" already exists.` });
        }

        const skill = createSkillDefinition({
          id: name,
          name,
          description: `Custom skill: ${name}`,
        });

        mkdirSync(skillDir, { recursive: true });
        writeFileSync(
          join(skillDir, 'manifest.json'),
          JSON.stringify(skill, null, 2) + '\n',
        );
        writeFileSync(
          join(skillDir, 'SKILL.md'),
          SKILL_TEMPLATE.replace('{name}', name),
        );

        print(`Skill "${name}" created at ${skillDir}`);
        print('  - manifest.json');
        print('  - SKILL.md');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── skill install ──────────────────────────────────────────────
  skillCmd
    .command('install')
    .argument('<source>', memoryCatalogMessage('cli.memcat.skill.arg.source', getLanguage(undefined)))
    .description(getMessage('cli.skill.install.desc', getLanguage(undefined)))
    .option('--force', memoryCatalogMessage('cli.memcat.skill.opt.force', getLanguage(undefined)))
    .action(async (source: string, opts: { force?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const skillsDir = getSkillsDir(root);

        if (isGitUrl(source) || source.includes('#')) {
          const { url, ref } = parseGitSource(source);

          // Clone from git with optional version pinning
          const tmpDir = join(skillsDir, '.tmp-clone');
          if (existsSync(tmpDir)) {
            rmSync(tmpDir, { recursive: true, force: true });
          }

          const cloneArgs = ['clone', '--depth', '1'];
          if (ref) {
            cloneArgs.push('--branch', ref);
          }
          cloneArgs.push(url, tmpDir);

          // H) Increased timeout: 30s → 60s for slow networks
          const cloneResult = spawnSync('git', cloneArgs, {
            encoding: 'utf-8',
            timeout: 60_000,
          });

          // H) Ensure tmp dir is always cleaned up via try/finally
          let gitInstallName = '';
          let gitInstallRef = ref;
          let gitInstallChecksum: string | undefined;
          try {
            if (cloneResult.status !== 0) {
              throw ErrorRegistry.createError('DECKENT_E026', { message: `Git clone failed: ${cloneResult.stderr || 'unknown error'}` });
            }

            const manifestPath = join(tmpDir, 'manifest.json');
            if (!existsSync(manifestPath)) {
              throw ErrorRegistry.createError('DECKENT_E027');
            }

            const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            // H) Use Zod-based validation for better error messages
            const manifestValidation = validateManifestWithZod(manifestData);
            if (!manifestValidation.valid) {
              throw ErrorRegistry.createError('DECKENT_E028', { message: `Invalid manifest: ${manifestValidation.errors.join(', ')}` });
            }

            const targetDir = join(skillsDir, manifestData.id);
            if (existsSync(targetDir) && !opts.force) {
              throw ErrorRegistry.createError('DECKENT_E025', { message: `Skill "${manifestData.id}" already exists. Use --force to overwrite.` });
            }

            if (existsSync(targetDir)) {
              rmSync(targetDir, { recursive: true, force: true });
            }

            // Remove .git directory from clone
            const dotGitDir = join(tmpDir, '.git');
            if (existsSync(dotGitDir)) {
              rmSync(dotGitDir, { recursive: true, force: true });
            }

            cpSync(tmpDir, targetDir, { recursive: true });

            // Compute checksum and save source meta (non-fatal)
            try {
              gitInstallChecksum = computeDirectoryHash(targetDir);
              saveSourceMeta(targetDir, {
                source,
                type: 'git',
                installedAt: new Date().toISOString(),
                checksum: gitInstallChecksum,
              });
            } catch {
              // checksum is optional — skip on failure
            }

            // Auto-generate V2 activation rules for intent-based routing
            try {
              const activation = analyzeNewSkill(targetDir);
              persistSkillActivation(targetDir, activation);
            } catch {
              // Non-fatal: activation rule generation is best-effort
            }

            gitInstallName = manifestData.name as string;
          } finally {
            // H) Always clean up tmp dir regardless of success or failure
            if (existsSync(tmpDir)) {
              try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
          }

          print(`Skill "${gitInstallName}" installed from git.`);
          if (gitInstallRef) print(`  Version: ${gitInstallRef}`);
          if (gitInstallChecksum) print(`  Checksum (SHA-256): ${gitInstallChecksum}`);
        } else {
          // Install from local path
          const sourcePath = resolve(source);
          if (!existsSync(sourcePath)) {
            throw ErrorRegistry.createError('DECKENT_E029', { message: `Source path not found: ${sourcePath}` });
          }

          const stat = statSync(sourcePath);
          if (!stat.isDirectory()) {
            throw ErrorRegistry.createError('DECKENT_E030', { message: `Source must be a directory: ${sourcePath}` });
          }

          const manifestPath = join(sourcePath, 'manifest.json');
          if (!existsSync(manifestPath)) {
            throw ErrorRegistry.createError('DECKENT_E027', { message: 'Source directory does not contain manifest.json' });
          }

          const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          if (!validateManifest(manifestData)) {
            throw ErrorRegistry.createError('DECKENT_E028');
          }

          const targetDir = join(skillsDir, manifestData.id);
          if (existsSync(targetDir) && !opts.force) {
            throw ErrorRegistry.createError('DECKENT_E025', { message: `Skill "${manifestData.id}" already exists. Use --force to overwrite.` });
          }

          if (!existsSync(skillsDir)) {
            mkdirSync(skillsDir, { recursive: true });
          }

          if (existsSync(targetDir)) {
            rmSync(targetDir, { recursive: true, force: true });
          }

          // Exclude node_modules on local install
          cpSyncExcludeNodeModules(sourcePath, targetDir);

          // Compute checksum and save source meta (non-fatal)
          let checksum: string | undefined;
          try {
            checksum = computeDirectoryHash(targetDir);
            saveSourceMeta(targetDir, {
              source: sourcePath,
              type: 'local',
              installedAt: new Date().toISOString(),
              checksum,
            });
          } catch {
            // checksum is optional — skip on failure
          }

          // Auto-generate V2 activation rules for intent-based routing
          try {
            const activation = analyzeNewSkill(targetDir);
            persistSkillActivation(targetDir, activation);
          } catch {
            // Non-fatal: activation rule generation is best-effort
          }

          print(`Skill "${manifestData.name}" installed from ${sourcePath}.`);
          if (checksum) print(`  Checksum (SHA-256): ${checksum}`);
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── skill update ──────────────────────────────────────────────
  skillCmd
    .command('update')
    .argument('<name>', memoryCatalogMessage('cli.memcat.skill.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.skill.update.desc', getLanguage(undefined)))
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const skillDir = join(getSkillsDir(root), name);

        if (!existsSync(skillDir)) {
          throw ErrorRegistry.createError('DECKENT_E023', { message: `Skill "${name}" not found.` });
        }

        const meta = loadSourceMeta(skillDir);
        if (!meta) {
          throw new Error(`No source metadata found for skill "${name}". Cannot update — was it installed via "skill install"?`);
        }

        print(`Updating skill "${name}" from ${meta.source}...`);

        // Re-install with --force by invoking install logic
        const skillsDir = getSkillsDir(root);

        if (meta.type === 'git') {
          const { url, ref } = parseGitSource(meta.source);
          const tmpDir = join(skillsDir, '.tmp-clone');
          if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });

          const cloneArgs = ['clone', '--depth', '1'];
          if (ref) cloneArgs.push('--branch', ref);
          cloneArgs.push(url, tmpDir);

          const cloneResult = spawnSync('git', cloneArgs, { encoding: 'utf-8', timeout: 30_000 });
          if (cloneResult.status !== 0) {
            throw new Error(`Git clone failed: ${cloneResult.stderr || 'unknown error'}`);
          }

          const manifestPath = join(tmpDir, 'manifest.json');
          if (!existsSync(manifestPath)) {
            rmSync(tmpDir, { recursive: true, force: true });
            throw new Error('No manifest.json in cloned repository');
          }

          const dotGitDir = join(tmpDir, '.git');
          if (existsSync(dotGitDir)) rmSync(dotGitDir, { recursive: true, force: true });

          rmSync(skillDir, { recursive: true, force: true });
          cpSync(tmpDir, skillDir, { recursive: true });
          rmSync(tmpDir, { recursive: true, force: true });
        } else {
          const sourcePath = meta.source;
          if (!existsSync(sourcePath)) {
            throw new Error(`Source path no longer exists: ${sourcePath}`);
          }
          rmSync(skillDir, { recursive: true, force: true });
          cpSyncExcludeNodeModules(sourcePath, skillDir);
        }

        const newChecksum = computeDirectoryHash(skillDir);
        saveSourceMeta(skillDir, {
          ...meta,
          installedAt: new Date().toISOString(),
          checksum: newChecksum,
        });

        print(`Skill "${name}" updated successfully.`);
        print(`  Checksum (SHA-256): ${newChecksum}`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── skill enable ──────────────────────────────────────────────
  skillCmd
    .command('enable')
    .argument('<name>', memoryCatalogMessage('cli.memcat.skill.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.skill.enable.desc', getLanguage(undefined)))
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const skillDir = join(getSkillsDir(root), name);
        const manifestPath = join(skillDir, 'manifest.json');
        if (!existsSync(manifestPath)) {
          throw ErrorRegistry.createError('DECKENT_E023', { message: `Skill "${name}" not found.` });
        }
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillDefinition;
        manifest.enabled = true;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        print(`Skill "${name}" enabled.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── skill disable ─────────────────────────────────────────────
  skillCmd
    .command('disable')
    .argument('<name>', memoryCatalogMessage('cli.memcat.skill.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.skill.disable.desc', getLanguage(undefined)))
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const skillDir = join(getSkillsDir(root), name);
        const manifestPath = join(skillDir, 'manifest.json');
        if (!existsSync(manifestPath)) {
          throw ErrorRegistry.createError('DECKENT_E023', { message: `Skill "${name}" not found.` });
        }
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillDefinition;
        manifest.enabled = false;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        print(`Skill "${name}" disabled.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── skill delete ──────────────────────────────────────────────
  skillCmd
    .command('delete')
    .argument('<name>', memoryCatalogMessage('cli.memcat.skill.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.skill.delete.desc', getLanguage(undefined)))
    .action(async (name: string) => {
      try {
        const root = resolveProjectRoot();
        const skillDir = join(getSkillsDir(root), name);
        if (!existsSync(skillDir)) {
          throw ErrorRegistry.createError('DECKENT_E023', { message: `Skill "${name}" not found.` });
        }
        rmSync(skillDir, { recursive: true, force: true });
        print(`Skill "${name}" deleted.`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── skill info ───────────────────────────────────────────────
  skillCmd
    .command('info')
    .argument('<name>', memoryCatalogMessage('cli.memcat.skill.arg.name', getLanguage(undefined)))
    .description(getMessage('cli.skill.info.desc', getLanguage(undefined)))
    .option('--stats', memoryCatalogMessage('cli.memcat.skill.opt.stats', getLanguage(undefined)))
    .action(async (name: string, opts: { stats?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const skillDir = join(getSkillsDir(root), name);
        const manifestPath = join(skillDir, 'manifest.json');
        if (!existsSync(manifestPath)) {
          throw ErrorRegistry.createError('DECKENT_E023', { message: `Skill "${name}" not found.` });
        }
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillDefinition;
        print(`Skill: ${manifest.name}`);
        print(`  ID:       ${manifest.id}`);
        print(`  Version:  ${manifest.version}`);
        print(`  Category: ${manifest.category}`);
        print(`  Enabled:  ${manifest.enabled}`);
        print(`  Priority: ${manifest.priority}`);
        if (manifest.triggers && manifest.triggers.length > 0) {
          print(`  Triggers: ${manifest.triggers.join(', ')}`);
        }

        if (opts.stats) {
          const stats = readCatalogStats(root).skills[manifest.id];
          print('');
          print('  Usage Statistics:');
          print(`    Total uses:      ${stats?.uses ?? 0}`);
          print(`    Success rate:    ${stats?.successPercent === null || stats === undefined ? 'never' : `${stats.successPercent}%`}`);
          print(`    Last sprint:     ${stats?.lastUsedInSprint ?? 'never'}`);
        }

        const meta = loadSourceMeta(skillDir);
        if (meta) {
          print('');
          print(`  Source: ${meta.source} (${meta.type})`);
          print(`  Installed: ${meta.installedAt}`);
          if (meta.checksum) {
            print(`  Checksum: ${meta.checksum}`);
          }
        }

        const skillMdPath = join(skillDir, 'SKILL.md');
        if (existsSync(skillMdPath)) {
          const content = readFileSync(skillMdPath, 'utf-8');
          const lines = content.split('\n').slice(0, 10);
          print('\n--- SKILL.md (first 10 lines) ---');
          print(lines.join('\n'));
        }
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });

  // ─── marketplace subcommands (search, publish) ────────────────────
  // The unified `skill publish <skillPath>` command (sandbox + Ed25519 sign +
  // registry upload) is registered here. Sprint 150 Hot Fix: previously this
  // file and skill-marketplace.ts both added a `publish` sub-command to the
  // same parent, which caused commander to throw on CLI boot.
  registerSkillMarketplace(skillCmd);
}
