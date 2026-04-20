#!/usr/bin/env node

/**
 * MCP Nervous Tools E2E — Programmatic Client Script
 *
 * Sprint 148 Task 13: Tests the 5 nervous MCP tools via direct handler invocation.
 * This script simulates a real MCP client call chain:
 *
 * 1. deckent_nervous_status()       — snapshot (pending + recent + config)
 * 2. deckent_nervous_subscribe()    — event subscription
 * 3. deckent_nervous_accept()       — resolve approval
 * 4. deckent_nervous_reject()       — reject with reason
 * 5. deckent_nervous_config()       — set_preset autopilot → balanced round-trip
 *
 * Usage: node scripts/mcp-nervous-e2e.mjs [project-root]
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || process.cwd();

// ─── Minimal MCP Server Mock ────────────────────────────────────────────────

const tools = new Map();

function createMockServer() {
  return {
    registerTool(name, _config, handler) {
      tools.set(name, handler);
    },
  };
}

// ─── Dynamic Import ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🧠 MCP Nervous Tools E2E — Project root: ${root}\n`);

  let registerNervousTools;
  try {
    const mod = await import('../dist/mcp/tools/nervous.js');
    registerNervousTools = mod.registerNervousTools;
  } catch (err) {
    console.error('❌ Failed to import nervous tools. Run `tsc` first.');
    console.error(err.message);
    process.exit(1);
  }

  const server = createMockServer();
  registerNervousTools(server);

  let passed = 0;
  let failed = 0;

  function assert(name, condition, detail) {
    if (condition) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.log(`  ❌ ${name} — ${detail || 'assertion failed'}`);
      failed++;
    }
  }

  // ── 1. Status ──────────────────────────────────────────────────────────────

  console.log('1. deckent_nervous_status');
  try {
    const handler = tools.get('deckent_nervous_status');
    const result = await handler({ root });
    const data = JSON.parse(result.content[0].text);
    assert('returns config object', data.config && typeof data.config.mode === 'string');
    assert('returns pending array', Array.isArray(data.pending));
    assert('returns recent array', Array.isArray(data.recent));
    assert('returns totalRecords number', typeof data.totalRecords === 'number');
  } catch (err) {
    console.log(`  ❌ status threw: ${err.message}`);
    failed++;
  }

  // ── 2. Subscribe ───────────────────────────────────────────────────────────

  console.log('\n2. deckent_nervous_subscribe');
  try {
    const handler = tools.get('deckent_nervous_subscribe');
    const result = await handler({ sprintId: 'sprint-148' });
    const data = JSON.parse(result.content[0].text);
    assert('subscribed=true', data.subscribed === true);
    assert('sprintId=sprint-148', data.sprintId === 'sprint-148');

    // Idempotent duplicate
    const result2 = await handler({ sprintId: 'sprint-148' });
    const data2 = JSON.parse(result2.content[0].text);
    assert('duplicate is idempotent', data2.subscribed === true);
  } catch (err) {
    console.log(`  ❌ subscribe threw: ${err.message}`);
    failed++;
  }

  // ── 3. Accept ──────────────────────────────────────────────────────────────

  console.log('\n3. deckent_nervous_accept');
  try {
    const handler = tools.get('deckent_nervous_accept');

    // Valid ID
    const result = await handler({ id: 'ns-e2e-test-001' });
    const data = JSON.parse(result.content[0].text);
    assert('valid ID accepted', data.accepted === true);
    assert('notificationId matches', data.notificationId === 'ns-e2e-test-001');

    // Invalid ID
    const errResult = await handler({ id: 'INVALID!!!' });
    assert('invalid ID returns error', errResult.isError === true);
  } catch (err) {
    console.log(`  ❌ accept threw: ${err.message}`);
    failed++;
  }

  // ── 4. Reject ──────────────────────────────────────────────────────────────

  console.log('\n4. deckent_nervous_reject');
  try {
    const handler = tools.get('deckent_nervous_reject');

    // With reason
    const result = await handler({ id: 'ns-e2e-test-002', reason: 'E2E test rejection' });
    const data = JSON.parse(result.content[0].text);
    assert('rejected=true', data.rejected === true);
    assert('reason recorded', data.reason === 'E2E test rejection');

    // Empty ID
    const errResult = await handler({ id: '' });
    assert('empty ID returns error', errResult.isError === true);
  } catch (err) {
    console.log(`  ❌ reject threw: ${err.message}`);
    failed++;
  }

  // ── 5. Config ──────────────────────────────────────────────────────────────

  console.log('\n5. deckent_nervous_config');
  try {
    const handler = tools.get('deckent_nervous_config');

    // Read current
    const readResult = await handler({ action: 'read', root });
    const readData = JSON.parse(readResult.content[0].text);
    assert('read returns config', readData.action === 'read' && readData.config);

    // Set preset to autopilot
    const setResult = await handler({ action: 'set_preset', preset: 'autopilot', root });
    const setData = JSON.parse(setResult.content[0].text);
    assert('set_preset autopilot', setData.preset === 'autopilot');

    // Reset back to balanced
    const resetResult = await handler({ action: 'set_preset', preset: 'balanced', root });
    const resetData = JSON.parse(resetResult.content[0].text);
    assert('set_preset balanced (restore)', resetData.preset === 'balanced');

    // Missing preset → error
    const errResult = await handler({ action: 'set_preset', root });
    assert('missing preset returns error', errResult.isError === true);
  } catch (err) {
    console.log(`  ❌ config threw: ${err.message}`);
    failed++;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed > 0) {
    console.log('\n❌ MCP Nervous Tools E2E FAILED');
    process.exit(1);
  }

  console.log('\n✅ MCP Nervous Tools E2E PASS');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
