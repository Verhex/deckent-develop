/**
 * Gitignore Invariant Tests
 *
 * Ensures that runtime-generated files in .deckent/ are NOT tracked by git.
 * These tests serve as a sprint health gate — if any of these paths become
 * git-tracked, it pollutes the repository with generated artifacts.
 *
 * This invariant must hold for both dev-deckent and user projects.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

function getTrackedFiles(): string[] {
  try {
    const output = execSync('git ls-files .deckent/', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

describe('gitignore invariant — .deckent/ runtime files must not be tracked', () => {
  const trackedFiles = getTrackedFiles();

  it('.deckent/cache/ files are not git-tracked', () => {
    const cacheFiles = trackedFiles.filter(f => f.startsWith('.deckent/cache/'));
    expect(cacheFiles).toEqual([]);
  });

  it('.deckent/sprint-*-events.jsonl files are not git-tracked', () => {
    const eventFiles = trackedFiles.filter(f => /\.deckent\/sprint-.*-events\.jsonl$/.test(f));
    expect(eventFiles).toEqual([]);
  });

  it('.deckent/sprint-*-seq counter files are not git-tracked', () => {
    const seqFiles = trackedFiles.filter(f => /\.deckent\/sprint-.*-seq$/.test(f));
    expect(seqFiles).toEqual([]);
  });

  it('.deckent/sprint-*-checkpoint.json files are not git-tracked', () => {
    const checkpointFiles = trackedFiles.filter(f => /\.deckent\/sprint-.*-checkpoint\.json$/.test(f));
    expect(checkpointFiles).toEqual([]);
  });

  it('.deckent/metrics.jsonl is not git-tracked', () => {
    const metricsFiles = trackedFiles.filter(f => f === '.deckent/metrics.jsonl');
    expect(metricsFiles).toEqual([]);
  });

  it('.deckent/jobs/ files are not git-tracked', () => {
    const jobFiles = trackedFiles.filter(f => f.startsWith('.deckent/jobs/'));
    expect(jobFiles).toEqual([]);
  });

  it('.deckent/sprint-*-ipc/ files are not git-tracked', () => {
    const ipcFiles = trackedFiles.filter(f => /\.deckent\/sprint-.*-ipc\//.test(f));
    expect(ipcFiles).toEqual([]);
  });
});
