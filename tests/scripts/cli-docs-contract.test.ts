import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cliContracts } from '../../src/core/cli-command-contract.js';
import { collectCliDocGenerations } from '../../scripts/generate-cli-docs.js';

describe('CLI docs production wiring', () => {
  it('has one CLI docs producer and no source-description regex fallback', () => {
    const canonical = readFileSync(join(process.cwd(), 'scripts/generate-cli-docs.ts'), 'utf8');
    const general = readFileSync(join(process.cwd(), 'scripts/gen-reference-docs.mjs'), 'utf8');
    expect(canonical).toContain("from '../src/core/cli-command-contract.js'");
    expect(canonical).toContain('buildProgram');
    expect(canonical).not.toContain('CLI_COMMANDS: CliCommand[] = [');
    expect(general).not.toContain('parseCliCommands');
    expect(general).not.toContain('renderCliCommands');
    expect(general).not.toContain("target: `${locale.dir}/cli.md`");
  });

  it('keeps docs, manifest, and canonical path counts closed', () => {
    const generations = collectCliDocGenerations(process.cwd());
    const publicCount = cliContracts().filter((contract) => !contract.hidden).length;
    expect(generations[0]?.count).toBe(publicCount);
    expect(generations[1]?.count).toBe(publicCount);
    expect(generations[2]?.count).toBe(cliContracts().length);
    expect(generations.every((generation) => !generation.drift)).toBe(true);
  });
});
