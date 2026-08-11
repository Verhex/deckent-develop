// row 3312 — the DIRECTIVES scope chain stops producing phantoms and silent shrinks.
//
// Every case below is pinned END-TO-END: a DIRECTIVES.md fixture →
// parseStructuredDirectives (plan-time extraction) → sanitizeScope (the single
// sanitize authority) → buildScopeBlock (the rendered worker scope). The five
// defects were measured on live sprint-507/509 runs; each one surfaced as either a
// phantom path (a "file" nobody granted) or a silent shrink (a granted file that
// vanished before the worker saw it, which the prompt-gate then reports as a
// write-authority shrink BLOCK).
import { describe, it, expect } from 'vitest';

import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import { sanitizeScope } from '../../src/orchestra/scope-sanitizer.js';
import { buildScopeBlock } from '../../src/orchestra/prompt-god-template.js';
import type { TaskScope } from '../../src/core/types.js';

/** Render the worker-facing scope exactly as the prompt compiler does — with NO
 *  tracked-file vouch, which is the render-stage condition that produced (d). */
function render(scope: TaskScope): { block: string; warnings: string[] } {
  const warnings: string[] = [];
  const block = buildScopeBlock(scope, warnings, false);
  return { block, warnings };
}

function taskByTitle(directives: string, title: string): TaskScope {
  const parsed = parseStructuredDirectives(directives);
  const task = parsed.find(t => t.title === title);
  if (!task) throw new Error(`fixture task not found: ${title}`);
  return task.scope;
}

// Multi-dot names are written with a real dot here; the parser under test is the
// thing being pinned, so the fixture must be byte-real.
const DIRECTIVES_FIXTURE = `# DIRECTIVES

## Task 1: multi-dot root doc file
- Files: README.tr.md
- Test: npx vitest run tests/orchestra/scope-parser-phantom.test.ts

## Task 2: slash-qualified multi-dot paths
- Scope: tests/PLATFORM.md, scripts/spawnsync-baseline.json

## Task 3: scope label mixes files and directories
- Scope: README.md, Dockerfile, src/orchestra/

## Task 4: root dotfile write target
- Files: .dockerignore, Dockerfile

## Task 5: backslash-qualified test path
- Scope: tests\\orchestra\\scope-parser-phantom.test.ts

## Task 6: today's working single-dot slash-qualified paths
- Files: src/orchestra/task-builder.ts, src/orchestra/scope-sanitizer.ts, tests/orchestra/scope-parser-phantom.test.ts
- Scope: src/orchestra/, tests/orchestra/
`;

