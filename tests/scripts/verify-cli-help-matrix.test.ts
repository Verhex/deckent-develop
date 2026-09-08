import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import {
  loadInventory,
  assertHelpOutput,
  assertRootHelp,
  buildCaseList,
  runSelfTest,
  normalizeWs,
  usageHeading,
  descriptionPresent,
  collectPins,
  collectLoadedConsumerPins,
  assertPinsStable,
  classifyManifestPath,
  auditInventory,
  runHelpChild,
  DEPRECATED_FORWARDING_COMMANDS,
} from '../../scripts/verify-cli-help-matrix.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MANIFEST = join(REPO_ROOT, 'docs/generated/cli-manifest.json');
/**
 * Captured actual Commander output, formerly
 * proof/cursor-cli-help-matrix-v3/results/config nervous set_en.stdout
 * SHA-256: 17098ff6e819ca7fcfc2ccbbda6f2829e2913dd89fc6d92562ff426cf28a5129
 */
const CONFIG_NERVOUS_SET_EN_HELP = `Usage: deckent config nervous set [options] <key> <value>

Set a nervous system configuration value

Arguments:
  key            Configuration key to set, for example mode.
  value          Value to store under the given configuration key.

Options:
  --lang <code>  Render this command's output in the given language (en|tr)
                 instead of the project language.
  -h, --help     display help for command
`;

