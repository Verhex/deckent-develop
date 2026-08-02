import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── DOC-GAP (2026-08-02) ────────────────────────────────────────────────────
// The 2026-08 docs reset archived docs/.vitepress/** and docs/package.json
// (docs/archive/docs-pre-reset-2026-08-03/). Whether the nested VitePress site
// continues or is absorbed by the root toolchain is an OPEN OWNER DECISION —
// OQ-18 in docs/analysis/OPEN-QUESTIONS-2026-08.md. Repointing these tests would
// silently decide "it continues"; deleting them would decide "it does not".
// Skipped (not deleted) so the coverage loss stays visible and reversible.
// NOTE: .github/workflows/docs.yml still runs `npx vitepress build` against the
// archived tree, so the docs-site deploy is broken independently of CI.

const DOCS_ROOT = join(process.cwd(), 'docs');
const VITEPRESS_ROOT = join(DOCS_ROOT, '.vitepress');

// ─── File Existence ────────────────────────────────────────────────

describe.skip('VitePress file structure', () => {
  it('docs/package.json exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'package.json'))).toBe(true);
  });

  it('docs/.vitepress/config.ts exists', () => {
    expect(existsSync(join(VITEPRESS_ROOT, 'config.ts'))).toBe(true);
  });

  it('docs/.vitepress/theme/index.ts exists', () => {
    expect(existsSync(join(VITEPRESS_ROOT, 'theme', 'index.ts'))).toBe(true);
  });

  it('docs/.vitepress/theme/custom.css exists', () => {
    expect(existsSync(join(VITEPRESS_ROOT, 'theme', 'custom.css'))).toBe(true);
  });

  it('docs/.vitepress/public/logo.svg exists', () => {
    expect(existsSync(join(VITEPRESS_ROOT, 'public', 'logo.svg'))).toBe(true);
  });

  it('docs/index.md (home page) exists', () => {
    expect(existsSync(join(DOCS_ROOT, 'index.md'))).toBe(true);
  });
});

// ─── package.json Validation ───────────────────────────────────────

describe.skip('docs/package.json', () => {
  const pkgPath = join(DOCS_ROOT, 'package.json');
  let pkg: Record<string, unknown>;

  beforeEach(() => {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  });

  it('has docs:dev script', () => {
    const scripts = pkg['scripts'] as Record<string, string>;
    expect(scripts['docs:dev']).toBe('vitepress dev');
  });

  it('has docs:build script', () => {
    const scripts = pkg['scripts'] as Record<string, string>;
    expect(scripts['docs:build']).toBe('vitepress build');
  });

  it('has docs:preview script', () => {
    const scripts = pkg['scripts'] as Record<string, string>;
    expect(scripts['docs:preview']).toBe('vitepress preview');
  });

  it('lists vitepress as devDependency', () => {
    const devDeps = pkg['devDependencies'] as Record<string, string>;
    expect(devDeps).toHaveProperty('vitepress');
  });

  it('has private:true (not accidentally published)', () => {
    expect(pkg['private']).toBe(true);
  });
});

// ─── config.ts content checks ─────────────────────────────────────

describe.skip('docs/.vitepress/config.ts', () => {
  const configPath = join(VITEPRESS_ROOT, 'config.ts');
  let content: string;

  beforeEach(() => {
    content = readFileSync(configPath, 'utf-8');
  });

  it('imports defineConfig from vitepress', () => {
    expect(content).toContain("from 'vitepress'");
    expect(content).toContain('defineConfig');
  });

  it('keeps generated governance projections outside the public docs build', () => {
    const srcExclude = content.match(/srcExclude:\s*\[([\s\S]*?)\]/)?.[1];

    expect(srcExclude).toBeDefined();
    expect(srcExclude).toMatch(/^\s*'generated\/\*\*',\s*$/m);
  });

  it('includes all required nav items: Home, Docs, Blog, GitHub', () => {
    expect(content).toContain("text: 'Home'");
    expect(content).toContain("text: 'Docs'");
    expect(content).toContain("text: 'Blog'");
    expect(content).toContain("text: 'GitHub'");
  });

  it('includes Getting Started sidebar section', () => {
    expect(content).toContain('Getting Started');
  });

  it('includes Architecture sidebar section', () => {
    expect(content).toContain('Architecture');
  });

  it('includes CLI Reference sidebar section', () => {
    expect(content).toContain('CLI Reference');
  });

  it('includes Config Reference sidebar section', () => {
    expect(content).toContain('Config Reference');
  });

  it('includes MCP Guide sidebar section', () => {
    expect(content).toContain('MCP Guide');
  });

  it('includes Plugin Development sidebar section', () => {
    expect(content).toContain('Plugin Development');
  });

  it('includes API Reference sidebar section', () => {
    expect(content).toContain('API Reference');
  });

  it('sets appearance to auto (dark/light theme)', () => {
    expect(content).toContain("appearance: 'auto'");
  });

  it('includes logo configuration', () => {
    expect(content).toContain('logo:');
  });

  it('includes search configuration', () => {
    expect(content).toContain("provider: 'local'");
  });

  it('includes social links for GitHub', () => {
    expect(content).toContain('socialLinks');
    expect(content).toContain('github');
  });

  it('includes footer text', () => {
    expect(content).toContain('footer');
  });

  it('includes edit link pointing to GitHub', () => {
    expect(content).toContain('editLink');
    expect(content).toContain('github.com');
  });
});

// ─── theme/index.ts content checks ────────────────────────────────

describe.skip('docs/.vitepress/theme/index.ts', () => {
  const themePath = join(VITEPRESS_ROOT, 'theme', 'index.ts');
  let content: string;

  beforeEach(() => {
    content = readFileSync(themePath, 'utf-8');
  });

  it('imports Theme type from vitepress', () => {
    expect(content).toContain("from 'vitepress'");
  });

  it('imports and extends DefaultTheme', () => {
    expect(content).toContain('DefaultTheme');
    expect(content).toContain('extends');
  });

  it('imports custom.css', () => {
    expect(content).toContain("'./custom.css'");
  });
});

// ─── theme/custom.css content checks ──────────────────────────────

describe.skip('docs/.vitepress/theme/custom.css', () => {
  const cssPath = join(VITEPRESS_ROOT, 'theme', 'custom.css');
  let content: string;

  beforeEach(() => {
    content = readFileSync(cssPath, 'utf-8');
  });

  it('defines brand color CSS variables', () => {
    expect(content).toContain('--vp-c-brand-1');
  });

  it('has dark mode overrides', () => {
    expect(content).toContain('.dark');
  });

  it('has hero gradient customization', () => {
    expect(content).toContain('--vp-home-hero');
  });
});

// ─── Home page (index.md) ──────────────────────────────────────────

describe.skip('docs/index.md', () => {
  const indexPath = join(DOCS_ROOT, 'index.md');
  let content: string;

  beforeEach(() => {
    content = readFileSync(indexPath, 'utf-8');
  });

  it('uses home layout', () => {
    expect(content).toContain('layout: home');
  });

  it('includes hero section with name and tagline', () => {
    expect(content).toContain('hero:');
    expect(content).toContain('tagline:');
  });

  it('includes Get Started CTA link to /guide/getting-started', () => {
    expect(content).toContain('/guide/getting-started');
  });

  it('includes feature cards', () => {
    expect(content).toContain('features:');
  });

  it('links to GitHub', () => {
    expect(content).toContain('github.com');
  });
});
