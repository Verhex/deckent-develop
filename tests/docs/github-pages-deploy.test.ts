import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseYaml } from '@/core/utils';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// DECISION — sahip: OQ-18 / DOCS-TOPOLOGY-001 — karar kaydı docs/analysis/DOC-GAP-DISPOSITION-2026-08-03.md.
// The 2026-08 docs reset archived docs/.vitepress/** and docs/package.json
// (docs/archive/docs-pre-reset-2026-08-03/). Whether the nested VitePress site
// continues or is absorbed by the root toolchain is an OPEN OWNER DECISION —
// OQ-18 in docs/analysis/OPEN-QUESTIONS-2026-08.md. Repointing these tests would
// silently decide "it continues"; deleting them would decide "it does not".
// Skipped (not deleted) so the coverage loss stays visible and reversible.
// NOTE: .github/workflows/docs.yml still runs `npx vitepress build` against the
// archived tree, so the docs-site deploy is broken independently of CI.

const WORKFLOW_PATH = join(process.cwd(), '.github', 'workflows', 'docs.yml');
const VITEPRESS_CONFIG_PATH = join(process.cwd(), 'docs', '.vitepress', 'config.ts');

// ─── Workflow File Structure ────────────────────────────────────────

describe.skip('GitHub Pages deployment workflow', () => {
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

describe.skip('docs.yml triggers', () => {
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

describe.skip('docs.yml permissions', () => {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');

  it('has required permissions for GitHub Pages', () => {
    expect(content).toContain('pages: write');
    expect(content).toContain('contents: read');
    expect(content).toContain('id-token: write');
  });
});

// ─── Build Job ──────────────────────────────────────────────────────

describe.skip('docs.yml build job', () => {
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

describe.skip('docs.yml deploy job', () => {
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

describe.skip('VitePress config for GitHub Pages', () => {
  // Guarded read: the describe body is still evaluated for a skipped suite, and
  // the config file is archived (see DOC-GAP banner above / OQ-18).
  const content = existsSync(VITEPRESS_CONFIG_PATH)
    ? readFileSync(VITEPRESS_CONFIG_PATH, 'utf-8')
    : '';

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

describe.skip('docs.yml concurrency settings', () => {
  const content = readFileSync(WORKFLOW_PATH, 'utf-8');

  it('has concurrency group', () => {
    expect(content).toContain('concurrency:');
    expect(content).toContain('group: pages');
  });

  it('cancels in-progress jobs', () => {
    expect(content).toContain('cancel-in-progress: false');
  });
});
