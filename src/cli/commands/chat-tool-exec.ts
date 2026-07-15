// ═══ chat-tool-exec — deckent'in kendi aksiyon tool katmanı (Sprint 224 T-224-005) ═══
//
// "Agentic OSS run system" temeli: native REPL'in GERÇEKTEN dosya yazıp/okuyup
// komut çalıştırabilmesi. McpToolDispatcher arayüzünü implemente eder, böylece
// runChatNativeLoop'un mevcut tool_use plumbing'ine (stopReason:'tool_use' →
// dispatcher.dispatch) doğrudan takılır. Provider-agnostik: claude/codex/gemini
// hangisi tool_use emit ederse etsin aynı katman çalışır.
//
// GÜVENLİK:
//   • scope-guard — yol cwd DIŞINA çıkamaz (path traversal engeli).
//   • confirm-gate — yan-etkili tool'lar (write/edit/bash) çalıştırılmadan ÖNCE
//     onay sorar (claude-code "yes/no" hissi). read salt-okunur, onaysız.
//   • dispatch ASLA throw etmez — hata/iptal `[mcp-error]`/`[deckent]` string'i
//     olarak döner (loop bunu tool_result olarak modele geri besler).

import { writeFileSync, readFileSync, existsSync, mkdirSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, sep, parse } from 'node:path';
import { spawn } from 'node:child_process';
import type { McpToolDispatcher } from './chat-native.js';
import { DeckentError } from '../../core/errors.js';

/** Yan-etkili (onay gerektiren) tool adları. read salt-okunur → onaysız. */
const SIDE_EFFECTING: ReadonlySet<string> = new Set([
  'deckent_write_file',
  'deckent_edit_file',
  'deckent_bash',
]);

/**
 * User-facing confirm-prompt summaries (REPL-575 K5). This mechanism module is
 * string-free per CLAUDE.md i18n-FIRST: the interactive caller (run.tsx /
 * entry.ts) injects a localized set resolved via getMessage; headless callers
 * (worker-runner) omit it and get these English defaults. Each is a builder so
 * the path/char-count/command interpolate at the callsite's language.
 */
export interface ToolExecLabels {
  /** Summary shown before a deckent_write_file, e.g. "Write file: x.ts (12 chars)". */
  writeSummary: (path: string, chars: number) => string;
  /** Summary shown before a deckent_edit_file, e.g. "Edit file: x.ts". */
  editSummary: (path: string) => string;
  /** Summary shown before a deckent_bash, e.g. "Run command: npm test". */
  bashSummary: (cmd: string) => string;
}

export const DEFAULT_TOOL_EXEC_LABELS: ToolExecLabels = {
  writeSummary: (path, chars) => `Write file: ${path} (${chars} chars)`,
  editSummary: (path) => `Edit file: ${path}`,
  bashSummary: (cmd) => `Run command: ${cmd}`,
};

export interface ToolExecOptions {
  /** Tool'ların çözümleneceği kök dizin. Default `process.cwd()`. A function is
   * resolved per-dispatch so the REPL's /cd (process.chdir) is followed live. */
  cwd?: string | (() => string);
  /**
   * Yan-etkili tool'lar için onay kapısı (claude-code y/N hissi). `true` →
   * çalıştır, `false` → iptal. Default auto-approve (test/headless). REPL
   * gerçek interaktif onayı (agentic-confirm) buraya enjekte eder.
   */
  confirm?: (summary: string, toolName: string) => Promise<boolean>;
  /**
   * Localized confirm-prompt summaries (REPL-575 K5). Absent → English
   * DEFAULT_TOOL_EXEC_LABELS. Partial override is merged over the defaults.
   */
  labels?: Partial<ToolExecLabels>;
  /** bash için spawn enjeksiyonu (test hermetik). Default node:child_process.spawn. */
  bashRun?: (cmd: string, cwd: string) => Promise<string>;
  /**
   * deckent_bash kill-budget (ms) — yalnız `bashRun` enjekte EDİLMEDİĞİNDE
   * `defaultBashRun`'a geçirilir (enjekte edilen bir bashRun kendi timeout
   * politikasının sahibidir). Default DEFAULT_BASH_TIMEOUT_MS (5dk).
   */
  bashTimeoutMs?: number;
}

