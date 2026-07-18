// P16 — nehir insan-projeksiyonu pinleri (Alperen'in canlı-448 örnekleri birebir).
import { describe, it, expect } from 'vitest';
import { projectRiverLine, stripToProse } from '../src/renderer/nova/river-projection.js';

const L = { tool: 'araç' };

describe('projectRiverLine — gürültü düşer, anlatı akar', () => {
  it('canlı-448 gürültü-sınıfları DÜŞER: usage · lifecycle · tool_result · boş-text', () => {
    expect(projectRiverLine('[usage] in:7942 out:18266', L)).toEqual({ kind: 'drop' });
    expect(projectRiverLine('[lifecycle] system', L)).toEqual({ kind: 'drop' });
    expect(projectRiverLine('[tool_result] {"type":"user","message":{...}}', L)).toEqual({ kind: 'drop' });
    expect(projectRiverLine('[text] (empty)', L)).toEqual({ kind: 'drop' });
    expect(projectRiverLine('[text]', L)).toEqual({ kind: 'drop' });
  });

  it('tool_use → yerelleştirilmiş fiil-satırı (ad + ilk-arg kısaltılmış)', () => {
    const line = projectRiverLine('[tool_use] Bash {"command":"node -e \\"const fs = require(\'fs\');\\""}', L);
    expect(line.kind).toBe('line');
    expect((line as { text: string }).text.startsWith('araç: Bash · node -e')).toBe(true);
    expect(projectRiverLine('[tool_use] Read {"path":"src/core/x.ts"}', L))
      .toEqual({ kind: 'line', text: 'araç: Read · src/core/x.ts' });
    expect(projectRiverLine('[tool_use] Glob', L)).toEqual({ kind: 'line', text: 'araç: Glob' });
  });

  it('markdown-duvarı text → tek-nefes düz-yazı (canlı-448 özet-duvarı sınıfı)', () => {
    const wall = '[text] Task 448-001 complete. Summary: **Finding:** The debt this task inherited was a previous worker\'s inability to confirm whether their fix to `src/core/persona-guidance.ts` (an interleaved-marker bug) was actually the cause…';
    const out = projectRiverLine(wall, L);
    expect(out.kind).toBe('line');
    const text = (out as { text: string }).text;
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
    expect(text.length).toBeLessThanOrEqual(161);
    expect(text.endsWith('…')).toBe(true);
    expect(text).toContain('Task 448-001 complete');
  });

  it('öneksiz düz-satır aynen (soyulmuş) akar; boş → düşer', () => {
    expect(projectRiverLine('  plain progress line  ', L)).toEqual({ kind: 'line', text: 'plain progress line' });
    expect(projectRiverLine('   ', L)).toEqual({ kind: 'drop' });
  });
});

describe('stripToProse', () => {
  it('kod-bloğu/başlık/madde-imi gider; kelime-sınırında kırpar', () => {
    expect(stripToProse('# Başlık\n- madde bir\n```js\nkod()\n```\nkalan **vurgu** son')).toBe('Başlık madde bir kalan vurgu son');
    const long = stripToProse('kelime '.repeat(60), 40);
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long.endsWith('…')).toBe(true);
    expect(long).not.toMatch(/kelim…$/); // kelime-ortasından kırpmaz
  });
});
