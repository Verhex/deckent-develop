import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MCP doctor provider diagnostics authority', () => {
  it('uses the same reconciled producer as the CLI surface', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/mcp/tools/doctor.ts'),
      'utf8',
    );

    expect(source).toContain('runProviderDiagnosticsWithOllama');
    expect(source).toContain('buildProviderDiagnosticAuthChecks');
    expect(source).toContain(
      'const diagnostics = await runProviderDiagnosticsWithOllama(root)',
    );
    expect(source).not.toContain(
      "import { runProviderDiagnostics } from '../../cli/commands/doctor-checks.js'",
    );
  });
});
