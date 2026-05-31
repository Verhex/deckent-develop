import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const INDEX_FILE = 'src/cli/index.ts';
const indexContent = readFileSync(INDEX_FILE, 'utf-8');

describe('flow CLI wire (206-001)', () => {
  it('registerFlow is imported in index.ts', () => {
    expect(indexContent).toMatch(/import\s*\{[^}]*registerFlow[^}]*\}\s*from/);
  });

  it('registerFlow is called with program in index.ts', () => {
    expect(indexContent).toMatch(/registerFlow\s*\(\s*program\s*\)/);
  });

  it('buildProgram registers a flow command', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    const program = buildProgram();
    const flowCmd = program.commands.find(c => c.name() === 'flow');
    expect(flowCmd).toBeDefined();
  });

  it('flow command has subcommands (list and add)', async () => {
    const { buildProgram } = await import('../../src/cli/index.js');
    const program = buildProgram();
    const flowCmd = program.commands.find(c => c.name() === 'flow');
    expect(flowCmd).toBeDefined();
    const subNames = flowCmd!.commands.map(c => c.name());
    expect(subNames).toContain('list');
    expect(subNames).toContain('add');
  });
});
