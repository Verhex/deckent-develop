import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DECKENT_DIR } from '../../../core/constants.js';
import type { MissionEvent } from './mission-types.js';

/** Ephemeral hot-path event log: one append-only jsonl per mission; reset = unlink. */
export class MissionEventLog {
  private dir: string;
  constructor(projectRoot: string) {
    this.dir = join(projectRoot, DECKENT_DIR, 'autonomous', 'events');
  }
  private file(missionId: string): string { return join(this.dir, `${missionId}.jsonl`); }

  append(missionId: string, ev: MissionEvent): void {
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(this.file(missionId), JSON.stringify(ev) + '\n', 'utf-8');
  }

  readTail(missionId: string, max = 200): MissionEvent[] {
    const f = this.file(missionId);
    if (!existsSync(f)) return [];
    const lines = readFileSync(f, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    const slice = max > 0 ? lines.slice(-max) : lines;
    return slice.map(l => { try { return JSON.parse(l) as MissionEvent; } catch { return null; } }).filter(Boolean) as MissionEvent[];
  }

  reset(missionId: string): void {
    try { unlinkSync(this.file(missionId)); } catch { /* already gone — ephemeral, loss-tolerant */ }
  }
}
