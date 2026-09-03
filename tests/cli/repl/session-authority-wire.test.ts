// tests/cli/repl/session-authority-wire.test.ts
// ═══ TERMINAL-SESSION-AUTHORITY-001 — production wiring closure (source scans) ═══
//
// The authority is real only when both surfaces create/consume it: entry.ts
// (readline) builds it from `terminal.posture` + the permission policy
// default, consults confirmPolicy in the tool confirm, injects the numbered
// askChoice seam on a TTY and the term / approve / config specs + config
// seam; run.tsx creates it for the Ink App, which mirrors /term and /approve
// into it. The config entry helpers live in the Ink-free config-entries.ts
// and stay re-exported from run.tsx for their existing importers. Hermetic.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildConfigEntries as fromRun } from '../../../src/cli/repl/run.js';
import { buildConfigEntries as fromModule, parseConfigValueText } from '../../../src/cli/repl/config-entries.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..', '..');

describe('readline (entry.ts)', () => {
  const entry = readFileSync(join(ROOT, 'src/cli/entry.ts'), 'utf-8');
  it('creates the authority from terminal.posture + the policy default and consults it in the tool confirm', () => {
    expect(entry).toMatch(/createSessionAuthority\(\{\s*posture: resolveConfiguredPosture\(/);
    expect(entry).toMatch(/approval: loadPolicy\(process\.cwd\(\)\)\.defaultMode/);
    expect(entry).toMatch(/authority\.confirmPolicy\(toolName\) === 'allow' \? Promise\.resolve\(true\) : askConfirm\(summary, toolName\)/);
  });
  it('injects askChoice on a TTY through the answer arbiter, and the term/approve/config specs + config seam', () => {
    expect(entry).toMatch(/const askChoice = isTty/);
    expect(entry).toMatch(/pendingAnswer = \(line\) => resolve\(line\)/);
    expect(entry).toMatch(/term: \(\) => buildTermPickerSpec\(/);
    expect(entry).toMatch(/approve: \(\) => buildApprovalPickerSpec\(APPROVAL_MODES, authority\.approval\(\)/);
    expect(entry).toMatch(/'config-key': \(\) => buildConfigKeyPickerSpec\(buildConfigEntries\(process\.cwd\(\)\)/);
    expect(entry).toMatch(/applyConfig: \(key, value\) => \{\s*const out = setConfigValues\(process\.cwd\(\), \{ \[key\]: parseConfigValueText\(value\) \}\)/);
    expect(entry).toMatch(/^\s+authority,$/m);
  });
});

describe('Ink (run.tsx → app.tsx)', () => {
  it('run.tsx creates the authority and the App mirrors /term and /approve into it', () => {
    const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
    const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
    expect(run).toMatch(/const sessionAuthority = createSessionAuthority\(\{/);
    expect(run).toMatch(/initialTermMode=\{sessionAuthority\.posture\(\)\}/);
    expect(run).toMatch(/sessionAuthority=\{sessionAuthority\}/);
    expect(app).toMatch(/props\.sessionAuthority\?\.setApproval\(mode\)/);
    expect(app).toMatch(/props\.sessionAuthority\?\.setPosture\(target\)/);
  });
});

describe('config entries live in the Ink-free module', () => {
  it('run.tsx re-exports the same functions and the value rule parses JSON first', () => {
    expect(fromRun).toBe(fromModule);
    expect(parseConfigValueText('true')).toBe(true);
    expect(parseConfigValueText('balanced')).toBe('balanced');
  });
});

describe('choice prompt label', () => {
  it('tui.picker.choice_prompt exists in every language and reaches PickerLabels.choicePrompt', () => {
    const langs = getMessageLanguages('tui.picker.choice_prompt');
    expect(langs).toEqual(expect.arrayContaining(['en', 'tr']));
    for (const lang of langs) expect(buildPickerLabels((k) => getMessage(k, lang)).choicePrompt).toContain('{n}');
  });
});
