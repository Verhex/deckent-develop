import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TOOL_RESULT_DELIVERY_WITHHELD,
  withholdToolResultFromContext,
} from '../../src/agent/tool-result-retention.js';
import { createSessionContentStore } from '../../src/agent/tool-result-broker.js';

describe('withholdToolResultFromContext', () => {
  it('preserves executedOk and spills full bytes when store is available', () => {
    const stored = new Map<string, Buffer>();
    const body = `echoed:${'payload-'.repeat(400)}`;
    const out = withholdToolResultFromContext({ ok: true, output: body }, {
      write(bytes) {
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const path = `content:${sha256}`;
        stored.set(path, bytes);
        return { path, sha256 };
      },
    });
    expect(out.ok).toBe(true);
    expect(out.meta?.['executedOk']).toBe(true);
    expect(out.meta?.['delivery']).toBe(TOOL_RESULT_DELIVERY_WITHHELD);
    const ref = out.meta?.['resultRef'];
    expect(typeof ref).toBe('string');
    expect(ref).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.get(`content:${ref}`)?.toString()).toBe(body);
    expect(out.meta?.['spillSha256']).toBe(ref);
    expect(out.output).toContain(`sha256:${ref}`);
    expect(Buffer.byteLength(out.output, 'utf8')).toBeLessThan(256);
  });

  it('marks ref unavailable when store write fails without flipping executedOk', () => {
    const out = withholdToolResultFromContext({ ok: true, output: 'secret-body' }, {
      write() {
        throw new Error('store down');
      },
    });
    expect(out.ok).toBe(true);
    expect(out.meta?.['executedOk']).toBe(true);
    expect(out.meta?.['resultRef']).toBeUndefined();
    expect(out.output).toContain('ref unavailable');
  });

  it('rejects store receipt when sha256 does not match payload', () => {
    const out = withholdToolResultFromContext({ ok: true, output: 'tampered' }, {
      write() {
        return { path: 'content:deadbeef', sha256: '0'.repeat(64) };
      },
    });
    expect(out.meta?.['resultRef']).toBeUndefined();
    expect(out.output).toContain('ref unavailable');
  });

  it('does not conflate handler failure with delivery withholding', () => {
    const out = withholdToolResultFromContext({ ok: false, output: '[mcp-error] boom' }, undefined);
    expect(out.ok).toBe(false);
    expect(out.meta?.['executedOk']).toBe(false);
  });

  it('spills to session store and resolves byte-identical bytes via readContentRef', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'withhold-reader-'));
    const store = createSessionContentStore({ dir });
    try {
      const body = `payload-${'x'.repeat(500)}`;
      const out = withholdToolResultFromContext({ ok: true, output: body }, store);
      expect(out.meta?.['delivery']).toBe(TOOL_RESULT_DELIVERY_WITHHELD);
      const ref = out.meta?.['resultRef'];
      expect(typeof ref).toBe('string');
      const read = await store.readContentRef({ sha256: ref as string, offset: 0, limit: 256 * 1024 });
      expect(read.kind).toBe('loaded');
      if (read.kind === 'loaded') {
        expect(Buffer.from(read.bytes).toString('utf8')).toBe(body);
      }
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
