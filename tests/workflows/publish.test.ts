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

  it('should have release:published trigger event', () => {
    expect(workflowContent).toContain('release:');
    expect(workflowContent).toContain('published');
  });

  it('should have tag-based push trigger (v*)', () => {
    expect(workflowContent).toContain('push:');
    expect(workflowContent).toContain('tags:');
    expect(workflowContent).toContain("- 'v*'");
  });

  it('should have OIDC permissions set correctly for provenance', () => {
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
    expect(workflowContent).toContain('npx vitest run');
  });

  it('should have dry-run step before actual publish', () => {
    expect(workflowContent).toContain('--dry-run');
    const dryRunIndex = workflowContent.indexOf('--dry-run');
    const publishProvenanceIndex = workflowContent.indexOf('npm publish --provenance');
    expect(dryRunIndex).toBeGreaterThan(0);
    expect(dryRunIndex).toBeLessThan(publishProvenanceIndex);
  });

  it('should have dry-run step with --access public', () => {
    expect(workflowContent).toContain('npm publish --dry-run --access public');
  });

  it('should have publish step with provenance and --access public', () => {
    expect(workflowContent).toContain('npm publish --provenance --access public');
  });

  it('should have NODE_AUTH_TOKEN environment variable', () => {
    expect(workflowContent).toContain('NODE_AUTH_TOKEN');
    expect(workflowContent).toContain('secrets.NPM_TOKEN');
  });

  it('should have registry-url set to npmjs.org', () => {
    expect(workflowContent).toContain('registry-url:');
    expect(workflowContent).toContain('https://registry.npmjs.org');
  });

  it('should run on ubuntu-latest', () => {
    expect(workflowContent).toContain('ubuntu-latest');
  });

  it('should have checkout step', () => {
    expect(workflowContent).toContain('actions/checkout@v4');
  });

  it('should have setup-node step', () => {
    expect(workflowContent).toContain('actions/setup-node@v4');
  });

  it('should have cache enabled for npm', () => {
    expect(workflowContent).toContain('cache: npm');
  });

  it('should have type check step', () => {
    expect(workflowContent).toContain('npm run lint');
  });

  it('should have NODE_AUTH_TOKEN on both dry-run and publish steps', () => {
    const nodeAuthCount = (workflowContent.match(/NODE_AUTH_TOKEN/g) || []).length;
    expect(nodeAuthCount).toBeGreaterThanOrEqual(2);
  });
});

describe('.github/workflows/release.yml', () => {
  let releaseContent: string;

  try {
    releaseContent = readFileSync(resolve('.github/workflows/release.yml'), 'utf-8');
  } catch (e) {
    releaseContent = '';
  }

  it('should exist', () => {
    expect(releaseContent.length).toBeGreaterThan(0);
  });

  it('should have tag-based push trigger (v*)', () => {
    expect(releaseContent).toContain('push:');
    expect(releaseContent).toContain('tags:');
    expect(releaseContent).toContain("- 'v*'");
  });

  it('should have contents: write for GitHub Release creation', () => {
    expect(releaseContent).toContain('contents: write');
  });

  it('should have id-token: write for OIDC provenance', () => {
    expect(releaseContent).toContain('id-token: write');
  });

  it('should publish with provenance and access public', () => {
    expect(releaseContent).toContain('npm publish --provenance --access public');
  });
});
