import { describe, it, expect } from 'vitest';
import { EventEmitter, Readable, Writable } from 'node:stream';

// .mjs ESM script — vitest resolves it via the project root.
import {
  classifySurface,
  formatReport,
  runAudit,
} from '../../scripts/audit-user-surfaces.mjs';

// ─── mock helpers ─────────────────────────────────────────────────────────────

interface MockChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  killed: boolean;
  kill: (signal?: string) => boolean;
}

function makeChild(opts: {
  stdout?: string;
  stderr?: string;
  exit?: number | null;
  exitDelayMs?: number;
} = {}): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = Readable.from([opts.stdout ?? '']);
  child.stderr = Readable.from([opts.stderr ?? '']);
  child.stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  child.killed = false;
  child.kill = (_sig?: string) => {
    child.killed = true;
    return true;
  };
  setTimeout(() => {
    child.emit('exit', opts.exit ?? 0);
  }, opts.exitDelayMs ?? 1);
  return child;
}

function makeFetchResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return body;
    },
  };
}

// ─── classifySurface (pure logic) ─────────────────────────────────────────────

describe('audit-user-surfaces — classifySurface', () => {
  it('serve REAL when http_root=200, token present, api/status=200', () => {
    const v = classifySurface({ surface: 'serve', httpRoot: 200, tokenPresent: true, apiStatus: 200 });
    expect(v.real).toBe(true);
    expect(v.hollow_reason).toBeUndefined();
  });

  it('serve HOLLOW when http_root=200 but token missing (Sprint 214 regression)', () => {
    const v = classifySurface({ surface: 'serve', httpRoot: 200, tokenPresent: false, apiStatus: 200 });
    expect(v.real).toBe(false);
    expect(v.hollow_reason).toMatch(/token/i);
  });

  it('serve HOLLOW when http_root=200 but /api/status=401', () => {
    const v = classifySurface({ surface: 'serve', httpRoot: 200, tokenPresent: true, apiStatus: 401 });
    expect(v.real).toBe(false);
    expect(v.hollow_reason).toMatch(/api\/status=401/);
  });

  it('chat REAL when stdout has content and exit=0', () => {
    const v = classifySurface({ surface: 'chat', stdout: 'merhaba kullanıcı', errored: false, exitCode: 0 });
    expect(v.real).toBe(true);
  });

  it('chat HOLLOW when stdout is empty', () => {
    const v = classifySurface({ surface: 'chat', stdout: '   ', errored: false, exitCode: 0 });
    expect(v.real).toBe(false);
    expect(v.hollow_reason).toMatch(/empty/i);
  });

  it('chat HOLLOW when process errored (non-zero exit)', () => {
    const v = classifySurface({ surface: 'chat', stdout: '', errored: true, exitCode: 1 });
    expect(v.real).toBe(false);
    expect(v.hollow_reason).toMatch(/errored/i);
  });
});

// ─── formatReport ─────────────────────────────────────────────────────────────

describe('audit-user-surfaces — formatReport', () => {
  it('renders markdown with one row per surface and REAL/HOLLOW counts', () => {
    const md = formatReport(
      [
        { surface: 'serve', real: true, evidence: 'http_root=200 token=1 api_status=200' },
        { surface: 'chat', real: false, evidence: 'exit=1', hollow_reason: 'errored' },
      ],
      { generatedAt: '2026-06-01T00:00:00.000Z' },
    );
    expect(md).toContain('# User-Surface Re-Audit Report');
    expect(md).toContain('| serve | REAL |');
    expect(md).toContain('| chat | HOLLOW |');
    expect(md).toContain('REAL: 1');
    expect(md).toContain('HOLLOW: 1');
  });

  it('renders SKIPPED report when distSkipped=true', () => {
    const md = formatReport([], { distSkipped: true, generatedAt: '2026-06-01T00:00:00.000Z' });
    expect(md).toMatch(/SKIPPED/);
    expect(md).toMatch(/npm run build/);
  });
});

// ─── runAudit (mock spawn + fetch, hermetic) ──────────────────────────────────

