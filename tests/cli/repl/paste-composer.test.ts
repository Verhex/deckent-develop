import { describe, expect, it } from 'vitest';
import {
  createPasteAttachment,
  expandComposerSubmit,
  insertPasteChip,
  shouldCollapsePaste,
  stripTerminalCopyArtifactLines,
  uniquePasteChipText,
} from '../../../src/cli/repl/paste-composer.js';

const chip = '[Pasted · {lines} lines · {bytes} B]';

describe('paste-composer', () => {
  it('collapses pastes over line or char threshold', () => {
    expect(shouldCollapsePaste('a\nb\nc\nd')).toBe(true);
    expect(shouldCollapsePaste('short')).toBe(false);
  });

  it('expands chip text to wire body while rawIntent keeps chips', () => {
    const chipText = '[Pasted · 3 lines · 18 B]';
    const attachment = createPasteAttachment('line1\nline2\nline3', chipText, 'p1');
    const map = new Map([[attachment.id, attachment]]);
    const { buffer, cursor } = insertPasteChip('analyze: ', 9, chipText);
    const parts = expandComposerSubmit(buffer, map, { chip });
    expect(parts.wire).toContain('line1\nline2');
    expect(parts.rawIntent).toContain('analyze:');
    expect(parts.rawIntent).toContain('3 lines');
    expect(buffer).toContain(chipText);
    expect(cursor).toBeGreaterThan(9);
  });

  it('expands corrupted chip labels to full paste on submit', () => {
    const full = 'line1\nline2\nline3\nline4';
    const chipText = '[Pasted · 4 lines · 28 B]';
    const attachment = createPasteAttachment(full, chipText, 'p1');
    const map = new Map([[attachment.id, attachment]]);
    const corrupted = `asdasd[Pasted · 4 lines · sada28 B] asdasd`;
    const parts = expandComposerSubmit(corrupted, map, { chip });
    expect(parts.wire).toContain('line1');
    expect(parts.wire).not.toContain('Pasted ·');
  });

  it('strips terminal table copy artifacts from pasted text', () => {
    const raw = [
      '[Yapıştırılan metin · 1 satır · 10 B]',
      '│ foo │ bar │',
      'real content line',
    ].join('\n');
    expect(stripTerminalCopyArtifactLines(raw)).toContain('real content line');
    expect(stripTerminalCopyArtifactLines(raw)).not.toContain('│ foo');
    expect(stripTerminalCopyArtifactLines(raw)).not.toContain('Yapıştırılan metin');
  });

  it('strips Ink unicode box borders including ┬ junctions (smoke table copy)', () => {
    const raw = [
      '  ┌───┬────────────────────────────────────┬────┐',
      '  │ # │ Test                               │ GO │',
      '  ├───┼────────────────────────────────────┼────┤',
      '  │ 1 │ /cle + Enter → /clear              │ ok  │',
      '  └───┴────────────────────────────────────┴────┘',
      'keep this prompt line',
    ].join('\n');
    const out = stripTerminalCopyArtifactLines(raw);
    expect(out).toBe('keep this prompt line');
    expect(out).not.toContain('┌');
    expect(out).not.toContain('│');
  });

  it('allocates distinct chip text for duplicate dimensions', () => {
    const a = uniquePasteChipText({ chip }, { lineCount: 3, byteLength: 10 }, new Set());
    const b = uniquePasteChipText({ chip }, { lineCount: 3, byteLength: 10 }, new Set([a]));
    expect(a).not.toBe(b);
    expect(b).toContain('(#2)');
  });
});
