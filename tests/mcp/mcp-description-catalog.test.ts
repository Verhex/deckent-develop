/**
 * MCP tool description ↔ MESSAGES catalog binding gate (559-004).
 *
 * Contract this gate enforces:
 *   1. EVERY registered MCP tool resolves its description from the shared
 *      `MESSAGES` catalog — no module keeps a hardcoded literal.
 *   2. Every bound key is a real bilingual pair (en AND tr), never an
 *      English-only row that silently falls back.
 *   3. A tool with a CLI counterpart SHARES that command's own catalog key, so
 *      one command can never carry two divergent texts across the two surfaces
 *      (the stated NO_GO condition). Proven by re-deriving key usage from the
 *      CLI command sources, not by trusting the binding table's own label.
 *   4. A tool with no CLI counterpart owns an `mcp.<tool>.desc` key, and no
 *      CLI-shared tool may point at that MCP-private namespace.
 *   5. Language resolution is real: sampled tools render differently in tr.
 *
 * It fails CLOSED: an unbound tool throws at registration rather than shipping
 * an empty or hardcoded description.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools, TOOL_CATALOG, MCP_TOOL_COUNT } from '../../src/mcp/tools/index.js';
import {
  MCP_TOOL_DESCRIPTION_BINDINGS,
  mcpToolDescription,
  setMcpToolDescriptionLanguage,
  resetMcpToolDescriptionLanguage,
} from '../../src/mcp/tools/description-catalog.js';
import { getMessage, getMessageLanguages, resolveLanguage } from '../../src/cli/helpers/messages.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOLS_DIR = join(REPO_ROOT, 'src', 'mcp', 'tools');
const CLI_COMMANDS_DIR = join(REPO_ROOT, 'src', 'cli', 'commands');

/** Register through a stub server, capturing the config each tool declares. */
function capture(): Map<string, Record<string, unknown>> {
  const configs = new Map<string, Record<string, unknown>>();
  const stub = {
    registerTool: (name: string, config: Record<string, unknown>) => {
      configs.set(name, config);
      return {};
    },
  } as unknown as McpServer;
  registerTools(stub);
  return configs;
}

// Seed English explicitly so the baseline capture never depends on the host locale.
setMcpToolDescriptionLanguage('en');
const effective = capture();

/** Tool modules only — the binding table and the catalog projection are not tools. */
const TOOL_MODULES = readdirSync(TOOLS_DIR).filter(
  (f) => f.endsWith('.ts') && !['index.ts', 'tool-catalog.ts', 'description-catalog.ts'].includes(f),
);

/**
 * Every `registerTool` call in source with the description expression that
 * follows it — the same anchoring the tool registry itself uses, so the
 * `description: s.description` field inside a marketplace-record map cannot be
 * mistaken for a tool description.
 */
