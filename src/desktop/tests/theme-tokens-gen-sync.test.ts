import { describe, expect, it } from 'vitest';
import { COMPONENT_TOKENS, FONT_SETS, PRIMITIVES, WATCHES } from '../src/shared/theme-tokens.js';
import {
  GEN_COMPONENT_TOKENS,
  GEN_FONT_SETS,
  GEN_PRIMITIVES,
  GEN_WATCHES,
} from '../src/shared/generated/theme-tokens.gen.js';

/**
 * DESIGN-SYSTEM-001 eşitlik-kilidi: design/tokens/ kaynağından üretilen
 * theme-tokens.gen.ts, el-yazımı theme-tokens.ts SSOT'uyla bire-bir aynı
 * kalmak zorunda. Slice 2 (wiring) theme-tokens.ts'i gen dosyasını tüketir
 * hale getirene kadar çifte-doğruluk riskini bu test kapatır — ayrıştıkları
 * an CI kırmızıdır ve hangi taraf değiştiyse öbürü bilinçli güncellenir.
 */
describe('design-tokens pipeline ↔ desktop theme SSOT sync', () => {
  it('primitives are identical', () => {
    expect(GEN_PRIMITIVES).toEqual(PRIMITIVES);
  });

  it('watch semantic maps are identical', () => {
    expect(GEN_WATCHES).toEqual(WATCHES);
  });

  it('component token pointers are identical', () => {
    expect(GEN_COMPONENT_TOKENS).toEqual(COMPONENT_TOKENS);
  });

  it('font sets are identical', () => {
    expect(GEN_FONT_SETS).toEqual(FONT_SETS);
  });
});
