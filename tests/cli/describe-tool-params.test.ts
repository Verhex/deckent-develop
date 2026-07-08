// tests/cli/describe-tool-params.test.ts
// born-521 — `deckent_describe_tool` always reported an empty `params` array
// for every bridged tool because `buildToolSurfaceCatalog` registered every
// tool with a generic `z.record(...)` placeholder (a ZodRecord, not a
// ZodObject), and `summarizeEagerSchema` only extracts fields off a
// ZodObject. Regression-guards the fix: a bridged tool with a real
// `inputSchema` must report its actual field names/types/optionality.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';

describe('deckent_describe_tool — params (born-521)', () => {
  it('reports non-empty params for a bridged tool with a real object inputSchema', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const r = await reg.get('deckent_describe_tool')!.handler({ name: 'deckent_read_file' });
    expect(r.ok).toBe(true);
    const desc = JSON.parse(r.output) as { params: Array<{ name: string; type: string; optional: boolean }> };
    expect(desc.params).not.toEqual([]);
    expect(desc.params).toEqual([{ name: 'path', type: 'string', optional: false }]);
  });

  it('marks non-required fields optional and preserves declared field types', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const r = await reg.get('deckent_describe_tool')!.handler({ name: 'deckent_write_file' });
    expect(r.ok).toBe(true);
    const desc = JSON.parse(r.output) as { params: Array<{ name: string; type: string; optional: boolean }> };
    expect(desc.params.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'content', type: 'string', optional: false },
      { name: 'path', type: 'string', optional: false },
    ]);
  });

  it('a native meta-tool with a declared string+number schema also reports real params', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const r = await reg.get('deckent_describe_tool')!.handler({ name: 'deckent_bash' });
    expect(r.ok).toBe(true);
    const desc = JSON.parse(r.output) as { params: Array<{ name: string; type: string; optional: boolean }> };
    expect(desc.params).toEqual([{ name: 'cmd', type: 'string', optional: false }]);
  });

  it('does not fabricate fields for a schema-less bridged tool (empty properties stays empty)', async () => {
    const reg = buildNativeToolRegistry({ cwd: () => tmpdir(), toolSurface: { enabled: true } });
    const r = await reg.get('deckent_describe_tool')!.handler({ name: 'deckent_status' });
    expect(r.ok).toBe(true);
    const desc = JSON.parse(r.output) as { params: unknown[] };
    expect(desc.params).toEqual([]);
  });
});
