// 589/R1c — NOVA sahne-geometrisi pinleri (saf-çekirdek; prototip-A ürünleşti).
import { describe, it, expect } from 'vitest';
import {
  RING_PHASES, phaseArcFraction, orbitSegments, SEGMENT_GAP,
  pulseOnLine, pulseOnHeartbeat, pulseDecay,
  sparkPosition, hitOrbitIndex, STALE_MS,
} from '../src/renderer/nova/scene-geometry.js';

describe('phaseArcFraction', () => {
  it('halka-fazları sıralı fraksiyon verir; bilinmeyen/boş 0 (yay çizilmez — dürüst)', () => {
    expect(phaseArcFraction('PLAN')).toBeCloseTo(1 / 8);
    expect(phaseArcFraction('EXECUTE')).toBeCloseTo(3 / 8);
    expect(phaseArcFraction('COMPLETE')).toBe(1);
    expect(phaseArcFraction('DIRECTIVE')).toBe(0);
    expect(phaseArcFraction(null)).toBe(0);
    expect(RING_PHASES).toHaveLength(8);
  });
});

describe('orbitSegments', () => {
  it('n worker tam-çembere eşit dağılır; boşluklar nefes bırakır; 0 → []', () => {
    expect(orbitSegments([])).toEqual([]);
    const segs = orbitSegments(['a', 'b', 'c', 'd']);
    expect(segs).toHaveLength(4);
    expect(segs[0]!.a0).toBeCloseTo(-Math.PI / 2 + SEGMENT_GAP);
    // ardışık segmentler çakışmaz
    for (let i = 1; i < segs.length; i++) expect(segs[i]!.a0).toBeGreaterThan(segs[i - 1]!.a1);
    // mid her zaman [a0,a1] içinde
    for (const s of segs) { expect(s.mid).toBeGreaterThan(s.a0); expect(s.mid).toBeLessThan(s.a1); }
  });
});

describe('pulse — impuls + sönüm', () => {
  it('satır-impulsu yükseltir (1-tavan); hb yalnız YENİ sequence ile; sönüm tabana iner', () => {
    let p = { level: 0, lastSeq: -1 };
    p = pulseOnLine(p); expect(p.level).toBeCloseTo(0.35);
    p = pulseOnHeartbeat(p, 5); expect(p.level).toBeCloseTo(0.85); expect(p.lastSeq).toBe(5);
    const same = pulseOnHeartbeat(p, 5); expect(same.level).toBe(p.level); // aynı-seq = impuls yok
    p = pulseOnLine(pulseOnLine(p)); expect(p.level).toBe(1); // tavan
    for (let i = 0; i < 200; i++) p = pulseDecay(p);
    expect(p.level).toBe(0); // taban
  });
});

describe('sparkPosition', () => {
  it('t=0 kaynakta (alpha 1), t=1 hedefte (alpha 0); y kare-eğrisiyle iner; t taşması kelepçeli', () => {
    const s = (t: number) => sparkPosition(100, 50, 300, 450, t);
    expect(s(0)).toEqual({ x: 100, y: 50, alpha: 1 });
    expect(s(1)).toEqual({ x: 300, y: 450, alpha: 0 });
    const mid = s(0.5);
    expect(mid.x).toBe(200);
    expect(mid.y).toBeCloseTo(50 + 400 * 0.25); // kare-eğri: yarıda çeyrek-iniş
    expect(s(2).alpha).toBe(0);
  });
});

describe('hitOrbitIndex', () => {
  it('halka-dışı null; tepe-noktası 0-indeks; çeyrek-dönüşler sıralı segmentlere düşer', () => {
    expect(hitOrbitIndex(0, -120, 4, 100, 160)).toBe(0);   // tepe
    expect(hitOrbitIndex(120, 0, 4, 100, 160)).toBe(1);    // sağ
    expect(hitOrbitIndex(0, 120, 4, 100, 160)).toBe(2);    // alt
    expect(hitOrbitIndex(-120, 0, 4, 100, 160)).toBe(3);   // sol
    expect(hitOrbitIndex(0, -50, 4, 100, 160)).toBeNull(); // iç
    expect(hitOrbitIndex(0, -500, 4, 100, 160)).toBeNull();// dış
    expect(hitOrbitIndex(0, -120, 0, 100, 160)).toBeNull();// worker-yok
  });
});

describe('sabitler', () => {
  it('bayat-eşiği 30sn (segment sarıya döner)', () => {
    expect(STALE_MS).toBe(30_000);
  });
});
