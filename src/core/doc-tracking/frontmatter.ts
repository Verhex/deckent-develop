import { createHash } from 'node:crypto';
import type { DocFrontmatter, DocStatus } from './types.js';

const MANAGED_KEYS = ['doc_rank', 'status', 'last_updated', 'content_hash'] as const;

export function parseFrontmatter(content: string): { ok: boolean; data: DocFrontmatter; body: string } {
  if (!content.startsWith('---\n')) return { ok: false, data: {}, body: content };
  const end = content.indexOf('\n---', 4);
  if (end === -1) return { ok: false, data: {}, body: content };
  const block = content.slice(4, end);
  // body = everything after the closing '---' line; strip the blank separator
  // line(s) so the body starts at its first real line (gray-matter parity).
  // This also keeps the body identical whether a doc is scanned raw (no
  // front-matter yet) or re-scanned after front-matter was injected — without
  // it, the leading '\n' would flip content_hash and report a false drift.
  const afterClose = content.indexOf('\n', end + 1);
  const body = (afterClose === -1 ? '' : content.slice(afterClose + 1)).replace(/^\n+/, '');
  const data: DocFrontmatter = {};
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!;
    const val = m[2]!.trim();
    if (val === '') {
      // possible list
      const list: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1]!)) {
        list.push(lines[++i]!.replace(/^\s*-\s+/, '').trim());
      }
      if (list.length) (data as Record<string, unknown>)[key] = list;
    } else if (key === 'doc_rank') {
      data.doc_rank = Number.parseInt(val, 10);
    } else {
      (data as Record<string, unknown>)[key] = val;
    }
  }
  return { ok: true, data, body };
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
}

export function hashBody(body: string): string {
  return 'sha256:' + createHash('sha256').update(normalizeBody(body)).digest('hex');
}

export function writeManagedFrontmatter(
  content: string,
  fields: { doc_rank: number; status: DocStatus; last_updated: string; content_hash: string | null },
): string {
  const managed: Record<string, string> = {
    doc_rank: String(fields.doc_rank),
    status: fields.status,
    last_updated: fields.last_updated,
    content_hash: fields.content_hash ?? '<temp>',
  };
  const has = content.startsWith('---\n') && content.indexOf('\n---', 4) !== -1;
  if (!has) {
    const fm = MANAGED_KEYS.map(k => `${k}: ${managed[k]}`).join('\n');
    return `---\n${fm}\n---\n\n${content}`;
  }
  const end = content.indexOf('\n---', 4);
  const block = content.slice(4, end);
  const afterClose = content.indexOf('\n', end + 1);
  const rest = afterClose === -1 ? '' : content.slice(afterClose); // includes leading \n
  const lines = block.split('\n');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const m = /^([A-Za-z0-9_]+):/.exec(line);
    const key = m?.[1];
    if (key && (MANAGED_KEYS as readonly string[]).includes(key)) {
      out.push(`${key}: ${managed[key]}`);
      seen.add(key);
    } else {
      out.push(line);
    }
  }
  for (const k of MANAGED_KEYS) if (!seen.has(k)) out.push(`${k}: ${managed[k]}`);
  return `---\n${out.join('\n')}\n---${rest}`;
}
