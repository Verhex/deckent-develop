import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { resolve, join } from 'path';

const WORKFLOWS_DIR = resolve('.github/workflows');

// A fail-open install: an `install` invocation whose failure is swallowed by a
// trailing `|| true` (optionally after a stderr/stdout redirect). This turns a
// broken dependency install into a silently green CI step (task 522-013).
const FAIL_OPEN_INSTALL_PATTERN =
  /\binstall\b[^\n|]*(?:2>&1|2>\/dev\/null|>\/dev\/null|1>\/dev\/null)?\s*\|\|\s*true\b/i;

function listWorkflowFiles(): string[] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => join(WORKFLOWS_DIR, f));
}

function findFailOpenInstalls(content: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = [];
  content.split('\n').forEach((line, idx) => {
    if (FAIL_OPEN_INSTALL_PATTERN.test(line)) {
      hits.push({ line: idx + 1, text: line.trim() });
    }
  });
  return hits;
}

describe('workflow install hygiene', () => {
  it('detector fires on a known fail-open pattern (sanity check on the regex itself)', () => {
    const badFixture = '        run: npm install --prefix src/dashboard --ignore-scripts 2>/dev/null || true';
    expect(findFailOpenInstalls(badFixture)).toHaveLength(1);

    const badFixtureNoRedirect = '        run: npm install some-pkg || true';
    expect(findFailOpenInstalls(badFixtureNoRedirect)).toHaveLength(1);

    const goodFixture = '        run: npm install --prefix src/dashboard --ignore-scripts';
    expect(findFailOpenInstalls(goodFixture)).toHaveLength(0);
  });

  it('has at least one workflow file to scan', () => {
    expect(listWorkflowFiles().length).toBeGreaterThan(0);
  });

  for (const file of listWorkflowFiles()) {
    it(`${file.replace(resolve('.'), '.')} has no error-swallowing "install ... || true" steps`, () => {
      const content = readFileSync(file, 'utf-8');
      const hits = findFailOpenInstalls(content);
      if (hits.length > 0) {
        const detail = hits.map((h) => `  line ${h.line}: ${h.text}`).join('\n');
        throw new Error(
          `Found ${hits.length} fail-open install step(s) in ${file} — a failed dependency ` +
            `install must fail the job visibly, not be swallowed by "|| true":\n${detail}`
        );
      }
      expect(hits).toHaveLength(0);
    });
  }
});
