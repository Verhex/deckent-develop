import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Import translation objects directly ────────────────────────────
// We import from source to get the actual key/value pairs for comparison.
import { en } from "../../src/dashboard/src/i18n/en.js";
import { tr } from "../../src/dashboard/src/i18n/tr.js";

const DASHBOARD_SRC = join(process.cwd(), "src", "dashboard", "src");

// ─── Helper: flatten nested keys (our translations are flat, but safety) ────
function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      keys.push(...getAllKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// ─── Test 1: Key count equality ─────────────────────────────────────

describe("i18n — key count equality", () => {
  it("en.ts and tr.ts have the same number of keys", () => {
    const enKeys = getAllKeys(en);
    const trKeys = getAllKeys(tr);
    expect(enKeys.length).toBe(trKeys.length);
  });
});

// ─── Test 2: Key parity (every en key in tr, every tr key in en) ────

describe("i18n — key parity", () => {
  const enKeys = new Set(getAllKeys(en));
  const trKeys = new Set(getAllKeys(tr));

  it("every en.ts key exists in tr.ts", () => {
    const missingInTr = [...enKeys].filter((k) => !trKeys.has(k));
    expect(missingInTr).toEqual([]);
  });

  it("every tr.ts key exists in en.ts", () => {
    const missingInEn = [...trKeys].filter((k) => !enKeys.has(k));
    expect(missingInEn).toEqual([]);
  });
});

// ─── Test 3: No empty tr.ts translations ────────────────────────────

describe("i18n — no empty translations in tr.ts", () => {
  it("no tr.ts value is an empty string", () => {
    const emptyKeys = Object.entries(tr)
      .filter(([, value]) => typeof value === "string" && value.trim() === "")
      .map(([key]) => key);
    expect(emptyKeys).toEqual([]);
  });
});

// ─── Test 4: Hardcoded English UI string scan ───────────────────────
//
// Scans component TSX files for leftover hardcoded English UI strings.
// Technical terms (phase/status enum values) are excluded.
// This test validates that i18n conversion is complete in target files.

describe("i18n — hardcoded English string scan", () => {
  // Target component files that should be fully i18n-ized
  const targetFiles = [
    "pages/StatusPage.tsx",
    "components/SprintSummary.tsx",
    "components/TaskCard.tsx",
    "components/DebtTable.tsx",
    "components/SprintChart.tsx",
    "components/Layout.tsx",
  ];

  // Patterns that indicate hardcoded English UI strings
  // These match quoted strings containing common English UI phrases
  // We look for JSX text content and string literals that look like UI text
  const hardcodedPatterns = [
    // Direct JSX text (not inside {t(...)}) — matches lines with bare English words
    // between > and < that aren't just technical terms or single words
    />\s*(No |Loading|Error|Failed|Success|Warning|Waiting|Working|Queued|Active|Done|Tasks|Providers|Needs attention|What's happening)/,
    // String literals assigned to label/name props with English UI text
    /(?:label|name|placeholder)\s*[=:]\s*["'](No |Loading|Error|Failed|Tasks|Providers|Needs attention|Working|Coverage|Success Rate)/,
    // Template literals with English UI text (not inside t())
    /(?<!t\(['"])[`"'](No |Loading |Error |Failed |Waiting for|needs attention|auto-fixed|tasks done|min remaining|min elapsed|just started)/,
  ];

  /**
   * Detect whether a given line index falls inside an exported standalone function
   * (not a React component). Exported helpers like describeCurrentAction(),
   * getStatusLabel(), estimateTimeRemaining(), formatElapsedTime() etc.
   * are kept as non-i18n fallbacks for tests and non-React callers.
   * Only JSX-rendering code (inside React components) needs full i18n.
   */
  function isInsideExportedHelper(lines: string[], lineIdx: number): boolean {
    // Walk backwards to find the enclosing function declaration
    let braceDepth = 0;
    for (let i = lineIdx; i >= 0; i--) {
      const l = lines[i]!;
      // Count braces (simplified — good enough for our component files)
      for (let c = l.length - 1; c >= 0; c--) {
        if (l[c] === "}") braceDepth++;
        if (l[c] === "{") braceDepth--;
      }
      // If we find an export function declaration and brace depth indicates
      // we're inside it, check if it's a React component or a helper
      if (/^export\s+function\s+(\w+)/.test(l.trim())) {
        const match = l.trim().match(/^export\s+function\s+(\w+)/);
        if (match) {
          const fnName = match[1]!;
          // React components start with uppercase and typically accept props
          // Helpers are lowercase or known utility function names
          const isComponent = /^[A-Z]/.test(fnName);
          return !isComponent;
        }
      }
    }
    return false;
  }

  for (const relPath of targetFiles) {
    const fullPath = join(DASHBOARD_SRC, relPath);

    it(`${relPath} uses useTranslation`, () => {
      const content = readFileSync(fullPath, "utf-8");
      expect(content).toContain("useTranslation");
    });

    it(`${relPath} has no hardcoded English UI strings`, () => {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;

        // Skip comment lines
        if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) {
          continue;
        }

        // Skip import lines
        if (line.trim().startsWith("import ")) continue;

        // Skip lines that are pure type/interface definitions
        if (/^\s*(export\s+)?(type|interface)\s/.test(line)) continue;

        for (const pattern of hardcodedPatterns) {
          if (pattern.test(line)) {
            // Skip if inside exported non-component helper functions
            // (these have English fallbacks for non-i18n callers)
            if (isInsideExportedHelper(lines, i)) continue;

            violations.push(`Line ${i + 1}: ${line.trim()}`);
          }
        }
      }

      // Report all violations for easier debugging
      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} hardcoded English string(s) in ${relPath}:\n` +
            violations.map((v) => `  ${v}`).join("\n"),
        );
      }
    });
  }
});
