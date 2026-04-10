// ─── User Generator Plugin Loader ────────────────────────────────────────
// Loads user-defined section generators from .deckent/generators/*.
// Supports two formats:
//   1) Declarative JSON: .deckent/generators/*.json with { id, patterns, patternsByLang, template }
//   2) Executable JS/MJS: .deckent/generators/*.mjs with default export of SectionGenerator
//
// JSON generators are safer (no code execution) and recommended for most users.
// MJS generators run in the Node process — only load from trusted sources.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { debugLog } from '../../core/utils.js';
import type { DocUpdateContext } from '../doc-updaters/types.js';
import type { SectionGenerator } from './types.js';
import { renderTemplate } from './template-renderer.js';

const GENERATORS_DIR = join('.deckent', 'generators');

interface JsonGeneratorSpec {
  id?: string;
  patterns?: string[];
  patternsByLang?: Record<string, string[]>;
  /** Template string — rendered via renderTemplate() */
  template?: string;
}

/**
 * Load all user-defined generators from .deckent/generators/.
 * Non-fatal — errors in one file don't affect others.
 *
 * Synchronous JSON loading only. For MJS plugin support, use loadUserGeneratorsAsync.
 */
export function loadUserGeneratorsSync(projectRoot: string): SectionGenerator[] {
  const dir = join(projectRoot, GENERATORS_DIR);
  if (!existsSync(dir)) return [];

  const generators: SectionGenerator[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(dir);
  } catch (e) {
    debugLog('plugin-loader:readdir', e);
    return [];
  }

  for (const file of files) {
    const fullPath = join(dir, file);
    try {
      if (!statSync(fullPath).isFile()) continue;
    } catch { continue; }

    if (file.endsWith('.json')) {
      try {
        const spec = JSON.parse(readFileSync(fullPath, 'utf-8')) as JsonGeneratorSpec;
        const gen = specToGenerator(spec, file);
        if (gen) generators.push(gen);
      } catch (e) {
        debugLog('plugin-loader:json', `${file}: ${e}`);
      }
    }
    // .mjs loading is async — intentionally not handled here.
    // Users needing executable generators should call loadUserGeneratorsAsync.
  }

  return generators;
}

/**
 * Async variant that supports .mjs plugins via dynamic import.
 * Not currently wired into the sprint pipeline — reserved for CLI `docs run --with-plugins`.
 */
export async function loadUserGeneratorsAsync(projectRoot: string): Promise<SectionGenerator[]> {
  const sync = loadUserGeneratorsSync(projectRoot);
  const dir = join(projectRoot, GENERATORS_DIR);
  if (!existsSync(dir)) return sync;

  let files: string[] = [];
  try { files = readdirSync(dir); } catch { return sync; }

  for (const file of files) {
    if (!file.endsWith('.mjs') && !file.endsWith('.js')) continue;
    const fullPath = join(dir, file);
    try {
      const mod = await import(fullPath) as { default?: SectionGenerator };
      if (mod.default && typeof mod.default === 'object' && Array.isArray(mod.default.patterns)) {
        sync.push(mod.default);
      }
    } catch (e) {
      debugLog('plugin-loader:mjs', `${file}: ${e}`);
    }
  }

  return sync;
}

function specToGenerator(spec: JsonGeneratorSpec, sourceFile: string): SectionGenerator | null {
  const patterns = Array.isArray(spec.patterns) ? spec.patterns : [];
  if (patterns.length === 0 && !spec.patternsByLang) return null;
  if (typeof spec.template !== 'string') return null;

  const id = spec.id ?? sourceFile.replace(/\.json$/, '');
  const template = spec.template;

  return {
    id,
    patterns,
    patternsByLang: spec.patternsByLang,
    generate(ctx: DocUpdateContext): string {
      return renderTemplate(template, ctx);
    },
  };
}
