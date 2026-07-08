// ═══ Computer-Use Exec Adapter — TOOL-CU dilim-3 (Sprint 371, Task 371-003; extended
// Sprint 387, Task 387-010 — born-83: navigate/region-screenshot + injection-harden) ═════
// The first REAL adapter layered on dilim-1's contract (computer-use-contract.ts) and
// dilim-2's platform negotiation (computer-use-platform.ts). `executeComputerUseAction`
// resolves flag+allowlist availability first, then — for screenshot/click/type/navigate —
// invokes the platform-appropriate external tool through an INJECTED async spawn. This
// module never spawns a real subprocess of its own accord in tests: every test in
// computer-use-exec.test.ts supplies a fake spawn, matching the "gerçek-araç çağrısı yok"
// constraint. `createRealComputerUseExecSpawn`/`createRealComputerUseExecDeps` (bottom of
// file) are the production wiring a real caller injects — no test exercises them with a
// real subprocess either.
//
// Tool selection mirrors dilim-2's CAPABILITY_TOOLS table:
// - screenshot: grim/scrot/import/gnome-screenshot (linux), screencapture (darwin),
//   powershell.exe (win32/wsl) — grounded in the already-shipped
//   src/connectors/capabilities/builtin/screenshot.ts adapter (same tool list, same
//   try-next-on-failure linux fallback, same PS-script + wslpath translation for wsl).
// - click/type: xdotool (linux), System Events via osascript (darwin), powershell.exe
//   (win32/wsl) — dilim-2 documented these as a "known-tool hypothesis a future adapter
//   would build against"; this file is that adapter.
// - navigate: `xdg-open` (linux) / `open` (darwin) / `Start-Process` via powershell.exe
//   (win32/wsl) — an OS-level "open URL in the default handler" round-trip. This is
//   intentionally NOT a browser-driver bridge (no Playwright/Puppeteer dependency exists
//   anywhere in this codebase, and adding one is outside this task's scope — a new runtime
//   dependency requires a package.json change this task cannot make); `waitUntil` is
//   accepted by the schema but not honored — a fire-and-forget OS "open" has no page-load
//   completion signal to observe, same honesty posture as the `delayMs` gap below.
//
// Injection-hardening (born-83): `type.text` and `navigate.url` are the only genuine
// free-text/URL injection surfaces (click's x/y/clickCount/button are zod-validated
// numbers/a fixed enum — not exploitable via string interpolation). Both now flow through
// PARAMETRIZED invocation instead of hand-rolled script-string escaping:
// - darwin: a STATIC AppleScript body (`on run argv ... item N of argv ...`) — the
//   user-controlled value is passed as a genuine trailing `osascript` argv element, never
//   concatenated into the script source.
// - win32/wsl: a STATIC PowerShell `.ps1` temp-file body (`param($X) ...`) invoked via
//   `-File <script> -X <value>` — the value flows through PowerShell's own argument
//   binding, never concatenated into script source.
// Neither approach needs script-literal escaping (`escapeAppleScriptString`/
// `escapePowerShellSingleQuoted` are gone) because the value is never embedded in script
// text at all. `escapeSendKeysLiterals` remains — that is SendKeys' OWN mini-DSL escaping
// (`+^%~(){}`), orthogonal to script-injection safety and still required regardless of how
// the string reaches `SendKeys.SendWait`.
//
// Honestly-declared gaps (Law #2 — fail honestly, never silently):
// - `region`-scoped screenshot capture: implemented for linux (`grim -g` / `scrot -a`) and
//   darwin (`screencapture -R`) against a concrete geometry convention this adapter defines
//   (`"X,Y WxH"` grim/slurp-style, or `"X,Y,W,H"` comma-only — the dilim-1 contract leaves
//   `region` as an opaque string, so this is where the concrete format is grounded).
//   win32/wsl stay honest-`unavailable` — the existing full-screen PS capture script has no
//   scripted sub-rectangle path yet, and building one is a materially separate slice of
//   work from this task's scope. `import`/`gnome-screenshot` have no scriptable
//   region/area flag and are excluded from the region-specific tool chain (same
//   honest-partial-support posture as darwin's middle-click gap below).
// - darwin middle-button click: System Events' `click at {x,y}` has no native middle-button
//   or repeat-count-aware equivalent without a third-party helper (e.g. cliclick) that is
//   not part of this codebase's dependency set — resolves `unavailable`. Right-button is
//   approximated via the standard macOS Control-click convention (`using {control down}`).
// - `delayMs` (type action) is honored natively only on linux (xdotool's own `--delay`
//   flag). darwin's `keystroke` and win32/wsl's `SendKeys` have no inter-keystroke pacing
//   parameter, and a naive char-by-char loop would break SendKeys' brace-escaped
//   special-character sequences — so both send the string atomically instead of
//   fabricating a broken per-character delay loop.
// - Cross-file staleness this creates (out of this task's write scope, flagged not fixed):
//   `computer-use-platform.ts`'s dilim-2 negotiator still hardcodes `navigate` as
//   not-implemented for every platform, so `cu-status` will keep reporting navigate as
//   unavailable even though this adapter now implements it. `executeComputerUseAction`
//   also still has zero production callers — `cu-status.ts` only calls dilim-2's
//   `negotiateComputerUseCapabilities`, never this file's executor. Wiring a real call site
//   requires editing `src/cli/commands/cu-status.ts` (or a new command), which is outside
//   this task's filesWrite; `createRealComputerUseExecDeps` below exists so that wiring is
//   a one-line follow-up.
//
// ADR-D-004 (Layer-1 Import Direction) C1: core/ MUST NOT import connectors/ (connectors/
import { DeckentError } from './errors.js';
// imports cli/helpers — a forbidden transitive edge). `ComputerUseExecSpawnFn` below is
// therefore a structurally independent mirror of connectors/capabilities/types.ts's
// `SpawnFn` — same posture as the platform-id and security-class mirrors already
// documented in this dilim's earlier two files. `createRealComputerUseExecDeps`'s own WSL
// sniff similarly re-implements `cu-status.ts`'s `detectCuPlatform` locally rather than
// importing it (core/ MUST NOT import cli/ either).

