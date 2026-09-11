#!/usr/bin/env node
/**
 * P0 handler inventory — single read-only producer (Astra P0-REVISE 2026-09-10).
 * No repo mutation; stdout JSON. Run from repo root:
 *   node docs/execution/evidence/terminal-winddown-20260910/p0-generate-handler-inventory.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '../../../../');

function sha256File(rel) {
  const buf = readFileSync(join(root, rel));
  return createHash('sha256').update(buf).digest('hex');
}

function extractBlock(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`block not found: ${startMarker}`);
  return src.slice(start, end);
}

function parseSlashCatalog(slashSrc) {
  const block = extractBlock(slashSrc, 'const SLASH_CATALOG', '// ─── Public API');
  const entries = [];
  for (const m of block.matchAll(/name: '(\/[^']+)'[\s\S]*?(?=^\s*\{|\];)/gm)) {
    const chunk = m[0];
    const name = chunk.match(/name: '(\/[^']+)'/)?.[1];
    if (!name) continue;
    const agenticTool = chunk.match(/agenticTool: '([^']+)'/)?.[1] ?? null;
    const requiresCapability = chunk.match(/requiresCapability: '([^']+)'/)?.[1] ?? null;
    const discoverable = !chunk.includes('discoverable: false');
    entries.push({ name, agenticTool, requiresCapability, discoverable });
  }
  return entries;
}

function parseCliBridgeNames(bridgeSrc) {
  const block = extractBlock(bridgeSrc, 'export const CLI_BRIDGE_TOOLS', '];');
  const names = [];
  for (const m of block.matchAll(/name: '(deckent_[^']+)'/g)) names.push(m[1]);
  return names;
}

function parseMcpCatalog(mcpSrc) {
  return [...mcpSrc.matchAll(/name: '(deckent_[^']+)'/g)].map((m) => m[1]);
}

/** Verified handler anchor — numeric lines only when file:line was checked on disk. */
function anchor(symbol, file, linesVerified, anchorNote) {
  const out = { symbol, file };
  if (linesVerified != null) out.linesVerified = linesVerified;
  if (anchorNote) out.anchorNote = anchorNote;
  return out;
}

const META_DISPATCH = {
  '/help': anchor('resolveSlash', 'src/cli/commands/chat-slash-registry.ts', [808, 820]),
  '/exit': anchor('handleSubmit exit', 'src/cli/repl/app.tsx', 2931),
  '/quit': anchor('handleSubmit exit', 'src/cli/repl/app.tsx', 2931),
  '/clear': anchor('handleSubmit clearScreen', 'src/cli/repl/app.tsx', 3033),
  '/do': anchor('runReplDoSlash', 'src/cli/repl/app.tsx', 3204),
  '/term': anchor('parseTermCommand', 'src/cli/repl/app.tsx', [3059, 3076]),
  '/queue': anchor('parseBusyCommand→resolveQueueCommand', 'src/cli/repl/app.tsx', [3079, 3086], 'parseBusyCommand @ busy-controls.ts:167'),
  '/interrupt': anchor('parseBusyCommand→requestActiveTurnInterrupt', 'src/cli/repl/app.tsx', [3045, 3049], 'parseBusyCommand @ busy-controls.ts:167'),
  '/steer': anchor('parseBusyCommand→applySteer', 'src/cli/repl/app.tsx', [3082, 3090], 'applySteer @ busy-controls.ts'),
  '/resume': anchor('resolveResumeCommand', 'src/cli/repl/app.tsx', [3116, 3153], 'task 358-006'),
  '/runs': anchor('runInboxProvider', 'src/cli/repl/app.tsx', [3106, 3110], 'SURF-3; legacy chat-native.ts branch'),
  '/cd': anchor('handleSubmit chdir', 'src/cli/repl/app.tsx', [3156, 3168]),
  '/model': anchor('resolvePickerRequest+switch', 'src/cli/repl/app.tsx', [3007, 3023], 'typed /model @3171+'),
  '/provider': anchor('resolvePickerRequest+switch', 'src/cli/repl/app.tsx', [3007, 3023], 'typed /provider @3171+'),
  '/approve': anchor('resolvePickerRequest', 'src/cli/repl/app.tsx', [3007, 3023], 'resolvePickerRequest @828'),
  '/cancel': anchor('handleSubmit queue clear', 'src/cli/repl/app.tsx', 3026),
  '/renew': anchor('withRenewSlash', 'src/cli/repl/run.tsx', 824),
  '/context': anchor('withContextSlashes', 'src/cli/repl/run.tsx', 1139),
  '/compact': anchor('withContextSlashes', 'src/cli/repl/run.tsx', 1139),
  '/nervous': anchor('buildNervousOutput', 'src/cli/repl/app.tsx', [1263, 1265], 'chat-native.ts:638 legacy loop'),
  '/interrogate': anchor('buildInterrogateOutput', 'src/cli/repl/app.tsx', [1267, 1268], 'chat-native.ts:649 legacy loop'),
  '/mcp': anchor('resolveMcpSlash fallback', 'src/cli/commands/chat-slash-registry.ts', [782, 791], 'live dispatch: repl/mcp-bridge.ts when configured'),
};

