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

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import type { McpToolDispatcher } from './chat-native.js';

/** Yan-etkili (onay gerektiren) tool adları. read salt-okunur → onaysız. */
const SIDE_EFFECTING: ReadonlySet<string> = new Set([
  'deckent_write_file',
  'deckent_edit_file',
  'deckent_bash',
]);

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
  /** bash için spawn enjeksiyonu (test hermetik). Default node:child_process.spawn. */
  bashRun?: (cmd: string, cwd: string) => Promise<string>;
}

/** İnsan-okur özet — onay prompt'unda gösterilir. */
function summarize(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'deckent_write_file':
      return `Dosya yaz: ${String(args['path'] ?? '?')} (${String(args['content'] ?? '').length} karakter)`;
    case 'deckent_edit_file':
      return `Dosya düzenle: ${String(args['path'] ?? '?')}`;
    case 'deckent_bash':
      return `Komut çalıştır: ${String(args['cmd'] ?? args['command'] ?? '?')}`;
    default:
      return name;
  }
}

function defaultBashRun(cmd: string, cwd: string): Promise<string> {
  return new Promise<string>((resolveOut) => {
    const child = spawn('bash', ['-lc', cmd], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (c: string) => { out += c; });
    child.stderr?.on('data', (c: string) => { out += c; });
    child.once('close', (code) => resolveOut(out.trim() + (code === 0 ? '' : `\n[exit ${code}]`)));
    child.once('error', (e) => resolveOut(`[mcp-error] deckent_bash: ${e.message}`));
  });
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
  const bashRun = opts.bashRun ?? defaultBashRun;

  // cwd dışına çıkışı engelle (path traversal). Geçerli mutlak yolu döner ya da null.
  const inScope = (p: string): string | null => {
    if (typeof p !== 'string' || p.length === 0) return null;
    const cwd = resolveCwd();
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    const rel = relative(cwd, abs);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      // rel === '' → cwd'nin kendisi (dosya değil); '..' → dışarı.
      return rel === '' ? null : null;
    }
    return abs;
  };

  return {
    async dispatch(name, args) {
      try {
        if (SIDE_EFFECTING.has(name)) {
          const approved = await confirm(summarize(name, args), name);
          if (!approved) return `[deckent] iptal edildi: ${name}`;
        }

        switch (name) {
          case 'deckent_read_file': {
            const abs = inScope(String(args['path'] ?? ''));
            if (!abs) return `[mcp-error] deckent_read_file: yol scope dışı veya geçersiz`;
            if (!existsSync(abs)) return `[mcp-error] deckent_read_file: dosya yok: ${args['path']}`;
            return readFileSync(abs, 'utf-8');
          }
          case 'deckent_write_file': {
            const abs = inScope(String(args['path'] ?? ''));
            if (!abs) return `[mcp-error] deckent_write_file: yol scope dışı veya geçersiz`;
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, String(args['content'] ?? ''), 'utf-8');
            return `[deckent] yazıldı: ${args['path']}`;
          }
          case 'deckent_edit_file': {
            const abs = inScope(String(args['path'] ?? ''));
            if (!abs) return `[mcp-error] deckent_edit_file: yol scope dışı veya geçersiz`;
            if (!existsSync(abs)) return `[mcp-error] deckent_edit_file: dosya yok: ${args['path']}`;
            const before = readFileSync(abs, 'utf-8');
            const oldStr = String(args['old'] ?? '');
            const newStr = String(args['new'] ?? '');
            if (!before.includes(oldStr)) return `[mcp-error] deckent_edit_file: eşleşme yok`;
            writeFileSync(abs, before.replace(oldStr, newStr), 'utf-8');
            return `[deckent] düzenlendi: ${args['path']}`;
          }
          case 'deckent_bash': {
            const cmd = String(args['cmd'] ?? args['command'] ?? '');
            if (cmd.length === 0) return `[mcp-error] deckent_bash: boş komut`;
            return await bashRun(cmd, resolveCwd());
          }
          default:
            return `[mcp-error] unknown tool: ${name}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return `[mcp-error] ${name}: ${msg}`;
      }
    },
  };
}