describe('verify-cli-help-matrix runner contract', () => {
  const inventory = loadInventory(MANIFEST);

  it('loads public manifest commands (hidden excluded)', () => {
    expect(inventory.commands.length).toBeGreaterThan(200);
    expect(inventory.commands.some((c) => c.path === 'gateway-runtime')).toBe(false);
    expect(inventory.byPath.has('status')).toBe(true);
  });

  it('classifies deprecated top-level and virtual child manifest paths', () => {
    expect(classifyManifestPath('attach')).toBe('deprecated-top');
    expect(classifyManifestPath('checkpoint list')).toBe('deprecated-virtual');
    expect(classifyManifestPath('status')).toBe('normal');
    expect(DEPRECATED_FORWARDING_COMMANDS).toHaveLength(12);
  });

  it('builds root + bilingual cases for every public path', () => {
    const cases = buildCaseList(inventory, { includeEdges: false });
    expect(cases.filter((c) => c.kind === 'root')).toHaveLength(2);
    expect(cases.length).toBe(2 + inventory.commands.length * 2);
    expect(cases.filter((c) => c.kind === 'deprecated-virtual').length).toBeGreaterThan(0);
  });

  it('unions live public paths with canonical inventory and keeps contract gaps as HOLD candidates', () => {
    const cases = buildCaseList(inventory, {
      includeEdges: false,
      livePaths: ['status', 'live-only-command'],
    });
    expect(cases.filter((c) => c.kind === 'live-unmanifested' && c.pathArgs[0] === 'live-only-command')).toHaveLength(2);
  });

  it('includes representative edge env cases with a disposable Turkish project config', () => {
    const ids = buildCaseList(inventory).map((c) => c.id);
    expect(ids).toContain('edge:status:tr:DECKENT_LANG');
    expect(ids).toContain('edge:init:tr:c-locale');
    expect(ids).toContain('edge:plan:en:nocolor-dumb');
    expect(ids).toContain('edge:doctor:en:DECKENT_HOME');
    expect(ids).toContain('edge:status:en:config-tr-env-en');
    const precedence = buildCaseList(inventory).find((row) => row.id === 'edge:status:en:config-tr-env-en');
    expect(precedence?.projectConfig).toEqual({ language: 'tr' });
    expect(precedence?.expectHold).toBeUndefined();
  });

  it('runSelfTest passes on catalog fixtures', () => {
    expect(runSelfTest(inventory)).toEqual([]);
  });

  it('assertHelpOutput rejects wrong locale and missing flags', () => {
    const cmd = inventory.byPath.get('init')!;
    expect(assertHelpOutput(cmd, 'tr', 'Usage: deckent init\nfoo')).toContain('Kullanım:');
    expect(assertHelpOutput(cmd, 'en', 'Kullanım: deckent init\n' + cmd.description.tr)).toContain('Usage:');
  });

  it('assertHelpOutput accepts synthesized EN help from manifest strings', () => {
    const cmd = inventory.byPath.get('inspect')!;
    let out = `${usageHeading('en')} deckent ${cmd.path} ${cmd.arguments.map((a) => a.token).join(' ')}\n${cmd.description.en}\n\n`;
    out += 'Arguments:\n';
    for (const a of cmd.arguments) out += `  ${a.name}  ${a.description.en}\n`;
    out += '\nOptions:\n';
    for (const o of cmd.options) out += `  ${o.flags}  ${o.description.en}\n`;
    expect(assertHelpOutput(cmd, 'en', out)).toBeNull();
  });

  it('rejects prose-only flags, optionality drift, and an extra enum on their owning rows', () => {
    const cmd = {
      path: 'demo',
      description: { en: 'Demonstrate strict help rows', tr: 'Sıkı yardım satırlarını göster' },
      options: [{ flags: '--mode <kind>', description: { en: 'Mode (safe|fast)', tr: 'Mod (safe|fast)' } }],
      arguments: [{ token: '<taskId>', name: 'taskId', description: { en: 'Required task identifier', tr: 'Zorunlu görev kimliği' } }],
    };
    const valid = [
      'Usage: deckent demo <taskId>',
      'Demonstrate strict help rows',
      '',
      'Arguments:',
      '  taskId  Required task identifier',
      '',
      'Options:',
      '  --mode <kind>  Mode (safe|fast)',
    ].join('\n');
    expect(assertHelpOutput(cmd, 'en', valid)).toBeNull();
    expect(assertHelpOutput(cmd, 'en', valid.replace('--mode <kind>', '--mode-extra <kind> use --mode <kind>')))
      .toContain('missing exact option syntax --mode <kind>');
    expect(assertHelpOutput(cmd, 'en', valid.replaceAll('<taskId>', '[taskId]')))
      .toContain('missing exact usage argument <taskId>');
    expect(assertHelpOutput(cmd, 'en', valid.replace('(safe|fast)', '(safe|fast|turbo)')))
      .toContain('missing option description --mode <kind>');
  });

  it('accepts Commander bare argument display names while keeping Usage token syntax exact', () => {
    const nervousSet = inventory.byPath.get('config nervous set')!;
    expect(assertHelpOutput(nervousSet, 'en', CONFIG_NERVOUS_SET_EN_HELP)).toBeNull();

    const variadic = {
      path: 'forward',
      description: { en: 'Forward arguments', tr: 'Argümanları ilet' },
      options: [{ flags: '--destination <path>', description: { en: 'Destination path', tr: 'Hedef yol' } }],
      arguments: [
        { token: '[target]', name: 'target', required: false, variadic: false, description: { en: 'Optional target', tr: 'İsteğe bağlı hedef' } },
        { token: '<inputs...>', name: 'inputs', required: true, variadic: true, description: { en: 'One or more inputs', tr: 'Bir veya daha çok girdi' } },
      ],
    };
    const raw = [
      'Usage: deckent forward [target] <inputs...>',
      'Forward arguments',
      '',
      'Arguments:',
      '  target  Optional target',
      '  inputs  One or more inputs',
      '',
      'Options:',
      '  --destination <path>',
      '                       Destination path',
    ].join('\n');
    expect(assertHelpOutput(variadic, 'en', raw)).toBeNull();
  });

  it('assertRootHelp validates localized root usage lines', () => {
    expect(assertRootHelp('en', 'Usage: deckent [options] [prompt]\n  start a native chat session\n')).toBeNull();
    expect(assertRootHelp('tr', 'Kullanım: deckent [seçenekler] [prompt]\n  yerel bir sohbet oturumu başlat\n')).toBeNull();
    expect(assertRootHelp('tr', 'Usage: deckent [options]\n')).toContain('Turkish');
  });

  it('normalizeWs collapses whitespace for stable substring checks', () => {
    expect(normalizeWs('a   b\n c')).toBe('a b c');
  });

  it('descriptionPresent accepts reordered enum tokens inside parentheses', () => {
    const expected = 'Typed reason (a|b|c|d)';
    const live = 'Typed reason\n(a|b|c|d)\nextra d';
    expect(descriptionPresent(expected, live)).toBe(true);
    expect(descriptionPresent('Typed reason (a|b|missing)', live)).toBe(false);
    expect(descriptionPresent('Typed reason (a|b|c|d)', 'Typed reason (a|b|c|d|extra)')).toBe(false);
  });

  it('assertPinsStable detects post-run drift and pins the compiled static entry closure plus build identity', () => {
    const before = collectPins(
      REPO_ROOT,
      join(REPO_ROOT, 'dist/cli/entry.js'),
      MANIFEST,
      join(REPO_ROOT, 'scripts/verify-cli-help-matrix.mjs'),
    );
    expect(before.buildIdentity).toBeTruthy();
    expect(before['directConsumer:dist/cli/surface-contract.js']).toBeTruthy();
    expect(before['directConsumer:dist/cli/helpers/command-contract.js']).toBeTruthy();
    expect(before['consumer:dist/cli/surface-contract.js']).toBeTruthy();
    expect(before['consumer:dist/core/cli/command-contract.js'] ?? before['consumer:dist/core/cli-command-contract.js']).toBeTruthy();
    expect(Object.keys(collectLoadedConsumerPins(REPO_ROOT, join(REPO_ROOT, 'dist/cli/entry.js'))).length).toBeGreaterThan(20);
    const after = { ...before, entry: 'deadbeef' };
    expect(assertPinsStable(before, after)).toContain('pin drift entry');
    expect(assertPinsStable(before, { ...before, added: 'new' })).toContain('pin drift added');
    const removed = { ...before };
    delete removed.entry;
    expect(assertPinsStable(before, removed)).toContain('pin drift entry');
    expect(assertPinsStable(before, before)).toBeNull();
  });

  it('auditInventory reports missing normal paths and unexpected virtual live paths', () => {
    const issues = auditInventory(inventory.commands, new Set(['attach', 'checkpoint', 'status']));
    expect(issues.some((issue) => issue.includes('manifest path missing from live tree'))).toBe(true);
    const virtualLive = auditInventory(inventory.commands, new Set(['checkpoint list', 'attach']));
    expect(virtualLive.some((issue) => issue.includes('virtual deprecated child unexpectedly live'))).toBe(true);
  });

  it('runner script is import-safe and exposes matrix entrypoint', () => {
    const src = readFileSync(join(REPO_ROOT, 'scripts/verify-cli-help-matrix.mjs'), 'utf8');
    expect(src).toContain('export async function runMatrix');
    expect(src).toContain('export function assertHelpOutput');
    expect(src).toContain('cursor-cli-help-matrix-v4');
  });
});

