/**
 * Deckent Kraken mascot art — Unicode block (default) and printable ASCII fallback.
 * ADR-G-010: fixed brand consts; runtime variant selection is capability-gated only.
 */
export const KRAKEN_ASCII = `        ▄████▄
       ████████
        ██████
      ▐▌▐▌▐▌▐▌▐▌
     ▐▌▐▌ ▐▌ ▐▌▐▌
    ▐▌ ▐▌ ▐▌ ▐▌ ▐▌
    ▀  ▀  ▀  ▀  ▀`;

/** Printable ASCII Kraken — dumb terminal / non-UTF-8 locale / DECKENT_ASCII=1. */
export const KRAKEN_PRINTABLE_ASCII = `        .----.
       /######\\
        \\####/
      /|/|\\|/|\\
     / | | | | \\
    |  | | | |  |
    '  ' ' ' '  '`;

import { resolveTerminalAscii } from './terminal-capabilities.js';
import { suppressionTier } from './theme.js';

const TEAL_TRUECOLOR = '\x1b[38;2;77;184;164m';
const BOLD_GOLD_TRUECOLOR = '\x1b[1;38;2;196;168;85m';
const TEAL_16 = '\x1b[36m';
const BOLD_GOLD_16 = '\x1b[1;33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** Resolve the Kraken art string for the current or injected capability inputs. */
export function resolveKrakenArt(
  env: Record<string, string | undefined> = process.env,
  asciiOverride?: boolean,
): string {
  const ascii = asciiOverride === true || resolveTerminalAscii(env);
  return ascii ? KRAKEN_PRINTABLE_ASCII : KRAKEN_ASCII;
}

export interface SplashRenderOptions {
  /** True forces printable ASCII; false/default still respects capability constraints. */
  ascii?: boolean;
}

/**
 * Render colored splash screen with Kraken, title, version, and tagline.
 * Renk-kapısı SSOT'u theme.ts'tir (DESIGN-SYSTEM-001 slice-2): NO_COLOR artık
 * spec-uyumlu (boş string dahil VARLIĞI bastırır — eski lokal kontrol
 * `NO_COLOR=""` iken renk basıyordu, düzeltildi) ve kademe-dürüst degrade
 * yapılır: truecolor yalnız kapı izin verirse; aksi halde 16-renk (cyan/gold),
 * `none` kademesinde düz metin. Glyph tier NO_COLOR'dan bağımsızdır.
 */
export function showSplash(version: string, options?: SplashRenderOptions): string {
  const krakenArt = resolveKrakenArt(process.env, options?.ascii);
  const tier = suppressionTier();

  if (tier === 'none') {
    return [
      krakenArt,
      '',
      `  DECKENT  v${version}`,
      '  AI Agent Orchestrator',
    ].join('\n');
  }

  const TEAL = tier === 'truecolor' ? TEAL_TRUECOLOR : TEAL_16;
  const BOLD_GOLD = tier === 'truecolor' ? BOLD_GOLD_TRUECOLOR : BOLD_GOLD_16;
  const coloredKraken = krakenArt.split('\n')
    .map((line) => `${TEAL}${line}${RESET}`)
    .join('\n');

  return [
    coloredKraken,
    '',
    `  ${BOLD_GOLD}DECKENT${RESET}  ${DIM}v${version}${RESET}`,
    `  ${DIM}AI Agent Orchestrator${RESET}`,
  ].join('\n');
}

/**
 * Show splash only if config.output_splash is true.
 * Returns null if disabled.
 */
export function showSplashIfEnabled(
  config: { output_splash?: boolean },
  version: string,
  options?: SplashRenderOptions,
): string | null {
  if (!config.output_splash) {
    return null;
  }
  return showSplash(version, options);
}
