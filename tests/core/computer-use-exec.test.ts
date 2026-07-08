// tests/core/computer-use-exec.test.ts
//
// Sprint 371, Task 371-003 (TOOL-CU-DILIM-3) — exec-adapter coverage for
// src/core/computer-use-exec.ts. Every spawn here is a fake (vi.fn or a plain async
// function) — no real grim/xdotool/osascript/powershell.exe is ever invoked, matching the
// task's "gerçek-spawn testte YASAK" constraint. The screenshot flows still touch a REAL
// filesystem (os.tmpdir()), exactly like tests/connectors/capabilities/screenshot.test.ts:
// the fake spawn simulates a tool's side effect by writing real bytes to the path the
// adapter passed in, so the adapter's own readFile/unlink round-trip is exercised for real.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executeComputerUseAction,
  createRealComputerUseExecSpawn,
  createRealComputerUseExecDeps,
  type ComputerUseExecSpawnFn,
  type ComputerUseExecSpawnResult,
} from '../../src/core/computer-use-exec.js';
import { computerUseActionSchema, computerUseResultSchema, type ComputerUseConfig } from '../../src/core/computer-use-contract.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xde, 0xad, 0xbe, 0xef]);

const ALL_ALLOWED: ComputerUseConfig = {
  enabled: true,
  allowed_capabilities: ['screenshot', 'click', 'type', 'navigate'],
};

function screenshotAction(region?: string) {
  return computerUseActionSchema.parse({ kind: 'screenshot', ...(region !== undefined ? { region } : {}) });
}
function clickAction(x: number, y: number, button: 'left' | 'right' | 'middle', clickCount = 1) {
  return computerUseActionSchema.parse({ kind: 'click', x, y, button, clickCount });
}
function typeAction(text: string, delayMs = 0) {
  return computerUseActionSchema.parse({ kind: 'type', text, delayMs });
}
function navigateAction() {
  return computerUseActionSchema.parse({ kind: 'navigate', url: 'https://example.com' });
}

/** Records every (cmd, args) call; dispatches to per-command fake behavior. */
function fakeSpawn(handlers: Record<string, (args: readonly string[]) => ComputerUseExecSpawnResult | Promise<ComputerUseExecSpawnResult>>): {
  spawn: ComputerUseExecSpawnFn;
  calls: Array<{ cmd: string; args: readonly string[] }>;
} {
  const calls: Array<{ cmd: string; args: readonly string[] }> = [];
  const spawn: ComputerUseExecSpawnFn = async (cmd, args) => {
    calls.push({ cmd, args });
    const handler = handlers[cmd];
    if (!handler) throw new Error(`ENOENT: ${cmd} not found (fake)`);
    return handler(args);
  };
  return { spawn, calls };
}

