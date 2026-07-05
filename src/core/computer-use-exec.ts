// ═══ Computer-Use Exec Adapter — TOOL-CU dilim-3 (Sprint 371, Task 371-003) ═════
// The first REAL adapter layered on dilim-1's contract (computer-use-contract.ts) and
// dilim-2's platform negotiation (computer-use-platform.ts). `executeComputerUseAction`
// resolves flag+allowlist availability first, then — for screenshot/click/type — invokes
// the platform-appropriate external tool through an INJECTED async spawn. This module
// never spawns a real subprocess of its own accord in tests: every test in
// computer-use-exec.test.ts supplies a fake spawn, matching the "gerçek-araç çağrısı yok"
// constraint. `navigate` stays honestly not-implemented (no browser-driver bridge exists
// anywhere in the codebase), mirroring dilim-2's own not-implemented mapping.
//
// Tool selection mirrors dilim-2's CAPABILITY_TOOLS table:
// - screenshot: grim/scrot/import/gnome-screenshot (linux), screencapture (darwin),
//   powershell.exe (win32/wsl) — grounded in the already-shipped
//   src/connectors/capabilities/builtin/screenshot.ts adapter (same tool list, same
//   try-next-on-failure linux fallback, same PS-script + wslpath translation for wsl).
// - click/type: xdotool (linux), System Events via osascript (darwin), powershell.exe
//   (win32/wsl) — dilim-2 documented these as a "known-tool hypothesis a future adapter
//   would build against"; this file is that adapter.
//
// Honestly-declared gaps (Law #2 — fail honestly, never silently):
// - `region`-scoped screenshot capture: no per-platform tool here supports a named-region
//   selector (all of grim/scrot/import/gnome-screenshot/screencapture/powershell.exe
//   capture the full screen only) — a `region` request resolves `unavailable` rather than
//   silently taking a full-viewport capture and mislabeling it.
// - darwin middle-button click: System Events' `click at {x,y}` has no native middle-button
//   or repeat-count-aware equivalent without a third-party helper (e.g. cliclick) that is
//   not part of this codebase's dependency set — resolves `unavailable`. Right-button is
//   approximated via the standard macOS Control-click convention (`using {control down}`).
// - `delayMs` (type action) is honored natively only on linux (xdotool's own `--delay`
//   flag). darwin's `keystroke` and win32/wsl's `SendKeys` have no inter-keystroke pacing
//   parameter, and a naive char-by-char loop would break SendKeys' brace-escaped
//   special-character sequences — so both send the string atomically instead of
//   fabricating a broken per-character delay loop.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import connectors/ (connectors/
import { DeckentError } from './errors.js';
// imports cli/helpers — a forbidden transitive edge). `ComputerUseExecSpawnFn` below is
// therefore a structurally independent mirror of connectors/capabilities/types.ts's
// `SpawnFn` — same posture as the platform-id and security-class mirrors already
// documented in this dilim's earlier two files.

import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveComputerUseAvailability,
  securityClassForAction,
  type ComputerUseAction,
  type ComputerUseClickAction,
  type ComputerUseConfig,
  type ComputerUseResult,
  type ComputerUseTypeAction,
} from './computer-use-contract.js';
import { isKnownComputerUsePlatform, type ComputerUsePlatform } from './computer-use-platform.js';

// ─── Injectable Spawn (mirror of connectors' SpawnFn — see file header) ─────────────────

export interface ComputerUseExecSpawnResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type ComputerUseExecSpawnFn = (
  command: string,
  args: readonly string[],
  opts?: { readonly timeoutMs?: number },
) => Promise<ComputerUseExecSpawnResult>;

export interface ComputerUseExecDeps {
  readonly config?: ComputerUseConfig;
  /** Raw platform string — validated internally via isKnownComputerUsePlatform. */
  readonly platform: string;
  readonly spawn: ComputerUseExecSpawnFn;
}

// ─── Internal Error Classification ──────────────────────────────────────────────────────
// A thrown ComputerUseToolNotFoundError means "no candidate tool could be reached" (spawn
// rejected — ENOENT-style — or the platform/action combination has no grounded tool at
// all) → the contract's `unavailable` status. Any other thrown Error means a tool WAS
// reached but genuinely failed (non-zero exit) → the contract's `error` status.

class ComputerUseToolNotFoundError extends Error {}

// ─── Result Builders ─────────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function unavailableResult(action: ComputerUseAction, reason: string): ComputerUseResult {
  return {
    status: 'unavailable',
    actionKind: action.kind,
    securityClass: securityClassForAction(action),
    timestamp: nowIso(),
    reason,
  };
}

