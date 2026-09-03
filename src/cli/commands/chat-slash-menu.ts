// ═══ chat-slash-menu — interaktif `/` komut menüsü (Sprint 224 T-224-020) ═══
//
// claude-code'taki gibi: kullanıcı `/` yazınca canlı bir komut menüsü açılır,
// yazdıkça filtrelenir, ↑/↓ ile gezilir, Enter/Tab seçer, Esc kapatır.
//
// Bu modül menünün **saf mantığını** sağlar (filtre + render + tuş-reducer) —
// %100 unit-testable, terminal/keypress'e bağımlı DEĞİL. entry.ts'teki ince
// keypress-wire (readline `keypress` event'i + bu reducer + renderSlashMenu)
// gerçek-TTY entegrasyonudur ve görsel-akış Alperen terminalinde doğrulanır.
// Saf çekirdek ayrı tutuldu ki mantık headless test edilsin, çalışan REPL'in
// line-editing'i riske girmesin.

import type { SlashCommand, SlashRegistry } from './chat-slash-registry.js';
import { roleSgrAt, suppressionTier } from '../helpers/theme.js';

// TERMINAL-READABILITY-001 — the selected row is the palette `focus` role
// (inverse: the host's own fg/bg pair, readable under any theme) plus bold;
// the other rows are plain default-foreground text (never dim — VS Code
// halves it, light themes lose it). Resolved per render through the color gate.
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
function focusSgr(): string {
  const params = roleSgrAt('focus', suppressionTier());
  return params === null ? '' : `\x1b[${params}m`;
}

/** Menü durumu — entry.ts keypress-wire bunu tutar, her tuşta reducer üretir. */
export interface SlashMenuState {
  /** Menü açık mı (input `/` ile başlıyor mu). */
  open: boolean;
  /** `/` sonrası yazılan filtre metni (örn. `/st` → 'st'). */
  query: string;
  /** Vurgulanan seçenek index'i (filtrelenmiş liste içinde). */
  selected: number;
}

export const CLOSED_MENU: SlashMenuState = Object.freeze({ open: false, query: '', selected: 0 });

/**
 * Girdi satırına göre eşleşen slash komutlarını döndür. `/` ile başlamıyorsa
 * boş (menü kapalı). `/quit` alias gizlenir. Prefix eşleşmesi (case-insensitive).
 */
export function filterSlashCommands(registry: SlashRegistry, line: string): SlashCommand[] {
  if (!line.startsWith('/')) return [];
  const q = line.toLowerCase();
  const all = registry.filter((c) => c.name !== '/quit');
  const hits = all.filter((c) => c.name.toLowerCase().startsWith(q));
  return hits.length > 0 ? hits : all; // eşleşme yoksa tüm listeyi göster (menü açık kalsın)
}

/**
 * Filtrelenmiş komut listesini, seçili olan vurgulu, çok-satırlı menü string'i
 * olarak render et. TTY → renkli; non-TTY → düz (test/pipe). Trailing newline yok.
 */
export function renderSlashMenu(matches: readonly SlashCommand[], selected: number, tty?: boolean): string {
  const isTty = tty !== undefined ? tty : process.stdout.isTTY === true;
  if (matches.length === 0) return '';
  const sel = ((selected % matches.length) + matches.length) % matches.length; // güvenli sarma
  const focus = isTty ? focusSgr() : '';
  const lines = matches.map((c, i) => {
    const marker = i === sel ? '❯' : ' ';
    const name = c.name.padEnd(10);
    if (!isTty) return `${marker} ${name} ${c.desc}`;
    return i === sel
      ? `${focus}${BOLD}${marker} ${name}${RESET} ${c.desc}`
      : `${marker} ${name} ${c.desc}`;
  });
  return lines.join('\n');
}

/**
 * entry.ts keypress-wire kararı (Sprint 224 T-224-020 — GÜVENLİ varyant).
 *
 * Gerçek-TTY canlı-filtreli popup, readline prompt'u üzerinde in-place cursor
 * yönetimi ister (alt-satırda scroll/glitch riski) — çalışan pinned-REPL'i
 * bozmamak için onun yerine: kullanıcı bir başına `/` yazınca komut menüsü
 * pinned prompt'un ÜSTÜNE **bir kez** yazılır (writeAbove — prompt altta sabit,
 * yazılan `/` korunur), sonra refine'i Tab-completer (224-017) yapar. Böylece
 * scrollback'e tekrar tekrar menü basılmaz (spam yok) ve cursor-takeover yok.
 *
 * @returns show: menüyü şimdi yaz · shownFor: yeni "en son gösterilen" işaret.
 */
export function slashMenuOnKeypress(
  line: string,
  shownFor: string | null,
): { show: boolean; shownFor: string | null } {
  if (line === '/' && shownFor !== '/') return { show: true, shownFor: '/' };
  if (!line.startsWith('/')) return { show: false, shownFor: null };
  return { show: false, shownFor };
}

/** Bir keypress'in menüye etkisi. */
export type SlashKey =
  | { type: 'char'; ch: string }
  | { type: 'backspace' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'select' }   // Enter / Tab
  | { type: 'escape' };

/** Reducer sonucu — yeni durum + (select ise) seçilen komut. */
export interface SlashMenuResult {
  state: SlashMenuState;
  /** 'select' tuşunda seçilen komut adı (örn. '/status'); aksi halde null. */
  chosen: string | null;
}

/**
 * Menü tuş-reducer'ı (saf). Girdi: mevcut state + registry + tuş. Çıktı: yeni
 * state + seçilen komut (varsa). entry.ts keypress-wire bunu çağırır, sonucu
 * renderSlashMenu ile basar. `/` char → menü açılır; backspace `/`'ı silince
 * kapanır; ↑/↓ seçim sarar; select → chosen; escape → kapanır.
 */
export function reduceSlashMenu(
  state: SlashMenuState,
  registry: SlashRegistry,
  key: SlashKey,
): SlashMenuResult {
  const line = '/' + state.query;
  const matches = filterSlashCommands(registry, line);

  switch (key.type) {
    case 'char': {
      const nextLine = (state.open ? line : '') + key.ch;
      if (!nextLine.startsWith('/')) return { state: CLOSED_MENU, chosen: null };
      return { state: { open: true, query: nextLine.slice(1), selected: 0 }, chosen: null };
    }
    case 'backspace': {
      if (!state.open) return { state, chosen: null };
      if (state.query.length === 0) return { state: CLOSED_MENU, chosen: null }; // `/` silindi → kapan
      return { state: { open: true, query: state.query.slice(0, -1), selected: 0 }, chosen: null };
    }
    case 'up':
      if (!state.open || matches.length === 0) return { state, chosen: null };
      return { state: { ...state, selected: (state.selected - 1 + matches.length) % matches.length }, chosen: null };
    case 'down':
      if (!state.open || matches.length === 0) return { state, chosen: null };
      return { state: { ...state, selected: (state.selected + 1) % matches.length }, chosen: null };
    case 'select': {
      if (!state.open || matches.length === 0) return { state: CLOSED_MENU, chosen: null };
      const sel = ((state.selected % matches.length) + matches.length) % matches.length;
      return { state: CLOSED_MENU, chosen: matches[sel]?.name ?? null };
    }
    case 'escape':
      return { state: CLOSED_MENU, chosen: null };
    default:
      return { state, chosen: null };
  }
}
