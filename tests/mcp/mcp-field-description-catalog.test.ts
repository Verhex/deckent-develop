/**
 * MCP inputSchema field description ↔ MESSAGES catalog binding gate (7085).
 *
 * Contract this gate enforces:
 *   1. EVERY inputSchema field of EVERY registered MCP tool resolves its
 *      description from a catalog read — `mcpFieldDescription(tool, field)`
 *      (derived `mcp.<tool>.<field>_desc` key), `getMessage(key, lang)`
 *      (historical per-tool keys) or `cliContractMessage(key, lang)` — never a
 *      literal, a template or an arbitrary expression. Proven twice: by source
 *      scan (no other `.describe(` form exists) AND at runtime (every rendered
 *      en/tr pair is exactly a catalog row's pair).
 *   2. Every row is a real bilingual pair: en AND tr present, tr differs from
 *      en, placeholders identical across languages, nothing unresolved leaks.
 *   3. Language resolution is the ONE server-start resolved language the tool
 *      descriptions already use — seeded tr renders tr, explicit override wins,
 *      nothing seeded falls back to the canonical resolver.
 *   4. tools/list shape is language-invariant: the JSON schema minus its
 *      description strings, and the annotations, are identical in en and tr.
 *
 * It fails CLOSED: an unbound field throws at registration rather than
 * shipping the raw key, an empty string, or an English-only row.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, MCP_TOOL_COUNT } from '../../src/mcp/tools/index.js';
import {
  MCP_FIELD_DESCRIPTION_REQUIRED_LANGUAGES,
  mcpFieldDescription,
  mcpFieldDescriptionKey,
  mcpToolDescription,
  setMcpToolDescriptionLanguage,
  resetMcpToolDescriptionLanguage,
} from '../../src/mcp/tools/description-catalog.js';
import { getLanguage, getMessage, getMessageLanguages } from '../../src/cli/helpers/messages.js';
import { cliContractMessage, cliContractMessageLanguages } from '../../src/cli/helpers/message-catalog/cli-run.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS_DIR = join(REPO_ROOT, 'src', 'mcp', 'tools');
const TOOL_MODULES = readdirSync(TOOLS_DIR).filter(
  (f) => f.endsWith('.ts') && !['index.ts', 'tool-catalog.ts', 'description-catalog.ts'].includes(f),
).sort();

type Captured = Map<string, { inputSchema: z.ZodObject<z.ZodRawShape> | undefined; annotations: unknown; title: unknown }>;

/**
 * `registerTool` accepts either a `z.object(...)` or a raw shape
 * (`deckent_process` passes the raw shape). Normalize to a ZodObject so the
 * field walk and the JSON-schema projection see the same thing the SDK does.
 */
function asZodObject(schema: unknown): z.ZodObject<z.ZodRawShape> | undefined {
  if (schema === undefined || schema === null) return undefined;
  if (typeof schema === 'object' && 'shape' in (schema as object)) return schema as z.ZodObject<z.ZodRawShape>;
  return z.object(schema as z.ZodRawShape);
}

/** Register through a stub server in `lang`, capturing each tool's config. */
function capture(lang: string): Captured {
  setMcpToolDescriptionLanguage(lang);
  const configs: Captured = new Map();
  const stub = {
    registerTool: (name: string, config: Record<string, unknown>) => {
      configs.set(name, {
        inputSchema: asZodObject(config['inputSchema']),
        annotations: config['annotations'],
        title: config['title'],
      });
      return {};
    },
  } as unknown as McpServer;
  try {
    registerTools(stub);
  } finally {
    resetMcpToolDescriptionLanguage();
  }
  return configs;
}

interface Site {
  module: string;
  fn: 'mcpFieldDescription' | 'getMessage' | 'cliContractMessage';
  key: string;
  line: number;
}

/**
 * Every `.describe(` on the tool modules with the catalog call that follows
 * it. Any `.describe(` NOT followed by one of the three catalog reads is
 * reported as a violation (a literal, a template, a variable, …).
 */
function scanSources(): { sites: Site[]; violations: string[]; total: number } {
  const sites: Site[] = [];
  const violations: string[] = [];
  let total = 0;
  const call = /^(mcpFieldDescription|getMessage|cliContractMessage)\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?/;
  for (const module of TOOL_MODULES) {
    const src = readFileSync(join(TOOLS_DIR, module), 'utf-8');
    const re = /\.describe\(\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      total += 1;
      const line = src.slice(0, m.index).split('\n').length;
      const rest = src.slice(m.index + m[0].length, m.index + m[0].length + 200);
      const c = call.exec(rest);
      if (!c) {
        violations.push(`${module}:${line} → ${rest.slice(0, 50)}`);
        continue;
      }
      const fn = c[1] as Site['fn'];
      const key = fn === 'mcpFieldDescription' ? mcpFieldDescriptionKey(c[2] as string, c[3] as string) : (c[2] as string);
      sites.push({ module, fn, key, line });
    }
  }
  return { sites, violations, total };
}

