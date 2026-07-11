import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('.github/workflows/publish.yml', () => {
  let workflowContent: string;

  try {
    workflowContent = readFileSync(resolve('.github/workflows/publish.yml'), 'utf-8');
  } catch (e) {
    // File doesn't exist - tests will fail
    workflowContent = '';
  }

  it('should exist', () => {
    expect(workflowContent.length).toBeGreaterThan(0);
  });

  it('should have correct trigger event', () => {
    expect(workflowContent).toContain('release:');
    expect(workflowContent).toContain('published');
  });

  it('should have permissions set correctly', () => {
    expect(workflowContent).toContain('contents: read');
    expect(workflowContent).toContain('id-token: write');
  });

  it('should use Node.js 24.x', () => {
    expect(workflowContent).toContain("node-version: '24.x'");
  });

  it('should have npm ci step', () => {
    expect(workflowContent).toContain('npm ci');
  });

  it('should have build step', () => {
    expect(workflowContent).toContain('npm run build');
  });

  it('should have test step', () => {
    expect(workflowContent).toContain('vitest run');
  });

  it('should have publish step with provenance', () => {
    expect(workflowContent).toContain('npm publish --provenance');
  });

  it('uses OIDC trusted publishing — no long-lived registry token (414-001 SEC-06)', () => {
    expect(workflowContent).not.toContain('NODE_AUTH_TOKEN');
    expect(workflowContent).not.toContain('secrets.NPM_TOKEN');
    expect(workflowContent).toContain('id-token: write');
  });

  it('should have registry-url set to npmjs.org', () => {
    expect(workflowContent).toContain('registry-url:');
    expect(workflowContent).toContain('https://registry.npmjs.org');
  });

  it('should run on ubuntu-latest', () => {
    expect(workflowContent).toContain('ubuntu-latest');
  });

  it('should have checkout step (SHA-pinned, 414-001 SEC-06)', () => {
    expect(workflowContent).toMatch(/actions\/checkout@[0-9a-f]{40} # v4/);
  });

  it('should have setup-node step (SHA-pinned, 414-001 SEC-06)', () => {
    expect(workflowContent).toMatch(/actions\/setup-node@[0-9a-f]{40} # v4/);
  });

  it('should have cache enabled for npm', () => {
    expect(workflowContent).toContain('cache: npm');
  });
});
