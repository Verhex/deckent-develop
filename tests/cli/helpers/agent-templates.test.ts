import { describe, it, expect } from 'vitest';
import {
  generateAgentsMd,
  generateGeminiMd,
  generateCursorRules,
  appendDeckentSection,
  type ProjectInfo,
} from '../../../src/cli/helpers/agent-templates.js';

const sampleInfo: ProjectInfo = {
  name: 'my-app',
  language: 'TypeScript',
  framework: 'Express',
  commands: { build: 'tsc', test: 'vitest run', lint: 'tsc --noEmit' },
};

describe('generateAgentsMd', () => {
  it('includes project name and stack', () => {
    const result = generateAgentsMd(sampleInfo);
    expect(result).toContain('Project: my-app (TypeScript/Express)');
  });

  it('includes all commands', () => {
    const result = generateAgentsMd(sampleInfo);
    expect(result).toContain('- Build: tsc');
    expect(result).toContain('- Test: vitest run');
    expect(result).toContain('- Lint: tsc --noEmit');
  });

  it('includes AGENTS.md header', () => {
    const result = generateAgentsMd(sampleInfo);
    expect(result).toContain('# AGENTS.md — Deckent Integration');
  });

  it('references DECKENT.md', () => {
    const result = generateAgentsMd(sampleInfo);
    expect(result).toContain('@DECKENT.md');
  });

  it('includes sprint instructions', () => {
    const result = generateAgentsMd(sampleInfo);
    expect(result).toContain('Read DIRECTIVES.md for current sprint goals');
    expect(result).toContain('Report results in .tasks/ directory');
  });
});

describe('generateGeminiMd', () => {
  it('includes project name and stack', () => {
    const result = generateGeminiMd(sampleInfo);
    expect(result).toContain('Project: my-app (TypeScript/Express)');
  });

  it('includes build and test commands', () => {
    const result = generateGeminiMd(sampleInfo);
    expect(result).toContain('- Build: tsc');
    expect(result).toContain('- Test: vitest run');
  });

  it('does not include lint command', () => {
    const result = generateGeminiMd(sampleInfo);
    expect(result).not.toContain('- Lint:');
  });

  it('includes GEMINI.md header', () => {
    const result = generateGeminiMd(sampleInfo);
    expect(result).toContain('# GEMINI.md — Deckent Integration');
  });
});

describe('generateCursorRules', () => {
  it('includes YAML frontmatter', () => {
    const result = generateCursorRules(sampleInfo);
    expect(result).toMatch(/^---\n/);
    expect(result).toContain('globs: **/*');
  });

  it('includes description with project name', () => {
    const result = generateCursorRules(sampleInfo);
    expect(result).toContain('description: Deckent AI Agent Orchestrator rules for my-app');
  });

  it('includes project name and stack', () => {
    const result = generateCursorRules(sampleInfo);
    expect(result).toContain('Project: my-app (TypeScript/Express)');
  });

  it('references DECKENT.md', () => {
    const result = generateCursorRules(sampleInfo);
    expect(result).toContain('@DECKENT.md');
  });
});

describe('appendDeckentSection', () => {
  it('appends section to content without Deckent marker', () => {
    const existing = '# My Project\nSome content.';
    const section = '# Deckent Integration\nNew rules.';
    const result = appendDeckentSection(existing, section);
    expect(result).toContain('# My Project');
    expect(result).toContain('---');
    expect(result).toContain('# Deckent Integration');
  });

  it('skips if Deckent section already exists', () => {
    const existing = '# My Project\n\n# Deckent Integration\nExisting rules.';
    const section = '# Deckent Integration\nNew rules.';
    const result = appendDeckentSection(existing, section);
    expect(result).toBe(existing);
  });

  it('uses correct separator when appending', () => {
    const existing = 'Some content';
    const section = 'New section';
    const result = appendDeckentSection(existing, section);
    expect(result).toBe('Some content\n\n---\n\nNew section');
  });

  it('handles empty existing content', () => {
    const result = appendDeckentSection('', '# Deckent Integration\nRules.');
    expect(result).toContain('# Deckent Integration');
  });
});
