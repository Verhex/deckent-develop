// ═══ deckent mcp CLI (Sprint 229 — AS-5·P1 Task 229-004) ════════════
// Claude-parity management surface for the McpClientBroker:
//   deckent mcp add <name> <cmdOrUrl> [--scope] [--transport]
//   deckent mcp list
//   deckent mcp remove <name>
//   deckent mcp get <name>
//
// State is stored in 3-scope JSON files (matches Task 229-002 / ADR-004):
//   local   → <root>/.mcp.local.json   (personal, gitignored)
//   project → <root>/.mcp.json         (git-tracked, team-shared)
//   user    → ~/.deckent/mcp.json      (global, cross-project)
//
// Reads use the merged view via loadMcpServers (local > project > user).
// Writes target the scope-resolved file directly.
//
// i18n: messages.ts lives outside this task's scope, so TR/EN strings are
// declared locally with the same shape as getMessage. No inline hardcodes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';

import { loadMcpServers } from '../../mcp-client/config.js';
import type { McpServerDef } from '../../mcp-client/types.js';
import { detectLang } from '../helpers/i18n.js';
import { formatTable, print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Scope handling ─────────────────────────────────────────────────

export type McpScope = 'project' | 'user' | 'local';
const VALID_SCOPES: readonly McpScope[] = ['project', 'user', 'local'];

function scopeFilePath(root: string, scope: McpScope): string {
  if (scope === 'user') return join(homedir(), '.deckent', 'mcp.json');
  if (scope === 'local') return join(root, '.mcp.local.json');
  return join(root, '.mcp.json');
}

type ServersMap = Record<string, McpServerDef>;

function readScopeFile(filePath: string): ServersMap {
  if (!existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      if ('mcpServers' in obj && typeof obj['mcpServers'] === 'object' && obj['mcpServers'] !== null) {
        return obj['mcpServers'] as ServersMap;
      }
      return obj as ServersMap;
    }
    return {};
  } catch {
    return {};
  }
}

function writeScopeFile(filePath: string, servers: ServersMap): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(servers, null, 2) + '\n', 'utf-8');
}

function isValidScope(value: string): value is McpScope {
  return (VALID_SCOPES as readonly string[]).includes(value);
}

// ─── i18n (local — messages.ts out of scope) ───────────────────────

type Lang = 'en' | 'tr';
interface MessageEntry { en: string; tr: string }

const MCP_MESSAGES: Record<string, MessageEntry> = {
  'mcp.added': {
    en: 'MCP server "{name}" added to {scope} scope ({transport}).',
    tr: 'MCP server "{name}" {scope} kapsamına eklendi ({transport}).',
  },
  'mcp.removed': {
    en: 'MCP server "{name}" removed from {scope} scope.',
    tr: 'MCP server "{name}" {scope} kapsamından silindi.',
  },
  'mcp.no_servers': {
    en: 'No MCP servers registered.',
    tr: 'Kayıtlı MCP server yok.',
  },
  'mcp.not_found': {
    en: 'MCP server "{name}" not found.',
    tr: 'MCP server "{name}" bulunamadı.',
  },
  'mcp.invalid_scope': {
    en: 'Invalid --scope "{scope}". Use one of: project | user | local.',
    tr: 'Geçersiz --scope "{scope}". Kullanılabilir: project | user | local.',
  },
  'mcp.invalid_transport': {
    en: 'Invalid --transport "{transport}". Use one of: stdio | http.',
    tr: 'Geçersiz --transport "{transport}". Kullanılabilir: stdio | http.',
  },
  'mcp.http_needs_url': {
    en: 'HTTP transport requires a URL (http:// or https://) as the target.',
    tr: 'HTTP taşıması için hedef bir URL (http:// veya https://) gerekir.',
  },
  'mcp.overwrite_warning': {
    en: 'Note: server "{name}" already exists in {scope} scope — overwriting.',
    tr: 'Not: "{name}" server\'ı {scope} kapsamında zaten var — üzerine yazılıyor.',
  },
  'mcp.invalid_kv': {
    en: 'Invalid key=value pair: "{value}".',
    tr: 'Geçersiz anahtar=değer çifti: "{value}".',
  },
};

