import type { Task } from './types.js';

export const EXECUTION_TOPOLOGY_SCHEMA_VERSION = 1 as const;

export type ExecutionTopologyFindingCode =
  | 'duplicate-task-id'
  | 'invalid-writer-path'
  | 'unresolved-dependency'
  | 'self-dependency'
  | 'dependency-cycle'
  | 'undeclared-writer-collision';

export interface ExecutionTopologyFinding {
  readonly code: ExecutionTopologyFindingCode;
  readonly severity: 'block';
  readonly slots: readonly number[];
  readonly path?: string;
  readonly ref?: string;
}

export interface ExecutionTopologyEdge {
  /** The prerequisite plan slot. */
  readonly from: number;
  /** The dependent plan slot. */
  readonly to: number;
  readonly source: 'authored' | 'collision';
  readonly paths?: readonly string[];
}

export interface ExecutionTopologyCollision {
  /** Portable, display-safe lexical path (NFC, slash-separated, relative). */
  readonly path: string;
  /** Conservative portable collision key. */
  readonly key: string;
  readonly writerSlots: readonly number[];
  /** True only when authored dependency reachability totally orders the writers. */
  readonly declared: boolean;
}

export interface ExecutionTopologyWave {
  readonly wave: number;
  readonly slots: readonly number[];
}

export interface ExecutionTopology {
  readonly schemaVersion: typeof EXECUTION_TOPOLOGY_SCHEMA_VERSION;
  readonly configuredMaxWorkers: number;
  readonly effectiveConcurrency: number;
  readonly taskSlots: readonly number[];
  readonly collisions: readonly ExecutionTopologyCollision[];
  readonly authoredEdges: readonly ExecutionTopologyEdge[];
  readonly syntheticEdges: readonly ExecutionTopologyEdge[];
  readonly effectiveEdges: readonly ExecutionTopologyEdge[];
  readonly waves: readonly ExecutionTopologyWave[];
  readonly findings: readonly ExecutionTopologyFinding[];
  readonly verdict: 'pass' | 'block';
}

export type PortableWriterPathResult =
  | { readonly ok: true; readonly path: string; readonly collisionKey: string }
  | { readonly ok: false };

function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareNumber(a: number, b: number): number {
  return a - b;
}

function edgeKey(from: number, to: number): string {
  return `${from}:${to}`;
}

/**
 * Normalize an exact writer declaration without consulting the host
 * filesystem. The collision key is intentionally case-folded so a plan that
 * is safe on a case-sensitive host cannot become unsafe when replayed on
 * Windows or a default macOS filesystem.
 */
export function normalizePortableWriterPath(raw: string): PortableWriterPathResult {
  const input = raw.trim().normalize('NFC').replace(/\\/g, '/');
  if (
    input.length === 0
    || input.startsWith('/')
    || input.startsWith('//')
    || /^[A-Za-z]:($|\/)/.test(input)
  ) {
    return { ok: false };
  }

  const segments: string[] = [];
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return { ok: false };
      segments.pop();
      continue;
    }
    // NUL is invalid on every supported target. ':' is rejected to prevent a
    // relative-looking Windows drive/device path from changing meaning later.
    if (segment.includes('\0') || segment.includes(':')) return { ok: false };
    segments.push(segment);
  }
  if (segments.length === 0) return { ok: false };

  const path = segments.join('/');
  return { ok: true, path, collisionKey: path.toLowerCase() };
}

function resolveDependencySlots(tasks: readonly Task[]): {
  readonly edges: ExecutionTopologyEdge[];
  readonly findings: ExecutionTopologyFinding[];
} {
  const idToSlots = new Map<string, number[]>();
  const titleToSlots = new Map<string, number[]>();
  tasks.forEach((task, index) => {
    const slot = index + 1;
    idToSlots.set(task.id, [...(idToSlots.get(task.id) ?? []), slot]);
    titleToSlots.set(task.title, [...(titleToSlots.get(task.title) ?? []), slot]);
  });

  const findings: ExecutionTopologyFinding[] = [];
  for (const slots of idToSlots.values()) {
    if (slots.length > 1) {
      findings.push({ code: 'duplicate-task-id', severity: 'block', slots: [...slots].sort(compareNumber) });
    }
  }

  const seen = new Set<string>();
  const edges: ExecutionTopologyEdge[] = [];
  tasks.forEach((task, index) => {
    const to = index + 1;
    for (const rawRef of task.dependencies ?? []) {
      const ref = rawRef.trim();
      const byId = idToSlots.get(ref);
      const byTitle = titleToSlots.get(ref);
      const candidates = byId?.length === 1 ? byId : byTitle?.length === 1 ? byTitle : undefined;
      const from = candidates?.[0];
      if (from === undefined) {
        findings.push({
          code: 'unresolved-dependency',
          severity: 'block',
          slots: [to],
          ref,
        });
        continue;
      }
      if (from === to) {
        findings.push({ code: 'self-dependency', severity: 'block', slots: [to], ref });
        continue;
      }
      const key = edgeKey(from, to);
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ from, to, source: 'authored' });
      }
    }
  });

  edges.sort((a, b) => compareNumber(a.from, b.from) || compareNumber(a.to, b.to));
  return { edges, findings };
}

