/**
 * PCOMP-6 D5 — `\;` serialization leak (dış-analiz kozmetik-bulgusu, kök:
 * extractGoNogoCriteria DIRECTIVES-yazıcısının escape'ini geri açmıyordu;
 * 28/31 korpus-prompt'una `mevcut\;` sınıfı artefakt sızdı).
 */
import { describe, it, expect } from 'vitest';
import { extractGoNogoCriteria } from '../../src/orchestra/sprint-utils.js';

describe('extractGoNogoCriteria — DIRECTIVES escape round-trip (D5)', () => {
  it('unescapes writer-escaped semicolons in GO/NOGO lines', () => {
    const desc = [
      'işin tarifi',
      '- goCriteria: birinci kural\; ikinci kural korunmuş\; üçüncü',
      '- nogo: kötü şey\; daha kötü',
    ].join('\n');
    const r = extractGoNogoCriteria(desc);
    expect(r.goCriteria).not.toContain('\\;');
    expect(r.goCriteria).toContain('ikinci kural korunmuş');
    expect(r.noGoCriteria).not.toContain('\\;');
  });

  it('plain lines without escapes are unchanged', () => {
    const r = extractGoNogoCriteria('- goCriteria: tek düz kural');
    expect(r.goCriteria).toContain('tek düz kural');
  });
});
