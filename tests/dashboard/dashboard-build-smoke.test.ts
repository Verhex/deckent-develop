import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ARTIFACT_SIZE_LIMIT_BYTES = 5 * 1024 * 1024;
const DASHBOARD_DIST = join(ROOT, 'dist/dashboard');
const BUILD_OUTPUT_PRESENT = existsSync(DASHBOARD_DIST);

describe('dashboard build smoke', () => {
  describe('package.json scripts', () => {
    it('declares build:dashboard and build:all scripts', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      };
      expect(pkg.scripts).toBeDefined();
      expect(typeof pkg.scripts?.['build:dashboard']).toBe('string');
      expect(typeof pkg.scripts?.['build:all']).toBe('string');
    });

    it('build:dashboard invokes vite build for src/dashboard', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      };
      const cmd = pkg.scripts?.['build:dashboard'] ?? '';
      // build:dashboard may delegate to a wrapper script that internally calls vite build
      const wrapsVite = cmd.includes('vite build') || cmd.includes('build-dashboard.mjs');
      expect(wrapsVite).toBe(true);
      // dashboard source is always src/dashboard — verify via script content or path reference
      const scriptContent = cmd.includes('build-dashboard.mjs')
        ? readFileSync(join(ROOT, 'scripts', 'build-dashboard.mjs'), 'utf-8')
        : cmd;
      expect(scriptContent).toMatch(/src[/\\]dashboard|join\('src',\s*'dashboard'\)/);
    });

    it('build:all chains tsc and build:dashboard', () => {
      const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      };
      const cmd = pkg.scripts?.['build:all'] ?? '';
      expect(cmd).toMatch(/tsc/);
      expect(cmd).toMatch(/build:dashboard/);
    });
  });

  describe('vite config', () => {
    it('src/dashboard/vite.config.ts exists', () => {
      expect(existsSync(join(ROOT, 'src/dashboard/vite.config.ts'))).toBe(true);
    });

    it('vite config imports React and Tailwind plugins', () => {
      const cfg = readFileSync(join(ROOT, 'src/dashboard/vite.config.ts'), 'utf-8');
      expect(cfg).toMatch(/@vitejs\/plugin-react/);
      expect(cfg).toMatch(/@tailwindcss\/vite/);
    });
  });

  describe('build artifacts (skipped until dist/dashboard built)', () => {
    it.skipIf(!BUILD_OUTPUT_PRESENT)('dist/dashboard/index.html is produced by build:dashboard', () => {
      const indexHtml = join(DASHBOARD_DIST, 'index.html');
      expect(existsSync(indexHtml)).toBe(true);
      const indexStats = statSync(indexHtml);
      expect(indexStats.size).toBeGreaterThan(0);
    });

    it.skipIf(!BUILD_OUTPUT_PRESENT)('dist/dashboard total size stays under 5MB threshold', () => {
      const total = directoryByteSize(DASHBOARD_DIST);
      expect(total).toBeLessThanOrEqual(ARTIFACT_SIZE_LIMIT_BYTES);
    });
  });
});

function directoryByteSize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directoryByteSize(full);
    } else if (entry.isFile()) {
      total += statSync(full).size;
    }
  }
  return total;
}