function parseNativeExecRegisterLoop(nativeSrc) {
  const m = nativeSrc.match(/for \(const name of (\[[\s\S]*?\]) as const\)/);
  if (!m) throw new Error('native exec register loop not found');
  return [...m[1].matchAll(/'(deckent_[^']+)'/g)].map((x) => x[1]);
}

function parseOptionalNativeMeta(nativeSrc) {
  const flagGated = [];
  if (nativeSrc.includes('registerToolSurfaceTools')) {
    flagGated.push('deckent_search_tools', 'deckent_describe_tool', 'deckent_call_tool');
  }
  if (nativeSrc.includes('registerRunFlowProposalTool')) flagGated.push('deckent_propose_run');
  if (nativeSrc.includes("name: 'deckent_skill_dispatch'")) flagGated.push('deckent_skill_dispatch');
  return { extraction: 'source_pattern_scan', flagGatedTools: flagGated };
}

const slashRel = 'src/cli/commands/chat-slash-registry.ts';
const bridgeRel = 'src/cli/repl/cli-bridge-tool-specs.ts';
const mcpRel = 'src/core/mcp-tool-catalog.ts';
const nativeRel = 'src/cli/repl/native-tool-registry.ts';
const bridgeDispatchRel = 'src/cli/commands/chat-tool-bridge.ts';
const appRel = 'src/cli/repl/app.tsx';
const runRel = 'src/cli/repl/run.tsx';
const busyRel = 'src/cli/repl/busy-controls.ts';
const chatNativeRel = 'src/cli/commands/chat-native.ts';
const toolExecRel = 'src/cli/commands/chat-tool-exec.ts';

const slashSrc = readFileSync(join(root, slashRel), 'utf8');
const bridgeSrc = readFileSync(join(root, bridgeRel), 'utf8');
const mcpSrc = readFileSync(join(root, mcpRel), 'utf8');
const nativeSrc = readFileSync(join(root, nativeRel), 'utf8');
const nativeExecTools = parseNativeExecRegisterLoop(nativeSrc);
const nativeOptionalMeta = parseOptionalNativeMeta(nativeSrc);

const slashEntries = parseSlashCatalog(slashSrc);
const cliBridge = parseCliBridgeNames(bridgeSrc);
const mcpCatalog = parseMcpCatalog(mcpSrc);

const agenticRows = slashEntries.filter((e) => e.agenticTool);
const uniqueAgentic = [...new Set(agenticRows.map((e) => e.agenticTool))];
const metaRows = slashEntries.filter((e) => !e.agenticTool);

const uniqueInMcp = uniqueAgentic.filter((t) => mcpCatalog.includes(t));
const cliBridgeOnly = uniqueAgentic.filter((t) => !mcpCatalog.includes(t));
const mcpWithoutSlash = mcpCatalog.filter((t) => !uniqueAgentic.includes(t));

const missingBridge = uniqueAgentic.filter((t) => !cliBridge.includes(t));

const slashCommands = slashEntries.map((e) => {
  const meta = META_DISPATCH[e.name];
  const isAlias =
    e.name === '/agent' || e.name === '/skill'
      ? { of: e.agenticTool, note: 'compatibility alias; same tool as plural slash' }
      : null;
  return {
    ...e,
    alias: isAlias,
    dispatch: e.agenticTool
      ? {
          ...anchor('resolveSlash→createCliToolDispatcher', bridgeDispatchRel, e.agenticTool === 'deckent_resources' ? 359 : [838, 857]),
          mcpCatalogEntry: mcpCatalog.includes(e.agenticTool),
          cliBridgeSpec: cliBridge.includes(e.agenticTool),
        }
      : (meta ?? anchor('resolveSlash_none_passthrough', slashRel, 860)),
  };
});

let head = 'unknown';
try {
  head = readFileSync(join(root, '.git/refs/heads/main'), 'utf8').trim();
} catch {
  /* optional */
}

