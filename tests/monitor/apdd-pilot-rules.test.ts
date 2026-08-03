// APDD (Sprint 351, row 423) — regression tests for the PILOT_ADR_RULES
// dedup/taxonomy-fix in `checkADRCompliance` (src/monitor/auditor.ts).
//
// Evidence this file locks in:
// 1. `.brain/memory.db` no longer carries literal ids `adr-006`/`adr-008` after the
//    ADR-G-019 taxonomy rename — real ids are `adr-g-002` (spawnSync) and `adr-d-004`
//    (Layer-1 import direction). The legacy `ADR-006` PILOT_ADR_RULES key stays inert
//    against real DB content (redundant with `checkAdr006` in authority-enforcer.ts,
//    per docs/adr/adr-g-002-spawnsync-security.md — see auditor.ts comment for why it
//    was not deleted outright: two auditor.test.ts tests outside this task's write
//    scope hardcode the synthetic legacy id).
// 2. The `ADR-008` key was remapped to `ADR-D-004` (docs/adr/adr-d-004-brain-central-
//    import.md confirms this specific brain-family edge is not machine-scanned
//    anywhere else, so it must be kept — just remapped).
// 3. The id-transform bug (`.replace(/^adr-/i, 'ADR-')` only uppercased the prefix,
//    yielding `ADR-d-004` instead of `ADR-D-004`) is fixed via `.toUpperCase()`.
// 4. The remapped rule's own `'from.*brain'`-style pattern used to self-match its own
//    definition line (this file is itself a scanned target) — fixed by requiring a
//    real `from\s+['"]` import prefix.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkADRCompliance } from '../../src/monitor/auditor.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../../src/orchestra/event-stream.js', () => ({
  writeEvent: vi.fn(),
  readEvents: vi.fn().mockReturnValue([]),
  CHANNELS: {
    VERIFICATION_RESULT: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
    ADR_VIOLATION: 'AUDITOR→BRAIN:ADR_VIOLATION',
    GATE_COMPUTED: 'AUDITOR→BRAIN:GATE_COMPUTED',
    LOAD_REPORT_WRITTEN: 'AUDITOR→BRAIN:LOAD_REPORT_WRITTEN',
    SCOPE_COLLISION_DETECTED: 'AUDITOR→BRAIN:SCOPE_COLLISION_DETECTED',
    DEPENDENCY_VIOLATION: 'AUDITOR→BRAIN:DEPENDENCY_VIOLATION',
    ORPHAN_HB_DETECTED: 'AUDITOR→BRAIN:ORPHAN_HB_DETECTED',
    AUTHORITY_VIOLATION: 'AUDITOR→BRAIN:AUTHORITY_VIOLATION',
  },
}));

const mockMemStore = {
  getByType: vi.fn().mockReturnValue([]),
  getById: vi.fn().mockReturnValue(null),
  close: vi.fn(),
  totalCount: vi.fn().mockReturnValue(0),
};
vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn().mockImplementation(() => mockMemStore),
}));

import { readFileSync, existsSync } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedExistsSync = vi.mocked(existsSync);

function seedAdr(id: string, title: string, content = 'irrelevant'): void {
  mockMemStore.getByType.mockImplementation((type: string) => {
    if (type === 'adr') {
      return [{
        id, type: 'adr', title, status: 'accepted', content,
        metadata: '{}', created_at: '', updated_at: '', deleted_at: null,
      }];
    }
    return [];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(true);
  mockMemStore.getByType.mockReturnValue([]);
});

describe('APDD — legacy ADR-006 key is inert against real taxonomy DB content', () => {
  it('does not fire when the DB carries the real id adr-g-002 (spawnSync now lives in authority-enforcer.ts)', () => {
    seedAdr('adr-g-002', 'spawnSync Security Pattern');
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      // A file that WOULD have triggered the old dead ADR-006 pilot pattern.
      if (path.includes('src/some-file.ts')) {
        return `spawnSync('cmd', { shell: true });\n`;
      }
      return '';
    });

    const violations = checkADRCompliance('/project', ['src/some-file.ts']);

    expect(violations).toHaveLength(0);
  });
});

describe('APDD — ADR-008 remapped to ADR-D-004 (brain-family reverse-import check)', () => {
  it('fires with the real taxonomy id adr-d-004 and reports the canonical uppercase adrId', () => {
    seedAdr('adr-d-004', 'Layer-1 Import Direction (Brain-Family Boundary)');
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('src/agents/worker.ts')) {
        return `import { brainStatus } from '../orchestra/brain.js';\n`;
      }
      return '';
    });

    const violations = checkADRCompliance('/project', ['src/agents/worker.ts']);

    expect(violations).toHaveLength(1);
    expect(violations[0]!.adrId).toBe('ADR-D-004');
    expect(violations[0]!.severity).toBe('error');
  });

  it('does not fire for the same file when it has no brain import (clean)', () => {
    seedAdr('adr-d-004', 'Layer-1 Import Direction (Brain-Family Boundary)');
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('src/agents/worker.ts')) {
        return `import { writeEvent } from '../orchestra/event-stream.js';\n`;
      }
      return '';
    });

    const violations = checkADRCompliance('/project', ['src/agents/worker.ts']);

    expect(violations).toHaveLength(0);
  });

  it('ignores files outside the rule targetFiles list even with a brain import', () => {
    seedAdr('adr-d-004', 'Layer-1 Import Direction (Brain-Family Boundary)');
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('src/unrelated.ts')) {
        return `import { brainStatus } from '../orchestra/brain.js';\n`;
      }
      return '';
    });

    const violations = checkADRCompliance('/project', ['src/unrelated.ts']);

    expect(violations).toHaveLength(0);
  });

  it('regression guard: the rule does not self-match its own definition text', () => {
    seedAdr('adr-d-004', 'Layer-1 Import Direction (Brain-Family Boundary)');
    // The literal PILOT_ADR_RULES pattern-definition line from auditor.ts — proves
    // the hardened regex (real \s+['"] required) does not false-positive on itself
    // when this file is scanned as one of its own targetFiles.
    mockedReadFileSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('src/monitor/auditor.ts')) {
        return "    pattern: \"from\\\\s+['\\\"][^'\\\"]*brain\",";
      }
      return '';
    });

    const violations = checkADRCompliance('/project', ['src/monitor/auditor.ts']);

    expect(violations).toHaveLength(0);
  });
});