function errorResult(action: ComputerUseAction, errorMessage: string): ComputerUseResult {
  return {
    status: 'error',
    actionKind: action.kind,
    securityClass: securityClassForAction(action),
    timestamp: nowIso(),
    errorMessage,
  };
}

function okResult(action: ComputerUseAction, screenshotBase64?: string): ComputerUseResult {
  return {
    status: 'ok',
    actionKind: action.kind,
    securityClass: securityClassForAction(action),
    timestamp: nowIso(),
    screenshotBase64,
  };
}

const NAVIGATE_NOT_IMPLEMENTED_REASON =
  'navigate requires a browser driver bridge (e.g. Playwright/Puppeteer) that is not integrated ' +
  'anywhere in the codebase yet — real browser control is not part of this exec adapter (TOOL-CU dilim-3)';

// ─── Script-Literal Escaping (genuine injection surface — see file header) ──────────────
// osascript/powershell.exe receive the whole script as ONE argv element (`-e`/`-Command`);
// spawn passes argv literally (no shell), so classic shell-injection does not apply here,
// but an unescaped user-controlled string (click/type text) embedded in that script IS a
// real AppleScript/PowerShell script-injection surface and must be escaped.

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

// ─── Tool Invocation Helpers ─────────────────────────────────────────────────────────────

async function runSingleTool(
  spawn: ComputerUseExecSpawnFn,
  cmd: string,
  args: readonly string[],
  notFoundMessage: string,
): Promise<ComputerUseExecSpawnResult> {
  let result: ComputerUseExecSpawnResult;
  try {
    result = await spawn(cmd, args);
  } catch {
    throw new ComputerUseToolNotFoundError(notFoundMessage);
  }
  if (result.code !== 0) {
    throw new DeckentError('E_COMPUTER_USE_TOOL_FAILED', result.stderr || `${cmd} exited with code ${result.code}`);
  }
  return result;
}

// ─── Screenshot ──────────────────────────────────────────────────────────────────────────

const LINUX_SCREENSHOT_TOOLS: ReadonlyArray<{ cmd: string; args: (outPath: string) => string[] }> = [
  { cmd: 'grim', args: (o) => [o] },
  { cmd: 'scrot', args: (o) => ['-o', o] },
  { cmd: 'import', args: (o) => ['-window', 'root', o] },
  { cmd: 'gnome-screenshot', args: (o) => ['-f', o] },
];

async function captureScreenshotLinux(spawn: ComputerUseExecSpawnFn, outPath: string): Promise<void> {
  let lastFailure: string | undefined;
  for (const tool of LINUX_SCREENSHOT_TOOLS) {
    try {
      const r = await spawn(tool.cmd, tool.args(outPath));
      if (r.code === 0) return;
      lastFailure = r.stderr || `${tool.cmd} exited with code ${r.code}`;
    } catch {
      // ENOENT-style — tool absent on this host, try the next candidate.
    }
  }
  if (lastFailure !== undefined) throw new DeckentError('E_COMPUTER_USE_TOOL_FAILED', lastFailure);
  throw new ComputerUseToolNotFoundError(
    `no screenshot tool available on linux (checked: ${LINUX_SCREENSHOT_TOOLS.map((t) => t.cmd).join(', ')})`,
  );
}

async function captureScreenshotDarwin(spawn: ComputerUseExecSpawnFn, outPath: string): Promise<void> {
  await runSingleTool(
    spawn,
    'screencapture',
    ['-x', '-t', 'png', outPath],
    'no screenshot tool available on darwin (checked: screencapture)',
  );
}

const WINDOWS_SCREENSHOT_PS_COMMAND = [
  'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
  '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
  '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;',
  '$g=[System.Drawing.Graphics]::FromImage($bmp);',
  '$g.CopyFromScreen($b.X,$b.Y,0,0,$bmp.Size);',
  "$out=[System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(),'png');",
  '$bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png);',
  'Write-Output $out',
].join(' ');

