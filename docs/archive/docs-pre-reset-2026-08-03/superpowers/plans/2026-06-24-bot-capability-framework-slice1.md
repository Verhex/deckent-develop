# Bot Capability Framework — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a controlled host-OS capability framework to the deckent messaging bots — a registry + per-capability risk-tier consent policy + platform adapters wired into the single existing gated dispatcher — and ship two capabilities: `screenshot` (read→auto) and `send_mail` (external→confirm).

**Architecture:** Capabilities are `{ id, tier, defaultPolicy, edition, paramsSchema, preview, run }` units in a `CapabilityRegistry`. The LLM calls them by name through the existing `McpToolDispatcher.dispatch(name, args)` path; `makeGatedDispatcher` (the one chokepoint) consults a `resolvePolicy` engine (`auto`/`confirm`/`deny`) and either runs the capability in-process (auto), parks it in the existing `bot-action-store` (confirm), or refuses (deny). Media results are delivered out-of-band via a new connector `sendMedia` primitive while a text acknowledgment returns to the LLM loop.

**Tech Stack:** TypeScript (ESM, Node ≥24), grammY (Telegram, dynamic), nodemailer (mail, dynamic optionalDependency), zod (arg schemas), vitest. Host-OS adapters via async `child_process.spawn`: PowerShell interop (win-native/win-wsl), `screencapture` (darwin), `grim`/`scrot`/`import`/`gnome-screenshot` (linux).

## Global Constraints

- **Single chokepoint:** exactly ONE gate for bot actions — `makeGatedDispatcher`. The registry is its policy-brain + executor, not a second dispatch path.
- **Default-off / flag-gated:** the whole surface is inert unless `bot_capabilities.enabled === true`. No capability is advertised to the LLM when disabled.
- **destructive NEVER auto:** policy clamps a destructive-tier capability's `auto` to `confirm`. (No destructive capability ships in Slice 1, but the clamp is implemented + tested now.)
- **Secrets via `.deck`:** SMTP config holds `$DECK:…` placeholders resolved by the existing `interpolateConfig`; no plaintext credentials in config.
- **i18n-first:** every user-facing string flows through `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr). Capability modules take `lang` and call `getMessage`.
- **Hermetic tests:** all I/O under `os.tmpdir()` (use `withSandboxHome` from `tests/helpers/sandbox-home.ts` where HOME matters); async `spawn` only (NO `spawnSync`); inject `spawn`/transport/probe — never touch the real OS in unit tests; cross-platform matrix tested on one host via injected probes; run `npm run test:ci-sim` before the final commit.
- **Proof-of-function (Tier-1):** `screenshot` and `send_mail` are user-surface — each carries a real-binary run-verify (real PNG on the host; real local SMTP-sink round-trip). A mock-only test alone = GO_WITH_TECH_DEBT, never DONE.
- **Surgical:** reuse `bot-action-store`, `makeGatedDispatcher`, `connector-bootstrap`, `interpolateConfig`, `loadGrammy` patterns; minimum-diff; ESM imports use `.js` extension.
- **Edition seam:** every capability carries `edition` (all `'solo'` now); `resolvePolicy` gates `'enterprise'` caps to unavailable when edition≠enterprise (a no-op today).

---

## File Structure

**New — `src/connectors/capabilities/`:**
- `types.ts` — all shared types (`Tier`, `PolicyDecision`, `Edition`, `PlatformId`, `MediaAttachment`, `CapabilityResult`, `SpawnFn`, `MailTransport`, `BotCapabilitiesConfig`, `CapabilityContext`, `Capability`).
- `registry.ts` — `CapabilityRegistry` (register/get/has/list).
- `policy.ts` — `resolvePolicy(cap, ctx)`.
- `platform.ts` — `detectPlatform(probe?)`.
- `spawn.ts` — `defaultSpawn` (async `child_process.spawn` wrapper).
- `mail-transport.ts` — `loadNodemailerTransport(cfg)` (dynamic nodemailer).
- `execute.ts` — `runCapability(...)` (validate → run → media sink → audit), shared by auto + approve paths.
- `prompt.ts` — `describeCapabilities(registry, resolve)` (system-prompt catalog snippet).
- `builtin/screenshot.ts`, `builtin/send-mail.ts`.

**Modified (surgical):**
- `src/connectors/types.ts` — add optional `sendMedia` to `IMessageConnector`; re-export `MediaAttachment`.
- `src/connectors/telegram.ts` — implement `sendMedia` (grammY `sendPhoto`/`sendDocument` + `InputFile`); `loadGrammy` returns `InputFile` too.
- `src/connectors/bot-agentic.ts` — capability-aware branch in `makeGatedDispatcher`; capability gate messages.
- `src/connectors/connector-bootstrap.ts` — build registry/context/gate/mediaSink; wire into dispatcher; capability-aware approve-path; advertise capabilities in the system prompt.
- `src/core/config-types.ts` — add `bot_capabilities?: BotCapabilitiesConfig` to `DeckentConfig`.
- `src/cli/helpers/messages.ts` — capability i18n keys (en/tr).
- `package.json` — add `nodemailer` to `optionalDependencies`.

**Tests — `tests/connectors/capabilities/`:** one `*.test.ts` per module, plus `screenshot.smoke.test.ts` and `send-mail.smoke.test.ts` (Tier-1 real-run).

---

### Task 1: Capability types + registry

**Files:**
- Create: `src/connectors/capabilities/types.ts`
- Create: `src/connectors/capabilities/registry.ts`
- Test: `tests/connectors/capabilities/registry.test.ts`

**Interfaces:**
- Produces: all types below + `class CapabilityRegistry { register(c): void; get(id): Capability|undefined; has(id): boolean; list(): Capability[] }`.

- [ ] **Step 1: Write the failing test** — `tests/connectors/capabilities/registry.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { CapabilityRegistry } from '../../../src/connectors/capabilities/registry.js';
import type { Capability } from '../../../src/connectors/capabilities/types.js';

const fakeCap: Capability = {
  id: 'noop', titleKey: 'cap.noop.title', tier: 'read', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), preview: () => 'noop', run: async () => ({ text: 'ok' }),
};