const scanned = scanSources();
const en = capture('en');
const tr = capture('tr');

function fieldsOf(captured: Captured): Array<{ tool: string; field: string; description: string | undefined }> {
  const out: Array<{ tool: string; field: string; description: string | undefined }> = [];
  for (const [tool, config] of captured) {
    // A tool with no inputSchema has no fields (e.g. deckent_help).
    for (const [field, schema] of Object.entries(config.inputSchema?.shape ?? {})) {
      out.push({ tool, field, description: (schema as z.ZodType).description });
    }
  }
  return out;
}

/** JSON schema with every `description` removed, recursively — the language-invariant shape. */
function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'description') continue;
      out[k] = stripDescriptions(v);
    }
    return out;
  }
  return value;
}

function catalogPair(site: Site): { en: string; tr: string; languages: readonly string[] } {
  if (site.fn === 'cliContractMessage') {
    return {
      en: cliContractMessage(site.key, 'en'),
      tr: cliContractMessage(site.key, 'tr'),
      languages: cliContractMessageLanguages(site.key),
    };
  }
  return { en: getMessage(site.key, 'en'), tr: getMessage(site.key, 'tr'), languages: getMessageLanguages(site.key) };
}

const PLACEHOLDER = /\{[a-zA-Z]\w*\}/g;
const placeholders = (s: string): string[] => [...s.matchAll(PLACEHOLDER)].map((m) => m[0]).sort();