/** İnsan-okur özet — onay prompt'unda gösterilir. Label'lar caller'dan (i18n). */
function summarize(name: string, args: Record<string, unknown>, labels: ToolExecLabels): string {
  switch (name) {
    case 'deckent_write_file':
      return labels.writeSummary(String(args['path'] ?? '?'), String(args['content'] ?? '').length);
    case 'deckent_edit_file':
      return labels.editSummary(String(args['path'] ?? '?'));
    case 'deckent_bash':
      return labels.bashSummary(String(args['cmd'] ?? args['command'] ?? '?'));
    default:
      return name;
  }
}

/**
 * Safety-net budget: without this, a shell command that hangs (waits on
 * stdin, an infinite loop, a stuck network call — born-535) never fires
 * `close`/`error`, so the returned Promise never settles and the whole chat
 * turn freezes forever. 5min — long enough for a real build/test command,
 * still bounded. Overridable via ToolExecOptions.bashTimeoutMs /
 * DefaultBashRunOptions.timeoutMs.
 */
const DEFAULT_BASH_TIMEOUT_MS = 300_000;

/**
 * Resolve the shell binary + argv for running an arbitrary command string.
 * POSIX has `bash` on PATH by convention. Native Windows (no WSL, no
 * Git-Bash) does not — the previous hardcoded `spawn('bash', …)` failed
 * ENOENT there (born-579 cluster). PowerShell ships on every supported
 * Windows version and, via its Unix-alias cmdlets (ls/cat/pwd/rm/cp/mv/…),
 * tolerates POSIX-shaped commands far better than cmd.exe — it is already
 * deckent's Windows shell of record (same `powershell.exe -NoProfile
 * -Command` invocation as daemon-hygiene.ts / screenshot.ts).
 */
export function resolveBashInvocation(
  cmd: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } {
  if (platform === 'win32') {
    return { command: 'powershell.exe', args: ['-NoProfile', '-Command', cmd] };
  }
  return { command: 'bash', args: ['-lc', cmd] };
}

export interface DefaultBashRunOptions {
  /** Kill budget in ms before a hanging spawn is force-killed. Default DEFAULT_BASH_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Host platform override (test seam). Defaults to process.platform. */
  platform?: NodeJS.Platform;
}

/**
 * POSIX: signal the WHOLE process group, not just the immediate `bash` pid —
 * a hanging pipeline (`sleep 999 | cat`) forks children under that group that
 * a single-pid kill would orphan (mirrors subprocess.ts's PGID-TEARDOWN,
 * ADR-G-013). win32 has no group-signal semantics for process.kill, so it
 * always falls through to the plain child kill.
 */
function killBashGroup(child: ReturnType<typeof spawn>, platform: NodeJS.Platform): void {
  const pid = child.pid;
  if (platform !== 'win32' && typeof pid === 'number') {
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch {
      // Group already gone / pid not a group leader — fall back below.
    }
  }
  try { child.kill('SIGKILL'); } catch { /* already exited */ }
}

export function defaultBashRun(cmd: string, cwd: string, runOpts: DefaultBashRunOptions = {}): Promise<string> {
  const platform = runOpts.platform ?? process.platform;
  const timeoutMs = runOpts.timeoutMs ?? DEFAULT_BASH_TIMEOUT_MS;
  const { command, args } = resolveBashInvocation(cmd, platform);
  return new Promise<string>((resolveOut) => {
    // detached:true on POSIX makes this process the leader of a brand-new
    // process group so killBashGroup can reach every child it forks; win32
    // never sets detached (see killBashGroup / subprocess.ts precedent).
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: platform !== 'win32',
    });
    let out = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killBashGroup(child, platform);
      resolveOut(out.trim() + `\n[mcp-error] deckent_bash: timed out after ${Math.round(timeoutMs / 1000)}s`);
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (c: string) => { out += c; });
    child.stderr?.on('data', (c: string) => { out += c; });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveOut(out.trim() + (code === 0 ? '' : `\n[exit ${code}]`));
    });
    child.once('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveOut(`[mcp-error] deckent_bash: ${e.message}`);
    });
  });
}

/**
 * Count literal, non-overlapping occurrences of `needle` in `haystack`
 * (born-537: `old_string` may contain regex metacharacters that must be
 * matched literally, so this walks via `indexOf` rather than a RegExp).
 */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  for (;;) {
    idx = haystack.indexOf(needle, idx);
    if (idx === -1) break;
    count++;
    idx += needle.length;
  }
  return count;
}

/** Symlink-chain resolution guard against cycles (A -> B -> A). */
const MAX_SYMLINK_DEPTH = 40;

