// ─── Section Updater ──────────────────────────────────────────────────────
// Parse markdown into sections by heading and replace auto-section content.
// Generalized from updateProjectIdentity() pattern in sprint-reporter.ts.

import type { ParsedSection, ManagedDocEntry } from './types.js';

// ─── parseSections ────────────────────────────────────────────────────────

/**
 * Parse a markdown file into sections based on ## headings.
 * Each section extends from its heading line to the line before the next
 * heading of the same or higher level (or EOF).
 */
export function parseSections(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(headingRegex);
    if (!match) continue;

    const level = match[1]!.length;
    const heading = line;

    // Find where this section ends: next heading of same or higher level
    let endLine = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const nextMatch = lines[j]!.match(headingRegex);
      if (nextMatch && nextMatch[1]!.length <= level) {
        endLine = j;
        break;
      }
    }

    const contentLines = lines.slice(i + 1, endLine);
    sections.push({
      heading,
      level,
      startLine: i,
      endLine,
      content: contentLines.join('\n'),
    });
  }

  return sections;
}

// ─── findSectionByTitle ───────────────────────────────────────────────────

/**
 * Find a section by its title text (case-insensitive, ignoring # prefix).
 */
export function findSectionByTitle(sections: ParsedSection[], title: string): ParsedSection | null {
  const normalized = title.toLowerCase().trim();
  return sections.find(s => {
    const sectionTitle = s.heading.replace(/^#+\s*/, '').toLowerCase().trim();
    return sectionTitle === normalized;
  }) ?? null;
}

// ─── replaceSectionContent ────────────────────────────────────────────────

/**
 * Replace the content of a specific section (identified by heading title).
 * Preserves the heading line itself. Returns the full updated content.
 * If the section is not found, returns content unchanged.
 */
export function replaceSectionContent(
  content: string,
  sectionTitle: string,
  newContent: string,
): string {
  const sections = parseSections(content);
  const section = findSectionByTitle(sections, sectionTitle);
  if (!section) return content;

  const lines = content.split('\n');
  const before = lines.slice(0, section.startLine + 1); // include heading
  const after = lines.slice(section.endLine);

  // Ensure newContent ends with a newline for clean separation
  const trimmedNew = newContent.trimEnd();
  return [...before, trimmedNew, '', ...after].join('\n');
}

// ─── appendSection ────────────────────────────────────────────────────────

/**
 * Append a new section to the end of the file.
 */
export function appendSection(
  content: string,
  sectionHeading: string,
  newContent: string,
): string {
  const trimmedContent = content.trimEnd();
  const heading = sectionHeading.startsWith('#') ? sectionHeading : `## ${sectionHeading}`;
  return `${trimmedContent}\n\n${heading}\n${newContent.trimEnd()}\n`;
}

// ─── updateDocSections ────────────────────────────────────────────────────

/**
 * Update all auto sections in a document.
 * - Auto sections get their content replaced with generated content.
 * - Protected and unspecified sections are left untouched.
 * - Missing auto sections are appended at the end.
 */
export function updateDocSections(
  content: string,
  entry: ManagedDocEntry,
  generated: Map<string, string>,
): string {
  let result = content;
  const autoSections = entry.autoSections ?? [];

  for (const sectionTitle of autoSections) {
    const generatedContent = generated.get(sectionTitle);
    if (!generatedContent) continue;

    const existing = findSectionByTitle(parseSections(result), sectionTitle);
    if (existing) {
      result = replaceSectionContent(result, sectionTitle, generatedContent);
    } else {
      result = appendSection(result, sectionTitle, generatedContent);
    }
  }

  return result;
}

// ─── trimToMaxLines ───────────────────────────────────────────────────────

/**
 * Trim auto section content if total document exceeds maxLines.
 * Protected sections and non-auto content are never trimmed.
 */
export function trimToMaxLines(content: string, maxLines: number): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;
  // Simple truncation: keep first maxLines, add truncation notice
  return lines.slice(0, maxLines).join('\n') + '\n\n<!-- truncated at ' + maxLines + ' lines -->\n';
}
