import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '../../src/core/memory-store.js';
import {
  readVerifiedSprintArchiveDocument,
  resolveSprintArchiveDir,
  sealSprintArchiveTerminal,
  type SprintArchiveTerminalSealRequest,
} from '../../src/core/sprint-archive.js';
import { readVerifiedSprintHistoricalContext } from '../../src/core/sprint-historical-context.js';
import type { SprintTerminalReceiptV1 } from '../../src/core/sprint-terminal-publication.js';

const roots: string[] = [];
const sprintId = 'sprint-7099';
const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function write(root: string, relative: string, value: string | Buffer): string {
  const path = join(root, relative); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); return path;
}

function sealedArchive(
  text: string | Buffer = '# Historical sprint\n\nUntrusted data.\n',
  oversizedVerificationArtifact = false,
): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-historical-context-')); roots.push(root);
  const receipt: SprintTerminalReceiptV1 = { version: 1, sprintId, runId: 'run-7099', coordinatorGeneration: 1,
    terminalOutcome: 'COMPLETE', logicalSettlementDigest: 'a'.repeat(64), priorAuthorityVersion: 0, authorityVersion: 1 };
  write(root, `.deckent/recently-works/${sprintId}-terminal-receipt.json`, JSON.stringify(receipt));
  write(root, `.brain/sprints/${sprintId}.md`, text);
  const core = 'historical-context worker core';
  const coreSha256 = digest(core);
  write(root, `.tasks/.worker-core-${coreSha256}.md`, core);
  write(root, '.tasks/task-7099-001.attempt-attempt-1.codex.prompt-delivery.json', JSON.stringify({
    version: 2,
    taskId: '7099-001',
    source: 'worker-prompt',
    runtimeDelivery: {
      attemptId: 'attempt-1',
      provider: 'codex',
      coreArtifactPath: `.tasks/.worker-core-${coreSha256}.md`,
      coreSha256,
      coreBytes: Buffer.byteLength(core),
      roleProfile: 'worker:implementer',
      injectionChannel: 'codex-model-instructions-file',
      contextSuppressionFlags: ['project_doc_max_bytes=0'],
      providerArgvSha256: 'b'.repeat(64),
    },
  }));
  mkdirSync(join(root, '.brain'), { recursive: true }); const memory = new MemoryStore(join(root, '.brain', 'memory.db')); memory.close();
  const journal = `${JSON.stringify({ sequence: 1 })}\n`;
  const hot = write(root, `.deckent/recently-works/${sprintId}-events.jsonl`, journal);
  write(root, `.deckent/recently-works/${sprintId}-seq`, '1');
  if (oversizedVerificationArtifact) {
    write(root, `.deckent/runtime/jobs/${sprintId}.json`, JSON.stringify({ payload: 'x'.repeat(8 * 1024 * 1024) }));
  }
  const request: SprintArchiveTerminalSealRequest = { receipt, finalEvent: { sequence: 1, digest: digest(journal.trim()) },
    hotJournalPath: hot, expectedArchivedPreimageSha256: null, expectedHotJournalSha256: digest(journal),
    operatorReason: 'owner-authorized historical context fixture' };
  expect(sealSprintArchiveTerminal(root, sprintId, request).terminalComplete).toBe(true);
  return root;
}

function readDocument(projectRoot: string, maxBytes: number) {
  return readVerifiedSprintArchiveDocument({
    projectRoot,
    sprintId,
    maxBytes,
    verificationResourceBytes: 8 * 1024 * 1024,
    artifactPath: 'docs/brain-sprint.md',
  });
}