/** Returns the (possibly WSL-translated) filesystem path of the captured PNG. */
async function captureScreenshotWindows(spawn: ComputerUseExecSpawnFn, wsl: boolean): Promise<string> {
  const r = await runSingleTool(
    spawn,
    'powershell.exe',
    ['-NoProfile', '-Command', WINDOWS_SCREENSHOT_PS_COMMAND],
    'no screenshot tool available on win32/wsl (checked: powershell.exe)',
  );
  const winPath = r.stdout.trim();
  if (!winPath) throw new DeckentError('E_COMPUTER_USE_TOOL_FAILED', 'powershell.exe produced no screenshot path on stdout');
  if (!wsl) return winPath;
  // powershell.exe (the actual capturing tool) already succeeded by this point — a missing
  // or failing wslpath is a genuine post-capture execution failure, not a capability gap,
  // so it always classifies as 'error' (never ComputerUseToolNotFoundError/'unavailable').
  let w: ComputerUseExecSpawnResult;
  try {
    w = await spawn('wslpath', ['-u', winPath]);
  } catch {
    throw new DeckentError('E_COMPUTER_USE_TOOL_FAILED', 'wslpath not available to translate the Windows screenshot path under WSL (screenshot was captured but cannot be retrieved)');
  }
  if (w.code !== 0) throw new DeckentError('E_COMPUTER_USE_TOOL_FAILED', w.stderr || 'wslpath exited with a non-zero code');
  return w.stdout.trim();
}

async function readAndCleanupScreenshot(path: string): Promise<string> {
  const data = await readFile(path);
  await unlink(path).catch(() => {});
  return data.toString('base64');
}

async function runScreenshot(platform: ComputerUsePlatform, spawn: ComputerUseExecSpawnFn): Promise<string> {
  if (platform === 'wsl' || platform === 'win32') {
    const path = await captureScreenshotWindows(spawn, platform === 'wsl');
    return readAndCleanupScreenshot(path);
  }
  const outPath = join(tmpdir(), `deckent-cu-${randomUUID()}.png`);
  if (platform === 'linux') {
    await captureScreenshotLinux(spawn, outPath);
  } else {
    await captureScreenshotDarwin(spawn, outPath);
  }
  return readAndCleanupScreenshot(outPath);
}

// ─── Click ───────────────────────────────────────────────────────────────────────────────

function xdotoolButtonNumber(button: ComputerUseClickAction['button']): string {
  return button === 'left' ? '1' : button === 'middle' ? '2' : '3';
}

async function execClickLinux(action: ComputerUseClickAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runSingleTool(
    spawn,
    'xdotool',
    [
      'mousemove', String(Math.round(action.x)), String(Math.round(action.y)),
      'click', '--repeat', String(action.clickCount), xdotoolButtonNumber(action.button),
    ],
    'no UI-input tool available on linux (checked: xdotool)',
  );
}

async function execClickDarwin(action: ComputerUseClickAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  if (action.button === 'middle') {
    throw new ComputerUseToolNotFoundError(
      'middle-button click is not supported on darwin via System Events (no native AppleScript ' +
        'equivalent without a third-party helper such as cliclick)',
    );
  }
  const modifier = action.button === 'right' ? ' using {control down}' : '';
  const script = [
    'tell application "System Events"',
    `repeat ${action.clickCount} times`,
    `click at {${Math.round(action.x)}, ${Math.round(action.y)}}${modifier}`,
    'end repeat',
    'end tell',
  ].join('\n');
  await runSingleTool(spawn, 'osascript', ['-e', script], 'no UI-input tool available on darwin (checked: osascript)');
}

const MOUSE_EVENT_FLAGS: Readonly<Record<ComputerUseClickAction['button'], { down: string; up: string }>> = {
  left: { down: '0x0002', up: '0x0004' },
  right: { down: '0x0008', up: '0x0010' },
  middle: { down: '0x0020', up: '0x0040' },
};

function windowsClickPsCommand(action: ComputerUseClickAction): string {
  const { down, up } = MOUSE_EVENT_FLAGS[action.button];
  const x = Math.round(action.x);
  const y = Math.round(action.y);
  return [
    "Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class DeckentMouse { " +
      '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); ' +
      '[DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint data, ' +
      "System.UIntPtr extra); }';",
    `[DeckentMouse]::SetCursorPos(${x}, ${y});`,
    `for ($i = 0; $i -lt ${action.clickCount}; $i++) { ` +
      `[DeckentMouse]::mouse_event(${down}, 0, 0, 0, [System.UIntPtr]::Zero); ` +
      `[DeckentMouse]::mouse_event(${up}, 0, 0, 0, [System.UIntPtr]::Zero); }`,
  ].join(' ');
}

async function execClickWindows(action: ComputerUseClickAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runSingleTool(
    spawn,
    'powershell.exe',
    ['-NoProfile', '-Command', windowsClickPsCommand(action)],
    'no UI-input tool available on win32/wsl (checked: powershell.exe)',
  );
}

