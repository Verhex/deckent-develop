import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { ensureDeckentImport } from '../../src/core/utils.js';

describe('ensureDeckentImport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates file with @DECKENT.md when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    ensureDeckentImport('/tmp/project/CLAUDE.md');

    expect(writeFileSync).toHaveBeenCalledWith('/tmp/project/CLAUDE.md', '@DECKENT.md\n');
  });

  it('prepends @DECKENT.md when file exists without reference', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# My Project\n\nExisting content\n');

    ensureDeckentImport('/tmp/project/CLAUDE.md');

    expect(writeFileSync).toHaveBeenCalledWith(
      '/tmp/project/CLAUDE.md',
      '@DECKENT.md\n\n# My Project\n\nExisting content\n',
    );
  });

  it('does nothing when file already contains @DECKENT.md (idempotent)', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('@DECKENT.md\n\n# My Project\n');

    ensureDeckentImport('/tmp/project/CLAUDE.md');

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('is idempotent — calling twice does not duplicate reference', () => {
    // First call: file exists without reference
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('# Project\n');

    ensureDeckentImport('/tmp/project/CLAUDE.md');

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const writtenContent = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    expect(writtenContent).toBe('@DECKENT.md\n\n# Project\n');

    // Second call: file now has the reference
    vi.mocked(readFileSync).mockReturnValue(writtenContent);
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(writtenContent);

    ensureDeckentImport('/tmp/project/CLAUDE.md');

    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('preserves existing content when prepending', () => {
    const existingContent = '## Rules\n@DIRECTIVES.md\n@.brain/MEMORY.md\n\n## Commands\nBuild: tsc\n';
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(existingContent);

    ensureDeckentImport('/tmp/project/AGENTS.md');

    const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string;
    expect(written).toContain(existingContent);
    expect(written.startsWith('@DECKENT.md\n\n')).toBe(true);
  });

  it('handles empty existing file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('');

    ensureDeckentImport('/tmp/project/CLAUDE.md');

    expect(writeFileSync).toHaveBeenCalledWith('/tmp/project/CLAUDE.md', '@DECKENT.md\n\n');
  });

  it('detects partial match — @DECKENT.md inside other text', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('See @DECKENT.md for details\n');

    ensureDeckentImport('/tmp/project/CLAUDE.md');

    // Already contains @DECKENT.md, should not write
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('works with AGENTS.md path', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    ensureDeckentImport('/tmp/project/AGENTS.md');

    expect(writeFileSync).toHaveBeenCalledWith('/tmp/project/AGENTS.md', '@DECKENT.md\n');
  });
});
