// tests/core/config-flag-roundtrip.test.ts
//
// Sprint 358, Task 358-014 CONFIG-ROUNDTRIP-GUARD — permanent mechanical
// closure for the born-464 flag-drop class (see c513abfb): five opt-in
// config blocks were declared on `ResolvedConfig` but never assigned in
// EITHER resolver's object literal, so on the live `loadConfig()` disk path
// every flag silently resolved to `undefined` (off) no matter what the user
// set — while hermetic tests that injected config objects directly (bypassing
// disk + `loadConfig`) stayed green throughout.
//
// This file closes that gap two ways:
//   1. A real round-trip proof for the 9 currently-wired opt-in blocks: write
//      an actual `.deckent/config.json` to a hermetic tmpdir project, run the
//      REAL `loadConfig()` (disk read, not a direct object injection), and
//      assert the field comes back byte-identical.
//   2. A generic mechanical guard: AST-extract every optional block-shaped
//      field declared on `ResolvedConfig` (config-types.ts) and diff it
//      against the real `Object.keys()` of a live `loadConfig()` result. A
//      field that is typed but never assigned in the resolved-object literal
//      fails the guard — so a FUTURE block added to the type without wiring
//      it into `loadConfig` is caught automatically, with zero manual list
//      maintenance required for new fields.
//
// Hermetic: HOME is isolated to a throwaway tmpdir (real ~/.deckent is never
// touched — `GLOBAL_DECKENT_DIR` in constants.ts is computed once at
// module-evaluation time from `os.homedir()`, so HOME must be faked BEFORE
// the first — and only — dynamic import of config.js), the project root is a
// throwaway tmpdir, DECKENT_CONFIG_RELOAD=1 disables the module-level config
// cache, and no gitignored state is read (CUSTOM Test Hermeticity rule).

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

// ─── Hermetic HOME isolation + dynamic config.js import ────────────────────

let fakeHome: string;
let origHome: string | undefined;
let origUserProfile: string | undefined;
let origReload: string | undefined;
let loadConfig: typeof import('../../src/core/config.js')['loadConfig'];
let clearConfigCache: typeof import('../../src/core/config.js')['clearConfigCache'];

beforeAll(async () => {
  origHome = process.env['HOME'];
  origUserProfile = process.env['USERPROFILE'];
  origReload = process.env['DECKENT_CONFIG_RELOAD'];

  fakeHome = mkdtempSync(join(tmpdir(), 'deckent-cfg-roundtrip-home-'));
  // POSIX (`HOME`) and Windows (`USERPROFILE`) — os.homedir() reads whichever
  // its platform branch checks, so both must be faked (ADR-035/law-2: every
  // environment, not "this platform first").
  process.env['HOME'] = fakeHome;
  process.env['USERPROFILE'] = fakeHome;
  process.env['DECKENT_CONFIG_RELOAD'] = '1';

  // This file must never statically `import` config.js (or anything that
  // transitively pulls in constants.ts) above this point — GLOBAL_DECKENT_DIR
  // is a top-level `const` computed once from os.homedir() at first module
  // evaluation. vi.resetModules() + a dynamic import performed AFTER the
  // env vars above are set guarantees that first evaluation sees fakeHome.
  vi.resetModules();
  const mod = await import('../../src/core/config.js');
  loadConfig = mod.loadConfig;
  clearConfigCache = mod.clearConfigCache;
});

afterAll(() => {
  if (origHome === undefined) delete process.env['HOME']; else process.env['HOME'] = origHome;
  if (origUserProfile === undefined) delete process.env['USERPROFILE']; else process.env['USERPROFILE'] = origUserProfile;
  if (origReload === undefined) delete process.env['DECKENT_CONFIG_RELOAD']; else process.env['DECKENT_CONFIG_RELOAD'] = origReload;
  rmSync(fakeHome, { recursive: true, force: true });
});

function writeProjectConfig(projectRoot: string, partial: Record<string, unknown>): void {
  const dir = join(projectRoot, '.deckent');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(partial, null, 2) + '\n', 'utf-8');
}

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'deckent-cfg-roundtrip-proj-'));
  clearConfigCache();
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── Part 1 — 9 opt-in blocks round-trip through the REAL loadConfig disk path ──

interface RoundTripCase {
  name: string;
  block: Record<string, unknown>;
}