describe('verified sprint historical context', () => {
  it('reads the complete exact docs/brain-sprint.md only after both archive verifiers pass', () => {
    const text = '# Historical sprint\n\nComplete UTF-8: İstanbul.\n';
    const root = sealedArchive(text);
    expect(readDocument(root, 4096))
      .toMatchObject({ kind: 'loaded', sprintId, artifactPath: 'docs/brain-sprint.md', bytes: Buffer.byteLength(text), text });
  });

  it('holds instead of truncating an oversized document', () => {
    const root = sealedArchive('x'.repeat(128));
    expect(readDocument(root, 32))
      .toEqual({ kind: 'hold', reasonCode: 'ARTIFACT_TOO_LARGE' });
  });

  it('does not apply the smaller note budget to the verification manifest', () => {
    const root = sealedArchive('x');
    expect(readDocument(root, 100))
      .toMatchObject({ kind: 'loaded', bytes: 1, text: 'x' });
  });

  it('holds before full verification when a canonical JSON artifact exceeds its resource budget', () => {
    const root = sealedArchive('x', true);
    expect(readDocument(root, 4096))
      .toEqual({ kind: 'hold', reasonCode: 'VERIFICATION_RESOURCE_LIMIT' });
  });

  it('bounds the actual hot journal before the canonical verifier reads it', () => {
    const root = sealedArchive('x');
    writeFileSync(
      join(root, `.deckent/recently-works/${sprintId}-events.jsonl`),
      `${'x'.repeat(8 * 1024 * 1024)}\n`,
    );
    expect(readDocument(root, 4096))
      .toEqual({ kind: 'hold', reasonCode: 'VERIFICATION_RESOURCE_LIMIT' });
  });

  it('bounds a manifested delivery receipt by actual metadata before replay parsing', () => {
    const root = sealedArchive('x');
    const archiveDir = resolveSprintArchiveDir(root, sprintId);
    const manifest = JSON.parse(readFileSync(join(archiveDir, 'manifest.json'), 'utf8')) as {
      artifacts: Array<{ path: string }>;
    };
    const delivery = manifest.artifacts.find(item => item.path.endsWith('.prompt-delivery.json'));
    expect(delivery).toBeDefined();
    writeFileSync(join(archiveDir, delivery!.path), JSON.stringify({ payload: 'x'.repeat(8 * 1024 * 1024) }));
    expect(readDocument(root, 4096))
      .toEqual({ kind: 'hold', reasonCode: 'VERIFICATION_RESOURCE_LIMIT' });
  });

  it('holds on artifact tamper and never returns partial text', () => {
    const root = sealedArchive();
    writeFileSync(join(resolveSprintArchiveDir(root, sprintId), 'docs', 'brain-sprint.md'), 'tampered secret payload');
    expect(readDocument(root, 4096))
      .toEqual({ kind: 'hold', reasonCode: 'ARCHIVE_VERIFICATION_FAILED' });
  });

  it('rejects a symlinked artifact before reading its external target', () => {
    const root = sealedArchive();
    const target = join(resolveSprintArchiveDir(root, sprintId), 'docs', 'brain-sprint.md');
    const outside = write(root, 'outside-private.txt', 'outside secret');
    unlinkSync(target); symlinkSync(outside, target);
    expect(readDocument(root, 4096))
      .toEqual({ kind: 'hold', reasonCode: 'UNSAFE_ARCHIVE_PATH' });
  });

  it('rejects invalid UTF-8 without replacement or partial text', () => {
    const root = sealedArchive(Buffer.from([0xc3, 0x28]));
    expect(readDocument(root, 4096))
      .toEqual({ kind: 'hold', reasonCode: 'INVALID_UTF8' });
  });

  it('leaves every project-private file byte-identical after a successful read', () => {
    const root = sealedArchive();
    const snapshot = (): Record<string, string> => {
      const out: Record<string, string> = {};
      const visit = (dir: string): void => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name); const stat = statSync(path);
          if (stat.isDirectory()) visit(path); else out[path.slice(root.length + 1)] = digest(readFileSync(path));
        }
      };
      visit(root); return out;
    };
    const before = snapshot();
    expect(readDocument(root, 4096).kind).toBe('loaded');
    expect(snapshot()).toEqual(before);
  });

  it('rejects invalid input and an already-aborted request without spawning verification', async () => {
    await expect(readVerifiedSprintHistoricalContext({ projectRoot: '', sprintId, maxBytes: 1, verificationTimeoutMs: 1 }))
      .resolves.toEqual({ kind: 'hold', reasonCode: 'INVALID_REQUEST' });
    await expect(readVerifiedSprintHistoricalContext({ projectRoot: '/unused', sprintId, maxBytes: 1, verificationTimeoutMs: Number.MAX_SAFE_INTEGER + 1 }))
      .resolves.toEqual({ kind: 'hold', reasonCode: 'INVALID_REQUEST' });
    await expect(readVerifiedSprintHistoricalContext({ projectRoot: '/unused', sprintId, maxBytes: 256 * 1024 * 1024 + 1, verificationTimeoutMs: 1 }))
      .resolves.toEqual({ kind: 'hold', reasonCode: 'VERIFICATION_RESOURCE_LIMIT' });
    const controller = new AbortController(); controller.abort();
    await expect(readVerifiedSprintHistoricalContext({ projectRoot: '/unused', sprintId, maxBytes: 1, verificationTimeoutMs: 1, signal: controller.signal }))
      .resolves.toEqual({ kind: 'hold', reasonCode: 'ABORTED' });
  });
});
