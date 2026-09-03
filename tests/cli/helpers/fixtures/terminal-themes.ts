// tests/cli/helpers/fixtures/terminal-themes.ts
// ═══ TERMINAL-READABILITY-001 — IDE / terminal theme palettes (contrast gate fixtures) ═══
//
// Each fixture is the ANSI-16 palette + default foreground/background a real
// terminal host applies to SGR 30-37 / 90-97 and to un-colored text. The gate
// (terminal-readability-gate.test.ts) renders every palette role through every
// fixture and measures WCAG 2.2 contrast — so "readable in the user's own
// theme" is a computed fact, not a claim.
//
// Sources (2026-09-03):
//   vscode-*   src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts
//              (ansi defaults per theme kind) + theme-defaults/themes/{dark,light}_modern.json
//              (panel.background is the terminal background when terminal.background is unset;
//              terminal.foreground override). VS Code and Cursor share xterm.js and apply
//              `terminal.integrated.minimumContrastRatio` (default 4.5) to foreground text —
//              modeled by `minimumContrastRatio` below (dimmed text gets half: not used, dim is banned).
//   cursor-*   Cursor is a VS Code fork on the same engine and registry defaults; its own
//              default theme file is not published, so the VS Code registry values stand in.
//              A real Cursor PTY proof is the owner-side evidence for Cursor specifically.
//   jetbrains-* platform/platform-resources/src/DefaultColorSchemesManager.xml
//              (CONSOLE_*_OUTPUT of the "Default" and "Darcula" schemes). JediTerm maps
//              ANSI white → CONSOLE_GRAY_OUTPUT and bright black → CONSOLE_DARKGRAY_OUTPUT.
//   windows-terminal-campbell  learn.microsoft.com/windows/terminal/customize-settings/color-schemes
//   macos-terminal-basic  Apple Terminal "Basic" profile ANSI values as published in the
//              common scheme ports (Apple ships them inside a binary plist); marked
//              `upstreamVerified: false` so a reader knows this row is a port, not a fetch.

export type AnsiSlot =
  | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'
  | 'brightBlack' | 'brightRed' | 'brightGreen' | 'brightYellow' | 'brightBlue' | 'brightMagenta' | 'brightCyan' | 'brightWhite';

export interface TerminalThemeFixture {
  id: string;
  host: string;
  kind: 'dark' | 'light';
  background: string;
  foreground: string;
  ansi: Record<AnsiSlot, string>;
  /** Host-side automatic foreground adjustment (xterm.js `minimumContrastRatio`). */
  minimumContrastRatio?: number;
  upstreamVerified: boolean;
}

const VSCODE_DARK_ANSI: Record<AnsiSlot, string> = {
  black: '#000000', red: '#cd3131', green: '#0DBC79', yellow: '#e5e510',
  blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
  brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
  brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5',
};

const VSCODE_LIGHT_ANSI: Record<AnsiSlot, string> = {
  black: '#000000', red: '#cd3131', green: '#107C10', yellow: '#949800',
  blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
  brightBlack: '#666666', brightRed: '#cd3131', brightGreen: '#14CE14', brightYellow: '#b5ba00',
  brightBlue: '#0451a5', brightMagenta: '#bc05bc', brightCyan: '#0598bc', brightWhite: '#a5a5a5',
};

