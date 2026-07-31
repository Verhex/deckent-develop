// ─── CLI Theme (ANSI color helpers) ─────────────────────────────────

// ─── Color detection ────────────────────────────────────────────────

function shouldUseColor(): boolean {
  // FORCE_COLOR takes precedence
  if (process.env['FORCE_COLOR'] !== undefined) {
    const val = process.env['FORCE_COLOR'];
    // FORCE_COLOR=0 means no color; anything else means color
    return val !== '0';
  }
  // NO_COLOR disables color
  if (process.env['NO_COLOR'] !== undefined) {
    return false;
  }
  // Default: color if stdout is a TTY
  return process.stdout.isTTY === true;
}

// ─── ANSI escape helpers ────────────────────────────────────────────

function wrap(code: string, reset: string, text: string): string {
  if (!shouldUseColor()) {
    return text;
  }
  return `\x1b[${code}m${text}\x1b[${reset}m`;
}

// ─── Theme class ────────────────────────────────────────────────────

export class Theme {
  /**
   * Green text (success, DONE, PASS).
   */
  success(text: string): string {
    return wrap('32', '0', text);
  }

  /**
   * Red text (error, NO_GO, FAIL).
   */
  error(text: string): string {
    return wrap('31', '0', text);
  }

  /**
   * Yellow text (warning, TECH_DEBT).
   */
  warning(text: string): string {
    return wrap('33', '0', text);
  }

  /**
   * Blue text (info, hints).
   */
  info(text: string): string {
    return wrap('34', '0', text);
  }

  /**
   * Gray/dim text (muted, secondary info).
   */
  muted(text: string): string {
    return wrap('2', '0', text);
  }

  /**
   * Cyan text (accent, links, highlights).
   */
  accent(text: string): string {
    return wrap('36', '0', text);
  }

  /**
   * Bold text.
   */
  bold(text: string): string {
    return wrap('1', '0', text);
  }

  /**
   * Strip all ANSI escape codes from a string.
   */
  strip(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }
}

/**
 * Singleton theme instance.
 */
export const theme = new Theme();
