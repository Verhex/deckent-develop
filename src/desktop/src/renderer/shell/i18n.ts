/** Desktop-shell catalog additions owned by renderer-only surfaces. */
export const SHELL_MESSAGES = {
  en: {
    'desktop.shell.worker.lifecycle': 'Lifecycle',
    'desktop.shell.runs.title': 'Runs',
    'desktop.shell.runs.run_id': 'Run ID',
    'desktop.shell.runs.state': 'State',
    'desktop.shell.runs.source': 'Source',
    'desktop.shell.runs.settled_at': 'Settled at',
    'desktop.shell.runs.refresh': 'Refresh',
    'desktop.shell.runs.loading': 'Loading runs…',
    'desktop.shell.runs.empty': 'No runs are available.',
    'desktop.shell.runs.error': 'Runs could not be loaded.',
    'desktop.shell.runs.not_settled': 'Not settled',
  },
  tr: {
    'desktop.shell.worker.lifecycle': 'Yaşam döngüsü',
    'desktop.shell.runs.title': 'Koşular',
    'desktop.shell.runs.run_id': 'Koşu kimliği',
    'desktop.shell.runs.state': 'Durum',
    'desktop.shell.runs.source': 'Kaynak',
    'desktop.shell.runs.settled_at': 'Sonuçlanma zamanı',
    'desktop.shell.runs.refresh': 'Yenile',
    'desktop.shell.runs.loading': 'Koşular yükleniyor…',
    'desktop.shell.runs.empty': 'Kullanılabilir koşu yok.',
    'desktop.shell.runs.error': 'Koşular yüklenemedi.',
    'desktop.shell.runs.not_settled': 'Henüz sonuçlanmadı',
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
