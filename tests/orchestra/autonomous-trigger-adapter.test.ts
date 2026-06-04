import { describe, it, expect } from 'vitest';
import {
  makeTriggerSource,
  type ScheduledTriggerPayload,
} from '../../src/orchestra/autonomous/trigger-adapter.js';
import type { ScheduledFlow } from '../../src/core/scheduled-flow.js';
import type { SelfDispatchPolicy } from '../../src/core/self-dispatch.js';

// ─── Fixtures (hermetic — no I/O, deterministic clock) ───────────────

const makeFlow = (overrides: Partial<ScheduledFlow> = {}): ScheduledFlow => ({
  id: 'flow-1',
  cronExpr: '* * * * *',
  action: 'mrp.refresh',
  tenantId: 'tenant-acme',
  enabled: true,
  ...overrides,
});

const makePolicy = (
  overrides: Partial<SelfDispatchPolicy> = {},
): SelfDispatchPolicy => ({
  id: 'p-1',
  trigger: 'scheduled',
  action: 'start',
  ...overrides,
});

const fixedClock = (iso = '2026-06-04T10:00:00.000Z'): (() => Date) => () => new Date(iso);

// ─── Tests ───────────────────────────────────────────────────────────

describe('makeTriggerSource — due-flow → AutonomousTrigger', () => {
  it('converts a due scheduled flow into an AutonomousTrigger with mapped fields', async () => {
    const src = makeTriggerSource({
      flows: [makeFlow()],
      policy: makePolicy(),
      clock: fixedClock(),
    });

    const t = await src.next();

    expect(t).not.toBeNull();
    expect(t?.source).toBe('scheduled-flow');
    expect(t?.action).toBe('mrp.refresh');
    expect(t?.requestedBy).toBe('tenant-acme');
    expect(t?.id).toContain('flow-1');
  });
});

describe('makeTriggerSource — idle → null', () => {
  it('returns null when no flows are registered', async () => {
    const src = makeTriggerSource({
      flows: [],
      policy: makePolicy(),
      clock: fixedClock(),
    });
    expect(await src.next()).toBeNull();
  });

  it('returns null when policy.disabled === true (even if flows are due)', async () => {
    const src = makeTriggerSource({
      flows: [makeFlow()],
      policy: makePolicy({ disabled: true }),
      clock: fixedClock(),
    });
    expect(await src.next()).toBeNull();
  });

  it('returns null on a re-tick within the same minute (scheduler state preserved)', async () => {
    const src = makeTriggerSource({
      flows: [makeFlow()],
      policy: makePolicy(),
      clock: fixedClock(),
    });
    await src.next(); // drains the only due trigger
    expect(await src.next()).toBeNull();
  });
});

describe('makeTriggerSource — SelfDispatchPolicy.requiresApproval semantics preserved', () => {
  it('default policy → trigger payload carries requiresApproval=true (DEFAULT_GUARD)', async () => {
    const src = makeTriggerSource({
      flows: [makeFlow()],
      policy: makePolicy(), // no guard override
      clock: fixedClock(),
    });
    const t = await src.next();
    const payload = t?.payload as ScheduledTriggerPayload;
    expect(payload.requiresApproval).toBe(true);
    expect(payload.policyId).toBe('p-1');
    expect(payload.flowId).toBe('flow-1');
  });

  it('explicit guard requiresApproval=false propagates through to payload', async () => {
    const src = makeTriggerSource({
      flows: [makeFlow()],
      policy: makePolicy({ guard: { requiresApproval: false } }),
      clock: fixedClock(),
    });
    const t = await src.next();
    const payload = t?.payload as ScheduledTriggerPayload;
    expect(payload.requiresApproval).toBe(false);
  });
});

describe('makeTriggerSource — multiple due flows yielded sequentially', () => {
  it('yields one trigger per next() call in scheduler order, then null', async () => {
    const src = makeTriggerSource({
      flows: [
        makeFlow({ id: 'flow-a', tenantId: 'tenant-a' }),
        makeFlow({ id: 'flow-b', tenantId: 'tenant-b' }),
      ],
      policy: makePolicy(),
      clock: fixedClock(),
    });

    const first = await src.next();
    const second = await src.next();
    const third = await src.next();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.id).not.toBe(second?.id);
    const ids = [first?.requestedBy, second?.requestedBy].sort();
    expect(ids).toEqual(['tenant-a', 'tenant-b']);
    expect(third).toBeNull();
  });
});
