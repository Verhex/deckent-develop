import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  nextSequence,
  rotateEventFileIfLarge,
} from '../../src/core/event-stream.js';
import { SprintPhase, SprintStatus, type Sprint } from '../../src/core/types.js';
import { writeSprintState } from '../../src/orchestra/sprint-utils.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-monotonic-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('674-003 append and persistence discipline', () => {
  it('returns distinct values to two competing nextSequence calls', async () => {
    const root = makeRoot();
    const sprintId = 'sprint-674';

    const values = await Promise.all([
      Promise.resolve().then(() => nextSequence(root, sprintId)),
      Promise.resolve().then(() => nextSequence(root, sprintId)),
    ]);

    expect(values.toSorted((left, right) => left - right)).toEqual([1, 2]);
    expect(readFileSync(
      join(root, '.deckent', 'recently-works', `${sprintId}-seq`),
      'utf-8',
    )).toBe('2');
  });

  it('writes a rotation marker and preserves the sequence sidecar', () => {
    const root = makeRoot();
    const base = join(root, '.deckent', 'recently-works', 'sprint-674');
    const eventPath = `${base}-events.jsonl`;
    const seqPath = `${base}-seq`;
    writeFileSync(eventPath, `${JSON.stringify({ sequence: 7, payload: 'old' })}\n`, 'utf-8');
    writeFileSync(`${eventPath}.1`, 'previous rotation', 'utf-8');
    writeFileSync(seqPath, '7', 'utf-8');

    expect(rotateEventFileIfLarge(eventPath, 1)).toBe(true);

    const rows = readFileSync(`${eventPath}.1`, 'utf-8').trim().split('\n');
    const marker = JSON.parse(rows.at(-1) ?? '{}') as {
      channel?: string;
      sequence?: number;
    };
    expect(marker).toMatchObject({ channel: 'EVENT_LOG_ROTATED', sequence: 8 });
    expect(existsSync(seqPath)).toBe(true);
    expect(readFileSync(seqPath, 'utf-8')).toBe('8');
  });

  it('publishes sprint state atomically without leaving a tmp artifact', () => {
    const root = makeRoot();
    const sprint: Sprint = {
      id: 'sprint-674',
      number: 674,
      phase: SprintPhase.EXECUTE,
      status: SprintStatus.ACTIVE,
      tasks: [],
      workers: [],
    };

    writeSprintState(root, sprint);

    const deckentEntries = readdirSync(join(root, '.deckent'));
    expect(deckentEntries.some(entry => entry.startsWith('sprint-state.json.tmp.'))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, '.deckent', 'sprint-state.json'), 'utf-8')))
      .toMatchObject({ sprintId: 'sprint-674', phase: SprintPhase.EXECUTE });
  });
});