export function mcpMessage(
  key: keyof typeof MCP_MESSAGES,
  lang: string,
  vars?: Record<string, string>,
): string {
  const entry = MCP_MESSAGES[key];
  if (!entry) return String(key);
  const normalized: Lang = lang === 'tr' ? 'tr' : 'en';
  const template = entry[normalized] ?? entry.en;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, varName: string) => vars[varName] ?? `{${varName}}`);
}

// ─── Helpers ────────────────────────────────────────────────────────

function inferTransport(target: string): 'stdio' | 'http' {
  return /^https?:\/\//i.test(target) ? 'http' : 'stdio';
}

function parseKeyValuePairs(items: readonly string[] | undefined, lang: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!items) return out;
  for (const item of items) {
    const idx = item.indexOf('=');
    if (idx <= 0) {
      throw new Error(mcpMessage('mcp.invalid_kv', lang, { value: item }));
    }
    const k = item.slice(0, idx);
    const v = item.slice(idx + 1);
    out[k] = v;
  }
  return out;
}

interface AddOptions {
  scope?: string;
  transport?: string;
  header?: string[];
  env?: string[];
  root?: string;
}

interface GetOptions {
  json?: boolean;
  root?: string;
}

interface ListOptions {
  json?: boolean;
  root?: string;
}

interface RemoveOptions {
  scope?: string;
  root?: string;
}

// ─── Action handlers (exported for tests) ──────────────────────────

