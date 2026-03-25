import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import type { SkillDefinition } from '../../core/skill-types.js';
import { createSkillDefinition } from '../../core/skill-types.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { registerSkillMarketplace } from './skill-marketplace.js';
import { ErrorRegistry } from '../../core/errors.js';

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
        skills.push(JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillDefinition);
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

function validateManifest(data: unknown): data is SkillDefinition {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.version === 'string'
  );
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
  const skillCmd = program.command('skill').description('Manage skill pool');

  // ─── skill list ─────────────────────────────────────────────────
  skillCmd
    .command('list')
    .description('List all skills')
    .option('--json', 'Output as JSON')
    .option('--category <cat>', 'Filter by category')
    .action(async (opts: { json?: boolean; category?: string }) => {
      try {
        const root = resolveProjectRoot();
        let skills = loadAllSkills(root);

        if (opts.category) {
          skills = skills.filter((s) => s.category === opts.category);
        }

        if (skills.length === 0) {
          print('No skills found. Create one with: deckent skill create <name>');
          return;
        }

        if (opts.json) {
          print(JSON.stringify(skills, null, 2));
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
    .command('create <name>')
    .description('Create a custom skill')
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
    .command('install <source>')
    .description('Install a skill from local path or git URL (supports version pinning: url#tag)')
    .option('--force', 'Overwrite existing')
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

          const cloneResult = spawnSync('git', cloneArgs, {
            encoding: 'utf-8',
            timeout: 30_000,
          });

          if (cloneResult.status !== 0) {
            throw ErrorRegistry.createError('DECKENT_E026', { message: `Git clone failed: ${cloneResult.stderr || 'unknown error'}` });
          }

          const manifestPath = join(tmpDir, 'manifest.json');
          if (!existsSync(manifestPath)) {
            rmSync(tmpDir, { recursive: true, force: true });
            throw ErrorRegistry.createError('DECKENT_E027');
          }

          const manifestData = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          if (!validateManifest(manifestData)) {
            rmSync(tmpDir, { recursive: true, force: true });
            throw ErrorRegistry.createError('DECKENT_E028');
          }

          const targetDir = join(skillsDir, manifestData.id);
          if (existsSync(targetDir) && !opts.force) {
            rmSync(tmpDir, { recursive: true, force: true });
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
          rmSync(tmpDir, { recursive: true, force: true });

          // Compute checksum and save source meta (non-fatal)
          let checksum: string | undefined;
          try {
            checksum = computeDirectoryHash(targetDir);
            saveSourceMeta(targetDir, {
              source,
              type: 'git',
              installedAt: new Date().toISOString(),
              checksum,
            });
          } catch {
            // checksum is optional — skip on failure
          }

          print(`Skill "${manifestData.name}" installed from git.`);
          if (ref) print(`  Version: ${ref}`);
          if (checksum) print(`  Checksum (SHA-256): ${checksum}`);
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
    .command('update <name>')
    .description('Update an installed skill from its original source')
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
    .command('enable <name>')
    .description('Enable a skill')
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
    .command('disable <name>')
    .description('Disable a skill')
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
    .command('delete <name>')
    .description('Delete a skill')
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
    .command('info <name>')
    .description('Show skill details')
    .option('--stats', 'Show usage statistics')
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

        if (opts.stats && manifest.stats) {
          print('');
          print('  Usage Statistics:');
          print(`    Total uses:      ${manifest.stats.totalUses}`);
          print(`    Success rate:    ${Math.round(manifest.stats.successRate * 100)}%`);
          print(`    Avg coverage:    ${manifest.stats.avgCoverage}%`);
          print(`    Last sprint:     ${manifest.stats.lastUsedInSprint || 'never'}`);
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
  registerSkillMarketplace(skillCmd);
}