describe('verify-cli-help-matrix async child guards', () => {
  const home = mkdtempSync(join(tmpdir(), 'help-matrix-neg-'));

  it('marks timeout when child never exits', async () => {
    const entry = join(home, 'hang.js');
    writeFileSync(entry, "process.on('SIGTERM', () => {}); setInterval(() => {}, 500);");
    const result = await runHelpChild(
      entry,
      { pathArgs: [], lang: 'en', env: { DECKENT_LANGUAGE: 'en' } },
      mkdtempSync(join(home, 'case-hang-')),
      { timeoutMs: 300, reapMs: 150 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.reapState).toBe('reaped');
    expect(result.closeObserved).toBe(true);
  }, 10_000);

  it('returns bounded unreaped custody when a killed parent leaves its output pipe open', async () => {
    const entry = join(home, 'unreaped-descendant.js');
    writeFileSync(entry, [
      "import { spawn } from 'node:child_process';",
      "spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 750)'], { stdio: ['ignore', 1, 2] });",
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 500);",
    ].join('\n'));
    const result = await runHelpChild(
      entry,
      { pathArgs: [], lang: 'en', env: { DECKENT_LANGUAGE: 'en' } },
      mkdtempSync(join(home, 'case-unreaped-')),
      { timeoutMs: 100, reapMs: 100, closeObservationMs: 100 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.reapState).toBe('unreaped');
    expect(result.closeObserved).toBe(false);
    expect(result.observationHandlesReleased).toBe(false);
    result.releaseUnknownObservationHandles?.();
    expect(result.observationHandlesReleased).toBe(true);
  }, 10_000);

  it('preserves timeout when a TERM handler exits zero rather than claiming success', async () => {
    const entry = join(home, 'term-exit-zero.js');
    writeFileSync(entry, "process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 500);");
    const result = await runHelpChild(
      entry,
      { pathArgs: [], lang: 'en', env: { DECKENT_LANGUAGE: 'en' } },
      mkdtempSync(join(home, 'case-term-exit-zero-')),
      { timeoutMs: 100, reapMs: 200 },
    );
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(true);
    expect(result.reapState).toBe('term-exited');
    expect(result.closeObserved).toBe(true);
  }, 10_000);

  it('marks combined overflow when stdout exceeds cap', async () => {
    const entry = join(home, 'overflow.js');
    writeFileSync(entry, "import { writeSync } from 'node:fs'; writeSync(1, Buffer.alloc(300000, 120)); process.exit(0);");
    const result = await runHelpChild(
      entry,
      { pathArgs: [], lang: 'en', env: { DECKENT_LANGUAGE: 'en' } },
      mkdtempSync(join(home, 'case-overflow-')),
      { timeoutMs: 5_000, reapMs: 500 },
    );
    expect(result.stdoutDroppedBytes + result.stderrDroppedBytes).toBeGreaterThan(0);
    expect(result.stdout.length).toBeLessThanOrEqual(256 * 1024);
    expect(result.overflowed).toBe(true);
    expect(result.terminationReason).toBe('overflow');
  }, 10_000);

  it('keeps invalid bytes as raw buffers until after their SHA-256 is recorded', async () => {
    const entry = join(home, 'invalid-bytes.js');
    writeFileSync(entry, "import { writeSync } from 'node:fs'; writeSync(1, Buffer.from([0xff, 0x00, 0xfe]));");
    const result = await runHelpChild(
      entry,
      { pathArgs: [], lang: 'en', env: { DECKENT_LANGUAGE: 'en' } },
      mkdtempSync(join(home, 'case-invalid-bytes-')),
      { timeoutMs: 2_000, reapMs: 200 },
    );
    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(result.stdout).toEqual(Buffer.from([0xff, 0x00, 0xfe]));
    expect(result.stdoutSha256).toHaveLength(64);
  });

  it('records nonzero exit as failure path via evaluateCase consumer', async () => {
    const entry = join(home, 'exit1.js');
    writeFileSync(entry, 'process.exit(1);');
    const result = await runHelpChild(
      entry,
      { pathArgs: [], lang: 'en', env: { DECKENT_LANGUAGE: 'en' } },
      mkdtempSync(join(home, 'case-exit-')),
      { timeoutMs: 2_000, reapMs: 200 },
    );
    expect(result.exitCode).toBe(1);
  });
});
