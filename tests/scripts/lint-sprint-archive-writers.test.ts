import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkSprintArchiveWriters,
  inspectSprintArchiveWriterSource,
  portableArchivePath,
} from '../../scripts/lint-sprint-archive-writers.mjs';

const roots: string[] = [];
function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-archive-writer-gate-'));
  roots.push(value);
  mkdirSync(join(value, 'src', 'orchestra'), { recursive: true });
  return value;
}
afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

function codes(source: string, filename = 'src/orchestra/new-writer.ts'): string[] {
  const provenance = `
    import {
      copyFileSync, linkSync, mkdirSync, mkdtempSync, openSync,
      readFileSync, renameSync, unlinkSync, writeFileSync,
    } from 'node:fs';
    import { join } from 'node:path';
  `;
  return inspectSprintArchiveWriterSource(`${provenance}\n${source}`, filename).map(problem => problem.code);
}

describe('sprint archive writer ratchet', () => {
  it('rejects a new production raw legacy archive writer', () => {
    const fixture = root();
    writeFileSync(join(fixture, 'src', 'orchestra', 'new-writer.ts'),
      "import { writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\nwriteFileSync(join(root, '.brain', 'archive', 'sprints', sprintId, 'events.jsonl'), bytes);\n");
    const result = checkSprintArchiveWriters(fixture);
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([expect.objectContaining({ code: 'SPRINT_ARCHIVE_RAW_WRITER' })]);
  });

  it('resolves const targets before classifying archive writes', () => {
    expect(codes(`
      const archiveRoot = join(root, '.deckent', 'archive');
      const target = join(archiveRoot, 'sprints', sprintId, 'events.jsonl');
      writeFileSync(target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('resolves variable assignments before classifying archive writes', () => {
    expect(codes(`
      let target;
      target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
      writeFileSync(target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('keeps same-name targets decidable across lexical scopes', () => {
    expect(codes(`
      function persistArchive(root, sprintId, bytes) {
        const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
        writeFileSync(target, bytes);
      }
      function persistReport(root, bytes) {
        const target = join(root, 'reports', 'events.jsonl');
        writeFileSync(target, bytes);
      }
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('resolves imported fs symbols and imported path aliases', () => {
    expect(codes(`
      import { writeFileSync as persist } from 'node:fs';
      import { join as pathJoin } from 'node:path';
      const target = pathJoin(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json');
      persist(target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('resolves namespace and variable aliases for createWriteStream', () => {
    expect(codes(`
      import * as filesystem from 'node:fs';
      import * as paths from 'node:path';
      const streamFactory = filesystem.createWriteStream;
      const archivePath = paths.join(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
      streamFactory(archivePath);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('rejects const and alias-computed filesystem mutation members', () => {
    expect(codes(`
      import * as filesystem from 'node:fs';
      const mutation = 'writeFileSync';
      const method = mutation;
      const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
      filesystem[method](target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('resolves computed node:fs and node:path namespace members', () => {
    expect(codes(`
      import * as filesystem from 'node:fs';
      import * as paths from 'node:path';
      filesystem['writeFileSync'](
        paths['join'](root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl'),
        bytes,
      );
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('resolves dynamic import namespaces and destructured methods', () => {
    expect(codes(`
      const filesystem = await import('node:fs');
      const { join: pathJoin } = await import('node:path');
      const { writeFileSync: persist } = await import('node:fs');
      const target = pathJoin(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
      filesystem['appendFileSync'](target, bytes);
      persist(target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER', 'SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('resolves direct dynamic import and require computed members', () => {
    expect(codes(`
      const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
      (await import('node:fs'))['writeFileSync'](target, bytes);
      require('node:fs')['appendFileSync'](target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER', 'SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('resolves fs promises and native path namespace imports', () => {
    expect(codes(`
      import { promises as filesystem } from 'node:fs';
      import { win32 as nativePath } from 'node:path';
      const target = nativePath.join(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
      filesystem.writeFile(target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it.each([
    ['mkdirSync', "mkdirSync(target, { recursive: true });"],
    ['copyFileSync', "copyFileSync(source, target);"],
    ['linkSync', "linkSync(source, target);"],
    ['renameSync', "renameSync(source, target);"],
  ])('treats %s archive destinations as writes', (_name, invocation) => {
    expect(codes(`
      const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'artifact');
      ${invocation}
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('treats mutating open flags as writes but leaves read-only open alone', () => {
    expect(codes(`
      const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json');
      openSync(target, 'r');
      openSync(target, 'wx');
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('rejects destructive canonical archive roots', () => {
    expect(codes(`
      import { rmSync as remove } from 'node:fs';
      import { join as pathJoin } from 'node:path';
      const archiveRoot = pathJoin(root, '.deckent', 'archive', 'sprints');
      remove(archiveRoot, { recursive: true, force: true });
    `)).toEqual(['SPRINT_ARCHIVE_DESTRUCTIVE_ROOT']);
  });

  it('allows canonical authority symbols and denies unknown symbols in the same file', () => {
    const problems = inspectSprintArchiveWriterSource(`
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      function publishSprintArchiveArtifact(root, sprintId, bytes) {
        writeFileSync(join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json'), bytes);
      }
      function unknownWriter(root, sprintId, bytes) {
        writeFileSync(join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json'), bytes);
      }
    `, 'src\\core\\sprint-archive.ts');
    expect(portableArchivePath('src\\core\\sprint-archive.ts')).toBe('src/core/sprint-archive.ts');
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'SPRINT_ARCHIVE_RAW_WRITER',
        detail: expect.stringContaining('unknownWriter'),
      }),
    ]);
  });

  it('separates verified legacy retirement from an unknown destructive caller', () => {
    const problems = inspectSprintArchiveWriterSource(`
      import { unlinkSync } from 'node:fs';
      import { join } from 'node:path';
      function reconcileSprintArchive(root, sprintId) {
        unlinkSync(join(root, '.tasks', 'archive', sprintId, 'task.json'));
      }
      function unknownRetirement(root, sprintId) {
        unlinkSync(join(root, '.tasks', 'archive', sprintId, 'task.json'));
      }
    `, 'src/core/sprint-archive.ts');
    expect(problems).toEqual([
      expect.objectContaining({
        code: 'SPRINT_ARCHIVE_LEGACY_RETIREMENT',
        detail: expect.stringContaining('unknownRetirement'),
      }),
    ]);
  });

  it('normalizes native Windows separators in resolved target values', () => {
    expect(codes(String.raw`
      const target = 'C:\\repo\\.deckent\\archive\\sprints\\sprint-1\\events.jsonl';
      writeFileSync(target, bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('does not classify archive reads or copy sources as writers', () => {
    expect(codes(`
      const archived = join(root, '.deckent', 'archive', 'sprints', sprintId, 'events.jsonl');
      readFileSync(archived);
      openSync(archived, 'r');
      copyFileSync(archived, join(root, 'restore', 'events.jsonl'));
    `, 'src/orchestra/migration-reader.ts')).toEqual([]);
  });

  it('propagates the canonical resolver and imported archive constants', () => {
    expect(codes(`
      import { DECKENT_DIR as controlDir } from '../../core/constants.js';
      import { resolveSprintArchiveDir as archiveFor } from '../../core/sprint-archive.js';
      writeFileSync(join(archiveFor(root, sprintId), 'events.jsonl'), bytes);
      writeFileSync(join(root, controlDir, 'archive', 'sprints', sprintId, 'manifest.json'), bytes);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER', 'SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('propagates object properties plus local wrapper arguments and returns', () => {
    expect(codes(`
      const destinations = {
        archive: join(root, '.deckent', 'archive', 'sprints', sprintId),
      };
      function archivePath(root, sprintId) {
        return join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json');
      }
      function persist(directory, name, value) {
        writeFileSync(join(directory, name), value);
      }
      writeFileSync(join(destinations.archive, 'events.jsonl'), bytes);
      writeFileSync(archivePath(root, sprintId), bytes);
      persist(destinations.archive, 'wrapped.json', bytes);
    `)).toEqual([
      'SPRINT_ARCHIVE_RAW_WRITER',
      'SPRINT_ARCHIVE_RAW_WRITER',
      'SPRINT_ARCHIVE_RAW_WRITER',
    ]);
  });

  it('fails closed when an archive-derived mutation target remains unresolved', () => {
    expect(codes(`
      import { resolveSprintArchiveDir } from '../../core/sprint-archive.js';
      function opaque(value) { return externalTransform(value); }
      writeFileSync(opaque(join(resolveSprintArchiveDir(root, sprintId), 'events.jsonl')), bytes);
    `)).toEqual(['SPRINT_ARCHIVE_UNRESOLVED_MUTATION_TARGET']);
  });

  it('resolves destructured node:fs namespace methods and mkdtemp writers', () => {
    expect(codes(`
      import * as filesystem from 'node:fs';
      const { writeFileSync: persist } = filesystem;
      const archive = join(root, '.deckent', 'archive', 'sprints', sprintId);
      persist(join(archive, 'events.jsonl'), bytes);
      mkdtempSync(join(archive, '.transaction-'));
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER', 'SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it('scans JS, MJS, CJS, and JSX production sources', () => {
    const fixture = root();
    const esm = (marker: string) => `
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      writeFileSync(join(root, '.deckent', 'archive', 'sprints', sprintId, '${marker}'), bytes);
    `;
    writeFileSync(join(fixture, 'src', 'orchestra', 'writer.js'), esm('js'));
    writeFileSync(join(fixture, 'src', 'orchestra', 'writer.mjs'), esm('mjs'));
    writeFileSync(join(fixture, 'src', 'orchestra', 'writer.jsx'), esm('jsx'));
    writeFileSync(join(fixture, 'src', 'orchestra', 'writer.cjs'), `
      const { writeFileSync } = require('node:fs');
      const { join } = require('node:path');
      writeFileSync(join(root, '.deckent', 'archive', 'sprints', sprintId, 'cjs'), bytes);
    `);

    const result = checkSprintArchiveWriters(fixture);

    expect(result.ok).toBe(false);
    expect(result.problems.map(problem => problem.file)).toEqual([
      'src/orchestra/writer.cjs',
      'src/orchestra/writer.js',
      'src/orchestra/writer.jsx',
      'src/orchestra/writer.mjs',
    ]);
  });

  it('requires exact node:fs provenance and rejects same-name authority spoofing', () => {
    const archiveExpression = "join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json')";
    expect(inspectSprintArchiveWriterSource(`
      import { join } from 'node:path';
      const filesystem = { writeFileSync() {} };
      filesystem.writeFileSync(${archiveExpression}, bytes);
    `, 'src/orchestra/foreign-fs.ts')).toEqual([]);
    expect(inspectSprintArchiveWriterSource(`
      import { writeFileSync } from 'foreign-fs';
      import { join } from 'node:path';
      writeFileSync(${archiveExpression}, bytes);
    `, 'src/orchestra/foreign-import.ts')).toEqual([]);

    const spoof = inspectSprintArchiveWriterSource(`
      import { writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      class Spoof {
        reconcileSprintArchive(root, sprintId, bytes) {
          writeFileSync(${archiveExpression}, bytes);
        }
      }
    `, 'src/core/sprint-archive.ts');
    expect(spoof).toEqual([expect.objectContaining({ code: 'SPRINT_ARCHIVE_RAW_WRITER' })]);
  });

  it('rejects direct metrics rotation mutations while accepting the canonical publisher', () => {
    const metrics = inspectSprintArchiveWriterSource(`
      import { linkSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { resolveSprintArchiveDir } from './sprint-archive.js';
      export function rotateMetricsFile(root, sprintId, bytes) {
        const temporary = join(resolveSprintArchiveDir(root, sprintId), 'metrics', '.transaction');
        const destination = join(resolveSprintArchiveDir(root, sprintId), 'metrics', 'metrics.gz');
        mkdirSync(join(resolveSprintArchiveDir(root, sprintId), 'metrics'), { recursive: true });
        writeFileSync(temporary, bytes);
        linkSync(temporary, destination);
        unlinkSync(temporary);
      }
    `, 'src/core/observability-rotation.ts');
    expect(metrics.map(problem => problem.code)).toEqual([
      'SPRINT_ARCHIVE_RAW_WRITER',
      'SPRINT_ARCHIVE_RAW_WRITER',
      'SPRINT_ARCHIVE_RAW_WRITER',
      'SPRINT_ARCHIVE_DESTRUCTIVE_ROOT',
    ]);

    const publisher = inspectSprintArchiveWriterSource(`
      import { publishSprintArchiveArtifact } from './sprint-archive.js';
      export async function rotateMetricsFile(root, sprintId, bytes) {
        await publishSprintArchiveArtifact(root, sprintId, 'metrics/metrics.gz', bytes);
      }
    `, 'src/core/observability-rotation.ts');
    expect(publisher).toEqual([]);
  });

  it('rejects observability-local terminal admission while accepting canonical delegation', () => {
    const directProbe = inspectSprintArchiveWriterSource(`
      import { existsSync } from 'node:fs';
      import { join } from 'node:path';
      import { resolveSprintArchiveDir } from './sprint-archive.js';
      function assertMetricsArchiveNamespaceWritable(root, sprintId) {
        const archive = resolveSprintArchiveDir(root, sprintId);
        return !existsSync(join(archive, 'terminal-seal-application.json'));
      }
    `, 'src/core/observability-rotation.ts');
    expect(directProbe).toEqual([
      expect.objectContaining({ code: 'SPRINT_ARCHIVE_TERMINAL_ADMISSION_BYPASS' }),
    ]);

    const canonicalDelegation = inspectSprintArchiveWriterSource(`
      import { publishSprintArchiveArtifact } from './sprint-archive.js';
      export function rotateMetricsFile(root, sprintId, stagingPath) {
        return publishSprintArchiveArtifact(
          root,
          sprintId,
          stagingPath,
          'metrics/metrics.jsonl.gz',
        );
      }
    `, 'src/core/observability-rotation.ts');
    expect(canonicalDelegation).toEqual([]);
  });

  it('recognizes only provenance-bound read-only open flags', () => {
    expect(codes(`
      import { constants } from 'node:fs';
      import * as filesystem from 'node:fs';
      const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json');
      openSync(target, constants.O_RDONLY);
      openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      openSync(target, filesystem.constants.O_RDONLY | filesystem.constants.O_CLOEXEC);
      openSync(target, 0);
    `)).toEqual([]);

    expect(codes(`
      const constants = { O_RDONLY: 0 };
      const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json');
      openSync(target, constants.O_RDONLY);
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });

  it.each([
    'O_WRONLY',
    'O_RDWR',
    'O_CREAT',
    'O_TRUNC',
    'O_APPEND',
    'O_EXCL',
    'O_TMPFILE',
  ])('treats node:fs constants.%s as a mutating open flag', flag => {
    expect(codes(`
      import { constants } from 'node:fs';
      const target = join(root, '.deckent', 'archive', 'sprints', sprintId, 'manifest.json');
      openSync(target, constants.${flag});
    `)).toEqual(['SPRINT_ARCHIVE_RAW_WRITER']);
  });
});
