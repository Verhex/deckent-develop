// tests/cli/native-budget-renewal-surface.test.ts
// ═══ NATIVE-BUDGET-RENEWAL (557-002) — REPL renewal surface ══════════════════
//
// Pins the two user-facing halves of the working-budget renewal surface:
//   1. the bridge renders EXACTLY ONE localized offer line per exhaustion, even
//      though session.ts latches the exhaustion and re-yields the same
//      `session-budget-exhausted` event on every further send (offer spam is an
//      explicit NO_GO), and
//   2. `/renew` reaches the session's own renewal seam and reports the NEW
//      working-budget epoch — while an engine without that seam (legacy loop)
//      answers with an honest not-available line instead of pretending.
//
// The session is a FAKE (vi.mock of src/agent/session.js) so the exhaustion and
// the renewal are driven directly, with no provider and no real budget guard.
// Hermetic: cwd is a fresh mkdtemp dir (loadPolicy/createRuleStore read it).

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const fakeSession = vi.hoisted(() => ({
  epoch: 1,
  /** undefined → the session runs a normal turn again. */
  exhaustedCode: undefined as string | undefined,
  renewCalls: 0,
  sends: [] as string[],
}));

vi.mock('../../src/agent/session.js', () => ({
  createAgentSession: () => ({
    send(userInput: string) {
      fakeSession.sends.push(userInput);
      const code = fakeSession.exhaustedCode;
      const epoch = fakeSession.epoch;
      return (async function* fake() {
        if (code) {
          yield { type: 'session-budget-exhausted', code, epoch, renewalHint: true };
          yield { type: 'turn-end' };
          return;
        }
        yield { type: 'text-delta', text: `ok:${userInput}` };
        yield { type: 'turn-end' };
      })();
    },
    renewBudgetEpoch() {
      fakeSession.renewCalls++;
      fakeSession.epoch++;
      fakeSession.exhaustedCode = undefined;
      return { epoch: fakeSession.epoch };
    },
    respondPermission: () => {},
    cancel: () => {},
    setApprovalMode: () => {},
    getApprovalMode: () => 'suggest',
    transcript: () => [],
    latestCheckpoint: () => ({ status: 'empty' }),
    close: () => {},
  }),
}));

import { createNativeEngine, createBudgetRenewalOffer, type ReplEngine } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import { buildRenewSlashLabels, resolveRenewSlash, withRenewSlash } from '../../src/cli/repl/run.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type { ProviderAdapter } from '../../src/agent/provider-tooluse/types.js';

const dir = mkdtempSync(join(tmpdir(), 'renew-surface-'));
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

const idleAdapter: ProviderAdapter = { name: 'mock', async *send() { yield { type: 'done' }; } };

function buildEngine(lang: 'en' | 'tr' = 'en'): ReplEngine {
  return createNativeEngine({
    adapter: idleAdapter,
    registry: buildNativeToolRegistry({ cwd: () => dir }),
    cwd: dir,
    model: 'm',
    lang,
    confirm: async () => 'n',
    toolSink: () => {},
    t: (key) => getMessage(key, lang),
  });
}

function collect(): { out: string[]; turnEnds: number; cbs: Parameters<ReplEngine>[1] } {
  const out: string[] = [];
  const state = { turnEnds: 0 };
  const cbs = { output: (text: string) => { out.push(text); }, onTurnEnd: () => { state.turnEnds++; } };
  return { out, get turnEnds() { return state.turnEnds; }, cbs };
}

beforeEach(() => {
  fakeSession.epoch = 1;
  fakeSession.exhaustedCode = undefined;
  fakeSession.renewCalls = 0;
  fakeSession.sends = [];
});

