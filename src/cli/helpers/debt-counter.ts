/** debt-counter.ts — DB-first debt counting via MemoryStore. Sprint 145 T-009. */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { MemoryStore } from '../../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';

function openStore(root: string): MemoryStore | null {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return null;
  try {
    return new MemoryStore(dbPath);
  } catch {
    return null;
  }
}

export function countDebtItems(root: string): { total: number; critical: number } {
  const store = openStore(root);
  if (!store) return { total: 0, critical: 0 };
  try {
    const entries = store.getByType('debt');
    const critical = entries.filter(e => e.priority === 'CRITICAL' || e.priority === 'critical').length;
    return { total: entries.length, critical };
  } catch {
    return { total: 0, critical: 0 };
  }
}

export function countOpenDebtItems(root: string): number {
  const store = openStore(root);
  if (!store) return 0;
  try {
    const entries = store.getByType('debt');
    return entries.filter(e => e.status !== 'resolved' && e.status !== 'closed').length;
  } catch {
    return 0;
  }
}
