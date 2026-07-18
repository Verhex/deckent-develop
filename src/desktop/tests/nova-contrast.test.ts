// P19 — NOVA-sahne ETKİN-kontrast kapısı: opaklık DAHİL gerçek görünen
// kontrast (alpha-composite → WCAG). Değerler styles.css'ten regex ile
// çekilir ve WATCHES.nova + PRIMITIVES üzerinden hex'e çözülür — CSS'te
// sessiz bir soluklaşma bu testi kırar (amaç tam olarak bu).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compositeOver, contrastRatio, PRIMITIVES, WATCHES } from '../src/shared/theme-tokens.js';

const css = readFileSync(new URL('../src/renderer/styles.css', import.meta.url), 'utf-8');

function novaHex(semantic: keyof typeof WATCHES.nova): string {
  return PRIMITIVES[WATCHES.nova[semantic]];
}

function extract(re: RegExp, label: string): string {
  const match = css.match(re);
  if (!match?.[1]) throw new Error(`styles.css içinde bulunamadı: ${label} (${re})`);
  return match[1];
}

describe('compositeOver — alpha-composite birimleri', () => {
  it('alpha 1 → fg, alpha 0 → bg (kimlikler)', () => {
    expect(compositeOver('#D7E7EE', '#04080D', 1)).toBe('#d7e7ee');
    expect(compositeOver('#D7E7EE', '#04080D', 0)).toBe('#04080d');
  });

  it('kısaltma-hex desteklenir ve aralık-dışı alpha kıskaçlanır', () => {
    expect(compositeOver('#fff', '#000', 0.5)).toBe('#808080');
    expect(compositeOver('#fff', '#000', 2)).toBe('#ffffff');
    expect(compositeOver('#fff', '#000', -1)).toBe('#000000');
  });
});

describe('NOVA-sahne etkin-kontrast tabanları (styles.css ← gerçek değerler)', () => {
  const bg = novaHex('bg');
  const breatheMin = Number(extract(/@keyframes nova-breathe \{ 0%,100%\{opacity:(\.?\d*\.?\d+);\}/, 'nova-breathe min-opacity'));
  const riverTxtOpacity = Number(extract(/\.nova-river__txt \{[^}]*opacity:(\.?\d*\.?\d+)/, 'nova-river__txt opacity'));
  const idleSemantic = extract(/\.nova-scene__idle \{[^}]*?color:var\(--dk-s-([a-z-]+)\)/, 'nova-scene__idle color');

  it('nehir-metni: etkin kontrast ≥ 4.5:1 (gövde-metin AA)', () => {
    const effective = compositeOver(novaHex('text'), bg, riverTxtOpacity);
    expect(contrastRatio(effective, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('nehir kaynak-kolonu (muted, tam-opak): ≥ 4.5:1', () => {
    expect(contrastRatio(novaHex('text-muted'), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('idle-satırı nefes-MİNİMUMUNDA bile ≥ 3:1 (P19 «yazılar belirgin değil» kapısı)', () => {
    const idleHex = novaHex(idleSemantic as keyof typeof WATCHES.nova);
    const effective = compositeOver(idleHex, bg, breatheMin);
    expect(contrastRatio(effective, bg)).toBeGreaterThanOrEqual(3);
  });

  it('nefes-animasyonu 0.2 opaklık-eşiğinin altına inmez (süzülme-yasağı)', () => {
    expect(breatheMin).toBeGreaterThanOrEqual(0.2);
  });
});
