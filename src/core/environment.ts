/**
 * Environment detection module for Deckent.
 * Detects which IDE, terminal, or runtime environment Deckent is running in.
 * @module
 */

/** Detected IDE/terminal environment */
export type DetectedEnv = 'vscode' | 'codex' | 'gemini' | 'cursor' | 'tmux' | 'shell';

/**
 * Auto-detect which IDE/environment Deckent is running in.
 * Detection order (first match wins):
 * 1. VS Code: VSCODE_PID or VSCODE_CWD or TERM_PROGRAM='vscode'
 * 2. Cursor: CURSOR_SESSION or TERM_PROGRAM='cursor'
 * 3. Codex: CODEX_SESSION env var
 * 4. Gemini: GEMINI_CLI env var
 * 5. tmux: TMUX env var present
 * 6. shell: fallback
 *
 * @returns The detected environment identifier
 */
export function detectEnvironment(): DetectedEnv {
  const env = process.env;

  // 1. VS Code
  if (env.VSCODE_PID || env.VSCODE_CWD || env.TERM_PROGRAM === 'vscode') {
    return 'vscode';
  }

  // 2. Cursor
  if (env.CURSOR_SESSION || env.TERM_PROGRAM === 'cursor') {
    return 'cursor';
  }

  // 3. Codex
  if (env.CODEX_SESSION) {
    return 'codex';
  }

  // 4. Gemini
  if (env.GEMINI_CLI) {
    return 'gemini';
  }

  // 5. tmux
  if (env.TMUX) {
    return 'tmux';
  }

  // 6. fallback
  return 'shell';
}
