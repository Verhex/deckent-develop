// ─── Native ANSI Escape Helpers ─────────────────────────────────────
// Zero external dependencies. Used by status-renderer.ts for TUI output.
// Sprint 145 — Task 145-012
// DESIGN-SYSTEM-001 slice-2 (2026-07-31): renk fonksiyonları artık theme.ts
// renk-kapısına bağlı — NO_COLOR/FORCE_COLOR=0/--no-color burada da geçerli
// (eski hali kapısızdı; a11y denetimi MAJOR bulgusunun kapanışı). TTY şartı
// bilinçli olarak YOK: bu modül interaktif TUI renderer'ına aittir ve eski
// davranış (TTY'siz ortamda da renk) korunur. Cursor primitifleri renk değil
// mekaniktir, kapıya tabi değildir.

import { isColorSuppressed } from './theme.js';

const ESC = '\x1b';

const paint = (code: string, s: string): string =>
  isColorSuppressed() ? s : `${ESC}[${code}m${s}${ESC}[0m`;

export const cursorTo = (col: number, row: number): string =>
  `${ESC}[${row + 1};${col + 1}H`;

export const clearLine = (): string => `${ESC}[2K`;

export const clearScreen = (): string => `${ESC}[2J${ESC}[H`;

export const hideCursor = (): string => `${ESC}[?25l`;

export const showCursor = (): string => `${ESC}[?25h`;

export const color = {
  red: (s: string): string => paint('31', s),
  green: (s: string): string => paint('32', s),
  yellow: (s: string): string => paint('33', s),
  blue: (s: string): string => paint('34', s),
  magenta: (s: string): string => paint('35', s),
  cyan: (s: string): string => paint('36', s),
  white: (s: string): string => paint('37', s),
  gray: (s: string): string => paint('90', s),
  dim: (s: string): string => paint('2', s),
  bold: (s: string): string => paint('1', s),
};
