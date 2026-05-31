import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ADR_PATH = join(process.cwd(), 'docs/adr/066-provider-independence.md');
const PROVIDER_FREE_PATH = join(process.cwd(), 'docs/reference/provider-free.md');

describe('ADR-066: provider independence', () => {
  it('ADR file exists', () => {
    expect(existsSync(ADR_PATH)).toBe(true);
  });

  it('has MADR structure (Context, Decision, Consequences, Alternatives)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('## Consequences');
    expect(content).toContain('## Alternatives Considered');
    expect(content).toContain('**Status:** accepted');
  });

  it('documents Docker provider-aware decisions (binary, auth, build-arg)', () => {
    const content = readFileSync(ADR_PATH, 'utf-8');
    const hasDockerProvider = /Docker.*provider|provider.*Docker|provider-binary|providerBinary/i.test(content);
    const hasBuildArg = /build.arg|ARG INSTALL/i.test(content);
    expect(hasDockerProvider || hasBuildArg).toBe(true);
    expect(content.toLowerCase()).toContain('docker');
  });

  it('provider-free.md exists and contains Docker usage note', () => {
    expect(existsSync(PROVIDER_FREE_PATH)).toBe(true);
    const content = readFileSync(PROVIDER_FREE_PATH, 'utf-8');
    expect(content.toLowerCase()).toContain('docker');
    expect(content).toContain('INSTALL_CODEX');
  });
});
