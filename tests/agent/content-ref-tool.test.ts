// tests/agent/content-ref-tool.test.ts
// 7110 — `deckent_read_content_ref`: digest-addressed, session-store-scoped,
// byte-capped, typed refusals; registered into the native registry only over a
// store that can read its own refs; EN/TR catalog rows for the trail + replay.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createSessionContentStore, isContentRefReader, type ContentWriter } from '../../src/agent/tool-result-broker.js';
import { alignUtf8Slice } from '../../src/agent/session-tool-content.js';
import {
  CONTENT_REF_DEFAULT_LIMIT_BYTES,
  CONTENT_REF_MAX_LIMIT_BYTES,
  CONTENT_REF_TOOL_NAME,
  defineContentRefTool,
  resolveContentRefArgs,
} from '../../src/agent/tools/content-ref-tool.js';
import { buildNativeToolRegistry, resolveToolSurfaceOptions } from '../../src/cli/repl/native-tool-registry.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { localizeNativeAgentSignal } from '../../src/cli/repl/native-agent-bridge.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function tmp(): string { const dir = mkdtempSync(join(tmpdir(), '7110-cref-')); dirs.push(dir); return dir; }
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('SessionToolContentStore.readContentRef', () => {
  it('reads bytes it wrote by digest with offset/limit, refuses unknown digests, malformed refs and bad ranges', async () => {
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const bytes = Buffer.from('0123456789-çok-uzun-içerik-'.repeat(100), 'utf8');
      const receipt = store.write(bytes);
      expect(receipt.sha256).toBe(sha(bytes));
      const head = await store.readContentRef({ sha256: receipt.sha256, offset: 0, limit: 10 });
      expect(head).toMatchObject({ kind: 'loaded', offset: 0, nextOffset: 10, totalBytes: bytes.length, sha256: receipt.sha256 });
      if (head.kind === 'loaded') expect(Buffer.from(head.bytes).toString()).toBe('0123456789');
      const tail = await store.readContentRef({ sha256: receipt.sha256, offset: bytes.length - 3, limit: 100 });
      expect(tail).toMatchObject({ kind: 'loaded', nextOffset: null });
      if (tail.kind === 'loaded') expect(tail.bytes.byteLength).toBe(3);
      const past = await store.readContentRef({ sha256: receipt.sha256, offset: bytes.length + 5, limit: 1 });
      expect(past).toMatchObject({ kind: 'loaded', nextOffset: null });
      if (past.kind === 'loaded') expect(past.bytes.byteLength).toBe(0);
      expect(await store.readContentRef({ sha256: sha(Buffer.from('never written')), offset: 0, limit: 1 })).toEqual({ kind: 'hold', reasonCode: 'CONTENT_REF_UNKNOWN' });
      expect(await store.readContentRef({ sha256: '/etc/passwd', offset: 0, limit: 1 })).toEqual({ kind: 'hold', reasonCode: 'CONTENT_REF_DENIED' });
      expect(await store.readContentRef({ sha256: receipt.sha256, offset: -1, limit: 1 })).toEqual({ kind: 'hold', reasonCode: 'CONTENT_RANGE_INVALID' });
      expect(await store.readContentRef({ sha256: receipt.sha256, offset: 0, limit: 0 })).toEqual({ kind: 'hold', reasonCode: 'CONTENT_RANGE_INVALID' });
      expect(await store.readContentRef({ sha256: receipt.sha256, offset: 0, limit: 256 * 1024 + 1 })).toEqual({ kind: 'hold', reasonCode: 'CONTENT_RANGE_INVALID' });
    } finally { store.close(); }
  });

  it('detects a tampered file (digest mismatch) and refuses everything after close', async () => {
    const store = createSessionContentStore({ dir: tmp() });
    const bytes = Buffer.from('original bytes'.repeat(10));
    const receipt = store.write(bytes);
    // Same length, different bytes — a size check alone would not notice.
    writeFileSync(receipt.path, Buffer.from('tampered  bytes'.repeat(10).slice(0, bytes.length)));
    const read = await store.readContentRef({ sha256: receipt.sha256, offset: 0, limit: 16 });
    expect(read.kind).toBe('hold');
    if (read.kind === 'hold') expect(['CONTENT_DIGEST_MISMATCH', 'CONTENT_READ_FAILED']).toContain(read.reasonCode);
    store.close();
    expect(await store.readContentRef({ sha256: receipt.sha256, offset: 0, limit: 1 })).toEqual({ kind: 'hold', reasonCode: 'CONTENT_REF_EXPIRED' });
  });
});

