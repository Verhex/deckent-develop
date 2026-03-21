// ─── Prompt Evolution Log ───────────────────────────────────────────────────
// Records and retrieves prompt evolution history for agents.
// Stored in .deckent/agents/{id}/evolution.json.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export type EvolutionType = 'created' | 'improved' | 'reverted' | 'specialized' | 'merged';

export interface StatsAtTime {
  successRate: number;
  totalUses: number;
  avgCoverage: number;
}

export interface EvolutionEvent {
  type: EvolutionType;
  version: string;
  timestamp: string;
  triggerReason: string;
  statsAtTime: StatsAtTime;
}

export interface EvolutionTimeline {
  agentId: string;
  events: EvolutionEvent[];
  totalEvolutions: number;
  latestVersion: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const AGENTS_DIR = '.deckent/agents';
const EVOLUTION_FILENAME = 'evolution.json';

// ─── PromptEvolutionLog ─────────────────────────────────────────────

export class PromptEvolutionLog {
  constructor(private projectRoot: string) {}

  /**
   * Record an evolution event for an agent.
   */
  recordEvolution(agentId: string, event: EvolutionEvent): void {
    const events = this._loadEvents(agentId);
    events.push(event);
    this._saveEvents(agentId, events);
  }

  /**
   * Get the full evolution timeline for an agent.
   */
  getEvolutionTimeline(agentId: string): EvolutionTimeline {
    const events = this._loadEvents(agentId);

    const lastEvent = events[events.length - 1];
    const latestVersion = lastEvent !== undefined
      ? lastEvent.version
      : '0.0.0';

    return {
      agentId,
      events,
      totalEvolutions: events.length,
      latestVersion,
    };
  }

  /**
   * Format a timeline into a human-readable string.
   */
  formatTimeline(timeline: EvolutionTimeline): string {
    if (timeline.events.length === 0) {
      return `Agent "${timeline.agentId}": No evolution events recorded.`;
    }

    const lines: string[] = [
      `Agent "${timeline.agentId}" Evolution Timeline (${timeline.totalEvolutions} events):`,
      `Latest version: ${timeline.latestVersion}`,
      '',
    ];

    for (const event of timeline.events) {
      const date = event.timestamp.split('T')[0] ?? event.timestamp;
      const stats = `success=${(event.statsAtTime.successRate * 100).toFixed(0)}%, uses=${event.statsAtTime.totalUses}, cov=${event.statsAtTime.avgCoverage.toFixed(0)}%`;
      lines.push(`  [${event.version}] ${event.type.toUpperCase()} - ${event.triggerReason} (${date}) [${stats}]`);
    }

    return lines.join('\n');
  }

  /**
   * Get the count of evolution events for an agent.
   */
  getEventCount(agentId: string): number {
    return this._loadEvents(agentId).length;
  }

  /**
   * Clear all evolution events for an agent.
   */
  clearEvents(agentId: string): void {
    this._saveEvents(agentId, []);
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  _loadEvents(agentId: string): EvolutionEvent[] {
    const filePath = path.join(this.projectRoot, AGENTS_DIR, agentId, EVOLUTION_FILENAME);
    if (!fs.existsSync(filePath)) return [];

    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(raw)) return [];
      return raw as EvolutionEvent[];
    } catch {
      return [];
    }
  }

  _saveEvents(agentId: string, events: EvolutionEvent[]): void {
    const agentDir = path.join(this.projectRoot, AGENTS_DIR, agentId);
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, EVOLUTION_FILENAME),
      JSON.stringify(events, null, 2) + '\n',
      'utf8',
    );
  }
}
