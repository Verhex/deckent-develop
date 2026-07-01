import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DOC_PATH = join(ROOT, 'docs', 'reference', 'api-surface.md');
const content = readFileSync(DOC_PATH, 'utf-8');

const SECTION_HEADING = '## Pillar Module Contracts (Sprint 352–354)';
const sectionStart = content.indexOf(SECTION_HEADING);
const section = sectionStart >= 0 ? content.slice(sectionStart) : '';

// Short-form basename -> repo-relative path, for citations that drop the
// directory after the full path was already spelled out once in the section
// (e.g. "`src/core/tool-search.ts` (160 lines)" ... later "`tool-search.ts:112`").
const KNOWN_PATHS: Record<string, string> = {
  'agentic-worker-tools.ts': 'src/agents/agentic-worker-tools.ts',
  'app.tsx': 'src/cli/repl/app.tsx',
  'approval-broker.ts': 'src/core/approval-broker.ts',
  'approval-card.tsx': 'src/cli/repl/approval-card.tsx',
  'approval-policy.ts': 'src/core/approval-policy.ts',
  'approval-relay.ts': 'src/core/approval-relay.ts',
  'chat-turn-queue.ts': 'src/cli/repl/chat-turn-queue.ts',
  'deck-broker.ts': 'src/core/deck-broker.ts',
  'directives-builder.ts': 'src/orchestra/directives-builder.ts',
  'dual-stream.ts': 'src/cli/repl/dual-stream.ts',
  'native-tool-registry.ts': 'src/cli/repl/native-tool-registry.ts',
  'pending-approvals.ts': 'src/core/pending-approvals.ts',
  'subprocess.ts': 'src/providers/subprocess.ts',
  'tool-core.ts': 'src/core/tool-core.ts',
  'tool-dispatch.ts': 'src/core/tool-dispatch.ts',
  'tool-scope-gate.ts': 'src/core/tool-scope-gate.ts',
  'tool-search.ts': 'src/core/tool-search.ts',
  'trace-wire.ts': 'src/cli/repl/trace-wire.ts',
};

function resolveRepoPath(p: string): string | null {
  if (p.startsWith('src/') || p.startsWith('tests/')) return p;
  return KNOWN_PATHS[p] ?? null;
}

// Every backtick-wrapped `path/to/file.ts[:line[-line]]` reference in the section.
const REF_RE = /`([A-Za-z0-9_./-]+\.tsx?)(?::(\d+)(?:-(\d+))?)?`/g;
interface DocRef { raw: string; path: string; line?: number }
const seen = new Set<string>();
const refs: DocRef[] = [];
let match: RegExpExecArray | null;
while ((match = REF_RE.exec(section)) !== null) {
  const raw = match[0];
  if (seen.has(raw)) continue;
  seen.add(raw);
  refs.push({ raw, path: match[1], line: match[2] ? Number(match[2]) : undefined });
}

describe('docs/reference/api-surface.md — Pillar Module Contracts disk-verify', () => {
  it('the Pillar Module Contracts section exists', () => {
    expect(sectionStart).toBeGreaterThan(-1);
  });

  it('extracted a substantial number of file:line references from the section', () => {
    // Sanity floor — the section cites dozens of file/line pairs; a near-empty
    // extraction means the heading or backtick convention drifted.
    expect(refs.length).toBeGreaterThan(40);
  });

  describe('every cited path resolves to a real file on disk', () => {
    for (const ref of refs) {
      it(`${ref.raw} → ${resolveRepoPath(ref.path) ?? '(unresolvable)'}`, () => {
        const resolved = resolveRepoPath(ref.path);
        expect(resolved, `short-form path "${ref.path}" is not in KNOWN_PATHS — add it or cite the full path`).not.toBeNull();
        const full = join(ROOT, resolved as string);
        expect(existsSync(full), `${resolved} does not exist on disk`).toBe(true);
      });
    }
  });

  describe('every cited line number is within the file\'s actual line count', () => {
    for (const ref of refs) {
      if (ref.line === undefined) continue;
      const resolved = resolveRepoPath(ref.path);
      if (!resolved) continue; // already flagged by the existence check above
      it(`${ref.raw} — line ${ref.line} <= total lines of ${resolved}`, () => {
        const full = join(ROOT, resolved);
        const totalLines = readFileSync(full, 'utf-8').split('\n').length;
        expect(totalLines).toBeGreaterThanOrEqual(ref.line as number);
      });
    }
  });

  describe('flag-gated seams are labeled "flag-gated" where they are mentioned', () => {
    // goCriteria: flag-etiketleri doğru — never describe a default-off config
    // seam as if it were shipped/always-active without the explicit label.
    const FLAG_KEYS = ['repl_surface', 'tool_surface', 'approval_gate', 'deck_broker'];
    for (const key of FLAG_KEYS) {
      it(`"${key}" is mentioned and paired with a flag-gated label`, () => {
        const idx = section.indexOf(key);
        expect(idx, `"${key}" is not mentioned in the Pillar Module Contracts section`).toBeGreaterThan(-1);
        const windowStart = Math.max(0, idx - 600);
        const window = section.slice(windowStart, idx + key.length);
        expect(window.toLowerCase()).toContain('flag-gated');
      });
    }
  });

  describe('internal markdown links inside the section resolve', () => {
    const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
    const links: string[] = [];
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = LINK_RE.exec(section)) !== null) {
      const href = linkMatch[2].trim().split(' ')[0];
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#') || href.startsWith('mailto:')) continue;
      links.push(href);
    }

    it('no internal markdown links are broken (0 found is valid — section is prose-only)', () => {
      const broken = links.filter((href) => {
        const [filePart] = href.split('#');
        if (!filePart) return false;
        const target = join(ROOT, 'docs', 'reference', filePart);
        return !existsSync(target);
      });
      expect(broken).toEqual([]);
    });
  });
});
