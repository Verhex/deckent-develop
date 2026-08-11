import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { describe, expect, it } from 'vitest';

interface IgnoreRule {
  readonly excluded: boolean;
  readonly hasSlash: boolean;
  readonly matcher: RegExp;
}

function globToRegExp(glob: string): RegExp {
  let source = '^';

  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];

    if (character === '*') {
      if (glob[index + 1] === '*') {
        while (glob[index + 1] === '*') index += 1;
        source += glob[index + 1] === '/' ? '(?:.*/)?' : '.*';
        if (glob[index + 1] === '/') index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (character === '?') {
      source += '[^/]';
      continue;
    }

    if (character === '[') {
      const closingBracket = glob.indexOf(']', index + 1);
      if (closingBracket !== -1) {
        const characterClass = glob.slice(index + 1, closingBracket);
        const negated = characterClass.startsWith('!') || characterClass.startsWith('^');
        const body = negated ? characterClass.slice(1) : characterClass;
        source += `[${negated ? '^' : ''}${body.replaceAll('\\', '\\\\')}]`;
        index = closingBracket;
        continue;
      }
    }

    source += character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }

  return new RegExp(`${source}$`);
}

function parseDockerignore(contents: string): readonly IgnoreRule[] {
  const rules: IgnoreRule[] = [];

  for (const rawLine of contents.split(/\r?\n/u)) {
    if (rawLine.startsWith('#')) continue;

    let pattern = rawLine.trim();
    if (pattern === '') continue;

    const excluded = !pattern.startsWith('!');
    if (!excluded) pattern = pattern.slice(1);
    if (pattern === '') continue;

    pattern = posix.normalize(pattern.replaceAll('\\', '/'));
    pattern = pattern.replace(/^\/+|\/+$/gu, '');
    if (pattern === '' || pattern === '.') continue;

    rules.push({
      excluded,
      hasSlash: pattern.includes('/'),
      matcher: globToRegExp(pattern),
    });
  }

  return rules;
}

function isExcluded(path: string, rules: readonly IgnoreRule[]): boolean {
  const normalizedPath = posix.normalize(path.replaceAll('\\', '/')).replace(/^\.\//u, '');
  const segments = normalizedPath.split('/').filter(Boolean);

  // Docker applies a directory match to its descendants. Evaluate every ancestor,
  // while allowing a later negation to re-include a previously excluded candidate.
  for (let length = 1; length <= segments.length; length += 1) {
    const candidate = segments.slice(0, length).join('/');
    let candidateExcluded = false;

    for (const rule of rules) {
      const matches = rule.hasSlash
        ? rule.matcher.test(candidate)
        : rule.matcher.test(segments[length - 1]);
      if (matches) candidateExcluded = rule.excluded;
    }

    if (candidateExcluded) return true;
  }

  return false;
}

describe('Docker build context exclusions', () => {
  it('implements last-match-wins and directory/file matching semantics', () => {
    const rules = parseDockerignore([
      'secrets',
      '!secrets',
      'secrets/*.key',
      '**/generated',
      'cache?',
    ].join('\n'));

    expect(isExcluded('secrets/readme.md', rules)).toBe(false);
    expect(isExcluded('secrets/private.key', rules)).toBe(true);
    expect(isExcluded('packages/app/generated/output.js', rules)).toBe(true);
    expect(isExcluded('nested/cache1/file.txt', rules)).toBe(true);
    expect(isExcluded('nested/cache-long/file.txt', rules)).toBe(false);
  });

  it('keeps Deckent state out while retaining Dockerfile build inputs', () => {
    const rules = parseDockerignore(readFileSync('.dockerignore', 'utf8'));

    const excludedState = [
      '.deck',
      '.deck/config.json',
      '.deck.local',
      '.deck.production/credentials.json',
      '.tasks/task-516-001.json',
      '.deckent/workspace/IDENTITY.md',
      '.brain/memory.db',
    ];
    const requiredBuildInputs = [
      'package.json',
      'package-lock.json',
      'src/cli/index.ts',
      'src/core/config.ts',
    ];

    for (const path of excludedState) {
      expect(isExcluded(path, rules), `${path} must be excluded`).toBe(true);
    }
    for (const path of requiredBuildInputs) {
      expect(isExcluded(path, rules), `${path} must remain in the build context`).toBe(false);
    }
  });
});
