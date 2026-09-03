// ─── CLI Color Gate (SSOT) + Palette-backed Theme ───────────────────
// DESIGN-SYSTEM-001 slice-2 (2026-07-31): tek renk-kapısı + kademe (tier)
// çözümü + design/tokens'tan üretilen palet rollerinin tüketimi.
//
// Karar (Alperen, işlevsellik-önce): 16-renk bugünkü davranış BİREBİR korunur;
// truecolor/256 yalnız zemin güvenle koyu bilindiğinde (COLORFGBG) ya da
// kullanıcı FORCE_COLOR=2/3 ile açıkça istediğinde. Palet hex'leri koyu-zemin
// optimize olduğundan bilinmeyen/açık zeminde 16-renge düşülür — terminalin
// kendi şeması okunabilirliği garantiler (a11y denetimi 2026-07-31).
//
// Öncelik zinciri: --no-color (flag/argv) > FORCE_COLOR > NO_COLOR > TTY.
// NO_COLOR spec (no-color.org): değeri ne olursa olsun VARLIĞI yeterlidir
// (boş string dahil). FORCE_COLOR, NO_COLOR'ı ezer (Node ekosistem teamülü).

import { PALETTE, type PaletteRole } from './generated/palette.js';

export type ColorTier = 'none' | 'ansi16' | 'ansi256' | 'truecolor';

// ─── Gate ───────────────────────────────────────────────────────────

/**
 * Kullanıcı rengi açıkça bastırdı mı? (TTY'ye BAKMAZ — mevcut `isNoColor`
 * çağıranlarının pipe-davranışını korur; output.ts buna delege eder.)
 */
export function isColorSuppressed(noColorFlag?: boolean): boolean {
  if (noColorFlag === true || process.argv.includes('--no-color')) return true;
  const force = process.env['FORCE_COLOR'];
  if (force !== undefined) return force === '0';
  return process.env['NO_COLOR'] !== undefined;
}

/**
 * TERMINAL-TOOLS-003 — `TERM=dumb` bir YETENEK sinyalidir (kullanıcı
 * bastırması değil): terminal SGR'yi de imleç kontrolünü de işleyemez.
 * FORCE_COLOR açıkça verilmişse (>0) kullanıcı isteği kazanır — supports-color
 * ekosistem teamülüyle aynı. Yüzey admission'ı da aynı tanımı kullanır
 * (helpers/terminal-surface.ts resolveTerminalSurface).
 */
export function isDumbTerminal(term: string | undefined = process.env['TERM']): boolean {
  return (term ?? '').trim().toLowerCase() === 'dumb';
}

/**
 * Renk basılmalı mı? Bastırma zinciri + dumb-terminal yeteneği + TTY varsayılanı.
 */
export function shouldUseColor(noColorFlag?: boolean): boolean {
  if (isColorSuppressed(noColorFlag)) return false;
  if (process.env['FORCE_COLOR'] !== undefined) return true; // '0' üstte elendi
  if (isDumbTerminal()) return false;
  return process.stdout.isTTY === true;
}

/** COLORFGBG (örn. "15;0") son alanı 0-6|8 → koyu zemin GÜVENLE biliniyor. */
function darkBackgroundKnown(): boolean {
  const fgbg = process.env['COLORFGBG'];
  if (fgbg === undefined) return false;
  const bg = Number.parseInt(fgbg.split(';').pop() ?? '', 10);
  return Number.isInteger(bg) && (bg === 8 || (bg >= 0 && bg <= 6));
}

function resolveCapability(): ColorTier {
  const force = process.env['FORCE_COLOR'];
  if (force === '3') return 'truecolor';
  if (force === '2') return 'ansi256';
  const colorterm = (process.env['COLORTERM'] ?? '').toLowerCase();
  const capability: ColorTier =
    colorterm.includes('truecolor') || colorterm.includes('24bit')
      ? 'truecolor'
      : (process.env['TERM'] ?? '').includes('256')
        ? 'ansi256'
        : 'ansi16';
  if (capability === 'ansi16') return 'ansi16';
  return darkBackgroundKnown() ? capability : 'ansi16';
}

/**
 * Etkin renk kademesi (TTY-farkındalı — Theme bunun üstünde çalışır).
 * FORCE_COLOR=2/3 açık kullanıcı isteğidir ve zemin sezgisini ezer; onun
 * dışında truecolor/256 yeteneği ancak koyu-zemin biliniyorsa kullanılır
 * (işlevsellik-önce degrade).
 */
