import { describe, it, expect } from 'vitest';
import { buildToolExecLabels } from '../../src/cli/helpers/tool-exec-labels.js';

// REPL-575 K5 — the caller-side i18n adapter that resolves chat-tool-exec's
// confirm-prompt summaries from the message catalog. Hermetic: pure string
// resolution, no I/O.

describe('buildToolExecLabels — localized tool confirm summaries (REPL-575 K5)', () => {
  it('en → English summaries with interpolated path/chars/cmd', () => {
    const l = buildToolExecLabels('en');
    expect(l.writeSummary('src/x.ts', 42)).toBe('Write file: src/x.ts (42 chars)');
    expect(l.editSummary('src/x.ts')).toBe('Edit file: src/x.ts');
    expect(l.bashSummary('npm test')).toBe('Run command: npm test');
  });

  it('tr → Turkish summaries with the same interpolation', () => {
    const l = buildToolExecLabels('tr');
    expect(l.writeSummary('src/x.ts', 42)).toBe('Dosya yaz: src/x.ts (42 karakter)');
    expect(l.editSummary('src/x.ts')).toBe('Dosya düzenle: src/x.ts');
    expect(l.bashSummary('npm test')).toBe('Komut çalıştır: npm test');
  });

  it('unknown lang falls back to English (getMessage normalization)', () => {
    const l = buildToolExecLabels('de');
    expect(l.editSummary('a')).toBe('Edit file: a');
  });
});
