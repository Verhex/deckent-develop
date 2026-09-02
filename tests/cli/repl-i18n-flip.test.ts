// ═══ Task 387-001 (born-492, W1-EXPERIENCE-ON) — repl_surface i18n flip ═════
//
// Verifies the gap this task closes: run.tsx's `<ReplApp>` label object omitted
// the resume-picker/busy-control ReplLabels fields entirely and never passed an
// `approvalLabels` prop at all, so app.tsx's pure helpers (resolveModeLabel,
// buildResumePickerLines, resolveResumeCommand, renderBusyDecision) and
// ApprovalCard silently rendered their hardcoded English `??` defaults
// regardless of `lang`. No Ink mount (ink-testing-library is not a project
// dependency — same precedent as tests/cli/repl/app-surface-wire.test.tsx):
// this suite exercises the pure label-builders (`buildReplLabels`/
// `buildApprovalLabels`, run.tsx) feeding the pure app.tsx decision helpers.

import { describe, it, expect } from 'vitest';
import { buildReplLabels, buildApprovalLabels } from '../../src/cli/repl/run.js';
import {
  resolveModeLabel, buildResumePickerLines, resolveResumeCommand, renderBusyDecision,
} from '../../src/cli/repl/app.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { composeSystemPrompt, IMMUTABLE_CORE, IMMUTABLE_CORE_EN } from '../../src/agent/identity.js';

const tFor = (lang: 'en' | 'tr') => (key: string): string => getMessage(key, lang);

describe('buildReplLabels / buildApprovalLabels — lang=tr renders fully Turkish', () => {
  const labelsTr = buildReplLabels(tFor('tr'));
  const approvalTr = buildApprovalLabels(tFor('tr'));

  it('mode indicator (/ask · /run · /control) renders Turkish', () => {
    expect(resolveModeLabel('ask', labelsTr)).toBe('Sor');
    expect(resolveModeLabel('run', labelsTr)).toBe('Çalıştır');
    expect(resolveModeLabel('control', labelsTr)).toBe('Kontrol');
  });

  it('resume-picker (header/hint/switched/not-found/ambiguous) renders Turkish', () => {
    const disk = [{ id: 's1', title: 'başlık', date: '2026-07-01T10:00:00.000Z', status: 'completed' }];
    const lines = buildResumePickerLines(disk, [], labelsTr);
    expect(lines[0]).toBe('Son oturumlar');
    expect(lines[lines.length - 1]).toContain('/resume');
    expect(lines[lines.length - 1]).not.toContain('Tip:');

    const switched = resolveResumeCommand('1', disk, [], labelsTr);
    expect(switched).toMatchObject({ kind: 'switch', line: 'sürdürülüyor: s1' });

    const notFound = resolveResumeCommand('9', disk, [], labelsTr);
    expect(notFound).toMatchObject({ kind: 'reject', line: 'oturum bulunamadı: 9' });

    const twins = [
      { id: 'a', title: 'deploy fix', date: '2026-07-01T10:00:00.000Z', status: 'completed' },
      { id: 'b', title: 'deploy docs', date: '2026-07-01T10:00:00.000Z', status: 'completed' },
    ];
    const ambiguous = resolveResumeCommand('deploy', twins, [], labelsTr);
    expect(ambiguous.kind).toBe('reject');
    if (ambiguous.kind === 'reject') expect(ambiguous.line).toContain('belirsiz');
  });

  it('busy-controls (/queue · /interrupt · /steer) render Turkish', () => {
    expect(renderBusyDecision({ kind: 'queue-status', busy: false, pendingBackgroundBuckets: 2 }, labelsTr))
      .toBe('kuyruk: 2 arkaplan · boşta');
    expect(renderBusyDecision({ kind: 'queue-status', busy: true, pendingBackgroundBuckets: 1 }, labelsTr))
      .toBe('kuyruk: 1 arkaplan · meşgul');
    expect(renderBusyDecision({ kind: 'interrupted', aborted: true }, labelsTr))
      .toBe('kesildi — sağlayıcı akışı durduruldu; bekleyen girdi temizlendi');
    expect(renderBusyDecision({ kind: 'interrupt-noop', reason: 'idle' }, labelsTr))
      .toBe('kesilecek bir şey çalışmıyor');
    expect(renderBusyDecision({ kind: 'interrupt-noop', reason: 'duplicate' }, labelsTr))
      .toBe('kesme zaten istendi');
    expect(renderBusyDecision({ kind: 'steer-queued', position: 3 }, labelsTr))
      .toBe('yönlendirme notu sıraya alındı (#3) — tur sonunda uygulanacak');
    expect(renderBusyDecision({ kind: 'steer-noop', reason: 'idle' }, labelsTr))
      .toBe('yönlendirilecek bir şey çalışmıyor');
    expect(renderBusyDecision({ kind: 'steer-noop', reason: 'empty' }, labelsTr))
      .toBe('kullanım: /steer <mesaj>');
  });

  it('ApprovalCard labels (hint/details/no-args/risk badges) render Turkish', () => {
    expect(approvalTr.hint).toBe('(y = onayla · n = reddet · a = benzerlerini onayla · d = detay)');
    expect(approvalTr.detailsHeading).toBe('Detaylar');
    expect(approvalTr.noArgs).toBe('(argüman yok)');
    expect(approvalTr.riskLabels).toEqual({
      none: 'YOK', low: 'DÜŞÜK', medium: 'ORTA', high: 'YÜKSEK', critical: 'KRİTİK',
    });
    // progress reuses tui.confirm_progress — an intentionally identical-across-
    // locales template, not a translation gap.
    expect(approvalTr.progress).toBe('[{index}/{total}]');
  });
});

