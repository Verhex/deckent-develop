// Closed, environment-free glyph contract for Deckent-owned Terminal chrome.
// Raw user/provider content is never passed through this resolver.

export type TerminalBorderStyle = 'round' | 'classic';

export interface TerminalGlyphs {
  readonly ascii: boolean;
  readonly borderStyle: TerminalBorderStyle;
  readonly assistant: string;
  readonly user: string;
  readonly success: string;
  readonly failure: string;
  readonly warning: string;
  readonly verdictSuccess: string;
  readonly verdictFailure: string;
  readonly rejection: string;
  readonly branch: string;
  readonly background: string;
  readonly elapsed: string;
  readonly tokens: string;
  readonly separator: string;
  readonly ellipsis: string;
  readonly queue: string;
  readonly cursor: string;
  readonly up: string;
  readonly down: string;
  readonly reveal: string;
  readonly on: string;
  readonly off: string;
  readonly bullet: string;
  readonly horizontal: string;
  readonly dash: string;
}

const UNICODE_TERMINAL_GLYPHS: TerminalGlyphs = Object.freeze({
  ascii: false,
  borderStyle: 'round',
  assistant: '●',
  user: '›',
  success: '✓',
  failure: '✗',
  warning: '⚠',
  verdictSuccess: '✅',
  verdictFailure: '❌',
  rejection: '✖',
  branch: '⎿',
  background: '»',
  elapsed: '⏱',
  tokens: 'Σ',
  separator: '·',
  ellipsis: '…',
  queue: '⋯',
  cursor: '❯',
  up: '↑',
  down: '↓',
  reveal: '↳',
  on: '◉',
  off: '○',
  bullet: '•',
  horizontal: '─',
  dash: '—',
});

const ASCII_TERMINAL_GLYPHS: TerminalGlyphs = Object.freeze({
  ascii: true,
  borderStyle: 'classic',
  assistant: '*',
  user: '>',
  success: '+',
  failure: 'x',
  warning: '!',
  verdictSuccess: '+',
  verdictFailure: 'x',
  rejection: 'x',
  branch: '->',
  background: '>>',
  elapsed: '@',
  tokens: '#',
  separator: '|',
  ellipsis: '...',
  queue: '...',
  cursor: '>',
  up: '^',
  down: 'v',
  reveal: '->',
  on: '(x)',
  off: '( )',
  bullet: '-',
  horizontal: '-',
  dash: '-',
});

export function resolveTerminalGlyphs(ascii: boolean): TerminalGlyphs {
  return ascii ? ASCII_TERMINAL_GLYPHS : UNICODE_TERMINAL_GLYPHS;
}

/**
 * Select ASCII punctuation in a known, caller-owned catalog template before
 * any user/provider/identifier value is interpolated into it.
 */
export function renderTerminalOwnedTemplate(template: string, glyphs: TerminalGlyphs): string {
  if (!glyphs.ascii) return template;
  return template
    .replaceAll('✅', glyphs.verdictSuccess)
    .replaceAll('❌', glyphs.verdictFailure)
    .replaceAll('↑', glyphs.up)
    .replaceAll('↓', glyphs.down)
    .replaceAll('❯', glyphs.cursor)
    .replaceAll('↳', glyphs.reveal)
    .replaceAll('◉', glyphs.on)
    .replaceAll('○', glyphs.off)
    .replaceAll('✓', glyphs.success)
    .replaceAll('✗', glyphs.failure)
    .replaceAll('✖', glyphs.rejection)
    .replaceAll('⚠', glyphs.warning)
    .replaceAll('●', glyphs.assistant)
    .replaceAll('›', glyphs.user)
    .replaceAll('⎿', glyphs.branch)
    .replaceAll('»', glyphs.background)
    .replaceAll('⏱', glyphs.elapsed)
    .replaceAll('Σ', glyphs.tokens)
    .replaceAll('⋯', glyphs.queue)
    .replaceAll('…', glyphs.ellipsis)
    .replaceAll('•', glyphs.bullet)
    .replaceAll('·', glyphs.separator)
    .replaceAll('—', glyphs.dash);
}