const doc = {
  schemaVersion: 3,
  kind: 'p0-handler-inventory',
  generator: 'docs/execution/evidence/terminal-winddown-20260910/p0-generate-handler-inventory.mjs',
  utc: new Date().toISOString(),
  head,
  productLandingCommit: 'e84ca824db95a5f4996d1d90c48b72aebe0a52e4',
  scopeNote:
    'P0 registry inventory only — full CLI subcommand baseline and owner battery remain open (Astra ENTRY 153).',
  sourceDigests: {
    [slashRel]: sha256File(slashRel),
    [bridgeRel]: sha256File(bridgeRel),
    [mcpRel]: sha256File(mcpRel),
    [nativeRel]: sha256File(nativeRel),
    [bridgeDispatchRel]: sha256File(bridgeDispatchRel),
    [appRel]: sha256File(appRel),
    [runRel]: sha256File(runRel),
    [busyRel]: sha256File(busyRel),
    [chatNativeRel]: sha256File(chatNativeRel),
    [toolExecRel]: sha256File(toolExecRel),
  },
  producerChains: {
    slashCatalog: anchor('SLASH_CATALOG', slashRel, [136, 434]),
    cliBridgeTools: anchor('CLI_BRIDGE_TOOLS', bridgeRel, [37, 184]),
    mcpToolCatalog: anchor('TOOL_CATALOG_SOURCE', mcpRel, [33, 85]),
    nativeExecRegister: anchor('native exec register loop', nativeRel, [887, 892]),
    resourcesCliMapping: anchor('deckent_resources cliArgsFor', bridgeDispatchRel, 359),
    busyCommandParse: anchor('parseBusyCommand', busyRel, 167),
  },
  counts: {
    slashCatalogRows: slashEntries.length,
    slashAgenticRows: agenticRows.length,
    slashAgenticUniqueTools: uniqueAgentic.length,
    slashMetaRows: metaRows.length,
    cliBridgeLiteralSpecs: cliBridge.length,
    mcpToolCatalogEntries: mcpCatalog.length,
    slashUniquePresentInMcpCatalog: uniqueInMcp.length,
    slashUniqueCliBridgeOnly: cliBridgeOnly.length,
    mcpCatalogWithoutSlashAlias: mcpWithoutSlash.length,
  },
  parity: {
    slashUniqueToolsAllInCliBridge: missingBridge.length === 0,
    slashUniqueToolsMissingFromCliBridge: missingBridge,
    slashUniqueToolsCliBridgeOnlyNotInMcpCatalog: cliBridgeOnly,
    mcpToolsWithoutAnySlashAgenticAlias: mcpWithoutSlash,
  },
  slashCommands,
  cliBridgeToolNames: cliBridge,
  mcpToolCatalogNames: mcpCatalog,
  nativeSessionTools: {
    execDispatcher: {
      extraction: 'parsed_from_native-tool-registry_register_loop',
      tools: nativeExecTools,
      registryFile: nativeRel,
      linesVerified: [887, 892],
    },
    optionalMeta: nativeOptionalMeta,
  },
  blockedFindings: [
    {
      id: 'P0-PARITY-001',
      class: 'RELATED_BUT_NONBLOCKING',
      truth: 'CLI-native-only surface difference',
      summary:
        'deckent_resources has CLI bridge + /resources slash + tests; not in MCP TOOL_CATALOG. Does not auto-open MCP registration work.',
      evidence: [
        `${bridgeDispatchRel}:359`,
        'tests/cli/chat-slash-resources.test.ts:87',
        `${bridgeRel}:77-85`,
      ],
    },
    {
      id: 'P0-META-001',
      class: 'RELATED_BUT_NONBLOCKING',
      truth: 'kanıtlanamadı (partial test map only)',
      summary:
        'P4 contract coverage for all meta slash commands is UNKNOWN; do not claim zero tests — e.g. tests/cli/repl/context-slashes.test.tsx covers /context,/compact,/renew path.',
      evidence: ['tests/cli/repl/context-slashes.test.tsx', `${slashRel}:808-861`],
    },
    {
      id: 'P0-CONTINUITY-001',
      class: 'BLOCKS_CURRENT_DONE',
      truth: 'kısmen çalışıyor',
      summary:
        'Outer owner continuity not met. Split: identity/context/usage → P1; renewal/liveness → P2; compaction → P3; handler contracts → P4.',
      evidence: ['durum-raporu.md §A/C', 'src/agent/session.ts', 'src/cli/repl/run.tsx'],
    },
  ],
};

process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
