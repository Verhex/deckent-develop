import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

function parseDockerignore(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function expectIgnoredWithoutLaterNegation(
  patterns: readonly string[],
  entries: readonly string[],
): void {
  for (const pattern of patterns) {
    const lastMatchingEntry = entries.findLast(
      (entry) => entry === pattern || entry === `!${pattern}`,
    );
    expect(lastMatchingEntry, `${pattern} must remain ignored`).toBe(pattern);
  }
}

describe('.dockerignore secret exclusions', () => {
  const entries = parseDockerignore(
    readFileSync(join(ROOT, '.dockerignore'), 'utf-8'),
  );

  it('keeps .deck and .deck.* ignored without later negation', () => {
    expectIgnoredWithoutLaterNegation(['.deck', '.deck.*'], entries);
  });

  it('keeps the .env secret family ignored without later negation', () => {
    expectIgnoredWithoutLaterNegation(
      ['.env', '.env.local', '.env.*.local'],
      entries,
    );
  });

  it('keeps Dockerfile.worker COPY sources independent of .deck', () => {
    const dockerfile = readFileSync(join(ROOT, 'Dockerfile.worker'), 'utf-8');
    expect(dockerfile).not.toContain('.deck');
  });
});
