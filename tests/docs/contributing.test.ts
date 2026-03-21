import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC_PATH = join(process.cwd(), 'CONTRIBUTING.md');

describe('CONTRIBUTING.md', () => {
  const content = readFileSync(DOC_PATH, 'utf-8');

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(500);
  });

  it('contains Getting Started section', () => {
    expect(content).toContain('## Getting Started');
  });

  it('contains Development Setup section', () => {
    expect(content).toContain('## Development Setup');
    expect(content).toContain('npm install');
    expect(content).toContain('npm test');
  });

  it('contains Running Tests section', () => {
    expect(content).toContain('## Testing Guide');
    expect(content).toContain('vitest');
    expect(content).toContain('npm test');
    expect(content).toContain('npm run test:coverage');
  });

  it('contains Architecture Overview (project structure)', () => {
    expect(content).toContain('## Project Structure');
    expect(content).toContain('src/core');
    expect(content).toContain('src/orchestra');
    expect(content).toContain('src/agents');
    expect(content).toContain('src/monitor');
    expect(content).toContain('src/cli');
  });

  it('contains How to Add CLI Command section', () => {
    expect(content).toContain('## How to Add a CLI Command');
    expect(content).toContain('Commander.js');
    expect(content).toContain('registerMyCommand');
  });

  it('contains How to Add MCP Tool section', () => {
    expect(content).toContain('## MCP Tool and Resource Development');
    expect(content).toContain('Adding a new MCP tool');
    expect(content).toContain('Adding a new MCP resource');
  });

  it('contains How to Create Plugin section', () => {
    expect(content).toContain('## Plugin System Development');
    expect(content).toContain('IPlugin');
    expect(content).toContain('plugin.json');
  });

  it('contains PR Guidelines section', () => {
    expect(content).toContain('## Pull Request Process');
    expect(content).toContain('PR checklist');
  });

  it('contains Code Style section', () => {
    expect(content).toContain('## Code Standards');
    expect(content).toContain('TypeScript');
    expect(content).toContain('strict');
    expect(content).toContain('ESM');
  });

  it('is written in English', () => {
    expect(content).not.toContain('Gereksinimler');
    expect(content).not.toContain('Kurulum');
    // Check headings are in English
    expect(content).toContain('## Getting Started');
    expect(content).toContain('## Development Setup');
  });
});
