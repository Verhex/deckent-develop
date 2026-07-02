/**
 * Task 356-015 (MESSAGES-KEYS-5) — hermetic guard for the round-9
 * sole-authority key-addition task.
 *
 * Round-9 (sprint-356) dependency tasks' .result notes were mined for
 * reported i18n key needs (see .tasks/task-356-015.plan for the full source
 * citation):
 *   - 356-006 (DOCTOR-FIX / doctor.ts) -> doctor.fix_* (8 keys), cited by
 *     doctor.ts's own "TODO(docImpact, Task 15)" comment above
 *     formatDoctorFixLines().
 * 356-002 (server.ts) reported no new key need ("docImpact: none of my
 * write-scope docs went stale") and is intentionally NOT represented here —
 * inventing keys for an unreported need would be a nogo per this task's own
 * goNogo.
 *
 * This is key-only addition: no structural change to MessageMap/getMessage,
 * and no wiring into doctor.ts (out of write scope — this task adds
 * translations only; the TODO comment in doctor.ts stays until a future
 * in-scope task switches formatDoctorFixLines() over to getMessage()).
 *
 * Hermetic: imports only pure, already-committed source (getMessage,
 * formatDoctorFixLines + its DoctorFixAction/DoctorFixApplyResult types) —
 * no fs I/O, no gitignored state, no Ink render. Action/result fixtures are
 * plain in-memory literals (same shape as doctor-fix.test.ts's own
 * planDoctorFixesFixture()).
 */

import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { formatDoctorFixLines } from '../../src/cli/commands/doctor.js';
import type { DoctorFixAction, DoctorFixApplyResult } from '../../src/cli/commands/doctor.js';

// ─── doctor.fix_* (356-006 docImpact — TODO(docImpact, Task 15)) ──────────

const FIXTURE_ACTIONS: DoctorFixAction[] = [
  { kind: 'mkdir', target: '/tmp/x/.deckent', description: 'Create missing directory: .deckent/' },
  { kind: 'chmod', target: '/tmp/x/.tasks/.deck-shadow', description: 'Reset permissions on stale .tasks/.deck-shadow: 644 → 600' },
];

const DOCTOR_FIX_PLAIN_KEYS = [
  'doctor.fix_nothing_to_repair',
  'doctor.fix_apply_hint',
] as const;

const DOCTOR_FIX_INTERP_KEYS = [
  ['doctor.fix_dry_run_header', { count: '2' }],
  ['doctor.fix_would_fix_line', { description: 'Create missing directory: .deckent/' }],
  ['doctor.fix_apply_header_ok', { count: '2' }],
  ['doctor.fix_apply_header_failed', { count: '2', failed: '1' }],
  ['doctor.fix_line_fixed', { description: 'Create missing directory: .deckent/' }],
  ['doctor.fix_line_failed', { description: 'Create missing directory: .deckent/', error: 'boom' }],
] as const;