/**
 * `fs.realpathSync` refuses a path whose final target does not exist yet
 * (ENOENT) — useless for `deckent_write_file` (creating a brand-new file)
 * AND for detecting a broken symlink that points outside scope (born-536:
 * a symlink escape does not require the escape target to exist). This walks
 * the path root-to-leaf, resolving any symlink found at each accumulated
 * prefix via `readlinkSync` (not `realpathSync`), so segments that don't
 * exist yet are kept literal while every symlink actually on disk — broken
 * or not, file or directory — is followed to its real target.
 */
export function resolveRealPathLenient(absPath: string): string {
  const root = parse(absPath).root;
  const parts = absPath.slice(root.length).split(sep).filter((s) => s.length > 0);
  let resolved = root;
  let depth = 0;
  for (const part of parts) {
    resolved = resolved === root ? root + part : resolved + sep + part;
    for (;;) {
      let st;
      try {
        st = lstatSync(resolved);
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? (err as NodeJS.ErrnoException).code : undefined;
        // ENOENT/ENOTDIR — segment doesn't exist yet (e.g. a new file being
        // created): nothing to resolve, keep literal, same as before. Any
        // OTHER fs error (EACCES, ENAMETOOLONG, ...) is a genuine
        // path-resolution failure, not a "doesn't exist yet" — born-623:
        // surface it as DECKENT_E075, never silently swallowed.
        if (code === 'ENOENT' || code === 'ENOTDIR') break;
        throw new DeckentError('DECKENT_E075', `path resolution failed at "${resolved}"${code ? `: ${code}` : ''}`);
      }
      if (!st.isSymbolicLink()) break;
      // born-623: an ELOOP symlink-cycle is a filesystem path-resolution
      // failure, not a scope violation — DECKENT_E075, not DECKENT_E005
      // (397-007 conflated the two, misdiagnosing operators toward "scope
      // exceeded" when the real problem was a broken/cyclic symlink).
      if (++depth > MAX_SYMLINK_DEPTH) throw new DeckentError('DECKENT_E075', 'ELOOP: too many symlink levels');
      const target = readlinkSync(resolved);
      resolved = isAbsolute(target) ? target : resolve(dirname(resolved), target);
    }
  }
  return resolved;
}

/**
 * deckent'in aksiyon tool dispatcher'ını oluştur. Tool'lar:
 *   • deckent_read_file  {path}            → dosya içeriği (onaysız)
 *   • deckent_write_file {path, content}   → dosya yaz (onaylı)
 *   • deckent_edit_file  {path, old, new}  → metin değiştir (onaylı)
 *   • deckent_bash       {cmd}             → komut çalıştır (onaylı)
 */
