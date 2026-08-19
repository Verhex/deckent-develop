import { describe, expect, it } from 'vitest';

import { projectSlug } from '../../src/core/project-slug.js';

describe('projectSlug', () => {
  it.each([
    ['/workspace', '-workspace'],
    ['/Users/foo/my-project', '-Users-foo-my-project'],
    ['C:\\Users\\Al Peren\\deckent', 'C--Users-Al-Peren-deckent'],
    ['/work//nested_repo.v2', '-work--nested-repo-v2'],
    ['alreadyASCII123', 'alreadyASCII123'],
  ])('matches Claude Code parity for %s', (input, expected) => {
    expect(projectSlug(input)).toBe(expected);
  });
});
