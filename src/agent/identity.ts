// ═══ Identity — system-prompt composition (SP-1 §7) ═════════════════════════
// Layers: immutable safety/permission core (code, non-overridable) +
// editable persona (.deckent/soul.md or the bundled default) + project
// knowledge (DECKENT.md / IDENTITY.md if present). Model-agnostic + deterministic.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Non-negotiable core — no soul/knowledge file can weaken these (SP-1 §7). */
export const IMMUTABLE_CORE = [
  'GÜVENLİK SINIRI (değiştirilemez): güvenlik-önlemlerini atlatma YOK; model-determinizmi korunur.',
  'İZİN DİSİPLİNİ (değiştirilemez): her dosya/komut aksiyonu izin-kapısından geçer;',
  'always-floor (kill/cleanup/recover, rm -rf, force-push, secret yazımı) ASLA otomatik çalışmaz —',
  'full-auto modu bile bu tabanı geçemez.',
].join(' ');

/** English translation of {@link IMMUTABLE_CORE} — selected when `opts.lang === 'en'`
 *  (repl_surface i18n flip, Task 387-001). Default (no `lang`) stays the Turkish
 *  const above, unchanged, so pre-existing callers/tests are byte-identical. */
export const IMMUTABLE_CORE_EN = [
  'SAFETY BOUNDARY (immutable): no bypassing safety measures; model determinism is preserved.',
  'PERMISSION DISCIPLINE (immutable): every file/command action passes through the permission gate;',
  'the always-floor (kill/cleanup/recover, rm -rf, force-push, secret writes) NEVER runs automatically —',
  'not even full-auto mode can cross this floor.',
].join(' ');

function readIfExists(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : null;
  } catch {
    return null;
  }
}

/** Bundled default soul (next to this module under assets/). */
function defaultSoul(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readIfExists(join(here, 'assets', 'soul.default.md')) ?? 'Sen deckent: bağımsız bir AI agent\'sın.';
}

export interface ComposeOptions {
  cwd: string;
  lang?: 'en' | 'tr';
}

/**
 * Compose the full system prompt. Order: immutable core → persona (soul.md or
 * default) → project knowledge (DECKENT.md, IDENTITY.md). The immutable core is
 * always first and always present.
 */
export function composeSystemPrompt(opts: ComposeOptions): string {
  const isEnglish = opts.lang === 'en';
  const parts: string[] = [isEnglish ? IMMUTABLE_CORE_EN : IMMUTABLE_CORE];

  const soul = readIfExists(join(opts.cwd, '.deckent', 'soul.md')) ?? defaultSoul();
  parts.push(soul);

  const knowledge = [
    readIfExists(join(opts.cwd, 'DECKENT.md')),
    readIfExists(join(opts.cwd, '.deckent', 'workspace', 'IDENTITY.md')),
  ].filter((x): x is string => x !== null);
  if (knowledge.length > 0) {
    parts.push(isEnglish ? '--- PROJECT INFO ---' : '--- PROJE BİLGİSİ ---');
    parts.push(...knowledge);
  }

  return parts.join('\n\n');
}
