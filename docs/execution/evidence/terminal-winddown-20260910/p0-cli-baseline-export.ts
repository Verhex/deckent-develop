/**
 * Read-only export for P0 CLI baseline inventory (tsx one-shot).
 * Run: npx tsx docs/execution/evidence/terminal-winddown-20260910/p0-cli-baseline-export.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  CLI_COMMAND_CONTRACTS,
  contractPathKey,
  cliContracts,
  registryContracts,
  CONTRACT_SUMMARY_BINDING_DEBT,
  contractOptionCoverage,
  contractArgumentCoverage,
} from '../../../../src/core/cli-command-contract.js';
import { COMMAND_REGISTRY } from '../../../../src/core/command-registry.js';
import { TOOL_CATALOG } from '../../../../src/mcp/tools/tool-catalog.js';
import { buildSlashRegistry } from '../../../../src/cli/commands/chat-slash-registry.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '../../../../');

function sha256File(rel: string): string {
  return createHash('sha256').update(readFileSync(join(root, rel))).digest('hex');
}

const slashAgentic = new Set(
  buildSlashRegistry()
    .map((c) => c.agenticTool)
    .filter((t): t is string => typeof t === 'string'),
);

const mcpNames = new Set(TOOL_CATALOG.map((t) => t.name));

const rows = CLI_COMMAND_CONTRACTS.map((c) => {
  const pathKey = contractPathKey(c.path);
  const mcpLinked =
    c.registry?.mcpNames?.filter((n) => mcpNames.has(n)) ?? [];
  return {
    path: pathKey,
    surfaces: c.surfaces,
    effect: c.effect,
    defaultExecution: c.defaultExecution,
    authority: c.authority,
    output: c.output,
    summaryBinding: c.summaryBinding,
    catalogDependent: c.catalogDependent === true,
    hasRegistryProjection: c.registry !== undefined,
    mcpNames: c.registry?.mcpNames ?? [],
    mcpNamesInCatalog: mcpLinked,
    p0ReviewStatus:
      c.surfaces.includes('cli') && c.summaryBinding !== 'exact'
        ? 'blocked_summary_binding'
        : 'catalog_row_present',
  };
});

const doc = {
  schemaVersion: 1,
  kind: 'p0-cli-baseline-inventory',
  utc: new Date().toISOString(),
  head: readFileSync(join(root, '.git/refs/heads/main'), 'utf8').trim(),
  scopeNote:
    'P0 CLI contract baseline from CLI_COMMAND_CONTRACTS SSOT; not runtime owner battery or dist build proof.',
  sourceDigests: {
    'src/core/cli-command-contract.ts': sha256File('src/core/cli-command-contract.ts'),
    'src/core/command-registry.ts': sha256File('src/core/command-registry.ts'),
    'src/core/mcp-tool-catalog.ts': sha256File('src/core/mcp-tool-catalog.ts'),
    'src/cli/commands/chat-slash-registry.ts': sha256File('src/cli/commands/chat-slash-registry.ts'),
  },
  counts: {
    contractRowsTotal: CLI_COMMAND_CONTRACTS.length,
    cliSurfaceRows: cliContracts().length,
    registryProjectionRows: registryContracts().length,
    commandRegistryEntries: COMMAND_REGISTRY.length,
    mcpToolCatalog: TOOL_CATALOG.length,
    slashAgenticTools: slashAgentic.size,
    summaryBindingDebtPaths: CONTRACT_SUMMARY_BINDING_DEBT.length,
    optionCoverage: contractOptionCoverage(),
    argumentCoverage: contractArgumentCoverage(),
  },
  ownerScenarioBaseline: {
    status: 'NOT_RUN',
    reason: 'E_CLEAN_BOT_ACTIVE build hold; benchmark tree reference only',
    integrationTree: '/tmp/deckent-terminal-integration-astra-20260910',
    normalVsBenchmark: 'separate_manifest_required_before_live_battery',
  },
  contracts: rows,
};

const outPath = join(__dir, 'p0-cli-baseline-inventory.json');
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`);
process.stdout.write(`${outPath}\n`);