describe('deckent_read_content_ref tool', () => {
  it('is silent/core/builtin with a low-risk file-read classification that echoes the loop resource', () => {
    const def = defineContentRefTool(createSessionContentStore({ dir: tmp() }));
    expect(def.name).toBe(CONTENT_REF_TOOL_NAME);
    expect(def).toMatchObject({ tier: 'silent', source: 'builtin', exposure: 'core', category: 'coding', replayable: true });
    expect(def.approval!({ ref: 'a'.repeat(64) }, '')).toEqual({ scope: 'file-read', risk: 'low', scopeId: CONTENT_REF_TOOL_NAME, resource: '' });
    expect(def.approval!({ ref: '../escape' }, '')).toBeNull();
    expect((def.inputSchema as { required: string[] }).required).toEqual(['ref']);
  });

  it('validates args: digest only, byte caps at the broker preview ceiling, default slice = preview budget', () => {
    expect(resolveContentRefArgs({ ref: 'b'.repeat(64) })).toEqual({ ref: 'b'.repeat(64), offset: 0, limit: CONTENT_REF_DEFAULT_LIMIT_BYTES });
    expect(resolveContentRefArgs({ ref: 'b'.repeat(64), offset: '12', limit: 5 })).toEqual({ ref: 'b'.repeat(64), offset: 12, limit: 5 });
    expect(resolveContentRefArgs({ ref: '/tmp/deckent/x/content-abc.bin' })).toEqual({ error: 'CONTENT_REF_DENIED' });
    expect(resolveContentRefArgs({ ref: 'B'.repeat(64) })).toEqual({ error: 'CONTENT_REF_DENIED' });
    expect(resolveContentRefArgs({ ref: 'b'.repeat(64), limit: CONTENT_REF_MAX_LIMIT_BYTES + 1 })).toEqual({ error: 'CONTENT_RANGE_INVALID' });
    expect(resolveContentRefArgs({ ref: 'b'.repeat(64), offset: 1.5 })).toEqual({ error: 'CONTENT_RANGE_INVALID' });
  });

  it('reads a known digest with a meta line and returns typed [mcp-error] refusals otherwise', async () => {
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const def = defineContentRefTool(store);
      const bytes = Buffer.from('| 7110 | TERMINAL-CHECKPOINT-CONTINUITY-001 |\nsecond row\n', 'utf8');
      const receipt = store.write(bytes);
      const ok = await def.handler({ ref: receipt.sha256, limit: 12 });
      expect(ok.ok).toBe(true);
      expect(ok.output).toBe(`[deckent] read_content_ref: sha256=${receipt.sha256} offset=0 bytes=12 totalBytes=${bytes.length} hasMore=true nextOffset=12\n| 7110 | TER`);
      const rest = await def.handler({ ref: receipt.sha256, offset: 12 });
      expect(rest.ok).toBe(true);
      expect(rest.output).toContain('hasMore=false');
      expect(rest.output.endsWith('second row\n')).toBe(true);
      const unknown = await def.handler({ ref: sha(Buffer.from('unknown')) });
      expect(unknown).toEqual({ ok: false, output: `[mcp-error] ${CONTENT_REF_TOOL_NAME}: CONTENT_REF_UNKNOWN`, meta: { reasonCode: 'CONTENT_REF_UNKNOWN', code: 'native.content-ref.CONTENT_REF_UNKNOWN' } });
      expect(await def.handler({ ref: receipt.path })).toEqual({ ok: false, output: `[mcp-error] ${CONTENT_REF_TOOL_NAME}: CONTENT_REF_DENIED`, meta: { reasonCode: 'CONTENT_REF_DENIED', code: 'native.content-ref.CONTENT_REF_DENIED' } });
      expect(await def.handler({ ref: receipt.sha256, limit: CONTENT_REF_MAX_LIMIT_BYTES + 1 })).toMatchObject({ ok: false, meta: { code: 'native.content-ref.CONTENT_RANGE_INVALID' } });
    } finally { store.close(); }
  });
});

