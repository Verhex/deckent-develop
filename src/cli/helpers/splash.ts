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

const TEAL = '\x1b[38;2;77;184;164m';
const BOLD_GOLD = '\x1b[1;38;2;196;168;85m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * Render colored splash screen with Kraken, title, version, and tagline.
 * Kraken body: teal \x1b[38;2;77;184;164m
 * DECKENT text: bold gold \x1b[1;38;2;196;168;85m
 * Version: dim \x1b[2m
 * Tagline: dim \x1b[2m "AI Agent Orchestrator"
 * Respects NO_COLOR env var — returns plain text when set.
 */
export function showSplash(version: string): string {
  const noColor = process.env.NO_COLOR != null && process.env.NO_COLOR !== '';

  if (noColor) {
    return [
      KRAKEN_ASCII,
      '',
      `  DECKENT  v${version}`,
      '  AI Agent Orchestrator',
    ].join('\n');
  }

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
