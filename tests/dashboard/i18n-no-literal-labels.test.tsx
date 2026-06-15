import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Regex pattern to detect common Turkish strings (basic heuristic)
const turkishStringPatterns = [
  // Common Turkish characters and words
  /[çğıöşüÇĞİÖŞÜ]/,
  // Common Turkish words
  /\b(ve|ya|için|ile|gibi|oldu|var|yok|yeni|eski|büyük|küçük|iyi|kötü|hızlı|yavaş|açık|kapalı)\b/i,
  // Turkish suffixes
  /[ıöüçşğ](m|n|mı|nı|mi|ni|mu|nu|mız|nız|mız|nız|mü|nü|müz|nüz)$/,
];

function containsTurkishString(content: string): boolean {
  // This is a basic heuristic check
  // We look for Turkish-specific characters first, as that's the most reliable
  if (/[çğıöşüÇĞİÖŞÜ]/.test(content)) {
    return true;
  }
  return false;
}

function extractStringsFromJSX(content: string): string[] {
  const strings: string[] = [];

  // Match string literals in JSX
  const stringRegex = /["']([^"'`]*?)["']/g;
  let match;

  while ((match = stringRegex.exec(content)) !== null) {
    const str = match[1];
    // Filter out very short strings (likely not human-facing text)
    if (str.length > 2) {
      strings.push(str);
    }
  }

  return strings;
}

describe('i18n-no-literal-labels', () => {
  const pagesDir = path.join(__dirname, '../../src/dashboard/src');

  const pages = [
    'pages/EvolutionPage.tsx',
    'pages/NervousPage.tsx',
    'pages/MemoryExplorerPage.tsx',
  ];

  pages.forEach((pagePath) => {
    it(`${pagePath} should not contain hardcoded Turkish strings`, () => {
      const filePath = path.join(pagesDir, pagePath);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Extract all string literals
      const strings = extractStringsFromJSX(content);

      // Filter for Turkish strings (those containing Turkish-specific characters)
      const turkishStrings = strings.filter(str => {
        // Skip common English words that might appear in variable names or small tokens
        const englishOnlyTokens = ['the', 'and', 'or', 'if', 'is', 'of', 'a', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'as', 'be', 'it', 'this', 'that', 'with'];
        if (englishOnlyTokens.includes(str.toLowerCase())) {
          return false;
        }

        // Check for Turkish-specific characters
        return containsTurkishString(str);
      });

      // Report any Turkish strings found
      if (turkishStrings.length > 0) {
        console.log(`Found ${turkishStrings.length} potential Turkish string(s) in ${pagePath}:`);
        turkishStrings.forEach(str => {
          console.log(`  - "${str}"`);
        });
      }

      expect(turkishStrings.length, `${pagePath} should not contain hardcoded Turkish strings`).toBe(0);
    });
  });

  it('should have 0 total hardcoded Turkish strings across all 3 pages', () => {
    let totalTurkish = 0;

    pages.forEach((pagePath) => {
      const filePath = path.join(pagesDir, pagePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const strings = extractStringsFromJSX(content);

      const turkishStrings = strings.filter(str => {
        const englishOnlyTokens = ['the', 'and', 'or', 'if', 'is', 'of', 'a', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'as', 'be', 'it', 'this', 'that', 'with'];
        if (englishOnlyTokens.includes(str.toLowerCase())) {
          return false;
        }
        return containsTurkishString(str);
      });

      totalTurkish += turkishStrings.length;
    });

    expect(totalTurkish).toBe(0);
  });
});

// ─── D8: literal-label guard — nav-items.ts + Layout.tsx + Sidebar.tsx ────────
// The D8 fix moved labels from NavItem.label (literal) to NavItem.labelKey (i18n).
// This suite guards the fix-locus (nav-items.ts) and the rendering sites
// (Layout.tsx, Sidebar.tsx) so a reintroduced `label: 'X'` override FAILS the
// build before it ships.
describe('i18n-no-literal-labels — D8 nav fix-locus guard', () => {
  const dashSrc = path.join(__dirname, '../../src/dashboard/src');

  /**
   * Parse all `label:` string literal assignments from a TypeScript/TSX source.
   * Matches patterns like:  label: 'Foo'   label: "Bar"   label?: 'Baz'
   * Returns the matched literal values.
   */
  function extractLiteralLabelOverrides(content: string): string[] {
    // Match `label:` or `label?:` followed by a quoted string (single or double).
    const re = /\blabel\??:\s*['"]([^'"]+)['"]/g;
    const hits: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      // Exclude known non-label keys that happen to contain "label" in their name,
      // e.g. `groupLabel:` (the stable id) — those are intentional stable strings.
      // The regex already anchors on word-boundary `\b` before "label" and requires
      // the next char is `:` (with optional `?`), so `groupLabel` does NOT match.
      hits.push(m[1]!);
    }
    return hits;
  }

  it('nav-items.ts — no NavItem has a literal label: override', () => {
    const file = path.join(dashSrc, 'nav-items.ts');
    const content = fs.readFileSync(file, 'utf-8');
    const overrides = extractLiteralLabelOverrides(content);
    expect(overrides, `nav-items.ts must not contain literal label: overrides — found: ${JSON.stringify(overrides)}`).toHaveLength(0);
  });

  it('Layout.tsx — renders nav items via labelKey, not literal label override', () => {
    const file = path.join(dashSrc, 'components/Layout.tsx');
    const content = fs.readFileSync(file, 'utf-8');
    // Layout.tsx renders `{label ?? t(labelKey)}`. The `label` prop is intentional
    // (comes from NavItem type), but the file itself must not DEFINE any literal
    // label: 'X' NavItem entries — it only renders what nav-items.ts provides.
    // Guard: no `{ label: 'something' }` object literal should appear in Layout.tsx.
    const overrides = extractLiteralLabelOverrides(content);
    expect(overrides, `Layout.tsx must not define NavItem literal label overrides — found: ${JSON.stringify(overrides)}`).toHaveLength(0);
  });

  it('Sidebar.tsx — no literal label: NavItem definition', () => {
    const file = path.join(dashSrc, 'components/Sidebar.tsx');
    const content = fs.readFileSync(file, 'utf-8');
    const overrides = extractLiteralLabelOverrides(content);
    expect(overrides, `Sidebar.tsx must not define NavItem literal label overrides — found: ${JSON.stringify(overrides)}`).toHaveLength(0);
  });

  it('regression guard — would FAIL if a literal label is re-introduced in nav-items.ts', () => {
    // Simulate the kind of regression the guard is designed to catch.
    // Inject a synthetic nav entry with `label: 'Dashboard'` and verify the
    // extractor finds it — proving the guard would catch a real regression.
    const syntheticEntry = `{ to: '/', labelKey: 'nav.dashboard', label: 'Dashboard', icon: LayoutDashboard }`;
    const overrides = extractLiteralLabelOverrides(syntheticEntry);
    expect(overrides).toContain('Dashboard');
  });
});