function scanSourceDescriptions(): Array<{ module: string; tool: string; expression: string }> {
  const found: Array<{ module: string; tool: string; expression: string }> = [];
  for (const module of TOOL_MODULES) {
    const src = readFileSync(join(TOOLS_DIR, module), 'utf-8');
    const re = /server\.registerTool\(\s*\n?\s*['"]([a-z_]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const at = src.indexOf('\n      description:', m.index);
      if (at === -1) throw new Error(`${module}: ${m[1]} declares no tool-level description`);
      found.push({
        module,
        tool: m[1] as string,
        expression: src.slice(at + '\n      description:'.length, at + 120).trim(),
      });
    }
  }
  return found;
}

const sourceDescriptions = scanSourceDescriptions();

/** Concatenated CLI command sources — the other half of the parity proof. */
const cliSources = readdirSync(CLI_COMMANDS_DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => readFileSync(join(CLI_COMMANDS_DIR, f), 'utf-8'))
  .join('\n');

afterEach(() => {
  resetMcpToolDescriptionLanguage();
});

describe('MCP tool description catalog binding', () => {
  it('binds every registered tool — count matches the canonical catalog', () => {
    expect(effective.size).toBe(MCP_TOOL_COUNT);
    expect(sourceDescriptions).toHaveLength(MCP_TOOL_COUNT);
    expect(Object.keys(MCP_TOOL_DESCRIPTION_BINDINGS)).toHaveLength(MCP_TOOL_COUNT);
    for (const entry of TOOL_CATALOG) {
      expect(
        MCP_TOOL_DESCRIPTION_BINDINGS[entry.name],
        `${entry.name} has no description binding`,
      ).toBeDefined();
    }
  });

  it('leaves no hardcoded tool description in source — every one resolves through the catalog', () => {
    const hardcoded = sourceDescriptions.filter((d) => !d.expression.startsWith('mcpToolDescription('));
    expect(
      hardcoded.map((d) => `${d.module}:${d.tool} → ${d.expression.slice(0, 60)}`),
      'these tool descriptions are still hardcoded literals',
    ).toEqual([]);
  });

  it('resolves every registered description through mcpToolDescription with no unresolved placeholder', () => {
    for (const [name, config] of effective) {
      const binding = MCP_TOOL_DESCRIPTION_BINDINGS[name]!;
      const description = config['description'];
      expect(typeof description, `${name} description is not a string`).toBe('string');
      const text = description as string;

      // It starts with the shared command sentence, verbatim from the catalog.
      expect(text.startsWith(getMessage(binding.key, 'en')), `${name} does not open with its bound key text`).toBe(true);
      // Interpolation actually ran — no `{modelId}`-style leftovers reach a client.
      expect(text, `${name} leaks an unresolved placeholder`).not.toMatch(/\{[a-zA-Z]\w*\}/);
      // A detail-bearing tool really appends its MCP addendum.
      if (binding.detailKey !== undefined) {
        expect(text.length).toBeGreaterThan(getMessage(binding.key, 'en').length);
      } else {
        expect(text).toBe(getMessage(binding.key, 'en'));
      }
    }
  });

  it('every bound key is a real en+tr pair, never an English-only row', () => {
    const monolingual: string[] = [];
    for (const [name, binding] of Object.entries(MCP_TOOL_DESCRIPTION_BINDINGS)) {
      for (const key of [binding.key, binding.detailKey].filter((k): k is string => k !== undefined)) {
        const langs = getMessageLanguages(key);
        if (!langs.includes('en') || !langs.includes('tr')) {
          monolingual.push(`${name} → ${key} (${langs.join(',') || 'missing key'})`);
        }
      }
    }
    expect(monolingual).toEqual([]);
  });

  it('parity: every CLI-counterpart tool reads the SAME key the CLI command reads', () => {
    const shared = Object.entries(MCP_TOOL_DESCRIPTION_BINDINGS).filter(
      ([, b]) => b.surface === 'cli-shared',
    );
    expect(shared.length).toBeGreaterThan(0);

    const notSharedByCli = shared
      .filter(([, b]) => !cliSources.includes(`'${b.key}'`))
      .map(([name, b]) => `${name} → ${b.key}`);
    expect(
      notSharedByCli,
      'these keys are declared CLI-shared but no CLI command reads them — the two surfaces would drift',
    ).toEqual([]);
  });

  it('keeps the two namespaces honest: MCP-only owns mcp.*.desc, CLI-shared never does', () => {
    for (const [name, binding] of Object.entries(MCP_TOOL_DESCRIPTION_BINDINGS)) {
      if (binding.surface === 'mcp-only') {
        expect(binding.key, `${name} is MCP-only but not in the mcp.* namespace`).toMatch(/^mcp\.[a-z_]+\.desc$/);
        expect(binding.detailKey, `${name} is MCP-only and needs no addendum`).toBeUndefined();
      } else {
        expect(binding.key, `${name} is CLI-shared but points at an MCP-private key`).not.toMatch(/^mcp\./);
        expect(binding.detailKey).toMatch(/^mcp\.[a-z_]+\.detail$/);
      }
    }
  });

  it('gives each tool its own key — no two tools resolve the same description', () => {
    const keys = Object.values(MCP_TOOL_DESCRIPTION_BINDINGS).map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('language sample 1 — deckent_start renders differently in en and tr', () => {
    const en = mcpToolDescription('deckent_start', { lang: 'en' });
    const tr = mcpToolDescription('deckent_start', { lang: 'tr' });
    expect(en).toBe(`${getMessage('cli.start.desc', 'en')} ${getMessage('mcp.start.detail', 'en')}`);
    expect(tr).toBe(`${getMessage('cli.start.desc', 'tr')} ${getMessage('mcp.start.detail', 'tr')}`);
    expect(tr).not.toBe(en);
  });

  it('language sample 2 — MCP-only deckent_agent_manage renders differently in en and tr', () => {
    const en = mcpToolDescription('deckent_agent_manage', { lang: 'en' });
    const tr = mcpToolDescription('deckent_agent_manage', { lang: 'tr' });
    expect(en).toBe(getMessage('mcp.agent_manage.desc', 'en'));
    expect(tr).toBe(getMessage('mcp.agent_manage.desc', 'tr'));
    expect(tr).not.toBe(en);
  });

  it('the server-seeded language reaches registration — tools register in tr when seeded tr', () => {
    setMcpToolDescriptionLanguage('tr');
    const turkish = capture();
    expect(turkish.get('deckent_status')!['description']).toBe(mcpToolDescription('deckent_status', { lang: 'tr' }));
    expect(turkish.get('deckent_status')!['description']).not.toBe(
      effective.get('deckent_status')!['description'],
    );
  });

  it('falls back to the canonical resolver, never a hardcoded literal, when nothing is seeded', () => {
    resetMcpToolDescriptionLanguage();
    expect(mcpToolDescription('deckent_doctor')).toBe(
      mcpToolDescription('deckent_doctor', { lang: resolveLanguage(undefined) }),
    );
  });

  it('fails closed on an unbound tool instead of shipping an empty description', () => {
    expect(() => mcpToolDescription('deckent_not_a_tool')).toThrow(/E_MCP_TOOL_DESCRIPTION_UNBOUND/);
  });

  it('keeps deckent_audit\'s DESTRUCTIVE warning after the migration', () => {
    expect(String(effective.get('deckent_audit')!['description'])).toContain('DESTRUCTIVE');
  });
});