describe('native registry wiring', () => {
  it('registers the tool over a real session store and reads a spilled deckent_read_file result by digest', async () => {
    const cwd = tmp();
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const big = 'row '.repeat(40_000);
      writeFileSync(join(cwd, 'big.txt'), big);
      const reg = buildNativeToolRegistry({ cwd: () => cwd, contentStore: store });
      const def = reg.get(CONTENT_REF_TOOL_NAME);
      expect(def).toBeDefined();
      expect(def!.tier).toBe('silent');
      const rendered = await reg.get('deckent_read_file')!.handler({ path: 'big.txt' });
      const marker = /sha256:([a-f0-9]{64})/.exec(rendered.output);
      expect(marker).not.toBeNull();
      const slice = await def!.handler({ ref: marker![1], offset: big.length - 8, limit: 64 });
      expect(slice.ok).toBe(true);
      expect(slice.output.endsWith('row row ')).toBe(true);
      expect(slice.output).toContain(`totalBytes=${big.length} hasMore=false`);
    } finally { store.close(); }
  });

  it('B2: replayability is an explicit allow-list — pure reads only; call_tool, CLI-bridge, run-flow and MCP tools never', () => {
    const cwd = tmp();
    const bridge = { listTools: () => [{ namespacedName: 'mcp:fs_read', descriptor: { description: 'read', inputSchema: {} } }], dispatch: async () => ({ ok: true, output: '' }) };
    const reg = buildNativeToolRegistry({ cwd: () => cwd, contentStore: createSessionContentStore({ dir: tmp() }), mcpBridge: bridge, toolSurface: resolveToolSurfaceOptions({ enabled: true, progressive: true })! });
    for (const name of ['deckent_read_file', 'deckent_list_dir', 'deckent_grep', 'deckent_glob', 'deckent_git_status', 'deckent_git_log', 'deckent_git_diff', CONTENT_REF_TOOL_NAME]) {
      expect(reg.get(name)?.replayable, name).toBe(true);
    }
    for (const name of ['deckent_write_file', 'deckent_edit_file', 'deckent_bash', 'deckent_git_add', 'deckent_git_commit', 'deckent_call_tool', 'deckent_search_tools', 'deckent_describe_tool', 'deckent_status', 'deckent_skill_dispatch', 'mcp:fs_read']) {
      expect(reg.get(name), name).toBeDefined();
      expect(reg.get(name)?.replayable, name).not.toBe(true);
    }
    expect(reg.get('deckent_call_tool')?.tier).toBe('silent');
  });

  it('stays absent over a write-only content writer or no store at all (honest absence, never a failing handler)', () => {
    const writer: ContentWriter = { write(bytes) { return { path: 'mem', sha256: sha(bytes) }; } };
    expect(isContentRefReader(writer)).toBe(false);
    expect(buildNativeToolRegistry({ cwd: () => tmp(), contentStore: writer }).get(CONTENT_REF_TOOL_NAME)).toBeUndefined();
    expect(buildNativeToolRegistry({ cwd: () => tmp() }).get(CONTENT_REF_TOOL_NAME)).toBeUndefined();
  });
});

describe('7110 i18n rows', () => {
  const KEYS = [
    'native.checkpoint.replay-served',
    'native.checkpoint.trail.heading',
    'native.checkpoint.trail.read_hint',
    'native.checkpoint.trail.status_ok',
    'native.checkpoint.trail.status_failed',
    'native.checkpoint.trail.last_assistant',
    'native.checkpoint.trail.replay_note',
    'native.checkpoint.trail.omitted',
    'native.checkpoint.pressure-suppressed',
    'native.content-ref.CONTENT_REF_DENIED',
    'native.content-ref.CONTENT_REF_UNKNOWN',
    'native.content-ref.CONTENT_REF_EXPIRED',
    'native.content-ref.CONTENT_DIGEST_MISMATCH',
    'native.content-ref.CONTENT_RANGE_INVALID',
    'native.content-ref.CONTENT_READ_FAILED',
    'native.content-ref.CONTENT_READ_UNSUPPORTED',
  ] as const;
  it.each(KEYS)('%s exists in EN and TR and differs between them', (key) => {
    const en = getMessage(key, 'en');
    const tr = getMessage(key, 'tr');
    expect(en).not.toBe(key);
    expect(tr).not.toBe(key);
    expect(en.length).toBeGreaterThan(0);
    expect(tr.length).toBeGreaterThan(0);
    expect(en).not.toBe(tr);
  });
  it('the replay notice code localizes through the bridge signal path', () => {
    const en = localizeNativeAgentSignal((key) => getMessage(key, 'en'), 'native.checkpoint.replay-served', 'raw');
    const tr = localizeNativeAgentSignal((key) => getMessage(key, 'tr'), 'native.checkpoint.replay-served', 'raw');
    expect(en).toBe(getMessage('native.checkpoint.replay-served', 'en'));
    expect(tr).toBe(getMessage('native.checkpoint.replay-served', 'tr'));
    expect(en).not.toBe('raw');
  });
  it('content-ref refusal codes localize through the bridge signal path (they ride the tool-result `code`)', () => {
    const en = localizeNativeAgentSignal((key) => getMessage(key, 'en'), 'native.content-ref.CONTENT_REF_UNKNOWN', 'raw');
    expect(en).toBe(getMessage('native.content-ref.CONTENT_REF_UNKNOWN', 'en'));
    expect(en).not.toBe('raw');
  });
  it('the read hint carries the {tool} placeholder in both languages', () => {
    expect(getMessage('native.checkpoint.trail.read_hint', 'en')).toContain('{tool}');
    expect(getMessage('native.checkpoint.trail.read_hint', 'tr')).toContain('{tool}');
  });
});

