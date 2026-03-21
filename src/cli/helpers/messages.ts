// ─── Localized Messages ──────────────────────────────────────────────

type MessageMap = Record<string, Record<string, string>>;

const MESSAGES: MessageMap = {
  // COMPLETE phase
  'hint.COMPLETE': {
    tr: 'Sprint tamamlandı! `deckent retro` ile retrospektif okuyun',
    en: 'Sprint complete! Run `deckent retro` to read retrospective',
  },
  // EXECUTE phase
  'hint.EXECUTE': {
    tr: 'Görevler çalışıyor. `deckent status --watch` ile izleyin',
    en: 'Tasks running. Monitor with `deckent status --watch`',
  },
  // PLAN phase
  'hint.PLAN': {
    tr: '`deckent start` ile sprint\'i başlatın',
    en: 'Run `deckent start` to begin the sprint',
  },
  // IDLE phase
  'hint.IDLE': {
    tr: '`deckent plan` ile sprint planlayın',
    en: 'Run `deckent plan` to plan a sprint',
  },
  // Generic messages
  'status.tasks_running': {
    tr: '{taskCount} görev çalışıyor',
    en: '{taskCount} tasks running',
  },
  'status.sprint_active': {
    tr: 'Sprint {sprintId} aktif',
    en: 'Sprint {sprintId} active',
  },
  'status.no_sprint': {
    tr: 'Aktif sprint yok',
    en: 'No active sprint',
  },

  // ─── start command ──────────────────────────────────────────────────
  'start.sandbox_not_implemented': {
    en: 'Sandbox mode not yet implemented. Running normally.',
    tr: 'Sandbox modu henüz uygulanmadı. Normal çalışıyor.',
  },
  'start.use_force': {
    en: 'Use --force to skip pre-flight checks.',
    tr: 'Ön kontrolleri atlamak için --force kullanın.',
  },
  'start.watch_ignored_dry_run': {
    en: 'Note: --watch ignored in dry-run mode (no workers spawned).',
    tr: 'Not: Dry-run modunda --watch görmezden gelindi (worker başlatılmadı).',
  },
  'start.sprint_planned': {
    en: 'Sprint {number} ({id}) planned — {count} tasks:',
    tr: 'Sprint {number} ({id}) planlandı — {count} görev:',
  },
  'start.reasoning': {
    en: 'Reasoning: {reasoning}',
    tr: 'Gerekçe: {reasoning}',
  },
  'start.planning_mode': {
    en: 'Planning mode: {mode}',
    tr: 'Planlama modu: {mode}',
  },
  'start.workers_info': {
    en: 'Workers: {count} | Brain model: {model}',
    tr: 'Worker sayısı: {count} | Brain modeli: {model}',
  },
  'start.dry_run_complete': {
    en: 'Dry-run complete. No workers spawned.',
    tr: 'Dry-run tamamlandı. Worker başlatılmadı.',
  },
  'start.watch_window_created': {
    en: 'Watch window created. Attach with: tmux attach -t deckent:watch',
    tr: 'Watch penceresi oluşturuldu. Bağlanmak için: tmux attach -t deckent:watch',
  },
  'start.watch_no_tmux': {
    en: 'Note: --watch requires an active tmux session. Skipping watch setup.',
    tr: 'Not: --watch aktif bir tmux oturumu gerektirir. Watch kurulumu atlandı.',
  },
  'start.zero_config_created': {
    en: 'Zero-config mode: created temporary DIRECTIVES.md for "{description}"',
    tr: 'Sıfır-yapılandırma modu: "{description}" için geçici DIRECTIVES.md oluşturuldu',
  },
  'start.zero_config_directives_exist': {
    en: 'Warning: DIRECTIVES.md already exists. Using existing file (ignoring description argument).',
    tr: 'Uyarı: DIRECTIVES.md zaten mevcut. Mevcut dosya kullanılıyor (açıklama argümanı görmezden geliniyor).',
  },
  'start.zero_config_cleanup': {
    en: 'Zero-config mode: cleaned up temporary DIRECTIVES.md',
    tr: 'Sıfır-yapılandırma modu: geçici DIRECTIVES.md temizlendi',
  },

  // ─── plan command ───────────────────────────────────────────────────
  'plan.sprint_planned': {
    en: 'Sprint {number} ({id}) planned with {count} tasks:',
    tr: 'Sprint {number} ({id}) {count} görevle planlandı:',
  },
  'plan.reasoning': {
    en: 'Reasoning: {reasoning}',
    tr: 'Gerekçe: {reasoning}',
  },
  'plan.planning_mode': {
    en: 'Planning mode: {mode}',
    tr: 'Planlama modu: {mode}',
  },
  'plan.note_sprint_size': {
    en: 'Note: Sprint size {size} — {reason}',
    tr: 'Not: Sprint boyutu {size} — {reason}',
  },
  'plan.approved': {
    en: 'Plan approved.',
    tr: 'Plan onaylandı.',
  },
  'plan.rejected': {
    en: 'Plan rejected.',
    tr: 'Plan reddedildi.',
  },

  // ─── status command ─────────────────────────────────────────────────
  'status.no_active_sprint': {
    en: 'No active sprint. Run `deckent start` first.',
    tr: 'Aktif sprint yok. Önce `deckent start` çalıştırın.',
  },
  'status.dashboard_read_failed': {
    en: 'Failed to read dashboard file.',
    tr: 'Dashboard dosyası okunamadı.',
  },

  // ─── cleanup command ─────────────────────────────────────────────────
  'cleanup.decay_complete': {
    en: 'Decay complete: {before} → {after} lines',
    tr: 'Decay tamamlandı: {before} → {after} satır',
  },
  'cleanup.archived_sprints': {
    en: 'Archived: {sprints}',
    tr: 'Arşivlendi: {sprints}',
  },
  'cleanup.removed_items': {
    en: 'Removed: {debt} debt, {patterns} patterns',
    tr: 'Silindi: {debt} borç, {patterns} desen',
  },
  'cleanup.complete': {
    en: 'Cleanup complete. Removed artifacts for {count} tasks.',
    tr: 'Temizlik tamamlandı. {count} görevin artifaktları silindi.',
  },

  // ─── doctor command ──────────────────────────────────────────────────
  'doctor.checks_passed': {
    en: 'Result: {passed}/{total} checks passed',
    tr: 'Sonuç: {passed}/{total} kontrol geçti',
  },

  // ─── attach command ─────────────────────────────────────────────────
  'attach.no_active_session': {
    en: 'No active session. Run `deckent start` first.',
    tr: 'Aktif oturum yok. Önce `deckent start` çalıştırın.',
  },

  // ─── kill command ──────────────────────────────────────────────────
  'kill.worker_killed': {
    en: 'Worker for task {taskId} killed.',
    tr: '{taskId} görevi için worker durduruldu.',
  },
  'kill.worker_not_found': {
    en: 'Worker not found: {taskId}',
    tr: 'Worker bulunamadı: {taskId}',
  },

  // ─── spawn command ─────────────────────────────────────────────────
  'spawn.worker_spawned': {
    en: 'Worker spawned for task {taskId} (model: {model}).',
    tr: '{taskId} görevi için worker başlatıldı (model: {model}).',
  },

  // ─── init command ────────────────────────────────────────────────────
  'init.auto_detecting': {
    en: 'Auto-detecting system, subscription, and project...',
    tr: 'Sistem, abonelik ve proje otomatik algılanıyor...',
  },
  'init.recommendation': {
    en: 'Recommendation:',
    tr: 'Öneri:',
  },
  'init.initialized': {
    en: 'Deckent initialized for "{name}" ({mode}, {language}).',
    tr: 'Deckent "{name}" için başlatıldı ({mode}, {language}).',
  },
  'init.next_steps': {
    en: 'Next steps:',
    tr: 'Sonraki adımlar:',
  },
  'init.next_step_directives': {
    en: '  1. Edit DIRECTIVES.md with your project goals',
    tr: '  1. Proje hedeflerinizi DIRECTIVES.md dosyasına yazın',
  },
  'init.next_step_start': {
    en: '  2. Run `deckent start` to begin your first sprint',
    tr: '  2. İlk sprint\'i başlatmak için `deckent start` çalıştırın',
  },
};

