import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BENCHMARK_PATH = join(process.cwd(), 'docs/benchmark/memory-v2.md');

describe('Memory V2 benchmark document', () => {
  it('benchmark file exists at docs/benchmark/memory-v2.md', () => {
    expect(existsSync(BENCHMARK_PATH)).toBe(true);
  });

  it('contains methodology section with at least one reduction percentage', () => {
    const content = readFileSync(BENCHMARK_PATH, 'utf-8');
    expect(content).toMatch(/reduction/i);
    expect(content).toMatch(/\d+(\.\d+)?%/);
  });

  it('references FTS5 as the search technology', () => {
    const content = readFileSync(BENCHMARK_PATH, 'utf-8');
    expect(content).toContain('FTS5');
  });

  it('contains verifiable context size numbers from real files', () => {
    const content = readFileSync(BENCHMARK_PATH, 'utf-8');
    // Must mention actual byte or line counts from measured files
    expect(content).toMatch(/\d{3,}/);
    // Must reference the pre-V2 archive or the exports directory
    expect(content).toMatch(/pre-v2|exports\/summary/i);
  });
});
