import { join } from 'node:path';
import { loadDocTrackingConfig } from './config.js';
import { scanDocs } from './scanner.js';
import { DocTrackingStore } from './store.js';

// DB-only sync: scans all docs into .brain/memory.db without mutating
// front-matter or pruning. Used by the sprint-finalize hook and MCP.
export async function runDocTrackingSync(root: string): Promise<{ count: number; stale: number }> {
  const config = loadDocTrackingConfig(root);
  const store = new DocTrackingStore(join(root, '.brain/memory.db'));
  try {
    const { records } = await scanDocs(root, config, store, { write: false, prune: false });
    const stale = records.filter((r) => r.state === 'STALE' || r.state === 'CRITICAL_STALE').length;
    return { count: records.length, stale };
  } finally {
    store.close();
  }
}
