/**
 * 589/R1c — NOVA Komuta-sahnesi SAF-geometrisi (anayasa: Canvas-sahne).
 *
 * CommandScene'in çizim-matematiği burada yaşar: yörünge-segment açıları,
 * faz-yay fraksiyonu, nabız-sönümü, kıvılcım-interpolasyonu, segment-vuruş
 * testi. render'sız + DOM'suz → hermetik-pinli (nova-geometry.test.ts).
 * Prototip-A'nın eli ÜRÜNLEŞİR: aynı dil, test-altında.
 */

/** Sprint-yaşamının sahnedeki halka-sırası (core/sprint-types ile hizalı;
 *  DIRECTIVE/TRANSITION geçici-fazlardır — halkada gösterilmez, gelirse
 *  metin-rozetiyle dürüstçe yazılır). */
export const RING_PHASES = [
  'PLAN', 'SPAWN', 'EXECUTE', 'EVALUATE', 'FIX', 'RETRO', 'DECAY', 'COMPLETE',
] as const;

/** Faz-yayı fraksiyonu [0..1] — bilinmeyen/boş faz 0 döner (yay çizilmez). */
export function phaseArcFraction(phase: string | null): number {
  if (phase === null) return 0;
  const index = (RING_PHASES as readonly string[]).indexOf(phase);
  return index < 0 ? 0 : (index + 1) / RING_PHASES.length;
}

export interface OrbitSegment {
  taskId: string;
  /** Yay başlangıç/bitiş (radyan; -π/2'den, saat-yönü). */
  a0: number;
  a1: number;
  /** Etiket-açısı (yay-ortası). */
  mid: number;
}

/** Segment-arası nefes-boşluğu (radyan). */
export const SEGMENT_GAP = 0.09;

/** n worker'ı tam-çembere eşit-yay dağıt (tepe-başlangıçlı). n=0 → []. */
export function orbitSegments(taskIds: readonly string[]): OrbitSegment[] {
  const n = taskIds.length;
  if (n === 0) return [];
  const out: OrbitSegment[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2 + SEGMENT_GAP;
    const a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2 - SEGMENT_GAP;
    out.push({ taskId: taskIds[i] as string, a0, a1, mid: (a0 + a1) / 2 });
  }
  return out;
}

/** Nabız-durumu: satır/hb-impulsu yükseltir, kare-başına sönüm düşürür. */
export interface PulseState {
  level: number;
  lastSeq: number;
}

export const PULSE_IMPULSE_LINE = 0.35;
export const PULSE_IMPULSE_HB = 0.5;
export const PULSE_DECAY_PER_FRAME = 0.012;

export function pulseOnLine(p: PulseState): PulseState {
  return { ...p, level: Math.min(1, p.level + PULSE_IMPULSE_LINE) };
}

export function pulseOnHeartbeat(p: PulseState, seq: number): PulseState {
  if (seq === p.lastSeq) return p;
  return { level: Math.min(1, p.level + PULSE_IMPULSE_HB), lastSeq: seq };
}

export function pulseDecay(p: PulseState): PulseState {
  return { ...p, level: Math.max(0, p.level - PULSE_DECAY_PER_FRAME) };
}

/** Kıvılcım: segmentten nehir-ağzına süzülen ışık (t∈[0..1]; y kare-eğrisiyle
 *  düşer — doğuşta yatay-savrulma, inişte hız). */
export function sparkPosition(
  sx: number, sy: number, tx: number, ty: number, t: number,
): { x: number; y: number; alpha: number } {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    x: sx + (tx - sx) * clamped,
    y: sy + (ty - sy) * clamped * clamped,
    alpha: 1 - clamped,
  };
}

/** Tık→segment vuruş-testi: (dx,dy) merkez-görecesi; [rInner..rOuter]
 *  halkasında ise segment-indeksi, değilse null. */
export function hitOrbitIndex(
  dx: number, dy: number, count: number, rInner: number, rOuter: number,
): number | null {
  if (count === 0) return null;
  const r = Math.hypot(dx, dy);
  if (r < rInner || r > rOuter) return null;
  const a = (Math.atan2(dy, dx) + Math.PI * 2.5) % (Math.PI * 2);
  return Math.floor((a / (Math.PI * 2)) * count) % count;
}

/** Bayat-eşiği (hb-yaşı): sarı-ışımaya geçiş. */
export const STALE_MS = 30_000;