describe('budget-exhaustion offer (bridge)', () => {
  it('renders exactly ONE offer line per exhaustion, not one per send', async () => {
    fakeSession.exhaustedCode = 'native-budget.rounds-exhausted';
    const engine = buildEngine();
    const sink = collect();

    await engine('first', sink.cbs);
    await engine('second', sink.cbs);
    await engine('third', sink.cbs);

    const joined = sink.out.join('');
    expect(joined.split('/renew').length - 1).toBe(1);           // offer-once, no spam
    expect(joined).toContain(getMessage('native-budget.rounds-exhausted', 'en'));
    expect(sink.turnEnds).toBe(3);                                // every turn still ends
    expect(fakeSession.sends).toEqual(['first', 'second', 'third']);
    expect(fakeSession.renewCalls).toBe(0);                       // never auto-renews
  });

  it('offers again for a NEW exhaustion after an explicit renewal (epoch advanced)', async () => {
    fakeSession.exhaustedCode = 'native-budget.rounds-exhausted';
    const engine = buildEngine();
    const sink = collect();
    await engine('blocked', sink.cbs);
    expect(sink.out.join('').split('/renew').length - 1).toBe(1);

    expect(engine.renewBudgetEpoch?.()).toEqual({ epoch: 2 });    // renew-roundtrip
    expect(fakeSession.renewCalls).toBe(1);

    // a working turn runs again on the renewed epoch …
    await engine('again', sink.cbs);
    expect(sink.out.join('')).toContain('ok:again');

    // … and a genuinely new exhaustion is a new offer, not a suppressed dup.
    fakeSession.exhaustedCode = 'native-budget.tokens-exhausted';
    await engine('blocked once more', sink.cbs);
    const joined = sink.out.join('');
    expect(joined.split('/renew').length - 1).toBe(2);
    expect(joined).toContain(getMessage('native-budget.tokens-exhausted', 'en'));
  });

  it('the offer gate is localized and key-resolving in both languages', () => {
    const event = { type: 'session-budget-exhausted', code: 'native-budget.walltime-exhausted', epoch: 1, renewalHint: true } as const;
    for (const lang of ['en', 'tr'] as const) {
      const offer = createBudgetRenewalOffer((k) => getMessage(k, lang))(event);
      expect(offer).toBeDefined();
      expect(offer).not.toContain('native-budget.renewal-offer');   // key resolved
      expect(offer).not.toContain('{dimension}');                   // template filled
      expect(offer).toContain(getMessage('native-budget.walltime-exhausted', lang));
      expect(offer).toContain('/renew');
    }
    expect(createBudgetRenewalOffer((k) => getMessage(k, 'en'))(event))
      .not.toBe(createBudgetRenewalOffer((k) => getMessage(k, 'tr'))(event));
  });
});

describe('/renew slash (run.tsx)', () => {
  const labels = buildRenewSlashLabels((k) => getMessage(k, 'en'));

  it('calls the engine seam and confirms with the new epoch', () => {
    const engine = buildEngine();
    const line = resolveRenewSlash('/renew', engine, labels);
    expect(fakeSession.renewCalls).toBe(1);
    expect(line).toBe(getMessage('native-budget.renew-confirmed', 'en').replace('{epoch}', '2'));
    expect(line).toContain('2');
    expect(line).not.toContain('{epoch}');
  });

  it('answers honestly when the engine has no renewal seam (legacy loop path)', () => {
    const legacyEngine: ReplEngine = async () => {};
    expect(resolveRenewSlash('/renew', legacyEngine, labels)).toBe(labels.unavailable);
    expect(resolveRenewSlash('/renew', undefined, labels)).toBe(labels.unavailable);
    expect(fakeSession.renewCalls).toBe(0);                       // nothing renewed
  });

  it('ignores anything that is not /renew', () => {
    const engine = buildEngine();
    expect(resolveRenewSlash('renew the budget', engine, labels)).toBeUndefined();
    expect(resolveRenewSlash('/renewal', engine, labels)).toBeUndefined();
    expect(resolveRenewSlash('  /RENEW  ', engine, labels)).toBe(
      getMessage('native-budget.renew-confirmed', 'en').replace('{epoch}', '2'),
    );
  });

  it('the wrapped engine answers /renew locally and passes everything else through', async () => {
    const engine = withRenewSlash(buildEngine(), labels);
    const sink = collect();

    await engine('/renew', sink.cbs);
    expect(fakeSession.renewCalls).toBe(1);
    expect(fakeSession.sends).toEqual([]);                        // no provider turn
    expect(sink.out.join('')).toContain('2');
    expect(sink.turnEnds).toBe(1);

    await engine('hello', sink.cbs);
    expect(fakeSession.sends).toEqual(['hello']);
    expect(sink.out.join('')).toContain('ok:hello');
    expect(typeof engine.setApprovalMode).toBe('function');       // optional members survive
    expect(typeof engine.close).toBe('function');
    expect(typeof engine.renewBudgetEpoch).toBe('function');
  });

  it('both /renew labels resolve in en and tr (no hardcoded strings)', () => {
    const en = buildRenewSlashLabels((k) => getMessage(k, 'en'));
    const tr = buildRenewSlashLabels((k) => getMessage(k, 'tr'));
    for (const key of ['confirmed', 'unavailable'] as const) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(tr[key].length).toBeGreaterThan(0);
      expect(en[key]).not.toBe(tr[key]);
    }
    expect(en.confirmed).not.toBe('native-budget.renew-confirmed');
    expect(en.unavailable).not.toBe('native-budget.renew-unavailable');
  });
});