export function createToolExecDispatcher(opts: ToolExecOptions = {}): McpToolDispatcher {
  const resolveCwd = (): string => (typeof opts.cwd === 'function' ? opts.cwd() : (opts.cwd ?? process.cwd()));
  const confirm = opts.confirm ?? (async () => true);
  const labels: ToolExecLabels = { ...DEFAULT_TOOL_EXEC_LABELS, ...opts.labels };
  const bashRun = opts.bashRun ?? ((cmd: string, cwd: string) => defaultBashRun(cmd, cwd, { timeoutMs: opts.bashTimeoutMs }));

  // cwd dışına çıkışı engelle (path traversal). Geçerli mutlak yolu döner;
  // boş/geçersiz girdide null; gerçek scope-ihlalinde DECKENT_E005, path
  // fs-çözüm hatasında (symlink döngüsü vb.) DECKENT_E075 fırlatır — ikisi
  // dispatch()'in dış catch'inde ayrı kodlarla yakalanır (born-623).
  const inScope = (p: string): string | null => {
    if (typeof p !== 'string' || p.length === 0) return null;
    const cwd = resolveCwd();
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    const rel = relative(cwd, abs);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      // rel === '' → cwd'nin kendisi (dosya değil); '..' → dışarı. Both are
      // a genuine out-of-scope target — DECKENT_E005.
      throw new DeckentError('DECKENT_E005', `path escapes scope: ${p}`);
    }
    // Symlink-escape guard (born-536): the textual check above only proves
    // the REQUESTED path spells out somewhere under cwd — a symlink placed
    // inside cwd (file or directory, even a broken one) can still point its
    // real target outside cwd, and writeFileSync/readFileSync follow that
    // symlink at the OS level. Resolve both sides through the same
    // symlink-aware resolver and compare the REAL paths too.
    //
    // born-623: resolveRealPathLenient throws DECKENT_E075 for a genuine
    // fs-resolution failure (symlink cycle, EACCES, ENAMETOOLONG, ...) — let
    // that propagate as-is, it is NOT a scope violation and must not be
    // relabeled as one. Only a path that resolves successfully to somewhere
    // outside cwd is a real DECKENT_E005 scope violation.
    const realCwd = resolveRealPathLenient(cwd);
    const realAbs = resolveRealPathLenient(abs);
    const realRel = relative(realCwd, realAbs);
    if (realRel === '' || realRel.startsWith('..') || isAbsolute(realRel)) {
      throw new DeckentError('DECKENT_E005', `path escapes scope via symlink: ${p}`);
    }
    return abs;
  };

  return {
    async dispatch(name, args) {
      try {
        if (SIDE_EFFECTING.has(name)) {
          const approved = await confirm(summarize(name, args, labels), name);
          // Distinct machine-marker for denial — MUST differ from the success
          // returns ("[deckent] yazıldı/düzenlendi"), otherwise the REPL cannot
          // tell a blocked write from a completed one (REPL-TOOL-DEBT-2). The UI
          // localizes the user-facing "cancelled" text; this prefix is internal.
          if (!approved) return `[deckent-denied] ${name}`;
        }

        // NOTE (REPL-575 K5): the `[mcp-error]`/`[deckent]` results below are
        // PROTOCOL strings fed back to the model as tool_result (and matched by
        // the `[mcp-error]`/`[deckent-denied]` markers in native-tool-registry.ts
        // / run.tsx — the marker is the contract, the detail is diagnostic).
        // They are English-canonical, not a localization surface — the previous
        // Turkish detail was a hardcoded-TR violation that showed Turkish to an
        // English user. Only the user-facing confirm summary above is localized
        // (via injected labels).
        switch (name) {
          case 'deckent_read_file': {
            const abs = inScope(String(args['path'] ?? ''));
            if (!abs) return `[mcp-error] deckent_read_file: path out of scope or invalid`;
            if (!existsSync(abs)) return `[mcp-error] deckent_read_file: file not found: ${args['path']}`;
            return readFileSync(abs, 'utf-8');
          }
          case 'deckent_write_file': {
            const abs = inScope(String(args['path'] ?? ''));
            if (!abs) return `[mcp-error] deckent_write_file: path out of scope or invalid`;
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, String(args['content'] ?? ''), 'utf-8');
            return `[deckent] wrote: ${args['path']}`;
          }
          case 'deckent_edit_file': {
            const abs = inScope(String(args['path'] ?? ''));
            if (!abs) return `[mcp-error] deckent_edit_file: path out of scope or invalid`;
            if (!existsSync(abs)) return `[mcp-error] deckent_edit_file: file not found: ${args['path']}`;
            const before = readFileSync(abs, 'utf-8');
            const oldStr = String(args['old'] ?? '');
            const newStr = String(args['new'] ?? '');
            if (oldStr.length === 0) return `[mcp-error] deckent_edit_file: old must not be empty`;
            const occurrences = countOccurrences(before, oldStr);
            if (occurrences === 0) return `[mcp-error] deckent_edit_file: no match`;
            const replaceAll = args['replaceAll'] === true || args['replace_all'] === true;
            if (occurrences > 1 && !replaceAll) {
              return `[mcp-error] deckent_edit_file: old matches multiple locations (${occurrences}) — narrow old to a unique match or pass replaceAll:true`;
            }
            const after = replaceAll ? before.split(oldStr).join(newStr) : before.replace(oldStr, newStr);
            writeFileSync(abs, after, 'utf-8');
            return `[deckent] edited: ${args['path']}`;
          }
          case 'deckent_bash': {
            const cmd = String(args['cmd'] ?? args['command'] ?? '');
            if (cmd.length === 0) return `[mcp-error] deckent_bash: empty command`;
            return await bashRun(cmd, resolveCwd());
          }
          default:
            return `[mcp-error] unknown tool: ${name}`;
        }
      } catch (err) {
        // born-623: surface the DeckentError code (E005 scope-violation vs.
        // E075 path-resolution-failure) so callers can tell "operator
        // exceeded scope" apart from "filesystem couldn't resolve the path"
        // instead of both collapsing into one indistinguishable message.
        if (err instanceof DeckentError) {
          return `[mcp-error] ${name}: [${err.code}] ${err.message}`;
        }
        const msg = err instanceof Error ? err.message : String(err);
        return `[mcp-error] ${name}: ${msg}`;
      }
    },
  };
}
