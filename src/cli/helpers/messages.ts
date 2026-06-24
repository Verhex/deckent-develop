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

  // ─── chat --native / --local wiring (Sprint 323 — 323-015) ───────────
  // NOTE: native_repl_banner + native_provider_disconnected en templates are
  // byte-identical to the prior hardcoded strings — existing substring
  // assertions (chat-native-flags "provider not yet connected") stay green.
  'chat.native_repl_banner': {
    en: 'Deckent native chat. Type :exit to quit.',
    tr: 'Deckent yerel sohbet. Çıkmak için :exit yazın.',
  },
  'chat.native_provider_disconnected': {
    en: '[native] provider not yet connected to a real LLM',
    tr: '[native] sağlayıcı henüz gerçek bir LLM\'e bağlı değil',
  },
  'chat.local_unavailable': {
    en: 'Local LLM runtime not reachable at {host}: {reason}\n  • Install Ollama: https://ollama.com/download\n  • Start it: `ollama serve`\n  • Pull a model: `ollama pull llama3`\n  • Or point at a remote host: DECKENT_OLLAMA_HOST=<url>',
    tr: 'Yerel LLM çalışma-zamanı erişilemez ({host}): {reason}\n  • Ollama kur: https://ollama.com/download\n  • Başlat: `ollama serve`\n  • Model indir: `ollama pull llama3`\n  • Veya uzak host göster: DECKENT_OLLAMA_HOST=<url>',
  },
  'chat.local_launching': {
    en: 'Deckent local chat → {host} ({model})',
    tr: 'Deckent yerel sohbet → {host} ({model})',
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
    en: 'Autonomous runtime started — {flows} flow(s), {pending} pending backlog item(s), default-deny + approval-gate active',
    tr: 'Otonom runtime başladı — {flows} flow, {pending} pending backlog maddesi, default-deny + onay-kapısı aktif',
  },
  'autonomous.start_no_work': {
    en: 'No pending work — backlog has no pending or scheduled items (all done/failed). Queue one with: deckent autonomous plan "<goal>" — the loop will idle until work is added.',
    tr: 'Bekleyen iş yok — backlog\'da pending veya zamanlanmış madde yok (hepsi done/failed). Kuyruğa iş ekle: deckent autonomous plan "<hedef>" — iş eklenene kadar döngü boşta bekler.',
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
    en: '{action} ({triggerId}) is awaiting human approval — tap a button below or run: deckent autonomous approve {triggerId}',
    tr: '{action} ({triggerId}) insan onayı bekliyor — aşağıdaki butona dokun ya da çalıştır: deckent autonomous approve {triggerId}',
  },
  'autonomous.action_approve': {
    en: '✓ Approve',
    tr: '✓ Onayla',
  },
  'autonomous.action_reject': {
    en: '✗ Reject',
    tr: '✗ Reddet',
  },
  'autonomous.audit_row': {
    en: '  - {ts} {action} -> {outcome}: {reason}',
    tr: '  - {ts} {action} -> {outcome}: {reason}',
  },
  // ─── autonomous flow-reporter (CORE-UNIFORMITY slice 1) ──────────────
  'autonomous.flow_line': { en: '{icon} {label} [{entryId}] {detail}', tr: '{icon} {label} [{entryId}] {detail}' },
  'autonomous.flow_picked': { en: 'picked', tr: 'seçildi' },
  'autonomous.flow_jit_detail': { en: 'JIT detail', tr: 'JIT detay' },
  'autonomous.flow_spawned': { en: 'spawned', tr: 'başlatıldı' },
  'autonomous.flow_brain_verdict': { en: 'Brain', tr: 'Brain' },
  'autonomous.flow_audit_verdict': { en: 'Auditor', tr: 'Denetçi' },
  'autonomous.flow_cross_verify': { en: 'Cross-verify', tr: 'Çapraz-doğrulama' },
  'autonomous.flow_done': { en: 'done', tr: 'tamam' },
  'autonomous.flow_failed': { en: 'failed', tr: 'başarısız' },
  'autonomous.flow_parked': { en: 'parked', tr: 'beklemede' },

  // ─── autonomous plan subcommand (Task 8 — goal planner) ──────────────
  'autonomous.plan_header': {
    en: 'Planned {count} item(s) from goal:',
    tr: 'Hedeften {count} madde planlandı:',
  },
  'autonomous.plan_row': {
    en: '  [{kind}/{policy}] {id}: {summary}',
    tr: '  [{kind}/{policy}] {id}: {summary}',
  },
  'autonomous.plan_written': {
    en: 'Wrote {count} item(s) to the backlog (pending). Review: deckent autonomous backlog list',
    tr: '{count} madde backlog’a yazıldı (pending). Gözden geçir: deckent autonomous backlog list',
  },
  'autonomous.plan_dryrun': {
    en: 'Dry-run — nothing written.',
    tr: 'Dry-run — hiçbir şey yazılmadı.',
  },
  'autonomous.plan_empty': {
    en: 'The planner returned no valid items.',
    tr: 'Planner geçerli madde döndürmedi.',
  },
  'autonomous.plan_none_added': {
    en: 'No new items queued — {skipped} already active in the backlog (pending/running/parked). Wait for them to finish, or remove them first: deckent autonomous backlog remove <id>',
    tr: 'Yeni madde eklenmedi — {skipped} madde backlog\'da zaten aktif (pending/running/parked). Bitmelerini bekle veya önce kaldır: deckent autonomous backlog remove <id>',
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

  // ─── autonomous-mission command (Sprint 296 — Task 296-001 i18n) ─────────
  'autonomous_mission.create_list.created': {
    en: 'Mission created: {id} — {title} ({count} item(s))',
    tr: 'Misyon oluşturuldu: {id} — {title} ({count} madde)',
  },
  'autonomous_mission.create_goal.created': {
    en: 'Goal mission created: {id} — {goal}',
    tr: 'Hedef misyonu oluşturuldu: {id} — {goal}',
  },
  'autonomous_mission.list.empty': {
    en: 'No autonomous missions found.',
    tr: 'Otonom misyon bulunamadı.',
  },
  'autonomous_mission.list.header': {
    en: 'Autonomous missions ({count}):',
    tr: 'Otonom misyonlar ({count}):',
  },
  'autonomous_mission.items_file_error': {
    en: 'Failed to load items file: {error}',
    tr: 'Madde dosyası yüklenemedi: {error}',
  },

  // ─── mission deliver (mission-deliver.ts) ─────────────────────────────────
  'mission.settled.title': {
    en: 'Mission settled: {title}',
    tr: 'Misyon tamamlandı: {title}',
  },
  'mission.settled.summary': {
    en: 'Mission {id} finished with status: {status}',
    tr: '{id} misyonu {status} durumuyla tamamlandı',
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
  'bot.resolve_failed': {
    en: '⚠️ Could not process {action} for {id} — please try again.',
    tr: '⚠️ {id} için {action} işlenemedi — lütfen tekrar deneyin.',
  },
  'bot.listen_desc': {
    en: 'Listen for inbound approve/reject commands from messaging connectors',
    tr: 'Mesaj connector\'larından gelen approve/reject komutlarını dinle',
  },
  'bot.group_desc': {
    en: 'Messaging-connector bot — listen/start/stop/status for inbound approve/reject',
    tr: 'Mesaj-connector botu — gelen approve/reject için listen/start/stop/status',
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
  'bot.nervous_active': {
    en: '🧠 Nervous system active (always-on): approvals from any source are consumed and acknowledged here.',
    tr: '🧠 Nervous sistemi aktif (daima-açık): herhangi bir kaynaktan gelen onaylar burada tüketilir ve onaylandığı yazılır.',
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

  // ─── docs track command (ADR-090) ───────────────────────────────────────
  'docs.track.scanned': {
    en: 'Scanned {count} docs ({stale} need attention).',
    tr: '{count} doküman tarandı ({stale} dikkat gerektiriyor).',
  },
  'docs.track.none': {
    en: 'No tracked docs found.',
    tr: 'İzlenen doküman bulunamadı.',
  },
  'docs.track.header': {
    en: 'rank  state           score  path',
    tr: 'kod   durum           skor   yol',
  },
  'docs.track.synced': {
    en: 'Synced {count} docs to memory.db (no front-matter written).',
    tr: '{count} doküman memory.db ile senkronlandı (front-matter yazılmadı).',
  },
  'docs.track.check_clean': {
    en: 'Doc-tracking check passed — no critical-stale docs.',
    tr: 'Doküman kontrolü geçti — kritik-bayat doküman yok.',
  },
  'docs.track.check_violations': {
    en: '{count} critical-stale doc(s) found:',
    tr: '{count} kritik-bayat doküman bulundu:',
  },
  'mcp.writer_lease.denied': {
    en: "Write tool '{tool}' is held by another deckent window (pid {pid}). Read tools work here; mutations run in that window — the lease transfers automatically when it exits.",
    tr: "'{tool}' yazma aracı başka bir deckent penceresinde (pid {pid}) kilitli. Okuma araçları burada çalışır; değişiklikler o pencerede yürür — pencere kapanınca yetki otomatik devrolur.",
  },

  // ─── process command (ADR-022 CLI/MCP parity) ───────────────────────────
  'process.submit_success': {
    en: 'Submitted. executionId: {executionId} | status: {status}',
    tr: 'Gönderildi. executionId: {executionId} | durum: {status}',
  },
  'process.status_found': {
    en: 'executionId: {executionId} | status: {status} | title: {title} | kind: {kind}',
    tr: 'executionId: {executionId} | durum: {status} | başlık: {title} | tür: {kind}',
  },
  'process.result_found': {
    en: 'executionId: {executionId} | status: {status} | title: {title} | result: {result}',
    tr: 'executionId: {executionId} | durum: {status} | başlık: {title} | sonuç: {result}',
  },
  'process.not_found': {
    en: 'No entry found for executionId: {executionId}',
    tr: 'executionId için kayıt bulunamadı: {executionId}',
  },
  'process.description_required': {
    en: 'Description is required for submit',
    tr: 'Submit için açıklama gereklidir',
  },
  'process.executionId_required': {
    en: 'executionId is required',
    tr: 'executionId gereklidir',
  },

  // ─── CLI i18n sweep — recall/remember/recover/features/history/config/retro/explain/web ───
  'recall.db_not_found': {
    en: 'Memory V2 DB not found. Run `deckent memory rebuild` first.',
    tr: 'Memory V2 veritabanı bulunamadı. Önce `deckent memory rebuild` komutunu çalıştırın.',
  },
  'recall.no_results': {
    en: 'No results for "{query}".',
    tr: '"{query}" için sonuç bulunamadı.',
  },
  'recall.results_header': {
    en: '\n  {count} result(s) for "{query}":\n',
    tr: '\n  "{query}" için {count} sonuç:\n',
  },
  'remember.db_not_found': {
    en: 'Memory V2 DB not found. Run `deckent memory rebuild` first.',
    tr: 'Memory V2 veritabanı bulunamadı. Önce `deckent memory rebuild` çalıştırın.',
  },
  'remember.stored': {
    en: '  Stored: [{type}] {title}',
    tr: '  Kaydedildi: [{type}] {title}',
  },
  'remember.tags': {
    en: '  Tags: {tags}',
    tr: '  Etiketler: {tags}',
  },
  'recover.warn_ipc_cleanup_failed': { en: '  Warning: IPC cleanup failed: {error}', tr: '  Uyarı: IPC temizliği başarısız: {error}' },
  'recover.warn_lock_cleanup_failed': { en: '  Warning: Lock cleanup failed: {error}', tr: '  Uyarı: Kilit temizliği başarısız: {error}' },
  'recover.warn_spawn_lock_cleanup_failed': { en: '  Warning: Spawn lock cleanup failed: {error}', tr: '  Uyarı: Spawn kilidi temizliği başarısız: {error}' },
  'recover.warn_task_archive_failed': { en: '  Warning: Task archive failed: {error}', tr: '  Uyarı: Görev arşivleme başarısız: {error}' },
  'recover.preview_header': { en: '\n  Recovery preview for {sprintId} (dry-run):', tr: '\n  {sprintId} için kurtarma önizlemesi (dry-run):' },
  'recover.audit_gate': { en: '  Audit gate:      {gate}', tr: '  Denetim kapısı:  {gate}' },
  'recover.preview_orphan_ipc': { en: '  Orphan IPC dirs: {count} would be removed', tr: '  Artık IPC dizinleri: {count} kaldırılacak' },
  'recover.preview_stale_locks': { en: '  Stale locks:     {count} would be cleared', tr: '  Bayat kilitler:  {count} temizlenecek' },
  'recover.preview_stale_spawnlocks': { en: '  Stale spawnlocks:{count} would be cleared', tr: '  Bayat spawnlock: {count} temizlenecek' },
  'recover.preview_task_files': { en: '  Task files:      {count} would be archived', tr: '  Görev dosyaları: {count} arşivlenecek' },
  'recover.preview_run_to_execute': { en: '\n  Run without --dry-run to execute.\n', tr: '\n  Çalıştırmak için --dry-run olmadan tekrar deneyin.\n' },
  'recover.confirm_header': { en: '\n  ⚠ Recovery will clean up sprint {sprintId}:', tr: '\n  ⚠ Kurtarma, {sprintId} sprint\'ini temizleyecek:' },
  'recover.confirm_remove_ipc': { en: '    - Remove orphan IPC directories (dead PIDs only)', tr: '    - Artık IPC dizinlerini kaldır (yalnızca ölü PID\'ler)' },
  'recover.confirm_clear_locks': { en: '    - Clear stale lock files (>5min)', tr: '    - Bayat kilit dosyalarını temizle (>5dk)' },
  'recover.confirm_archive_tasks': { en: '    - Archive terminal task files (DONE/NO_GO)', tr: '    - Sonlanmış görev dosyalarını arşivle (DONE/NO_GO)' },
  'recover.confirm_preserve_active': { en: '    - Preserve active tasks (PENDING/EXECUTING)\n', tr: '    - Aktif görevleri koru (PENDING/EXECUTING)\n' },
  'recover.confirm_hint': { en: '  Use --force to skip this confirmation, or --dry-run to preview.\n', tr: '  Bu onayı atlamak için --force, önizleme için --dry-run kullanın.\n' },
  'recover.confirm_prompt': { en: '  Proceed? (y/N)  ', tr: '  Devam edilsin mi? (y/N) ' },
  'recover.aborted': { en: '  Aborted.', tr: '  İptal edildi.' },
  'recover.recovering': { en: '\n  Recovering sprint {sprintId}...', tr: '\n  {sprintId} sprint\'i kurtarılıyor...' },
  'recover.result_orphan_ipc': { en: '  Orphan IPC dirs: {count} removed', tr: '  Artık IPC dizinleri: {count} kaldırıldı' },
  'recover.result_stale_locks': { en: '  Stale locks:     {count} cleared', tr: '  Bayat kilitler:  {count} temizlendi' },
  'recover.result_stale_spawnlocks': { en: '  Stale spawnlocks:{count} cleared', tr: '  Bayat spawnlock: {count} temizlendi' },
  'recover.result_task_files': { en: '  Task files:      {archived} archived, {preserved} preserved', tr: '  Görev dosyaları: {archived} arşivlendi, {preserved} korundu' },
  'recover.complete': { en: '\n  ✓ Recovery complete. Sprint {sprintId} is ready for restart.\n', tr: '\n  ✓ Kurtarma tamamlandı. {sprintId} sprint\'i yeniden başlatmaya hazır.\n' },
  'features.manifest_not_found': { en: 'features-manifest.json not found. Run `node scripts/sync-manifest.mjs` to generate.', tr: 'features-manifest.json bulunamadı. Oluşturmak için `node scripts/sync-manifest.mjs` çalıştırın.' },
  'features.feature_not_found': { en: 'feature "{name}" not found.', tr: '"{name}" özelliği bulunamadı.' },
  'features.invalid_category': { en: 'invalid category "{name}". Valid: {valid}', tr: 'geçersiz kategori "{name}". Geçerli: {valid}' },
  'features.empty_category': { en: '(no features in this category)', tr: '(bu kategoride özellik yok)' },
  'features.detail_feature': { en: 'Feature', tr: 'Özellik' },
  'features.detail_category': { en: 'Category', tr: 'Kategori' },
  'features.detail_label': { en: 'Label', tr: 'Etiket' },
  'features.detail_files': { en: 'Files', tr: 'Dosyalar' },
  'features.detail_description': { en: 'Description', tr: 'Açıklama' },
  'features.header_all': { en: 'All Categories', tr: 'Tüm Kategoriler' },
  'features.header_title': { en: 'Deckent Features — {category}', tr: 'Deckent Özellikleri — {category}' },
  'features.header_meta': { en: 'Sprint: {sprint} | Generated: {generated}', tr: 'Sprint: {sprint} | Oluşturma: {generated}' },
  'features.total': { en: 'Total: {count} features', tr: 'Toplam: {count} özellik' },
  'history.no_history': { en: 'No sprint history found.', tr: 'Sprint geçmişi bulunamadı.' },
  'history.no_match': { en: 'No matching sprint history found.', tr: 'Eşleşen sprint geçmişi bulunamadı.' },
  'config.set': { en: 'Set {key} = {value}', tr: '{key} = {value} olarak ayarlandı' },
  'config.invalid': { en: 'Invalid config: {errors}', tr: 'Geçersiz yapılandırma: {errors}' },
  'config.key_not_found': { en: 'Key not found: {key}', tr: 'Anahtar bulunamadı: {key}' },
  'config.exported': { en: 'Config exported to {path}', tr: 'Yapılandırma {path} dosyasına dışa aktarıldı' },
  'config.imported': { en: 'Config imported from {path}', tr: 'Yapılandırma {path} dosyasından içe aktarıldı' },
  'config.migrate_up_to_date': { en: 'Config is already up to date — no migration needed.', tr: 'Yapılandırma zaten güncel — geçiş gerekmiyor.' },
  'config.migrate_dry_run': { en: '[dry-run] Would add {count} missing field(s):', tr: '[dry-run] {count} eksik alan eklenecek:' },
  'config.migrate_complete': { en: 'Migration complete. Added {count} field(s):', tr: 'Geçiş tamamlandı. {count} alan eklendi:' },
  'config.migrate_backup': { en: 'Backup saved to: {path}', tr: 'Yedek kaydedildi: {path}' },
  'retro.none_found': { en: 'No retrospective found. Run `deckent start` to complete a sprint first.', tr: 'Retrospektif bulunamadı. Önce bir sprint tamamlamak için `deckent start` çalıştırın.' },
  'retro.no_previous_sprint': { en: 'No previous sprint found for comparison.', tr: 'Karşılaştırma için önceki sprint bulunamadı.' },
  'web.deprecated_use_serve': { en: 'Note: `deckent web` is deprecated — please use `deckent serve` instead.', tr: 'Not: `deckent web` kullanımdan kaldırıldı — bunun yerine `deckent serve` kullanın.' },
  'web.dev_server_hint': { en: 'Run \'cd src/dashboard && npm run dev\' for Vite dev server on port 5173', tr: 'Vite geliştirme sunucusu için 5173 portunda \'cd src/dashboard && npm run dev\' komutunu çalıştırın' },
  'web.dashboard_not_found': { en: 'Warning: bundled dashboard not found at {name}', tr: 'Uyarı: paketlenmiş panel {name} konumunda bulunamadı' },
  'web.build_dashboard_hint': { en: 'Run \'npm run build:dashboard\' (repo) or reinstall deckent. API still works.', tr: '\'npm run build:dashboard\' komutunu çalıştırın (repo) veya deckent\'i yeniden kurun. API yine de çalışır.' },
  'web.listening': { en: 'Deckent Web Dashboard on http://localhost:{name}', tr: 'Deckent Web Paneli http://localhost:{name} adresinde çalışıyor' },
  'dashboard.sprint_line': { en: 'Sprint: {id} (#{number})', tr: 'Sprint: {id} (#{number})' },
  'dashboard.phase_status': { en: 'Phase: {phase}  Status: {status}', tr: 'Faz: {phase}  Durum: {status}' },
  'dashboard.col_id': { en: 'ID', tr: 'ID' },
  'dashboard.col_task': { en: 'Task', tr: 'Görev' },
  'dashboard.col_status': { en: 'Status', tr: 'Durum' },
  'dashboard.col_elapsed': { en: 'Elapsed', tr: 'Geçen' },
  'dashboard.col_agent': { en: 'Agent', tr: 'Ajan' },
  'dashboard.col_skill': { en: 'Skill', tr: 'Yetenek' },
  'dashboard.progress': { en: '{done}/{total} done {active} active {blocked} pending', tr: '{done}/{total} tamam {active} aktif {blocked} bekliyor' },
  'dashboard.no_alerts': { en: 'No alerts.', tr: 'Uyarı yok.' },
  'dashboard.alerts_label': { en: 'Alerts:', tr: 'Uyarılar:' },
  'dashboard.no_active_sprint': { en: 'No active sprint. Run deckent start first.', tr: 'Aktif sprint yok. Önce `deckent start` çalıştırın.' },

  // ─── gateway connector ──────────────────────────────────────────────
  'gateway.unbound': {
    tr: 'Bu sohbet bir projeye bağlı değil. `/projects` ile listeyi gör, `/use <isim>` ile bağla.',
    en: 'This chat is not bound to a project. Use `/projects` to list, `/use <name>` to bind.',
  },
  'gateway.bound_ok': {
    tr: 'Bağlandı: {project}. Artık mesajların bu projeye gider.',
    en: 'Bound to {project}. Your messages now go to this project.',
  },
  'gateway.unbind_ok': {
    tr: 'Bağlantı kaldırıldı. `/use <isim>` ile yeniden bağla.',
    en: 'Unbound. Use `/use <name>` to bind again.',
  },
  'gateway.not_bound': {
    tr: 'Zaten bağlı değilsin.',
    en: 'Not bound to anything.',
  },
  'gateway.whoami': {
    tr: 'Bağlı proje: {project}',
    en: 'Bound project: {project}',
  },
  'gateway.projects_header': {
    tr: 'Kayıtlı projeler:',
    en: 'Registered projects:',
  },
  'gateway.projects_row': {
    tr: '• {name} — {path}',
    en: '• {name} — {path}',
  },
  'gateway.use_usage': {
    tr: 'Kullanım: /use <proje-ismi veya path>',
    en: 'Usage: /use <project-name or path>',
  },
  'gateway.use_unknown': {
    tr: 'Bilinmeyen proje: {name}. `/projects` ile listele.',
    en: 'Unknown project: {name}. List with `/projects`.',
  },

  // ─── gateway daemon lifecycle ───────────────────────────────────────
  'gateway.listen_active': {
    tr: 'Gateway dinleyici aktif: {connectors}',
    en: 'Gateway listener active: {connectors}',
  },
  'gateway.listen_none': {
    tr: 'Bağlantı kurulamadı — aktif connector yok.',
    en: 'No connectors active — gateway listener not started.',
  },
  'gateway.listen_stopped': {
    tr: 'Gateway dinleyici durduruldu.',
    en: 'Gateway listener stopped.',
  },
  'gateway.daemon_started': {
    tr: 'Gateway daemon başlatıldı (PID: {pid}). Oturum kapanınca devam eder.',
    en: 'Gateway daemon started (PID: {pid}). Continues after terminal close.',
  },
  'gateway.daemon_already': {
    tr: 'Gateway daemon zaten çalışıyor (PID: {pid}).',
    en: 'Gateway daemon already running (PID: {pid}).',
  },
  'gateway.daemon_stopped': {
    tr: 'Gateway daemon durduruldu (PID: {pid}).',
    en: 'Gateway daemon stopped (PID: {pid}).',
  },
  'gateway.daemon_not_running': {
    tr: 'Gateway daemon çalışmıyor.',
    en: 'Gateway daemon is not running.',
  },
  'gateway.daemon_status_running': {
    tr: 'Gateway daemon çalışıyor (PID: {pid}).',
    en: 'Gateway daemon running (PID: {pid}).',
  },
  'gateway.daemon_reboot_note': {
    tr: 'Not: Daemon, yeniden başlatmada otomatik başlamaz — OS supervisor (systemd/pm2) kurun.',
    en: 'Note: Daemon does not survive reboot automatically — set up an OS supervisor (systemd/pm2).',
  },
  'gateway.group_desc': {
    tr: 'Proje-kapsamlı mesajlaşma gateway (G1)',
    en: 'Project-scoped messaging gateway (G1)',
  },
  'gateway.runtime_desc': {
    tr: 'Dahili: bir projeye bağlı runtime child (supervisor spawn eder; doğrudan kullanım için değil)',
    en: 'Internal: per-project runtime child (spawned by the supervisor; not for direct use)',
  },
  'gateway.pair_approved': {
    tr: 'Eşleştirme onaylandı: {chatKey} → {project}',
    en: 'Pairing approved: {chatKey} → {project}',
  },
  'gateway.pair_unknown_code': {
    tr: 'Bilinmeyen eşleştirme kodu: {code}',
    en: 'Unknown pairing code: {code}',
  },
  'gateway.pair_rejected': {
    tr: 'Eşleştirme reddedildi: {code}',
    en: 'Pairing rejected: {code}',
  },
  'gateway.pair_list_empty': {
    tr: 'Bekleyen eşleştirme yok.',
    en: 'No pending pairings.',
  },
  'gateway.pair_list_row': {
    tr: '• {code} — {chatKey} ({requestedAt})',
    en: '• {code} — {chatKey} ({requestedAt})',
  },
  'gateway.pair_usage': {
    tr: 'Kullanım: deckent gateway pair approve <code> <project> | reject <code> | list',
    en: 'Usage: deckent gateway pair approve <code> <project> | reject <code> | list',
  },
  'gateway.pair_needed': {
    tr: 'Bu sohbet {project} için yetkili değil. Eşleştirme kodu: {code}. Sahibi şunu çalıştırsın: deckent gateway pair approve {code} {project}',
    en: 'This chat is not authorized for {project}. Pairing code: {code}. Ask the owner to run: deckent gateway pair approve {code} {project}',
  },

  // ─── capability: mail ────────────────────────────────────────────────
  'cap.mail.title': {
    en: 'Send email',
    tr: 'Mail gönder',
  },
  'cap.mail.recipient_denied': {
    en: 'Recipient not allowed by policy: {to}',
    tr: 'Alıcı policy ile izinli değil: {to}',
  },
  'cap.mail.smtp_missing': {
    en: 'SMTP is not configured in .deck.',
    tr: 'SMTP .deck\'te yapılandırılmamış.',
  },
  'cap.mail.sent': {
    en: 'Mail sent to {to} · {subject} ({id})',
    tr: 'Mail gönderildi: {to} · {subject} ({id})',
  },
  'cap.mail.failed': {
    en: 'Mail failed: {error}',
    tr: 'Mail başarısız: {error}',
  },
  'cap.mail.preview': {
    en: '📧 *Send email*\n*To:* {to}\n*Subject:* {subject}\n*Body:* {body}',
    tr: '📧 *Mail gönderilecek*\n*Kime:* {to}\n*Konu:* {subject}\n*Gövde:* {body}',
  },
  'cap.mail.attach_unknown': {
    en: 'Attachment not found: {id}',
    tr: 'Ek bulunamadı: {id}',
  },
  'cap.mail.preview_attach': {
    en: '*Attachment:* {files}',
    tr: '*Ek:* {files}',
  },

  // ─── capability: gate (dispatcher-level policy messages) ────────────
  'cap.gate.unavailable': {
    en: "Capability '{id}' is not available.",
    tr: "'{id}' yeteneği kullanılamıyor.",
  },
  'cap.gate.denied': {
    en: "Capability '{id}' is denied by policy.",
    tr: "'{id}' yeteneği policy ile reddedildi.",
  },
  'cap.approval.ack': {
    en: 'Approval requested for {cap}; awaiting the user\'s decision.',
    tr: '{cap} için onay istendi; kullanıcının kararı bekleniyor.',
  },
  'cap.approval.header': {
    en: 'Approval required — not executed',
    tr: 'Onay gerekli — çalıştırılmadı',
  },
  'cap.btn.approve': {
    en: '✅ Approve',
    tr: '✅ Onayla',
  },
  'cap.btn.reject': {
    en: '❌ Reject',
    tr: '❌ Reddet',
  },
  'cap.approval.approved': {
    en: '✅ Approved — {result}',
    tr: '✅ Onaylandı — {result}',
  },
  'cap.approval.rejected': {
    en: '❌ Rejected',
    tr: '❌ Reddedildi',
  },

  // ─── capability: screenshot ──────────────────────────────────────────
  'cap.screenshot.title': {
    en: 'Screenshot',
    tr: 'Ekran görüntüsü',
  },
  'cap.screenshot.unsupported': {
    en: 'Screenshot is not supported on this platform.',
    tr: 'Bu platformda ekran görüntüsü desteklenmiyor.',
  },
  'cap.screenshot.failed': {
    en: 'Screenshot failed: {error}',
    tr: 'Ekran görüntüsü başarısız: {error}',
  },
  'cap.screenshot.caption': {
    en: 'Screen capture',
    tr: 'Ekran yakalandı',
  },
  'cap.screenshot.preview': {
    en: 'capture {display} display',
    tr: '{display} ekranı yakala',
  },
  'cap.media.fallback': {
    en: '[media: {filename} — this connector cannot display it]',
    tr: '[medya: {filename} — bu connector gösteremiyor]',
  },

  // ─── Inbound media artifact attachment notice (Task 8 — inbound media → artifact) ──
  'cap.inbound.attached': {
    en: '[attached: {id}, {filename}]',
    tr: '[ek: {id}, {filename}]',
  },

  // ─── Voice wiring (Task 11 — inbound STT → turn, reply-in-kind TTS) ─────────
  'voice.transcribe.error': {
    en: '[voice: transcription unavailable — sending voice note as text]',
    tr: '[ses: transkripsiyon mevcut değil — ses notu metin olarak gönderildi]',
  },
  'voice.tts.error': {
    en: '[voice: synthesis failed — sending reply as text]',
    tr: '[ses: sentez başarısız — yanıt metin olarak gönderildi]',
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
  if (!entry) {
    if (process.env['NODE_ENV'] !== 'production') {
      process.stderr.write(`[getMessage] missing i18n key: "${key}" (lang: ${lang})\n`);
    }
    return key;
  }

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