// One representative, fully-populated payload per block (born-464's own
// five + the four opt-in blocks that were already wired before it).
const ROUND_TRIP_BLOCKS: RoundTripCase[] = [
  { name: 'repl_surface', block: { enabled: true, approvals: true, bg_turns: false } },
  { name: 'tool_surface', block: { enabled: true, riskThreshold: 'moderate' } },
  { name: 'deck_broker', block: { enabled: true } },
  { name: 'training_trace', block: { enabled: true } },
  { name: 'live_trace', block: { enabled: true } },
  { name: 'worker_comms', block: { enabled: true, shared_memory_ttl_ms: 12345, inject_handoffs: false, inject_shared: true } },
  { name: 'cost_guard', block: { enabled: true, max_limit_cost_usd: 42.5 } },
  { name: 'gate', block: { max_tech_debt_ratio: 0.4, verify_delta_downgrade: true, enforce_adr_compliance: true } },
  { name: 'resource_monitor', block: { enabled: true, interval_ms: 2500, log_path: '.deckent/settings/resource-log.jsonl' } },
];

describe('config flag round-trip — 9 opt-in blocks through the REAL loadConfig disk path', () => {
  for (const { name, block } of ROUND_TRIP_BLOCKS) {
    it(`${name}: config.json → loadConfig → field returns AS-IS`, async () => {
      writeProjectConfig(projectRoot, { [name]: block });
      const resolved = (await loadConfig(projectRoot)) as unknown as Record<string, unknown>;
      expect(resolved[name]).toEqual(block);
    });
  }

  it('all 9 blocks round-trip together from a single config.json', async () => {
    const combined = Object.fromEntries(ROUND_TRIP_BLOCKS.map(({ name, block }) => [name, block]));
    writeProjectConfig(projectRoot, combined);
    const resolved = (await loadConfig(projectRoot)) as unknown as Record<string, unknown>;
    for (const { name, block } of ROUND_TRIP_BLOCKS) {
      expect(resolved[name]).toEqual(block);
    }
  });

  it('absent blocks resolve per-contract — opt-in blocks undefined, experience-layer default-ON', async () => {
    writeProjectConfig(projectRoot, {});
    const resolved = (await loadConfig(projectRoot)) as unknown as Record<string, unknown>;
    // W1-EXPERIENCE-ON (#492, Alperen 2026-07-06): repl_surface is the terminal
    // EXPERIENCE layer and ships ON when the block is absent (opt-out). The
    // remaining blocks stay opt-in/undefined.
    // TOOL-QB-FLIP (376-001): tool_surface joins the default-ON package too.
    const DEFAULT_ON: Record<string, unknown> = {
      repl_surface: { enabled: true, approvals: true },
      tool_surface: { enabled: true },
    };
    for (const { name } of ROUND_TRIP_BLOCKS) {
      if (name in DEFAULT_ON) {
        expect(resolved[name]).toEqual(DEFAULT_ON[name]);
      } else {
        expect(resolved[name]).toBeUndefined();
      }
    }
  });

  it('explicit { enabled: false } still turns the experience layer OFF (opt-out honored)', async () => {
    writeProjectConfig(projectRoot, { repl_surface: { enabled: false } });
    const resolved = (await loadConfig(projectRoot)) as unknown as Record<string, unknown>;
    expect(resolved['repl_surface']).toEqual({ enabled: false });
  });

  it('explicit tool_surface { enabled: false } still turns the meta-tool surface OFF (opt-out honored)', async () => {
    writeProjectConfig(projectRoot, { tool_surface: { enabled: false } });
    const resolved = (await loadConfig(projectRoot)) as unknown as Record<string, unknown>;
    expect(resolved['tool_surface']).toEqual({ enabled: false });
  });
});

// ─── Part 2 — type-vs-live field-parity mechanical guard ───────────────────

/**
 * A `ResolvedConfig` field counts as an "opt-in block" when its declared
 * type-node is one of the three shapes actually used by every opt-in block
 * on the type today:
 *   - a named type reference ending in `Config` (e.g. `GateConfig`)
 *   - a `DeckentConfig['x']` indexed-access pass-through (e.g. `deck_broker`,
 *     one of born-464's own fields)
 *   - an inline object-literal type `{ ... }` (e.g. `routing_config`)
 * Plain scalars/unions/arrays (`boolean`, `'a' | 'b'`, `string[]`, a
 * `ModelStrategy`/`ProviderName` alias reference) are intentionally excluded
 * — they are not "blocks" in the born-464 sense and are resolved inline with
 * `??` defaults rather than a bare pass-through line.
 */
