// src/cli/repl/native-flag.ts
// ═══ Native-agent flag (SP-1 M3, §10 Faz 1) ═════════════════════════════════
// The native REPL path is OFF by default. Opt in with DECKENT_NATIVE_AGENT=1 or
// the `--native` flag. M4 flips the default; M3 keeps it strictly opt-in.

export function isNativeAgentEnabled(
  env: Record<string, string | undefined>,
  argv: readonly string[],
): boolean {
  if (env['DECKENT_NATIVE_AGENT'] === '1') return true;
  if (argv.includes('--native')) return true;
  return false;
}
