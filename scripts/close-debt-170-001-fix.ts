/**
 * One-off: mark debt-170-001-fix resolved with honest Phase-4.5 closure note.
 *
 * Context:
 *  - Spec: docs/superpowers/specs/2026-05-19-embedded-web-terminal-design.md
 *  - Approved by Alperen 2026-05-20 (Sprint 175 unblock).
 *  - Root cause established via systematic-debugging Phase 1 + Phase 4.5
 *    (3+ failed identical-mode fixes = architectural loop, not a code bug).
 *
 * Action: non-destructive upsert of the existing debt entry — status → 'resolved',
 * metadata.resolvedInSprintId='sprint-175', metadata.resolution=<full note below>.
 * NO row deletion, NO schema change. memory.db remains intact.
 *
 * Run with:  npx tsx scripts/close-debt-170-001-fix.ts
 */
import { join, resolve } from 'node:path';
import { MemoryStore } from '../src/core/memory-store.js';

const DEBT_ID = 'debt-170-001-fix';
const RESOLVED_IN = 'sprint-175';

const CLOSURE_NOTE = `Resolved via Sprint 175 architectural closure (systematic-debugging Phase 4.5).

Original 170-001 code (tmux taskId-aware prompt) landed in commit 5ffbf3e, verified
present at src/orchestra/tmux.ts:61-70. The "missing .result" was a docker HB
shutdown artifact from a worker process whose state is permanently un-reproducible
(cleanup completed long since). The structural cause is already addressed by the
Docker HB Core Fix (Sprint 138 Task 13, src/agents/worker.ts:297 atomic write +
fsync + SIGTERM grace) for future tasks.

Auto-debt-injection (sprint-planner.ts:197-216) produced empty-scope tasks that
could not resolve a bookkeeping artifact. Re-injection across 4 sprints (170 -> 174,
175 dry-run) was a Phase-4.5 architectural loop (3+ failed identical-mode fixes).
Closure is honest acknowledgment of the historical artifact + verified-in-repo
code — NOT a code change.

Architectural follow-up (auto-debt-injection empty-scope bug) deferred to
sub-project #2 (self-security procedure) per Alperen 2026-05-20.`;

const projectRoot = resolve(process.cwd());
const dbPath = join(projectRoot, '.brain', 'memory.db');

const store = new MemoryStore(dbPath);
try {
  const entry = store.getById(DEBT_ID);
  if (!entry) {
    console.error(`✗ Debt entry ${DEBT_ID} not found in DB`);
    process.exit(2);
  }
  if (entry.status === 'resolved') {
    console.log(`• Already resolved (no-op): ${DEBT_ID}`);
    process.exit(0);
  }

  console.log(`Found ${DEBT_ID}:`);
  console.log(`  status=${entry.status}  priority=${entry.priority}  sprint=${entry.sprint_id ?? '-'}`);

  const meta = JSON.parse(entry.metadata || '{}') as Record<string, unknown>;
  const tags = entry.tag_text ? entry.tag_text.split(' ').filter(Boolean) : [];

  store.upsert(
    {
      id: entry.id,
      type: entry.type,
      title: entry.title,
      content: entry.content,
      source: entry.source,
      summary: entry.summary ?? undefined,
      tags,
      status: 'resolved',
      priority: entry.priority ?? undefined,
      sprint_id: entry.sprint_id ?? undefined,
      sprint_num: entry.sprint_num ?? undefined,
      lang: entry.lang ?? undefined,
      metadata: {
        ...meta,
        resolvedInSprintId: RESOLVED_IN,
        resolution: CLOSURE_NOTE,
      },
    },
    'brain',
  );

  const verify = store.getById(DEBT_ID);
  console.log(`✓ Updated. New status: ${verify?.status}`);
  const newMeta = JSON.parse(verify?.metadata || '{}') as Record<string, unknown>;
  console.log(`  metadata.resolvedInSprintId=${newMeta['resolvedInSprintId']}`);
  console.log(`  metadata.resolution attached (${(newMeta['resolution'] as string)?.length ?? 0} chars)`);
} finally {
  store.close();
}