import { spawn as nodeSpawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveComputerUseAvailability,
  securityClassForAction,
  type ComputerUseAction,
  type ComputerUseClickAction,
  type ComputerUseConfig,
  type ComputerUseNavigateAction,
  type ComputerUseResult,
  type ComputerUseScreenshotAction,
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

// ─── Parametrized PowerShell Invocation (injection-hardened — see file header) ──────────
// A STATIC script body (never containing interpolated user data) is written to a real temp
// `.ps1` file and invoked via `-File <script> -Name value ...` — trailing args become
// PowerShell parameters through the runtime's own argument binding, not string
// concatenation into script source. This is the parametrize-invocation replacement for the
// old `-Command '<script with interpolated text>'` approach (born-83).

async function runParametrizedPowerShellScript(
  spawn: ComputerUseExecSpawnFn,
  scriptBody: string,
  scriptArgs: readonly string[],
  notFoundMessage: string,
): Promise<ComputerUseExecSpawnResult> {
  const scriptPath = join(tmpdir(), `deckent-cu-${randomUUID()}.ps1`);
  await writeFile(scriptPath, scriptBody, 'utf-8');
  try {
    return await runSingleTool(
      spawn,
      'powershell.exe',
      ['-NoProfile', '-File', scriptPath, ...scriptArgs],
      notFoundMessage,
    );
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
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

// ─── Region-Scoped Screenshot (born-83 — see file header "Honestly-declared gaps") ──────
// `region` is an opaque string in the dilim-1 contract; this adapter grounds it in a
// concrete geometry convention: "X,Y WxH" (grim/slurp convention) or "X,Y,W,H"
// (comma-only). An unparseable region string is an honest `unavailable`, not a silent
// full-viewport fallback.

interface ParsedCuRegion {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function parseCuRegion(region: string): ParsedCuRegion | undefined {
  const spaced = /^(-?\d+),(-?\d+)\s+(\d+)x(\d+)$/.exec(region);
  if (spaced) {
    return { x: Number(spaced[1]), y: Number(spaced[2]), w: Number(spaced[3]), h: Number(spaced[4]) };
  }
  const commaOnly = /^(-?\d+),(-?\d+),(\d+),(\d+)$/.exec(region);
  if (commaOnly) {
    return { x: Number(commaOnly[1]), y: Number(commaOnly[2]), w: Number(commaOnly[3]), h: Number(commaOnly[4]) };
  }
  return undefined;
}

const LINUX_REGION_SCREENSHOT_TOOLS: ReadonlyArray<{ cmd: string; args: (outPath: string, r: ParsedCuRegion) => string[] }> = [
  { cmd: 'grim', args: (o, r) => ['-g', `${r.x},${r.y} ${r.w}x${r.h}`, o] },
  { cmd: 'scrot', args: (o, r) => ['-a', `${r.x},${r.y},${r.w},${r.h}`, '-o', o] },
];

async function captureScreenshotLinuxRegion(
  spawn: ComputerUseExecSpawnFn,
  outPath: string,
  region: ParsedCuRegion,
): Promise<void> {
  let lastFailure: string | undefined;
  for (const tool of LINUX_REGION_SCREENSHOT_TOOLS) {
    try {
      const r = await spawn(tool.cmd, tool.args(outPath, region));
      if (r.code === 0) return;
      lastFailure = r.stderr || `${tool.cmd} exited with code ${r.code}`;
    } catch {
      // ENOENT-style — tool absent on this host, try the next region-capable candidate.
    }
  }
  if (lastFailure !== undefined) throw new DeckentError('E_COMPUTER_USE_TOOL_FAILED', lastFailure);
  throw new ComputerUseToolNotFoundError(
    `no region-capable screenshot tool available on linux (checked: ${LINUX_REGION_SCREENSHOT_TOOLS.map((t) => t.cmd).join(', ')}` +
      ' — import/gnome-screenshot have no scriptable region flag)',
  );
}

async function captureScreenshotDarwinRegion(
  spawn: ComputerUseExecSpawnFn,
  outPath: string,
  region: ParsedCuRegion,
): Promise<void> {
  await runSingleTool(
    spawn,
    'screencapture',
    ['-R', `${region.x},${region.y},${region.w},${region.h}`, '-x', '-t', 'png', outPath],
    'no region-capable screenshot tool available on darwin (checked: screencapture -R)',
  );
}

async function runScreenshot(
  platform: ComputerUsePlatform,
  action: ComputerUseScreenshotAction,
  spawn: ComputerUseExecSpawnFn,
): Promise<string> {
  const region = action.region !== undefined ? parseCuRegion(action.region) : undefined;
  if (action.region !== undefined && region === undefined) {
    throw new ComputerUseToolNotFoundError(
      `region '${action.region}' is not a recognized geometry — expected "X,Y WxH" (grim/slurp convention) or "X,Y,W,H"`,
    );
  }

  if (platform === 'wsl' || platform === 'win32') {
    if (region !== undefined) {
      throw new ComputerUseToolNotFoundError(
        'region-scoped screenshot capture is not implemented on win32/wsl — the existing full-screen ' +
          'PrimaryScreen.Bounds capture script has no scripted sub-rectangle path in this adapter yet',
      );
    }
    const path = await captureScreenshotWindows(spawn, platform === 'wsl');
    return readAndCleanupScreenshot(path);
  }

  const outPath = join(tmpdir(), `deckent-cu-${randomUUID()}.png`);
  if (platform === 'linux') {
    if (region !== undefined) {
      await captureScreenshotLinuxRegion(spawn, outPath, region);
    } else {
      await captureScreenshotLinux(spawn, outPath);
    }
  } else if (region !== undefined) {
    await captureScreenshotDarwinRegion(spawn, outPath, region);
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

// STATIC AppleScript (born-83 injection-harden) — `action.text` is never concatenated into
// this string. `on run argv` receives it as a genuine trailing `osascript` argv element
// (`item 1 of argv`), so an arbitrary crafted string can never be interpreted as script
// syntax — it is always the inert literal argument to `keystroke`.
const CU_TYPE_APPLESCRIPT = 'on run argv\n  tell application "System Events" to keystroke (item 1 of argv)\nend run';

async function execTypeDarwin(action: ComputerUseTypeAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runSingleTool(
    spawn,
    'osascript',
    ['-e', CU_TYPE_APPLESCRIPT, action.text],
    'no UI-input tool available on darwin (checked: osascript)',
  );
}

/** SendKeys' OWN mini-DSL treats + ^ % ~ ( ) { } as special — wrapping a literal in braces
 *  sends it as-is. Orthogonal to script-injection safety (see file header): still required
 *  no matter how the string reaches `SendKeys.SendWait`, because parametrized invocation
 *  only protects against PowerShell script-syntax injection, not SendKeys' own semantics. */
function escapeSendKeysLiterals(text: string): string {
  return text.replace(/[+^%~(){}]/g, (c) => `{${c}}`);
}

// STATIC PowerShell script body (born-83 injection-harden) — never contains interpolated
// user data. `$Text` is bound purely through `-File <script> -Text <value>` argument
// binding (see runParametrizedPowerShellScript), so a crafted `-Text` value can never
// break out into script syntax — it is always the inert literal argument to `SendWait`.
const CU_TYPE_PS_SCRIPT = [
  'param([Parameter(Mandatory=$true)][string]$Text)',
  'Add-Type -AssemblyName System.Windows.Forms;',
  '[System.Windows.Forms.SendKeys]::SendWait($Text);',
].join('\n');

async function execTypeWindows(action: ComputerUseTypeAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  const literal = escapeSendKeysLiterals(action.text);
  await runParametrizedPowerShellScript(
    spawn,
    CU_TYPE_PS_SCRIPT,
    ['-Text', literal],
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

// ─── Navigate ────────────────────────────────────────────────────────────────────────────
// A real OS-level "open URL in the default handler" round-trip — NOT a browser-driver
// bridge (see file header for why: no Playwright/Puppeteer dependency exists in this
// codebase, and adding one is outside this task's scope). `waitUntil` is accepted by the
// schema but not honored: a fire-and-forget OS "open" has no page-load completion signal
// to observe (same honesty posture as the `delayMs` gap documented above `runType`).
// `action.url` is zod-validated as a well-formed URL but is still user-controlled free
// text — it flows to every platform's tool as a plain positional argv element (xdg-open/
// open) or a parametrized `-Url` PowerShell argument, never concatenated into a script.

async function execNavigateLinux(action: ComputerUseNavigateAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runSingleTool(spawn, 'xdg-open', [action.url], 'no URL-open tool available on linux (checked: xdg-open)');
}

async function execNavigateDarwin(action: ComputerUseNavigateAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runSingleTool(spawn, 'open', [action.url], 'no URL-open tool available on darwin (checked: open)');
}

const CU_NAVIGATE_PS_SCRIPT = [
  'param([Parameter(Mandatory=$true)][string]$Url)',
  'Start-Process -FilePath $Url | Out-Null;',
].join('\n');

async function execNavigateWindows(action: ComputerUseNavigateAction, spawn: ComputerUseExecSpawnFn): Promise<void> {
  await runParametrizedPowerShellScript(
    spawn,
    CU_NAVIGATE_PS_SCRIPT,
    ['-Url', action.url],
    'no URL-open tool available on win32/wsl (checked: powershell.exe)',
  );
}

async function runNavigate(
  platform: ComputerUsePlatform,
  action: ComputerUseNavigateAction,
  spawn: ComputerUseExecSpawnFn,
): Promise<void> {
  if (platform === 'linux') return execNavigateLinux(action, spawn);
  if (platform === 'darwin') return execNavigateDarwin(action, spawn);
  return execNavigateWindows(action, spawn);
}

// ─── Entry Point ─────────────────────────────────────────────────────────────────────────

/**
 * Executes a single computer-use action against an injected async spawn. Never assumes
 * availability: flag-off, an unallowlisted capability, or an unknown platform all resolve
 * to an honest `unavailable` result before `spawn` is ever called (Law #2 — fail honestly,
 * never silently). Per-action/per-platform gaps that remain (region-scoped screenshot on
 * win32/wsl, an unparseable region string, darwin middle-click) resolve `unavailable` from
 * inside `runScreenshot`/`runClick` — see file header "Honestly-declared gaps". A tool that
 * cannot be reached at all resolves `unavailable`; a tool that runs and genuinely fails
 * resolves `error`.
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

  try {
    if (action.kind === 'screenshot') {
      const screenshotBase64 = await runScreenshot(platform, action, deps.spawn);
      return okResult(action, screenshotBase64);
    }
    if (action.kind === 'click') {
      await runClick(platform, action, deps.spawn);
      return okResult(action);
    }
    if (action.kind === 'navigate') {
      await runNavigate(platform, action, deps.spawn);
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

// ─── Real Production Wiring (born-83 — "real-caller reachability", see file header) ─────
// No test exercises these with a real subprocess — every executeComputerUseAction test in
// computer-use-exec.test.ts injects a fake spawn, matching this dilim's own "gerçek-araç
// çağrısı yok" constraint. `createRealComputerUseExecSpawn` mirrors the async-spawn-wrapper
// pattern already established elsewhere in core/ (e.g. daemon-hygiene.ts's `runCommand`:
// `shell:false`, stdout/stderr accumulation, a hard timeout that SIGKILLs a hung child) —
// reused here rather than invented fresh (Discipline 2 — simplicity first).

const DEFAULT_CU_SPAWN_TIMEOUT_MS = 10_000;

/** Real `ComputerUseExecSpawnFn` — an actual `node:child_process.spawn`, never a shell
 *  (`shell: false`), matching the file's own "argv passed literally, no shell" contract. */
export function createRealComputerUseExecSpawn(): ComputerUseExecSpawnFn {
  return (command, args, opts) =>
    new Promise<ComputerUseExecSpawnResult>((resolvePromise, reject) => {
      let settled = false;
      let child;
      try {
        child = nodeSpawn(command, [...args], { shell: false, windowsHide: true });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      const timeoutMs = opts?.timeoutMs ?? DEFAULT_CU_SPAWN_TIMEOUT_MS;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          child.kill('SIGKILL');
        } catch {
          /* best-effort */
        }
        reject(new Error(`${command} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf-8');
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8');
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise({ code: code ?? -1, stdout, stderr });
      });
    });
}

/** Same WSL signal `cu-status.ts`'s `isWSLHost`/`detectCuPlatform` use (env vars +
 *  `/proc/version` sniff) — reimplemented locally per ADR-D-004 C1 (core/ MUST NOT import
 *  cli/), same structural-mirror posture already established throughout this dilim (see
 *  file header). Returns `undefined` for a genuinely unmapped host — the caller falls back
 *  to the raw `process.platform` string, which `isKnownComputerUsePlatform` then honestly
 *  rejects inside `executeComputerUseAction`. */
function detectRealComputerUsePlatform(): ComputerUsePlatform | undefined {
  const p = process.platform;
  if (p === 'win32') return 'win32';
  if (p === 'darwin') return 'darwin';
  if (p === 'linux') {
    if (process.env['WSL_DISTRO_NAME'] !== undefined || process.env['WSL_INTEROP'] !== undefined) return 'wsl';
    try {
      return /microsoft/i.test(readFileSync('/proc/version', 'utf-8')) ? 'wsl' : 'linux';
    } catch {
      return 'linux';
    }
  }
  return undefined;
}

/**
 * Production `ComputerUseExecDeps` factory — real spawn + real platform detection. NOT
 * itself a caller of `executeComputerUseAction`: wiring an actual production call site
 * (e.g. a `deckent cu-exec` command, or an `--execute` mode on `cu-status`) requires
 * editing `src/cli/commands/*`, which is outside this task's write scope (see file
 * header "Cross-file staleness"). This factory exists so that wiring is a one-line
 * follow-up: `executeComputerUseAction(action, createRealComputerUseExecDeps(config))`.
 */
export function createRealComputerUseExecDeps(config?: ComputerUseConfig): ComputerUseExecDeps {
  return {
    config,
    platform: detectRealComputerUsePlatform() ?? process.platform,
    spawn: createRealComputerUseExecSpawn(),
  };
}
