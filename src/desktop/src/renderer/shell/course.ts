/**
 * D4-4 — «Rota» signature-interaction geometry (D4-0'ın imza-etkileşimi):
 * a flow's life drawn as a course line on the chart — every durable event is
 * a position fix along a gentle curve, the vessel marker sits at "now"
 * (the latest event). Pure math, framework-free → unit-tested; the Console
 * renders the output as SVG.
 *
 * Honesty rules (D4-0 motion principle "mevki koyma"): only REAL events
 * become fixes — nothing speculative is drawn; a terminal event ends the
 * line (the running-dash animation is CSS, gated on `underway`).
 */
import type { RunFlowEventPayload } from './api-client.js';

export interface CourseFix {
  x: number;
  y: number;
  sequence: number | undefined;
  type: string;
  timestamp: string;
}

export interface CourseGeometry {
  /** SVG path through all fixes (a gentle sinusoidal course, never a ruler line). */
  pathD: string;
  fixes: CourseFix[];
  /** The vessel marker = the LAST fix (absent when there are no events yet). */
  vessel: CourseFix | null;
  /** True while the flow still claims motion (no terminal event seen). */
  underway: boolean;
}

const TERMINAL_EVENT_TYPES = new Set(['RUN_COMPLETED', 'RUN_FAILED', 'FLOW_ABORTED', 'APPROVAL_REJECTED']);

/** Vertical amplitude of the course swell, as a fraction of height. */
const SWELL = 0.22;

/**
 * Lay `events` out as fixes along the strip. X spreads evenly with margins;
 * Y follows a soft alternating swell so the line reads as a course, not a
 * timeline ruler. Deterministic: same events → same geometry.
 */
export function buildCourseGeometry(events: readonly RunFlowEventPayload[], width: number, height: number): CourseGeometry {
  const midY = height / 2;
  if (events.length === 0) {
    return { pathD: '', fixes: [], vessel: null, underway: false };
  }

  const marginX = Math.min(24, width * 0.05);
  const usable = width - marginX * 2;
  const step = events.length > 1 ? usable / (events.length - 1) : 0;

  const fixes: CourseFix[] = events.map((event, index) => {
    const x = events.length === 1 ? marginX : marginX + step * index;
    // alternate above/below the centerline, easing the swell toward the ends
    const phase = Math.sin((index / Math.max(events.length - 1, 1)) * Math.PI);
    const direction = index % 2 === 0 ? -1 : 1;
    const y = midY + direction * phase * height * SWELL;
    return { x, y, sequence: event.sequence, type: event.type, timestamp: event.timestamp };
  });

  let pathD = `M ${fixes[0]!.x} ${fixes[0]!.y}`;
  for (let i = 1; i < fixes.length; i++) {
    const prev = fixes[i - 1]!;
    const next = fixes[i]!;
    const cx = (prev.x + next.x) / 2;
    pathD += ` C ${cx} ${prev.y}, ${cx} ${next.y}, ${next.x} ${next.y}`;
  }

  const lastType = events[events.length - 1]!.type;
  return {
    pathD,
    fixes,
    vessel: fixes[fixes.length - 1] ?? null,
    underway: !TERMINAL_EVENT_TYPES.has(lastType),
  };
}