async function runClick(
  platform: ComputerUsePlatform,
  action: ComputerUseClickAction,
  spawn: ComputerUseExecSpawnFn,
): Promise<void> {
  if (platform === 'linux') return execClickLinux(action, spawn);
  if (platform === 'darwin') return execClickDarwin(action, spawn);
  return execClickWindows(action, spawn);
}

// ─── Type ────────────────────────────────────────────────────────────────────────────────

async function execTypeLinux(action: ComputerUseTypeAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runSingleTool(
    spawn,
    'xdotool',
    ['type', '--delay', String(action.delayMs), '--', action.text],
    'no UI-input tool available on linux (checked: xdotool)',
  );
}

async function execTypeDarwin(action: ComputerUseTypeAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  const script = `tell application "System Events" to keystroke "${escapeAppleScriptString(action.text)}"`;
  await runSingleTool(spawn, 'osascript', ['-e', script], 'no UI-input tool available on darwin (checked: osascript)');
}

/** SendKeys treats + ^ % ~ ( ) { } as special — wrapping a literal in braces sends it as-is. */
function escapeSendKeysLiterals(text: string): string {
  return text.replace(/[+^%~(){}]/g, (c) => `{${c}}`);
}

function windowsTypePsCommand(action: ComputerUseTypeAction): string {
  const literal = escapePowerShellSingleQuoted(escapeSendKeysLiterals(action.text));
  return `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${literal}');`;
}

async function execTypeWindows(action: ComputerUseTypeAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runSingleTool(
    spawn,
    'powershell.exe',
    ['-NoProfile', '-Command', windowsTypePsCommand(action)],
    'no UI-input tool available on win32/wsl (checked: powershell.exe)',
  );
}

async function runType(
  platform: ComputerUsePlatform,
  action: ComputerUseTypeAction,
  spawn: ComputerUseExecSpawnFn,
): Promise<void> {
  if (platform === 'linux') return execTypeLinux(action, spawn);
  if (platform === 'darwin') return execTypeDarwin(action, spawn);
  return execTypeWindows(action, spawn);
}

// ─── Entry Point ─────────────────────────────────────────────────────────────────────────

/**
 * Executes a single computer-use action against an injected async spawn. Never assumes
 * availability: flag-off, an unallowlisted capability, an unknown platform, or an
 * unimplemented action (navigate; region-scoped screenshot) all resolve to an honest
 * `unavailable` result before `spawn` is ever called (Law #2 — fail honestly, never
 * silently). A tool that cannot be reached at all resolves `unavailable`; a tool that runs
 * and genuinely fails resolves `error`.
 */
export async function executeComputerUseAction(
  action: ComputerUseAction,
  deps: ComputerUseExecDeps,
): Promise<ComputerUseResult> {
  const flagResolution = resolveComputerUseAvailability(deps.config);
  if (!flagResolution.available) {
    return unavailableResult(action, flagResolution.reason ?? 'computer_use unavailable');
  }
  if (!flagResolution.allowedCapabilities.includes(action.kind)) {
    return unavailableResult(action, `'${action.kind}' is not in the resolved allowed_capabilities allowlist`);
  }

  const { platform } = deps;
  if (!isKnownComputerUsePlatform(platform)) {
    return unavailableResult(
      action,
      `unsupported platform '${platform}' — computer-use exec has no known tool-mapping for this platform`,
    );
  }

  if (action.kind === 'navigate') {
    return unavailableResult(action, NAVIGATE_NOT_IMPLEMENTED_REASON);
  }
  if (action.kind === 'screenshot' && action.region !== undefined) {
    return unavailableResult(
      action,
      'region-scoped screenshot capture is not implemented — every grounded per-platform tool ' +
        '(grim/scrot/import/gnome-screenshot, screencapture, powershell.exe) captures the full screen only',
    );
  }

  try {
    if (action.kind === 'screenshot') {
      const screenshotBase64 = await runScreenshot(platform, deps.spawn);
      return okResult(action, screenshotBase64);
    }
    if (action.kind === 'click') {
      await runClick(platform, action, deps.spawn);
      return okResult(action);
    }
    await runType(platform, action, deps.spawn);
    return okResult(action);
  } catch (e) {
    if (e instanceof ComputerUseToolNotFoundError) {
      return unavailableResult(action, e.message);
    }
    return errorResult(action, e instanceof Error ? e.message : String(e));
  }
}
