// P11/P12b — insan-projeksiyon pinleri: sağlayıcı-zarfı kazma + result-özeti.
import { describe, it, expect } from 'vitest';
import { humanizeLogLine, humanizeResult } from '../src/renderer/shell/log-humanize.js';

describe('humanizeLogLine — zarf-kazıcı', () => {
  it('canlı-447 sınıfı: iç-içe assistant-mesajından GERÇEK metni çıkarır', () => {
    const line = JSON.stringify({
      ts: 'x', seq: 1, type: 'text',
      content: { type: 'assistant', message: { model: 'm', content: [{ type: 'text', text: 'Şimdi testi yazıyorum.' }] } },
    });
    expect(humanizeLogLine(line)).toBe('[text] Şimdi testi yazıyorum.');
  });

  it('tool_use → ad(ilk-arg) özeti; düz-metin satır olduğu-gibi; bozuk-JSON olduğu-gibi', () => {
    const tool = JSON.stringify({ type: 'tool', content: { type: 'tool_use', name: 'Read', input: { path: 'src/a.ts' } } });
    expect(humanizeLogLine(tool)).toBe('[tool] Read(src/a.ts)');
    expect(humanizeLogLine('[lifecycle] system')).toBe('[lifecycle] system');
    expect(humanizeLogLine('{torn')).toBe('{torn');
  });

  it('uzun-metin 200-cap ile kısalır ve tek-satıra düzleşir', () => {
    const line = JSON.stringify({ type: 'text', content: { text: `${'a'.repeat(300)}\nb` } });
    const out = humanizeLogLine(line);
    expect(out.length).toBeLessThanOrEqual('[text] '.length + 200);
    expect(out).not.toContain('\n');
  });
});

describe('humanizeResult — Sonuç insan-özeti', () => {
  it('bilinen alanları ayıklar (snake/camel toleranslı); string-olmayan file-girişleri path ile', () => {
    const human = humanizeResult({
      selfAssessment: 'DONE', notes: 'hepsi yeşil',
      files_changed: ['a.ts', { path: 'b.ts' }, 42],
      testsPassed: true, coverage: 91, lines_added: 10, lines_removed: 2,
    });
    expect(human).toEqual({
      selfAssessment: 'DONE', notes: 'hepsi yeşil',
      filesChanged: ['a.ts', 'b.ts'], testsPassed: true, coverage: 91,
      linesAdded: 10, linesRemoved: 2,
    });
  });

  it('null/boş → dürüst boş-özet', () => {
    expect(humanizeResult(null)).toEqual({ filesChanged: [] });
  });
});
