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
