/**
 * Deckent Kraken mascot ASCII art (raw, no colors).
 */
export const KRAKEN_ASCII = `        ▄████▄
       ████████
        ██████
      ▐▌▐▌▐▌▐▌▐▌
     ▐▌▐▌ ▐▌ ▐▌▐▌
    ▐▌ ▐▌ ▐▌ ▐▌ ▐▌
    ▀  ▀  ▀  ▀  ▀`;

import { suppressionTier } from './theme.js';

const TEAL_TRUECOLOR = '\x1b[38;2;77;184;164m';
const BOLD_GOLD_TRUECOLOR = '\x1b[1;38;2;196;168;85m';
const TEAL_16 = '\x1b[36m';
const BOLD_GOLD_16 = '\x1b[1;33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Render colored splash screen with Kraken, title, version, and tagline.
 * Renk-kapısı SSOT'u theme.ts'tir (DESIGN-SYSTEM-001 slice-2): NO_COLOR artık
 * spec-uyumlu (boş string dahil VARLIĞI bastırır — eski lokal kontrol
 * `NO_COLOR=""` iken renk basıyordu, düzeltildi) ve kademe-dürüst degrade
 * yapılır: truecolor yalnız kapı izin verirse; aksi halde 16-renk (cyan/gold),
 * `none` kademesinde düz metin.
 */
export function showSplash(version: string): string {
  const tier = suppressionTier();

  if (tier === 'none') {
    return [
      KRAKEN_ASCII,
      '',
      `  DECKENT  v${version}`,
      '  AI Agent Orchestrator',
    ].join('\n');
  }

  const TEAL = tier === 'truecolor' ? TEAL_TRUECOLOR : TEAL_16;
  const BOLD_GOLD = tier === 'truecolor' ? BOLD_GOLD_TRUECOLOR : BOLD_GOLD_16;
  const coloredKraken = KRAKEN_ASCII.split('\n')
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
): string | null {
  if (!config.output_splash) {
    return null;
  }
  return showSplash(version);
}
