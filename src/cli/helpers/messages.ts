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

  // ─── finalize command ────────────────────────────────────────────────
  'finalize.no_tasks': {
    en: 'No tasks found in .tasks/ directory. Nothing to finalize.',
    tr: '.tasks/ dizininde görev bulunamadı. Sonlandırılacak bir şey yok.',
  },
  'finalize.complete': {
    en: 'Sprint {sprintId} finalized: {total} tasks ({done} done, {debt} debt, {noGo} no-go). MEMORY.md, RETRO.md, and config updated.',
    tr: 'Sprint {sprintId} sonlandırıldı: {total} görev ({done} tamam, {debt} borç, {noGo} no-go). MEMORY.md, RETRO.md ve config güncellendi.',
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
  'kill.task_status_updated': {
    en: 'Task {taskId} status updated to PAUSED.',
    tr: '{taskId} görev durumu PAUSED olarak güncellendi.',
  },
  'kill.task_not_found': {
    en: 'Warning: Task file not found for {taskId} (worker was killed).',
    tr: 'Uyarı: {taskId} için görev dosyası bulunamadı (worker durduruldu).',
  },
  'kill.locks_released': {
    en: '{count} lock(s) released for task {taskId}.',
    tr: '{taskId} görevi için {count} kilit serbest bırakıldı.',
  },
  'kill.prompts_cleaned': {
    en: '{count} prompt file(s) cleaned for task {taskId}.',
    tr: '{taskId} görevi için {count} prompt dosyası temizlendi.',
  },
  'kill.all_killed': {
    en: '{count} worker(s) killed.',
    tr: '{count} worker durduruldu.',
  },
  'kill.no_active_workers': {
    en: 'No active workers found.',
    tr: 'Aktif worker bulunamadı.',
  },
  'kill.all_confirm_warning': {
    en: '⚠ This will cascade-kill ALL active workers and the controller. This cannot be undone.',
    tr: '⚠ Bu, TÜM aktif worker\'ları ve controller\'ı cascade-kill eder. Geri alınamaz.',
  },
  'kill.all_confirm_prompt': {
    en: 'Kill all?',
    tr: 'Hepsini öldür?',
  },
  'kill.all_aborted': {
    en: 'Aborted — no workers killed. Pass --force or --user-explicit to skip this prompt.',
    tr: 'İptal edildi — worker öldürülmedi. Bu onayı atlamak için --force veya --user-explicit kullanın.',
  },
  'agent.delete_confirm_prompt': {
    en: 'Permanently delete agent \'{name}\' and all its files?',
    tr: '\'{name}\' agent\'ını ve tüm dosyalarını kalıcı olarak sil?',
  },
  'agent.delete_aborted': {
    en: 'Aborted — agent \'{name}\' not deleted. Pass --force to skip this prompt.',
    tr: 'İptal edildi — \'{name}\' agent\'ı silinmedi. Bu onayı atlamak için --force kullanın.',
  },
  // ─── checkpoint command (MSG-003, §4G) ───────────────────────────────
  'checkpoint.list_empty': {
    en: 'No checkpoints found.',
    tr: 'Checkpoint bulunamadı.',
  },
  'checkpoint.col_sprint': { en: 'Sprint', tr: 'Sprint' },
  'checkpoint.col_phase': { en: 'Phase', tr: 'Faz' },
  'checkpoint.col_status': { en: 'Status', tr: 'Durum' },
  'checkpoint.col_summary': { en: 'Summary', tr: 'Özet' },
  'checkpoint.col_created': { en: 'Created', tr: 'Oluşturuldu' },
  'checkpoint.approved': {
    en: 'Checkpoint {sprintId}/{phase} approved.',
    tr: 'Checkpoint {sprintId}/{phase} onaylandı.',
  },
  'checkpoint.rejected': {
    en: 'Checkpoint {sprintId}/{phase} rejected.',
    tr: 'Checkpoint {sprintId}/{phase} reddedildi.',
  },
  'checkpoint.not_found': {
    en: 'Checkpoint not found: {sprintId}/{phase}',
    tr: 'Checkpoint bulunamadı: {sprintId}/{phase}',
  },
  // ─── nervous command (MSG-002, §4G) ──────────────────────────────────
  'nervous.dashboard_title': { en: '🧠 Deckent Nervous System', tr: '🧠 Deckent Nervous System' },
  'nervous.no_pending': { en: 'No pending notifications.', tr: 'Bekleyen bildirim yok.' },
  'nervous.pending_header': { en: 'Pending:', tr: 'Bekleyen:' },
  'nervous.actions_label': { en: 'Actions:', tr: 'Eylemler:' },
  'nervous.recent_header': { en: 'Recent (last {count}):', tr: 'Son ({count}):' },
  'nervous.label_autonomous': { en: '(autonomous)', tr: '(otonom)' },
  'nervous.label_accepted': { en: '(accepted)', tr: '(kabul edildi)' },
  'nervous.label_rejected': { en: '(rejected by user)', tr: '(kullanıcı reddetti)' },
  'nervous.config_summary': {
    en: 'Config: mode={mode} · overrides={overrides} · quiet={quiet}',
    tr: 'Yapılandırma: mod={mode} · override={overrides} · sessiz={quiet}',
  },
  'nervous.accepted': { en: '✓ Accepted: {action}', tr: '✓ Kabul edildi: {action}' },
  'nervous.rejected': { en: '✗ Rejected: {action}{reason}', tr: '✗ Reddedildi: {action}{reason}' },
  'nervous.reject_reason': { en: ' (reason: {reason})', tr: ' (sebep: {reason})' },
  'nervous.edited': { en: '✎ Edited & accepted: {action}', tr: '✎ Düzenlendi & kabul edildi: {action}' },
  'nervous.undone': { en: '↩ Undone: {action} ({id})', tr: '↩ Geri alındı: {action} ({id})' },
  'nervous.not_found_pending': {
    en: 'Pending notification not found: {id}',
    tr: 'Bekleyen bildirim bulunamadı: {id}',
  },
  'nervous.not_found_reversible': {
    en: 'No reversible action found: {id}',
    tr: 'Geri alınabilir eylem bulunamadı: {id}',
  },
  'nervous.history_empty': { en: 'No history records found.', tr: 'Geçmiş kaydı bulunamadı.' },
  'nervous.history_header': { en: 'Nervous System History:', tr: 'Nervous System Geçmişi:' },
  'nervous.log_watching': {
    en: '--- watching for new entries (Ctrl+C to exit) ---',
    tr: '--- yeni kayıtlar izleniyor (çıkmak için Ctrl+C) ---',
  },
  'nervous.time_just_now': { en: 'just now', tr: 'az önce' },
  'nervous.time_minutes': { en: '{n}m ago', tr: '{n}dk önce' },
  'nervous.time_hours': { en: '{n}h ago', tr: '{n}sa önce' },
  'nervous.time_days': { en: '{n}d ago', tr: '{n}g önce' },
  'nervous.slash_id_required': {
    en: '[nervous] id required: /nervous {sub} <id>',
    tr: '[nervous] id gerekli: /nervous {sub} <id>',
  },
  'nervous.slash_not_found': { en: '[nervous] not found: {id}', tr: '[nervous] bulunamadı: {id}' },
  'nervous.slash_empty': {
    en: 'nervous: no pending notifications',
    tr: 'nervous: bekleyen bildirim yok',
  },
  'nervous.sent_to_executor': {
    en: '✓ Sent to the nervous executor: {action}',
    tr: '✓ Nervous executor\'a iletildi: {action}',
  },
  'nervous.dismissed_no_executor': {
    en: '⚠ {action} — no live nervous process, dismissed without executing',
    tr: '⚠ {action} — canlı nervous süreci yok, çalıştırılmadan kapatıldı',
  },
  // ─── config nervous command (MSG-004, §4G) ───────────────────────────
  'config_nervous.mode_set': { en: '✓ Mode set to: {preset}', tr: '✓ Mod ayarlandı: {preset}' },
  'config_nervous.invalid_preset': {
    en: 'Invalid preset: "{preset}". Valid values: {values}',
    tr: 'Geçersiz preset: "{preset}". Geçerli değerler: {values}',
  },
  'config_nervous.invalid_action': {
    en: 'Invalid action ID: "{id}". Run `deckent config nervous list` to see all 30 actions.',
    tr: 'Geçersiz eylem ID: "{id}". Tüm eylemleri görmek için `deckent config nervous list` çalıştırın.',
  },
  'config_nervous.safety_floor_blocked': {
    en: '⚠ Safety floor action "{id}" cannot be set to "{policy}".',
    tr: '⚠ Safety floor eylemi "{id}" "{policy}" yapılamaz.',
  },
  'config_nervous.safety_floor_note': {
    en: 'Safety floor actions always require explicit user approval.',
    tr: 'Safety floor eylemleri her zaman açık kullanıcı onayı gerektirir.',
  },
  'config_nervous.invalid_policy': {
    en: 'Invalid policy: "{policy}". Valid values: {values}',
    tr: 'Geçersiz policy: "{policy}". Geçerli değerler: {values}',
  },
  'config_nervous.override_set': {
    en: '✓ Override set: {id} → {policy}',
    tr: '✓ Override ayarlandı: {id} → {policy}',
  },
  'config_nervous.matrix_title': {
    en: 'Nervous System Authority Matrix:',
    tr: 'Nervous System Yetki Matrisi:',
  },
  'config_nervous.col_preset': { en: 'Preset', tr: 'Preset' },
  'config_nervous.col_low': { en: 'Low Risk', tr: 'Düşük Risk' },
  'config_nervous.col_medium': { en: 'Medium Risk', tr: 'Orta Risk' },
  'config_nervous.col_high': { en: 'High Risk', tr: 'Yüksek Risk' },
  'config_nervous.col_description': { en: 'Description', tr: 'Açıklama' },
  'config_nervous.active_marker': { en: ' ◀ active', tr: ' ◀ aktif' },
  'config_nervous.preset_strict': {
    en: 'Enterprise / new user — all medium/high actions require approval',
    tr: 'Enterprise / yeni kullanıcı — tüm medium/high eylemler onay bekler',
  },
  'config_nervous.preset_balanced': {
    en: 'Default — low-risk autonomous, medium 30m suggestion, high approval',
    tr: 'Varsayılan — düşük risk otonom, orta 30dk öneri, yüksek onay',
  },
  'config_nervous.preset_autopilot': {
    en: 'Trusted user — low/medium autonomous, high 5m suggestion',
    tr: 'Güvenilir kullanıcı — düşük/orta otonom, yüksek 5dk öneri',
  },
  'config_nervous.preset_full_auto': {
    en: 'CI/CD / hands-off — all autonomous (except safety floor)',
    tr: 'CI/CD / hands-off — tümü otonom (safety floor hariç)',
  },
  'config_nervous.active_overrides': { en: 'Active Overrides:', tr: 'Aktif Override\'lar:' },
  'config_nervous.no_overrides': { en: 'No active overrides.', tr: 'Aktif override yok.' },
  'config_nervous.safety_floor_label': {
    en: 'Safety Floor (always approve):',
    tr: 'Safety Floor (her zaman onay):',
  },
  'config_nervous.reset_done': {
    en: '✓ Action overrides reset to preset defaults.',
    tr: '✓ Eylem override\'ları preset varsayılanına sıfırlandı.',
  },
  'config_nervous.interactive_title': {
    en: '🧠 Nervous System Configuration',
    tr: '🧠 Nervous System Yapılandırması',
  },
  'config_nervous.current_mode': { en: 'Current mode: {mode}', tr: 'Mevcut mod: {mode}' },
  'config_nervous.available_presets': { en: 'Available presets:', tr: 'Mevcut presetler:' },
  'config_nervous.preset_current': { en: ' (current)', tr: ' (mevcut)' },
  'config_nervous.non_interactive': {
    en: '(Non-interactive mode — use subcommands to modify config)',
    tr: '(Etkileşimsiz mod — değiştirmek için subcommand kullanın)',
  },
  'config_nervous.ni_mode': { en: 'Mode: {mode}', tr: 'Mod: {mode}' },
  'config_nervous.ni_overrides': { en: 'Overrides: {count}', tr: 'Override: {count}' },
  'config_nervous.select_prompt': {
    en: 'Select preset (1-{max}) or press Enter to keep "{mode}": ',
    tr: 'Preset seç (1-{max}) veya "{mode}" için Enter: ',
  },
  'config_nervous.no_change': {
    en: 'No change — mode remains: {mode}',
    tr: 'Değişiklik yok — mod: {mode}',
  },
  'config_nervous.mode_updated': { en: '✓ Mode updated to: {mode}', tr: '✓ Mod güncellendi: {mode}' },
  'config_nervous.invalid_selection': {
    en: 'Invalid selection: "{value}"',
    tr: 'Geçersiz seçim: "{value}"',
  },
  'config_nervous.reset_prompt': { en: 'Reset overrides? [y/N]: ', tr: 'Override\'ları sıfırla? [y/N]: ' },
  'config_nervous.overrides_reset': { en: '✓ Overrides reset.', tr: '✓ Override\'lar sıfırlandı.' },
  'config_nervous.unknown_key': {
    en: 'Unknown nervous config key: "{key}". Supported: mode',
    tr: 'Bilinmeyen nervous config anahtarı: "{key}". Desteklenen: mode',
  },

  // ─── spawn command ─────────────────────────────────────────────────
  'spawn.worker_spawned': {
    en: 'Worker spawned for task {taskId} (model: {model}).',
    tr: '{taskId} görevi için worker başlatıldı (model: {model}).',
  },

  // ─── init command ────────────────────────────────────────────────────
  'init.select_language': {
    en: 'Select language:',
    tr: 'Dil seçin:',
  },
  'init.select_plan': {
    en: 'Select your plan:',
    tr: 'Planınızı seçin:',
  },
  'init.enter_project_name': {
    en: 'Project name:',
    tr: 'Proje adı:',
  },
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

  // ─── set-directives command ──────────────────────────────────────────
  'set_directives.updated': {
    en: 'DIRECTIVES.md updated ({count} task blocks detected)',
    tr: 'DIRECTIVES.md güncellendi ({count} görev bloğu algılandı)',
  },
  'set_directives.file_not_found': {
    en: 'File not found: {path}',
    tr: 'Dosya bulunamadı: {path}',
  },
  'set_directives.empty_content': {
    en: 'Content is empty. Provide --content, --file, or pipe content via stdin.',
    tr: 'İçerik boş. --content, --file kullanın ya da stdin üzerinden içerik pipe edin.',
  },
  'set_directives.no_input': {
    en: 'No input provided. Use --content <string>, --file <path>, or pipe content via stdin.',
    tr: 'Giriş sağlanmadı. --content <string>, --file <path> kullanın ya da stdin üzerinden içerik pipe edin.',
  },

  // ─── error codes (structured) ─────────────────────────────────────
  'error.tmux_not_found': {
    en: 'tmux not found. Install: brew install tmux (macOS) / sudo apt install tmux (Linux). Or use spawn_backend: "subprocess" in config.',
    tr: 'tmux bulunamadi. Kurulum: brew install tmux (macOS) / sudo apt install tmux (Linux). Veya config\'de spawn_backend: "subprocess" kullanin.',
  },
  'error.claude_not_found': {
    en: 'Claude CLI not found. Install: npm install -g @anthropic-ai/claude-code',
    tr: 'Claude CLI bulunamadi. Kurulum: npm install -g @anthropic-ai/claude-code',
  },
  'error.no_directives': {
    en: 'DIRECTIVES.md not found. Create it with sprint goals, or run: deckent init',
    tr: 'DIRECTIVES.md bulunamadi. Sprint hedeflerinizi yazin veya calistirin: deckent init',
  },
  'error.config_invalid': {
    en: 'Configuration is invalid. Run: deckent doctor to diagnose',
    tr: 'Yapilandirma gecersiz. Tani icin calistirin: deckent doctor',
  },
  'error.scope_violation': {
    en: 'Worker exceeded assigned scope. Check task scope boundaries.',
    tr: 'Worker atanan kapsami asti. Gorev kapsam sinirlarini kontrol edin.',
  },
  'error.lock_conflict': {
    en: 'Another worker holds the lock. Wait or run: deckent cleanup',
    tr: 'Baska bir worker kilidi tutuyor. Bekleyin veya calistirin: deckent cleanup',
  },
  'error.usage_exceeded': {
    en: 'Usage threshold reached. Sprint has been auto-paused.',
    tr: 'Kullanim esigi asildi. Sprint otomatik olarak duraklatildi.',
  },
  'error.build_failed': {
    en: 'Build failed. Run your project\'s type check / lint command to check for errors.',
    tr: 'Derleme başarısız. Hataları kontrol için projenizin tip kontrolü / lint komutunu çalıştırın.',
  },
  'error.git_not_found': {
    en: 'git not found. Install git to use deckent.',
    tr: 'git bulunamadi. deckent kullanmak icin git kurun.',
  },
  'error.node_version_low': {
    en: 'Node.js version too low. Upgrade to >=24.0.0.',
    tr: 'Node.js sürümü çok düşük. >=24.0.0 sürümüne yükseltin.',
  },
  'tui.intro': {
    en: 'deckent — pinned-bottom TUI (experimental). Type /exit to quit.',
    tr: 'deckent — alt-sabit TUI (deneysel). /exit ile çık.',
  },
  'tui.thinking': {
    en: 'thinking…',
    tr: 'düşünüyor…',
  },
  'tui.confirm_hint': {
    en: '(y = allow · a = always allow · N = deny)',
    tr: '(y = izin · a = hep izin · N = reddet)',
  },
  'tui.confirm_granted': {
    en: 'allowed',
    tr: 'izin verildi',
  },
  'tui.confirm_always': {
    en: 'always allowed',
    tr: 'hep izin verildi',
  },
  'tui.confirm_denied': {
    en: 'denied',
    tr: 'reddedildi',
  },
  'tui.queued': {
    en: 'queued',
    tr: 'kuyrukta',
  },
  'tui.menu_hint': {
    en: '↑↓ move · Enter select · Tab complete · Esc close',
    tr: '↑↓ gez · Enter seç · Tab tamamla · Esc kapat',
  },
  'tui.switched': {
    en: 'switched to',
    tr: 'geçildi',
  },
  'tui.switch_usage': {
    en: 'usage: /model <id> · /provider <name>. current:',
    tr: 'kullanım: /model <id> · /provider <ad>. aktif:',
  },
  'tui.approval_set': {
    en: 'approval mode',
    tr: 'onay modu',
  },
  'tui.approval_usage': {
    en: 'usage: /approve suggest|auto-edit|full-auto. current:',
    tr: 'kullanım: /approve suggest|auto-edit|full-auto. aktif:',
  },
  'tui.queue_cleared': {
    en: 'queue cleared',
    tr: 'kuyruk temizlendi',
  },
  'tui.cd_to': {
    en: 'working dir',
    tr: 'dizin',
  },
  'tui.cd_fail': {
    en: 'cannot change dir',
    tr: 'dizin değiştirilemedi',
  },
  'tui.generating': {
    en: 'generating…',
    tr: 'üretiliyor…',
  },
  'tui.ready': {
    en: 'ready · your turn',
    tr: 'hazır · sıra sende',
  },
  'tui.confirm_run': {
    en: 'Run',
    tr: 'Çalıştır',
  },
  'tui.cmd_cancelled': {
    en: 'cancelled',
    tr: 'iptal edildi',
  },
  'tui.resume_list_header': {
    en: 'Past chat sessions:',
    tr: 'Geçmiş sohbet oturumları:',
  },
  'tui.resume_hint': {
    en: 'Tip: /resume <number> to continue a session',
    tr: 'İpucu: /resume <numara> ile oturumu sürdür',
  },
  'tui.resume_none': {
    en: 'No past chat sessions yet.',
    tr: 'Henüz geçmiş sohbet oturumu yok.',
  },
  'tui.resume_loaded': {
    en: 'Resuming session "{session}" — last {count} turn(s):',
    tr: '"{session}" oturumu sürdürülüyor — son {count} tur:',
  },
  'tui.resume_not_found': {
    en: 'No turns found for session "{session}".',
    tr: '"{session}" oturumu için tur bulunamadı.',
  },
  'tui.resume_no_memory': {
    en: 'Memory store is not available — cannot resume.',
    tr: 'Hafıza deposu kullanılamıyor — sürdürülemez.',
  },
  'tui.resume_turn_count': {
    en: '{count} turns',
    tr: '{count} tur',
  },
  'tool.wrote_file': {
    en: 'wrote file',
    tr: 'dosya yazıldı',
  },
  'tool.edited_file': {
    en: 'edited file',
    tr: 'dosya düzenlendi',
  },
  'tool.read_file': {
    en: 'read file',
    tr: 'dosya okundu',
  },
  'tool.ran_cmd': {
    en: 'ran command',
    tr: 'komut çalıştırıldı',
  },

  // ─── autonomous command (Sprint 228 — 228-001 i18n retrofit) ─────────
  'autonomous.start_banner': {
    en: 'Autonomous runtime started — {flows} flow(s), default-deny + approval-gate active',
    tr: 'Otonom runtime başladı — {flows} flow, default-deny + onay-kapısı aktif',
  },
  'autonomous.start_done': {
    en: 'Autonomous loop finished ({iterations} cycles, reason: {reason})',
    tr: 'Otonom döngü tamamlandı ({iterations} cycle, sebep: {reason})',
  },
  'autonomous.status_header': {
    en: 'Autonomous runtime status',
    tr: 'Otonom runtime durumu',
  },
  'autonomous.status_pending': {
    en: 'Pending approvals: {count}',
    tr: 'Bekleyen onay: {count}',
  },
  'autonomous.status_no_audit': {
    en: 'No audit events yet.',
    tr: 'Henüz audit kaydı yok.',
  },
  'autonomous.status_recent_audit': {
    en: 'Recent audit ({count}):',
    tr: 'Son audit ({count}):',
  },
  'autonomous.stop_marker_written': {
    en: 'Stop signal written — active loop will halt after the in-flight cycle.',
    tr: 'Durdurma sinyali yazıldı — aktif döngü mevcut cycle sonrası duracak.',
  },
  // ─── autonomous approve/reject/pending + live feedback (APPROVE-002, §4G) ──
  'autonomous.approve_done': {
    en: '✓ Approved: {triggerId} (decision recorded — applied when this trigger is next re-evaluated).',
    tr: '✓ Onaylandı: {triggerId} (karar kaydedildi — bu tetik tekrar değerlendirildiğinde uygulanır).',
  },
  'autonomous.reject_done': {
    en: '✗ Rejected: {triggerId}',
    tr: '✗ Reddedildi: {triggerId}',
  },
  'autonomous.resolve_not_found': {
    en: 'No pending trigger found: {triggerId}',
    tr: 'Bekleyen tetik bulunamadı: {triggerId}',
  },
  'autonomous.id_required': {
    en: 'A trigger id is required.',
    tr: 'Tetik id gerekli.',
  },
  'autonomous.pending_header': {
    en: 'Pending approvals ({count}):',
    tr: 'Bekleyen onaylar ({count}):',
  },
  'autonomous.pending_none': {
    en: 'No pending approvals.',
    tr: 'Bekleyen onay yok.',
  },
  'autonomous.pending_row': {
    en: '  - {triggerId} | {action} | by {requestedBy} | {enqueuedAt}',
    tr: '  - {triggerId} | {action} | {requestedBy} | {enqueuedAt}',
  },
  'autonomous.tick': {
    en: '[autonomous] {outcome} — {action} ({triggerId}): {reason}',
    tr: '[autonomous] {outcome} — {action} ({triggerId}): {reason}',
  },
  'autonomous.notify_pending_title': {
    en: 'Autonomous approval required',
    tr: 'Otonom onay gerekiyor',
  },
  'autonomous.notify_pending_summary': {
    en: '{action} ({triggerId}) is awaiting human approval — run: deckent autonomous approve {triggerId}',
    tr: '{action} ({triggerId}) insan onayı bekliyor — çalıştır: deckent autonomous approve {triggerId}',
  },
  'autonomous.audit_row': {
    en: '  - {ts} {action} -> {outcome}: {reason}',
    tr: '  - {ts} {action} -> {outcome}: {reason}',
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
