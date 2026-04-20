#!/usr/bin/env node
// Doc Consistency Checker — cross-document numerical consistency validation
// Reads 7 governance docs and compares: sprint count, MCP tools, CLI commands, agents, skills, providers
// Exit codes: 0 = consistent, 1 = mismatches found, 2 = file read error

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.argv[2] || process.cwd();

/** @type {Array<{name: string, path: string}>} */
const DOCS = [
  { name: 'DECKENT.md', path: 'DECKENT.md' },
  { name: 'IDENTITY.md', path: '.deckent/workspace/IDENTITY.md' },
  { name: 'MASTER-BLUEPRINT', path: 'DECKENT-MASTER-BLUEPRINT.md' },
  { name: 'ANA-PLAN-TR', path: 'DECKENT-ANA-PLAN-TR.md' },
  { name: 'BETA-TRACKER (EN)', path: 'BETA-TRACKER.md' },
  { name: 'BETA-TRACKER (TR)', path: 'BETA-TRACKER-TR.md' },
  { name: 'summary.md', path: '.brain/exports/summary.md' },
];

/**
 * Extract numerical metrics from document content.
 * @param {string} content - Raw markdown content
 * @param {string} name - Document name (for context-specific parsing)
 * @returns {Record<string, string|null>}
 */
function extractMetrics(content, name) {
  const metrics = {};

  // Sprint number — extract from status tables or explicit sprint labels
  // Prefer table format "Sprint | sprint-NNN" over inline references
  const sprintTableMatch = content.match(/Sprint\s*\|\s*sprint-(\d+)/i)
    || content.match(/\*\*Sprint:\*\*\s*(\d+)/i);
  if (sprintTableMatch) {
    metrics.sprint = sprintTableMatch[1];
  } else {
    // Fallback: find highest sprint reference (skip >200 to avoid noise)
    let maxSprint = 0;
    for (const m of content.matchAll(/sprint[- ](\d{2,3})\b/gi)) {
      const n = parseInt(m[1], 10);
      if (n > maxSprint && n >= 10 && n < 200) maxSprint = n;
    }
    metrics.sprint = maxSprint > 0 ? String(maxSprint) : null;
  }

  // MCP Tools count — supports EN "MCP Tools" and TR "MCP Araçları"
  const mcpToolMatch = content.match(/MCP\s*(?:Tools?|Araçlar[ıi]?)\s*\|\s*(\d+)/i)
    || content.match(/MCP\s*\|\s*(\d+)\s*tools/i)
    || content.match(/(\d+)\s*tools?\s*\+\s*\d+\s*resources/i);
  metrics.mcp_tools = mcpToolMatch ? mcpToolMatch[1] : null;

  // CLI Commands count — supports EN "CLI Commands" and TR "CLI Komutları"
  const cliMatch = content.match(/CLI\s*(?:Commands?|Komutlar[ıi]?)\s*\|\s*(\d+)\+?/i)
    || content.match(/(\d+)\+?\s*(?:CLI\s*)?commands/i);
  metrics.cli_commands = cliMatch ? cliMatch[1] : null;

  // Agents count (built-in only) — supports EN "Agents" and TR "Ajanlar"
  const agentMatch = content.match(/(?:Agents?|Ajanlar)\s*\|\s*(\d+)\s*built/i)
    || content.match(/(\d+)\s*built-in\s*agents/i);
  metrics.agents_builtin = agentMatch ? agentMatch[1] : null;

  // Skills count (built-in only) — supports EN "Skills" and TR "Yetenekler"
  const skillMatch = content.match(/(?:Skills?|Yetenekler)\s*[:\|]\s*(\d+)\s*built/i)
    || content.match(/(\d+)\s*built-in skills/i);
  metrics.skills_builtin = skillMatch ? skillMatch[1] : null;

  // Providers count — supports EN "Providers" and TR "Sağlayıcılar"
  const providerMatch = content.match(/(?:Providers?|Sa[gğ]lay[ıi]c[ıi]lar)\s*\|\s*(\d+)/i)
    || content.match(/(\d+)\s*\(Claude,?\s*Codex,?\s*Gemini\)/i);
  metrics.providers = providerMatch ? providerMatch[1] : null;

  // MCP Resources count — supports EN "Resources" and TR "Kaynakları"
  const resourceMatch = content.match(/(?:MCP\s*)?(?:Resources?|Kaynaklar[ıi]?)\s*\|\s*(\d+)/i)
    || content.match(/(\d+)\s*resources/i);
  metrics.mcp_resources = resourceMatch ? resourceMatch[1] : null;

  return metrics;
}

// --- Main ---

console.log('=== Deckent Doc Consistency Check ===\n');

/** @type {Array<{name: string, metrics: Record<string, string|null>}>} */
const results = [];
let readErrors = 0;

for (const doc of DOCS) {
  const fullPath = resolve(ROOT, doc.path);
  if (!existsSync(fullPath)) {
    console.log(`⚠  ${doc.name}: file not found (${doc.path})`);
    readErrors++;
    continue;
  }
  const content = readFileSync(fullPath, 'utf-8');
  const metrics = extractMetrics(content, doc.name);
  results.push({ name: doc.name, metrics });
}

if (results.length === 0) {
  console.error('ERROR: No documents found to check.');
  process.exit(2);
}

// Collect all metric keys
const metricKeys = ['sprint', 'mcp_tools', 'cli_commands', 'agents_builtin', 'skills_builtin', 'providers', 'mcp_resources'];

let mismatches = 0;

for (const key of metricKeys) {
  const values = results
    .filter(r => r.metrics[key] != null)
    .map(r => ({ name: r.name, value: r.metrics[key] }));

  if (values.length === 0) {
    console.log(`  ${key}: (no data found)`);
    continue;
  }

  const uniqueValues = [...new Set(values.map(v => v.value))];

  if (uniqueValues.length === 1) {
    console.log(`✅ ${key}: ${uniqueValues[0]} (${values.length} docs agree)`);
  } else {
    mismatches++;
    console.log(`❌ ${key}: MISMATCH`);
    for (const v of values) {
      console.log(`   - ${v.name}: ${v.value}`);
    }
  }
}

console.log(`\n--- Summary ---`);
console.log(`Documents checked: ${results.length}/${DOCS.length}`);
console.log(`Metrics checked: ${metricKeys.length}`);
console.log(`Mismatches: ${mismatches}`);

if (mismatches > 0) {
  console.log('\n⚠  Recommendation: Update stale documents to match the canonical source.');
  console.log('   Canonical source hierarchy: MASTER-BLUEPRINT > IDENTITY.md > DECKENT.md > BETA-TRACKER');
  process.exit(1);
} else {
  console.log('\n✅ All metrics are consistent across documents.');
  process.exit(0);
}