describe('CapabilityRegistry', () => {
  it('registers and retrieves by id', () => {
    const r = new CapabilityRegistry();
    r.register(fakeCap);
    expect(r.has('noop')).toBe(true);
    expect(r.get('noop')).toBe(fakeCap);
    expect(r.list()).toHaveLength(1);
  });
  it('returns undefined / false for unknown id', () => {
    const r = new CapabilityRegistry();
    expect(r.get('ghost')).toBeUndefined();
    expect(r.has('ghost')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/registry.test.ts`
Expected: FAIL (Cannot find module `registry.js` / `types.js`).

- [ ] **Step 3: Write `src/connectors/capabilities/types.ts`**

```ts
import type { ZodType } from 'zod';

export type Tier = 'read' | 'local' | 'external' | 'destructive';
export type PolicyDecision = 'auto' | 'confirm' | 'deny';
export type Edition = 'solo' | 'enterprise';
export type PlatformId = 'win-native' | 'win-wsl' | 'darwin' | 'linux' | 'unsupported';

export interface MediaAttachment {
  readonly kind: 'photo' | 'document';
  readonly filename: string;
  readonly mime: string;
  readonly data: Buffer;
  readonly caption?: string;
}

export interface CapabilityResult {
  readonly text?: string;
  readonly media?: readonly MediaAttachment[];
}

export interface SpawnResult { readonly code: number; readonly stdout: Buffer; readonly stderr: string }
export type SpawnFn = (cmd: string, args: readonly string[], opts?: { timeoutMs?: number }) => Promise<SpawnResult>;

export interface MailMessage { readonly from: string; readonly to: string | readonly string[]; readonly subject: string; readonly text: string }
export interface MailTransport { sendMail(msg: MailMessage): Promise<{ messageId: string }> }

export interface MailConfig {
  readonly allowedRecipients?: readonly string[];
  readonly from?: string;
  readonly smtp?: { host?: string; port?: number; user?: string; pass?: string; secure?: boolean };
}

export interface BotCapabilitiesConfig {
  readonly enabled?: boolean;
  readonly policies?: Readonly<Record<string, PolicyDecision>>;
  readonly perChat?: Readonly<Record<string, Readonly<Record<string, PolicyDecision>>>>;
  readonly mail?: MailConfig;
}

export interface CapabilityContext {
  readonly chatKey: string;
  readonly project: string;            // project root path
  readonly lang: string;
  readonly config: BotCapabilitiesConfig;
  readonly now: number;                // injected for deterministic captions/audit
  readonly spawn: SpawnFn;             // injected host-effect (screenshot)
  readonly loadMailTransport: (cfg: MailConfig | undefined) => Promise<MailTransport>; // injected (mail)
}

export interface Capability<A = unknown> {
  readonly id: string;                 // tool name the LLM calls (e.g. 'screenshot', 'send_mail')
  readonly titleKey: string;           // i18n key for human label
  readonly tier: Tier;
  readonly defaultPolicy: PolicyDecision;
  readonly edition: Edition;
  readonly paramsSchema: ZodType<A>;
  preview(args: A, lang: string): string;
  run(args: A, ctx: CapabilityContext): Promise<CapabilityResult>;
}
```

- [ ] **Step 4: Write `src/connectors/capabilities/registry.ts`**

```ts
import type { Capability } from './types.js';

export class CapabilityRegistry {
  private readonly caps = new Map<string, Capability>();
  register(cap: Capability): void { this.caps.set(cap.id, cap as Capability); }
  get(id: string): Capability | undefined { return this.caps.get(id); }
  has(id: string): boolean { return this.caps.has(id); }
  list(): Capability[] { return [...this.caps.values()]; }
}
```

- [ ] **Step 5: Run test to verify it passes + tsc**

Run: `npx vitest run tests/connectors/capabilities/registry.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/capabilities/types.ts src/connectors/capabilities/registry.ts tests/connectors/capabilities/registry.test.ts
git commit -m "feat(capabilities): capability types + registry (slice 1 t1)"
```

---

### Task 2: Policy engine

**Files:**
- Create: `src/connectors/capabilities/policy.ts`
- Test: `tests/connectors/capabilities/policy.test.ts`

**Interfaces:**
- Consumes: `Capability`, `BotCapabilitiesConfig`, `PolicyDecision`, `Edition` from `types.ts`.
- Produces: `type PolicyResolution = PolicyDecision | 'unavailable'`; `interface PolicyContext { chatKey: string; config: BotCapabilitiesConfig; edition: Edition }`; `function resolvePolicy(cap: Capability, ctx: PolicyContext): PolicyResolution`.

- [ ] **Step 1: Write the failing test** — `tests/connectors/capabilities/policy.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { resolvePolicy } from '../../../src/connectors/capabilities/policy.js';
import type { Capability, Tier, PolicyDecision } from '../../../src/connectors/capabilities/types.js';

function cap(tier: Tier, defaultPolicy: PolicyDecision, edition: 'solo' | 'enterprise' = 'solo'): Capability {
  return { id: 'c', titleKey: 't', tier, defaultPolicy, edition, paramsSchema: z.object({}), preview: () => '', run: async () => ({}) };
}
const base = { chatKey: 'chat1', edition: 'solo' as const };

describe('resolvePolicy', () => {
  it('master disabled → unavailable', () => {
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config: { enabled: false } })).toBe('unavailable');
  });
  it('enabled → capability defaultPolicy', () => {
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config: { enabled: true } })).toBe('auto');
    expect(resolvePolicy(cap('external', 'confirm'), { ...base, config: { enabled: true } })).toBe('confirm');
  });
  it('global override beats default', () => {
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config: { enabled: true, policies: { c: 'confirm' } } })).toBe('confirm');
  });
  it('per-chat override beats global', () => {
    const config = { enabled: true, policies: { c: 'auto' as const }, perChat: { chat1: { c: 'deny' as const } } };
    expect(resolvePolicy(cap('read', 'auto'), { ...base, config })).toBe('deny');
  });
  it('destructive can NEVER be auto — clamped to confirm', () => {
    const config = { enabled: true, policies: { c: 'auto' as const } };
    expect(resolvePolicy(cap('destructive', 'deny'), { ...base, config })).toBe('confirm');
  });
  it('enterprise capability is unavailable on solo edition', () => {
    expect(resolvePolicy(cap('read', 'auto', 'enterprise'), { ...base, config: { enabled: true } })).toBe('unavailable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/policy.test.ts`
Expected: FAIL (Cannot find module `policy.js`).

- [ ] **Step 3: Write `src/connectors/capabilities/policy.ts`**

```ts
import type { Capability, BotCapabilitiesConfig, PolicyDecision, Edition } from './types.js';

export type PolicyResolution = PolicyDecision | 'unavailable';

export interface PolicyContext {
  readonly chatKey: string;
  readonly config: BotCapabilitiesConfig;
  readonly edition: Edition;
}

export function resolvePolicy(cap: Capability, ctx: PolicyContext): PolicyResolution {
  if (!ctx.config.enabled) return 'unavailable';
  if (cap.edition === 'enterprise' && ctx.edition !== 'enterprise') return 'unavailable';
  const perChat = ctx.config.perChat?.[ctx.chatKey]?.[cap.id];
  const global = ctx.config.policies?.[cap.id];
  let base: PolicyDecision = perChat ?? global ?? cap.defaultPolicy;
  if (cap.tier === 'destructive' && base === 'auto') base = 'confirm'; // hard safety rail
  return base;
}
```

- [ ] **Step 4: Run test to verify it passes + tsc**

Run: `npx vitest run tests/connectors/capabilities/policy.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/capabilities/policy.ts tests/connectors/capabilities/policy.test.ts
git commit -m "feat(capabilities): risk-tier consent policy engine + destructive-never-auto clamp (slice 1 t2)"
```

---

### Task 3: Platform detection

**Files:**
- Create: `src/connectors/capabilities/platform.ts`
- Test: `tests/connectors/capabilities/platform.test.ts`

**Interfaces:**
- Produces: `interface PlatformProbe { platform: NodeJS.Platform; procVersion: () => string }`; `function detectPlatform(probe?: PlatformProbe): PlatformId`.

- [ ] **Step 1: Write the failing test** — `tests/connectors/capabilities/platform.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { detectPlatform } from '../../../src/connectors/capabilities/platform.js';

const probe = (platform: NodeJS.Platform, proc = '') => ({ platform, procVersion: () => proc });

describe('detectPlatform', () => {
  it('win32 → win-native', () => expect(detectPlatform(probe('win32'))).toBe('win-native'));
  it('darwin → darwin', () => expect(detectPlatform(probe('darwin'))).toBe('darwin'));
  it('linux + microsoft in /proc/version → win-wsl', () =>
    expect(detectPlatform(probe('linux', 'Linux version 5.x microsoft-standard-WSL2'))).toBe('win-wsl'));
  it('plain linux → linux', () =>
    expect(detectPlatform(probe('linux', 'Linux version 6.x generic'))).toBe('linux'));
  it('other (e.g. aix) → unsupported', () => expect(detectPlatform(probe('aix' as NodeJS.Platform))).toBe('unsupported'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/platform.test.ts`
Expected: FAIL (Cannot find module `platform.js`).

- [ ] **Step 3: Write `src/connectors/capabilities/platform.ts`**

```ts
import { readFileSync } from 'node:fs';
import type { PlatformId } from './types.js';

export interface PlatformProbe { readonly platform: NodeJS.Platform; procVersion(): string }

const defaultProbe: PlatformProbe = {
  platform: process.platform,
  procVersion: () => { try { return readFileSync('/proc/version', 'utf-8'); } catch { return ''; } },
};

export function detectPlatform(probe: PlatformProbe = defaultProbe): PlatformId {
  if (probe.platform === 'win32') return 'win-native';
  if (probe.platform === 'darwin') return 'darwin';
  if (probe.platform === 'linux') return /microsoft/i.test(probe.procVersion()) ? 'win-wsl' : 'linux';
  return 'unsupported';
}
```

- [ ] **Step 4: Run test to verify it passes + tsc**

Run: `npx vitest run tests/connectors/capabilities/platform.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/capabilities/platform.ts tests/connectors/capabilities/platform.test.ts
git commit -m "feat(capabilities): cross-platform detection (win-native/win-wsl/darwin/linux) (slice 1 t3)"
```

---

### Task 4: `spawn` util + screenshot capability

**Files:**
- Create: `src/connectors/capabilities/spawn.ts`
- Create: `src/connectors/capabilities/builtin/screenshot.ts`
- Modify: `src/cli/helpers/messages.ts` (add `cap.screenshot.*` keys, en/tr)
- Test: `tests/connectors/capabilities/screenshot.test.ts`
- Test (Tier-1 real-run): `tests/connectors/capabilities/screenshot.smoke.test.ts`

**Interfaces:**
- Consumes: `detectPlatform` (T3), `SpawnFn`/`Capability`/`CapabilityContext`/`MediaAttachment` (T1).
- Produces: `defaultSpawn: SpawnFn`; `screenshotCapability: Capability<{ display?: 'primary'|'all' }>`.

i18n keys to add (`messages.ts`): `cap.screenshot.title` (en "Screenshot" / tr "Ekran görüntüsü"), `cap.screenshot.unsupported` (en "Screenshot is not supported on this platform." / tr "Bu platformda ekran görüntüsü desteklenmiyor."), `cap.screenshot.failed` (en "Screenshot failed: {error}" / tr "Ekran görüntüsü başarısız: {error}"), `cap.screenshot.caption` (en "Screen capture" / tr "Ekran yakalandı"), `cap.screenshot.preview` (en "capture {display} display" / tr "{display} ekranı yakala").

- [ ] **Step 1: Write the failing unit test** — `tests/connectors/capabilities/screenshot.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { screenshotCapability } from '../../../src/connectors/capabilities/builtin/screenshot.js';
import type { CapabilityContext, SpawnResult } from '../../../src/connectors/capabilities/types.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic
function ctx(overrides: Partial<CapabilityContext> & { spawn: CapabilityContext['spawn']; probePlatform?: string }): CapabilityContext {
  return {
    chatKey: 'c', project: '/tmp/p', lang: 'en', config: { enabled: true }, now: 1_700_000_000_000,
    loadMailTransport: async () => { throw new Error('not used'); },
    ...overrides,
  } as CapabilityContext;
}

describe('screenshotCapability', () => {
  it('darwin: builds `screencapture -x -t png <tmp>` and returns PNG media', async () => {
    const calls: Array<{ cmd: string; args: readonly string[] }> = [];
    const spawn = vi.fn(async (cmd: string, args: readonly string[]): Promise<SpawnResult> => {
      calls.push({ cmd, args });
      // emulate the tool writing the PNG to the last arg path:
      const { writeFileSync } = await import('node:fs');
      writeFileSync(args[args.length - 1] as string, PNG);
      return { code: 0, stdout: Buffer.from(''), stderr: '' };
    });
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'darwin' } as never));
    expect(calls[0]?.cmd).toBe('screencapture');
    expect(calls[0]?.args).toEqual(expect.arrayContaining(['-x', '-t', 'png']));
    expect(res.media?.[0]?.mime).toBe('image/png');
    expect(res.media?.[0]?.data.subarray(0, 4)).toEqual(PNG.subarray(0, 4));
  });

  it('nonzero exit → honest error text, no media', async () => {
    const spawn = vi.fn(async (): Promise<SpawnResult> => ({ code: 1, stdout: Buffer.from(''), stderr: 'boom' }));
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'darwin' } as never));
    expect(res.media).toBeUndefined();
    expect(res.text).toMatch(/failed|başarısız/i);
  });

  it('unsupported platform → honest "not supported", never throws', async () => {
    const spawn = vi.fn();
    const res = await screenshotCapability.run({}, ctx({ spawn, platform: 'aix' } as never));
    expect(res.text).toMatch(/not supported|desteklenmiyor/i);
    expect(spawn).not.toHaveBeenCalled();
  });
});
```

> NOTE: `screenshotCapability.run` must accept an injected platform for tests. Add an optional `platform?: PlatformId` to `CapabilityContext` (defaulting to `detectPlatform()` inside `run` when absent). Update `types.ts` `CapabilityContext` with `readonly platform?: PlatformId;` as part of this task.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/screenshot.test.ts`
Expected: FAIL (Cannot find module `screenshot.js`).

- [ ] **Step 3: Add `platform?: PlatformId` to `CapabilityContext`** in `src/connectors/capabilities/types.ts` (one line inside the interface):

```ts
  readonly platform?: PlatformId;     // injected in tests; defaults to detectPlatform()
```

- [ ] **Step 4: Write `src/connectors/capabilities/spawn.ts`**

```ts
import { spawn as nodeSpawn } from 'node:child_process';
import type { SpawnFn, SpawnResult } from './types.js';

// Async spawn wrapper (NEVER spawnSync). Rejects on spawn error (e.g. ENOENT),
// resolves with {code, stdout, stderr} otherwise. Honors an optional timeout.
export const defaultSpawn: SpawnFn = (cmd, args, opts) =>
  new Promise<SpawnResult>((resolve, reject) => {
    const child = nodeSpawn(cmd, [...args], { windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    const timer = opts?.timeoutMs
      ? setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`spawn timeout: ${cmd}`)); }, opts.timeoutMs)
      : undefined;
    child.stdout?.on('data', (d: Buffer) => out.push(d));
    child.stderr?.on('data', (d: Buffer) => { err += d.toString(); });
    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: code ?? 0, stdout: Buffer.concat(out), stderr: err }); });
  });
