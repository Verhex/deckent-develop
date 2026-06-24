import { readFile, unlink } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { getMessage } from '../../../cli/helpers/messages.js';
import { detectPlatform } from '../platform.js';
import type { Capability, CapabilityResult, PlatformId, SpawnFn } from '../types.js';

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
