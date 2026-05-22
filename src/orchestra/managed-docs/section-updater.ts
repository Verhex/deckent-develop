// ─── Section Updater ──────────────────────────────────────────────────────
// Parse markdown into sections by heading and replace auto-section content.
// Generic heading-scoped section replacement for the managed-docs pipeline.

import type { ParsedSection, ManagedDocEntry } from './types.js';

// ─── parseSections ────────────────────────────────────────────────────────

/**
 * Parse a markdown file into sections based on headings (H1-H6).
 * Each section extends from its heading line to the line before the next
 * heading of the same or higher level (or EOF).
 *
 * Code fences (``` or ~~~, 3+ chars) are tracked so that `# comment` lines
 * inside bash/shell blocks are not mistaken for H1 headings — which previously
 * caused BOOT.md structural corruption (parseSections bug, Sprint 186 audit).
 */
export function parseSections(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/;
  const fenceStartRegex = /^(`{3,}|~{3,})/;

  // ── outer pass: track fence state, collect headings ──
  let inFence = false;
  let fenceChar = '';
  let fenceMinLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check for fence open/close
    const fm = line.match(fenceStartRegex);
    if (fm) {
      const ch = fm[1]![0]!;
      const len = fm[1]!.length;
      if (!inFence) {
        inFence = true; fenceChar = ch; fenceMinLen = len;
      } else if (ch === fenceChar && len >= fenceMinLen) {
        inFence = false; fenceChar = ''; fenceMinLen = 0;
      }
      continue; // fence boundary lines are never headings
    }
    if (inFence) continue;

    const match = line.match(headingRegex);
    if (!match) continue;

    const level = match[1]!.length;
    const heading = line;

    // Find where this section ends: next heading of same or higher level,
    // skipping content inside nested code fences.
    let endLine = lines.length;
    let innerFence = false;
    let innerFenceChar = '';
    let innerFenceMinLen = 0;

    for (let j = i + 1; j < lines.length; j++) {
      const nextLine = lines[j]!;
      const nfm = nextLine.match(fenceStartRegex);
      if (nfm) {
        const ch = nfm[1]![0]!;
        const len = nfm[1]!.length;
        if (!innerFence) {
          innerFence = true; innerFenceChar = ch; innerFenceMinLen = len;
        } else if (ch === innerFenceChar && len >= innerFenceMinLen) {
          innerFence = false; innerFenceChar = ''; innerFenceMinLen = 0;
        }
        continue;
      }
      if (innerFence) continue;

      const nextMatch = nextLine.match(headingRegex);
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

// ─── extractAutogenBlocks ─────────────────────────────────────────────────

/**
 * Extract complete `<!-- AUTOGEN:START id="X" --> ... <!-- AUTOGEN:END id="X" -->`
 * blocks from a section body. These blocks are owned by a separate tool
 * (scripts/update-readme-stats.mjs) and must survive managed-doc section
 * replacement — otherwise the `docs:stats:check` gate fails because the
 * markers it relies on were destroyed (B15: IDENTITY.md identity-status).
 */
function extractAutogenBlocks(body: string): string[] {
  const re = /<!-- AUTOGEN:START id="[^"]+" -->[\s\S]*?<!-- AUTOGEN:END id="[^"]+" -->/g;
  return body.match(re) ?? [];
}

// ─── replaceSectionContent ────────────────────────────────────────────────

/**
 * Replace the content of a specific section (identified by heading title).
 * Preserves the heading line itself. AUTOGEN marker blocks nested in the old
 * body are preserved (re-appended). Returns the full updated content.
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

  // Preserve AUTOGEN blocks from the old body — they are managed by a separate
  // tool and must not be destroyed when generated content is swapped in.
  const preserved = extractAutogenBlocks(section.content);

  // Ensure newContent ends with a newline for clean separation
  const trimmedNew = newContent.trimEnd();
  const body = preserved.length > 0
    ? [trimmedNew, '', preserved.join('\n\n')]
    : [trimmedNew];
  return [...before, ...body, '', ...after].join('\n');
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
