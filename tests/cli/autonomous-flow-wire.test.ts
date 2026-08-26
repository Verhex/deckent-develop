import { describe, it, expect } from 'vitest';
import { makeAutonomousFlowReporter } from '../../src/cli/commands/autonomous.js';
import type { FlowStepRecord } from '../../src/orchestra/autonomous/flow-reporter.js';
import { readFileSync } from "node:fs";

describe('makeAutonomousFlowReporter (live autonomous flow wire)', () => {
  it('routes a step to both the print sink and the audit sink', () => {
    const lines: string[] = [];
    const records: FlowStepRecord[] = [];
    const flow = makeAutonomousFlowReporter('/tmp/does-not-matter', 'en', {
      print: (l) => lines.push(l),
      audit: (r) => records.push(r),
      now: () => 'T',
    });

    flow.step('brain_verdict', 'roles', 'DONE q=95');

    expect(records).toHaveLength(1);
    expect(records[0].step).toBe('brain_verdict');
    expect(records[0].entryId).toBe('roles');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('roles');
  });
});

// WIRE-008: physically merged from tests/cli/flow-wire.test.ts.
{
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
        const { buildProgram } = await import("../../src/cli/index.js");
        const program = buildProgram();
        const flowCmd = program.commands.find(c => c.name() === 'flow');
        expect(flowCmd).toBeDefined();
    });
    it('flow command has subcommands (list and add)', async () => {
        const { buildProgram } = await import("../../src/cli/index.js");
        const program = buildProgram();
        const flowCmd = program.commands.find(c => c.name() === 'flow');
        expect(flowCmd).toBeDefined();
        const subNames = flowCmd!.commands.map(c => c.name());
        expect(subNames).toContain('list');
        expect(subNames).toContain('add');
    });
});
}
