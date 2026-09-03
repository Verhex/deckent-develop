// tests/cli/repl/picker-surfaces.test.ts
// ═══ TERMINAL-PICKER-003 (P15c) — /approve, /term and /resume pickers ═══════
//
// The same primitive for the three remaining in-session choices. Candidates
// are data: APPROVAL_MODES (permission-types.ts, the SSOT beside the type),
// TERM_MODES + ALLOWED_RISKS_BY_MODE (term-mode.ts), and the merged session
// records the typed /resume already uses. Approve and term are session-only
// by construction (no config key backs them → a single `apply` scope). The
// commit reuses the exact apply closures the typed forms use (runApprove,
// runTerm, applyResumeDecision) — no duplicated logic. Also closes a P14a gap:
// `/term` must be reachable on every surface (the Ask/Run/Control gate applies
// everywhere), not only when repl_surface.enabled is on. Hermetic.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolvePickerRequest } from '../../../src/cli/repl/app.js';
import { APPROVAL_MODES } from '../../../src/agent/permission-types.js';
import { TERM_MODES, ALLOWED_RISKS_BY_MODE } from '../../../src/cli/repl/term-mode.js';
import { buildApprovalPickerSpec, buildTermPickerSpec, buildResumePickerSpec } from '../../../src/cli/repl/picker-specs.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..', '..');
const EN = buildPickerLabels((k) => getMessage(k, 'en'));
const TR = buildPickerLabels((k) => getMessage(k, 'tr'));

describe('resolvePickerRequest — the remaining bare commands', () => {
  it('maps bare /approve, /term and /resume; typed arguments stay direct', () => {
    expect(resolvePickerRequest('/approve')).toEqual({ kind: 'approve' });
    expect(resolvePickerRequest('/term')).toEqual({ kind: 'term' });
    expect(resolvePickerRequest('/resume')).toEqual({ kind: 'resume' });
    expect(resolvePickerRequest('/approve full-auto')).toBeNull();
    expect(resolvePickerRequest('/term run')).toBeNull();
    expect(resolvePickerRequest('/resume 2')).toBeNull();
  });
});

describe('APPROVAL_MODES — the enum SSOT beside the type', () => {
  it('lists the three modes once, in the documented order', () => {
    expect(APPROVAL_MODES).toEqual(['suggest', 'auto-edit', 'full-auto']);
  });
});

describe('buildApprovalPickerSpec / buildTermPickerSpec — session-only, one scope', () => {
  it('approval: one row per mode with its localized meaning, current marked, initialId current, scope apply', () => {
    const spec = buildApprovalPickerSpec(APPROVAL_MODES, 'auto-edit', (m) => EN.approveFacts[m]);
    expect(spec.kind).toBe('approve');
    expect(spec.scopes).toEqual(['apply']);
    expect(spec.initialId).toBe('auto-edit');
    expect(spec.candidates.map((c) => [c.id, c.state])).toEqual([['suggest', 'ok'], ['auto-edit', 'current'], ['full-auto', 'ok']]);
    expect(spec.candidates[0]!.facts.map((f) => f.value)).toEqual([EN.approveFacts.suggest]);
    expect(EN.approveFacts.suggest).not.toBe(TR.approveFacts.suggest);
  });
  it('term: one row per posture with the risk classes it admits, current marked', () => {
    const spec = buildTermPickerSpec(TERM_MODES, 'run', (mode) => [...ALLOWED_RISKS_BY_MODE[mode]].join(' · '));
    expect(spec.kind).toBe('term');
    expect(spec.scopes).toEqual(['apply']);
    expect(spec.candidates.map((c) => [c.id, c.state])).toEqual([['ask', 'ok'], ['run', 'current'], ['control', 'ok']]);
    expect(spec.candidates[2]!.facts[0]!.value).toContain('Otonom');
    expect(spec.candidates[0]!.facts[0]!.value).toBe('Oku');
  });
});

describe('buildResumePickerSpec — sessions as stable identities', () => {
  it('lists records with status/time facts, marks the active session current, keeps a single apply scope', () => {
    const records = [
      { id: 'sess-1', title: 'add auth', date: '2026-07-01T10:00:00.000Z', status: 'completed' },
      { id: 'sess-2', title: 'fix bug', date: '2026-07-02T10:00:00.000Z', status: 'running' },
    ];
    const spec = buildResumePickerSpec(records, 'sess-2', (r) => [r.status, r.date.slice(0, 10)]);
    expect(spec.kind).toBe('resume');
    expect(spec.scopes).toEqual(['apply']);
    expect(spec.initialId).toBe('sess-2');
    expect(spec.candidates.map((c) => [c.id, c.label, c.state])).toEqual([['sess-1', 'add auth', 'ok'], ['sess-2', 'fix bug', 'current']]);
    expect(spec.candidates[0]!.facts.map((f) => f.value)).toEqual(['completed', '2026-07-01']);
    expect(buildResumePickerSpec([], null, () => []).candidates).toEqual([]);
  });
});

describe('catalog + labels', () => {
  it('approveFacts rows exist in en and tr', () => {
    for (const key of ['tui.picker.fact.approve.suggest', 'tui.picker.fact.approve.auto_edit', 'tui.picker.fact.approve.full_auto']) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
    }
  });
});

describe('wiring — app.tsx', () => {
  const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
  it('shares runApprove / runTerm / applyResumeDecision between the typed forms and the picker, builds the three specs in-app, and handles /term outside the repl_surface flag', () => {
    expect(app).toMatch(/const runApprove = \(/);
    expect(app).toMatch(/const runTerm = \(/);
    expect(app).toMatch(/const applyResumeDecision = \(/);
    expect(app).toMatch(/buildApprovalPickerSpec\(APPROVAL_MODES/);
    expect(app).toMatch(/buildTermPickerSpec\(TERM_MODES/);
    expect(app).toMatch(/buildResumePickerSpec\(/);
    expect(app).not.toMatch(/\/\^\\\/approve\(\?:\\s\+\(suggest\|auto-edit\|full-auto\)\)\?\$\/i/);
    // `/term` is parsed BEFORE the replSurfaceEnabled block (the gate applies on every surface).
    const termAt = app.indexOf('const termCmd = parseTermCommand(trimmed);');
    const flagAt = app.indexOf('if (replSurfaceEnabled) {', termAt - 400);
    expect(termAt).toBeGreaterThan(0);
    expect(flagAt === -1 || flagAt > termAt).toBe(true);
  });
});
