/**
 * JSDoc presence tests — verifies that every exported function in priority
 * source files has a JSDoc comment (/** ... * /) immediately preceding it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/** Files that must have JSDoc on every `export function` / `export async function`. */
const PRIORITY_FILES: string[] = [
  'src/core/utils.ts',
  'src/core/config.ts',
  'src/orchestra/model-selector.ts',
  'src/orchestra/task-builder.ts',
  'src/orchestra/debt-manager.ts',
  'src/orchestra/sprint-reporter.ts',
  'src/orchestra/sprint-controller.ts',
  'src/orchestra/result-evaluator.ts',
];

/**
 * Checks that every `export [async] function` in the file has a JSDoc comment
 * (a block starting with `/**`) within the preceding 20 lines.
 */
function findExportedFunctionsMissingJSDoc(filePath: string): string[] {
  const content = readFileSync(join(ROOT, filePath), 'utf-8');
  const lines = content.split('\n');
  const missing: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Match exported function declarations (not re-exports from index/barrel files)
    const match = line.match(/^export\s+(async\s+)?function\s+(\w+)/);
    if (!match) continue;
    const funcName = match[2]!;

    // Look backward up to 20 lines for a JSDoc opening `/**`
    let foundJSDoc = false;
    for (let j = i - 1; j >= Math.max(0, i - 20); j--) {
      const prev = lines[j]!.trim();
      // Stop searching when we hit another function, class, interface, or export
      if (/^(export\s|function\s|class\s|interface\s|const\s|let\s|var\s|\/\/ ═|\/\/ ─)/.test(prev)) {
        break;
      }
      if (prev.startsWith('/**') || prev.startsWith('* ') || prev === '*/') {
        foundJSDoc = true;
        break;
      }
    }

    if (!foundJSDoc) {
      missing.push(funcName);
    }
  }

  return missing;
}

describe('JSDoc for Public Functions', () => {
  for (const file of PRIORITY_FILES) {
    it(`${file} — all exported functions have JSDoc`, () => {
      const missing = findExportedFunctionsMissingJSDoc(file);
      expect(
        missing,
        `Missing JSDoc for: ${missing.join(', ')} in ${file}`,
      ).toEqual([]);
    });
  }

  it('at least 50 exported functions are documented across priority files', () => {
    let totalDocumented = 0;
    for (const file of PRIORITY_FILES) {
      const content = readFileSync(join(ROOT, file), 'utf-8');
      const exportedFunctions = content.match(/^export\s+(async\s+)?function\s+\w+/gm) ?? [];
      const missing = findExportedFunctionsMissingJSDoc(file);
      totalDocumented += exportedFunctions.length - missing.length;
    }
    expect(totalDocumented).toBeGreaterThanOrEqual(50);
  });

  it('JSDoc comments include @param tags for functions with parameters', () => {
    // Sample check: verify key functions have @param tags
    const utilsContent = readFileSync(join(ROOT, 'src/core/utils.ts'), 'utf-8');
    expect(utilsContent).toContain('@param content');
    expect(utilsContent).toContain('@param items');
    expect(utilsContent).toContain('@param filePath');

    const configContent = readFileSync(join(ROOT, 'src/core/config.ts'), 'utf-8');
    expect(configContent).toContain('@param config');
    expect(configContent).toContain('@param base');
    expect(configContent).toContain('@param override');
  });

  it('JSDoc comments include @returns tags', () => {
    const utilsContent = readFileSync(join(ROOT, 'src/core/utils.ts'), 'utf-8');
    expect(utilsContent).toContain('@returns');

    const configContent = readFileSync(join(ROOT, 'src/core/config.ts'), 'utf-8');
    expect(configContent).toContain('@returns');

    const modelContent = readFileSync(join(ROOT, 'src/orchestra/model-selector.ts'), 'utf-8');
    expect(modelContent).toContain('@returns');
  });

  it('JSDoc comments include @throws tags where applicable', () => {
    const configContent = readFileSync(join(ROOT, 'src/core/config.ts'), 'utf-8');
    expect(configContent).toContain('@throws');

    const controllerContent = readFileSync(join(ROOT, 'src/orchestra/sprint-controller.ts'), 'utf-8');
    expect(controllerContent).toContain('@throws');
  });

  it('brain.ts (re-export layer) does not need JSDoc on re-exports', () => {
    // brain.ts is a barrel re-export file — it should not have export function declarations
    const brainContent = readFileSync(join(ROOT, 'src/orchestra/brain.ts'), 'utf-8');
    const exportedFunctions = brainContent.match(/^export\s+(async\s+)?function\s+\w+/gm) ?? [];
    expect(exportedFunctions.length).toBe(0);
  });
});
