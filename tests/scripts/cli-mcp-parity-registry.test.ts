import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SURFACE_REGISTRY } from '../../src/cli/surface-registry.js';

const projectRoot = resolve(import.meta.dirname, '..', '..');
const cliDir = join(projectRoot, 'src', 'cli', 'commands');

function scanLegacyCliCommands(): string[] {
  const commands = new Set<string>();
  const files = readdirSync(cliDir).filter((file) => file.endsWith('.ts'));

  for (const file of files) {
    const content = readFileSync(join(cliDir, file), 'utf8');
    const re = /\bprogram\s*\.command\(\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      commands.add(match[1]!.split(/\s+/)[0]!);
    }
  }

  for (const file of files) {
    const content = readFileSync(join(cliDir, file), 'utf8');
    const re = /\bprogram\s*\n\s*\.command\(\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      commands.add(match[1]!.split(/\s+/)[0]!);
    }
  }

  return [...commands].sort();
}

describe('CLI MCP parity registry migration', () => {
  it('keeps the registry command universe identical to the legacy command scan', () => {
    // Belgeli geçiş-istisnaları (701 el-kapanışı): eski tarayıcı `local-llm`'i hiç
    // görmüyordu (registry daha doğru — kanıt); commander'ın örtük built-in `help`'i
    // register*-çağrısı üretmediğinden legacy-taramada yoktur ama canlı evrenin üyesidir.
    const legacyWithKnownMisses = [...scanLegacyCliCommands(), 'help', 'local-llm']
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort();
    expect(SURFACE_REGISTRY.map(({ name }) => name).sort()).toEqual(legacyWithKnownMisses);
  });

  it('passes the parity gate against the real repository', () => {
    const result = spawnSync('node', ['scripts/lint-cli-mcp-parity.mjs'], {
      cwd: projectRoot,
      encoding: 'utf8',
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('No NEW parity gaps beyond the accepted baseline');
  });
});
