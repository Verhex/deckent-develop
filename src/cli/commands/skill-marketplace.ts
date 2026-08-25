// ─── Skill Marketplace CLI ───────────────────────────────────────────────────
// Commands: deckent skill search <query>, deckent skill publish <skillPath>

import type { Command } from 'commander';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RegistryClient } from '../../core/marketplace/registry-client.js';
import { MarketplaceAuth } from '../../core/marketplace/marketplace-auth.js';
import { SkillSandbox } from '../../core/marketplace/skill-sandbox.js';
import { loadOrGenerateKeypair, signMessage, bytesToHex } from '../../core/signature.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { ErrorRegistry } from '../../core/errors.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { memoryCatalogMessage } from '../helpers/message-catalog/cli-memory-catalog.js';

// ─── Registry Cache ───────────────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const registryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCached<T>(key: string): T | null {
  const entry = registryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    registryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown): void {
  registryCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearRegistryCache(): void {
  registryCache.clear();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strict semver validation: major.minor.patch with optional pre-release and build metadata.
 * Rejects loose patterns like "1.0" or "v1.0.0".
 */
export function validateSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(version);
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
    .command('search')
    .argument('<query>', memoryCatalogMessage('cli.memcat.skill_marketplace.arg.query', getLanguage(undefined)))
    .description(getMessage('cli.skill_marketplace.search.desc', getLanguage(undefined)))
    .option('--category <cat>', memoryCatalogMessage('cli.memcat.skill_marketplace.opt.category', getLanguage(undefined)))
    .option('--json', memoryCatalogMessage('cli.memcat.shared.opt.json', getLanguage(undefined)))
    .option('--limit <n>', memoryCatalogMessage('cli.memcat.skill_marketplace.opt.limit', getLanguage(undefined)), '20')
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
          // The offline fallback used to put its notice + a rendered table on stdout,
          // which broke `--json` consumers exactly when the registry was down. The
          // fallback now answers in the registry's own result shape (single page,
          // local entries); the degradation notice moves to stderr.
          if (opts.json) {
            process.stderr.write('Registry unavailable. Showing local skills only.\n');
            print(JSON.stringify({
              skills: localSkills,
              page: 1,
              pages: 1,
              total: localSkills.length,
            }, null, 2));
            return;
          }
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

  // ─── skill publish <skillPath> — unified: sandbox + Ed25519 sign + registry
  // Sprint 150 Hot Fix: merges Sprint 149 T-149-019 (sandbox + sign) with
  // marketplace registry upload into a single command. Pipeline:
  //   1. Validate skill path + manifest + SKILL.md
  //   2. AST sandbox scan (scope-safety)
  //   3. Ed25519 sign (unless --no-sign)
  //   4. Registry upload (unless --dry-run)
  parentCmd
    .command('publish')
    .argument('<skillPath>', memoryCatalogMessage('cli.memcat.skill_marketplace.arg.skill_path', getLanguage(undefined)))
    .description(getMessage('cli.skill_marketplace.publish.desc', getLanguage(undefined)))
    .option('--dry-run', memoryCatalogMessage('cli.memcat.skill_marketplace.opt.dry_run', getLanguage(undefined)))
    .option('--key-dir <dir>', memoryCatalogMessage('cli.memcat.skill_marketplace.opt.key_dir', getLanguage(undefined)))
    .option('--no-sign', memoryCatalogMessage('cli.memcat.skill_marketplace.opt.no_sign', getLanguage(undefined)))
    .action(async (skillPath: string, opts: { dryRun?: boolean; keyDir?: string; sign?: boolean }) => {
      try {
        // ─── Step 1: Validate skill path + files ─────────────────────────
        const resolvedPath = resolve(skillPath);
        if (!existsSync(resolvedPath)) {
          printError(`Skill directory not found: ${resolvedPath}`);
          process.exitCode = 1;
          return;
        }

        const manifestPath = join(resolvedPath, 'manifest.json');
        if (!existsSync(manifestPath)) {
          throw ErrorRegistry.createError('DECKENT_E034', { message: 'manifest.json not found in skill directory' });
        }

        const skillMdPath = join(resolvedPath, 'SKILL.md');
        if (!existsSync(skillMdPath)) {
          printError('SKILL.md not found in skill directory');
          process.exitCode = 1;
          return;
        }

        // Parse manifest
        const manifestRaw = readFileSync(manifestPath, 'utf-8');
        let manifest: Record<string, unknown>;
        try {
          manifest = JSON.parse(manifestRaw);
        } catch {
          throw ErrorRegistry.createError('DECKENT_E035');
        }

        // Pre-publish manifest validation
        const errors = validateManifestForPublish(manifest);
        if (errors.length > 0) {
          print('Validation failed:');
          for (const err of errors) {
            print(`  - ${err}`);
          }
          process.exitCode = 1;
          return;
        }

        // ─── Step 2: AST sandbox scan ───────────────────────────────────
        const sandbox = new SkillSandbox(resolvedPath);
        const safetyReport = sandbox.validateSkillSafety(resolvedPath);
        if (!safetyReport.safe) {
          print('Sandbox violations found:');
          for (const issue of safetyReport.issues) {
            print(`  - ${issue}`);
          }
          process.exitCode = 1;
          return;
        }
        print(`Sandbox OK (${safetyReport.scannedFiles} files scanned)`);

        // ─── Step 3: Ed25519 sign (unless --no-sign) ────────────────────
        // commander: `--no-sign` sets opts.sign = false; default is undefined (→ sign)
        const shouldSign = opts.sign !== false;
        if (shouldSign) {
          const keypair = loadOrGenerateKeypair(opts.keyDir);
          const skillContent = readFileSync(skillMdPath, 'utf-8');
          const signPayload = skillContent + JSON.stringify(manifest);
          const signature = await signMessage(signPayload, keypair.privateKey);

          const sigPath = join(resolvedPath, 'signature.ed25519');
          writeFileSync(sigPath, signature);

          print(`Signed with public key ${bytesToHex(keypair.publicKey).slice(0, 16)}...`);
          print(`Signature written to ${sigPath}`);
        } else {
          print('Skipping Ed25519 sign (--no-sign flag set)');
        }

        // ─── Step 4: Registry upload (unless --dry-run) ─────────────────
        if (opts.dryRun) {
          print('Dry run: validation + sign passed. Skill is ready to publish.');
          print(`  Name: ${manifest.name}`);
          print(`  Version: ${manifest.version}`);
          if (manifest.author) {
            print(`  Author: ${manifest.author}`);
          }
          print('  (registry upload skipped)');
          return;
        }

        // Registry upload requires author field
        if (!manifest.author || typeof manifest.author !== 'string') {
          printError('Missing "author" field in manifest (required for registry upload). Use --dry-run to skip upload.');
          process.exitCode = 1;
          return;
        }

        // Check auth
        const auth = new MarketplaceAuth();
        const token = auth.getToken();
        if (!token) {
          throw ErrorRegistry.createError('DECKENT_E036');
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
