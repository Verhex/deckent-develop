// ─── Skill Marketplace CLI ───────────────────────────────────────────────────
// Commands: deckent skill search <query>, deckent skill publish

import type { Command } from 'commander';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RegistryClient } from '../../core/marketplace/registry-client.js';
import { MarketplaceAuth } from '../../core/marketplace/marketplace-auth.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+/.test(version);
}

function validateManifestForPublish(manifest: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!manifest.id || typeof manifest.id !== 'string') errors.push('Missing or invalid "id"');
  if (!manifest.name || typeof manifest.name !== 'string') errors.push('Missing or invalid "name"');
  if (!manifest.version || typeof manifest.version !== 'string') errors.push('Missing or invalid "version"');
  else if (!validateSemver(manifest.version as string)) errors.push('Version must follow semver (e.g. 1.0.0)');
  if (!manifest.description || typeof manifest.description !== 'string') errors.push('Missing or invalid "description"');
  return errors;
}

// ─── Local Skills Loader ─────────────────────────────────────────────────────

function loadLocalSkills(root: string): Array<{ name: string; description: string; version: string; category: string }> {
  const skillsDir = join(root, '.deckent', 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  const skills: Array<{ name: string; description: string; version: string; category: string }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(skillsDir, entry.name, 'manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        skills.push({
          name: manifest.name ?? entry.name,
          description: manifest.description ?? '',
          version: manifest.version ?? '0.0.0',
          category: manifest.category ?? 'tool',
        });
      } catch {
        // Skip malformed
      }
    }
  }
  return skills;
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerSkillMarketplace(parentCmd: Command): void {
  // ─── skill search ────────────────────────────────────────────────────────
  parentCmd
    .command('search <query>')
    .description('Search skills in the marketplace registry')
    .option('--category <cat>', 'Filter by category')
    .option('--json', 'Output as JSON')
    .option('--limit <n>', 'Max results per page', '20')
    .action(async (query: string, opts: { category?: string; json?: boolean; limit?: string }) => {
      try {
        const client = new RegistryClient();
        const limit = parseInt(opts.limit ?? '20', 10);

        const result = await client.searchSkills(query, {
          category: opts.category,
          limit: isNaN(limit) ? 20 : limit,
        });

        if (opts.json) {
          print(JSON.stringify(result, null, 2));
          return;
        }

        if (result.skills.length === 0) {
          print(`No skills found for "${query}".`);
          return;
        }

        const headers = ['Name', 'Description', 'Version', 'Category', 'Downloads', 'Rating'];
        const rows = result.skills.map((s) => [
          s.name,
          s.description.length > 40 ? s.description.slice(0, 37) + '...' : s.description,
          s.version,
          s.category,
          String(s.downloads),
          String(s.rating),
        ]);
        print(formatTable(headers, rows));
        print(`\nPage ${result.page}/${result.pages} (${result.total} total)`);
      } catch (error) {
        // Offline fallback
        const root = resolveProjectRoot();
        const localSkills = loadLocalSkills(root);

        if (localSkills.length > 0) {
          print('Registry unavailable. Showing local skills only.');
          const headers = ['Name', 'Description', 'Version', 'Category'];
          const rows = localSkills.map((s) => [s.name, s.description, s.version, s.category]);
          print(formatTable(headers, rows));
        } else {
          printError(error);
          process.exitCode = 1;
        }
      }
    });

  // ─── skill publish ───────────────────────────────────────────────────────
  parentCmd
    .command('publish')
    .description('Publish a skill to the marketplace registry')
    .option('--dry-run', 'Validate without publishing')
    .action(async (opts: { dryRun?: boolean }) => {
      try {
        const root = resolveProjectRoot();

        // Find manifest.json in current skill directory
        const manifestPath = join(root, 'manifest.json');
        if (!existsSync(manifestPath)) {
          throw new Error('manifest.json not found in current directory. Run from a skill directory.');
        }

        const manifestRaw = readFileSync(manifestPath, 'utf-8');
        let manifest: Record<string, unknown>;
        try {
          manifest = JSON.parse(manifestRaw);
        } catch {
          throw new Error('Failed to parse manifest.json');
        }

        // Pre-publish validation
        const errors = validateManifestForPublish(manifest);

        // Check SKILL.md exists
        const skillMdPath = join(root, 'SKILL.md');
        if (!existsSync(skillMdPath)) {
          errors.push('SKILL.md file is required for publishing');
        }

        // Check author
        if (!manifest.author || typeof manifest.author !== 'string') {
          errors.push('Missing "author" field in manifest');
        }

        if (errors.length > 0) {
          print('Validation failed:');
          for (const err of errors) {
            print(`  - ${err}`);
          }
          process.exitCode = 1;
          return;
        }

        if (opts.dryRun) {
          print('Dry run: validation passed. Skill is ready to publish.');
          print(`  Name: ${manifest.name}`);
          print(`  Version: ${manifest.version}`);
          print(`  Author: ${manifest.author}`);
          return;
        }

        // Check auth
        const auth = new MarketplaceAuth();
        const token = auth.getToken();
        if (!token) {
          throw new Error('Not authenticated. Run `deckent config set --global marketplace_token <token>` first.');
        }

        // Publish
        const client = new RegistryClient();
        const result = await client.publishSkill(manifest, token);
        print(result.message ?? 'Skill published successfully.');
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