describe('executeComputerUseAction — flag-off / allowlist / platform reject paths (never spawns)', () => {
  it('config entirely absent → unavailable, spawn never called', async () => {
    const { spawn, calls } = fakeSpawn({ grim: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(screenshotAction(), { platform: 'linux', spawn });
    expect(result.status).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('enabled: false → unavailable, spawn never called', async () => {
    const { spawn, calls } = fakeSpawn({ grim: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(screenshotAction(), {
      config: { enabled: false, allowed_capabilities: ['screenshot'] },
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('unavailable');
    expect(calls).toHaveLength(0);
  });

  it('allowlist-dışı: enabled but action kind not in allowed_capabilities → unavailable, spawn never called', async () => {
    const { spawn, calls } = fakeSpawn({ xdotool: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(clickAction(1, 2, 'left'), {
      config: { enabled: true, allowed_capabilities: ['screenshot'] },
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/not in the resolved allowed_capabilities/);
    expect(calls).toHaveLength(0);
  });

  it('unknown platform → unavailable, spawn never called', async () => {
    const { spawn, calls } = fakeSpawn({ grim: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'freebsd', spawn });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/unsupported platform 'freebsd'/);
    expect(calls).toHaveLength(0);
  });

  it('region string in an unrecognized format → unavailable naming both accepted formats, spawn never called', async () => {
    const { spawn, calls } = fakeSpawn({ grim: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(screenshotAction('main-viewport'), {
      config: ALL_ALLOWED,
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toMatch(/not a recognized geometry/);
      expect(result.reason).toMatch(/X,Y WxH/);
      expect(result.reason).toMatch(/X,Y,W,H/);
    }
    expect(calls).toHaveLength(0);
  });

  it('region-scoped screenshot on win32/wsl is honestly unavailable (no scripted sub-rectangle path yet), spawn never called', async () => {
    const { spawn, calls } = fakeSpawn({ 'powershell.exe': () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(screenshotAction('10,20 300x200'), {
      config: ALL_ALLOWED,
      platform: 'win32',
      spawn,
    });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/not implemented on win32\/wsl/);
    expect(calls).toHaveLength(0);
  });
});

describe('executeComputerUseAction — screenshot exec path (real tmp-file round-trip via fake spawn)', () => {
  const written: string[] = [];
  function writePngAt(args: readonly string[]): ComputerUseExecSpawnResult {
    const path = args[args.length - 1] as string;
    writeFileSync(path, PNG);
    written.push(path);
    return { code: 0, stdout: '', stderr: '' };
  }

  it('linux: grim present → ok result with base64-decodable PNG bytes, file cleaned up', async () => {
    const { spawn } = fakeSpawn({ grim: writePngAt });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(Buffer.from(result.screenshotBase64 ?? '', 'base64')).toEqual(PNG);
    }
    const path = written[written.length - 1] as string;
    expect(existsSync(path)).toBe(false);
  });

  it('linux: grim absent (ENOENT) + scrot present but fails + import succeeds — tries in order, skips gnome-screenshot', async () => {
    const calls: string[] = [];
    const spawn: ComputerUseExecSpawnFn = async (cmd, args) => {
      calls.push(cmd);
      if (cmd === 'grim') throw new Error('ENOENT');
      if (cmd === 'scrot') return { code: 1, stdout: '', stderr: 'scrot: permission denied' };
      if (cmd === 'import') return writePngAt(args);
      throw new Error('gnome-screenshot should not have been tried');
    };
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('ok');
    expect(calls).toEqual(['grim', 'scrot', 'import']);
  });

  it('linux: every candidate tool absent (ENOENT) → unavailable naming all 4 tools', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toMatch(/grim, scrot, import, gnome-screenshot/);
    }
  });

  it('linux: every candidate tool present but fails (non-zero) → error (tool found, not "unavailable")', async () => {
    const { spawn } = fakeSpawn({
      grim: () => ({ code: 1, stdout: '', stderr: 'grim: no outputs' }),
      scrot: () => ({ code: 1, stdout: '', stderr: 'scrot failed' }),
      import: () => ({ code: 1, stdout: '', stderr: 'import failed' }),
      'gnome-screenshot': () => ({ code: 1, stdout: '', stderr: 'gnome-screenshot: no display' }),
    });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errorMessage).toMatch(/gnome-screenshot: no display/);
  });

  it('darwin: screencapture present → ok result with correct bytes', async () => {
    const { spawn, calls } = fakeSpawn({ screencapture: writePngAt });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('screencapture');
    expect(calls[0]?.args).toEqual(expect.arrayContaining(['-x', '-t', 'png']));
  });

  it('darwin: screencapture absent (ENOENT) → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('unavailable');
  });

  it('darwin: screencapture present but fails (non-zero) → error', async () => {
    const { spawn } = fakeSpawn({ screencapture: () => ({ code: 1, stdout: '', stderr: 'screencapture: permission denied' }) });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errorMessage).toMatch(/permission denied/);
  });

  it('win32: powershell.exe writes+returns a path → ok result read from that path', async () => {
    const winPath = join(tmpdir(), `deckent-cu-win32-${Date.now()}.png`);
    const { spawn, calls } = fakeSpawn({
      'powershell.exe': () => {
        writeFileSync(winPath, PNG);
        return { code: 0, stdout: winPath, stderr: '' };
      },
    });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(Buffer.from(result.screenshotBase64 ?? '', 'base64')).toEqual(PNG);
    expect(calls[0]?.cmd).toBe('powershell.exe');
    expect(existsSync(winPath)).toBe(false);
  });

  it('win32: powershell.exe absent (ENOENT) → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('unavailable');
  });

  it('win32: powershell.exe present but fails (non-zero) → error', async () => {
    const { spawn } = fakeSpawn({ 'powershell.exe': () => ({ code: 1, stdout: '', stderr: 'powershell: access denied' }) });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errorMessage).toMatch(/access denied/);
  });

  it('wsl: powershell.exe + wslpath translation both consulted → ok result', async () => {
    const winPath = join(tmpdir(), `deckent-cu-wsl-${Date.now()}.png`);
    writeFileSync(winPath, PNG);
    const { spawn, calls } = fakeSpawn({
      'powershell.exe': () => ({ code: 0, stdout: winPath, stderr: '' }),
      wslpath: (args) => ({ code: 0, stdout: args[args.length - 1] as string, stderr: '' }),
    });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'wsl', spawn });
    expect(result.status).toBe('ok');
    expect(calls.map((c) => c.cmd)).toEqual(['powershell.exe', 'wslpath']);
  });

  it('wsl: wslpath missing after a successful powershell capture → error (tool was found, translation failed)', async () => {
    const winPath = join(tmpdir(), `deckent-cu-wsl2-${Date.now()}.png`);
    const { spawn } = fakeSpawn({ 'powershell.exe': () => ({ code: 0, stdout: winPath, stderr: '' }) });
    const result = await executeComputerUseAction(screenshotAction(), { config: ALL_ALLOWED, platform: 'wsl', spawn });
    expect(result.status).toBe('error');
    rmSync(winPath, { force: true });
  });
});

describe('executeComputerUseAction — region-scoped screenshot exec path (born-83)', () => {
  function writePngAt(args: readonly string[]): ComputerUseExecSpawnResult {
    const path = args[args.length - 1] as string;
    writeFileSync(path, PNG);
    return { code: 0, stdout: '', stderr: '' };
  }

  it('linux: grim present → ok result, invoked with -g in grim/slurp "X,Y WxH" geometry form', async () => {
    const { spawn, calls } = fakeSpawn({ grim: writePngAt });
    const result = await executeComputerUseAction(screenshotAction('10,20 300x200'), {
      config: ALL_ALLOWED,
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(Buffer.from(result.screenshotBase64 ?? '', 'base64')).toEqual(PNG);
    expect(calls[0]?.cmd).toBe('grim');
    expect(calls[0]?.args.slice(0, 2)).toEqual(['-g', '10,20 300x200']);
  });

  it('linux: comma-only region format ("X,Y,W,H") is normalized to grim\'s own geometry form', async () => {
    const { spawn, calls } = fakeSpawn({ grim: writePngAt });
    const result = await executeComputerUseAction(screenshotAction('10,20,300,200'), {
      config: ALL_ALLOWED,
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('ok');
    expect(calls[0]?.args.slice(0, 2)).toEqual(['-g', '10,20 300x200']);
  });

  it('linux: grim absent (ENOENT), scrot present → falls back to scrot -a x,y,w,h, never tries import/gnome-screenshot', async () => {
    const calls: string[] = [];
    const spawn: ComputerUseExecSpawnFn = async (cmd, args) => {
      calls.push(cmd);
      if (cmd === 'grim') throw new Error('ENOENT');
      if (cmd === 'scrot') return writePngAt(args);
      throw new Error(`${cmd} should not have been tried for a region request`);
    };
    const result = await executeComputerUseAction(screenshotAction('10,20 300x200'), {
      config: ALL_ALLOWED,
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('ok');
    expect(calls).toEqual(['grim', 'scrot']);
  });

  it('linux: both region-capable tools absent → unavailable naming grim/scrot, import/gnome-screenshot never attempted', async () => {
    const { spawn, calls } = fakeSpawn({});
    const result = await executeComputerUseAction(screenshotAction('10,20 300x200'), {
      config: ALL_ALLOWED,
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/grim, scrot/);
    expect(calls.map((c) => c.cmd)).toEqual(['grim', 'scrot']); // import/gnome-screenshot excluded from the region chain
  });

  it('darwin: screencapture -R present → ok result with correct region-rect args', async () => {
    const { spawn, calls } = fakeSpawn({ screencapture: writePngAt });
    const result = await executeComputerUseAction(screenshotAction('10,20 300x200'), {
      config: ALL_ALLOWED,
      platform: 'darwin',
      spawn,
    });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('screencapture');
    expect(calls[0]?.args).toEqual(expect.arrayContaining(['-R', '10,20,300,200']));
  });

  it('darwin: screencapture absent → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(screenshotAction('10,20 300x200'), {
      config: ALL_ALLOWED,
      platform: 'darwin',
      spawn,
    });
    expect(result.status).toBe('unavailable');
  });
});

describe('executeComputerUseAction — click exec path', () => {
  it('linux: builds xdotool mousemove+click with button/repeat mapping', async () => {
    const { spawn, calls } = fakeSpawn({ xdotool: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(clickAction(10, 20, 'right', 2), {
      config: ALL_ALLOWED,
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('xdotool');
    expect(calls[0]?.args).toEqual(['mousemove', '10', '20', 'click', '--repeat', '2', '3']);
  });

  it('linux: xdotool absent → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(clickAction(1, 1, 'left'), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('unavailable');
  });

  it('linux: xdotool present but fails → error', async () => {
    const { spawn } = fakeSpawn({ xdotool: () => ({ code: 1, stdout: '', stderr: 'xdotool: X11 connection failed' }) });
    const result = await executeComputerUseAction(clickAction(1, 1, 'left'), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errorMessage).toMatch(/X11 connection failed/);
  });

  it('darwin: left click → osascript "click at" script, no modifier', async () => {
    const { spawn, calls } = fakeSpawn({ osascript: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(clickAction(5, 6, 'left'), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('ok');
    const script = calls[0]?.args[1] as string;
    expect(script).toContain('click at {5, 6}');
    expect(script).not.toContain('control down');
  });

  it('darwin: right click → Control-click modifier included', async () => {
    const { spawn, calls } = fakeSpawn({ osascript: () => ({ code: 0, stdout: '', stderr: '' }) });
    await executeComputerUseAction(clickAction(5, 6, 'right'), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    const script = calls[0]?.args[1] as string;
    expect(script).toContain('using {control down}');
  });

  it('darwin: middle click → honestly unavailable, osascript never invoked', async () => {
    const { spawn, calls } = fakeSpawn({ osascript: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(clickAction(5, 6, 'middle'), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/middle-button click is not supported on darwin/);
    expect(calls).toHaveLength(0);
  });

  it('win32: builds a powershell SetCursorPos/mouse_event script with the correct button flags', async () => {
    const { spawn, calls } = fakeSpawn({ 'powershell.exe': () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(clickAction(100, 200, 'right', 2), {
      config: ALL_ALLOWED,
      platform: 'win32',
      spawn,
    });
    expect(result.status).toBe('ok');
    const script = calls[0]?.args[2] as string;
    expect(script).toContain('SetCursorPos(100, 200)');
    expect(script).toContain('0x0008'); // RIGHTDOWN
    expect(script).toContain('0x0010'); // RIGHTUP
    expect(script).toContain('-lt 2');
  });

  it('wsl: click routes through the same powershell.exe path as win32', async () => {
    const { spawn, calls } = fakeSpawn({ 'powershell.exe': () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(clickAction(1, 2, 'left'), { config: ALL_ALLOWED, platform: 'wsl', spawn });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('powershell.exe');
  });
});

describe('executeComputerUseAction — type exec path', () => {
  it('linux: builds xdotool type --delay with the literal text', async () => {
    const { spawn, calls } = fakeSpawn({ xdotool: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(typeAction('hello world', 25), {
      config: ALL_ALLOWED,
      platform: 'linux',
      spawn,
    });
    expect(result.status).toBe('ok');
    expect(calls[0]?.args).toEqual(['type', '--delay', '25', '--', 'hello world']);
  });

  it('linux: xdotool absent → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(typeAction('x'), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('unavailable');
  });

  it('darwin: text is passed as a distinct osascript argv element (parametrized, no script-string interpolation)', async () => {
    const { spawn, calls } = fakeSpawn({ osascript: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(typeAction('say "hi"\\bye'), {
      config: ALL_ALLOWED,
      platform: 'darwin',
      spawn,
    });
    expect(result.status).toBe('ok');
    const args = calls[0]?.args as string[];
    expect(args[0]).toBe('-e');
    // The script text is STATIC — it never contains the (unescaped) user text.
    expect(args[1]).toBe('on run argv\n  tell application "System Events" to keystroke (item 1 of argv)\nend run');
    expect(args[1]).not.toContain('say "hi"');
    // The raw text arrives verbatim as its own argv element — no escaping needed at all,
    // because it is never embedded in script source.
    expect(args[2]).toBe('say "hi"\\bye');
  });

  it('darwin: crafted-arg injection attempt safely fails — payload never enters the AppleScript source, only ever a literal keystroke argument', async () => {
    const payload = 'x" \n tell application "Finder" to delete every item of desktop -- pwned';
    const { spawn, calls } = fakeSpawn({ osascript: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(typeAction(payload), {
      config: ALL_ALLOWED,
      platform: 'darwin',
      spawn,
    });
    expect(result.status).toBe('ok');
    const args = calls[0]?.args as string[];
    expect(args[1]).not.toContain(payload);
    expect(args[1]).not.toContain('delete every item of desktop');
    expect(args[2]).toBe(payload);
  });

  it('darwin: osascript present but fails → error', async () => {
    const { spawn } = fakeSpawn({ osascript: () => ({ code: 1, stdout: '', stderr: 'osascript: not authorized' }) });
    const result = await executeComputerUseAction(typeAction('x'), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errorMessage).toMatch(/not authorized/);
  });

  it('win32: invokes powershell.exe via -File with a STATIC param($Text) script; text passed as a distinct -Text argv element (no string-concat)', async () => {
    let capturedScript = '';
    const { spawn, calls } = fakeSpawn({
      'powershell.exe': (args) => {
        const scriptPath = args[args.indexOf('-File') + 1] as string;
        capturedScript = readFileSync(scriptPath, 'utf-8');
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    const result = await executeComputerUseAction(typeAction("a+b's%"), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('ok');
    const args = calls[0]?.args as string[];
    expect(args[0]).toBe('-NoProfile');
    expect(args[1]).toBe('-File');
    expect(args.slice(3)).toEqual(['-Text', "a{+}b's{%}"]); // SendKeys' OWN DSL escaping — orthogonal to injection safety
    expect(capturedScript).toContain('param([Parameter(Mandatory=$true)][string]$Text)');
    expect(capturedScript).toContain('SendKeys]::SendWait($Text)');
    expect(capturedScript).not.toContain("a+b's%"); // text never interpolated into the script body
  });

  it('win32: crafted-arg injection attempt safely fails — payload never enters the PowerShell script source, only ever a literal $Text parameter value', async () => {
    const payload = "'; Remove-Item -Recurse -Force C:\\temp; $x='pwned";
    let capturedScript = '';
    const { spawn, calls } = fakeSpawn({
      'powershell.exe': (args) => {
        const scriptPath = args[args.indexOf('-File') + 1] as string;
        capturedScript = readFileSync(scriptPath, 'utf-8');
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    const result = await executeComputerUseAction(typeAction(payload), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('ok');
    expect(capturedScript).not.toContain('Remove-Item');
    expect(capturedScript).not.toContain(payload);
    const args = calls[0]?.args as string[];
    expect(args[args.indexOf('-Text') + 1]).toBe(payload); // no SendKeys-special chars in this payload — passes through unescaped
  });

  it('win32: type cleans up the temp .ps1 script file after invocation', async () => {
    let scriptPathAtCallTime = '';
    const { spawn } = fakeSpawn({
      'powershell.exe': (args) => {
        scriptPathAtCallTime = args[args.indexOf('-File') + 1] as string;
        expect(existsSync(scriptPathAtCallTime)).toBe(true);
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    await executeComputerUseAction(typeAction('hi'), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(existsSync(scriptPathAtCallTime)).toBe(false);
  });

  it('wsl: type routes through the same powershell.exe -File SendKeys path as win32', async () => {
    const { spawn, calls } = fakeSpawn({ 'powershell.exe': () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(typeAction('hi'), { config: ALL_ALLOWED, platform: 'wsl', spawn });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('powershell.exe');
    expect(calls[0]?.args[1]).toBe('-File');
  });
});

describe('executeComputerUseAction — navigate exec path (born-83: real OS-level "open URL" round-trip)', () => {
  it('linux: xdg-open invoked with the URL as a plain positional argv element (no script at all)', async () => {
    const { spawn, calls } = fakeSpawn({ 'xdg-open': () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('xdg-open');
    expect(calls[0]?.args).toEqual(['https://example.com']);
  });

  it('linux: xdg-open absent → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/xdg-open/);
  });

  it('linux: xdg-open present but fails → error', async () => {
    const { spawn } = fakeSpawn({ 'xdg-open': () => ({ code: 1, stdout: '', stderr: 'xdg-open: no method available' }) });
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'linux', spawn });
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.errorMessage).toMatch(/no method available/);
  });

  it('darwin: open invoked with the URL as a plain positional argv element', async () => {
    const { spawn, calls } = fakeSpawn({ open: () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('open');
    expect(calls[0]?.args).toEqual(['https://example.com']);
  });

  it('darwin: open absent → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'darwin', spawn });
    expect(result.status).toBe('unavailable');
  });

  it('win32: invokes powershell.exe via -File with a STATIC param($Url) Start-Process script; url passed as a distinct -Url argv element', async () => {
    let capturedScript = '';
    const { spawn, calls } = fakeSpawn({
      'powershell.exe': (args) => {
        const scriptPath = args[args.indexOf('-File') + 1] as string;
        capturedScript = readFileSync(scriptPath, 'utf-8');
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('ok');
    const args = calls[0]?.args as string[];
    expect(args.slice(3)).toEqual(['-Url', 'https://example.com']);
    expect(capturedScript).toContain('param([Parameter(Mandatory=$true)][string]$Url)');
    expect(capturedScript).toContain('Start-Process -FilePath $Url');
    expect(capturedScript).not.toContain('https://example.com');
  });

  it('win32: crafted-arg (query-string) injection attempt safely fails — payload never enters the PowerShell script source, only ever a literal $Url parameter value', async () => {
    const payload = "https://evil.test/?inject=');Remove-Item -Recurse -Force /tmp/pwned;('";
    const action = computerUseActionSchema.parse({ kind: 'navigate', url: payload });
    let capturedScript = '';
    const { spawn, calls } = fakeSpawn({
      'powershell.exe': (args) => {
        const scriptPath = args[args.indexOf('-File') + 1] as string;
        capturedScript = readFileSync(scriptPath, 'utf-8');
        return { code: 0, stdout: '', stderr: '' };
      },
    });
    const result = await executeComputerUseAction(action, { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('ok');
    expect(capturedScript).not.toContain('Remove-Item');
    expect(capturedScript).not.toContain(payload);
    const args = calls[0]?.args as string[];
    expect(args[args.indexOf('-Url') + 1]).toBe(payload);
  });

  it('win32: powershell.exe absent → unavailable', async () => {
    const { spawn } = fakeSpawn({});
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'win32', spawn });
    expect(result.status).toBe('unavailable');
  });

  it('wsl: navigate routes through the same powershell.exe -File Start-Process path as win32', async () => {
    const { spawn, calls } = fakeSpawn({ 'powershell.exe': () => ({ code: 0, stdout: '', stderr: '' }) });
    const result = await executeComputerUseAction(navigateAction(), { config: ALL_ALLOWED, platform: 'wsl', spawn });
    expect(result.status).toBe('ok');
    expect(calls[0]?.cmd).toBe('powershell.exe');
  });
});

describe('executeComputerUseAction — every produced result conforms to computerUseResultSchema', () => {
  const cases: Array<{ label: string; run: () => Promise<unknown> }> = [
    {
      label: 'ok screenshot (linux)',
      run: () =>
        executeComputerUseAction(screenshotAction(), {
          config: ALL_ALLOWED,
          platform: 'linux',
          spawn: fakeSpawn({
            grim: (args) => {
              writeFileSync(args[0] as string, PNG);
              return { code: 0, stdout: '', stderr: '' };
            },
          }).spawn,
        }),
    },
    {
      label: 'error click (darwin, tool fails)',
      run: () =>
        executeComputerUseAction(clickAction(1, 2, 'left'), {
          config: ALL_ALLOWED,
          platform: 'darwin',
          spawn: fakeSpawn({ osascript: () => ({ code: 1, stdout: '', stderr: 'boom' }) }).spawn,
        }),
    },
    {
      label: 'unavailable navigate (xdg-open absent)',
      run: () =>
        executeComputerUseAction(navigateAction(), {
          config: ALL_ALLOWED,
          platform: 'linux',
          spawn: fakeSpawn({}).spawn,
        }),
    },
    {
      label: 'ok navigate (darwin, open present)',
      run: () =>
        executeComputerUseAction(navigateAction(), {
          config: ALL_ALLOWED,
          platform: 'darwin',
          spawn: fakeSpawn({ open: () => ({ code: 0, stdout: '', stderr: '' }) }).spawn,
        }),
    },
    {
      label: 'ok region-scoped screenshot (linux, grim -g)',
      run: () =>
        executeComputerUseAction(screenshotAction('10,20 300x200'), {
          config: ALL_ALLOWED,
          platform: 'linux',
          spawn: fakeSpawn({
            grim: (args) => {
              writeFileSync(args[args.length - 1] as string, PNG);
              return { code: 0, stdout: '', stderr: '' };
            },
          }).spawn,
        }),
    },
    {
      label: 'unavailable flag-off type',
      run: () => executeComputerUseAction(typeAction('x'), { platform: 'linux', spawn: fakeSpawn({}).spawn }),
    },
  ];

  for (const { label, run } of cases) {
    it(`${label} parses against computerUseResultSchema`, async () => {
      const result = await run();
      expect(() => computerUseResultSchema.parse(result)).not.toThrow();
    });
  }
});

describe('createRealComputerUseExecSpawn / createRealComputerUseExecDeps (born-83: production wiring)', () => {
  // Uses `process.execPath` (the real node binary this test itself runs under) as a
  // portable, always-present real subprocess — same precedent as
  // tests/core/orphan-cleaner-ipc.test.ts's `spawnSync(process.execPath, ...)`. This is a
  // different concern from "no real screen/input-synthesis tool in exec-adapter tests":
  // it verifies the generic spawn-wrapper plumbing (stdout/stderr accumulation, exit code,
  // ENOENT rejection), never a computer-use tool (grim/xdotool/osascript/powershell.exe).

  it('resolves code/stdout for a real successful process', async () => {
    const spawn = createRealComputerUseExecSpawn();
    const result = await spawn(process.execPath, ['-e', "process.stdout.write('hi'); process.exit(0);"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe('hi');
  });

  it('resolves a non-zero code + stderr for a real failing process', async () => {
    const spawn = createRealComputerUseExecSpawn();
    const result = await spawn(process.execPath, ['-e', "process.stderr.write('boom'); process.exit(3);"]);
    expect(result.code).toBe(3);
    expect(result.stderr).toBe('boom');
  });

  it('rejects when the binary does not exist (ENOENT) — matches the fake-spawn "throws on absent tool" contract', async () => {
    const spawn = createRealComputerUseExecSpawn();
    await expect(spawn('deckent-cu-nonexistent-binary-xyz', [])).rejects.toBeDefined();
  });

  it('createRealComputerUseExecDeps returns a real spawn + a platform string, and executeComputerUseAction never touches it when the flag is off', async () => {
    const deps = createRealComputerUseExecDeps({ enabled: false });
    expect(typeof deps.platform).toBe('string');
    expect(typeof deps.spawn).toBe('function');
    const result = await executeComputerUseAction(screenshotAction(), deps);
    expect(result.status).toBe('unavailable'); // flag-off short-circuits before the real spawn is ever invoked
  });
});