/**
 * Get a localized message by key.
 * Supports variable interpolation with {varName} placeholders.
 * Returns the key itself if not found.
 */
export function getMessage(
  key: string,
  lang: string,
  vars?: Record<string, string>,
): string {
  const entry = MESSAGES[key];
  if (!entry) return key;

  const normalizedLang = lang === 'tr' ? 'tr' : 'en';
  const template = entry[normalizedLang] ?? entry['en'] ?? key;

  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (_, varName: string) => {
    return vars[varName] ?? `{${varName}}`;
  });
}

const SUPPORTED_LANGS = ['en', 'tr'] as const;

/**
 * Determine the effective UI language.
 * Priority: configLanguage (if supported) > LC_ALL env > LANG env > 'en'
 * Normalizes locale-style values (e.g. "tr_TR" -> "tr").
 */
export function getLanguage(configLanguage?: string): string {
  // If a config language is supplied, normalize and check support
  if (configLanguage !== undefined && configLanguage !== '') {
    const normalized = configLanguage.slice(0, 2).toLowerCase();
    if ((SUPPORTED_LANGS as readonly string[]).includes(normalized)) {
      return normalized;
    }
  }

  // Fall back to environment variables
  const envLang = process.env['LC_ALL'] ?? process.env['LANG'] ?? '';
  if (envLang) {
    const normalized = envLang.slice(0, 2).toLowerCase();
    if ((SUPPORTED_LANGS as readonly string[]).includes(normalized)) {
      return normalized;
    }
  }

  return 'en';
}
