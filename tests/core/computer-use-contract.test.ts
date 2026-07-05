// tests/core/computer-use-contract.test.ts
//
// Sprint 369, Task 369-005 (TOOL-CU-DILIM-1) — contract-layer coverage for
// src/core/computer-use-contract.ts: action/result zod schemas, the fixed
// security-class taxonomy, and the honest availability resolver. No adapter
// exists yet (dilim-2+), so this file never spawns a real screenshot/browser
// — it only exercises schema validation + pure config-driven resolution.

import { describe, it, expect } from 'vitest';
import {
  computerUseActionSchema,
  computerUseResultSchema,
  resolveComputerUseAvailability,
  securityClassForAction,
  COMPUTER_USE_ACTION_KINDS,
  COMPUTER_USE_SECURITY_CLASSES,
  COMPUTER_USE_ACTION_SECURITY_CLASS,
  type ComputerUseAction,
} from '../../src/core/computer-use-contract.js';

describe('computerUseActionSchema — valid actions', () => {
  it('accepts a minimal screenshot action', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'screenshot' });
    expect(result.success).toBe(true);
  });

  it('accepts a screenshot action with a region', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'screenshot', region: 'main-viewport' });
    expect(result.success).toBe(true);
  });

  it('accepts a click action and applies defaults', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'click', x: 10, y: 20 });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === 'click') {
      expect(result.data.button).toBe('left');
      expect(result.data.clickCount).toBe(1);
    }
  });

  it('accepts a fully-specified click action', () => {
    const result = computerUseActionSchema.safeParse({
      kind: 'click', x: 1, y: 2, button: 'right', clickCount: 2,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a type action and applies defaults', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'type', text: 'hello world' });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === 'type') {
      expect(result.data.delayMs).toBe(0);
    }
  });

  it('accepts a navigate action and applies defaults', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'navigate', url: 'https://example.com' });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === 'navigate') {
      expect(result.data.waitUntil).toBe('load');
    }
  });

  it('accepts a navigate action with an explicit waitUntil', () => {
    const result = computerUseActionSchema.safeParse({
      kind: 'navigate', url: 'https://example.com', waitUntil: 'networkidle',
    });
    expect(result.success).toBe(true);
  });
});

