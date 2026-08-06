import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

function runNpmPackDryRun(): Promise<string> {
  return new Promise((res, rej) => {
    const proc = spawn('npm', ['pack', '--dry-run', '--json'], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        rej(new Error(`npm pack exited ${code}: ${stderr}`));
      } else {
        res(stdout);
      }
    });
    proc.on('error', rej);
  });
}

/**
 * Strip fenced code blocks (``` or ~~~) from markdown text to avoid false positives
 * from code examples that contain docs/ paths which are NOT actual links.
 */
function stripCodeFences(text: string): string {
  // Remove fenced blocks delimited by ``` or ~~~
  return text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1\s*$/gm, '');
}

/**
 * Extract every `docs/...` path that appears as an actual link or image source
 * in the README.  Two contexts are covered:
 *   1. Markdown links:  ](docs/...)  — the href inside parens
 *   2. HTML attributes: src="docs/..." or href="docs/..."
 *
 * Returns objects with the raw path (exactly as it appears in the file)
 * and a boolean `isAbsolute` (true when the value starts with http:// or https://).
 */
function extractDocsRefs(content: string): Array<{ raw: string; isAbsolute: boolean }> {
  const stripped = stripCodeFences(content);
  const results: Array<{ raw: string; isAbsolute: boolean }> = [];
  const seen = new Set<string>();

  // Markdown links: [text](url) — capture the url part when it touches docs/
  // 531 süpürme: `](docs/...)` — the CURRENT README links docs/ with no path
  // prefix; the old `[^)]+` required at least one leading char and silently
  // matched nothing (guard assertion caught exactly this).
  const mdLinkRe = /\]\(([^)]*docs\/[^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdLinkRe.exec(stripped)) !== null) {
    const url = m[1].trim();
    if (!seen.has(url)) {
      seen.add(url);
      results.push({ raw: url, isAbsolute: /^https?:\/\//i.test(url) });
    }
  }

  // HTML src/href attributes: src="..." or href="..."
  const htmlAttrRe = /(?:src|href)="([^"]*docs\/[^"]*)"/g;
  while ((m = htmlAttrRe.exec(stripped)) !== null) {
    const url = m[1].trim();
    if (!seen.has(url)) {
      seen.add(url);
      results.push({ raw: url, isAbsolute: /^https?:\/\//i.test(url) });
    }
  }

  return results;
}

describe('README.md — docs/ links resolve in the published package', () => {
  it('every docs/ link in README is either absolute or packed in the tarball', async () => {
    const readmePath = resolve(PROJECT_ROOT, 'README.md');
    const readmeContent = readFileSync(readmePath, 'utf-8');

    const refs = extractDocsRefs(readmeContent);

    // Sanity: we must find at least one docs/ reference (guards against silent regex failure)
    expect(refs.length, 'Expected to find at least one docs/ reference in README').toBeGreaterThan(0);

    const relativeRefs = refs.filter((r) => !r.isAbsolute);

    if (relativeRefs.length === 0) {
      // All docs/ references are absolute — no dangling links possible.
      return;
    }

    // Some relative docs/ links exist — verify each is present in the packed tarball.
    const raw = await runNpmPackDryRun();
    let packs: Array<{ files: Array<{ path: string }> }>;
    try {
      packs = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse npm pack --json output: ${raw.slice(0, 400)}`);
    }

    expect(packs).toBeInstanceOf(Array);
    expect(packs.length).toBeGreaterThan(0);

    const packedPaths = new Set(packs.flatMap((p) => p.files.map((f) => f.path)));

    const dangling = relativeRefs.filter((r) => {
      // The tarball path may be prefixed with "package/" — check both forms.
      return !packedPaths.has(r.raw) && !packedPaths.has(`package/${r.raw}`);
    });

    expect(
      dangling.map((d) => d.raw),
      `Relative docs/ links in README are absent from the npm pack manifest.\n` +
      `These links break on a fresh "npm install deckent":\n` +
      dangling.map((d) => `  • ${d.raw}`).join('\n') +
      `\n\nAll packed paths: ${[...packedPaths].join(', ')}`,
    ).toHaveLength(0);
  }, 30_000);
});