```

- [ ] **Step 5: Write `src/connectors/capabilities/builtin/screenshot.ts`**

```ts
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { z } from 'zod';
import { getMessage } from '../../../cli/helpers/messages.js';
import { detectPlatform } from '../platform.js';
import type { Capability, CapabilityContext, CapabilityResult, PlatformId, SpawnFn } from '../types.js';

const Params = z.object({ display: z.enum(['primary', 'all']).optional() });
type Params = z.infer<typeof Params>;

const LINUX_TOOLS: ReadonlyArray<{ cmd: string; args: (out: string) => string[] }> = [
  { cmd: 'grim', args: (o) => [o] },
  { cmd: 'scrot', args: (o) => ['-o', o] },
  { cmd: 'import', args: (o) => ['-window', 'root', o] },
  { cmd: 'gnome-screenshot', args: (o) => ['-f', o] },
];

// PowerShell capture script: saves PNG to $out, prints the Windows path on stdout.
function psCommand(all: boolean): string {
  const bounds = all
    ? '[System.Windows.Forms.SystemInformation]::VirtualScreen'
    : '[System.Windows.Forms.Screen]::PrimaryScreen.Bounds';
  return [
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
    "$out=[System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(),'png');",
    `$b=${bounds};`,
    '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height;',
    '$g=[System.Drawing.Graphics]::FromImage($bmp);',
    '$g.CopyFromScreen($b.X,$b.Y,0,0,$bmp.Size);',
    "$bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::Png);",
    'Write-Output $out',
  ].join(' ');
}

async function captureWindows(spawn: SpawnFn, wsl: boolean, all: boolean): Promise<string> {
  const r = await spawn('powershell.exe', ['-NoProfile', '-Command', psCommand(all)], { timeoutMs: 15_000 });
  if (r.code !== 0) throw new Error(r.stderr || `powershell exit ${r.code}`);
  const winPath = r.stdout.toString().trim();
  if (!winPath) throw new Error('no screenshot path returned');
  if (!wsl) return winPath;
  const w = await spawn('wslpath', ['-u', winPath], { timeoutMs: 5_000 });
  if (w.code !== 0) throw new Error('wslpath failed');
  return w.stdout.toString().trim();
}

async function captureLinux(spawn: SpawnFn, out: string): Promise<void> {
  for (const tool of LINUX_TOOLS) {
    try {
      const r = await spawn(tool.cmd, tool.args(out), { timeoutMs: 15_000 });
      if (r.code === 0) return;
    } catch { /* ENOENT → try next tool */ }
  }
  throw new Error('no screenshot tool available (install grim/scrot/imagemagick/gnome-screenshot)');
}

export const screenshotCapability: Capability<Params> = {
  id: 'screenshot',
  titleKey: 'cap.screenshot.title',
  tier: 'read',
  defaultPolicy: 'auto',
  edition: 'solo',
  paramsSchema: Params,
  preview: (args, lang) => getMessage('cap.screenshot.preview', lang, { display: args.display ?? 'primary' }),
  async run(args, ctx): Promise<CapabilityResult> {
    const platform: PlatformId = ctx.platform ?? detectPlatform();
    const all = args.display === 'all';
    let path: string;
    try {
      if (platform === 'win-native' || platform === 'win-wsl') {
        path = await captureWindows(ctx.spawn, platform === 'win-wsl', all);
      } else if (platform === 'darwin') {
        path = join(tmpdir(), `deckent-ss-${ctx.now}.png`);
        const r = await ctx.spawn('screencapture', ['-x', '-t', 'png', path], { timeoutMs: 15_000 });
        if (r.code !== 0) throw new Error(r.stderr || `screencapture exit ${r.code}`);
      } else if (platform === 'linux') {
        path = join(tmpdir(), `deckent-ss-${ctx.now}.png`);
        await captureLinux(ctx.spawn, path);
      } else {
        return { text: getMessage('cap.screenshot.unsupported', ctx.lang) };
      }
    } catch (e) {
      return { text: getMessage('cap.screenshot.failed', ctx.lang, { error: e instanceof Error ? e.message : String(e) }) };
    }
    try {
      const data = await readFile(path);
      void unlink(path).catch(() => {});
      return { media: [{ kind: 'photo', filename: `screenshot-${ctx.now}.png`, mime: 'image/png', data,
        caption: getMessage('cap.screenshot.caption', ctx.lang) + ` · ${hostname()} · ${args.display ?? 'primary'}` }] };
    } catch (e) {
      return { text: getMessage('cap.screenshot.failed', ctx.lang, { error: e instanceof Error ? e.message : String(e) }) };
    }
  },
};
```

- [ ] **Step 6: Add i18n keys to `src/cli/helpers/messages.ts`** (both `en` and `tr` maps), values per the "i18n keys to add" list above.

- [ ] **Step 7: Run unit test + tsc**

Run: `npx vitest run tests/connectors/capabilities/screenshot.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 8: Write the Tier-1 real-run smoke** — `tests/connectors/capabilities/screenshot.smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { screenshotCapability } from '../../../src/connectors/capabilities/builtin/screenshot.js';
import { defaultSpawn } from '../../../src/connectors/capabilities/spawn.js';
import { detectPlatform } from '../../../src/connectors/capabilities/platform.js';

// Proof-of-function: REAL host capture. Skips with reason on a headless/unsupported host
// so it never produces a false pass.
describe('screenshot real-run (proof-of-function)', () => {
  it('captures a real PNG on this host (or skips honestly)', async () => {
    const platform = detectPlatform();
    if (platform === 'unsupported') return; // honest skip
    const res = await screenshotCapability.run({}, {
      chatKey: 'smoke', project: process.cwd(), lang: 'en', config: { enabled: true },
      now: 1_700_000_000_000, spawn: defaultSpawn, loadMailTransport: async () => { throw new Error('n/a'); },
    });
    if (res.text && /not supported|failed|başarısız|desteklenmiyor/i.test(res.text)) {
      // No display / tool unavailable on this host → honest skip, not a false pass.
      return;
    }
    expect(res.media?.[0]?.data.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect((res.media?.[0]?.data.length ?? 0)).toBeGreaterThan(100);
  }, 20_000);
});
```

