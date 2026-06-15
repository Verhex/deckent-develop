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
  'status.pending_approvals.header': {
    en: '⏳ Pending approvals: {count} — act in the sprint terminal or the dashboard:',
    tr: '⏳ Bekleyen onaylar: {count} — sprint terminalinde veya dashboard\'tan onayla:',
  },
  'status.pending_approvals.more': {
    en: '… and {count} more (run `deckent nervous` to see all)',
    tr: '… ve {count} tane daha (hepsi için: `deckent nervous`)',
  },
  'status.dashboard_read_failed': {
    en: 'Failed to read dashboard file.',
    tr: 'Dashboard dosyası okunamadı.',
  },
  'status.worker_comms.header': {
    en: '--- Worker Comms ---',
    tr: '--- Worker İletişim ---',
  },
  'status.worker_comms.no_shared': {
    en: 'No shared context.',
    tr: 'Paylaşılan bağlam yok.',
  },
  'status.worker_comms.shared_keys': {
    en: 'Shared context: {count} key(s)',
    tr: 'Paylaşılan bağlam: {count} anahtar',
  },
  'status.worker_comms.handoffs': {
    en: 'Handoffs: {pending} pending / {executed} executed',
    tr: 'Handoff\'lar: {pending} bekliyor / {executed} tamamlandı',
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

  // ─── doctor: worker image readiness + --fix-image (F1-IMG, Sprint 270 — 270-008) ──
  'doctor.image_ready': {
    en: 'Worker image ready — provider CLIs + ca-certificates present',
    tr: 'Worker imajı hazır — sağlayıcı CLI\'ları + ca-certificates mevcut',
  },
  'doctor.image_not_ready': {
    en: 'Worker image {state} — rebuild needed before docker-backend workers can run',
    tr: 'Worker imajı {state} — docker-backend worker\'lar çalışmadan önce yeniden derleme gerekli',
  },
  'doctor.image_missing_clis': {
    en: 'Missing provider CLIs: {clis}',
    tr: 'Eksik sağlayıcı CLI\'ları: {clis}',
  },
  'doctor.image_missing_cacerts': {
    en: 'Missing ca-certificates (TLS will fail for codex/gemini)',
    tr: 'ca-certificates eksik (codex/gemini için TLS başarısız olur)',
  },
  'doctor.image_build_hint': {
    en: 'Build: {cmd}',
    tr: 'Derleme: {cmd}',
  },
  'doctor.image_fix_hint': {
    en: 'Run `deckent doctor --fix-image` to rebuild it (asks for confirmation first).',
    tr: 'Yeniden derlemek için `deckent doctor --fix-image` çalıştırın (önce onay ister).',
  },
  'doctor.image_fix_confirm': {
    en: 'Rebuild the worker image now? This runs: {cmd}',
    tr: 'Worker imajı şimdi yeniden derlensin mi? Şu komut çalışır: {cmd}',
  },
  'doctor.image_fix_declined': {
    en: 'Image rebuild cancelled — nothing was built.',
    tr: 'İmaj yeniden derlemesi iptal edildi — hiçbir şey derlenmedi.',
  },
  'doctor.image_fix_running': {
    en: 'Rebuilding worker image: {cmd}',
    tr: 'Worker imajı yeniden derleniyor: {cmd}',
  },
  'doctor.image_fix_done': {
    en: 'Worker image rebuilt successfully.',
    tr: 'Worker imajı başarıyla yeniden derlendi.',
  },
  'doctor.image_fix_failed': {
    en: 'Worker image build failed (exit {code}). See the build output above.',
    tr: 'Worker imaj derlemesi başarısız (çıkış {code}). Yukarıdaki derleme çıktısına bakın.',
  },

  // ─── doctor: worker resources (Sprint 271 — 271-006) ─────────────────
  'doctor.resources_header': {
    en: 'Worker Resources:',
    tr: 'Worker Kaynakları:',
  },
  'doctor.resources_limits': {
    en: 'Memory: {limit} / swap: {swap} — max workers: {workers}',
    tr: 'Bellek: {limit} / swap: {swap} — maksimum worker: {workers}',
  },
  'doctor.resources_ceiling': {
    en: 'RAM ceiling: {ceiling} ({workers} × {limit}) — host: {host} ({pct}%)',
    tr: 'RAM tavanı: {ceiling} ({workers} × {limit}) — host: {host} ({pct}%)',
  },
  'doctor.resources_warn_ceiling': {
    en: '[WARN] Worker RAM ceiling ({ceiling}) is {pct}% of host — consider lowering max_workers or worker_memory_limit',
    tr: '[WARN] Worker RAM tavanı ({ceiling}) host\'un %{pct}\'i — max_workers veya worker_memory_limit düşürmeyi düşünün',
  },
  'doctor.resources_monitor_on': {
    en: 'Resource monitor: enabled (interval: {interval}ms)',
    tr: 'Kaynak izleme: etkin (aralık: {interval}ms)',
  },
  'doctor.resources_monitor_off': {
    en: 'Resource monitor: disabled (set resource_monitor.enabled=true to enable)',
    tr: 'Kaynak izleme: devre dışı (etkinleştirmek için resource_monitor.enabled=true ayarlayın)',
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
  'nervous.recommendations_header': {
    en: 'Brain inbox — recommendations ({count}):',
    tr: 'Brain gelen-kutusu — öneriler ({count}):',
  },
  'nervous.no_recommendations': {
    en: 'No open recommendations.',
    tr: 'Açık öneri yok.',
  },
  'nervous.recommendations_hint': {
    en: 'Run `deckent nervous recommendations` for the full inbox; dismiss with `--dismiss <id>`.',
    tr: 'Tam gelen-kutusu için `deckent nervous recommendations`; kapatmak için `--dismiss <id>`.',
  },
  'nervous.rec_dismissed': { en: '✓ Recommendation dismissed: {id}', tr: '✓ Öneri kapatıldı: {id}' },
  'nervous.rec_not_found': {
    en: 'Open recommendation not found: {id}',
    tr: 'Açık öneri bulunamadı: {id}',
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
  'nervous.slash_edit_payload_required': {
    en: '[nervous edit] payload required: /nervous edit <id> key=val ... or {json}',
    tr: '[nervous edit] payload gerekli: /nervous edit <id> key=val ... veya {json}',
  },
  'nervous.slash_edit_invalid_json': {
    en: '[nervous edit] invalid JSON payload: {detail}',
    tr: '[nervous edit] geçersiz JSON payload: {detail}',
  },
  'nervous.slash_edit_invalid_kv': {
    en: '[nervous edit] invalid key=value argument: {arg}',
    tr: '[nervous edit] geçersiz key=value argümanı: {arg}',
  },
  // ─── config nervous command (MSG-004, §4G) ───────────────────────────
  'config_nervous.mode_set': { en: '✓ Mode set to: {preset}', tr: '✓ Mod ayarlandı: {preset}' },
  'nervous.enabled_banner': {
    en: '✓ Nervous System enabled (authority: {mode}).\n  Safety contract: medium/high-risk actions surface as suggestions you approve; 5 safety-floor actions (kill-sprint, destructive-git, …) ALWAYS require explicit approval — no silent destructive auto-run.\n  Operate: deckent nervous (dashboard) · deckent nervous accept/reject <id>',
    tr: '✓ Nervous System açıldı (yetki: {mode}).\n  Güvenlik sözleşmesi: orta/yüksek-riskli eylemler onayladığın öneri olarak çıkar; 5 safety-floor eylem (sprint-kill, yıkıcı-git, …) HER ZAMAN açık onay ister — yıkıcı sessiz-çalışma yok.\n  Kullan: deckent nervous (dashboard) · deckent nervous accept/reject <id>',
  },
  'nervous.already_enabled': {
    en: 'Nervous System is already enabled (authority: {mode}). Open it with: deckent nervous',
    tr: 'Nervous System zaten açık (yetki: {mode}). Açmak için: deckent nervous',
  },
  'nervous.approve_timeout.auto': {
    en: 'Auto-proceed: non-safety-floor approvals auto-apply after {secs}s if not approved (safety-floor always waits for you). Disable with config.nervous_system.approve_timeout_ms=0.',
    tr: 'Auto-proceed: safety-floor olmayan onaylar {secs}s içinde onaylanmazsa otomatik uygulanır (safety-floor her zaman seni bekler). Kapatmak: config.nervous_system.approve_timeout_ms=0.',
  },
  'nervous.approve_timeout.never': {
    en: 'Auto-proceed: DISABLED — every approval waits for your explicit accept/reject.',
    tr: 'Auto-proceed: KAPALI — her onay senin açık accept/reject kararını bekler.',
  },
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
  // Per-card position when several tool calls are queued for approval in one turn
  // ([1/3], [2/3], …). Numeric notation — identical across locales by design, but
  // routed through getMessage so it stays i18n-owned (template, not hardcoded).
  'tui.confirm_progress': {
    en: '[{index}/{total}]',
    tr: '[{index}/{total}]',
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
  'native.run_tool': {
    en: 'Run tool',
    tr: 'Aracı çalıştır',
  },
  'native.tool_ran': {
    en: 'tool ran',
    tr: 'araç çalıştı',
  },
  'tui.render_error': {
    en: 'REPL render error',
    tr: 'REPL render hatası',
  },
  'tui.tool_telemetry_mismatch': {
    en: '[deckent] warning: {found} action tag(s) found, {executed} executed — {malformed} malformed/skipped',
    tr: '[deckent] uyarı: {found} aksiyon-etiketi bulundu, {executed} yürütüldü — {malformed} hatalı/atlandı',
  },

  // ─── chat REPL loop + slash subactions (Sprint 269 — 269-003) ────────
  // NOTE: the en templates for max_turns/max_tool_hops/provider_error/
  // agentic_no_match are byte-identical to the previous hardcoded strings —
  // existing substring assertions stay green.
  'chat.max_turns_reached': {
    en: '[chat-native] maxTurns ({max}) reached — ending session.',
    tr: '[chat-native] maxTurns ({max}) sınırına ulaşıldı — oturum kapatılıyor.',
  },
  'chat.max_tool_hops_reached': {
    en: '[chat-native] maxToolHops ({max}) reached — aborting tool chain.',
    tr: '[chat-native] maxToolHops ({max}) sınırına ulaşıldı — araç zinciri durduruluyor.',
  },
  'chat.provider_error': {
    en: '[chat-native] error: {message}',
    tr: '[chat-native] hata: {message}',
  },
  'chat.agentic_no_match': {
    en: '[agentic] no matching intent — falling back to chat.',
    tr: '[agentic] eşleşen niyet yok — sohbete dönülüyor.',
  },
  'chat.mcp_not_wired': {
    en: 'The external MCP client is not wired into the REPL yet — it is on the roadmap (F9 phase 2). Use `claude mcp add deckent -- npx deckent-mcp` to reach deckent tools from a host CLI.',
    tr: 'Harici MCP istemcisi REPL\'e henüz bağlı değil — yol haritasında (F9 faz 2). Deckent araçlarına host CLI üzerinden erişmek için: `claude mcp add deckent -- npx deckent-mcp`.',
  },
  'chat.slash_unknown_subaction': {
    en: '{command}: unknown subaction "{sub}". See /help for usage.',
    tr: '{command}: bilinmeyen alt-aksiyon "{sub}". Kullanım için /help.',
  },
  'chat.autonomous_id_required': {
    en: 'Usage: /autonomous {sub} <id>',
    tr: 'Kullanım: /autonomous {sub} <id>',
  },
  'chat.autonomous_title_required': {
    en: 'Usage: /autonomous backlog add <title> [--cron <expr>]',
    tr: 'Kullanım: /autonomous backlog add <başlık> [--cron <ifade>]',
  },
  'chat.audit_not_in_mcp': {
    en: 'Audit action "{sub}" is not available over MCP yet — run it via the CLI: deckent audit {sub}',
    tr: '"{sub}" audit aksiyonu henüz MCP\'de yok — CLI ile çalıştırın: deckent audit {sub}',
  },
  'chat.directives_set_usage': {
    en: 'Usage: /directives set <content>',
    tr: 'Kullanım: /directives set <içerik>',
  },
  'chat.directives_not_found': {
    en: 'DIRECTIVES.md not found under {root}.',
    tr: 'DIRECTIVES.md bulunamadı: {root}.',
  },

  // ─── autonomous command (Sprint 228 — 228-001 i18n retrofit) ─────────
  'autonomous.disabled': {
    en: 'Autonomous mode is disabled. Run `deckent autonomous enable` (or set config.autonomous.enabled=true in .deckent/config.json) to run the engine.',
    tr: 'Otonom mod kapalı. Motoru çalıştırmak için `deckent autonomous enable` çalıştırın (veya .deckent/config.json içinde config.autonomous.enabled=true yapın).',
  },
  'autonomous.enabled_banner': {
    en: '✓ Autonomous mode enabled ({path}).\n  Safety contract: every machine-initiated item passes RBAC → policy → risk gates; approval-required & risk-tagged items PARK for your sign-off — destructive ops never auto-run silently.\n  Start: deckent autonomous start · Add work: deckent autonomous backlog add · Review pending: deckent autonomous pending',
    tr: '✓ Otonom mod açıldı ({path}).\n  Güvenlik sözleşmesi: her makine-başlatımlı iş RBAC → policy → risk kapılarından geçer; onay-gerektiren & risk-etiketli işler onayın için PARK eder — yıkıcı işlemler sessizce çalışmaz.\n  Başlat: deckent autonomous start · İş ekle: deckent autonomous backlog add · Bekleyenler: deckent autonomous pending',
  },
  'autonomous.already_enabled': {
    en: 'Autonomous mode is already enabled ({path}). Start it with: deckent autonomous start',
    tr: 'Otonom mod zaten açık ({path}). Başlatmak için: deckent autonomous start',
  },
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
  'autonomous.cleanup_done': {
    en: 'Swept {count} stray autonomous run-artifact(s) from .tasks/.',
    tr: '.tasks/ içinden {count} adet artık otonom run-artifact temizlendi.',
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

  // ─── autonomous backlog subcommand (Task 7) ──────────────────────────
  'autonomous.backlog.added': {
    en: 'Backlog entry added: {id}',
    tr: 'Backlog kaydı eklendi: {id}',
  },
  'autonomous.backlog.removed': {
    en: 'Backlog entry removed: {id}',
    tr: 'Backlog kaydı silindi: {id}',
  },
  'autonomous.backlog.empty': {
    en: 'No backlog entries.',
    tr: 'Backlog kaydı yok.',
  },
  'autonomous.backlog.not_found': {
    en: 'Backlog entry not found: {id}',
    tr: 'Backlog kaydı bulunamadı: {id}',
  },
  'autonomous.backlog.duplicate': {
    en: 'Backlog entry already exists: {id}',
    tr: 'Backlog kaydı zaten var: {id}',
  },
  'autonomous.backlog.id_required': {
    en: 'An entry id is required: pass it positionally (remove <id>) or via --id <id>.',
    tr: 'Kayıt id gerekli: ya konumsal (remove <id>) ya da --id <id> ile verin.',
  },
  'autonomous.backlog.invalid_cron': {
    en: 'Invalid cron expression "{cron}": {error}',
    tr: 'Geçersiz cron ifadesi "{cron}": {error}',
  },
  'autonomous.backlog.capability_required': {
    en: 'kind=capability requires --capability <verb> (e.g. fs.read, db.query).',
    tr: 'kind=capability için --capability <fiil> gerekli (örn. fs.read, db.query).',
  },
  'autonomous.backlog.invalid_args': {
    en: 'Invalid --args JSON: {error}',
    tr: 'Geçersiz --args JSON: {error}',
  },

  // ─── audit read-side (compliance + SIEM forward) ──────────────────────
  'audit.compliance.summary': {
    en: 'Compliance ({sprint}): events={count} auditChainIntact={chain} rbacEnforcement={rbac} tenantIsolation={tenant}',
    tr: 'Uyumluluk ({sprint}): olay={count} denetimZinciriSağlam={chain} rbacZorlama={rbac} kiracıİzolasyonu={tenant}',
  },
  'audit.compliance.actor_row': {
    en: '  actor {actor}: {count} event(s)',
    tr: '  aktör {actor}: {count} olay',
  },
  'audit.forward.done': {
    en: 'Forwarded {count} audit record(s) → {out}',
    tr: '{count} denetim kaydı iletildi → {out}',
  },
  'audit.forward.sent': {
    en: 'Forwarded {count} audit record(s) → {url}',
    tr: '{count} denetim kaydı iletildi → {url}',
  },
  'audit.forward.syslog_sent': {
    en: 'Forwarded {count} audit record(s) → syslog {protocol}://{host}:{port}',
    tr: '{count} denetim kaydı iletildi → syslog {protocol}://{host}:{port}',
  },
  'audit.retention.plan': {
    en: 'Retention plan ({sprint}): scanned={scanned} keep={keep} archive={archive} prune={prune} — dry-run, nothing written (use --apply)',
    tr: 'Saklama planı ({sprint}): taranan={scanned} tutulan={keep} arşiv={archive} silinecek={prune} — deneme çalıştırması, hiçbir şey yazılmadı (--apply kullanın)',
  },
  'audit.retention.applied': {
    en: 'Retention applied ({sprint}): kept={keep} archived={archive} pruned={prune}',
    tr: 'Saklama uygulandı ({sprint}): tutulan={keep} arşivlenen={archive} silinen={prune}',
  },
  'audit.retention.invalid_keep_days': {
    en: '--keep-days must be a non-negative number, got "{value}"',
    tr: '--keep-days negatif olmayan bir sayı olmalı, girilen: "{value}"',
  },
  'audit.retention.invalid_keep_count': {
    en: '--keep-count must be a non-negative integer, got "{value}"',
    tr: '--keep-count negatif olmayan bir tamsayı olmalı, girilen: "{value}"',
  },
  'autonomous.backlog.summary': {
    en: 'Backlog: {total} entries — pending:{pending} running:{running} parked:{parked} done:{done} failed:{failed}',
    tr: 'Backlog: {total} kayıt — bekleyen:{pending} çalışan:{running} beklemede:{parked} tamam:{done} hata:{failed}',
  },
  'autonomous.backlog.list_header': {
    en: 'Backlog ({count} entries):',
    tr: 'Backlog ({count} kayıt):',
  },
  'autonomous.backlog.list_row': {
    en: '  - [{status}] {id}: {title} (kind:{kind} policy:{policy})',
    tr: '  - [{status}] {id}: {title} (tür:{kind} politika:{policy})',
  },

  // ─── memory backup subcommand ──────────────────────────────────
  'memory.backup.desc': {
    en: 'Create a WAL-safe backup of memory.db',
    tr: 'memory.db dosyasının WAL-güvenli yedeğini oluştur',
  },
  'memory.backup.not_found': {
    en: 'memory.db not found. Nothing to backup.',
    tr: 'memory.db bulunamadı. Yedeklenecek dosya yok.',
  },
  'memory.backup.success': {
    en: 'Backup created: {path} ({count} entries)',
    tr: 'Yedek oluşturuldu: {path} ({count} giriş)',
  },
  'memory.backup.checkpoint_done': {
    en: 'WAL checkpoint complete',
    tr: 'WAL checkpoint tamamlandı',
  },
  'memory.backup.error': {
    en: 'Backup failed: {error}',
    tr: 'Yedekleme başarısız: {error}',
  },

  // ─── inbound bot command acks (BOT-002, §4G) ───────────────────
  'bot.approve_ack': {
    en: '✅ Approved: {id}',
    tr: '✅ Onaylandı: {id}',
  },
  'bot.reject_ack': {
    en: '❌ Rejected: {id}',
    tr: '❌ Reddedildi: {id}',
  },
  'bot.approve_ack_ctx': {
    en: '✅ Approved: {id} — {what}',
    tr: '✅ Onaylandı: {id} — {what}',
  },
  'bot.reject_ack_ctx': {
    en: '❌ Rejected: {id} — {what}',
    tr: '❌ Reddedildi: {id} — {what}',
  },
  'bot.not_found': {
    en: '⚠️ No pending approval found (unknown or expired): {id}',
    tr: '⚠️ Bekleyen onay bulunamadı (bilinmiyor veya süresi doldu): {id}',
  },
  'bot.listen_desc': {
    en: 'Listen for inbound approve/reject commands from messaging connectors',
    tr: 'Mesaj connector\'larından gelen approve/reject komutlarını dinle',
  },
  'bot.listen_none': {
    en: 'No messaging connectors configured for inbound commands — nothing to listen on. Set notify_connectors.{telegram|discord}.{enabled,token,chat_id} (token via .deck).',
    tr: 'Inbound komutlar için yapılandırılmış mesaj connector\'ı yok — dinlenecek bir şey yok. notify_connectors.{telegram|discord}.{enabled,token,chat_id} ayarla (token .deck ile).',
  },
  'bot.listen_active': {
    en: '🟢 Listening for approve/reject on: {connectors}. Reply "approve <id>" or "reject <id>" from the configured chat. Ctrl-C to stop.',
    tr: '🟢 approve/reject dinleniyor: {connectors}. Yapılandırılmış sohbetten "approve <id>" veya "reject <id>" yaz. Durdurmak için Ctrl-C.',
  },
  'bot.listen_stopped': {
    en: 'Stopped listening for inbound commands.',
    tr: 'Inbound komut dinleme durduruldu.',
  },
  'bot.chat_thinking': {
    en: '💭 thinking…',
    tr: '💭 düşünüyorum…',
  },
  'bot.chat_empty': {
    en: '(no response)',
    tr: '(yanıt yok)',
  },
  'bot.chat_error': {
    en: '⚠️ Could not process that message — try again.',
    tr: '⚠️ Bu mesaj işlenemedi — tekrar dene.',
  },
  'bot.action_done': {
    en: '✅ Executed {tool}:',
    tr: '✅ {tool} çalıştırıldı:',
  },
  'bot.action_rejected': {
    en: '❌ Rejected — {tool} was not executed.',
    tr: '❌ Reddedildi — {tool} çalıştırılmadı.',
  },
  'bot.action_failed': {
    en: '⚠️ {tool} failed: {error}',
    tr: '⚠️ {tool} başarısız: {error}',
  },

  // ─── curated bot command surface (BOT-003 slice 2c) ────────────
  'bot.unknown_command': {
    en: 'Unknown command. Type /help to see what I can do — or just write naturally and I\'ll act (asking approval for risky things).',
    tr: 'Bilinmeyen komut. Neler yapabildiğimi görmek için /help yaz — ya da doğal dilde yaz, ben hallederim (riskli işler için onay isterim).',
  },
  'bot.help_body': {
    en: [
      '🤖 deckent bot — commands:',
      '  /help      this list',
      '  /status    current sprint status',
      '  /history   recent sprints',
      '  /pending   actions awaiting your approval',
      '',
      '🔐 approve <id>  /  reject <id>   — approve or reject a parked action',
      '',
      '💬 Or just write naturally — ask anything, or tell me what to do.',
      '   I run read-only things instantly and ask "approve <id>" before anything risky.',
    ].join('\n'),
    tr: [
      '🤖 deckent bot — komutlar:',
      '  /help      bu liste',
      '  /status    aktif sprint durumu',
      '  /history   son sprint\'ler',
      '  /pending   onayını bekleyen işlemler',
      '',
      '🔐 approve <id>  /  reject <id>   — parklanmış işlemi onayla veya reddet',
      '',
      '💬 Ya da doğal dilde yaz — soru sor veya ne yapmamı istediğini söyle.',
      '   Salt-okunur şeyleri anında yaparım, riskli her şeyden önce "approve <id>" isterim.',
    ].join('\n'),
  },
  'bot.pending_header': {
    en: '🔐 Actions awaiting your approval:',
    tr: '🔐 Onayını bekleyen işlemler:',
  },
  'bot.pending_none': {
    en: 'No actions awaiting approval.',
    tr: 'Onay bekleyen işlem yok.',
  },
  'bot.pending_row': {
    en: '  • {tool}({args}) — approve {id} / reject {id}',
    tr: '  • {tool}({args}) — approve {id} / reject {id}',
  },
  'bot.pending_approval_row': {
    en: '  • [{kind}] {title} — approve {id} / reject {id}',
    tr: '  • [{kind}] {title} — approve {id} / reject {id}',
  },
  'bot.action_expired': {
    en: '⏲️ Expired — {tool} was not executed (the approval was too old). Ask again if you still want it.',
    tr: '⏲️ Süresi doldu — {tool} çalıştırılmadı (onay çok eskidi). Hâlâ istiyorsan tekrar iste.',
  },
  'bot.action_sprint_changed': {
    en: '🛡️ Not executed — {tool} was tied to sprint {sprint}, which is no longer the active sprint. Refusing so a stale command can\'t hit a different sprint.',
    tr: '🛡️ Çalıştırılmadı — {tool}, {sprint} sprint\'ine bağlıydı ama o artık aktif sprint değil. Bayat bir komut başka sprint\'i vurmasın diye reddedildi.',
  },
  'bot.kill_done': {
    en: '✅ Killed sprint {sprint} (pid {pid}).',
    tr: '✅ {sprint} sprint\'i öldürüldü (pid {pid}).',
  },
  'bot.kill_reused': {
    en: '🛡️ Not executed — sprint {sprint}\'s process is gone and its pid now belongs to something else. Refusing to signal a foreign process.',
    tr: '🛡️ Çalıştırılmadı — {sprint} sprint\'inin process\'i gitmiş ve pid\'i artık başka bir şeye ait. Yabancı bir process\'e sinyal göndermeyi reddediyorum.',
  },
  'bot.kill_already_stopped': {
    en: 'ℹ️ Sprint {sprint} is already stopped — nothing to kill.',
    tr: 'ℹ️ {sprint} sprint\'i zaten durmuş — öldürülecek bir şey yok.',
  },

  // ─── serve command ──────────────────────────────────────────────────
  'serve.listening': {
    en: 'Deckent is ready — http://{host}:{port}',
    tr: 'Deckent hazır — http://{host}:{port}',
  },
  'serve.token_injected': {
    en: '  Token     API token auto-injected into dashboard HTML (localhost: no extra step)',
    tr: '  Token     API token dashboard HTML\'ine otomatik enjekte edildi (localhost: ek adım yok)',
  },
  'serve.terminal_enabled': {
    en: '  Terminal  embedded PTY enabled (token auto-injected for localhost callers)',
    tr: '  Terminal  gömülü PTY aktif (localhost arayanlar için token otomatik enjekte)',
  },
  'serve.terminal_disabled': {
    en: '  Terminal  disabled — pass --terminal on localhost to enable',
    tr: '  Terminal  kapalı — etkinleştirmek için localhost\'ta --terminal geçin',
  },
  'serve.stop_hint': {
    en: '  Stop      Ctrl+C',
    tr: '  Durdurmak Ctrl+C',
  },
  'serve.port_tip': {
    en: '  Tips      deckent serve --port <n>  --host <addr>',
    tr: '  İpuçları  deckent serve --port <n>  --host <adres>',
  },

  // ─── bot daemon (start/stop/status) ────────────────────────────
  'bot.daemon_desc': {
    en: 'Run the bot listener as a background daemon',
    tr: 'Bot dinleyicisini arka plan daemon\'ı olarak çalıştır',
  },
  'bot.daemon_started': {
    en: '🟢 Bot daemon started (pid {pid}). Always-on while this machine is up. Stop with: deckent bot stop',
    tr: '🟢 Bot daemon başladı (pid {pid}). Makine açık olduğu sürece çalışır. Durdurmak için: deckent bot stop',
  },
  'bot.daemon_reboot_note': {
    en: 'Note: a daemon does NOT survive a reboot/crash — use a systemd/pm2 service for that.',
    tr: 'Not: daemon yeniden başlatma/çökmeden SONRA yaşamaz — bunun için systemd/pm2 servisi kullan.',
  },
  'bot.daemon_already': {
    en: 'ℹ️ Bot daemon is already running (pid {pid}).',
    tr: 'ℹ️ Bot daemon zaten çalışıyor (pid {pid}).',
  },
  'bot.daemon_spawn_failed': {
    en: '⚠️ Failed to start the bot daemon.',
    tr: '⚠️ Bot daemon başlatılamadı.',
  },
  'bot.daemon_stopped': {
    en: '🛑 Bot daemon stopped (pid {pid}).',
    tr: '🛑 Bot daemon durduruldu (pid {pid}).',
  },
  'bot.daemon_not_running': {
    en: 'Bot daemon is not running.',
    tr: 'Bot daemon çalışmıyor.',
  },
  'bot.daemon_status_running': {
    en: '🟢 Bot daemon is running (pid {pid}).',
    tr: '🟢 Bot daemon çalışıyor (pid {pid}).',
  },

  // ─── resources command (Sprint 271 T-004) ────────────────────────────────
  'resources.snapshot_title': {
    en: 'Live Worker Resource Snapshot',
    tr: 'Canlı Worker Kaynak Anlık Görüntüsü',
  },
  'resources.log_title': {
    en: 'Resource Log Summary',
    tr: 'Kaynak Log Özeti',
  },
  'resources.docker_unavailable': {
    en: 'Docker is not available — cannot retrieve resource data.',
    tr: 'Docker mevcut değil — kaynak verisi alınamıyor.',
  },
  'resources.no_containers': {
    en: 'No deckent worker containers running.',
    tr: 'Çalışan deckent worker container\'ı yok.',
  },
  'resources.log_not_found': {
    en: 'Resource log not found: {path}',
    tr: 'Kaynak log bulunamadı: {path}',
  },
  'resources.log_empty': {
    en: 'Resource log is empty — no samples recorded.',
    tr: 'Kaynak log boş — hiç örnek kaydedilmemiş.',
  },
  'resources.table_header_container': {
    en: 'Container',
    tr: 'Container',
  },
  'resources.table_header_task': {
    en: 'Task',
    tr: 'Görev',
  },
  'resources.table_header_mem_usage': {
    en: 'Mem Usage',
    tr: 'Bellek Kullanımı',
  },
  'resources.table_header_mem_limit': {
    en: 'Mem Limit',
    tr: 'Bellek Limiti',
  },
  'resources.table_header_mem_pct': {
    en: 'Mem%',
    tr: 'Bellek%',
  },
  'resources.table_header_cpu_pct': {
    en: 'CPU%',
    tr: 'CPU%',
  },
  'resources.config_line': {
    en: 'Config: memory_limit={limit}/swap={swap}, max_workers={workers}, RAM ceiling={ceiling}',
    tr: 'Yapılandırma: memory_limit={limit}/swap={swap}, max_workers={workers}, RAM tavanı={ceiling}',
  },
  'resources.log_header_task': {
    en: 'Task',
    tr: 'Görev',
  },
  'resources.log_header_peak_mem': {
    en: 'Peak Mem',
    tr: 'Tepe Bellek',
  },
  'resources.log_header_avg_mem': {
    en: 'Avg Mem',
    tr: 'Ort. Bellek',
  },
  'resources.log_header_peak_cpu': {
    en: 'Peak CPU%',
    tr: 'Tepe CPU%',
  },
  'resources.log_header_duration': {
    en: 'Duration(s)',
    tr: 'Süre(s)',
  },
  'resources.sprint_peak': {
    en: 'Sprint concurrent peak: {peak} ({containers} containers)',
    tr: 'Sprint eşzamanlı tepe: {peak} ({containers} container)',
  },

  // ─── usage command ─────────────────────────────────────────────────
  'usage.no_transcript_dir': {
    en: 'Transcript directory not found — no usage data available.',
    tr: 'Transkript dizini bulunamadı — kullanım verisi mevcut değil.',
  },
  'usage.no_data': {
    en: 'No usage data found for the selected period.',
    tr: 'Seçilen dönem için kullanım verisi bulunamadı.',
  },
  'usage.header_window': {
    en: 'Usage — last {days} days',
    tr: 'Kullanım — son {days} gün',
  },
  'usage.header_since_until': {
    en: 'Usage — {since} to {until}',
    tr: 'Kullanım — {since} → {until}',
  },
  'usage.header_sprint': {
    en: 'Usage — Sprint {sprint}',
    tr: 'Kullanım — Sprint {sprint}',
  },
  'usage.col_model': {
    en: 'Model',
    tr: 'Model',
  },
  'usage.col_calls': {
    en: 'Calls',
    tr: 'Çağrı',
  },
  'usage.col_input': {
    en: 'Input',
    tr: 'Girdi',
  },
  'usage.col_output': {
    en: 'Output',
    tr: 'Çıktı',
  },
  'usage.col_cw': {
    en: 'CW',
    tr: 'ÖB',
  },
  'usage.col_cost': {
    en: 'Limit $',
    tr: 'Limit $',
  },
  'usage.col_hit_rate': {
    en: 'Hit%',
    tr: 'İsabet%',
  },
  'usage.col_task': {
    en: 'Task',
    tr: 'Görev',
  },
  'usage.col_boot_cw': {
    en: 'Boot-CW',
    tr: 'Başl-ÖB',
  },
  'usage.totals': {
    en: 'TOTAL',
    tr: 'TOPLAM',
  },
  'usage.budget_ref': {
    en: 'Weekly budget reference: ~${budget} equiv',
    tr: 'Haftalık bütçe referansı: ~${budget} eşdeğer',
  },
  'usage.no_sprint_data': {
    en: 'No sprint data found. Sessions could not be mapped to sprint {sprint} tasks.',
    tr: 'Sprint verisi bulunamadı. Oturumlar sprint {sprint} görevlerine eşlenemedi.',
  },
  'usage.cache_gate': {
    en: 'Cache gate: {status} (warm-share {share}%, warmer: {taskId})',
    tr: 'Önbellek kapısı: {status} (ısıtma payı %{share}, ısıtıcı: {taskId})',
  },
  'usage.cache_gate_na': {
    en: 'Cache gate: N/A (single-session sprint)',
    tr: 'Önbellek kapısı: N/A (tek oturumlu sprint)',
  },
  'usage.unknown_models': {
    en: '⚠ No price found for model(s): {models} — their burn is counted as $0. Run `deckent config update-pricing` or add the model to .deckent/cost-config.json.',
    tr: '⚠ Şu model(ler) için fiyat bulunamadı: {models} — yakımları $0 sayılıyor. `deckent config update-pricing` çalıştırın veya modeli .deckent/cost-config.json dosyasına ekleyin.',
  },

  // ─── interrogation (Sprint 276 PLAN-INT-1) ───────────────────────────
  'interrogate.intro': {
    en: 'Directive Interrogation — challenging your plan before coding:',
    tr: 'Direktif Sorgulaması — kodlamadan önce planınızı zorluyoruz:',
  },
  'interrogate.draft_header': {
    en: '## Interrogation Refinements',
    tr: '## Sorgulama İyileştirmeleri',
  },
  'interrogate.q_pain': {
    en: 'Is this a real pain point or a feature wish? What breaks today without it?',
    tr: 'Bu gerçek bir acı noktası mı yoksa özellik isteği mi? Bugün bu olmadan ne bozuluyor?',
  },
  'interrogate.q_wedge': {
    en: 'What is the narrowest shippable slice that delivers value immediately?',
    tr: 'Değeri hemen sunan en dar gönderilebilir dilim nedir?',
  },
  'interrogate.q_hidden': {
    en: 'Are there existing capabilities in the codebase that already solve part of this?',
    tr: 'Kod tabanında bunu kısmen zaten çözen mevcut yetenekler var mı?',
  },
  'interrogate.q_premise': {
    en: 'What assumption in this plan could be wrong? What would invalidate it?',
    tr: 'Bu plandaki hangi varsayım yanlış olabilir? Onu geçersiz kılacak ne var?',
  },
  'interrogate.q_effort': {
    en: 'Is there a 10x simpler alternative that gets 80% of the value at 10% of the effort?',
    tr: 'Çabanın %10\'uyla değerin %80\'ini sağlayan 10 kat daha basit bir alternatif var mı?',
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
