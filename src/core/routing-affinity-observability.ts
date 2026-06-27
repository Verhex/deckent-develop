// ─── Routing Affinity Observability ─────────────────────────────────────────
// ADR-075 / DESIGN-ADR-075-AFFINITY-REORDER §"Routing-balance gate".
//
// Pure, dependency-free instrumentation for the skill→agent affinity signal.
// Records which agent each task was routed to and whether the affinity bonus
// influenced that choice, then summarizes the per-sprint agent distribution so
// the `feedback_agent_routing_imbalance` "balance gate" can be measured BEFORE
// the affinity flag is ever flipped on by default (enabling affinity could
// itself introduce a different skew — measure first, default-on later).
//
// Non-blocking by contract: recordAgentSelection NEVER throws — a broken sink
// must never break routing/planning. This module only observes; it never
// changes a routing decision.

/** One agent-selection observation. */
export interface AgentSelectionRecord {
  /** Task the decision was made for. */
  readonly taskId: string;
  /** Agent the router selected ('generic' when no agent met threshold). */
  readonly agentId: string;
  /** True when the skill→agent affinity bonus influenced this selection. */
  readonly affinityApplied: boolean;
}

/**
 * A sink that accumulates agent-selection records. Implementations may persist
 * however they like (memory, JSONL, …); recordAgentSelection guards against
 * any throw regardless, so an implementation need not be defensive itself.
 */
export interface AgentSelectionSink {
  append(record: AgentSelectionRecord): void;
}

/**
 * In-memory sink — the default for per-sprint accumulation. Preserves insertion
 * order; summarizeAgentDistribution imposes its own deterministic ordering so
 * the snapshot never depends on insertion order.
 */
export class InMemoryAgentSelectionSink implements AgentSelectionSink {
  private readonly _records: AgentSelectionRecord[] = [];

  append(record: AgentSelectionRecord): void {
    this._records.push(record);
  }

  /** Read-only view of accumulated records (insertion order preserved). */
  get records(): readonly AgentSelectionRecord[] {
    return this._records;
  }
}

/**
 * Record one agent selection into a sink. NEVER throws: any sink failure is
 * swallowed so observability can never break the routing/planning path
 * (the affinity feature is default-off and this is pure instrumentation).
 */
export function recordAgentSelection(
  sink: AgentSelectionSink,
  record: AgentSelectionRecord,
): void {
  try {
    sink.append(record);
  } catch {
    // Best-effort observability — a broken sink must not break routing.
  }
}

/** Per-agent slice of the distribution snapshot. */
export interface AgentDistributionEntry {
  readonly agentId: string;
  readonly count: number;
  /** Share of total selections, 0..1 (count / total). */
  readonly share: number;
}

/** Deterministic snapshot of an agent-selection distribution. */
export interface AgentDistributionSnapshot {
  /** Total number of records observed. */
  readonly total: number;
  /** Number of selections the affinity bonus influenced. */
  readonly affinityInfluenced: number;
  /** Share of total influenced by affinity, 0..1 (0 when total is 0). */
  readonly affinityInfluencedShare: number;
  /** Per-agent entries, sorted by count desc then agentId asc (deterministic). */
  readonly agents: readonly AgentDistributionEntry[];
}

/**
 * Summarize a record set into a deterministic agent-distribution snapshot.
 *
 * Pure: same input → byte-identical output. Agents are sorted by count
 * descending, ties broken by agentId ascending, so the ordering never depends
 * on record insertion order or Map enumeration quirks — exactly what the
 * routing-balance gate needs to compare distributions across sprints.
 */
export function summarizeAgentDistribution(
  records: readonly AgentSelectionRecord[],
): AgentDistributionSnapshot {
  const total = records.length;
  const counts = new Map<string, number>();
  let affinityInfluenced = 0;

  for (const r of records) {
    counts.set(r.agentId, (counts.get(r.agentId) ?? 0) + 1);
    if (r.affinityApplied) affinityInfluenced++;
  }

  const agents: AgentDistributionEntry[] = [...counts.entries()]
    .map(([agentId, count]) => ({
      agentId,
      count,
      share: total > 0 ? count / total : 0,
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0),
    );

  return {
    total,
    affinityInfluenced,
    affinityInfluencedShare: total > 0 ? affinityInfluenced / total : 0,
    agents,
  };
}