function extractResolvedConfigBlockFields(sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(
    'config-types.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  let resolvedConfigInterface: ts.InterfaceDeclaration | undefined;
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'ResolvedConfig') {
      resolvedConfigInterface = node;
    }
  });
  if (!resolvedConfigInterface) {
    throw new Error('ResolvedConfig interface not found — has it been renamed/moved out of config-types.ts?');
  }

  const blockFields: string[] = [];
  for (const member of resolvedConfigInterface.members) {
    if (!ts.isPropertySignature(member) || !member.type) continue;
    if (!member.questionToken) continue; // only optional ("opt-in") fields
    const fieldName = member.name.getText(sourceFile);
    const type = member.type;

    const isConfigSuffixedRef =
      ts.isTypeReferenceNode(type) &&
      ts.isIdentifier(type.typeName) &&
      /Config$/.test(type.typeName.text);
    const isIndexedAccessPassthrough = ts.isIndexedAccessTypeNode(type);
    const isInlineObjectLiteral = ts.isTypeLiteralNode(type);

    if (isConfigSuffixedRef || isIndexedAccessPassthrough || isInlineObjectLiteral) {
      blockFields.push(fieldName);
    }
  }
  return blockFields.sort();
}

describe('type-vs-live field parity — mechanical guard against future flag-drop', () => {
  it('[fixture] intentionally-missing field is detected — proves the comparison logic itself works', () => {
    // Synthetic fixture, deliberately decoupled from the real config-types.ts
    // so this assertion exercises only the extraction + diff MECHANISM, not
    // whatever the real file's current state happens to be.
    const fixtureSource = `
      export interface ResolvedConfig {
        wired_block?: WiredConfig;
        dropped_block?: DroppedConfig;
        passthrough_block?: DeckentConfig['passthrough_block'];
        scalar_flag?: boolean;
        provider_alias?: ProviderName;
        required_block: RequiredConfig;
      }
    `;
    const declaredBlocks = extractResolvedConfigBlockFields(fixtureSource);
    expect(declaredBlocks).toEqual(['dropped_block', 'passthrough_block', 'wired_block']);

    // Simulate a `loadConfig()` resolved-object literal that forgot to wire
    // `dropped_block` through — the born-464 bug shape: the key is fully
    // ABSENT from the object, not merely present-with-value-undefined.
    const simulatedLiveOutput: Record<string, unknown> = {
      wired_block: undefined,
      passthrough_block: { some: 'value' },
      // dropped_block: intentionally has NO line here.
    };
    const missing = declaredBlocks.filter((field) => !(field in simulatedLiveOutput));
    expect(missing).toEqual(['dropped_block']);
  });

  it('every block field declared on the real ResolvedConfig interface either round-trips live or is a pinned pre-existing gap', async () => {
    const configTypesPath = join(process.cwd(), 'src', 'core', 'config-types.ts');
    const sourceText = readFileSync(configTypesPath, 'utf-8');
    const declaredBlocks = extractResolvedConfigBlockFields(sourceText);

    // Sanity: the extractor must find (at least) the 9 blocks this file
    // already proves round-trip in Part 1 — if it finds fewer, the AST
    // classification itself has regressed and the guard below is vacuous.
    for (const { name } of ROUND_TRIP_BLOCKS) {
      expect(declaredBlocks).toContain(name);
    }

    writeProjectConfig(projectRoot, {});
    const resolved = (await loadConfig(projectRoot)) as unknown as Record<string, unknown>;
    const liveKeys = new Set(Object.keys(resolved));

    const missing = declaredBlocks.filter((field) => !liveKeys.has(field)).sort();

    // ─── Known, pre-existing gaps — NOT introduced by this task ───────────
    // Discovered by this guard while authoring it (358-014, test-only write
    // scope — fixing config.ts is out of scope for this task). Each of these
    // fields is declared on `ResolvedConfig` but has ZERO references anywhere
    // in config.ts's `loadConfig` resolved-object literal — the exact
    // born-464 flag-drop pattern, just outside born-464's own 5-field list:
    //   - `rollback`        (ResolvedConfig.rollback, distinct from the
    //                         legacy `rollback_policy` scalar which DOES
    //                         round-trip)
    //   - `cross_verify`    (ResolvedConfig.cross_verify)
    //   - `observability`   (ResolvedConfig.observability — only appears
    //                         inside createDefaultConfig's DEFAULTS, never
    //                         copied into the resolved-object literal)
    //   - `doc_tracking`    (ResolvedConfig.doc_tracking — has zero
    //                         references anywhere in config.ts)
    // This assertion pins the set EXACTLY: it fails loudly both when a NEW
    // field regresses (the set grows) and when one of these four is fixed
    // (the set shrinks — update this list, don't just relax the assertion).
    const KNOWN_PRE_EXISTING_GAPS = [
      'cross_verify',
      'doc_tracking',
      'observability',
      'rollback',
    ].sort();

    expect(missing).toEqual(KNOWN_PRE_EXISTING_GAPS);

    // The 9 born-464-fixed blocks must never regress back into the gap set.
    for (const { name } of ROUND_TRIP_BLOCKS) {
      expect(missing).not.toContain(name);
    }
  });
});