describe('computerUseActionSchema — invalid actions', () => {
  it('rejects an unknown kind', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'drag', x: 1, y: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a click action missing coordinates', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'click' });
    expect(result.success).toBe(false);
  });

  it('rejects a click action with non-numeric coordinates', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'click', x: '1', y: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects a click action with an invalid button', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'click', x: 1, y: 2, button: 'top' });
    expect(result.success).toBe(false);
  });

  it('rejects a type action with empty text', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'type', text: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a type action with a negative delay', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'type', text: 'x', delayMs: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a navigate action with a non-URL string', () => {
    const result = computerUseActionSchema.safeParse({ kind: 'navigate', url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('rejects a navigate action with an invalid waitUntil', () => {
    const result = computerUseActionSchema.safeParse({
      kind: 'navigate', url: 'https://example.com', waitUntil: 'instant',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bare object with no kind', () => {
    const result = computerUseActionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('security-class taxonomy — fixed, never caller-suppliable', () => {
  it('exposes exactly the Oku/Değiştir/Çalıştır ladder (Otonom intentionally omitted)', () => {
    expect(COMPUTER_USE_SECURITY_CLASSES).toEqual(['Oku', 'Değiştir', 'Çalıştır']);
  });

  it('maps every action kind to a fixed class matching the taxonomy', () => {
    for (const kind of COMPUTER_USE_ACTION_KINDS) {
      expect(COMPUTER_USE_SECURITY_CLASSES).toContain(COMPUTER_USE_ACTION_SECURITY_CLASS[kind]);
    }
  });

  it('classifies screenshot as Oku (read-only)', () => {
    expect(COMPUTER_USE_ACTION_SECURITY_CLASS.screenshot).toBe('Oku');
  });

  it('classifies click and type as Değiştir (mutating)', () => {
    expect(COMPUTER_USE_ACTION_SECURITY_CLASS.click).toBe('Değiştir');
    expect(COMPUTER_USE_ACTION_SECURITY_CLASS.type).toBe('Değiştir');
  });

  it('classifies navigate as Çalıştır (highest risk — arbitrary execution downstream)', () => {
    expect(COMPUTER_USE_ACTION_SECURITY_CLASS.navigate).toBe('Çalıştır');
  });

  it('securityClassForAction derives the class from a validated action, ignoring any extra input', () => {
    const parsed = computerUseActionSchema.parse({ kind: 'click', x: 1, y: 2 });
    expect(securityClassForAction(parsed as ComputerUseAction)).toBe('Değiştir');
  });
});

describe('computerUseResultSchema', () => {
  it('accepts a valid ok result', () => {
    const result = computerUseResultSchema.safeParse({
      status: 'ok',
      actionKind: 'screenshot',
      securityClass: 'Oku',
      timestamp: '2026-07-05T00:00:00.000Z',
      screenshotBase64: 'aGVsbG8=',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid error result', () => {
    const result = computerUseResultSchema.safeParse({
      status: 'error',
      actionKind: 'navigate',
      securityClass: 'Çalıştır',
      timestamp: '2026-07-05T00:00:00.000Z',
      errorMessage: 'target unreachable',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid unavailable result', () => {
    const result = computerUseResultSchema.safeParse({
      status: 'unavailable',
      actionKind: 'click',
      securityClass: 'Değiştir',
      timestamp: '2026-07-05T00:00:00.000Z',
      reason: 'computer_use disabled',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an error result missing errorMessage', () => {
    const result = computerUseResultSchema.safeParse({
      status: 'error',
      actionKind: 'navigate',
      securityClass: 'Çalıştır',
      timestamp: '2026-07-05T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unavailable result missing reason', () => {
    const result = computerUseResultSchema.safeParse({
      status: 'unavailable',
      actionKind: 'click',
      securityClass: 'Değiştir',
      timestamp: '2026-07-05T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown status', () => {
    const result = computerUseResultSchema.safeParse({
      status: 'pending',
      actionKind: 'click',
      securityClass: 'Değiştir',
      timestamp: '2026-07-05T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a securityClass outside the fixed taxonomy', () => {
    const result = computerUseResultSchema.safeParse({
      status: 'ok',
      actionKind: 'click',
      securityClass: 'Otonom',
      timestamp: '2026-07-05T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('resolveComputerUseAvailability — honest, never assumes availability', () => {
  it('is unavailable with a reason when the config block is entirely absent', () => {
    const result = resolveComputerUseAvailability(undefined);
    expect(result.available).toBe(false);
    expect(result.reason).toBeTruthy();
    expect(result.allowedCapabilities).toEqual([]);
  });

  it('is unavailable when enabled is explicitly false', () => {
    const result = resolveComputerUseAvailability({ enabled: false, allowed_capabilities: ['screenshot'] });
    expect(result.available).toBe(false);
    expect(result.allowedCapabilities).toEqual([]);
  });

  it('is unavailable when enabled but allowed_capabilities is absent (fail-closed)', () => {
    const result = resolveComputerUseAvailability({ enabled: true });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/no known capability/i);
  });

  it('is unavailable when enabled but allowed_capabilities is empty', () => {
    const result = resolveComputerUseAvailability({ enabled: true, allowed_capabilities: [] });
    expect(result.available).toBe(false);
  });

  it('is unavailable when allowed_capabilities only contains unknown strings', () => {
    const result = resolveComputerUseAvailability({ enabled: true, allowed_capabilities: ['fly', 'teleport'] });
    expect(result.available).toBe(false);
    expect(result.allowedCapabilities).toEqual([]);
  });

  it('is available with the exact allowlisted subset when enabled with a valid allowlist', () => {
    const result = resolveComputerUseAvailability({ enabled: true, allowed_capabilities: ['screenshot', 'click'] });
    expect(result.available).toBe(true);
    expect(result.allowedCapabilities.sort()).toEqual(['click', 'screenshot']);
    expect(result.reason).toBeUndefined();
  });

  it('filters out unknown capability strings rather than trusting them', () => {
    const result = resolveComputerUseAvailability({
      enabled: true,
      allowed_capabilities: ['screenshot', 'not-a-real-capability'],
    });
    expect(result.available).toBe(true);
    expect(result.allowedCapabilities).toEqual(['screenshot']);
  });

  it('grants all four capabilities when fully allowlisted', () => {
    const result = resolveComputerUseAvailability({
      enabled: true,
      allowed_capabilities: [...COMPUTER_USE_ACTION_KINDS],
    });
    expect(result.available).toBe(true);
    expect(result.allowedCapabilities.sort()).toEqual([...COMPUTER_USE_ACTION_KINDS].sort());
  });
});