describe('MCP inputSchema field description catalog binding (7085)', () => {
  afterEach(() => resetMcpToolDescriptionLanguage());

  it('registers every tool in both languages', () => {
    expect(en.size).toBe(MCP_TOOL_COUNT);
    expect(tr.size).toBe(MCP_TOOL_COUNT);
  });

  it('source: every `.describe(` on a tool module is one of the three catalog reads — no literal, template or free expression', () => {
    expect(scanned.violations, 'these field descriptions do not read the catalog').toEqual([]);
    expect(scanned.sites.length).toBe(scanned.total);
    expect(scanned.total).toBeGreaterThan(0);
  });

  it('inventory: catalog-read sites equal the registered inputSchema fields, and every field carries a description', () => {
    const fields = fieldsOf(en);
    expect(fields.length).toBe(scanned.sites.length);
    const undescribed = fields.filter((f) => typeof f.description !== 'string' || f.description.length === 0);
    expect(undescribed.map((f) => `${f.tool}.${f.field}`)).toEqual([]);
  });

  it('every scanned catalog key is a complete en+tr row with identical placeholders', () => {
    const problems: string[] = [];
    for (const site of scanned.sites) {
      const pair = catalogPair(site);
      for (const lang of MCP_FIELD_DESCRIPTION_REQUIRED_LANGUAGES) {
        if (!pair.languages.includes(lang)) problems.push(`${site.module}:${site.line} ${site.key} lacks ${lang}`);
      }
      if (pair.en === site.key || pair.tr === site.key) problems.push(`${site.key} resolves to its own key (missing row)`);
      if (JSON.stringify(placeholders(pair.en)) !== JSON.stringify(placeholders(pair.tr))) problems.push(`${site.key} placeholder drift`);
    }
    expect(problems).toEqual([]);
  });

  it('runtime: every rendered field description is exactly one catalog row — en under en, tr under tr, tr differs from en', () => {
    const pairs = new Set(scanned.sites.map((s) => { const p = catalogPair(s); return `${p.en} ${p.tr}`; }));
    const trByKey = new Map<string, string | undefined>(fieldsOf(tr).map((f) => [`${f.tool}.${f.field}`, f.description]));
    const problems: string[] = [];
    for (const f of fieldsOf(en)) {
      const id = `${f.tool}.${f.field}`;
      const trText = trByKey.get(id);
      if (typeof trText !== 'string' || trText.length === 0) { problems.push(`${id}: no tr rendering`); continue; }
      if (trText === f.description) problems.push(`${id}: tr identical to en (literal leakage / untranslated row)`);
      if (!pairs.has(`${f.description} ${trText}`)) problems.push(`${id}: rendered pair is not a catalog row`);
      if (PLACEHOLDER.test(f.description ?? '') || PLACEHOLDER.test(trText)) problems.push(`${id}: unresolved placeholder leaks`);
      PLACEHOLDER.lastIndex = 0;
    }
    expect(problems).toEqual([]);
  });

  it('tools/list shape is language-invariant: JSON schema minus descriptions, and annotations, are identical in en and tr', () => {
    for (const [tool, cfg] of en) {
      const other = tr.get(tool)!;
      // Three tool modules (models, feature-query, truth) still build their
      // schema with zod v3, which `z.toJSONSchema` (v4) cannot project; for
      // those, compare the structural fingerprint the v3 object exposes.
      const schemaOf = (schema: z.ZodObject<z.ZodRawShape> | undefined): unknown => {
        if (schema === undefined) return null;
        if ('_zod' in (schema as object)) return stripDescriptions(z.toJSONSchema(schema));
        const legacy = schema as unknown as { shape: Record<string, { _def?: { typeName?: string }; isOptional?: () => boolean }> };
        return {
          zodV3: Object.fromEntries(Object.entries(legacy.shape).map(([k, s]) => [k, { typeName: s._def?.typeName, optional: s.isOptional?.() }])),
        };
      };
      expect(schemaOf(cfg.inputSchema), `${tool} schema shape drifts between languages`).toEqual(schemaOf(other.inputSchema));
      expect(cfg.annotations, `${tool} annotations drift between languages`).toEqual(other.annotations);
    }
  });

  it('derives the key from tool + field (snake_case, _desc suffix) and rejects malformed names', () => {
    expect(mcpFieldDescriptionKey('deckent_kill', 'taskId')).toBe('mcp.kill.task_id_desc');
    expect(mcpFieldDescriptionKey('deckent_init', 'installMissing')).toBe('mcp.init.install_missing_desc');
    expect(mcpFieldDescriptionKey('deckent_run', 'timeoutMs')).toBe('mcp.run.timeout_ms_desc');
    expect(mcpFieldDescriptionKey('deckent_nervous_subscribe', 'sprint_id')).toBe('mcp.nervous_subscribe.sprint_id_desc');
    expect(() => mcpFieldDescriptionKey('kill', 'taskId')).toThrow(/E_MCP_FIELD_DESCRIPTION_TOOL_NAME/);
    expect(() => mcpFieldDescriptionKey('deckent_kill', 'task-id')).toThrow(/E_MCP_FIELD_DESCRIPTION_FIELD_NAME/);
  });

  it('fails closed on an unbound field instead of shipping the raw key or an empty description', () => {
    expect(() => mcpFieldDescription('deckent_kill', 'doesNotExist')).toThrow(/E_MCP_FIELD_DESCRIPTION_UNBOUND/);
    expect(() => mcpFieldDescription('deckent_kill', 'doesNotExist')).toThrow(/missing: en, tr/);
  });

  it('requires exactly the en+tr pair the rest of the catalog surface requires', () => {
    expect([...MCP_FIELD_DESCRIPTION_REQUIRED_LANGUAGES]).toEqual(['en', 'tr']);
  });

  it('language precedence: the seeded language reaches field resolution, an explicit override wins, nothing seeded falls back to the resolver', () => {
    const key = mcpFieldDescriptionKey('deckent_kill', 'taskId');
    setMcpToolDescriptionLanguage('tr');
    expect(mcpFieldDescription('deckent_kill', 'taskId')).toBe(getMessage(key, 'tr'));
    expect(mcpFieldDescription('deckent_kill', 'taskId', { lang: 'en' })).toBe(getMessage(key, 'en'));
    // The field and the tool description share the one seeded language.
    expect(mcpToolDescription('deckent_kill')).toBe(mcpToolDescription('deckent_kill', { lang: 'tr' }));
    resetMcpToolDescriptionLanguage();
    expect(mcpFieldDescription('deckent_kill', 'taskId')).toBe(getMessage(key, getLanguage(undefined)));
  });

  it('language sample — deckent_plan.mode describes the config-resolved Brain planning modes, not a fixed provider or API requirement (7085 v2)', () => {
    const descOf = (captured: Captured): string =>
      (captured.get('deckent_plan')!.inputSchema!.shape['mode'] as z.ZodType).description ?? '';
    const enText = descOf(en);
    const trText = descOf(tr);
    for (const text of [enText, trText]) {
      expect(text).toMatch(/brain_planning/);
      expect(text).toMatch(/"structured"/);
      expect(text).toMatch(/"ai"/);
      expect(text).toMatch(/"auto"/);
      expect(text).toMatch(/DIRECTIVES\.md/);
      // The planner resolves the Brain provider from effective config/routing
      // (sprint-planner.ts orderedRoleProviders) and reports an explicit-ai
      // failure as typed, never as a silent structured fallback.
      expect(text).not.toMatch(/\b(Claude|Opus|Sonnet|Haiku)\b/);
      expect(text).not.toMatch(/API (access|key)|API erişimi/i);
    }
    expect(trText).not.toBe(enText);
    expect(enText).toBe(getMessage(mcpFieldDescriptionKey('deckent_plan', 'mode'), 'en'));
    expect(trText).toBe(getMessage(mcpFieldDescriptionKey('deckent_plan', 'mode'), 'tr'));
  });

  it('language sample — deckent_init.mode is a plan-tier description in both languages, with no fixed model-family name', () => {
    const descOf = (captured: Captured): string =>
      (captured.get('deckent_init')!.inputSchema!.shape['mode'] as z.ZodType).description ?? '';
    const enText = descOf(en);
    const trText = descOf(tr);
    for (const text of [enText, trText]) {
      expect(text).toMatch(/performance/);
      expect(text).toMatch(/max_plan/);
      expect(text).not.toMatch(/\b(Opus|Sonnet|Haiku)\b/);
    }
    expect(trText).not.toBe(enText);
  });
});