- [ ] **Step 9: Run the smoke on this host (WSL → win-wsl path)**

Run: `npx vitest run tests/connectors/capabilities/screenshot.smoke.test.ts`
Expected: PASS — a real PNG (magic bytes `89 50 4E 47`, size > 100B) captured via `powershell.exe`, OR an honest in-test skip if no display. Record the actual outcome in the result notes (pre-fix red / post-fix green is not applicable here; this is a real-binary proof).

- [ ] **Step 10: Commit**

```bash
git add src/connectors/capabilities/spawn.ts src/connectors/capabilities/builtin/screenshot.ts src/connectors/capabilities/types.ts src/cli/helpers/messages.ts tests/connectors/capabilities/screenshot.test.ts tests/connectors/capabilities/screenshot.smoke.test.ts
git commit -m "feat(capabilities): screenshot capability — 4-platform adapters + real-PNG proof (slice 1 t4)"
```

---

### Task 5: `send_mail` capability + nodemailer optionalDependency

**Files:**
- Create: `src/connectors/capabilities/mail-transport.ts`
- Create: `src/connectors/capabilities/builtin/send-mail.ts`
- Modify: `package.json` (`optionalDependencies.nodemailer`)
- Modify: `src/cli/helpers/messages.ts` (`cap.mail.*` keys, en/tr)
- Test: `tests/connectors/capabilities/send-mail.test.ts`
- Test (Tier-1 real-run): `tests/connectors/capabilities/send-mail.smoke.test.ts`

**Interfaces:**
- Consumes: `Capability`/`CapabilityContext`/`MailTransport`/`MailConfig` (T1).
- Produces: `loadNodemailerTransport(cfg): Promise<MailTransport>`; `sendMailCapability: Capability<{to,subject,body}>`; `matchRecipient(addr, rule): boolean` (exported for tests).

i18n keys (`messages.ts`): `cap.mail.title` (en "Send email" / tr "Mail gönder"), `cap.mail.recipient_denied` (en "Recipient not allowed by policy: {to}" / tr "Alıcı policy ile izinli değil: {to}"), `cap.mail.smtp_missing` (en "SMTP is not configured in .deck." / tr "SMTP .deck'te yapılandırılmamış."), `cap.mail.sent` (en "Mail sent to {to} · {subject} ({id})" / tr "Mail gönderildi: {to} · {subject} ({id})"), `cap.mail.failed` (en "Mail failed: {error}" / tr "Mail başarısız: {error}"), `cap.mail.preview` (en "📧 To {to} · Subject {subject} · {body}" / tr "📧 Kime {to} · Konu {subject} · {body}").

- [ ] **Step 1: Write the failing unit test** — `tests/connectors/capabilities/send-mail.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { sendMailCapability, matchRecipient } from '../../../src/connectors/capabilities/builtin/send-mail.js';
import type { CapabilityContext, MailTransport } from '../../../src/connectors/capabilities/types.js';

function ctx(over: Partial<CapabilityContext>): CapabilityContext {
  return { chatKey: 'c', project: '/tmp', lang: 'en', config: { enabled: true }, now: 1, spawn: vi.fn() as never,
    loadMailTransport: async () => { throw new Error('SMTP not configured'); }, ...over } as CapabilityContext;
}

describe('matchRecipient', () => {
  it('exact + domain rules', () => {
    expect(matchRecipient('a@x.com', 'a@x.com')).toBe(true);
    expect(matchRecipient('a@x.com', '@x.com')).toBe(true);
    expect(matchRecipient('a@x.com', '*@x.com')).toBe(true);
    expect(matchRecipient('a@y.com', '@x.com')).toBe(false);
  });
});

describe('sendMailCapability', () => {
  it('missing SMTP config → honest error, no send', async () => {
    const res = await sendMailCapability.run({ to: 'a@x.com', subject: 's', body: 'b' }, ctx({}));
    expect(res.text).toMatch(/SMTP|yapılandırılmamış/i);
  });
  it('recipient outside allowlist → denied before send', async () => {
    const sendMail = vi.fn();
    const res = await sendMailCapability.run({ to: 'a@evil.com', subject: 's', body: 'b' },
      ctx({ config: { enabled: true, mail: { allowedRecipients: ['@corp.com'] } },
            loadMailTransport: async () => ({ sendMail } as unknown as MailTransport) }));
    expect(sendMail).not.toHaveBeenCalled();
    expect(res.text).toMatch(/not allowed|izinli değil/i);
  });
  it('valid → calls transport with correct envelope', async () => {
    const sendMail = vi.fn(async () => ({ messageId: 'mid-1' }));
    const res = await sendMailCapability.run({ to: 'a@corp.com', subject: 'Hi', body: 'Body' },
      ctx({ config: { enabled: true, mail: { from: 'bot@corp.com', allowedRecipients: ['@corp.com'], smtp: { host: 'smtp' } } },
            loadMailTransport: async () => ({ sendMail } as unknown as MailTransport) }));
    expect(sendMail).toHaveBeenCalledWith({ from: 'bot@corp.com', to: 'a@corp.com', subject: 'Hi', text: 'Body' });
    expect(res.text).toContain('mid-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/send-mail.test.ts`
Expected: FAIL (Cannot find module `send-mail.js`).

- [ ] **Step 3: Write `src/connectors/capabilities/mail-transport.ts`**

```ts
import type { MailConfig, MailTransport } from './types.js';

// Dynamic nodemailer load (optionalDependency) — mirrors loadGrammy(): only loaded
// when mail actually runs, so tsc/unit-tests don't need it installed.
export async function loadNodemailerTransport(cfg: MailConfig | undefined): Promise<MailTransport> {
  if (!cfg?.smtp?.host) throw new Error('SMTP not configured');
  const moduleName = 'nodemailer';
  const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<{ createTransport: (o: unknown) => { sendMail: (m: unknown) => Promise<{ messageId?: string }> } }>);
  const t = mod.createTransport({
    host: cfg.smtp.host, port: cfg.smtp.port ?? 587, secure: cfg.smtp.secure ?? false,
    auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined,
  });
  return { async sendMail(msg) { const info = await t.sendMail(msg); return { messageId: String(info.messageId ?? '') }; } };
}
```

- [ ] **Step 4: Write `src/connectors/capabilities/builtin/send-mail.ts`**

