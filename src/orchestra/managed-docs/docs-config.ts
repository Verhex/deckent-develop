// ─── Docs Config ──────────────────────────────────────────────────────────
// Load, save, and manage .deckent/docs.json for user-defined documents.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { DOCS_CONFIG_FILE } from '../../core/constants.js';
import { debugLog } from '../../core/utils.js';
import type { DocsConfig, ManagedDocEntry } from './types.js';

// ─── ID Generation ────────────────────────────────────────────────────────

/**
 * Generate a unique doc ID from file path.
 * "docs/ARCHITECTURE.md" → "docs-architecture-md"
 * "CLAUDE.md" → "claude-md"
 */
export function generateDocId(filePath: string): string {
  return filePath
    .replace(/[/\\]/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

// ─── Load / Save ──────────────────────────────────────────────────────────

/**
 * Load docs config from .deckent/docs.json. Returns null if not found.
 */
export function loadDocsConfig(projectRoot: string): DocsConfig | null {
  const configPath = join(projectRoot, DOCS_CONFIG_FILE);
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as DocsConfig;
    if (!parsed.version || !Array.isArray(parsed.docs)) return null;
    return parsed;
  } catch (e) {
    debugLog('docs-config:load', e);
    return null;
  }
}

/**
 * Save docs config to .deckent/docs.json.
 */
export function saveDocsConfig(projectRoot: string, config: DocsConfig): void {
  const configPath = join(projectRoot, DOCS_CONFIG_FILE);
  const dir = dirname(configPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ─── Path Safety ─────────────────────────────────────────────────────────

/**
 * Validate a doc path for security. Rejects absolute paths, path traversal,
 * and paths that escape the project root.
 * @throws Error if path is unsafe
 */
export function validateDocPath(projectRoot: string, docPath: string): void {
  // Reject absolute paths (Unix and Windows)
  if (docPath.startsWith('/') || /^[A-Za-z]:/.test(docPath)) {
    throw new Error(`Absolute paths not allowed: ${docPath}`);
  }
  // Reject path traversal
  if (docPath.includes('..')) {
    throw new Error(`Path traversal not allowed: ${docPath}`);
  }
  // Reject paths that escape project root after resolution
  const resolved = resolve(projectRoot, docPath);
  if (!resolved.startsWith(resolve(projectRoot))) {
    throw new Error(`Path escapes project root: ${docPath}`);
  }
}

// ─── Seed (Template Bootstrap) ───────────────────────────────────────────

/**
 * Seed docs.json from the built-in template if it doesn't already exist.
 * Called during `deckent init` to bootstrap managed-docs config.
 */
export function seedDocsConfig(projectRoot: string): void {
  if (loadDocsConfig(projectRoot)) return; // already exists — don't overwrite

  // Read template from package (dist or src depending on runtime)
  const templatePaths = [
    join(__dirname, '../../../cli/commands/init-templates/docs.json.template'),
    join(__dirname, '../../cli/commands/init-templates/docs.json.template'),
  ];

  let template: DocsConfig | null = null;
  for (const tp of templatePaths) {
    if (existsSync(tp)) {
      try {
        template = JSON.parse(readFileSync(tp, 'utf-8')) as DocsConfig;
        break;
      } catch { /* try next */ }
    }
  }

  // Fallback: inline default if template file not found. Mirrors the
  // docs.json.template — host instruction files (CLAUDE.md/AGENTS.md/…) are
  // NOT managed-docs under the pure-adapter law (ADR-G-004 / DOCS-PURE-ADAPTER),
  // so the only seeded entry is the deckent-owned IDENTITY.md surface.
  if (!template) {
    template = {
      version: 1,
      docs: [{
        id: 'identity-md',
        path: '.deckent/workspace/IDENTITY.md',
        autoSections: ['Project Status'],
        protectedSections: [],
      }],
    };
  }

  saveDocsConfig(projectRoot, template);
}

// ─── Add / Remove / Update ────────────────────────────────────────────────

/**
 * Add a new managed doc entry. Creates config file if missing.
 * Validates path safety before adding.
 * Returns the generated ID.
 * @throws Error if path is unsafe (absolute, traversal, or escapes root)
 */
export function addDoc(projectRoot: string, entry: Omit<ManagedDocEntry, 'id'> & { id?: string }): string {
  // Security: validate path before any mutation
  validateDocPath(projectRoot, entry.path);

  const config = loadDocsConfig(projectRoot) ?? { version: 1, docs: [] };
  const id = entry.id ?? generateDocId(entry.path);

  // Check for duplicate
  const existing = config.docs.findIndex(d => d.id === id || d.path === entry.path);
  if (existing >= 0) {
    // Update existing entry
    config.docs[existing] = { ...config.docs[existing], ...entry, id };
  } else {
    config.docs.push({ ...entry, id });
  }

  saveDocsConfig(projectRoot, config);
  return id;
}

/**
 * Remove a doc by ID or path.
 */
export function removeDoc(projectRoot: string, idOrPath: string): boolean {
  const config = loadDocsConfig(projectRoot);
  if (!config) return false;

  const before = config.docs.length;
  config.docs = config.docs.filter(d => d.id !== idOrPath && d.path !== idOrPath);
  if (config.docs.length === before) return false;

  saveDocsConfig(projectRoot, config);
  return true;
}

/**
 * Get a single doc entry by ID or path.
 */
export function getDoc(projectRoot: string, idOrPath: string): ManagedDocEntry | null {
  const config = loadDocsConfig(projectRoot);
  if (!config) return null;
  return config.docs.find(d => d.id === idOrPath || d.path === idOrPath) ?? null;
}