describe('audit-user-surfaces — runAudit hermetic', () => {
  it('REAL serve + REAL chat produces a report listing all three surfaces with REAL count = 3', async () => {
    const html = '<html><script>window.__DECKENT_API_TOKEN__ = "tok"</script></html>';
    const spawnFn: any = (_cmd: string, args: string[]) => {
      const subcmd = args[1];
      if (subcmd === 'serve') return makeChild({ stdout: 'listening', exit: 0, exitDelayMs: 200 });
      return makeChild({ stdout: 'Selam! Yardımcı olabilirim.', exit: 0, exitDelayMs: 1 });
    };
    const fetchFn: any = async (url: string) => {
      if (url.endsWith('/api/status')) return makeFetchResponse(200, '{"ok":true}');
      return makeFetchResponse(200, html);
    };

    const { results, report, distSkipped } = await runAudit({
      projectRoot: '/tmp/audit-fixture',
      distExists: true,
      spawnFn,
      fetchFn,
      port: 39111,
    });

    expect(distSkipped).toBe(false);
    expect(results).toHaveLength(3);
    expect(results.map((r: { surface: string }) => r.surface).sort()).toEqual(
      ['chat', 'dashboard', 'serve'],
    );
    const realCount = results.filter((r: { real: boolean }) => r.real).length;
    expect(realCount).toBe(3);
    expect(report).toContain('| serve | REAL |');
    expect(report).toContain('| dashboard | REAL |');
    expect(report).toContain('| chat | REAL |');
  });

  it('HOLLOW detection: serve returns 200 but no token + chat empty → both flagged HOLLOW', async () => {
    const html = '<html><body>no token here</body></html>';
    const spawnFn: any = (_cmd: string, args: string[]) => {
      const subcmd = args[1];
      if (subcmd === 'serve') return makeChild({ stdout: 'listening', exit: 0, exitDelayMs: 200 });
      return makeChild({ stdout: '', exit: 0, exitDelayMs: 1 });
    };
    const fetchFn: any = async (url: string) => {
      if (url.endsWith('/api/status')) return makeFetchResponse(401, 'unauthorized');
      return makeFetchResponse(200, html);
    };

    const { results, report } = await runAudit({
      projectRoot: '/tmp/audit-fixture',
      distExists: true,
      spawnFn,
      fetchFn,
      port: 39222,
    });

    const serve = results.find((r: { surface: string }) => r.surface === 'serve');
    const dashboard = results.find((r: { surface: string }) => r.surface === 'dashboard');
    const chat = results.find((r: { surface: string }) => r.surface === 'chat');

    expect(serve.real).toBe(false);
    expect(serve.hollow_reason).toMatch(/token/i);
    expect(dashboard.real).toBe(false);
    expect(chat.real).toBe(false);
    expect(chat.hollow_reason).toMatch(/empty/i);
    expect(report).toContain('HOLLOW: 3');
  });

  it('dist-not-present → distSkipped=true, no spawn, report marked SKIPPED', async () => {
    let spawnCalls = 0;
    let fetchCalls = 0;
    const spawnFn: any = () => {
      spawnCalls++;
      return makeChild();
    };
    const fetchFn: any = async () => {
      fetchCalls++;
      return makeFetchResponse(200, '');
    };

    const { results, report, distSkipped } = await runAudit({
      projectRoot: '/tmp/no-dist-here',
      distExists: false,
      spawnFn,
      fetchFn,
    });

    expect(distSkipped).toBe(true);
    expect(results).toHaveLength(0);
    expect(spawnCalls).toBe(0);
    expect(fetchCalls).toBe(0);
    expect(report).toMatch(/SKIPPED/);
  });

  it('serve process is killed in finally even when fetch succeeds (no leaked children)', async () => {
    const killed: boolean[] = [];
    const html = '<html><script>__DECKENT_API_TOKEN__</script></html>';
    const spawnFn: any = (_cmd: string, args: string[]) => {
      const child = makeChild({
        stdout: args[1] === 'serve' ? 'listening' : 'cevap',
        exit: 0,
        exitDelayMs: 500,
      });
      const originalKill = child.kill;
      child.kill = (sig?: string) => {
        killed.push(true);
        return originalKill.call(child, sig);
      };
      return child;
    };
    const fetchFn: any = async (url: string) => {
      if (url.endsWith('/api/status')) return makeFetchResponse(200, 'ok');
      return makeFetchResponse(200, html);
    };

    await runAudit({
      projectRoot: '/tmp/audit-fixture',
      distExists: true,
      spawnFn,
      fetchFn,
      port: 39333,
    });

    expect(killed.length).toBeGreaterThanOrEqual(1);
  });
});