export const TERMINAL_THEME_FIXTURES: readonly TerminalThemeFixture[] = [
  {
    id: 'vscode-dark-modern', host: 'VS Code (xterm.js)', kind: 'dark',
    background: '#181818', foreground: '#CCCCCC', ansi: VSCODE_DARK_ANSI,
    minimumContrastRatio: 4.5, upstreamVerified: true,
  },
  {
    id: 'vscode-light-modern', host: 'VS Code (xterm.js)', kind: 'light',
    background: '#F8F8F8', foreground: '#3B3B3B', ansi: VSCODE_LIGHT_ANSI,
    minimumContrastRatio: 4.5, upstreamVerified: true,
  },
  {
    id: 'cursor-dark', host: 'Cursor (xterm.js, VS Code registry defaults)', kind: 'dark',
    background: '#181818', foreground: '#CCCCCC', ansi: VSCODE_DARK_ANSI,
    minimumContrastRatio: 4.5, upstreamVerified: false,
  },
  {
    id: 'cursor-light', host: 'Cursor (xterm.js, VS Code registry defaults)', kind: 'light',
    background: '#F8F8F8', foreground: '#3B3B3B', ansi: VSCODE_LIGHT_ANSI,
    minimumContrastRatio: 4.5, upstreamVerified: false,
  },
  {
    id: 'jetbrains-darcula', host: 'JetBrains IDE terminal (JediTerm)', kind: 'dark',
    background: '#2B2B2B', foreground: '#BBBBBB',
    ansi: {
      black: '#000000', red: '#F0524F', green: '#5C962C', yellow: '#A68A0D',
      blue: '#3993D4', magenta: '#A771BF', cyan: '#00A3A3', white: '#808080',
      brightBlack: '#595959', brightRed: '#FF4050', brightGreen: '#4FC414', brightYellow: '#E5BF00',
      brightBlue: '#1FB0FF', brightMagenta: '#ED7EED', brightCyan: '#00E5E5', brightWhite: '#FFFFFF',
    },
    upstreamVerified: true,
  },
  {
    id: 'jetbrains-light', host: 'JetBrains IDE terminal (JediTerm)', kind: 'light',
    background: '#FFFFFF', foreground: '#000000',
    ansi: {
      black: '#000000', red: '#CE0505', green: '#067D17', yellow: '#B28C00',
      blue: '#063FDB', magenta: '#B309B3', cyan: '#028E8E', white: '#929292',
      brightBlack: '#656565', brightRed: '#FF1616', brightGreen: '#16B42C', brightYellow: '#ECC32C',
      brightBlue: '#2D61F0', brightMagenta: '#E617E6', brightCyan: '#15C1C1', brightWhite: '#C9C9C9',
    },
    upstreamVerified: true,
  },
  {
    id: 'windows-terminal-campbell', host: 'Windows Terminal', kind: 'dark',
    background: '#0C0C0C', foreground: '#CCCCCC',
    ansi: {
      black: '#0C0C0C', red: '#C50F1F', green: '#13A10E', yellow: '#C19C00',
      blue: '#0037DA', magenta: '#881798', cyan: '#3A96DD', white: '#CCCCCC',
      brightBlack: '#767676', brightRed: '#E74856', brightGreen: '#16C60C', brightYellow: '#F9F1A5',
      brightBlue: '#3B78FF', brightMagenta: '#B4009E', brightCyan: '#61D6D6', brightWhite: '#F2F2F2',
    },
    upstreamVerified: true,
  },
  {
    id: 'macos-terminal-basic', host: 'macOS Terminal.app', kind: 'light',
    background: '#FFFFFF', foreground: '#000000',
    ansi: {
      black: '#000000', red: '#990000', green: '#00A600', yellow: '#999900',
      blue: '#0000B2', magenta: '#B200B2', cyan: '#00A6B2', white: '#BFBFBF',
      brightBlack: '#666666', brightRed: '#E50000', brightGreen: '#00D900', brightYellow: '#E5E500',
      brightBlue: '#0000FF', brightMagenta: '#E500E5', brightCyan: '#00E5E5', brightWhite: '#E5E5E5',
    },
    upstreamVerified: false,
  },
];

const SLOT_BY_SGR: Record<string, AnsiSlot> = {
  '30': 'black', '31': 'red', '32': 'green', '33': 'yellow', '34': 'blue', '35': 'magenta', '36': 'cyan', '37': 'white',
  '90': 'brightBlack', '91': 'brightRed', '92': 'brightGreen', '93': 'brightYellow', '94': 'brightBlue', '95': 'brightMagenta', '96': 'brightCyan', '97': 'brightWhite',
};

/** The foreground hex a host paints for an SGR 16-color parameter ('' = default foreground). */
export function ansi16Foreground(sgr: string, theme: TerminalThemeFixture): string {
  if (sgr === '') return theme.foreground;
  const slot = SLOT_BY_SGR[sgr];
  if (slot === undefined) throw new Error(`not a 16-color SGR parameter: ${sgr}`);
  return theme.ansi[slot];
}

const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

/** The RGB hex of an xterm-256 index (0-15 resolve through the host palette). */
export function ansi256Foreground(index: number, theme: TerminalThemeFixture): string {
  if (index < 16) {
    const slots = Object.keys(theme.ansi) as AnsiSlot[];
    return theme.ansi[slots[index] as AnsiSlot];
  }
  if (index >= 232) {
    const v = 8 + 10 * (index - 232);
    return rgbHex(v, v, v);
  }
  const i = index - 16;
  return rgbHex(CUBE_LEVELS[Math.floor(i / 36)] as number, CUBE_LEVELS[Math.floor(i / 6) % 6] as number, CUBE_LEVELS[i % 6] as number);
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
