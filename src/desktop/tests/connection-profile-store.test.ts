/**
 * DESK-B2 (born-496 §392-002) — connection-profile-store.ts.
 *
 * Contract under test:
 *   - write: atomic (no .tmp residue), mode 0600, add() stamps id (uuid) + createdAt.
 *   - read: never throws — corrupt JSON / non-array JSON is treated as empty +
 *     surfaces `corrupted: true`; schema-invalid entries are dropped + counted
 *     (`invalidDropped`), valid siblings survive.
 *   - CRUD roundtrips through an explicit `baseDir` (hermetic — never touches
 *     the real ~/.deckent).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createConnectionProfileStore,
  DEFAULT_CONNECTION_PROFILE_STORE_DIR,
  type ConnectionProfileInput,
} from '../src/main/connection-profile-store';

describe('connection-profile-store (DESK-B2 CRUD store)', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'deckent-desktop-profile-store-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  const input: ConnectionProfileInput = {
    label: 'My Workstation',
    kind: 'local',
    projectPath: '/home/alperen/workspace',
    host: '127.0.0.1',
    port: 3211,
    autoStart: true,
    orphanShutdownOnQuit: true,
  };

  it('never touches the real home directory when baseDir is injected', () => {
    const store = createConnectionProfileStore({ baseDir });
    expect(store.filePath.startsWith(baseDir)).toBe(true);
    expect(store.filePath.startsWith(DEFAULT_CONNECTION_PROFILE_STORE_DIR)).toBe(false);
  });

  it('list() returns an empty result when no file exists yet', () => {
    const store = createConnectionProfileStore({ baseDir });
    expect(store.list()).toEqual({ profiles: [], invalidDropped: 0, corrupted: false });
  });

  it('add() stamps a fresh uuid id and an ISO createdAt', () => {
    const store = createConnectionProfileStore({ baseDir });
    const profile = store.add(input);
    expect(profile.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(() => new Date(profile.createdAt).toISOString()).not.toThrow();
    expect(profile.createdAt).toBe(new Date(profile.createdAt).toISOString());
    expect(profile.label).toBe(input.label);
  });

  it('CRUD roundtrip: add -> list -> get -> remove -> list', () => {
    const store = createConnectionProfileStore({ baseDir });
    const added = store.add(input);

    expect(store.list().profiles).toEqual([added]);
    expect(store.get(added.id)).toEqual(added);

    expect(store.remove(added.id)).toBe(true);
    expect(store.list().profiles).toEqual([]);
    expect(store.get(added.id)).toBeUndefined();
  });

  it('get() returns undefined for an unknown id', () => {
    const store = createConnectionProfileStore({ baseDir });
    store.add(input);
    expect(store.get('00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });

  it('remove() returns false and writes nothing for an unknown id', () => {
    const store = createConnectionProfileStore({ baseDir });
    store.add(input);
    expect(store.remove('00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(store.list().profiles).toHaveLength(1);
  });

  it('multiple add() calls produce unique ids', () => {
    const store = createConnectionProfileStore({ baseDir });
    const a = store.add(input);
    const b = store.add({ ...input, label: 'Second' });
    expect(a.id).not.toBe(b.id);
    expect(store.list().profiles.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('leaves no .tmp residue after a write (atomic temp+rename)', () => {
    const store = createConnectionProfileStore({ baseDir });
    store.add(input);
    expect(readdirSync(baseDir)).toEqual(['connection-profiles.json']);
  });

  it('writes the file with mode 0600', () => {
    const store = createConnectionProfileStore({ baseDir });
    store.add(input);
    const mode = statSync(store.filePath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('treats non-JSON file content as empty and surfaces corrupted: true', () => {
    mkdirSync(baseDir, { recursive: true });
    const store = createConnectionProfileStore({ baseDir });
    writeFileSync(store.filePath, 'not-json{', 'utf-8');
    expect(store.list()).toEqual({ profiles: [], invalidDropped: 0, corrupted: true });
  });

  it('treats a non-array JSON document as empty and surfaces corrupted: true', () => {
    mkdirSync(baseDir, { recursive: true });
    const store = createConnectionProfileStore({ baseDir });
    writeFileSync(store.filePath, JSON.stringify({ not: 'an-array' }), 'utf-8');
    expect(store.list()).toEqual({ profiles: [], invalidDropped: 0, corrupted: true });
  });

  it('drops schema-invalid entries and reports the count, keeping valid siblings', () => {
    mkdirSync(baseDir, { recursive: true });
    const store = createConnectionProfileStore({ baseDir });
    const valid = {
      id: '11111111-1111-4111-8111-111111111111',
      label: 'Valid',
      kind: 'local',
      projectPath: '/p',
      host: '127.0.0.1',
      port: 3000,
      autoStart: false,
      orphanShutdownOnQuit: false,
      createdAt: new Date().toISOString(),
    };
    const invalid = { label: 'Missing required fields' };
    writeFileSync(store.filePath, JSON.stringify([valid, invalid]), 'utf-8');

    const result = store.list();
    expect(result.corrupted).toBe(false);
    expect(result.invalidDropped).toBe(1);
    expect(result.profiles).toEqual([valid]);
  });

  it('add() does not add a token field (schema-intentional omission)', () => {
    const store = createConnectionProfileStore({ baseDir });
    const profile = store.add(input);
    expect('token' in profile).toBe(false);
    expect((profile as Record<string, unknown>)['token']).toBeUndefined();
  });
});
