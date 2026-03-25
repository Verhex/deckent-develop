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
    .description('Install a skill from local path or git URL')
    .option('--force', 'Overwrite existing')
    .action(async (source: string, opts: { force?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const skillsDir = getSkillsDir(root);

        if (isGitUrl(source)) {
          // Clone from git
          const tmpDir = join(skillsDir, '.tmp-clone');
          if (existsSync(tmpDir)) {
            rmSync(tmpDir, { recursive: true, force: true });
          }

          const cloneResult = spawnSync('git', ['clone', '--depth', '1', source, tmpDir], {
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

          print(`Skill "${manifestData.name}" installed from git.`);
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

          cpSync(sourcePath, targetDir, { recursive: true });

          print(`Skill "${manifestData.name}" installed from ${sourcePath}.`);
        }
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
    .action(async (name: string) => {
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
