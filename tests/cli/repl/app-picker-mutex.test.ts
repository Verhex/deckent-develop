// tests/cli/repl/app-picker-mutex.test.ts
// ═══ TERMINAL-PICKER-002 (P15b) — picker request + stdin ownership + wiring ═══
//
// The picker is the LOWEST-priority stdin consumer: it defers to the confirm
// modal, ApprovalCard, PlanPreviewCard and the inbox card. `resolveStdinOwner`
// keeps its pinned 3-key shape (tests/cli/approval-inputbar-mutex.test.tsx);
// the picker ANDs in at the JSX site through resolvePickerCardActive — the same
// precedence pattern as resolveInboxCardActive. Bare `/model` and `/provider`
// open the picker; typed arguments keep the direct path. Hermetic.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolvePickerCardActive, resolvePickerRequest, resolveStdinOwner } from '../../../src/cli/repl/app.js';

const ROOT = join(__dirname, '..', '..', '..');

describe('resolvePickerRequest — bare selection commands open the picker', () => {
  it('matches the bare forms only, case-insensitively, and never a typed argument', () => {
    expect(resolvePickerRequest('/model')).toEqual({ kind: 'model' });
    expect(resolvePickerRequest('/MODEL ')).toEqual({ kind: 'model' });
    expect(resolvePickerRequest('/provider')).toEqual({ kind: 'provider' });
    expect(resolvePickerRequest('/model claude-x')).toBeNull();
    expect(resolvePickerRequest('/models')).toBeNull();
    expect(resolvePickerRequest('hello')).toBeNull();
  });
});

describe('resolvePickerCardActive — lowest priority, mutex shape untouched', () => {
  it('is active only when no decision card or inbox owns stdin', () => {
    expect(resolvePickerCardActive(false, false, false, false)).toBe(true);
    expect(resolvePickerCardActive(true, false, false, false)).toBe(false);
    expect(resolvePickerCardActive(false, true, false, false)).toBe(false);
    expect(resolvePickerCardActive(false, false, true, false)).toBe(false);
    expect(resolvePickerCardActive(false, false, false, true)).toBe(false);
    expect(Object.keys(resolveStdinOwner(false, false)).sort()).toEqual(['approvalCardActive', 'confirmActive', 'inputBarActive']);
  });
});

describe('wiring — app.tsx + run.tsx', () => {
  const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
  const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
  it('app.tsx mounts PickerCard after the inbox card, gates it with resolvePickerCardActive, keeps the input bar inactive while open, and shares runSwitch', () => {
    expect(app).toMatch(/<PickerCard/);
    expect(app).toMatch(/isActive=\{resolvePickerCardActive\(/);
    expect(app).toMatch(/&& picker === null/);
    expect(app).toMatch(/const runSwitch = \(/);
    expect(app).toMatch(/resolvePickerRequest\(trimmed\)/);
    expect(app.indexOf('<InboxCard')).toBeLessThan(app.indexOf('<PickerCard'));
  });
  it('run.tsx injects pickerLabels, pickerSpecs (native + legacy), saveDefault and the ascii/noColor gates', () => {
    expect(run).toMatch(/pickerLabels=\{buildPickerLabels\(t\)\}/);
    expect(run).toMatch(/pickerSpecs=\{/);
    expect(run).toMatch(/saveDefault=\{/);
    expect(run).toMatch(/setConfigValues\(/);
    expect(run).toMatch(/pickerAscii=\{/);
    expect(run).toMatch(/pickerNoColor=\{isColorSuppressed\(\)\}/);
  });
});