function buildReachability(taskCount: number, edges: readonly ExecutionTopologyEdge[]): readonly Set<number>[] {
  const outgoing = Array.from({ length: taskCount + 1 }, () => new Set<number>());
  for (const edge of edges) outgoing[edge.from]!.add(edge.to);

  return Array.from({ length: taskCount + 1 }, (_, slot) => {
    const reached = new Set<number>();
    const queue = [...(outgoing[slot] ?? [])].sort(compareNumber);
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reached.has(current)) continue;
      reached.add(current);
      for (const next of outgoing[current] ?? []) queue.push(next);
    }
    return reached;
  });
}

function topologicalOrder(
  taskCount: number,
  edges: readonly ExecutionTopologyEdge[],
): { readonly order: number[]; readonly cycleSlots: number[] } {
  const incoming = Array.from({ length: taskCount + 1 }, () => 0);
  const outgoing = Array.from({ length: taskCount + 1 }, () => new Set<number>());
  for (const edge of edges) {
    if (!outgoing[edge.from]!.has(edge.to)) {
      outgoing[edge.from]!.add(edge.to);
      incoming[edge.to] = (incoming[edge.to] ?? 0) + 1;
    }
  }

  const ready: number[] = [];
  for (let slot = 1; slot <= taskCount; slot++) if (incoming[slot] === 0) ready.push(slot);
  const order: number[] = [];
  while (ready.length > 0) {
    ready.sort(compareNumber);
    const slot = ready.shift()!;
    order.push(slot);
    for (const dependent of [...outgoing[slot]!].sort(compareNumber)) {
      incoming[dependent]!--;
      if (incoming[dependent] === 0) ready.push(dependent);
    }
  }

  const resolved = new Set(order);
  const cycleSlots = Array.from({ length: taskCount }, (_, index) => index + 1)
    .filter(slot => !resolved.has(slot));
  return { order, cycleSlots };
}

function buildWaves(
  taskCount: number,
  edges: readonly ExecutionTopologyEdge[],
  maxWorkers: number,
): ExecutionTopologyWave[] {
  const incoming = Array.from({ length: taskCount + 1 }, () => 0);
  const outgoing = Array.from({ length: taskCount + 1 }, () => new Set<number>());
  for (const edge of edges) {
    if (!outgoing[edge.from]!.has(edge.to)) {
      outgoing[edge.from]!.add(edge.to);
      incoming[edge.to] = (incoming[edge.to] ?? 0) + 1;
    }
  }

  const resolved = new Set<number>();
  const waves: ExecutionTopologyWave[] = [];
  while (resolved.size < taskCount) {
    const ready: number[] = [];
    for (let slot = 1; slot <= taskCount; slot++) {
      if (!resolved.has(slot) && incoming[slot] === 0) ready.push(slot);
    }
    if (ready.length === 0) break;
    ready.sort(compareNumber);
    for (let offset = 0; offset < ready.length; offset += maxWorkers) {
      const slots = ready.slice(offset, offset + maxWorkers);
      waves.push({ wave: waves.length + 1, slots });
    }
    for (const slot of ready) {
      resolved.add(slot);
      for (const dependent of outgoing[slot] ?? []) incoming[dependent]!--;
    }
  }
  return waves;
}