describe('buildReplLabels / buildApprovalLabels — lang=en stays byte-identical to the pre-387-001 English defaults', () => {
  const labelsEn = buildReplLabels(tFor('en'));
  const approvalEn = buildApprovalLabels(tFor('en'));

  it('mode indicator matches the old hardcoded English fallback', () => {
    expect(resolveModeLabel('ask', labelsEn)).toBe('Ask');
    expect(resolveModeLabel('run', labelsEn)).toBe('Run');
    expect(resolveModeLabel('control', labelsEn)).toBe('Control');
  });

  it('resume-picker matches the old hardcoded English fallback', () => {
    const disk = [{ id: 's1', title: 'title', date: '2026-07-01T10:00:00.000Z', status: 'completed' }];
    const lines = buildResumePickerLines(disk, [], labelsEn);
    expect(lines[0]).toBe('Recent sessions');
    expect(lines[lines.length - 1]).toBe('Tip: /resume <number> to continue a session');
    expect(resolveResumeCommand('1', disk, [], labelsEn)).toMatchObject({ line: 'resumed: s1' });
    expect(resolveResumeCommand('9', disk, [], labelsEn)).toMatchObject({ line: 'session not found: 9' });
  });

  it('busy-controls match the old hardcoded English fallback', () => {
    expect(renderBusyDecision({ kind: 'queue-status', busy: false, pendingBackgroundBuckets: 2 }, labelsEn))
      .toBe('queue: 2 background · idle');
    expect(renderBusyDecision({ kind: 'interrupted', aborted: true }, labelsEn))
      .toBe('interrupted — the provider stream was stopped; pending input cleared');
    expect(renderBusyDecision({ kind: 'steer-queued', position: 3 }, labelsEn))
      .toBe('steer note queued (#3) — applied at turn end');
  });

  it('ApprovalCard labels match the pre-387-001 English strings exactly (the mechanism owns no default object since TERMINAL-TOOLS-002)', () => {
    // TERMINAL-TOOLS-012 added the required §4 `facts` group; the five original keys stay byte-identical.
    const { facts: _facts, ...legacyEn } = approvalEn;
    expect(_facts.requester.length).toBeGreaterThan(0);
    expect(legacyEn).toEqual({
      hint: '(y = approve · n = deny · a = approve similar · d = details)',
      progress: '[{index}/{total}]',
      detailsHeading: 'Details',
      noArgs: '(no arguments)',
      riskLabels: { none: 'NONE', low: 'LOW', medium: 'MEDIUM', high: 'HIGH', critical: 'CRITICAL' },
    });
  });
});

describe('new message keys — every key has distinct, non-empty en vs tr text', () => {
  const keys = [
    'tui.resume_picker_header', 'tui.resume_picker_hint', 'tui.resume_picker_switched',
    'tui.resume_picker_not_found', 'tui.resume_picker_ambiguous',
    'tui.busy_queue_status', 'tui.busy_state_busy', 'tui.busy_state_idle',
    'tui.busy_interrupted', 'tui.busy_interrupt_idle', 'tui.busy_interrupt_dup',
    'tui.busy_steer_queued', 'tui.busy_steer_idle', 'tui.busy_steer_empty',
    'tui.approval_card_hint', 'tui.approval_card_details_heading', 'tui.approval_card_no_args',
    'tui.approval_risk_none', 'tui.approval_risk_low', 'tui.approval_risk_medium',
    'tui.approval_risk_high', 'tui.approval_risk_critical',
    'native.switch.no-transport',
  ];

  for (const key of keys) {
    it(`${key} resolves to distinct, non-empty en/tr text (not the raw key)`, () => {
      const en = getMessage(key, 'en');
      const tr = getMessage(key, 'tr');
      expect(en).not.toBe(key);
      expect(tr).not.toBe(key);
      expect(en.length).toBeGreaterThan(0);
      expect(tr.length).toBeGreaterThan(0);
      expect(tr).not.toBe(en);
    });
  }
});

describe('composeSystemPrompt — actually reads `opts.lang` (Task 387-001)', () => {
  it('lang="en" selects the English immutable core + project-info header', () => {
    const prompt = composeSystemPrompt({ cwd: '/nonexistent-387-001', lang: 'en' });
    expect(prompt).toContain(IMMUTABLE_CORE_EN);
    expect(prompt).not.toContain(IMMUTABLE_CORE);
  });

  it('lang="tr" selects the Turkish immutable core (unchanged constant)', () => {
    const prompt = composeSystemPrompt({ cwd: '/nonexistent-387-001', lang: 'tr' });
    expect(prompt).toContain(IMMUTABLE_CORE);
    expect(prompt).not.toContain(IMMUTABLE_CORE_EN);
  });

  it('omitting lang stays byte-identical to the pre-387-001 default (Turkish core)', () => {
    const withNoLang = composeSystemPrompt({ cwd: '/nonexistent-387-001' });
    const withTr = composeSystemPrompt({ cwd: '/nonexistent-387-001', lang: 'tr' });
    expect(withNoLang).toBe(withTr);
    expect(withNoLang).toContain(IMMUTABLE_CORE);
  });
});