describe('B4 — UTF-8 boundary-safe slicing (store + tool)', () => {
  const SOURCE = 'A😀BçC'; // bytes: A(1) 😀(4) B(1) ç(2) C(1) = 9
  const SRC = Buffer.from(SOURCE, 'utf8');
  async function collect(store: ReturnType<typeof createSessionContentStore>, sha256: string, limit: number, start = 0) {
    const chunks: Buffer[] = []; const offsets: number[] = []; let offset: number | null = start;
    while (offset !== null) {
      const read = await store.readContentRef({ sha256, offset, limit });
      if (read.kind !== 'loaded') throw new Error(read.reasonCode);
      chunks.push(Buffer.from(read.bytes)); offsets.push(read.offset); offset = read.nextOffset;
      if (chunks.length > SRC.length + 2_048) throw new Error('no progress');
    }
    return { bytes: Buffer.concat(chunks), offsets, chunks };
  }

  it.each([1, 2, 3, 4, 5, 9, 100])('limit %i: following nextOffset reproduces the source bytes exactly and never splits a character', async (limit) => {
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const { sha256 } = store.write(SRC);
      const { bytes, chunks } = await collect(store, sha256, limit);
      expect(bytes.equals(SRC)).toBe(true);
      expect(chunks.map((c) => c.toString('utf8')).join('')).toBe(SOURCE);
      for (const c of chunks) {
        expect(c.byteLength).toBeGreaterThan(0);
        expect(c.toString('utf8')).not.toContain('\uFFFD');
        expect(c.byteLength).toBeLessThanOrEqual(Math.max(limit, 4));
      }
      if (limit <= 3) expect(chunks.map((c) => c.toString('utf8'))).toEqual(limit === 3 ? ['A', '😀', 'Bç', 'C'] : limit === 2 ? ['A', '😀', 'B', 'ç', 'C'] : ['A', '😀', 'B', 'ç', 'C']);
    } finally { store.close(); }
  });

  it('offset at every byte: a start inside a sequence snaps forward to the next boundary and says so; boundaries are byte-exact', async () => {
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const { sha256 } = store.write(SRC);
      const expected: Array<[number, number, string]> = [
        [0, 0, 'A😀BçC'], [1, 1, '😀BçC'], [2, 5, 'BçC'], [3, 5, 'BçC'], [4, 5, 'BçC'], [5, 5, 'BçC'], [6, 6, 'çC'], [7, 8, 'C'], [8, 8, 'C'],
      ];
      for (const [offset, effective, text] of expected) {
        const read = await store.readContentRef({ sha256, offset, limit: 100 });
        if (read.kind !== 'loaded') throw new Error(read.reasonCode);
        expect([offset, read.offset, Buffer.from(read.bytes).toString('utf8')]).toEqual([offset, effective, text]);
        if (effective !== offset) expect(read.snappedFrom).toBe(offset); else expect(read.snappedFrom).toBeUndefined();
        expect(read.nextOffset).toBeNull();
      }
    } finally { store.close(); }
  });

  it('default cap boundary: a multibyte character straddling the 16384-byte limit is deferred whole to the next slice', async () => {
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const source = 'x'.repeat(CONTENT_REF_DEFAULT_LIMIT_BYTES - 2) + '😀' + 'tail';
      const src = Buffer.from(source, 'utf8');
      const { sha256 } = store.write(src);
      const def = defineContentRefTool(store);
      const first = await def.handler({ ref: sha256 });
      expect(first.ok).toBe(true);
      expect(first.output).toContain(`offset=0 bytes=${CONTENT_REF_DEFAULT_LIMIT_BYTES - 2} totalBytes=${src.length} hasMore=true nextOffset=${CONTENT_REF_DEFAULT_LIMIT_BYTES - 2}`);
      expect(first.output).not.toContain('\uFFFD');
      const second = await def.handler({ ref: sha256, offset: CONTENT_REF_DEFAULT_LIMIT_BYTES - 2 });
      expect(second.output.endsWith('\n😀tail')).toBe(true);
      expect(second.output).toContain('hasMore=false');
      const { bytes } = await collect(store, sha256, CONTENT_REF_DEFAULT_LIMIT_BYTES);
      expect(bytes.equals(src)).toBe(true);
    } finally { store.close(); }
  });

  it('the reviewer case: tool reads "A😀BçC" with limit 3 following nextOffset → "A😀BçC", never "A��BçC"', async () => {
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const { sha256 } = store.write(SRC);
      const def = defineContentRefTool(store);
      let offset: number | null = 0; let text = ''; const metas: string[] = [];
      while (offset !== null) {
        const out = await def.handler({ ref: sha256, offset, limit: 3 });
        expect(out.ok).toBe(true);
        const [meta, ...rest] = out.output.split('\n');
        metas.push(meta!); text += rest.join('\n');
        const next = /nextOffset=(\d+)/.exec(meta!);
        offset = next ? Number(next[1]) : null;
      }
      expect(text).toBe(SOURCE);
      expect(metas[0]).toContain('offset=0 bytes=1 totalBytes=9 hasMore=true nextOffset=1');
      expect(metas[1]).toContain('offset=1 bytes=4 totalBytes=9 hasMore=true nextOffset=5');
      const snapped = await def.handler({ ref: sha256, offset: 3, limit: 3 });
      expect(snapped.output).toContain('offset=5 snappedFrom=3 bytes=3');
    } finally { store.close(); }
  });

  it('binary / malformed bytes are never repaired or dropped: a random buffer round-trips exactly at any limit', async () => {
    const store = createSessionContentStore({ dir: tmp() });
    try {
      const raw = Buffer.alloc(1_003); for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + 13) & 0xff;
      raw[0] = 0x80; raw[raw.length - 1] = 0xf0; // continuation at 0, truncated lead at EOF
      const { sha256 } = store.write(raw);
      for (const limit of [1, 3, 7, 64, 1_003, 5_000]) {
        const { bytes } = await collect(store, sha256, limit);
        expect(bytes.equals(raw)).toBe(true);
      }
    } finally { store.close(); }
  });

  it('alignUtf8Slice unit contract: back-off, over-return for a too-small limit, EOF tail, malformed lead', () => {
    const smile = Buffer.from('😀'); const window = Buffer.concat([smile, Buffer.from('BC')]);
    expect(alignUtf8Slice(window, { offset: 0, lookbehind: 0, limit: 2, eofInWindow: true })).toEqual({ start: 0, end: 4 }); // slice would be empty → whole char
    expect(alignUtf8Slice(Buffer.concat([Buffer.from('A'), smile, Buffer.from('B')]), { offset: 0, lookbehind: 0, limit: 3, eofInWindow: true })).toEqual({ start: 0, end: 1 });
    expect(alignUtf8Slice(Buffer.concat([Buffer.from('A'), smile]), { offset: 0, lookbehind: 0, limit: 3, eofInWindow: true })).toEqual({ start: 0, end: 1 }); // completion present in lookahead
    expect(alignUtf8Slice(Buffer.from([0x41, 0xf0, 0x9f]), { offset: 0, lookbehind: 0, limit: 3, eofInWindow: true })).toEqual({ start: 0, end: 3 }); // EOF tail as stored
    expect(alignUtf8Slice(Buffer.from([0x41, 0xf0, 0x9f, 0x41, 0x41]), { offset: 0, lookbehind: 0, limit: 3, eofInWindow: false })).toEqual({ start: 0, end: 3 }); // malformed → cut at byte
    // offset 3 inside 😀 (lookbehind shows the well-formed lead) → snaps to 4
    expect(alignUtf8Slice(Buffer.from([0xf0, 0x9f, 0x98, 0x80, 0x42, 0x43]), { offset: 3, lookbehind: 3, limit: 2, eofInWindow: true })).toEqual({ start: 4, end: 6, snappedFrom: 3 });
    // continuation-looking bytes with NO well-formed lead before them (binary) never snap
    expect(alignUtf8Slice(Buffer.from([0x41, 0x42, 0x43, 0x98, 0x80, 0x42]), { offset: 3, lookbehind: 3, limit: 2, eofInWindow: true })).toEqual({ start: 3, end: 5 });
    expect(alignUtf8Slice(Buffer.from([0x98, 0x80, 0x42, 0x43]), { offset: 0, lookbehind: 0, limit: 2, eofInWindow: false })).toEqual({ start: 0, end: 2 });
  });
});
