import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '@/core/utils';

const WORKFLOW_PATH = join(process.cwd(), '.github', 'workflows', 'docs.yml');
const VITEPRESS_CONFIG_PATH = join(process.cwd(), 'docs', '.vitepress', 'config.ts');

// ─── Workflow File Structure ────────────────────────────────────────

describe('GitHub Pages deployment workflow', () => {
  it('docs.yml workflow file exists', () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
  });

  it('workflow file is valid YAML', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
  });

  it('workflow has correct name', () => {
    const content = readFileSync(WORKFLOW_PATH, 'utf-8');
    expect(content).toContain('name: Build and Deploy Docs');
  });
});

// ─── Workflow Triggers ──────────────────────────────────────────────

describe('docs.yml triggers', () => {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');

  it('triggers on push to main branch', () => {
    expect(content).toContain('branches: [main]');
  });

  it('filters push by docs path', () => {
    expect(content).toContain("- 'docs/**'");
    expect(content).toContain("- '.github/workflows/docs.yml'");
  });

  it('triggers on pull requests to master', () => {
    expect(content).toContain('pull_request:');
  });
});

// ─── Workflow Permissions ───────────────────────────────────────────

describe('docs.yml permissions', () => {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');

  it('has required permissions for GitHub Pages', () => {
    expect(content).toContain('pages: write');
    expect(content).toContain('contents: read');
    expect(content).toContain('id-token: write');
  });
});

// ─── Build Job ──────────────────────────────────────────────────────

describe('docs.yml build job', () => {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');

  it('includes build job', () => {
    expect(content).toContain('build:');
    expect(content).toContain('Build Documentation');
  });

  it('checks out repository', () => {
    expect(content).toContain('actions/checkout@v4');
  });

  it('sets up Node.js 24.x', () => {
    expect(content).toContain("node-version: '24.x'");
  });

  it('installs root dependencies', () => {
    expect(content).toContain('npm ci');
  });

  it('installs docs dependencies', () => {
    expect(content).toContain('npm install --prefix docs');
  });

  it('runs type check', () => {
    expect(content).toContain('npm run lint');
  });

  it('builds documentation', () => {
    expect(content).toContain('vitepress build');
  });

  it('creates CNAME file for custom domain', () => {
    expect(content).toContain('docs.deckent.agency');
    expect(content).toContain('CNAME');
  });

  it('uploads artifact to GitHub Pages', () => {
    expect(content).toContain('actions/upload-pages-artifact@v3');
    expect(content).toContain('docs/.vitepress/dist');
  });
});

// ─── Deploy Job ─────────────────────────────────────────────────────

describe('docs.yml deploy job', () => {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');

  it('includes deploy job', () => {
    expect(content).toContain('deploy:');
    expect(content).toContain('Deploy to GitHub Pages');
  });

  it('depends on build job', () => {
    expect(content).toContain('needs: build');
  });

  it('only deploys on main push AND with Pages explicitly enabled (repo var)', () => {
    // born-608 (407-001): eski master-koşulu hiç eşleşmiyordu (job kalıcı-ölüydü).
    // CC (2026-07-11): canlanınca Pages'in repoda kapalı olduğu ortaya çıktı →
    // deploy DECKENT_PAGES_ENABLED repo-değişkenine bağlandı (yokken dürüst-SKIP).
    expect(content).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main' && vars.DECKENT_PAGES_ENABLED == 'true'",
    );
  });

  it('has github-pages environment', () => {
    expect(content).toContain('github-pages');
  });

  it('has deploy pages action (commented or active)', () => {
    expect(content).toContain('actions/deploy-pages@v4');
  });
});

// ─── VitePress Config for Deployment ─────────────────────────────────

describe('VitePress config for GitHub Pages', () => {
  const content = readFileSync(VITEPRESS_CONFIG_PATH, 'utf-8');

  it('has correct base path for custom domain', () => {
    // Custom domain uses '/', not a subpath
    expect(content).toMatch(/base:\s*['"`]\/['"`]/);
  });

  it('enables clean URLs', () => {
    expect(content).toContain('cleanUrls: true');
  });

  it('has theme configured', () => {
    expect(content).toContain('themeConfig');
  });

  it('has search configured', () => {
    expect(content).toContain('search');
    expect(content).toContain('local');
  });
});

// ─── Concurrency ────────────────────────────────────────────────────

describe('docs.yml concurrency settings', () => {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');

  it('has concurrency group', () => {
    expect(content).toContain('concurrency:');
    expect(content).toContain('group: pages');
  });

  it('cancels in-progress jobs', () => {
    expect(content).toContain('cancel-in-progress: false');
  });
});
