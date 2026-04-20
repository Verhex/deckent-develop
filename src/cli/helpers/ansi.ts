// ─── Native ANSI Escape Helpers ─────────────────────────────────────
// Zero external dependencies. Used by status-renderer.ts for TUI output.
// Sprint 145 — Task 145-012

const ESC = '\x1b';

export const cursorTo = (col: number, row: number): string =>
  `${ESC}[${row + 1};${col + 1}H`;

export const clearLine = (): string => `${ESC}[2K`;

export const clearScreen = (): string => `${ESC}[2J${ESC}[H`;

export const hideCursor = (): string => `${ESC}[?25l`;

export const showCursor = (): string => `${ESC}[?25h`;

export const color = {
  red: (s: string): string => `${ESC}[31m${s}${ESC}[0m`,
  green: (s: string): string => `${ESC}[32m${s}${ESC}[0m`,
  yellow: (s: string): string => `${ESC}[33m${s}${ESC}[0m`,
  blue: (s: string): string => `${ESC}[34m${s}${ESC}[0m`,
  magenta: (s: string): string => `${ESC}[35m${s}${ESC}[0m`,
  cyan: (s: string): string => `${ESC}[36m${s}${ESC}[0m`,
  white: (s: string): string => `${ESC}[37m${s}${ESC}[0m`,
  gray: (s: string): string => `${ESC}[90m${s}${ESC}[0m`,
  dim: (s: string): string => `${ESC}[2m${s}${ESC}[0m`,
  bold: (s: string): string => `${ESC}[1m${s}${ESC}[0m`,
};
