import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const README_PATH = join(process.cwd(), 'README.md');

describe('README.md', () => {
  const content = readFileSync(README_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(100);
  });

  it('starts with the project name heading', () => {
    expect(content.startsWith('# deckent')).toBe(true);
  });

  it('contains the tagline', () => {
    expect(content).toContain('Your AI development team, orchestrated.');
  });

  it('contains npm badge', () => {
    expect(content).toContain('[![npm version]');
    expect(content).toContain('https://www.npmjs.com/package/deckent');
  });

  it('contains tests badge', () => {
    expect(content).toContain('[![tests]');
  });

  it('contains license badge', () => {
    expect(content).toContain('[![license]');
  });

  it('contains GIF demo placeholder', () => {
    expect(content).toContain('<!-- ![demo](docs/assets/demo.gif) -->');
  });

  it('contains 30-second quickstart section', () => {
    expect(content).toContain('## 30-Second Quickstart');
    expect(content).toContain('npm install -g deckent');
    expect(content).toContain('deckent init');
    expect(content).toContain('deckent start');
  });

  it('contains How It Works section', () => {
    expect(content).toContain('## How It Works');
    expect(content).toContain('Describe');
    expect(content).toContain('Plan');
    expect(content).toContain('Execute');
  });

  it('contains Architecture section with ASCII diagram', () => {
    expect(content).toContain('## Architecture');
    expect(content).toContain('Brain');
    expect(content).toContain('Worker');
    expect(content).toContain('Auditor');
  });

  it('contains Key Features section', () => {
    expect(content).toContain('## Key Features');
    expect(content).toContain('Sprint Lifecycle');
    expect(content).toContain('Multi-Worker Parallel');
    expect(content).toContain('GO / NO-GO Evaluation');
    expect(content).toContain('Provider Agnostic');
  });

  it('contains Comparison table', () => {
    expect(content).toContain('## Comparison');
    expect(content).toContain('Cursor');
    expect(content).toContain('Devin');
    expect(content).toContain('Aider');
    expect(content).toContain('Claude Code (solo)');
  });

  it('contains Requirements section', () => {
    expect(content).toContain('## Requirements');
    expect(content).toContain('Node.js');
    expect(content).toContain('>= 18');
    expect(content).toContain('git');
    expect(content).toContain('Claude Code CLI');
  });

  it('contains CLI Usage section with examples', () => {
    expect(content).toContain('## CLI Usage');
    expect(content).toContain('deckent init');
    expect(content).toContain('deckent start');
    expect(content).toContain('deckent status');
    expect(content).toContain('deckent doctor');
  });

  it('contains MCP Integration section', () => {
    expect(content).toContain('## MCP Integration');
    expect(content).toContain('MCP Tools (10)');
    expect(content).toContain('MCP Resources (5)');
  });

  it('contains Configuration section', () => {
    expect(content).toContain('## Configuration');
    expect(content).toContain('max_plan');
    expect(content).toContain('pro_plan');
  });

  it('contains Contributing link', () => {
    expect(content).toContain('CONTRIBUTING.md');
  });

  it('contains License section', () => {
    expect(content).toContain('## License');
    expect(content).toContain('MIT');
  });

  it('contains links to GitHub and website', () => {
    expect(content).toContain('github.com/VerhexIO/deckent');
    expect(content).toContain('deckent.agency');
  });

  it('is written in English (no Turkish headings)', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Kurulum');
    expect(content).not.toContain('Komutlar');
    expect(content).not.toContain('Lisans');
  });
});
