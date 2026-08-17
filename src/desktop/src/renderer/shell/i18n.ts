/** Desktop-shell catalog additions owned by renderer-only surfaces. */
export const SHELL_MESSAGES = {
  en: {
    'desktop.shell.worker.lifecycle': 'Lifecycle',
  },
  tr: {
    'desktop.shell.worker.lifecycle': 'Yaşam döngüsü',
  },
} as const;

type ShellLanguage = keyof typeof SHELL_MESSAGES;

function fallbackLanguage(): ShellLanguage {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

/**
 * Resolve the host-injected Desktop catalog first, then this renderer catalog.
 * This keeps the shell useful in browser previews without storing locale or
 * execution truth in client state.
 */
export function translateShellMessage(
  strings: Readonly<Record<string, string>>,
  key: string,
  vars?: Readonly<Record<string, string>>,
): string {
  const local = SHELL_MESSAGES[fallbackLanguage()] as Readonly<Record<string, string>>;
  const template = strings[key] ?? local[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => vars[name] ?? `{${name}}`);
}
