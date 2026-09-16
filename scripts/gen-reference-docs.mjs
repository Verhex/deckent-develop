#!/usr/bin/env node
// gen-reference-docs.mjs — Sprint 172 Task C2
// Single source of truth for MCP tools/resources, ADR index, and agent docs.
// CLI docs are generated exclusively by scripts/generate-cli-docs.ts from the
// canonical CliCommandContract; this script deliberately does not own them.
// Modes:
//   --check  → exit 1 if any target file drifts from generated content (CI gate)
//   --write  → overwrite targets in place
// Exit codes: 0 = ok / in-sync, 1 = drift detected (check) or write error, 2 = bad args

import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..');

const AUTOGEN_START = (id) => `<!-- AUTOGEN:START id="${id}" -->`;
const AUTOGEN_END = (id) => `<!-- AUTOGEN:END id="${id}" -->`;

// ─── filesystem helpers ──────────────────────────────────────────────────────

function listFilesRecursive(dir, predicate) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'node_modules') continue;
      out.push(...listFilesRecursive(p, predicate));
    } else if (entry.isFile() && predicate(entry.name, p)) {
      out.push(p);
    }
  }
  return out;
}

// ─── MCP tools parser ────────────────────────────────────────────────────────

const TOOL_RE = /server\.registerTool\(\s*['"]([a-zA-Z0-9_-]+)['"]\s*,\s*\{([\s\S]*?)\}\s*,\s*async/g;
const TITLE_RE = /title:\s*['"`]([^'"`]+)['"`]/;
const DESC_RE = /description:\s*['"`]([^'"`]+)['"`]/;

export function parseMcpTools(toolsDir) {
  const files = listFilesRecursive(toolsDir, (n) => n.endsWith('.ts') && !n.endsWith('.d.ts') && n !== 'index.ts');
  const tools = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    let m;
    TOOL_RE.lastIndex = 0;
    while ((m = TOOL_RE.exec(src)) !== null) {
      const name = m[1];
      const opts = m[2];
      const title = TITLE_RE.exec(opts)?.[1] ?? '';
      const description = DESC_RE.exec(opts)?.[1] ?? '';
      tools.push({ name, title, description });
    }
  }
  // Sort deterministically by name.
  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
}

// ─── MCP resources parser ────────────────────────────────────────────────────

const RESOURCE_RE = /server\.registerResource\(\s*['"]([a-zA-Z0-9_-]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*\{([\s\S]*?)\}\s*,\s*async/g;
const MIME_RE = /mimeType:\s*['"`]([^'"`]+)['"`]/;

export function parseMcpResources(resDir) {
  const files = listFilesRecursive(resDir, (n) => n.endsWith('.ts') && !n.endsWith('.d.ts') && n !== 'index.ts');
  const resources = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    let m;
    RESOURCE_RE.lastIndex = 0;
    while ((m = RESOURCE_RE.exec(src)) !== null) {
      const name = m[1];
      const uri = m[2];
      const opts = m[3];
      const title = TITLE_RE.exec(opts)?.[1] ?? '';
      const description = DESC_RE.exec(opts)?.[1] ?? '';
      const mimeType = MIME_RE.exec(opts)?.[1] ?? '';
      resources.push({ name, uri, title, description, mimeType });
    }
  }
  resources.sort((a, b) => a.name.localeCompare(b.name));
  return resources;
}

// ─── ADR parser ──────────────────────────────────────────────────────────────

// Recognizes both the legacy `NNN-slug.md` naming and the post-2026-06-30 ADR-G/ADR-D
// taxonomy `adr-(g|d)-NNN-slug.md` (ADR-G-019). README.md and any other non-numbered file
// never match either alternative.
const ADR_FILE_RE = /^(?:\d+-|adr-[gd]-\d+-).+\.md$/i;
// Optional class-letter group before the number: undefined → legacy `# ADR-NNN:` heading,
// 'G'/'D' → new-taxonomy `# ADR-G-NNN:` / `# ADR-D-NNN:` heading.
const ADR_HEADING_RE = /^#\s+ADR-(?:([GD])-)?(\d+):\s*(.+)$/im;
const ADR_STATUS_RE = /\*\*Status:\*\*\s*([a-zA-Z]+)/;

export function parseAdrs(adrDir) {
  if (!existsSync(adrDir)) return [];
  const out = [];
  for (const entry of readdirSync(adrDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!ADR_FILE_RE.test(entry.name)) continue;
    const file = join(adrDir, entry.name);
    const content = readFileSync(file, 'utf-8');
    const head = ADR_HEADING_RE.exec(content);
    if (!head) continue;
    const cls = head[1] ? head[1].toUpperCase() : null;
    const idNum = head[2];
    const title = head[3].trim();
    const status = (ADR_STATUS_RE.exec(content)?.[1] ?? 'unknown').toLowerCase();
    const id = cls ? `ADR-${cls}-${idNum.padStart(3, '0')}` : `ADR-${idNum.padStart(3, '0')}`;
    out.push({ id, num: parseInt(idNum, 10), cls, title, status, file: entry.name });
  }
  // Deduplicate by id (some ADRs may have duplicate files — keep highest precedence file)
  const byId = new Map();
  for (const a of out) {
    const existing = byId.get(a.id);
    // Prefer accepted over proposed; otherwise alphabetical filename
    if (!existing) byId.set(a.id, a);
    else if (existing.status !== 'accepted' && a.status === 'accepted') byId.set(a.id, a);
  }
  // Legacy (no class) sorts before new-taxonomy; within new-taxonomy, ADR-D-* before
  // ADR-G-* (alphabetical), numeric ascending within each class — matches the
  // hand-authored docs/adr/README.md ordering this generator must reproduce.
  return Array.from(byId.values()).sort((a, b) => {
    const clsA = a.cls ?? '';
    const clsB = b.cls ?? '';
    if (clsA !== clsB) return clsA.localeCompare(clsB);
    return a.num - b.num;
  });
}

// ─── Agents parser ───────────────────────────────────────────────────────────

export function parseAgents(agentsDir) {
  if (!existsSync(agentsDir)) return [];
  const out = [];
  for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive') continue;
    const manifest = join(agentsDir, entry.name, 'agent.json');
    if (!existsSync(manifest)) continue;
    try {
      const data = JSON.parse(readFileSync(manifest, 'utf-8'));
      out.push({
        id: data.id ?? entry.name,
        name: data.name ?? entry.name,
        description: data.description ?? '',
        expertise: Array.isArray(data.expertise) ? data.expertise : [],
        builtIn: !String(data.id ?? entry.name).startsWith('temp-'),
      });
    } catch {
      // Skip malformed manifests.
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

// ─── escape helper for markdown table cells ──────────────────────────────────

function tableCell(s) {
  return String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    // VitePress's Vue compiler parses bare `<word>` patterns as unclosed HTML
    // tags and bombs the build (e.g. `<command>`, `<sprint-id>` in usage
    // strings). Escape as HTML entities so they render as literal text but
    // are no longer parsed as element openers. Real HTML in source (e.g.
    // `<br/>`, `<sub>`) won't match this anchored single-token pattern.
    .replace(/<([a-zA-Z][a-zA-Z0-9_-]*)>/g, '&lt;$1&gt;')
    .trim();
}

// ─── Renderers ───────────────────────────────────────────────────────────────

export function renderMcpTools(tools) {
  const lines = [];
  lines.push(`> ${tools.length} tools registered. Generated from \`src/mcp/tools/*.ts\`.`);
  lines.push('');
  lines.push('| Tool | Title | Description |');
  lines.push('|------|-------|-------------|');
  for (const t of tools) {
    lines.push(`| \`${t.name}\` | ${tableCell(t.title)} | ${tableCell(t.description)} |`);
  }
  return lines.join('\n') + '\n';
}

export function renderMcpResources(resources) {
  const lines = [];
  lines.push(`> ${resources.length} resources registered. Generated from \`src/mcp/resources/*.ts\`.`);
  lines.push('');
  lines.push('| Resource | URI | MIME | Description |');
  lines.push('|----------|-----|------|-------------|');
  for (const r of resources) {
    lines.push(`| \`${r.name}\` | \`${r.uri}\` | \`${r.mimeType}\` | ${tableCell(r.description)} |`);
  }
  return lines.join('\n') + '\n';
}

export function renderAdrs(adrs) {
  const lines = [];
  lines.push(`> ${adrs.length} ADRs. Generated from \`docs/adr/*.md\`.`);
  lines.push('');
  // Group counts by status
  const counts = {};
  for (const a of adrs) counts[a.status] = (counts[a.status] ?? 0) + 1;
  const statusLine = Object.keys(counts).sort().map((s) => `${s} (${counts[s]})`).join(' · ');
  if (statusLine) lines.push(`**By status:** ${statusLine}`);
  lines.push('');
  lines.push('| ID | Title | Status | File |');
  lines.push('|----|-------|--------|------|');
  for (const a of adrs) {
    lines.push(`| ${a.id} | ${tableCell(a.title)} | ${a.status} | [\`${a.file}\`](./${a.file}) |`);
  }
  return lines.join('\n') + '\n';
}

export function renderAgents(agents) {
  const lines = [];
  const builtIn = agents.filter((a) => a.builtIn);
  const custom = agents.filter((a) => !a.builtIn);
  lines.push(`> ${agents.length} agents (${builtIn.length} built-in, ${custom.length} custom). Generated from \`.deckent/agents/*/agent.json\`.`);
  lines.push('');
  lines.push('| Agent | Name | Expertise | Description |');
  lines.push('|-------|------|-----------|-------------|');
  for (const a of agents) {
    lines.push(`| \`${a.id}\` | ${tableCell(a.name)} | ${tableCell(a.expertise.join(', '))} | ${tableCell(a.description)} |`);
  }
  return lines.join('\n') + '\n';
}

// ─── AUTOGEN block replacement ───────────────────────────────────────────────

export function replaceAutogenBlock(content, blockId, newBody) {
  const start = AUTOGEN_START(blockId);
  const end = AUTOGEN_END(blockId);
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error(`AUTOGEN markers for id="${blockId}" not found in content`);
  }
  const before = content.slice(0, startIdx + start.length);
  const after = content.slice(endIdx);
  const body = newBody.endsWith('\n') ? newBody : newBody + '\n';
  return `${before}\n${body}${after}`;
}

// ─── Build target file content (header + AUTOGEN block + body) ───────────────

// Preserves any hand-written content after the AUTOGEN:END marker (e.g. docs/adr/README.md's
// "Archived" note) — without this, regen would silently delete it on every --write, tripping
// the "don't corrupt hand-written README content" NO-GO.
function extractTrailer(existingContent, blockId) {
  if (!existingContent) return '';
  const end = AUTOGEN_END(blockId);
  const endIdx = existingContent.indexOf(end);
  if (endIdx === -1) return '';
  return existingContent.slice(endIdx + end.length);
}

function buildTargetContent(blockId, header, body, existingContent = '') {
  const head = [
    header.trim(),
    '',
    AUTOGEN_START(blockId),
    body.trimEnd(),
    AUTOGEN_END(blockId),
  ].join('\n');
  const trailer = extractTrailer(existingContent, blockId);
  return trailer ? head + trailer : head + '\n';
}

/**
 * For files with rich hand/separately-generated content (cli.md), embed an
 * AUTOGEN block inside the existing file without disturbing the rest.
 *
 * Strategy:
 *   - If the file does not exist: write a minimal scaffold (header + AUTOGEN block).
 *   - If the file exists with AUTOGEN markers for blockId: replace block content.
 *   - If the file exists without AUTOGEN markers: append a new section + AUTOGEN
 *     block at the end (preserves all prior content; idempotent on subsequent runs).
 */
function buildEmbedContent(existingContent, blockId, header, body) {
  const start = AUTOGEN_START(blockId);
  const end = AUTOGEN_END(blockId);
  if (existingContent && existingContent.includes(start) && existingContent.includes(end)) {
    return replaceAutogenBlock(existingContent, blockId, body.trimEnd());
  }
  // Append a fresh section with marker block at the end.
  const tail = [
    '',
    '---',
    '',
    header.trim(),
    '',
    start,
    body.trimEnd(),
    end,
    '',
  ].join('\n');
  if (!existingContent) {
    return tail.replace(/^\n---\n\n/, ''); // drop the leading separator if no prior content
  }
  const trimmed = existingContent.replace(/\s+$/, '');
  return `${trimmed}\n${tail}`;
}

// ─── Generated reference tree: locales ───────────────────────────────────────
//
// Machine-written reference docs live under `docs/generated/<lang>/reference/`,
// deliberately OUTSIDE the hand-written `docs/<lang>/reference/` tree so the two
// can never be confused or hand-edited into each other (Alperen, 2026-08-02).
// Only the prose chrome is localized; table payloads are identifiers (tool names,
// CLI flags, agent ids) sourced from code and are not translated.
export const REFERENCE_LOCALES = [
  {
    lang: 'en',
    dir: 'docs/generated/en/reference',
    headers: {
      mcpTools:
        '# MCP Tools Reference\n\n> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.\n\nDeckent ships an MCP server that exposes orchestration to MCP-compatible IDEs (Claude Code, Cursor, etc.). The tools below are registered in `src/mcp/tools/*.ts` and surfaced via `deckent-mcp` stdio transport.',
      mcpResources:
        '# MCP Resources Reference\n\n> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.\n\nMCP resources expose live project state (dashboard, directives, memory, debt, tasks, …) to MCP-compatible IDEs via the `deckent://` URI scheme.',
      agents:
        '# Agents Reference\n\n> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.\n\nAgents are domain specialists that Brain assigns per task. Built-in agents live under `.deckent/agents/`; `temp-*` agents are runtime-generated and auto-promoted/demoted by the Evolution Pipeline.',
    },
  },
  {
    lang: 'tr',
    dir: 'docs/generated/tr/reference',
    headers: {
      mcpTools:
        '# MCP Tool Referansı\n\n> **Otomatik üretilir** — AUTOGEN bloğunu elle düzenlemeyin. Yeniden üretmek için `npm run docs:ref` çalıştırın.\n\nDeckent, orchestration yüzeyini MCP-uyumlu IDE\'lere (Claude Code, Cursor vb.) açan bir MCP sunucusu içerir. Aşağıdaki tool\'lar `src/mcp/tools/*.ts` içinde kayıtlıdır ve `deckent-mcp` stdio transport üzerinden sunulur.\n\n> Tablo içeriği koddan gelen tanımlayıcılardır (tool adları, parametreler); çevrilmez.',
      mcpResources:
        '# MCP Kaynak Referansı\n\n> **Otomatik üretilir** — AUTOGEN bloğunu elle düzenlemeyin. Yeniden üretmek için `npm run docs:ref` çalıştırın.\n\nMCP kaynakları; canlı proje durumunu (dashboard, directives, memory, debt, tasks, …) `deckent://` URI şeması üzerinden MCP-uyumlu IDE\'lere açar.\n\n> Tablo içeriği koddan gelen tanımlayıcılardır; çevrilmez.',
      agents:
        '# Agent Referansı\n\n> **Otomatik üretilir** — AUTOGEN bloğunu elle düzenlemeyin. Yeniden üretmek için `npm run docs:ref` çalıştırın.\n\nAgent\'lar, Brain\'in task başına atadığı alan uzmanlarıdır. Yerleşik agent\'lar `.deckent/agents/` altında yaşar; `temp-*` agent\'ları runtime\'da üretilir ve Evolution Pipeline tarafından otomatik terfi/tenzil edilir.\n\n> Tablo içeriği koddan gelen tanımlayıcılardır; çevrilmez.',
    },
  },
];

// ─── Collect all generations (parse → render → expected content) ─────────────

export function collectGenerations({ root = DEFAULT_ROOT } = {}) {
  const toolsDir = join(root, 'src/mcp/tools');
  const resDir = join(root, 'src/mcp/resources');
  const adrDir = join(root, 'docs/adr');
  const agentsDir = join(root, '.deckent/agents');

  const tools = parseMcpTools(toolsDir);
  const resources = parseMcpResources(resDir);
  const adrs = parseAdrs(adrDir);
  const agents = parseAgents(agentsDir);

  const generations = [
    ...REFERENCE_LOCALES.flatMap((locale) => [
      {
        id: `mcp-tools-${locale.lang}`,
        target: `${locale.dir}/mcp-tools.md`,
        targetDir: locale.dir,
        mode: 'fresh',
        header: locale.headers.mcpTools,
        body: renderMcpTools(tools),
        count: tools.length,
      },
      {
        id: `mcp-resources-${locale.lang}`,
        target: `${locale.dir}/mcp-resources.md`,
        targetDir: locale.dir,
        mode: 'fresh',
        header: locale.headers.mcpResources,
        body: renderMcpResources(resources),
        count: resources.length,
      },
      {
        id: `agents-${locale.lang}`,
        target: `${locale.dir}/agents.md`,
        targetDir: locale.dir,
        mode: 'fresh',
        header: locale.headers.agents,
        body: renderAgents(agents),
        count: agents.length,
      },
    ]),
    {
      id: 'adr-index',
      target: 'docs/adr/README.md',
      targetDir: 'docs/adr',
      mode: 'fresh',
      header: '# Architecture Decision Records — Index\n\n> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.\n\nThe canonical source of truth for ADR content is `.brain/memory.db` (Memory V2). This index is generated by scanning `docs/adr/*.md` filenames.',
      body: renderAdrs(adrs),
      count: adrs.length,
    },
  ];

  // Compute expected content + drift status.
  for (const gen of generations) {
    let actual = '';
    let exists = false;
    const targetPath = join(root, gen.target);
    if (existsSync(targetPath)) {
      exists = true;
      actual = readFileSync(targetPath, 'utf-8');
    }
    const expected = gen.mode === 'embed'
      ? buildEmbedContent(actual, gen.id, gen.header, gen.body)
      : buildTargetContent(gen.id, gen.header, gen.body, actual);
    gen.content = expected;
    gen.actual = actual;
    gen.exists = exists;
    gen.drift = !exists || actual !== expected;
  }

  return generations;
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

function fmtCount(n, label) {
  if (n === 1) return `1 ${label}`;
  // pluralise: entry → entries, otherwise add s
  const plural = label.endsWith('y') ? label.slice(0, -1) + 'ies' : label + 's';
  return `${n} ${plural}`;
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const args = new Set(argv);
  const check = args.has('--check');
  const write = args.has('--write');
  if (args.has('-h') || args.has('--help')) {
    process.stdout.write(
      'gen-reference-docs.mjs — generate reference docs from source\n\n' +
      'Usage:\n' +
      '  node scripts/gen-reference-docs.mjs --check   # CI gate (exit 1 on drift)\n' +
      '  node scripts/gen-reference-docs.mjs --write   # rewrite target files\n',
    );
    return 0;
  }
  if (!check && !write) {
    process.stderr.write('error: must pass --check or --write\n');
    return 2;
  }
  const root = opts.root ?? DEFAULT_ROOT;
  const gens = collectGenerations({ root });

  if (write) {
    let updated = 0;
    for (const gen of gens) {
      const targetPath = join(root, gen.target);
      mkdirSync(dirname(targetPath), { recursive: true });
      if (gen.drift) {
        writeFileSync(targetPath, gen.content);
        updated += 1;
        process.stdout.write(`  ✎ ${gen.target} (${fmtCount(gen.count, 'entry')})\n`);
      } else {
        process.stdout.write(`  ✓ ${gen.target} (${fmtCount(gen.count, 'entry')}, in sync)\n`);
      }
    }
    process.stdout.write(`\ngen-reference-docs: wrote ${updated} of ${gens.length} target file(s).\n`);
    return 0;
  }

  // check mode
  const drifting = gens.filter((g) => g.drift);
  for (const gen of gens) {
    const marker = gen.drift ? '✗' : '✓';
    const note = gen.drift ? (gen.exists ? 'stale' : 'missing') : 'in sync';
    process.stdout.write(`  ${marker} ${gen.target} — ${note} (${fmtCount(gen.count, 'entry')})\n`);
  }
  if (drifting.length > 0) {
    process.stderr.write(
      `\ngen-reference-docs: ${drifting.length} of ${gens.length} reference doc(s) drift.` +
      ` Run \`npm run docs:ref\` to regenerate.\n`,
    );
    return 1;
  }
  process.stdout.write(`\ngen-reference-docs: all ${gens.length} reference doc(s) in sync.\n`);
  return 0;
}

// ─── invoke as CLI when run directly ─────────────────────────────────────────

const isMain = (() => {
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  const code = main();
  process.exit(code);
}
