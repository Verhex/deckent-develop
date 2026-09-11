import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TOOL_RESULT_DELIVERY_WITHHELD,
  withholdToolResultFromContext,
} from '../../src/agent/tool-result-retention.js';

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
    expect(stored.get(ref as string)?.toString()).toBe(body);
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

  it('does not conflate handler failure with delivery withholding', () => {
    const out = withholdToolResultFromContext({ ok: false, output: '[mcp-error] boom' }, undefined);
    expect(out.ok).toBe(false);
    expect(out.meta?.['executedOk']).toBe(false);
  });
});