export function handleAdd(
  name: string,
  target: string,
  extraArgs: string[],
  opts: AddOptions,
): void {
  const root = opts.root ?? resolveProjectRoot();
  const lang = detectLang(root);

  const scopeRaw = opts.scope ?? 'project';
  if (!isValidScope(scopeRaw)) {
    throw new Error(mcpMessage('mcp.invalid_scope', lang, { scope: scopeRaw }));
  }
  const scope: McpScope = scopeRaw;

  let transport: 'stdio' | 'http';
  if (opts.transport === undefined) {
    transport = inferTransport(target);
  } else if (opts.transport === 'stdio' || opts.transport === 'http') {
    transport = opts.transport;
  } else {
    throw new Error(mcpMessage('mcp.invalid_transport', lang, { transport: opts.transport }));
  }

  let def: McpServerDef;
  if (transport === 'http') {
    if (!/^https?:\/\//i.test(target)) {
      throw new Error(mcpMessage('mcp.http_needs_url', lang));
    }
    const headers = parseKeyValuePairs(opts.header, lang);
    def = {
      transport: 'http',
      url: target,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    };
  } else {
    const env = parseKeyValuePairs(opts.env, lang);
    def = {
      transport: 'stdio',
      command: target,
      ...(extraArgs.length > 0 ? { args: extraArgs } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  }

  const filePath = scopeFilePath(root, scope);
  const existing = readScopeFile(filePath);
  if (existing[name]) {
    print(mcpMessage('mcp.overwrite_warning', lang, { name, scope }));
  }
  existing[name] = def;
  writeScopeFile(filePath, existing);

  print(mcpMessage('mcp.added', lang, { name, scope, transport }));
}

export function handleList(opts: ListOptions): void {
  const root = opts.root ?? resolveProjectRoot();
  const lang = detectLang(root);
  const servers = loadMcpServers(root);
  const entries = Object.entries(servers);

  if (opts.json) {
    print(JSON.stringify(servers, null, 2));
    return;
  }

  if (entries.length === 0) {
    print(mcpMessage('mcp.no_servers', lang));
    return;
  }

  const rows = entries.map(([name, def]) => {
    if (def.transport === 'http') {
      return [name, 'http', def.url];
    }
    const argsPart = def.args && def.args.length > 0 ? ' ' + def.args.join(' ') : '';
    return [name, 'stdio', def.command + argsPart];
  });
  print(formatTable(['Name', 'Transport', 'Target'], rows));
}

export function handleRemove(name: string, opts: RemoveOptions): void {
  const root = opts.root ?? resolveProjectRoot();
  const lang = detectLang(root);

  const scopes: McpScope[] = opts.scope
    ? (isValidScope(opts.scope) ? [opts.scope] : (() => {
        throw new Error(mcpMessage('mcp.invalid_scope', lang, { scope: opts.scope! }));
      })())
    : ['local', 'project', 'user'];

  for (const scope of scopes) {
    const filePath = scopeFilePath(root, scope);
    const existing = readScopeFile(filePath);
    if (existing[name]) {
      delete existing[name];
      writeScopeFile(filePath, existing);
      print(mcpMessage('mcp.removed', lang, { name, scope }));
      return;
    }
  }

  throw new Error(mcpMessage('mcp.not_found', lang, { name }));
}

export function handleGet(name: string, opts: GetOptions): void {
  const root = opts.root ?? resolveProjectRoot();
  const lang = detectLang(root);
  const servers = loadMcpServers(root);
  const def = servers[name];
  if (!def) {
    throw new Error(mcpMessage('mcp.not_found', lang, { name }));
  }

  if (opts.json) {
    print(JSON.stringify(def, null, 2));
    return;
  }

  if (def.transport === 'http') {
    print(`${name}:`);
    print(`  transport: http`);
    print(`  url: ${def.url}`);
    if (def.headers && Object.keys(def.headers).length > 0) {
      print(`  headers:`);
      for (const [k, v] of Object.entries(def.headers)) {
        print(`    ${k}=${v}`);
      }
    }
  } else {
    print(`${name}:`);
    print(`  transport: stdio`);
    print(`  command: ${def.command}`);
    if (def.args && def.args.length > 0) {
      print(`  args: ${def.args.join(' ')}`);
    }
    if (def.env && Object.keys(def.env).length > 0) {
      print(`  env:`);
      for (const [k, v] of Object.entries(def.env)) {
        print(`    ${k}=${v}`);
      }
    }
  }
}

// ─── Registration (ADR-012 pattern) ─────────────────────────────────

export function registerMcp(program: Command): void {
  const mcpCmd = program.command('mcp').description('Manage MCP servers (Claude-parity)');

  mcpCmd
    .command('add <name> <cmdOrUrl> [args...]')
    .description('Add an MCP server (stdio or http) — writes to .mcp.json by scope')
    .option('--scope <scope>', 'Config scope: project | user | local', 'project')
    .option('--transport <transport>', 'Transport: stdio | http (auto-detected if omitted)')
    .option('--header <kv...>', 'HTTP header as key=value (repeatable)')
    .option('--env <kv...>', 'stdio env as key=value (repeatable)')
    .action((name: string, cmdOrUrl: string, args: string[], opts: AddOptions) => {
      try {
        handleAdd(name, cmdOrUrl, args, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  mcpCmd
    .command('list')
    .description('List registered MCP servers (merged: local > project > user)')
    .option('--json', 'Output as JSON')
    .action((opts: ListOptions) => {
      try {
        handleList(opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  mcpCmd
    .command('remove <name>')
    .description('Remove an MCP server (searches all scopes if --scope omitted)')
    .option('--scope <scope>', 'Restrict removal to scope: project | user | local')
    .action((name: string, opts: RemoveOptions) => {
      try {
        handleRemove(name, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });

  mcpCmd
    .command('get <name>')
    .description('Show details for an MCP server (from merged view)')
    .option('--json', 'Output as JSON')
    .action((name: string, opts: GetOptions) => {
      try {
        handleGet(name, opts);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