```ts
import { z } from 'zod';
import { getMessage } from '../../../cli/helpers/messages.js';
import type { Capability, CapabilityContext, CapabilityResult } from '../types.js';

const Params = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().min(1),
  body: z.string(),
});
type Params = z.infer<typeof Params>;

export function matchRecipient(addr: string, rule: string): boolean {
  if (rule.startsWith('*@')) return addr.toLowerCase().endsWith(rule.slice(1).toLowerCase());
  if (rule.startsWith('@')) return addr.toLowerCase().endsWith(rule.toLowerCase());
  return addr.toLowerCase() === rule.toLowerCase();
}

function recipientsOf(to: string | readonly string[]): string[] { return Array.isArray(to) ? [...to] : [to as string]; }

function allowed(to: string[], allow?: readonly string[]): boolean {
  if (!allow || allow.length === 0) return true;
  return to.every((addr) => allow.some((rule) => matchRecipient(addr, rule)));
}

export const sendMailCapability: Capability<Params> = {
  id: 'send_mail',
  titleKey: 'cap.mail.title',
  tier: 'external',
  defaultPolicy: 'confirm',
  edition: 'solo',
  paramsSchema: Params,
  preview: (args, lang) => getMessage('cap.mail.preview', lang, {
    to: recipientsOf(args.to).join(', '), subject: args.subject, body: args.body.slice(0, 120),
  }),
  async run(args, ctx): Promise<CapabilityResult> {
    const to = recipientsOf(args.to);
    if (!allowed(to, ctx.config.mail?.allowedRecipients)) {
      return { text: getMessage('cap.mail.recipient_denied', ctx.lang, { to: to.join(', ') }) };
    }
    let transport;
    try { transport = await ctx.loadMailTransport(ctx.config.mail); }
    catch { return { text: getMessage('cap.mail.smtp_missing', ctx.lang) }; }
    const from = ctx.config.mail?.from ?? ctx.config.mail?.smtp?.user ?? '';
    try {
      const { messageId } = await transport.sendMail({ from, to: args.to, subject: args.subject, text: args.body });
      return { text: getMessage('cap.mail.sent', ctx.lang, { to: to.join(', '), subject: args.subject, id: messageId }) };
    } catch (e) {
      return { text: getMessage('cap.mail.failed', ctx.lang, { error: e instanceof Error ? e.message : String(e) }) };
    }
  },
};
```

- [ ] **Step 5: Add `nodemailer` to `package.json` `optionalDependencies`** (alongside `discord.js`):

```json
  "optionalDependencies": {
    "discord.js": "^14.26.3",
    "nodemailer": "^6.9.14"
  }
```

Then `npm install` (records the dep; nodemailer is only loaded at runtime).

- [ ] **Step 6: Add `cap.mail.*` i18n keys to `messages.ts`** (en + tr) per the list above.

- [ ] **Step 7: Run unit test + tsc**

Run: `npx vitest run tests/connectors/capabilities/send-mail.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 8: Write the Tier-1 real-run smoke (local SMTP sink)** — `tests/connectors/capabilities/send-mail.smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:net';
import { sendMailCapability } from '../../../src/connectors/capabilities/builtin/send-mail.js';
import { loadNodemailerTransport } from '../../../src/connectors/capabilities/mail-transport.js';
import type { CapabilityContext } from '../../../src/connectors/capabilities/types.js';

// Proof-of-function: a REAL SMTP protocol round-trip against a local in-process sink
// (not a nodemailer mock). Hermetic: tmp port, async, torn down in the test.
function smtpSink(): Promise<{ server: Server; port: number; received: () => string }> {
  let buf = '';
  return new Promise((resolve) => {
    const server = createServer((sock) => {
      sock.write('220 localhost ESMTP sink\r\n');
      sock.on('data', (d) => {
        buf += d.toString();
        const line = d.toString();
        if (/^EHLO|^HELO/im.test(line)) sock.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH/im.test(line)) sock.write('235 ok\r\n');
        else if (/^MAIL FROM|^RCPT TO/im.test(line)) sock.write('250 ok\r\n');
        else if (/^DATA/im.test(line)) sock.write('354 end with .\r\n');
        else if (/^\.\r\n/m.test(line)) sock.write('250 queued\r\n');
        else if (/^QUIT/im.test(line)) { sock.write('221 bye\r\n'); sock.end(); }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, received: () => buf }));
  });
}

describe('send_mail real-run (proof-of-function, local SMTP sink)', () => {
  it('opens a real SMTP connection and transmits the envelope', async () => {
    const { server, port, received } = await smtpSink();
    try {
      const cfg = { enabled: true, mail: { from: 'bot@test.local', smtp: { host: '127.0.0.1', port, secure: false } } };
      const ctx = { chatKey: 'smoke', project: process.cwd(), lang: 'en', config: cfg, now: 1,
        spawn: (async () => ({ code: 0, stdout: Buffer.from(''), stderr: '' })) as CapabilityContext['spawn'],
        loadMailTransport: loadNodemailerTransport } as CapabilityContext;
      const res = await sendMailCapability.run({ to: 'dest@test.local', subject: 'Smoke', body: 'Hello' }, ctx);
      expect(res.text).toMatch(/sent|gönderildi/i);
      const wire = received();
      expect(wire).toMatch(/RCPT TO:.*dest@test.local/i);
      expect(wire).toMatch(/Subject: Smoke/i);
    } finally { server.close(); }
  }, 20_000);
});
```

- [ ] **Step 9: Run the SMTP-sink smoke**

Run: `npx vitest run tests/connectors/capabilities/send-mail.smoke.test.ts`
Expected: PASS — nodemailer opens a real socket to the sink; the wire shows `RCPT TO:…dest@test.local` and `Subject: Smoke`. (Requires `nodemailer` installed from Step 5.)

- [ ] **Step 10: Commit**

```bash
git add src/connectors/capabilities/mail-transport.ts src/connectors/capabilities/builtin/send-mail.ts package.json package-lock.json src/cli/helpers/messages.ts tests/connectors/capabilities/send-mail.test.ts tests/connectors/capabilities/send-mail.smoke.test.ts
git commit -m "feat(capabilities): send_mail capability — nodemailer + recipient allowlist + real SMTP-sink proof (slice 1 t5)"
```

---

### Task 6: `bot_capabilities` config block

**Files:**
- Modify: `src/core/config-types.ts` (add `bot_capabilities?: BotCapabilitiesConfig` to `DeckentConfig`; import the type)
- Test: `tests/core/config-bot-capabilities.test.ts`

**Interfaces:**
- Consumes: `BotCapabilitiesConfig` (T1), existing `interpolateConfig` (`deck-interpolation.ts:10`), `deepMerge` (`config.ts:479`).
- Produces: `DeckentConfig.bot_capabilities?: BotCapabilitiesConfig`.

- [ ] **Step 1: Write the failing test** — `tests/core/config-bot-capabilities.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { interpolateConfig } from '../../src/core/deck-interpolation.js';
import type { DeckentConfig } from '../../src/core/config-types.js';