describe('doctor.fix_* keys (356-006 docImpact — TODO(docImpact, Task 15) above formatDoctorFixLines)', () => {
  it.each(DOCTOR_FIX_PLAIN_KEYS)('%s resolves to a non-empty, non-key-echo string in en and tr', (key) => {
    expect(getMessage(key, 'en')).not.toBe(key);
    expect(getMessage(key, 'tr')).not.toBe(key);
  });

  it('every doctor.fix_* plain key genuinely differs between en and tr', () => {
    for (const key of DOCTOR_FIX_PLAIN_KEYS) {
      expect(getMessage(key, 'en'), key).not.toBe(getMessage(key, 'tr'));
    }
  });

  it.each(DOCTOR_FIX_INTERP_KEYS)('%s interpolates its variable(s) in en and tr', (key, vars) => {
    const en = getMessage(key, 'en', vars as Record<string, string>);
    for (const value of Object.values(vars)) expect(en).toContain(value);
    const tr = getMessage(key, 'tr', vars as Record<string, string>);
    for (const value of Object.values(vars)) expect(tr).toContain(value);
  });

  it('every doctor.fix_* interpolated key genuinely differs between en and tr', () => {
    for (const [key, vars] of DOCTOR_FIX_INTERP_KEYS) {
      expect(getMessage(key, 'en', vars as Record<string, string>), key)
        .not.toBe(getMessage(key, 'tr', vars as Record<string, string>));
    }
  });

  it('en "nothing to repair" text is byte-identical to formatDoctorFixLines([])\'s real line', () => {
    const rendered = formatDoctorFixLines([]);
    expect(rendered).toHaveLength(1);
    expect(getMessage('doctor.fix_nothing_to_repair', 'en')).toBe(rendered[0]);
  });

  it('en dry-run output is byte-identical to formatDoctorFixLines(actions)\'s real lines', () => {
    const rendered = formatDoctorFixLines(FIXTURE_ACTIONS);
    const reconstructed = [
      getMessage('doctor.fix_dry_run_header', 'en', { count: String(FIXTURE_ACTIONS.length) }),
      ...FIXTURE_ACTIONS.map(a => getMessage('doctor.fix_would_fix_line', 'en', { description: a.description })),
      getMessage('doctor.fix_apply_hint', 'en'),
    ];
    expect(reconstructed).toEqual(rendered);
  });

  it('en applied-with-no-failures output is byte-identical to formatDoctorFixLines(actions, results)\'s real lines', () => {
    const results: DoctorFixApplyResult[] = FIXTURE_ACTIONS.map(action => ({ action, applied: true }));
    const rendered = formatDoctorFixLines(FIXTURE_ACTIONS, results);
    const reconstructed = [
      getMessage('doctor.fix_apply_header_ok', 'en', { count: String(results.length) }),
      ...results.map(r => getMessage('doctor.fix_line_fixed', 'en', { description: r.action.description })),
    ];
    expect(reconstructed).toEqual(rendered);
  });

  it('en applied-with-a-failure output is byte-identical to formatDoctorFixLines(actions, results)\'s real lines', () => {
    const results: DoctorFixApplyResult[] = [
      { action: FIXTURE_ACTIONS[0]!, applied: false, error: 'boom' },
      { action: FIXTURE_ACTIONS[1]!, applied: true },
    ];
    const rendered = formatDoctorFixLines(FIXTURE_ACTIONS, results);
    const failedCount = results.filter(r => !r.applied).length;
    const reconstructed = [
      getMessage('doctor.fix_apply_header_failed', 'en', { count: String(results.length), failed: String(failedCount) }),
      getMessage('doctor.fix_line_failed', 'en', { description: results[0]!.action.description, error: results[0]!.error! }),
      getMessage('doctor.fix_line_fixed', 'en', { description: results[1]!.action.description }),
    ];
    expect(reconstructed).toEqual(rendered);
  });
});

// ─── no-collision + fallback-contract regression ──────────────────────────

describe('getMessage fallback behavior: unaffected by the new round-9 keys (no collision)', () => {
  it('a pre-existing, unrelated key still resolves exactly as before', () => {
    expect(getMessage('health.unknown', 'en')).toBe('unknown');
    expect(getMessage('health.unknown', 'tr')).toBe('bilinmiyor');
  });

  it('round-8\'s own keys still resolve exactly as before (no cross-round collision)', () => {
    expect(getMessage('approval_card.details_heading', 'en')).toBe('Details');
    expect(getMessage('do.what_will_happen', 'en')).toBe('What will happen:');
  });

  it('round-7\'s own keys still resolve exactly as before (no cross-round collision)', () => {
    expect(getMessage('tui.mode_ask', 'en')).toBe('Ask');
    expect(getMessage('plan_nl.preview_banner', 'en')).not.toBe('plan_nl.preview_banner');
  });

  it('a genuinely unknown key still echoes the key itself (fallback contract intact)', () => {
    const unknownKey = 'doctor.this_key_does_not_exist_xyz';
    expect(getMessage(unknownKey, 'en')).toBe(unknownKey);
    expect(getMessage(unknownKey, 'tr')).toBe(unknownKey);
  });

  it('an unsupported lang falls back to the en template, not a crash', () => {
    expect(getMessage('doctor.fix_apply_hint', 'fr')).toBe(getMessage('doctor.fix_apply_hint', 'en'));
    expect(getMessage('doctor.fix_dry_run_header', 'fr', { count: '1' })).toBe(
      getMessage('doctor.fix_dry_run_header', 'en', { count: '1' }),
    );
  });
});
