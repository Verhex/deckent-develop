/**
 * Worker no-self-count — Worker Output Contract §1.1 (Task 326-005)
 *
 * The worker must NOT self-author token counts. Under the Worker Output
 * Contract, `tokenUsage` is captured authoritatively by the orchestrator via
 * the provider adapter (`extractUsage()`), with a tokenizer fallback — never a
 * worker-emitted `0/0` placeholder. The worker contributes only the subjective
 * block (`selfAssessment`, `goCriteria`, `notes`).
 *
 * These assertions are *faithful*: against the pre-fix worker (which shipped
 * `defaultTokenUsageStub` returning a zeroed tokenUsage) each fails RED; they
 * pass GREEN only once the self-count placeholder is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as workerModule from '../../src/agents/worker.js';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const WORKER_SRC_PATH = join(TEST_DIR, '..', '..', 'src', 'agents', 'worker.ts');
// Read once at import time (aligned with the worker module import above).
const WORKER_SOURCE = readFileSync(WORKER_SRC_PATH, 'utf-8');

describe('worker no-self-count (Worker Output Contract §1.1)', () => {
  it('no longer exports the defaultTokenUsageStub self-count helper', () => {
    // Pre-fix: `defaultTokenUsageStub` was an exported function -> defined -> RED.
    const exported = (workerModule as Record<string, unknown>).defaultTokenUsageStub;
    expect(exported).toBeUndefined();
  });

  it('worker.ts code carries no self-authored `inputTokens: 0` placeholder', () => {
    // Directly encodes the goNogo: the worker-raw-result path must not contain a
    // 0/0 tokenUsage. Scan *code only* (comments documenting the removed stub
    // are fine) so the assertion tracks real emission, not prose. Pre-fix the
    // code line `inputTokens: 0,` was present -> RED; after removal -> GREEN.
    const codeOnly = WORKER_SOURCE
      .replace(/\/\*[\s\S]*?\*\//g, '') // strip block comments
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '')) // strip line comments
      .join('\n');
    expect(codeOnly).not.toMatch(/inputTokens:\s*0\b/);
  });
});