describe('bot_capabilities config', () => {
  it('typechecks on DeckentConfig and interpolates $DECK SMTP secrets', () => {
    const cfg: DeckentConfig = {
      bot_capabilities: { enabled: true, policies: { screenshot: 'auto', send_mail: 'confirm' },
        mail: { from: '$DECK:MAIL_FROM', smtp: { host: '$DECK:SMTP_HOST', port: 587 } } },
    } as DeckentConfig;
    // interpolateConfig replaces $DECK:KEY using a secrets map. Stub secrets via the .deck loader
    // is covered elsewhere; here assert the shape survives interpolation untouched when no .deck.
    const out = interpolateConfig(cfg, process.cwd());
    expect(out.bot_capabilities?.enabled).toBe(true);
    expect(out.bot_capabilities?.policies?.send_mail).toBe('confirm');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/config-bot-capabilities.test.ts`
Expected: FAIL (Property `bot_capabilities` does not exist on type `DeckentConfig`).

- [ ] **Step 3: Add the field to `DeckentConfig`** in `src/core/config-types.ts`:

```ts
import type { BotCapabilitiesConfig } from '../connectors/capabilities/types.js';
// ...inside interface DeckentConfig:
  bot_capabilities?: BotCapabilitiesConfig;
```

- [ ] **Step 4: Run test to verify it passes + tsc**

Run: `npx vitest run tests/core/config-bot-capabilities.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add src/core/config-types.ts tests/core/config-bot-capabilities.test.ts
git commit -m "feat(capabilities): bot_capabilities config block (flag-gate + policies + mail/.deck) (slice 1 t6)"
```

---

### Task 7: Connector `sendMedia` (interface + Telegram impl)

**Files:**
- Modify: `src/connectors/types.ts` (add optional `sendMedia`; re-export `MediaAttachment`)
- Modify: `src/connectors/telegram.ts` (implement `sendMedia`; extend `loadGrammy`/`GrammyBotInstance` for `sendPhoto`/`sendDocument`/`InputFile`; inject `InputFile` ctor for tests)
- Test: `tests/connectors/telegram-sendmedia.test.ts`

**Interfaces:**
- Consumes: `MediaAttachment` (T1).
- Produces: `IMessageConnector.sendMedia?(channelId: string, media: MediaAttachment): Promise<void>`; `TelegramConnector` second constructor arg `InputFileCtor?`.

- [ ] **Step 1: Write the failing test** — `tests/connectors/telegram-sendmedia.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { TelegramConnector } from '../../src/connectors/telegram.js';
import type { MediaAttachment } from '../../src/connectors/types.js';

function mockBot() {
  const api = { sendMessage: vi.fn(async () => ({})), sendPhoto: vi.fn(async () => ({})), sendDocument: vi.fn(async () => ({})),
    sendChatAction: vi.fn(async () => ({})), editMessageText: vi.fn(async () => ({})) };
  const instance = { on: vi.fn(), start: vi.fn(async () => {}), stop: vi.fn(async () => {}), api };
  const Bot = vi.fn(() => instance) as unknown as { new (t: string): typeof instance };
  return { Bot, instance };
}
class FakeInputFile { constructor(public data: Buffer, public filename: string) {} }

const cfg = { enabled: true, token: 'x' } as never;
const png: MediaAttachment = { kind: 'photo', filename: 's.png', mime: 'image/png', data: Buffer.from([1, 2, 3]), caption: 'cap' };

describe('TelegramConnector.sendMedia', () => {
  it('photo → sendPhoto(channelId, InputFile(data,filename), {caption})', async () => {
    const { Bot, instance } = mockBot();
    const c = new TelegramConnector(Bot as never, FakeInputFile as never);
    await c.startOutbound(cfg);
    await c.sendMedia('123', png);
    expect(instance.api.sendPhoto).toHaveBeenCalledTimes(1);
    const [chat, file, extra] = instance.api.sendPhoto.mock.calls[0]!;
    expect(chat).toBe('123');
    expect((file as FakeInputFile).data).toEqual(png.data);
    expect((extra as { caption: string }).caption).toBe('cap');
  });
  it('document → sendDocument', async () => {
    const { Bot, instance } = mockBot();
    const c = new TelegramConnector(Bot as never, FakeInputFile as never);
    await c.startOutbound(cfg);
    await c.sendMedia('123', { ...png, kind: 'document', filename: 'f.pdf', mime: 'application/pdf' });
    expect(instance.api.sendDocument).toHaveBeenCalledTimes(1);
  });
}
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/telegram-sendmedia.test.ts`
Expected: FAIL (`sendMedia` is not a function / wrong constructor arity).

- [ ] **Step 3: Modify `src/connectors/types.ts`**

Add to `IMessageConnector` (after `editMessage?`):

```ts
  sendMedia?(channelId: string, media: MediaAttachment): Promise<void>;
```

Add the import + re-export at the top of the file:

```ts
import type { MediaAttachment } from './capabilities/types.js';
export type { MediaAttachment } from './capabilities/types.js';
```

- [ ] **Step 4: Modify `src/connectors/telegram.ts`**

Extend the grammY surface + constructor + add `sendMedia`:

```ts
// In GrammyBotInstance.api, add:
//   sendPhoto(chatId: string | number, photo: unknown, other?: { caption?: string }): Promise<unknown>;
//   sendDocument(chatId: string | number, doc: unknown, other?: { caption?: string }): Promise<unknown>;
// Add an InputFile constructor type:
interface InputFileCtor { new (data: Buffer, filename?: string): unknown }

// Constructor: accept an optional InputFile ctor (injected in tests; loaded from grammy in prod):
constructor(private readonly BotClass?: GrammyBotConstructor, private InputFileCtor?: InputFileCtor) { super(); }

// loadGrammy now also captures InputFile:
private async loadGrammy(): Promise<GrammyBotConstructor> {
  const moduleName = 'grammy';
  const mod = await (Function('m', 'return import(m)')(moduleName) as Promise<{ Bot: unknown; InputFile: unknown }>);
  this.InputFileCtor = this.InputFileCtor ?? (mod.InputFile as InputFileCtor);
  return mod.Bot as unknown as GrammyBotConstructor;
}

async sendMedia(channelId: string, media: import('./types.js').MediaAttachment): Promise<void> {
  if (!this.bot) throw new Error('Telegram connector not started');
  if (!this.InputFileCtor) await this.loadGrammy(); // ensure InputFile available (outbound path may skip start)
  const file = new (this.InputFileCtor as InputFileCtor)(Buffer.from(media.data), media.filename);
  const extra = media.caption ? { caption: media.caption } : undefined;
  if (media.kind === 'photo') await this.bot.api.sendPhoto(channelId, file, extra);
  else await this.bot.api.sendDocument(channelId, file, extra);
}
```

> NOTE: `startOutbound` sets `this.bot` without `loadGrammy` when a `BotClass` is injected; in that case `InputFileCtor` must also be injected (the test does this). In production both come from `loadGrammy`.

- [ ] **Step 5: Run test + tsc**

Run: `npx vitest run tests/connectors/telegram-sendmedia.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 6: Run the existing telegram suite (no regressions)**

Run: `npx vitest run tests/connectors/telegram.test.ts`
Expected: PASS (existing tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/connectors/types.ts src/connectors/telegram.ts tests/connectors/telegram-sendmedia.test.ts
git commit -m "feat(connectors): sendMedia primitive + Telegram sendPhoto/sendDocument (slice 1 t7)"
```

---

### Task 8: Capability executor (validate → run → media sink → audit)

**Files:**
- Create: `src/connectors/capabilities/execute.ts`
- Test: `tests/connectors/capabilities/execute.test.ts`

**Interfaces:**
- Consumes: `CapabilityRegistry` (T1), `CapabilityContext`/`MediaAttachment`/`Tier`/`PolicyDecision` (T1).
- Produces: `type MediaSink = (channelId: string, media: MediaAttachment) => Promise<void>`; `function runCapability(registry, capId, rawArgs, ctx, channelId, sink, decision): Promise<string>`.

- [ ] **Step 1: Write the failing test** — `tests/connectors/capabilities/execute.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CapabilityRegistry } from '../../../src/connectors/capabilities/registry.js';
import { runCapability } from '../../../src/connectors/capabilities/execute.js';
import type { Capability, CapabilityContext } from '../../../src/connectors/capabilities/types.js';

function baseCtx(root: string): CapabilityContext {
  return { chatKey: 'c', project: root, lang: 'en', config: { enabled: true }, now: 123,
    spawn: vi.fn() as never, loadMailTransport: async () => { throw new Error('n/a'); } };
}
const mediaCap: Capability = { id: 'shot', titleKey: 't', tier: 'read', defaultPolicy: 'auto', edition: 'solo',
  paramsSchema: z.object({}), preview: () => '', run: async () => ({ text: 'captured',
    media: [{ kind: 'photo', filename: 'x.png', mime: 'image/png', data: Buffer.from([9]) }] }) };

describe('runCapability', () => {
  it('runs capability, sends media via sink out-of-band, returns text-ack, writes audit', () => {
    const root = mkdtempSync(join(tmpdir(), 'cap-exec-'));
    const r = new CapabilityRegistry(); r.register(mediaCap);
    const sink = vi.fn(async () => {});
    return runCapability(r, 'shot', {}, baseCtx(root), 'chan1', sink, 'auto').then((out) => {
      expect(out).toBe('captured');
      expect(sink).toHaveBeenCalledWith('chan1', expect.objectContaining({ kind: 'photo' }));
      const audit = readFileSync(join(root, '.deckent', 'capability-audit.jsonl'), 'utf-8');
      expect(audit).toMatch(/"capId":"shot"/);
      expect(audit).toMatch(/"decision":"auto"/);
      expect(audit).toMatch(/"status":"ok"/);
    });
  });
  it('unknown capability → honest error', async () => {
    const out = await runCapability(new CapabilityRegistry(), 'ghost', {}, baseCtx(mkdtempSync(join(tmpdir(), 'cap-'))), 'c', async () => {}, 'auto');
    expect(out).toMatch(/unknown/i);
  });
  it('invalid args → honest validation error, run not attempted', async () => {
    const r = new CapabilityRegistry();
    r.register({ ...mediaCap, paramsSchema: z.object({ n: z.number() }), run: vi.fn() as never });
    const out = await runCapability(r, 'shot', { n: 'x' }, baseCtx(mkdtempSync(join(tmpdir(), 'cap-'))), 'c', async () => {}, 'auto');
    expect(out).toMatch(/invalid args/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/execute.test.ts`
Expected: FAIL (Cannot find module `execute.js`).

- [ ] **Step 3: Write `src/connectors/capabilities/execute.ts`**

```ts
import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CapabilityRegistry } from './registry.js';
import type { CapabilityContext, MediaAttachment, Tier, PolicyDecision } from './types.js';

export type MediaSink = (channelId: string, media: MediaAttachment) => Promise<void>;

interface AuditEntry { ts: number; chatKey: string; project: string; capId: string; tier: Tier; decision: PolicyDecision; status: 'ok' | 'error' }

async function audit(root: string, entry: AuditEntry): Promise<void> {
  try {
    const file = join(root, '.deckent', 'capability-audit.jsonl');
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify(entry) + '\n', 'utf-8');
  } catch { /* audit is best-effort, never fails the action */ }
}

export async function runCapability(
  registry: CapabilityRegistry, capId: string, rawArgs: Record<string, unknown>,
  ctx: CapabilityContext, channelId: string, sink: MediaSink, decision: PolicyDecision,
): Promise<string> {
  const cap = registry.get(capId);
  if (!cap) return `[capability-error] unknown capability: ${capId}`;
  const parsed = cap.paramsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return `[capability-error] ${capId}: invalid args (${parsed.error.issues.map((i) => i.message).join('; ')})`;
  }
  let status: 'ok' | 'error' = 'ok';
  try {
    const result = await cap.run(parsed.data, ctx);
    for (const m of result.media ?? []) {
      try { await sink(channelId, m); } catch { /* sink handles its own honest fallback */ }
    }
    return result.text ?? `[${capId}] done`;
  } catch (e) {
    status = 'error';
    return `[capability-error] ${capId}: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await audit(ctx.project, { ts: ctx.now, chatKey: ctx.chatKey, project: ctx.project, capId, tier: cap.tier, decision, status });
  }
}
```

- [ ] **Step 4: Run test + tsc**

Run: `npx vitest run tests/connectors/capabilities/execute.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/capabilities/execute.ts tests/connectors/capabilities/execute.test.ts
git commit -m "feat(capabilities): shared executor (validate/run/media-sink/audit) (slice 1 t8)"
```

---

### Task 9: Capability-aware gated dispatcher

**Files:**
- Modify: `src/connectors/bot-agentic.ts` (add `capabilities?` to `GatedDispatcherDeps`; capability branch; gate messages)
- Modify: `src/cli/helpers/messages.ts` (`cap.gate.*` keys, en/tr)
- Test: `tests/connectors/bot-agentic-capabilities.test.ts`

**Interfaces:**
- Consumes: `parkedActionMessage` (existing in `bot-agentic.ts`), `PolicyResolution` (T2).
- Produces: `interface CapabilityGate { has(id): boolean; resolve(id): PolicyResolution; runAuto(id, args): Promise<string> }`; `GatedDispatcherDeps.capabilities?: CapabilityGate`.

i18n keys: `cap.gate.unavailable` (en "Capability '{id}' is not available." / tr "'{id}' yeteneği kullanılamıyor."), `cap.gate.denied` (en "Capability '{id}' is denied by policy." / tr "'{id}' yeteneği policy ile reddedildi.").

- [ ] **Step 1: Write the failing test** — `tests/connectors/bot-agentic-capabilities.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { makeGatedDispatcher, type CapabilityGate } from '../../src/connectors/bot-agentic.js';
import type { McpToolDispatcher } from '../../src/connectors/chat-bridge.js';

const inner: McpToolDispatcher = { dispatch: vi.fn(async () => 'INNER') };

function gate(resolve: CapabilityGate['resolve'], runAuto = vi.fn(async () => 'RAN')): CapabilityGate {
  return { has: (id) => id === 'screenshot', resolve, runAuto };
}

describe('makeGatedDispatcher — capabilities', () => {
  it('auto → runs capability (not parked, not inner)', async () => {
    const runAuto = vi.fn(async () => 'RAN');
    const park = vi.fn();
    const d = makeGatedDispatcher({ inner, park, capabilities: gate(() => 'auto', runAuto) });
    expect(await d.dispatch('screenshot', {})).toBe('RAN');
    expect(runAuto).toHaveBeenCalledWith('screenshot', {});
    expect(park).not.toHaveBeenCalled();
    expect(inner.dispatch).not.toHaveBeenCalled();
  });
  it('confirm → parks (existing approve flow), does NOT run', async () => {
    const runAuto = vi.fn();
    const park = vi.fn(() => 'cap-7');
    const d = makeGatedDispatcher({ inner, park, capabilities: gate(() => 'confirm', runAuto) });
    const out = await d.dispatch('screenshot', { display: 'primary' });
    expect(park).toHaveBeenCalledWith('screenshot', { display: 'primary' });
    expect(runAuto).not.toHaveBeenCalled();
    expect(out).toContain('cap-7');
  });
  it('deny → refusal, nothing runs/parks', async () => {
    const park = vi.fn();
    const d = makeGatedDispatcher({ inner, park, capabilities: gate(() => 'deny') });
    expect(await d.dispatch('screenshot', {})).toMatch(/denied|reddedildi/i);
    expect(park).not.toHaveBeenCalled();
  });
  it('unavailable → not-available message', async () => {
    const d = makeGatedDispatcher({ inner, park: vi.fn(), capabilities: gate(() => 'unavailable') });
    expect(await d.dispatch('screenshot', {})).toMatch(/not available|kullanılamıyor/i);
  });
  it('non-capability tool path is unchanged (read-only auto-exec)', async () => {
    const d = makeGatedDispatcher({ inner, park: vi.fn(), capabilities: gate(() => 'auto') });
    expect(await d.dispatch('deckent_status', {})).toBe('INNER');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/bot-agentic-capabilities.test.ts`
Expected: FAIL (`capabilities`/`CapabilityGate` not exported; capability branch absent).

- [ ] **Step 3: Modify `src/connectors/bot-agentic.ts`**

Add the gate type + dep, the capability branch at the TOP of `dispatch` (before the existing risky/safe logic), and two gate messages:

```ts
import { getMessage } from '../cli/helpers/messages.js';
import type { PolicyResolution } from './capabilities/policy.js';

export interface CapabilityGate {
  has(id: string): boolean;
  resolve(id: string): PolicyResolution;
  runAuto(id: string, args: Record<string, unknown>): Promise<string>;
}

// In GatedDispatcherDeps, add:
//   readonly capabilities?: CapabilityGate;

// At the very start of the returned dispatch(name, args), before the checkpoint guard:
if (deps.capabilities?.has(name)) {
  const decision = deps.capabilities.resolve(name);
  if (decision === 'unavailable') return getMessage('cap.gate.unavailable', lang, { id: name });
  if (decision === 'deny') return getMessage('cap.gate.denied', lang, { id: name });
  if (decision === 'confirm') { const id = deps.park(name, args); return parkedActionMessage(id, name, args, lang); }
  return deps.capabilities.runAuto(name, args); // auto
}
```

- [ ] **Step 4: Add `cap.gate.*` i18n keys** to `messages.ts` (en + tr).

- [ ] **Step 5: Run test + tsc + existing bot-agentic suite**

Run: `npx vitest run tests/connectors/bot-agentic-capabilities.test.ts tests/connectors/bot-agentic.test.ts && npx tsc --noEmit`
Expected: PASS (new + existing), tsc EXIT=0.

- [ ] **Step 6: Commit**

```bash
git add src/connectors/bot-agentic.ts src/cli/helpers/messages.ts tests/connectors/bot-agentic-capabilities.test.ts
git commit -m "feat(capabilities): capability-aware gated dispatcher — one chokepoint preserved (slice 1 t9)"
```

---

### Task 10: Bootstrap wire — registry, context, gate, mediaSink, approve-path, prompt

**Files:**
- Create: `src/connectors/capabilities/prompt.ts` (`describeCapabilities`)
- Create: `src/connectors/capabilities/index.ts` (build a registry with the two builtins; `buildCapabilityContext`/`buildCapabilityGate`/`buildMediaSink` helpers)
- Modify: `src/connectors/connector-bootstrap.ts` (construct + wire; capability-aware approve-path; append capability catalog to the system prompt)
- Modify: `src/cli/helpers/messages.ts` (`cap.media.fallback` key, en/tr)
- Test: `tests/connectors/capabilities/bootstrap-wire.test.ts`

**Interfaces:**
- Consumes: everything T1–T9.
- Produces: `createBuiltinRegistry(): CapabilityRegistry`; `buildCapabilityGate(deps): CapabilityGate`; `buildMediaSink(connector, lang, send): MediaSink`; `describeCapabilities(registry, resolve, lang): string`.

i18n key: `cap.media.fallback` (en "[media: {filename} — this connector cannot display it]" / tr "[medya: {filename} — bu connector gösteremiyor]").

- [ ] **Step 1: Write the failing test** — `tests/connectors/capabilities/bootstrap-wire.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { createBuiltinRegistry, buildMediaSink } from '../../../src/connectors/capabilities/index.js';
import { describeCapabilities } from '../../../src/connectors/capabilities/prompt.js';
import { resolvePolicy } from '../../../src/connectors/capabilities/policy.js';

describe('builtin registry', () => {
  it('contains screenshot (read/auto) and send_mail (external/confirm)', () => {
    const r = createBuiltinRegistry();
    expect(r.has('screenshot')).toBe(true);
    expect(r.has('send_mail')).toBe(true);
    expect(r.get('screenshot')?.tier).toBe('read');
    expect(r.get('send_mail')?.defaultPolicy).toBe('confirm');
  });
});

describe('describeCapabilities', () => {
  it('lists only available capabilities (enabled), with ids', () => {
    const r = createBuiltinRegistry();
    const resolve = (id: string) => resolvePolicy(r.get(id)!, { chatKey: 'c', edition: 'solo', config: { enabled: true } });
    const text = describeCapabilities(r, resolve, 'en');
    expect(text).toContain('screenshot');
    expect(text).toContain('send_mail');
  });
  it('returns empty string when master disabled (nothing advertised)', () => {
    const r = createBuiltinRegistry();
    const resolve = (id: string) => resolvePolicy(r.get(id)!, { chatKey: 'c', edition: 'solo', config: { enabled: false } });
    expect(describeCapabilities(r, resolve, 'en')).toBe('');
  });
});

describe('buildMediaSink', () => {
  it('uses connector.sendMedia when present', async () => {
    const sendMedia = vi.fn(async () => {});
    const send = vi.fn(async () => {});
    const sink = buildMediaSink({ id: 'telegram', sendMedia } as never, 'en', send);
    await sink('chan', { kind: 'photo', filename: 'x.png', mime: 'image/png', data: Buffer.from([1]) });
    expect(sendMedia).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
  it('falls back to honest text when connector lacks sendMedia', async () => {
    const send = vi.fn(async () => {});
    const sink = buildMediaSink({ id: 'discord' } as never, 'en', send);
    await sink('chan', { kind: 'photo', filename: 'x.png', mime: 'image/png', data: Buffer.from([1]) });
    expect(send).toHaveBeenCalledWith('chan', expect.stringMatching(/cannot display|gösteremiyor/i));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/capabilities/bootstrap-wire.test.ts`
Expected: FAIL (Cannot find module `index.js` / `prompt.js`).

- [ ] **Step 3: Write `src/connectors/capabilities/index.ts`**

```ts
import { CapabilityRegistry } from './registry.js';
import { screenshotCapability } from './builtin/screenshot.js';
import { sendMailCapability } from './builtin/send-mail.js';
import { getMessage } from '../../cli/helpers/messages.js';
import type { MediaAttachment } from './types.js';
import type { MediaSink } from './execute.js';

export { CapabilityRegistry } from './registry.js';
export { runCapability, type MediaSink } from './execute.js';

export function createBuiltinRegistry(): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(screenshotCapability);
  r.register(sendMailCapability);
  return r;
}

interface MediaCapableConnector { id: string; sendMedia?(channelId: string, media: MediaAttachment): Promise<void> }

export function buildMediaSink(connector: MediaCapableConnector, lang: string, sendText: (channelId: string, text: string) => Promise<void>): MediaSink {
  return async (channelId, media) => {
    if (connector.sendMedia) { await connector.sendMedia(channelId, media); return; }
    await sendText(channelId, getMessage('cap.media.fallback', lang, { filename: media.filename }));
  };
}
```

- [ ] **Step 4: Write `src/connectors/capabilities/prompt.ts`**

```ts
import type { CapabilityRegistry } from './registry.js';
import type { PolicyResolution } from './policy.js';

// Builds the system-prompt catalog snippet the LLM reads to learn which capabilities
// it may call. Only non-unavailable capabilities are advertised. Empty string → nothing
// advertised (master disabled) so the bot stays text/CLI-tools only.
export function describeCapabilities(registry: CapabilityRegistry, resolve: (id: string) => PolicyResolution, _lang: string): string {
  const lines = registry.list()
    .filter((c) => resolve(c.id) !== 'unavailable')
    .map((c) => `- ${c.id}(${schemaHint(c.id)}): tier=${c.tier}`);
  if (lines.length === 0) return '';
  return ['', 'Host capabilities you may call as tools (subject to user approval):', ...lines].join('\n');
}

function schemaHint(id: string): string {
  if (id === 'screenshot') return "display?: 'primary'|'all'";
  if (id === 'send_mail') return 'to, subject, body';
  return '';
}
```

- [ ] **Step 5: Run the bootstrap-wire test + tsc**

Run: `npx vitest run tests/connectors/capabilities/bootstrap-wire.test.ts && npx tsc --noEmit`
Expected: PASS, tsc EXIT=0.

- [ ] **Step 6: Wire into `src/connectors/connector-bootstrap.ts`** (surgical, inside the per-connector bootstrap where `root`, `lang`, `cfg`, `connector`, `sessionId`, and the dispatcher are constructed):

(a) Build the registry + gate + context once per connector:

```ts
import { createBuiltinRegistry, buildMediaSink, runCapability } from './capabilities/index.js';
import { resolvePolicy } from './capabilities/policy.js';
import { detectPlatform } from './capabilities/platform.js';
import { defaultSpawn } from './capabilities/spawn.js';
import { loadNodemailerTransport } from './capabilities/mail-transport.js';
import { describeCapabilities } from './capabilities/prompt.js';

const capRegistry = createBuiltinRegistry();
const capConfig = cfg.bot_capabilities ?? { enabled: false };
const makeCapCtx = (channelId: string) => ({
  chatKey: channelId, project: root, lang, config: capConfig, now: Date.now(),
  platform: detectPlatform(), spawn: defaultSpawn, loadMailTransport: loadNodemailerTransport,
});
const capSink = (channelId: string) =>
  buildMediaSink(connector, lang, (c, t) => connector.sendMessage({ connector: connector.id, channelId: c, text: t }));
const capGate = (channelId: string) => ({
  has: (id: string) => capRegistry.has(id),
  resolve: (id: string) => { const c = capRegistry.get(id); return c ? resolvePolicy(c, { chatKey: channelId, config: capConfig, edition: 'solo' as const }) : 'unavailable' as const; },
  runAuto: (id: string, args: Record<string, unknown>) => runCapability(capRegistry, id, args, makeCapCtx(channelId), channelId, capSink(channelId), 'auto'),
});
```

(b) Pass `capabilities: capGate(sessionId)` into the existing `makeGatedDispatcher({...})` call.

(c) Capability-aware approve-path — where a parked action is executed on `approve <id>` (the `takeBotAction` consumer), route capability tools through the registry:

```ts
// after const parked = takeBotAction(root, id);  (existing)
if (parked && capRegistry.has(parked.tool)) {
  return runCapability(capRegistry, parked.tool, parked.args, makeCapCtx(parked.channelId), parked.channelId, capSink(parked.channelId), 'confirm');
}
// else existing actionDispatcher.dispatch(parked.tool, parked.args) path
```

(d) Advertise capabilities in the bot system prompt — when building the responder's provider, append the catalog when enabled:

```ts
const capCatalog = describeCapabilities(capRegistry, (id) => capGate(sessionId).resolve(id), lang);
// concatenate capCatalog onto buildBotSystemPrompt(root) before passing to the persistent provider.
```

- [ ] **Step 7: Add `cap.media.fallback` i18n key** to `messages.ts` (en + tr).

- [ ] **Step 8: Run the full connector + capabilities suites + tsc**

Run: `npx vitest run tests/connectors/ && npx tsc --noEmit`
Expected: PASS (all connector + capability tests), tsc EXIT=0.

- [ ] **Step 9: Hermetic CI simulation**

Run: `npm run test:ci-sim`
Expected: PASS — capability tests pass under hidden gitignored state (no real config/.deck/.brain).

- [ ] **Step 10: Commit**

```bash
git add src/connectors/capabilities/index.ts src/connectors/capabilities/prompt.ts src/connectors/connector-bootstrap.ts src/cli/helpers/messages.ts tests/connectors/capabilities/bootstrap-wire.test.ts
git commit -m "feat(capabilities): bootstrap wire — registry/gate/mediaSink/approve-path/prompt catalog (slice 1 t10)"
```

---

## Manual proof-of-function (dogfood, after merge + build + restart)

Not an automated step — the live god-level proof Alperen runs:
1. `.deck`: set `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS`; `.deckent/config.json`: `bot_capabilities.enabled = true`, `mail.from`, optional `mail.allowedRecipients`.
2. `npm run build` → `/mcp restart` → bot restart (Alperen).
3. From Telegram: "take a screenshot" → bot returns a photo of the host screen (auto). "send a mail to X about Y" → bot replies with a preview + `approve <id>` → on approve, the mail sends.

---

## Plan Self-Review

**Spec coverage:** S1 framework (registry T1, policy T2, platform T3), screenshot (T4), mail (T5), config (T6), media/sendMedia (T7), executor+audit (T8), dispatcher chokepoint wire (T9), bootstrap+approve+prompt (T10), test+proof-of-function (in T4/T5 smokes + T9/T10 + ci-sim). Roadmap (S2–S6) is documented in the spec; out of scope for this plan. ✅ No gaps.

**Placeholder scan:** every code step contains complete code; every test step contains complete test code; every run step has an exact command + expected outcome. ✅

**Type consistency:** `Capability`/`CapabilityContext`/`MediaAttachment`/`PolicyResolution`/`CapabilityGate`/`MediaSink` names + signatures are identical across T1–T10. `runCapability(registry, capId, rawArgs, ctx, channelId, sink, decision)` arity matches its callers in T9/T10. `screenshot` id, `send_mail` id, and config keys (`policies.screenshot`, `policies.send_mail`, `mail.allowedRecipients`) match across T2/T5/T6/T10. ✅
