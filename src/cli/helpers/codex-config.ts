// ─── Codex MCP Config Generator ─────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const DECKENT_SECTION_HEADER = '[mcp_servers.deckent]';

const DECKENT_TOML_BLOCK = `${DECKENT_SECTION_HEADER}
command = "npx"
args = ["deckent", "mcp-server"]
tool_timeout_sec = 600`;

/**
 * Generate Codex App MCP config. Creates/updates ~/.codex/config.toml and .codex/config.toml.
 * Preserves existing config — only adds/updates [mcp_servers.deckent] section.
 */
export function generateCodexConfig(projectRoot: string): { global: string; project: string } {
  const globalPath = join(homedir(), '.codex', 'config.toml');
  const projectPath = join(projectRoot, '.codex', 'config.toml');

  upsertToml(globalPath);
  upsertToml(projectPath);

  return { global: globalPath, project: projectPath };
}

/**
 * Read a TOML file, merge the deckent section, and write back.
 * If the file does not exist it is created with just the deckent block.
 */
function upsertToml(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let content = '';
  if (existsSync(filePath)) {
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch {
      // Unreadable file — overwrite with fresh content
      content = '';
    }
  }

  const merged = mergeDeckentSection(content);
  writeFileSync(filePath, merged, 'utf-8');
}

/**
 * Merge or replace the [mcp_servers.deckent] section in a TOML string.
 * If absent, appends. If present, replaces the entire section (up to next section header or EOF).
 */
export function mergeDeckentSection(toml: string): string {
  const idx = toml.indexOf(DECKENT_SECTION_HEADER);

  if (idx === -1) {
    // Append — ensure blank line separator if there's existing content
    const trimmed = toml.trimEnd();
    if (trimmed.length === 0) {
      return DECKENT_TOML_BLOCK + '\n';
    }
    return trimmed + '\n\n' + DECKENT_TOML_BLOCK + '\n';
  }

  // Find end of section: next top-level `[` on its own line, or EOF
  const afterHeader = idx + DECKENT_SECTION_HEADER.length;
  const nextSection = findNextSectionStart(toml, afterHeader);

  const before = toml.slice(0, idx).trimEnd();
  const after = nextSection === -1 ? '' : toml.slice(nextSection);

  const parts: string[] = [];
  if (before.length > 0) {
    parts.push(before);
  }
  parts.push(DECKENT_TOML_BLOCK);
  if (after.length > 0) {
    parts.push(after.trimEnd());
  }

  return parts.join('\n\n') + '\n';
}

/**
 * Find the start index of the next TOML section header after `startIdx`.
 * A section header is a line starting with `[` (but not `[[` which is array-of-tables).
 */
function findNextSectionStart(toml: string, startIdx: number): number {
  const lines = toml.slice(startIdx).split('\n');
  let offset = startIdx;
  // Skip the first line (part of current header line)
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      offset += (lines[i]?.length ?? 0) + 1;
      continue;
    }
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    if (trimmed.startsWith('[') && !trimmed.startsWith('[[')) {
      return offset;
    }
    offset += line.length + 1;
  }
  return -1;
}
