// Durable task→container registry (orphan-worker defect).
//
// The backend's in-memory `containers` map dies with the process that spawned
// the container. Every other process — `deckent kill`, `finalize --force`'s
// worker sweep — then found nothing and reported a live worker as already dead,
// while it kept running and writing. Container names are attempt-derived, so a
// human could not recover the link from `docker ps` either. These tests pin the
// durable record that restores the link without trusting a name pattern.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';

const REGISTRY_DIR = ['.deckent', 'runtime', 'containers'];

function registryPath(root: string, taskId: string): string {
  return join(root, ...REGISTRY_DIR, `${taskId}.json`);
}

/** A record shaped exactly as the backend writes it at spawn time. */
function writeRegistryRecord(root: string, taskId: string, over: Record<string, unknown> = {}): void {
  const path = registryPath(root, taskId);
  mkdirSync(join(root, ...REGISTRY_DIR), { recursive: true });
  writeFileSync(path, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'deckent-docker-container-registry-v1',
    taskId,
    containerId: 'a'.repeat(64),
    containerName: `deckent-x-${'b'.repeat(8)}`,
    model: 'claude-sonnet-5',
    projectDir: root,
    tasksDir: join(root, '.tasks'),
    backend: 'docker',
    recordedAt: new Date().toISOString(),
    ...over,
  })}\n`, 'utf-8');
}

describe('docker backend — durable task→container registry', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-container-registry-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('resolves a container recorded by ANOTHER process (empty in-memory map)', () => {
    writeRegistryRecord(root, '901-001');
    // A brand-new backend instance models the separate `kill` / `finalize` CLI
    // process: its `containers` map has never seen this task.
    const backend = SpawnBackendFactory.create({ backend: 'docker', projectDir: root });
    // Reaching the container at all is the assertion: before the durable
    // record, this threw "No exact Docker container authority is registered".
    expect(() => backend.kill('901-001')).not.toThrow(/No exact Docker container authority/u);
  });

  it('still refuses an unknown task — a missing record is never guessed from a name', () => {
    const backend = SpawnBackendFactory.create({ backend: 'docker', projectDir: root });
    expect(() => backend.kill('901-404')).toThrow(/No exact Docker container authority/u);
  });

  it('rejects a malformed container id rather than acting on it', () => {
    writeRegistryRecord(root, '901-002', { containerId: 'not-a-container-id' });
    const backend = SpawnBackendFactory.create({ backend: 'docker', projectDir: root });
    expect(() => backend.kill('901-002')).toThrow(/No exact Docker container authority/u);
  });

  it('rejects a record whose taskId does not match its filename', () => {
    writeRegistryRecord(root, '901-003', { taskId: '901-999' });
    const backend = SpawnBackendFactory.create({ backend: 'docker', projectDir: root });
    expect(() => backend.kill('901-003')).toThrow(/No exact Docker container authority/u);
  });

  it('rejects a foreign record kind', () => {
    writeRegistryRecord(root, '901-004', { kind: 'something-else' });
    const backend = SpawnBackendFactory.create({ backend: 'docker', projectDir: root });
    expect(() => backend.kill('901-004')).toThrow(/No exact Docker container authority/u);
  });

  it('KEEPS the record when removal does not succeed — a live worker must stay findable', () => {
    // The container id is synthetic, so `docker rm` cannot succeed here. That is
    // exactly the failure shape the registry must survive: clearing the link on
    // a failed teardown would strand a still-running worker untracked again.
    writeRegistryRecord(root, '901-005');
    const backend = SpawnBackendFactory.create({ backend: 'docker', projectDir: root });
    try { backend.kill('901-005'); } catch { /* docker may be absent entirely */ }
    expect(existsSync(registryPath(root, '901-005'))).toBe(true);
  });

  it('keeps the record human-readable — an operator can map task to container', () => {
    writeRegistryRecord(root, '901-006');
    const parsed = JSON.parse(readFileSync(registryPath(root, '901-006'), 'utf-8')) as Record<string, unknown>;
    expect(parsed.taskId).toBe('901-006');
    expect(String(parsed.containerName)).toMatch(/^deckent-x-/u);
    expect(typeof parsed.recordedAt).toBe('string');
  });
});