export function colorTier(noColorFlag?: boolean): ColorTier {
  if (!shouldUseColor(noColorFlag)) return 'none';
  return resolveCapability();
}

/**
 * Yalnız-bastırma kademesi (TTY şartı YOK): interaktif-TUI yardımcıları
 * (status-renderer/ansi, splash) tarihsel olarak TTY'siz ortamda da renk
 * basar — bu davranış korunur; kullanıcı bastırması (NO_COLOR/--no-color/
 * FORCE_COLOR=0) artık burada da geçerlidir (a11y 2026-07-31 kapanışı).
 */
export function suppressionTier(noColorFlag?: boolean): ColorTier {
  if (isColorSuppressed(noColorFlag)) return 'none';
  if (process.env['FORCE_COLOR'] === undefined && isDumbTerminal()) return 'none';
  return resolveCapability();
}

// ─── Palet → SGR ────────────────────────────────────────────────────

function hexChannels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * TERMINAL-READABILITY-001 — bir palet rolünün VERİLEN kademedeki SGR
 * parametre dizisi (öznitelikler + kademe rengi; hiçbiri yoksa null → düz
 * metin). ansi16'da host paleti boyar ('' = varsayılan ön-plan); truecolor/256
 * yalnız theme kapısı o kademeyi verdiğinde. Saf — kapıya bakmaz; kapıya
 * bağlı sürüm paletteSgr'dir.
 */
export function roleSgrAt(role: PaletteRole, tier: ColorTier): string | null {
  if (tier === 'none') return null;
  const entry = PALETTE[role];
  let color = entry.ansi16;
  if (tier === 'truecolor' && entry.hex !== null) {
    const [r, g, b] = hexChannels(entry.hex);
    color = `38;2;${r};${g};${b}`;
  } else if (tier === 'ansi256' && entry.ansi256 !== null) {
    color = `38;5;${entry.ansi256}`;
  }
  const params = [...entry.attrs, color].filter((p) => p.length > 0);
  return params.length === 0 ? null : params.join(';');
}

/**
 * Bir palet rolünün etkin kademedeki SGR parametresi (renk kapalıysa null).
 * ansi16 kademesinde üretilmiş paletin SGR kodu = host paletinin boyadığı renk.
 */
export function paletteSgr(role: PaletteRole, noColorFlag?: boolean): string | null {
  return roleSgrAt(role, colorTier(noColorFlag));
}

// ─── Theme class ────────────────────────────────────────────────────

function wrap(code: string | null, text: string): string {
  if (code === null || code.length === 0) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export class Theme {
  /** Green text (success, DONE, PASS). */
  success(text: string): string {
    return wrap(paletteSgr('success'), text);
  }

  /** Red text (error, NO_GO, FAIL). */
  error(text: string): string {
    return wrap(paletteSgr('error'), text);
  }

  /** Yellow text (warning, TECH_DEBT). */
  warning(text: string): string {
    return wrap(paletteSgr('warning'), text);
  }

  /** Blue text (info, hints). */
  info(text: string): string {
    return wrap(paletteSgr('info'), text);
  }

  /** Gray/dim text (muted, secondary info). */
  muted(text: string): string {
    return wrap(paletteSgr('muted'), text);
  }

  /** Decorative accent (frames, chevrons, bullets — never the only carrier). */
  accent(text: string): string {
    return wrap(paletteSgr('accent'), text);
  }

  /** Link text (underlined; readable on every host theme). */
  link(text: string): string {
    return wrap(paletteSgr('link'), text);
  }

  /** Code / identifier / path text (primary contrast class). */
  code(text: string): string {
    return wrap(paletteSgr('code'), text);
  }

  /** Focused / selected item (inverse — the host's own fg/bg pair, theme-agnostic). */
  focus(text: string): string {
    return wrap(paletteSgr('focus'), text);
  }

  /** Bold text (kademe-bağımsız; renk değil vurgu). */
  bold(text: string): string {
    return wrap(shouldUseColor() ? '1' : null, text);
  }

  /** Strip all ANSI escape codes from a string (compound SGR dahil). */
  strip(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

/** Singleton theme instance. */
export const theme = new Theme();
