import { existsSync, readFileSync } from 'node:fs';

const OPEN_ITEM = /^\s*- \[ \]\s*(.+?)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

/**
 * Extract open `- [ ]` checklist items from an artifact ref `file` or
 * `file#section-anchor`. With an anchor, only items under the first heading
 * whose slugified text contains the anchor (until the next same-or-higher
 * heading) are returned. Returns the stripped item text (markdown left intact).
 * A missing/unreadable file → [] (the planner falls back to free-text only).
 */
export function extractArtifactSeeds(ref: string): string[] {
  const hashIdx = ref.indexOf('#');
  const path = hashIdx >= 0 ? ref.slice(0, hashIdx) : ref;
  const anchor = hashIdx >= 0 ? ref.slice(hashIdx + 1).toLowerCase() : null;
  if (!existsSync(path)) return [];
  let lines: string[];
  try { lines = readFileSync(path, 'utf-8').split('\n'); } catch { return []; }

  let inSection = anchor === null;
  let sectionLevel = 0;
  const seeds: string[] = [];
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1]!.length;
      const slug = h[2]!.toLowerCase();
      if (anchor !== null) {
        if (!inSection && slug.includes(anchor)) { inSection = true; sectionLevel = level; continue; }
        if (inSection && level <= sectionLevel) break; // next same/higher heading ends the section
      }
      continue;
    }
    if (!inSection) continue;
    const m = OPEN_ITEM.exec(line);
    if (m) seeds.push(m[1]!);
  }
  return seeds;
}
