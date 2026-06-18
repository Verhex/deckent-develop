import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { matchGlob } from './glob.js';
import { parseFrontmatter, hashBody, writeManagedFrontmatter } from './frontmatter.js';
import { resolveRank } from './rank-resolver.js';
import { scoreDoc } from './stale-scorer.js';
import { getFileGitDateAsync } from './git-date.js';
import { computeCodeDrift } from './code-drift.js';
import type { DocTrackingStore } from './store.js';
import type { DocRecord, DocStatus, DocTrackingConfig } from './types.js';

const toPosix = (p: string) => p.split(sep).join('/');

function isIgnored(rel: string, config: DocTrackingConfig): boolean {
  return config.trackIgnore.some(g => matchGlob(rel, g));
}

async function walkMarkdown(root: string, config: DocTrackingConfig): Promise<string[]> {
  const out: string[] = [];
  async function rec(absDir: string): Promise<void> {
    let entries;
    try { entries = await readdir(absDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = join(absDir, e.name);
      const rel = toPosix(relative(root, abs));
      if (e.isDirectory()) {
        // dir-level prune (skip node_modules/dist/.git/archive/… without descending)
        if (config.trackIgnore.some(g => matchGlob(rel, g) || matchGlob(rel + '/_probe.md', g))) continue;
        await rec(abs);
      } else if (e.isFile() && e.name.endsWith('.md')) {
        if (isIgnored(rel, config)) continue;
        out.push(rel);
      }
    }
  }
  await rec(root);
  return out;
}

export async function scanDocs(
  root: string,
  config: DocTrackingConfig,
  store: DocTrackingStore,
  opts: { write: boolean; prune: boolean; now?: number },
): Promise<{ records: DocRecord[]; skipped: string[] }> {
  const now = opts.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const files = await walkMarkdown(root, config);
  const records: DocRecord[] = [];
  const skipped: string[] = [];

  for (const rel of files) {
    const abs = join(root, rel);
    let raw: string;
    try {
      const st = await stat(abs);
      if (st.size > config.sizeCapBytes) { skipped.push(rel); continue; }
      raw = await readFile(abs, 'utf-8');
    } catch { skipped.push(rel); continue; }

    const parsed = parseFrontmatter(raw);
    const fm = parsed.data;
    const isScratch = rel.startsWith('scratch/');
    const status: DocStatus = (fm.status as DocStatus) ?? (isScratch ? 'temp' : 'active');
    const isTemp = status === 'draft' || status === 'temp';
    const doc_rank = resolveRank(rel, fm, config);
    const tracked_code = Array.isArray(fm.tracks) ? fm.tracks : null;

    const content_hash = isTemp ? null : hashBody(parsed.ok ? parsed.body : raw);
    const gitMs = await getFileGitDateAsync(root, rel);
    const last_updated = gitMs > 0 ? new Date(gitMs).toISOString() : nowIso;
    const age_days = gitMs > 0 ? Math.max(0, Math.floor((now - gitMs) / 86400000)) : 0;

    const prev = store.getByPath(rel);
    const content_drift = !!(prev?.content_hash && content_hash && prev.content_hash !== content_hash);
    const docMs = gitMs > 0 ? gitMs : now;
    const code_drift = await computeCodeDrift(root, tracked_code, docMs);
    const signals = { content_drift, code_drift, age_days };

    const { stale_score, priority_score, state } = scoreDoc({ doc_rank, status, signals }, config);

    if (opts.write && !isTemp && !config.noFrontmatter.some(g => matchGlob(rel, g))) {
      const updated = writeManagedFrontmatter(raw, { doc_rank, status, last_updated: last_updated.slice(0, 10), content_hash });
      if (updated !== raw) {
        try { await writeFile(abs, updated, 'utf-8'); } catch { /* warn-and-continue */ }
      }
    }

    const rec: DocRecord = {
      path: rel, content_hash, last_updated, doc_rank, status,
      stale_score, priority_score, state, signals, tracked_code,
      first_seen: prev?.first_seen ?? nowIso, last_scanned: nowIso,
    };
    store.upsertDoc(rec);
    records.push(rec);
  }

  if (opts.prune) store.pruneDeleted(records.map(r => r.path));
  return { records, skipped };
}