describe('row 3312 — DIRECTIVES scope chain: no phantoms, no silent shrinks', () => {
  it('(a) a multi-dot root basename does not donate a phantom tail token', () => {
    const scope = taskByTitle(DIRECTIVES_FIXTURE, 'multi-dot root doc file');

    // The doc-file regex used to also match the TAIL "tr.md" of "README.tr.md".
    expect(scope.filesWrite).toEqual(['README.tr.md']);
    expect(scope.filesWrite).not.toContain('tr.md');

    const { block, warnings } = render(scope);
    // A phantom here made the sanitizer warn, and SAN-1 reads any warning as a
    // write-authority shrink BLOCK.
    expect(warnings).toEqual([]);
    expect(block).toContain('- README.tr.md');
    expect(block).not.toContain('- tr.md');
  });

  it('(b) slash-qualified multi-dot paths survive render instead of collapsing to bare tails', () => {
    const scope = taskByTitle(DIRECTIVES_FIXTURE, 'slash-qualified multi-dot paths');

    expect(scope.filesWrite).toEqual([
      'tests/PLATFORM.md',
      'scripts/spawnsync-baseline.json',
    ]);
    expect(scope.filesWrite).not.toContain('PLATFORM.md');
    expect(scope.filesWrite).not.toContain('spawnsync-baseline.json');

    const { block, warnings } = render(scope);
    expect(warnings).toEqual([]);
    expect(block).toContain('- tests/PLATFORM.md');
    expect(block).toContain('- scripts/spawnsync-baseline.json');
  });

  it('(c) the Scope label distinguishes files from directories instead of appending a slash', () => {
    const scope = taskByTitle(DIRECTIVES_FIXTURE, 'scope label mixes files and directories');

    // Real task JSON carried the phantom directories "README.md/" and "Dockerfile/".
    expect(scope.directories).toEqual(['src/orchestra/']);
    expect(scope.directories).not.toContain('README.md/');
    expect(scope.directories).not.toContain('Dockerfile/');

    // …and the granted files reach write authority rather than disappearing.
    expect(scope.filesWrite).toEqual(['README.md', 'Dockerfile']);

    const { block, warnings } = render(scope);
    expect(warnings).toEqual([]);
    expect(block).toContain('- README.md');
    expect(block).toContain('- Dockerfile');
  });

  it('(d) a root dotfile survives render-time sanitization without a tracked-file vouch', () => {
    const scope = taskByTitle(DIRECTIVES_FIXTURE, 'root dotfile write target');
    expect(scope.filesWrite).toEqual(['.dockerignore', 'Dockerfile']);

    // sprint-507-002: render-time re-sanitization ran without the vouch plan-time
    // had, dropped ".dockerignore", and the worker honestly refused the task.
    const { block, warnings } = render(scope);
    expect(warnings).toEqual([]);
    expect(block).toContain('- .dockerignore');
    expect(block).toContain('- Dockerfile');
  });

  it('(e) a bare test-file tail never becomes a root-level phantom test path', () => {
    const scope = taskByTitle(DIRECTIVES_FIXTURE, 'backslash-qualified test path');

    // A bare "*.test.ts" at the repo root is preserved by the sanitizer's
    // multi-dot rule and then fails vitest's tests/** discovery → false BLOCK.
    expect(scope.filesWrite).not.toContain('scope-parser-phantom.test.ts');
    expect(scope.filesWrite).toEqual(['tests\\orchestra\\scope-parser-phantom.test.ts']);

    const { warnings } = render(scope);
    expect(warnings).toEqual([]);
  });

  it('one sanitize authority: re-sanitizing the plan-time result never re-narrows it', () => {
    const everyScope = parseStructuredDirectives(DIRECTIVES_FIXTURE)
      .flatMap(t => t.scope.filesWrite);
    // Plan-time has the git-tracked root-file vouch; render/prompt stages may not.
    const planTime = sanitizeScope(everyScope, new Set(['README.md', 'Dockerfile', '.dockerignore']));
    const renderTime = sanitizeScope(planTime.filesWrite);

    // Rule 8 dedupes ("Dockerfile" is granted by two fixture tasks); nothing else drops.
    expect(planTime.filesWrite).toEqual([...new Set(everyScope)]);
    expect(renderTime.filesWrite).toEqual(planTime.filesWrite);
    expect(planTime.warnings).toEqual([]);
    expect(renderTime.warnings).toEqual([]);
  });

  it('still rejects a path the operator never granted (no enforcement loosening)', () => {
    const scope = taskByTitle(DIRECTIVES_FIXTURE, 'root dotfile write target');
    const { block } = render(scope);
    expect(block).not.toContain('src/orchestra/task-builder.ts');

    // Absolute paths, traversal and unqualified single-extension names still drop.
    const hostile = sanitizeScope([
      '/etc/passwd',
      '../../outside.ts',
      'init.ts',
      'package.json',
      '.ts',
      'src/orchestra/task-builder.ts',
    ]);
    expect(hostile.filesWrite).toEqual(['src/orchestra/task-builder.ts']);
    expect(hostile.rejected).toEqual(['/etc/passwd', '../../outside.ts']);
    expect(hostile.warnings).toHaveLength(1);
  });

  it("today's single-dot slash-qualified paths stay byte-identical", () => {
    const scope = taskByTitle(DIRECTIVES_FIXTURE, "today's working single-dot slash-qualified paths");

    expect(scope.filesWrite).toEqual([
      'src/orchestra/task-builder.ts',
      'src/orchestra/scope-sanitizer.ts',
      'tests/orchestra/scope-parser-phantom.test.ts',
    ]);
    expect(scope.directories).toEqual(['src/orchestra/', 'tests/orchestra/']);

    const { warnings } = render(scope);
    expect(warnings).toEqual([]);
  });
});