export function deriveExecutionTopology(
  tasks: readonly Task[],
  options: { readonly maxWorkers: number },
): ExecutionTopology {
  const configuredMaxWorkers = Number.isFinite(options.maxWorkers)
    ? Math.max(1, Math.floor(options.maxWorkers))
    : 1;
  const dependency = resolveDependencySlots(tasks);
  const findings: ExecutionTopologyFinding[] = [...dependency.findings];
  const authoredReachability = buildReachability(tasks.length, dependency.edges);
  const authoredOrder = topologicalOrder(tasks.length, dependency.edges);
  if (authoredOrder.cycleSlots.length > 0) {
    findings.push({
      code: 'dependency-cycle',
      severity: 'block',
      slots: authoredOrder.cycleSlots,
    });
  }

  const writers = new Map<string, { path: string; slots: Set<number> }>();
  tasks.forEach((task, index) => {
    const slot = index + 1;
    for (const rawPath of task.scope?.filesWrite ?? []) {
      const normalized = normalizePortableWriterPath(rawPath);
      if (!normalized.ok) {
        findings.push({
          code: 'invalid-writer-path',
          severity: 'block',
          slots: [slot],
          path: rawPath,
        });
        continue;
      }
      const current = writers.get(normalized.collisionKey) ?? {
        path: normalized.path,
        slots: new Set<number>(),
      };
      if (compareCodePoint(normalized.path, current.path) < 0) current.path = normalized.path;
      current.slots.add(slot);
      writers.set(normalized.collisionKey, current);
    }
  });

  const orderIndex = new Map(authoredOrder.order.map((slot, index) => [slot, index] as const));
  const syntheticByKey = new Map<string, { from: number; to: number; paths: Set<string> }>();
  const collisions: ExecutionTopologyCollision[] = [];
  for (const [key, entry] of [...writers.entries()].sort((a, b) => compareCodePoint(a[0], b[0]))) {
    if (entry.slots.size < 2) continue;
    const writerSlots = [...entry.slots].sort((a, b) =>
      compareNumber(orderIndex.get(a) ?? a, orderIndex.get(b) ?? b) || compareNumber(a, b));
    let declared = true;
    for (let i = 0; i < writerSlots.length; i++) {
      for (let j = i + 1; j < writerSlots.length; j++) {
        const a = writerSlots[i]!;
        const b = writerSlots[j]!;
        if (!authoredReachability[a]!.has(b) && !authoredReachability[b]!.has(a)) declared = false;
      }
    }
    collisions.push({ path: entry.path, key, writerSlots, declared });
    if (!declared) {
      findings.push({
        code: 'undeclared-writer-collision',
        severity: 'block',
        slots: writerSlots,
        path: entry.path,
      });
    }
    for (let i = 1; i < writerSlots.length; i++) {
      const from = writerSlots[i - 1]!;
      const to = writerSlots[i]!;
      if (authoredReachability[from]!.has(to)) continue;
      const syntheticKey = edgeKey(from, to);
      const current = syntheticByKey.get(syntheticKey) ?? { from, to, paths: new Set<string>() };
      current.paths.add(entry.path);
      syntheticByKey.set(syntheticKey, current);
    }
  }

  const syntheticEdges: ExecutionTopologyEdge[] = [...syntheticByKey.values()]
    .map(edge => ({
      from: edge.from,
      to: edge.to,
      source: 'collision' as const,
      paths: [...edge.paths].sort(compareCodePoint),
    }))
    .sort((a, b) => compareNumber(a.from, b.from) || compareNumber(a.to, b.to));
  const effectiveByKey = new Map<string, ExecutionTopologyEdge>();
  for (const edge of [...dependency.edges, ...syntheticEdges]) {
    const key = edgeKey(edge.from, edge.to);
    const existing = effectiveByKey.get(key);
    if (!existing || existing.source === 'collision') effectiveByKey.set(key, edge);
  }
  const effectiveEdges = [...effectiveByKey.values()]
    .sort((a, b) => compareNumber(a.from, b.from) || compareNumber(a.to, b.to));
  const effectiveOrder = topologicalOrder(tasks.length, effectiveEdges);
  if (effectiveOrder.cycleSlots.length > 0 && authoredOrder.cycleSlots.length === 0) {
    findings.push({
      code: 'dependency-cycle',
      severity: 'block',
      slots: effectiveOrder.cycleSlots,
    });
  }

  // Preserve waves for the acyclic subset so diagnostics can still show
  // independent work; the cycle finding keeps the overall verdict BLOCK.
  const waves = buildWaves(tasks.length, effectiveEdges, configuredMaxWorkers);
  const effectiveConcurrency = waves.reduce((max, wave) => Math.max(max, wave.slots.length), 0);
  findings.sort((a, b) =>
    compareCodePoint(a.code, b.code)
    || compareNumber(a.slots[0] ?? 0, b.slots[0] ?? 0)
    || compareCodePoint(a.path ?? '', b.path ?? '')
    || compareCodePoint(a.ref ?? '', b.ref ?? ''));

  return Object.freeze({
    schemaVersion: EXECUTION_TOPOLOGY_SCHEMA_VERSION,
    configuredMaxWorkers,
    effectiveConcurrency,
    taskSlots: Object.freeze(tasks.map((_, index) => index + 1)),
    collisions: Object.freeze(collisions.map(item => Object.freeze({
      ...item,
      writerSlots: Object.freeze([...item.writerSlots]),
    }))),
    authoredEdges: Object.freeze(dependency.edges.map(edge => Object.freeze({ ...edge }))),
    syntheticEdges: Object.freeze(syntheticEdges.map(edge => Object.freeze({
      ...edge,
      ...(edge.paths ? { paths: Object.freeze([...edge.paths]) } : {}),
    }))),
    effectiveEdges: Object.freeze(effectiveEdges.map(edge => Object.freeze({
      ...edge,
      ...(edge.paths ? { paths: Object.freeze([...edge.paths]) } : {}),
    }))),
    waves: Object.freeze(waves.map(wave => Object.freeze({ ...wave, slots: Object.freeze([...wave.slots]) }))),
    findings: Object.freeze(findings.map(finding => Object.freeze({
      ...finding,
      slots: Object.freeze([...finding.slots]),
    }))),
    verdict: findings.length > 0 ? 'block' : 'pass',
  });
}
