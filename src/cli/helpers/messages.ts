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
    tr: '`deckent start` ile run\'ı başlatın',
    en: 'Run `deckent start` to begin the run',
  },
  // IDLE phase
  'hint.IDLE': {
    tr: '`deckent plan` ile run planlayın',
    en: 'Run `deckent plan` to plan a run',
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

  // ─── catalog network policy (SEC-04, task 418-003) ────────────────────
  'catalog.network_fetch_notice': {
    en: 'Fetching the latest model catalog from models.dev… (set DECKENT_OFFLINE=1 to skip)',
    tr: 'Güncel model kataloğu models.dev üzerinden alınıyor… (atlamak için DECKENT_OFFLINE=1 ayarlayın)',
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
    en: 'Run {number} (sprint) ({id}) planned — {count} tasks:',
    tr: 'Run {number} (sprint) ({id}) planlandı — {count} görev:',
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

  // ─── run command (RUN-CLI-ALIAS, Sprint 378 — 378-001) ───────────────
  'run.alias_note': {
    en: "Note: 'run start|status|retro|history' are aliases for the top-level "
      + "'deckent start|status|retro|history' commands — identical behavior, same handler. "
      + "'sprint' terminology is being renamed to 'run'.",
    tr: "Not: 'run start|status|retro|history', üst-düzey 'deckent start|status|retro|history' "
      + "komutlarının takma adıdır — davranış ve işleyici birebir aynıdır. "
      + "'sprint' terimi 'run' olarak yeniden adlandırılıyor.",
  },

  // ─── plan command ───────────────────────────────────────────────────
  'plan.sprint_planned': {
    en: 'Run {number} (sprint) ({id}) planned with {count} tasks:',
    tr: 'Run {number} (sprint) ({id}) {count} görevle planlandı:',
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
    en: 'Note: Run (sprint) size {size} — {reason}',
    tr: 'Not: Run (sprint) boyutu {size} — {reason}',
  },
  'plan.approved': {
    en: 'Plan approved.',
    tr: 'Plan onaylandı.',
  },
  'plan.rejected': {
    en: 'Plan rejected.',
    tr: 'Plan reddedildi.',
  },
  'plan.prompt_gate_header': {
    en: 'Prompt-gate — {count} finding(s) (persona × intent / decision-space / scope-contract):',
    tr: 'Prompt-gate — {count} bulgu (persona × intent / karar-alanı / kapsam-kontratı):',
  },
  'plan.prompt_gate_blocked': {
    en: 'Plan blocked by prompt-gate: {count} BLOCK finding(s). Review the findings above (persona / scope-silent-drop / scope-satisfiability), fix the DIRECTIVES accordingly, or re-run with --force-prompt-gate.',
    tr: 'Plan prompt-gate tarafından bloke edildi: {count} BLOCK bulgusu. Yukarıdaki bulguları inceleyin (persona / scope-silent-drop / scope-satisfiability), DIRECTIVES\'i buna göre düzeltin ya da --force-prompt-gate ile yeniden koşun.',
  },
  'plan.prompt_gate_override': {
    en: 'Prompt-gate BLOCK bypassed via --force-prompt-gate ({count}).',
    tr: 'Prompt-gate BLOCK --force-prompt-gate ile atlandı ({count}).',
  },
  'plan.override_warnings_header': {
    en: 'Override warnings — {count} warning(s) (forceAgent/forceSkills routing overrides — advisory, plan proceeds):',
    tr: 'Override uyarıları — {count} uyarı (forceAgent/forceSkills routing override\'ları — bilgilendirme, plan devam eder):',
  },

  // ─── run-flow plan-preview card (TERM-FLOW-UNIFY Sprint-3 dilim, 425-001) ──
  // plan-preview-card.tsx's PlanPreviewCardLabels, sourced via buildPlanPreviewCardLabels(lang).
  'runFlow.planPreview.heading': {
    en: 'Plan preview — approve to continue',
    tr: 'Plan önizlemesi — devam etmek için onayla',
  },
  'runFlow.planPreview.digestLabel': {
    en: 'Digest:',
    tr: 'Özet-imza:',
  },
  'runFlow.planPreview.gate.pass': {
    en: 'GATE: PASS',
    tr: 'GATE: GEÇTİ',
  },
  'runFlow.planPreview.gate.fail': {
    en: 'GATE: FAIL',
    tr: 'GATE: BAŞARISIZ',
  },
  'runFlow.planPreview.gate.skipped': {
    en: 'GATE: SKIPPED',
    tr: 'GATE: ATLANDI',
  },
  'runFlow.planPreview.policy.allow': {
    en: 'POLICY: ALLOW',
    tr: 'POLİTİKA: İZİN VER',
  },
  'runFlow.planPreview.policy.deny': {
    en: 'POLICY: DENY',
    tr: 'POLİTİKA: REDDET',
  },
  'runFlow.planPreview.policy.needsApproval': {
    en: 'POLICY: NEEDS APPROVAL',
    tr: 'POLİTİKA: ONAY GEREKLİ',
  },
  'runFlow.planPreview.hint': {
    en: '(y = approve · n = reject · d = details)',
    tr: '(y = onayla · n = reddet · d = detay)',
  },
  'runFlow.planPreview.detailsHeading': {
    en: 'Details',
    tr: 'Detay',
  },
  'runFlow.planPreview.noTasks': {
    en: '(no tasks)',
    tr: '(görev yok)',
  },

  // ─── run-flow REPL mount outcomes (TERM-FLOW-UNIFY Sprint-4 mount, 426-002) ─
  // Pushed as a 'bg' transcript line after approve→start / reject on the
  // PlanPreviewCard — buildRunFlowMountLabels(t) in run.tsx.
  'runFlow.mount.started': {
    en: 'Run started — job {jobId}.',
    tr: 'Run başlatıldı — iş {jobId}.',
  },
  'runFlow.mount.rejected': {
    en: 'Run proposal rejected.',
    tr: 'Run önerisi reddedildi.',
  },
  'runFlow.mount.error': {
    en: 'Run flow error: {error}',
    tr: 'Run akışı hatası: {error}',
  },

  // ─── run-flow correlated result-turn (TERM5-UI, sprint-427 task 6) ────────
  // A flowId-correlated job completion pushed as a rich 'bg' transcript turn
  // (verdict-summary + flowId) — buildRunFlowResultLabels(t) in run.tsx.
  'runFlow.result.completed': {
    en: 'Run {flowId} completed — {done}/{total} DONE · {techDebt} TECH_DEBT · {noGo} NO_GO',
    tr: 'Run {flowId} tamamlandı — {done}/{total} DONE · {techDebt} TECH_DEBT · {noGo} NO_GO',
  },
  'runFlow.result.failed': {
    en: 'Run {flowId} failed: {error}',
    tr: 'Run {flowId} başarısız: {error}',
  },
  // SURF-3 result-evidence — per-task evidence lines below the aggregate header.
  'runFlow.result.evidence_files': {
    en: ' — {files} files · +{added}/-{removed}',
    tr: ' — {files} dosya · +{added}/-{removed}',
  },
  'runFlow.result.evidence_tests': {
    en: ' · tests {mark}{coverage}',
    tr: ' · test {mark}{coverage}',
  },
  'runFlow.result.evidence_more': {
    en: '  … {n} more',
    tr: '  … {n} daha',
  },

  // ─── status command ─────────────────────────────────────────────────
  'status.no_active_sprint': {
    en: 'No active sprint. Run `deckent start` first.',
    tr: 'Aktif sprint yok. Önce `deckent start` çalıştırın.',
  },
  'status.pending_approvals.header': {
    en: '⏳ Pending approvals: {count} — act in the run terminal or the dashboard:',
    tr: '⏳ Bekleyen onaylar: {count} — run terminalinde veya dashboard\'tan onayla:',
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
  'cleanup.pruned_expired_approvals': {
    en: '{count} expired pending approval(s) pruned (their timeout passed — no longer actionable).',
    tr: '{count} süresi geçmiş bekleyen onay temizlendi (zaman aşımı doldu — artık işlem yapılamaz).',
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
    en: 'Run {sprintId} (sprint) finalized: {total} tasks ({done} done, {debt} debt, {noGo} no-go). MEMORY.md, RETRO.md, and config updated.',
    tr: 'Run {sprintId} (sprint) sonlandırıldı: {total} görev ({done} tamam, {debt} borç, {noGo} no-go). MEMORY.md, RETRO.md ve config güncellendi.',
  },

  // ─── doctor command ──────────────────────────────────────────────────
  'doctor.checks_passed': {
    en: 'Result: {passed}/{total} checks passed',
    tr: 'Sonuç: {passed}/{total} kontrol geçti',
  },

  // ─── doctor: daemon hygiene (B-ZOMBIE i18n-centralization, Task 333-010) ──
  'doctor.daemon_header': {
    en: 'Daemon Hygiene:',
    tr: 'Daemon Hijyeni:',
  },
  'doctor.daemon_clean': {
    en: 'No stale deckent daemons detected.',
    tr: 'Eskimiş deckent daemon süreci bulunamadı.',
  },
  'doctor.daemon_found': {
    en: '{count} stale deckent daemon(s) detected (advisory — deckent never auto-kills):',
    tr: '{count} eskimiş deckent daemon süreci bulundu (tavsiye — deckent asla otomatik öldürmez):',
  },
  'doctor.daemon_entry': {
    en: 'PID {pid} — {kind}, running for {age}',
    tr: 'PID {pid} — {kind}, {age} süredir çalışıyor',
  },
  'doctor.daemon_kill_hint': {
    en: 'To stop them, run: {killCmd}   (Windows: {winKillCmd})',
    tr: 'Durdurmak için çalıştırın: {killCmd}   (Windows: {winKillCmd})',
  },
  'doctor.daemon_unsupported': {
    en: 'Process listing not supported on {platform} — stale-daemon check skipped.',
    tr: '{platform} platformunda süreç listeleme desteklenmiyor — eskimiş daemon kontrolü atlandı.',
  },
  'doctor.daemon_check_failed': {
    en: 'Could not list processes — stale-daemon check skipped (advisory).',
    tr: 'Süreç listesi alınamadı — eskimiş daemon kontrolü atlandı (tavsiye).',
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

  // ─── doctor: honest ready/missing/one-command-fix summary (ONB-HONEST, Sprint 357 — 357-014) ──
  'doctor.honest_header': {
    en: 'Honest Summary:',
    tr: 'Dürüst Özet:',
  },
  'doctor.honest_all_ready': {
    en: '{ready} ready — you are all set!',
    tr: '{ready} hazır — her şey tamam!',
  },
  'doctor.honest_summary_with_fix': {
    en: '{ready} ready · {missing} missing ({fixable} fixed by `deckent doctor --fix`)',
    tr: '{ready} hazır · {missing} eksik ({fixable}\'i `deckent doctor --fix` ile düzelir)',
  },
  'doctor.honest_summary_no_fix': {
    en: '{ready} ready · {missing} missing',
    tr: '{ready} hazır · {missing} eksik',
  },
  'doctor.honest_missing_line': {
    en: '  - {name}: {explanation}',
    tr: '  - {name}: {explanation}',
  },
  'doctor.honest_fixable_suffix': {
    en: ' (fixed automatically by `deckent doctor --fix`)',
    tr: ' (`deckent doctor --fix` ile otomatik düzelir)',
  },
  'doctor.honest_explain_generic': {
    en: '{name} needs attention: {message}',
    tr: '{name} dikkat gerektiriyor: {message}',
  },
  'doctor.honest_explain_platform': {
    en: 'Your operating system is not fully supported yet.',
    tr: 'İşletim sisteminiz henüz tam olarak desteklenmiyor.',
  },
  'doctor.honest_explain_node': {
    en: 'Node.js is missing or too old — deckent needs it to run.',
    tr: 'Node.js kurulu değil veya çok eski — deckent\'in çalışması için gerekli.',
  },
  'doctor.honest_explain_git': {
    en: 'git is not installed — deckent uses it for safe rollbacks and history.',
    tr: 'git kurulu değil — deckent güvenli geri-alma ve geçmiş için kullanır.',
  },
  'doctor.honest_explain_tmux': {
    en: 'tmux is not installed — needed to run Claude-based runs.',
    tr: 'tmux kurulu değil — Claude tabanlı runları çalıştırmak için gerekli.',
  },
  'doctor.honest_explain_docker': {
    en: 'Docker is not ready — needed for isolated worker containers.',
    tr: 'Docker hazır değil — izole worker konteynerleri için gerekli.',
  },
  'doctor.honest_explain_claude_cli': {
    en: 'The Claude CLI is missing or you are not logged in.',
    tr: 'Claude CLI kurulu değil veya oturum açılmamış.',
  },
  'doctor.honest_explain_workspace': {
    en: 'This project has not been initialized yet.',
    tr: 'Bu proje henüz başlatılmamış.',
  },
  'doctor.honest_explain_brain_dir': {
    en: 'deckent\'s memory folder is missing or incomplete.',
    tr: 'deckent\'in hafıza klasörü eksik veya tamamlanmamış.',
  },
  'doctor.honest_explain_directives': {
    en: 'No run goals have been defined yet.',
    tr: 'Henüz run hedefleri tanımlanmamış.',
  },
  'doctor.honest_explain_brain_budget': {
    en: 'deckent\'s memory has grown past its healthy size.',
    tr: 'deckent\'in hafızası sağlıklı boyutunu aştı.',
  },
  'doctor.honest_explain_debt': {
    en: 'There are unresolved critical issues from past runs.',
    tr: 'Geçmiş runlardan çözülmemiş kritik sorunlar var.',
  },
  'doctor.honest_explain_locks': {
    en: 'Some old task locks were left behind and need cleanup.',
    tr: 'Bazı eski görev kilitleri temizlenmeyi bekliyor.',
  },
  'doctor.honest_explain_deck_security': {
    en: 'Your secrets file may be exposed in git history.',
    tr: 'Gizli bilgiler dosyanız git geçmişinde açığa çıkmış olabilir.',
  },
  'doctor.honest_explain_write_permissions': {
    en: 'deckent cannot write to its own working folders.',
    tr: 'deckent kendi çalışma klasörlerine yazamıyor.',
  },
  'doctor.honest_explain_gitignore': {
    en: 'Sensitive database files are not properly ignored by git.',
    tr: 'Hassas veritabanı dosyaları git tarafından düzgün yok sayılmıyor.',
  },

  // ─── doctor: subprocess .deck visibility (SEC-02, ADR-G-005, Task 411-002) ──
  'doctor.deck_subprocess_visibility_warn': {
    en: 'subprocess workers can read .deck from disk — use the docker backend (shadowed) for sensitive environments.',
    tr: 'subprocess worker\'lar .deck\'i okuyabilir; hassas ortamda docker backend (shadow\'lu) kullanın.',
  },
  'doctor.deck_subprocess_visibility_ok': {
    en: '.deck subprocess visibility: not applicable',
    tr: '.deck subprocess görünürlüğü: uygulanamaz',
  },

  // ─── doctor: platform profile (ONB-2-DILIM-3, Sprint 368 — 368-002) ──
  'doctor.platform_profile_header': {
    en: 'Platform Profile:',
    tr: 'Platform Profili:',
  },
  'doctor.platform_profile_line': {
    en: '{platform} — {label}',
    tr: '{platform} — {label}',
  },
  'doctor.platform_profile_adapted_header': {
    en: 'Platform-specific check adaptations (no silent skips):',
    tr: 'Platforma özgü check uyarlamaları (sessiz-geçiş yok):',
  },
  'doctor.platform_adapt_tmux': {
    en: 'tmux is not natively available on Windows — the tmux requirement is skipped on this platform (use WSL2, or set spawn_backend to docker/subprocess for full support).',
    tr: 'tmux Windows\'ta yerel olarak mevcut değil — tmux gereksinimi bu platformda atlanıyor (WSL2 kullanın veya tam destek için spawn_backend\'i docker/subprocess yapın).',
  },
  'doctor.platform_adapt_permissions': {
    en: 'Windows uses NTFS ACLs, not POSIX permission bits — a chmod-based restriction (e.g. owner-only 0600) is not enforced the same way; write-access checks still work but cannot guarantee equivalent protection.',
    tr: 'Windows POSIX izin bitleri yerine NTFS ACL\'leri kullanır — chmod-tabanlı bir kısıtlama (örn. yalnız-sahip 0600) aynı şekilde uygulanmaz; yazma-erişim kontrolleri çalışır ama eşdeğer koruma garanti edilmez.',
  },
  'doctor.platform_adapt_paths': {
    en: 'Windows uses backslash path separators — checks that compare literal path strings (e.g. .gitignore entries) may behave differently even though internal path handling is normalized.',
    tr: 'Windows ters-eğik-çizgi yol ayırıcıları kullanır — dahili yol işleme normalize edilmiş olsa da, literal yol dizesi karşılaştıran kontroller (örn. .gitignore girdileri) farklı davranabilir.',
  },
  // checkTmux "not required" reason labels (369-002, DOCTOR-FOLLOWUPS — honest-label fix
  // for the win32 branch, which used to fall through to "subprocess backend" even with
  // no spawn_backend override configured).
  'doctor.tmux_not_required_docker': {
    en: 'not required (docker backend)',
    tr: 'gerekli değil (docker backend)',
  },
  'doctor.tmux_not_required_subprocess': {
    en: 'not required (subprocess backend)',
    tr: 'gerekli değil (subprocess backend)',
  },
  'doctor.tmux_not_required_win32': {
    en: 'not required (Windows — tmux not supported natively)',
    tr: 'gerekli değil (Windows — tmux yerel olarak desteklenmiyor)',
  },
  'doctor.platform_label_win32_native': {
    en: 'Windows (native)',
    tr: 'Windows (native)',
  },
  'doctor.platform_label_wsl': {
    en: 'WSL2/Linux (fully supported)',
    tr: 'WSL2/Linux (tam destekli)',
  },
  'doctor.platform_label_linux': {
    en: 'Linux (fully supported)',
    tr: 'Linux (tam destekli)',
  },
  'doctor.platform_label_darwin': {
    en: 'macOS (fully supported)',
    tr: 'macOS (tam destekli)',
  },
  'doctor.platform_label_untested': {
    en: '{platform} (untested — may work)',
    tr: '{platform} (test edilmedi — çalışabilir)',
  },

  // ─── doctor: config-based auth state (ONB-2-DILIM-3, Sprint 368 — 368-002) ──
  'doctor.auth_state_header': {
    en: 'Auth State (config-based, no network):',
    tr: 'Auth Durumu (config-tabanlı, ağ-çağrısı yok):',
  },
  'doctor.auth_state_connected': {
    en: '{provider}: connected',
    tr: '{provider}: bağlı',
  },
  'doctor.auth_state_missing': {
    en: '{provider}: missing',
    tr: '{provider}: eksik',
  },
  'doctor.auth_state_unknown': {
    en: '{provider}: unknown',
    tr: '{provider}: bilinmiyor',
  },

  // ─── mode command (MODE-HELP-FIX, Sprint 376 — 376-002) ──────────────
  'mode.group_desc': {
    en: 'Get/set deckent_style (run (sprint) | task | process)',
    tr: 'deckent_style al/ayarla (run (sprint) | task | process)',
  },
  'mode.run_desc': {
    en: 'Switch to run mode (bridge alias — stores deckent_style: "sprint")',
    tr: 'Run moduna geç (köprü-alias — deckent_style: "sprint" olarak saklanır)',
  },
  'mode.run_switched': {
    en: '\u2713 Switched to run mode (stored as "sprint" — bridge alias)',
    tr: '\u2713 Run moduna geçildi ("sprint" olarak saklandı — köprü-alias)',
  },
  'mode.rename_note': {
    en: "Note: 'sprint' will soon be renamed to 'run' (naming decision pending rollout).",
    tr: "Not: 'sprint' yakında 'run' olarak anılacak (isimlendirme kararı, uygulanması bekleniyor).",
  },
  'mode.show_desc': {
    en: 'Show current mode',
    tr: 'Mevcut modu göster',
  },
  'mode.sprint_desc': {
    en: 'Switch to sprint mode',
    tr: 'Sprint moduna geç',
  },
  'mode.task_desc': {
    en: 'Switch to task mode',
    tr: 'Task moduna geç',
  },
  'mode.process_desc': {
    en: 'Switch to process mode (continuous request-handling — ERP / automation via MCP + REST)',
    tr: 'Process moduna geç (sürekli istek-işleme — ERP / otomasyon, MCP + REST üzerinden)',
  },
  'mode.auto_desc': {
    en: 'Auto-detect mode from context',
    tr: 'Bağlamdan modu otomatik algıla',
  },
  'mode.global_desc': {
    en: 'Set global default (sprint|task|process)',
    tr: 'Genel varsayılanı ayarla (sprint|task|process)',
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
  'analyze.vocabulary_bootstrap': {
    en: 'Routing vocabulary bootstrap: {count} project domain(s) derived — {status} ({path})',
    tr: 'Routing sözlük-bootstrap: {count} proje-domain\'i türetildi — {status} ({path})',
  },
  // ─── agent lint (ROUTING-V3 Slice-1, 446) ────────────────────────────
  'agent.lint.header': {
    en: 'Agent catalog lint (V3 capabilities) — {agents} agents × {cells} sweep cells',
    tr: 'Agent katalog lint\'i (V3 capabilities) — {agents} agent × {cells} tarama-hücresi',
  },
  'agent.lint.no_capabilities': {
    en: '{count} agent(s) carry no capabilities block (excluded from the sweep): {ids}',
    tr: '{count} agent capabilities bloğu taşımıyor (taramaya girmedi): {ids}',
  },
  'agent.lint.unreachable': {
    en: 'UNREACHABLE: {agentId} — never wins a sweep cell. Nearest miss: {detail}',
    tr: 'ERİŞİLEMEZ: {agentId} — hiçbir tarama-hücresini kazanamıyor. En yakın kaçış: {detail}',
  },
  'agent.lint.gap': {
    en: 'GAP: {workType} × {domain} — no capable agent ({reasons})',
    tr: 'BOŞLUK: {workType} × {domain} — yetkin agent yok ({reasons})',
  },
  'agent.lint.overlap': {
    en: 'OVERLAP: {a} <-> {b} — {pct}% capability similarity (differentiate or merge)',
    tr: 'ÖRTÜŞME: {a} <-> {b} — %{pct} yetkinlik-benzerliği (ayrıştırın ya da birleştirin)',
  },
  'agent.lint.clean': {
    en: 'Catalog clean: every agent reachable, no coverage gaps.',
    tr: 'Katalog temiz: tüm agent\'lar erişilebilir, kapsama boşluğu yok.',
  },
  // ─── checkpoint command (MSG-003, §4G) ───────────────────────────────
  'checkpoint.list_empty': {
    en: 'No checkpoints found.',
    tr: 'Checkpoint bulunamadı.',
  },
  'checkpoint.col_sprint': { en: 'Run', tr: 'Run' },
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
    en: '  2. Run `deckent start` to begin your first run',
    tr: '  2. İlk run\'ı başlatmak için `deckent start` çalıştırın',
  },

  // ─── init outcome contract (RC2-A / INIT-01, Sprint 412 — 412-001) ──────
  'init.outcome_header': {
    en: 'Setup outcome: {outcome}',
    tr: 'Kurulum sonucu: {outcome}',
  },
  'init.outcome_ready_message': {
    en: 'All usage blockers are clear — a provider and the required checks are in place.',
    tr: 'Tüm kullanım engelleri temizlendi — bir provider ve zorunlu kontroller yerinde.',
  },
  'init.outcome_setup_incomplete_message': {
    en: 'Setup files were written, but deckent cannot run tasks yet — resolve the following first:',
    tr: 'Kurulum dosyaları yazıldı, ama deckent henüz görev çalıştıramaz — önce şunların çözülmesi gerekiyor:',
  },
  'init.outcome_failed_message': {
    en: 'Init did not complete — see the failed step(s) above, fix the issue, then retry.',
    tr: 'Init tamamlanamadı — yukarıdaki başarısız adım(lar)ı görün, sorunu düzeltin, sonra tekrar deneyin.',
  },
  'init.outcome_blockers_header': {
    en: 'Blockers:',
    tr: 'Engeller:',
  },
  'init.outcome_fix_label': {
    en: 'Fix',
    tr: 'Çözüm',
  },
  'init.outcome_blocker_no_provider': {
    en: 'No AI provider CLI was detected (Claude, Codex, or Gemini) — deckent has no provider to execute tasks with.',
    tr: 'Hiçbir AI provider CLI algılanmadı (Claude, Codex veya Gemini) — deckent\'in görev çalıştıracağı bir provider yok.',
  },
  'init.outcome_remediation_no_provider': {
    en: 'Install a provider CLI and authenticate, e.g.: {cmd}',
    tr: 'Bir provider CLI kurup oturum açın, örn.: {cmd}',
  },
  'init.outcome_blocker_doctor_check': {
    en: '{name} check failed: {message}',
    tr: '{name} kontrolü başarısız: {message}',
  },
  'init.outcome_remediation_doctor_check': {
    en: 'Run `deckent doctor` for full diagnostics and fix hints.',
    tr: 'Tam tanı ve çözüm ipuçları için `deckent doctor` çalıştırın.',
  },
  'init.outcome_blocker_doctor_verification_failed': {
    en: 'Could not verify environment health — the doctor check step itself failed ({error}).',
    tr: 'Ortam sağlığı doğrulanamadı — doctor kontrol adımının kendisi başarısız oldu ({error}).',
  },
  'init.outcome_remediation_doctor_verification_failed': {
    en: 'Run `deckent doctor` manually to see the full report.',
    tr: 'Tam raporu görmek için `deckent doctor` komutunu elle çalıştırın.',
  },

  // ─── init: non-interactive environment guard (RC2C / born-652, Sprint 413 — 413-001) ──
  'init.non_interactive_requires_yes': {
    en: 'Non-interactive environment detected (no TTY on stdin) — re-run with `deckent init --yes` for an unattended setup.',
    tr: 'Etkileşimsiz (non-interactive) ortam algılandı (stdin bir TTY değil) — insansız kurulum için `deckent init --yes` ile tekrar çalıştırın.',
  },

  // ─── init: .deck security-file write failure (RC1-A follow-up, i18n-gate) ──
  'init.deck_security_write_failed': {
    en: 'WARN: failed to write .deck security files: {error}',
    tr: 'UYARI: .deck güvenlik dosyaları yazılamadı: {error}',
  },

  // ─── init: backend transaction — CLI+daemon (RC2-B / INIT-02, Sprint 412 — 412-002) ──
  'init.docker_backend_selected': {
    en: 'Docker CLI + daemon detected → spawn_backend: docker (isolated worker containers)',
    tr: 'Docker CLI + daemon algılandı → spawn_backend: docker (izole worker container\'ları)',
  },
  'init.docker_image_missing_hint': {
    en: 'deckent-worker image not found — build with:',
    tr: 'deckent-worker imajı bulunamadı — şu komutla derleyin:',
  },
  'init.docker_daemon_down_fallback': {
    en: 'Docker CLI found, but the daemon is not running — fell back to the subprocess backend (deckent still works). To use Docker: start the daemon (e.g. `sudo systemctl start docker` on Linux, or open Docker Desktop), then run `deckent config set spawn_backend docker`.',
    tr: 'Docker CLI bulundu ama daemon çalışmıyor — subprocess backend\'e düşüldü (deckent yine de çalışır). Docker kullanmak için: daemon\'ı başlatın (Linux\'ta örn. `sudo systemctl start docker`, ya da Docker Desktop\'ı açın), sonra `deckent config set spawn_backend docker` çalıştırın.',
  },
  'init.docker_image_decline_fallback': {
    en: 'Worker image not built — fell back to the subprocess backend (deckent still works). To use Docker: build the image ({cmd}), then run `deckent config set spawn_backend docker`.',
    tr: 'Worker imajı derlenmedi — subprocess backend\'e düşüldü (deckent yine de çalışır). Docker kullanmak için: imajı derleyin ({cmd}), sonra `deckent config set spawn_backend docker` çalıştırın.',
  },
  'init.docker_image_build_failed_fallback': {
    en: 'Worker image build failed — fell back to the subprocess backend (deckent still works). Fix the build error, run `{cmd}` again, then `deckent config set spawn_backend docker`.',
    tr: 'Worker imaj derlemesi başarısız oldu — subprocess backend\'e düşüldü (deckent yine de çalışır). Derleme hatasını düzeltin, `{cmd}` komutunu tekrar çalıştırın, sonra `deckent config set spawn_backend docker` çalıştırın.',
  },

  // ─── evolve command ─────────────────────────────────────────────────
  'evolve.no_sprint_data': {
    en: 'No sprint data found. Run some sprints first to see evolution trends.',
    tr: 'Sprint verisi bulunamadı. Evrim trendlerini görmek için önce birkaç sprint çalıştırın.',
  },
  'evolve.report_header': {
    en: '\nEvolution Report — {count} sprints analyzed\n',
    tr: '\nEvrim Raporu — {count} sprint analiz edildi\n',
  },
  'evolve.nogo_trend': {
    en: 'NO_GO trend: {icon} {direction}',
    tr: 'NO_GO trendi: {icon} {direction}',
  },
  'evolve.agent_trends': {
    en: 'Agent Trends:',
    tr: 'Ajan Trendleri:',
  },
  'evolve.skill_trends': {
    en: 'Skill Trends:',
    tr: 'Yetenek Trendleri:',
  },

  // ─── sync command ────────────────────────────────────────────────────
  'sync.deckent_not_found': {
    en: 'DECKENT.md not found. Run deckent init first.',
    tr: 'DECKENT.md bulunamadı. Önce deckent init çalıştırın.',
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
    en: 'DIRECTIVES.md not found. Create it with run goals, or run: deckent init',
    tr: 'DIRECTIVES.md bulunamadi. Run hedeflerinizi yazin veya calistirin: deckent init',
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
    en: 'Usage threshold reached. Run has been auto-paused.',
    tr: 'Kullanim esigi asildi. Run otomatik olarak duraklatildi.',
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
  'native.empty-response': {
    en: 'model returned an empty response — its context window may be full; try again or switch model (/model)',
    tr: 'model boş yanıt döndü — context penceresi dolmuş olabilir; tekrar deneyin veya model değiştirin (/model)',
  },
  'native.truncated': {
    en: 'response truncated — the model hit its output/context token limit',
    tr: 'yanıt kesildi — model çıktı/context token limitine takıldı',
  },
  'native.context-compacted': {
    en: 'context window near its limit — oldest messages were compacted to keep the session responsive',
    tr: 'context penceresi limite yaklaştı — oturum yanıt verebilsin diye en eski mesajlar sıkıştırıldı',
  },
  'native.switch.missing-api-key': {
    en: 'switch failed — {provider} needs an API key: set {detail}',
    tr: 'geçiş başarısız — {provider} için API anahtarı gerekli: {detail} tanımlayın',
  },
  'native.switch.missing-ollama-host': {
    en: 'switch failed — ollama needs a host: set {detail} in .deckent/config.json',
    tr: 'geçiş başarısız — ollama için host gerekli: .deckent/config.json içinde {detail} tanımlayın',
  },
  'native.switch.unsupported-native-provider': {
    en: 'switch failed — "{detail}" has no native tool-use transport; valid: claude, openai, ollama, deepseek, qwen, glm',
    tr: 'geçiş başarısız — "{detail}" için native tool-use transport yok; geçerli: claude, openai, ollama, deepseek, qwen, glm',
  },
  // REPL-575 K6 — an unrecognized non-claude model id refused instead of shipped
  // at the Anthropic transport with a false 'switched' report.
  'native.switch.unknown-model': {
    en: 'switch failed — unknown model "{detail}": not a recognized claude model (try opus/sonnet/haiku/fable, or switch provider first)',
    tr: 'geçiş başarısız — bilinmeyen model "{detail}": tanınan bir claude modeli değil (opus/sonnet/haiku/fable deneyin ya da önce sağlayıcı değiştirin)',
  },
  // native-transport.ts:247 produces errorCode 'no-transport' when detectTransport
  // finds nothing configured at all — this key was missing, so localizeNativeError
  // (run.tsx) fell back to the raw (Turkish-hardcoded, provider-detect.ts) reason
  // string regardless of `lang` (Task 387-001).
  'native.switch.no-transport': {
    en: 'switch failed — no native transport configured: set ANTHROPIC_API_KEY / OPENAI_API_KEY / openai_base_url / ollama_host',
    tr: 'geçiş başarısız — native transport tanımlı değil: ANTHROPIC_API_KEY / OPENAI_API_KEY / openai_base_url / ollama_host tanımlayın',
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
  'chat.mcp_client_disabled': {
    en: 'MCP servers are configured but the external MCP client is disabled. Set "mcp_client_enabled": true in .deckent/config.json to connect them.',
    tr: 'MCP sunucuları yapılandırılmış ama harici MCP istemcisi kapalı. Bağlanmak için .deckent/config.json içinde "mcp_client_enabled": true ayarlayın.',
  },
  // born-697 (SURF-3 approval last-mile) — visible closure line for a terminal
  // approve/deny. Param-free of `{result}` (the worker runs cross-process async,
  // so no result is known at decision time) — only the request `{summary}`.
  'approval.terminal.approved': {
    en: '✅ Approved — {summary}',
    tr: '✅ Onaylandı — {summary}',
  },
  'approval.terminal.rejected': {
    en: '✖ Rejected — {summary}',
    tr: '✖ Reddedildi — {summary}',
  },
  // REPL-575 K5 — localized tool confirm-prompt summaries (injected into
  // chat-tool-exec via ToolExecLabels; the mechanism module stays string-free).
  'tool.confirm_write': {
    en: 'Write file: {path} ({chars} chars)',
    tr: 'Dosya yaz: {path} ({chars} karakter)',
  },
  'tool.confirm_edit': {
    en: 'Edit file: {path}',
    tr: 'Dosya düzenle: {path}',
  },
  'tool.confirm_bash': {
    en: 'Run command: {cmd}',
    tr: 'Komut çalıştır: {cmd}',
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
  'autonomous_mission.engine_disabled_warning': {
    en: 'Warning: the autonomous engine is disabled — this mission is queued but will NOT be processed until you run `deckent autonomous enable`.',
    tr: 'Uyarı: otonom motor devre dışı — bu misyon kuyruğa alındı ancak `deckent autonomous enable` çalıştırılana kadar İŞLENMEYECEK.',
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
  'trace.desc': {
    en: 'Claude Code trace tooling for training corpora',
    tr: 'Eğitim korpusları için Claude Code trace araçları',
  },
  'trace.extract.desc': {
    en: 'Extract aligned + general training examples from Claude Code session transcript(s)',
    tr: 'Claude Code oturum transkript(ler)inden aligned + general eğitim örnekleri çıkar',
  },
  'trace.extract.arg.input': {
    en: 'Path to a transcript JSONL file, or a directory containing multiple transcripts',
    tr: 'Transkript JSONL dosyası ya da birden çok transkript içeren dizin yolu',
  },
  'trace.extract.opt.out': {
    en: 'Output directory for aligned.jsonl/general.jsonl',
    tr: 'aligned.jsonl/general.jsonl için çıktı dizini',
  },
  'trace.extract.opt.system': {
    en: "System prompt to prepend to each example (default: deckent's agentic system prompt)",
    tr: 'Her örneğin başına eklenecek system prompt (varsayılan: deckent agentic system prompt)',
  },
  'trace.extract.error.not_found': {
    en: 'Input path not found: {path}',
    tr: 'Girdi yolu bulunamadı: {path}',
  },
  'trace.extract.summary': {
    en: 'Extracted {aligned} aligned + {general} general example(s) from {files} transcript file(s) -> {outDir} ({redacted} redacted).',
    tr: '{files} transkript dosyasından {aligned} aligned + {general} general örnek çıkarıldı -> {outDir} ({redacted} redaksiyonlu).',
  },
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
      '  /status    current run status',
      '  /history   recent runs',
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
      '  /status    aktif run durumu',
      '  /history   son run\'lar',
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
    en: '🛡️ Not executed — {tool} was tied to run {sprint}, which is no longer the active run. Refusing so a stale command can\'t hit a different run.',
    tr: '🛡️ Çalıştırılmadı — {tool}, {sprint} run\'ına bağlıydı ama o artık aktif run değil. Bayat bir komut başka run\'ı vurmasın diye reddedildi.',
  },
  'bot.kill_done': {
    en: '✅ Killed run {sprint} (pid {pid}).',
    tr: '✅ {sprint} run\'ı öldürüldü (pid {pid}).',
  },
  'bot.kill_reused': {
    en: '🛡️ Not executed — run {sprint}\'s process is gone and its pid now belongs to something else. Refusing to signal a foreign process.',
    tr: '🛡️ Çalıştırılmadı — {sprint} run\'ının process\'i gitmiş ve pid\'i artık başka bir şeye ait. Yabancı bir process\'e sinyal göndermeyi reddediyorum.',
  },
  'bot.kill_already_stopped': {
    en: 'ℹ️ Run {sprint} is already stopped — nothing to kill.',
    tr: 'ℹ️ {sprint} run\'ı zaten durmuş — öldürülecek bir şey yok.',
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
  'serve.terminal_non_localhost_warning': {
    en: 'Warning: terminal disabled — non-localhost host requires explicit --no-terminal',
    tr: 'Uyarı: terminal kapatıldı — localhost-dışı host açıkça --no-terminal gerektirir',
  },
  'serve.stop_hint': {
    en: '  Stop      Ctrl+C',
    tr: '  Durdurmak Ctrl+C',
  },
  'serve.port_tip': {
    en: '  Tips      deckent serve --port <n>  --host <addr>',
    tr: '  İpuçları  deckent serve --port <n>  --host <adres>',
  },
  'serve.daemon_meta_failed': {
    en: 'Warning: could not write the desktop handshake file (.deckent/serve-daemon.json) — the server runs normally, but a desktop shell cannot auto-adopt this daemon: {error}',
    tr: 'Uyarı: desktop el-sıkışma dosyası (.deckent/serve-daemon.json) yazılamadı — sunucu normal çalışıyor, ancak desktop kabuğu bu daemon\'ı otomatik devralamaz: {error}',
  },
  // SEC-03 (415-003): raw-token stderr redaction — a bearer token must never
  // land in a process-log stream (CI/journald/log-shippers capture stderr
  // verbatim). These log a short fingerprint + the 0600 file the real value
  // was persisted to, instead of the token itself.
  'serve.token.auto_generated': {
    en: '[deckent:info] Auto-generated API token (active for /api/* Bearer auth) — fingerprint {fingerprint}, full token in {path} (0600)',
    tr: '[deckent:info] Otomatik üretilen API token (aktif /api/* Bearer auth için) — parmak izi {fingerprint}, tam token {path} dosyasında (0600)',
  },
  'serve.token.auto_minted': {
    en: '[deckent:info] Auto-minted localhost API token (this is the ACTIVE token for /api/* Bearer auth; the dashboard on localhost receives it automatically) — fingerprint {fingerprint}, full token in {path} (0600)',
    tr: '[deckent:info] Otomatik oluşturulan localhost API token (bu /api/* Bearer auth için AKTİF token; localhost\'taki dashboard bunu otomatik alır) — parmak izi {fingerprint}, tam token {path} dosyasında (0600)',
  },
  'serve.token.terminal_minted': {
    en: '[deckent:info] Terminal session token (embedded web terminal only — NOT the /api/* API token) — fingerprint {fingerprint}, full token in {path} (0600)',
    tr: '[deckent:info] Terminal oturum token\'ı (yalnızca gömülü web terminali — /api/* API token\'ı DEĞİL) — parmak izi {fingerprint}, tam token {path} dosyasında (0600)',
  },
  'serve.token.persist_failed': {
    en: '[deckent:warn] Could not persist the {file} token file — {error}. The active token still works for auth; only the on-disk copy is missing.',
    tr: '[deckent:warn] {file} token dosyası kalıcı hale getirilemedi — {error}. Aktif token auth için hâlâ çalışıyor; yalnızca disk kopyası eksik.',
  },
  'serve.token.posix_chmod_failed': {
    en: '[deckent:warn] Could not set owner-only (0600) permissions on {path} — {error}',
    tr: '[deckent:warn] {path} üzerinde yalnızca-sahip (0600) izinleri ayarlanamadı — {error}',
  },
  'serve.token.win_acl_unavailable': {
    en: '[deckent:warn] Could not determine the current Windows user (USERNAME unset) — skipping icacls hardening for {path}. The file may be readable by other accounts.',
    tr: '[deckent:warn] Mevcut Windows kullanıcısı belirlenemedi (USERNAME tanımsız) — {path} için icacls sıkılaştırması atlanıyor. Dosya diğer hesaplar tarafından okunabilir olabilir.',
  },
  'serve.token.win_acl_warn': {
    en: '[deckent:warn] icacls hardening issue for {path}: {detail}. The file may be readable by other accounts.',
    tr: '[deckent:warn] {path} için icacls sıkılaştırma sorunu: {detail}. Dosya diğer hesaplar tarafından okunabilir olabilir.',
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
    en: 'Run concurrent peak: {peak} ({containers} containers)',
    tr: 'Run eşzamanlı tepe: {peak} ({containers} container)',
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
    en: 'Usage — Run {sprint}',
    tr: 'Kullanım — Run {sprint}',
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
    en: 'No run data found. Sessions could not be mapped to run {sprint} tasks.',
    tr: 'Run verisi bulunamadı. Oturumlar run {sprint} görevlerine eşlenemedi.',
  },
  'usage.cache_gate': {
    en: 'Cache gate: {status} (warm-share {share}%, warmer: {taskId})',
    tr: 'Önbellek kapısı: {status} (ısıtma payı %{share}, ısıtıcı: {taskId})',
  },
  'usage.cache_gate_na': {
    en: 'Cache gate: N/A (single-session run)',
    tr: 'Önbellek kapısı: N/A (tek oturumlu run)',
  },
  'usage.unknown_models': {
    en: '⚠ No price found for model(s): {models} — their burn is counted as $0. Run `deckent config update-pricing` or add the model to .deckent/cost-config.json.',
    tr: '⚠ Şu model(ler) için fiyat bulunamadı: {models} — yakımları $0 sayılıyor. `deckent config update-pricing` çalıştırın veya modeli .deckent/cost-config.json dosyasına ekleyin.',
  },

  // ─── kpi command (Sprint 330 KPI Faz-1, Task 9) ──────────────────────
  'kpi.title': {
    en: 'KPI Scorecard — {sprint}',
    tr: 'KPI Karnesi — {sprint}',
  },
  'kpi.header_kpi': {
    en: 'KPI',
    tr: 'KPI',
  },
  'kpi.header_value': {
    en: 'Value',
    tr: 'Değer',
  },
  'kpi.header_target': {
    en: 'Target',
    tr: 'Hedef',
  },
  'kpi.header_status': {
    en: 'Status',
    tr: 'Durum',
  },
  'kpi.no_data': {
    en: 'No KPI data available for {sprint}.',
    tr: '{sprint} için KPI verisi bulunamadı.',
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
  'recover.confirm_header': { en: '\n  ⚠ Recovery will clean up run {sprintId}:', tr: '\n  ⚠ Kurtarma, {sprintId} run\'ını temizleyecek:' },
  'recover.confirm_remove_ipc': { en: '    - Remove orphan IPC directories (dead PIDs only)', tr: '    - Artık IPC dizinlerini kaldır (yalnızca ölü PID\'ler)' },
  'recover.confirm_clear_locks': { en: '    - Clear stale lock files (>5min)', tr: '    - Bayat kilit dosyalarını temizle (>5dk)' },
  'recover.confirm_archive_tasks': { en: '    - Archive terminal task files (DONE/NO_GO)', tr: '    - Sonlanmış görev dosyalarını arşivle (DONE/NO_GO)' },
  'recover.confirm_preserve_active': { en: '    - Preserve active tasks (PENDING/EXECUTING)\n', tr: '    - Aktif görevleri koru (PENDING/EXECUTING)\n' },
  'recover.confirm_hint': { en: '  Use --force to skip this confirmation, or --dry-run to preview.\n', tr: '  Bu onayı atlamak için --force, önizleme için --dry-run kullanın.\n' },
  'recover.confirm_prompt': { en: '  Proceed? (y/N)  ', tr: '  Devam edilsin mi? (y/N) ' },
  'recover.aborted': { en: '  Aborted.', tr: '  İptal edildi.' },
  'recover.recovering': { en: '\n  Recovering run {sprintId}...', tr: '\n  {sprintId} run\'ı kurtarılıyor...' },
  'recover.result_orphan_ipc': { en: '  Orphan IPC dirs: {count} removed', tr: '  Artık IPC dizinleri: {count} kaldırıldı' },
  'recover.result_stale_locks': { en: '  Stale locks:     {count} cleared', tr: '  Bayat kilitler:  {count} temizlendi' },
  'recover.result_stale_spawnlocks': { en: '  Stale spawnlocks:{count} cleared', tr: '  Bayat spawnlock: {count} temizlendi' },
  'recover.result_task_files': { en: '  Task files:      {archived} archived, {preserved} preserved', tr: '  Görev dosyaları: {archived} arşivlendi, {preserved} korundu' },
  'recover.complete': { en: '\n  ✓ Recovery complete. Run {sprintId} is ready for restart.\n', tr: '\n  ✓ Kurtarma tamamlandı. {sprintId} run\'ı yeniden başlatmaya hazır.\n' },
  'recover.restore_success': { en: '  ✓ Restored {count} task file(s) from the {sprintId} pre-archive snapshot (rollback).', tr: '  ✓ {sprintId} pre-archive snapshot\'ından {count} task dosyası geri yüklendi (rollback).' },
  'recover.restore_failed': { en: '  Restore failed for {sprintId}: {error}', tr: '  {sprintId} için geri-yükleme başarısız: {error}' },
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
  'features.header_meta': { en: 'Run: {sprint} | Generated: {generated}', tr: 'Run: {sprint} | Oluşturma: {generated}' },
  'features.total': { en: 'Total: {count} features', tr: 'Toplam: {count} özellik' },
  'history.no_history': { en: 'No run history found.', tr: 'Run geçmişi bulunamadı.' },
  'history.no_match': { en: 'No matching run history found.', tr: 'Eşleşen run geçmişi bulunamadı.' },
  'config.set': { en: 'Set {key} = {value}', tr: '{key} = {value} olarak ayarlandı' },
  'config.invalid': { en: 'Invalid config: {errors}', tr: 'Geçersiz yapılandırma: {errors}' },
  'config.key_not_found': { en: 'Key not found: {key}', tr: 'Anahtar bulunamadı: {key}' },
  'config.exported': { en: 'Config exported to {path}', tr: 'Yapılandırma {path} dosyasına dışa aktarıldı' },
  'config.imported': { en: 'Config imported from {path}', tr: 'Yapılandırma {path} dosyasından içe aktarıldı' },
  'config.migrate_up_to_date': { en: 'Config is already up to date — no migration needed.', tr: 'Yapılandırma zaten güncel — geçiş gerekmiyor.' },
  'config.migrate_dry_run': { en: '[dry-run] Would add {count} missing field(s):', tr: '[dry-run] {count} eksik alan eklenecek:' },
  'config.migrate_complete': { en: 'Migration complete. Added {count} field(s):', tr: 'Geçiş tamamlandı. {count} alan eklendi:' },
  'config.migrate_backup': { en: 'Backup saved to: {path}', tr: 'Yedek kaydedildi: {path}' },
  'retro.none_found': { en: 'No retrospective found. Run `deckent start` to complete a run first.', tr: 'Retrospektif bulunamadı. Önce bir run tamamlamak için `deckent start` çalıştırın.' },
  'retro.no_previous_sprint': { en: 'No previous run found for comparison.', tr: 'Karşılaştırma için önceki run bulunamadı.' },
  'web.deprecated_use_serve': { en: 'Note: `deckent web` is deprecated — please use `deckent serve` instead.', tr: 'Not: `deckent web` kullanımdan kaldırıldı — bunun yerine `deckent serve` kullanın.' },
  'web.dev_server_hint': { en: 'Run \'cd src/dashboard && npm run dev\' for Vite dev server on port 5173', tr: 'Vite geliştirme sunucusu için 5173 portunda \'cd src/dashboard && npm run dev\' komutunu çalıştırın' },
  'web.dashboard_not_found': { en: 'Warning: bundled dashboard not found at {name}', tr: 'Uyarı: paketlenmiş panel {name} konumunda bulunamadı' },
  'web.build_dashboard_hint': { en: 'Run \'npm run build:dashboard\' (repo) or reinstall deckent. API still works.', tr: '\'npm run build:dashboard\' komutunu çalıştırın (repo) veya deckent\'i yeniden kurun. API yine de çalışır.' },
  'web.listening': { en: 'Deckent Web Dashboard on http://localhost:{name}', tr: 'Deckent Web Paneli http://localhost:{name} adresinde çalışıyor' },
  'dashboard.sprint_line': { en: 'Run: {id} (#{number})', tr: 'Run: {id} (#{number})' },
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
  'dashboard.no_active_sprint': { en: 'No active run. Run deckent start first.', tr: 'Aktif run yok. Önce `deckent start` çalıştırın.' },

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
  // Ack returned when a risky deckent_* TOOL's approval was delivered as a buttoned
  // message (the user has Approve/Reject buttons) — the tool-side twin of cap.approval.ack.
  'tool.approval.ack': {
    en: 'Approval requested for {tool} — tap Approve/Reject on the message above; nothing has run yet.',
    tr: '{tool} için onay istendi — yukarıdaki mesajda Onayla/Reddet butonuna bas; henüz hiçbir şey çalışmadı.',
  },
  // ApprovalBroker.decideChecked() 'expired' outcome (born-437-004) — a bot-button
  // press or CLI approve/reject on a request whose TTL already elapsed. No decision
  // is recorded for this outcome; the user is told honestly instead of silence.
  'approval.decide.expired': {
    en: 'This approval request expired at {expiresAt} — no action was taken.',
    tr: 'Bu onay isteğinin süresi {expiresAt} tarihinde doldu — herhangi bir işlem yapılmadı.',
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

  // ─── Voice capability context (WS2 Task 3) ────────────────────────────────
  'voice.capability_context': {
    en: 'You are a voice-capable assistant: your replies may be spoken aloud and the user may send or request voice messages. Never claim you cannot access, hear, or produce audio.',
    tr: 'Sesli bir asistansın: yanıtların sesli okunabilir ve kullanıcı sesli mesaj gönderebilir ya da isteyebilir. ASLA sesi duyamadığını, ona erişemediğini veya üretemediğini söyleme.',
  },

  // ─── Voice reply-language instructions (WS1 Task 5) ────────────────────────
  'voice.reply_lang_forced': {
    en: 'Reply ONLY in {language}. Do not mix languages.',
    tr: 'SADECE {language} dilinde yanıtla. Dilleri karıştırma.',
  },
  'voice.reply_lang_mirror': {
    en: 'Reply in the same language the user used. Do not mix languages.',
    tr: 'Kullanıcının kullandığı dilde yanıtla. Dilleri karıştırma.',
  },

  // ─── Voice health-check (Task 5 — bot-start honest-warn) ─────────────────
  'voice.wrapper_unreachable': {
    en: '⚠️ Voice is configured (provider={provider}) but the backend is unreachable at {url} — voice replies will fall back to text. {detail}',
    tr: '⚠️ Ses yapılandırıldı (sağlayıcı={provider}) ancak arka uç {url} adresine ulaşılamıyor — ses yanıtları metin olarak gönderilecek. {detail}',
  },

  // ─── Connector-surface RBAC / Identity (ADR-092) ─────────────────────────
  'rbac.unauthorized': {
    en: 'Not authorized: this action needs the "{permission}" permission.',
    tr: 'Yetkin yok: bu işlem için "{permission}" izni gerekiyor.',
  },
  'identity.verify_prompt': {
    en: "I can't verify who you are yet. To link your account, message me privately: {method}",
    tr: 'Kimliğini henüz doğrulayamıyorum. Hesabını bağlamak için bana özelden yaz: {method}',
  },
  'identity.binding_unconfigured': {
    en: 'This channel is not configured for per-user authorization.',
    tr: 'Bu kanal kullanıcı-bazlı yetkilendirme için yapılandırılmamış.',
  },

  // ─── Open Health Snapshot (Task 15 — MESSAGES-KEYS, migrated from
  // health-snapshot.ts LOCAL_MESSAGES; text byte-identical, see 351-001) ────
  'health.auth': { en: 'auth', tr: 'oturum' },
  'health.mcp': { en: 'mcp', tr: 'mcp' },
  'health.mem': { en: 'mem', tr: 'bellek' },
  'health.mode': { en: 'mode', tr: 'mod' },
  'health.unknown': { en: 'unknown', tr: 'bilinmiyor' },
  'health.logged_in': { en: 'logged in', tr: 'oturum açık' },
  'health.logged_out': { en: 'logged out', tr: 'oturum kapalı' },

  // ─── TERM-LIVE footer labels (Task 16 — MESSAGES-KEYS-2, sole-authority
  // addition; cited by 353-007's docImpact note; en text is byte-identical to
  // live-footer.ts's DEFAULT_LIVE_FOOTER_LABELS so a future REPL-wiring task
  // can swap options.labels for getMessage(...) calls with no visible diff) ──
  'live_footer.idle': { en: 'idle', tr: 'boşta' },
  'live_footer.running': { en: 'Running', tr: 'Çalışıyor' },
  'live_footer.elapsed': { en: 'Elapsed', tr: 'Geçen süre' },
  'live_footer.provider': { en: 'Provider', tr: 'Sağlayıcı' },
  'live_footer.auth': { en: 'Auth', tr: 'Oturum' },
  'live_footer.next': { en: 'Next', tr: 'Sıradaki' },
  'live_footer.healthy': { en: 'healthy', tr: 'sağlıklı' },
  'live_footer.degraded': { en: 'degraded', tr: 'sorunlu' },
  'live_footer.unknown': { en: 'unknown', tr: 'bilinmiyor' },
  'live_footer.logged_in': { en: 'logged-in', tr: 'oturum açık' },
  'live_footer.logged_out': { en: 'logged-out', tr: 'oturum kapalı' },

  // ─── TERM-CONNECT /connect step descriptions (Task 16 — MESSAGES-KEYS-2,
  // sole-authority addition; cited by 353-010's docImpact note — the exact 7
  // descriptionKey values already emitted by connect-wizard.ts's ConnectStep
  // objects) ──────────────────────────────────────────────────────────────
  'connect.step.install_cli': {
    en: 'Install the {provider} CLI: {instruction}',
    tr: '{provider} CLI\'ını kurun: {instruction}',
  },
  'connect.step.login': {
    en: 'Log in to {provider}.',
    tr: '{provider} hesabına giriş yapın.',
  },
  'connect.step.mcp_unsupported': {
    en: '{host} does not support MCP attachment yet.',
    tr: '{host} henüz MCP bağlantısını desteklemiyor.',
  },
  'connect.step.attach_mcp': {
    en: 'Attach deckent to {host} via MCP.',
    tr: 'Deckent\'i MCP üzerinden {host}\'a bağlayın.',
  },
  'connect.step.ide_cursor_setup': {
    en: 'Set up the Cursor IDE integration.',
    tr: 'Cursor IDE entegrasyonunu kurun.',
  },
  'connect.step.ide_terminal_guidance': {
    en: 'Running in a plain terminal — no IDE integration needed.',
    tr: 'Düz bir terminalde çalışıyorsunuz — IDE entegrasyonu gerekmiyor.',
  },
  'connect.step.wsl_recommended': {
    en: 'WSL is recommended over {shell} for the best experience.',
    tr: 'En iyi deneyim için {shell} yerine WSL önerilir.',
  },

  // ─── `deckent connect` auth-state guidance (PSL-6-DILIM, Sprint 369 —
  // 369-006). Shown only when buildAuthStateReport (doctor.ts, 368-002) finds
  // a provider "missing" — names the env var / .deck key to set, NEVER a
  // secret value (the {cmd} placeholder is always a literal `<value>`).
  'connect.auth_state.hint': {
    en: 'Set {envKey} (e.g. `{cmd}`), or add {deckKey} to your .deck file and reference it as $DECK:{deckKey} in config.',
    tr: '{envKey} ortam değişkenini ayarlayın (örn. `{cmd}`), ya da .deck dosyanıza {deckKey} ekleyip config içinde $DECK:{deckKey} olarak referans verin.',
  },

  // ─── REPL mode indicator (Task 354-001 REPL-SURFACE-WIRE — sole-authority
  // addition; cited by 354-001's ReplLabels.modeAsk/modeRun/modeControl
  // fallback text ('Ask'/'Run'/'Control', resolveModeLabel in app.tsx).
  // Naming mirrors every other ReplLabels field's existing tui.* key) ───────
  'tui.mode_ask': { en: 'Ask', tr: 'Sor' },
  'tui.mode_run': { en: 'Run', tr: 'Çalıştır' },
  'tui.mode_control': { en: 'Control', tr: 'Kontrol' },

  // ─── `/term` mode dispatch (term-mode.ts /term refactor — /ask·/run·/control
  // retired as transition commands; app.tsx handleSubmit renders these via
  // ReplLabels.termSwitched/termStatus/termUsage, run.tsx wires them).
  // {mode}/{approval} are substituted by app.tsx (confirmProgress precedent) ──
  'tui.term_switched': {
    en: 'terminal mode switched: {mode}',
    tr: 'terminal modu değişti: {mode}',
  },
  'tui.term_status': {
    en: 'terminal mode: {mode} · write approval: {approval}',
    tr: 'terminal modu: {mode} · yazma onayı: {approval}',
  },
  'tui.term_usage': {
    en: 'usage: /term ask|run|control — file-write approval is separate: /approve suggest|auto-edit|full-auto',
    tr: 'kullanım: /term ask|run|control — dosya-yazma onayı ayrıdır: /approve suggest|auto-edit|full-auto',
  },

  // ─── /resume picker (APP-SURFACE-WIRE 358-006 — ReplLabels.resumeHeader/
  // resumeHint/resumeSwitched/resumeNotFound/resumeAmbiguous; buildResumePickerLines/
  // resolveResumeCommand in app.tsx, wired by run.tsx's buildReplLabels. Distinct
  // from tui.resume_list_header/tui.resume_hint/etc. above — those serve the
  // OLDER loop-side /resume in chat-native.ts/chat-resume.ts, a different feature
  // with different placeholders ({session} vs {arg}); Task 387-001) ────────────
  // SURF-3 multi-flow-inbox — read-only `/runs` list of concurrent run-flows.
  'tui.inbox_header': { en: 'Active runs', tr: 'Aktif koşular' },
  'tui.inbox_hint': {
    en: 'Tip: `deckent status <id>` follows one',
    tr: 'İpucu: birini izlemek için `deckent status <id>`',
  },
  'tui.inbox_empty': {
    en: 'No runs yet — start one with `deckent do "<goal>"`',
    tr: 'Henüz koşu yok — başlatmak için `deckent do "<hedef>"`',
  },
  'tui.inbox_state_collecting': { en: 'collecting', tr: 'toplanıyor' },
  'tui.inbox_state_proposed': { en: 'proposed', tr: 'önerildi' },
  'tui.inbox_state_previewing': { en: 'previewing', tr: 'önizleme' },
  'tui.inbox_state_awaiting_approval': { en: 'awaiting approval', tr: 'onay bekliyor' },
  'tui.inbox_state_approved': { en: 'approved', tr: 'onaylandı' },
  'tui.inbox_state_starting': { en: 'starting', tr: 'başlıyor' },
  'tui.inbox_state_running': { en: 'running', tr: 'çalışıyor' },
  'tui.inbox_state_completed': { en: 'completed', tr: 'tamamlandı' },
  'tui.inbox_state_failed': { en: 'failed', tr: 'başarısız' },
  'tui.inbox_state_cancelled': { en: 'cancelled', tr: 'iptal edildi' },
  'tui.inbox_state_blocked': { en: 'blocked', tr: 'engellendi' },
  // SURF-3 multi-flow-inbox D2 — `/runs <n>` single-flow detail.
  'tui.inbox_detail_header': { en: 'Run {id} · {state}', tr: 'Koşu {id} · {state}' },
  'tui.inbox_detail_id': { en: '  id: {id}', tr: '  id: {id}' },
  'tui.inbox_detail_intent': { en: '  intent: {intent}', tr: '  hedef: {intent}' },
  'tui.inbox_detail_progress': { en: '  progress: {done}/{total}', tr: '  ilerleme: {done}/{total}' },
  'tui.inbox_detail_started': { en: '  started: {started}', tr: '  başladı: {started}' },
  'tui.inbox_not_found': {
    en: 'No run #{arg} — `/runs` lists them',
    tr: '#{arg} numaralı koşu yok — listelemek için `/runs`',
  },
  // SURF-3 multi-flow-inbox D3b — live `/runs --follow` card footers (list + detail).
  'tui.inbox_follow_nav_hint': {
    en: '↑↓ select · ↵ open · Esc close · ⟳ live',
    tr: '↑↓ seç · ↵ aç · Esc kapat · ⟳ canlı',
  },
  'tui.inbox_follow_detail_hint': {
    en: '↑↓ browse · Esc back · ⟳ live',
    tr: '↑↓ gez · Esc geri · ⟳ canlı',
  },
  // F-3 read-only liveness — row marks + detail lines for live-claiming flows.
  'tui.inbox_liveness_dead': { en: 'process died', tr: 'süreç öldü' },
  'tui.inbox_liveness_unknown': { en: 'unverified', tr: 'doğrulanamadı' },
  'tui.inbox_detail_liveness_dead': {
    en: '  liveness: process died (pid {pid})',
    tr: '  canlılık: süreç öldü (pid {pid})',
  },
  'tui.inbox_detail_liveness_unknown': {
    en: '  liveness: unverified — the run predates pid tracking',
    tr: '  canlılık: doğrulanamadı — koşu pid takibinden eski',
  },
  // F-3b rich detail — human-readable `/runs <n>` + `deckent runs <n>`.
  'tui.inbox_detail_origin': { en: '  origin: {origin}', tr: '  kaynak: {origin}' },
  'tui.inbox_detail_tasks': { en: '  tasks: {count}', tr: '  görev: {count}' },
  'tui.inbox_detail_updated': { en: '  updated: {time}', tr: '  güncellendi: {time}' },
  'tui.inbox_detail_closed': { en: '  closed: {time}', tr: '  kapandı: {time}' },
  'tui.inbox_detail_duration': { en: '  duration: {duration}', tr: '  süre: {duration}' },
  'tui.inbox_detail_summary': { en: '  summary: {summary}', tr: '  özet: {summary}' },
  'tui.inbox_detail_reason': { en: '  reason: {reason}', tr: '  neden: {reason}' },
  'tui.inbox_time_just_now': { en: 'just now', tr: 'az önce' },
  'tui.inbox_time_minutes_ago': { en: '{n} min ago', tr: '{n} dk önce' },
  'tui.inbox_time_hours_ago': { en: '{n} h ago', tr: '{n} sa önce' },
  'tui.inbox_time_days_ago': { en: '{n} d ago', tr: '{n} gün önce' },
  // F-3 `deckent runs --close-stale` — operator stale-run sweep output.
  'runs.close_stale.none': {
    en: 'No stale runs — every live-claiming flow is verified alive or already closed.',
    tr: 'Bayat koşu yok — canlı görünen her akış ya doğrulandı ya da zaten kapalı.',
  },
  'runs.close_stale.dry_header': {
    en: 'Stale runs that would be closed ({count}):',
    tr: 'Kapatılacak bayat koşular ({count}):',
  },
  'runs.close_stale.dry_hint': {
    en: 'Dry-run — nothing was written. Run `deckent runs --close-stale --yes` to close them.',
    tr: 'Ön-izleme — hiçbir şey yazılmadı. Kapatmak için `deckent runs --close-stale --yes` çalıştır.',
  },
  'runs.close_stale.apply_header': {
    en: 'Closed {count} stale run(s):',
    tr: '{count} bayat koşu kapatıldı:',
  },
  'runs.close_stale.entry_dead': {
    en: 'process died (pid {pid}) → failed',
    tr: 'süreç öldü (pid {pid}) → başarısız',
  },
  'runs.close_stale.entry_dead_cancelled': {
    en: 'process died (pid {pid}), legacy record → cancelled',
    tr: 'süreç öldü (pid {pid}), eski kayıt → iptal',
  },
  'runs.close_stale.entry_unverifiable': {
    en: 'unverifiable (no pid recorded) → cancelled',
    tr: 'doğrulanamaz (pid kaydı yok) → iptal',
  },
  'tui.resume_picker_header': { en: 'Recent sessions', tr: 'Son oturumlar' },
  'tui.resume_picker_hint': {
    en: 'Tip: /resume <number> to continue a session',
    tr: 'İpucu: bir oturumu sürdürmek için /resume <numara>',
  },
  'tui.resume_picker_switched': { en: 'resumed: {id}', tr: 'sürdürülüyor: {id}' },
  'tui.resume_picker_not_found': { en: 'session not found: {arg}', tr: 'oturum bulunamadı: {arg}' },
  'tui.resume_picker_ambiguous': {
    en: 'ambiguous — matches: {matches}',
    tr: 'belirsiz — eşleşenler: {matches}',
  },

  // ─── busy-controls: /queue /interrupt /steer (APP-SURFACE-WIRE 358-006 —
  // ReplLabels.busy*; renderBusyDecision in app.tsx, wired by run.tsx's
  // buildReplLabels. Task 387-001) ──────────────────────────────────────────
  'tui.busy_queue_status': {
    en: 'queue: {count} background · {state}',
    tr: 'kuyruk: {count} arkaplan · {state}',
  },
  'tui.busy_state_busy': { en: 'busy', tr: 'meşgul' },
  'tui.busy_state_idle': { en: 'idle', tr: 'boşta' },
  'tui.busy_interrupted': {
    en: 'interrupt requested — stopping after the current step',
    tr: 'kesme istendi — mevcut adımdan sonra durulacak',
  },
  'tui.busy_interrupt_idle': { en: 'nothing running to interrupt', tr: 'kesilecek bir şey çalışmıyor' },
  'tui.busy_interrupt_dup': { en: 'interrupt already requested', tr: 'kesme zaten istendi' },
  'tui.busy_steer_queued': {
    en: 'steer note queued (#{position}) — applied at turn end',
    tr: 'yönlendirme notu sıraya alındı (#{position}) — tur sonunda uygulanacak',
  },
  'tui.busy_steer_idle': { en: 'nothing running to steer', tr: 'yönlendirilecek bir şey çalışmıyor' },
  'tui.busy_steer_empty': { en: 'usage: /steer <message>', tr: 'kullanım: /steer <mesaj>' },

  // ─── ApprovalCard (APP-APPROVAL-WIRE 355-011 — ApprovalCardLabels; wired by
  // run.tsx's buildApprovalLabels. `progress` reuses tui.confirm_progress
  // (identical "[{index}/{total}]" template, no need for a duplicate key).
  // Task 387-001) ────────────────────────────────────────────────────────────
  'tui.approval_card_hint': {
    en: '(y = approve · n = deny · a = approve similar · d = details)',
    tr: '(y = onayla · n = reddet · a = benzerlerini onayla · d = detay)',
  },
  'tui.approval_card_details_heading': { en: 'Details', tr: 'Detaylar' },
  'tui.approval_card_no_args': { en: '(no arguments)', tr: '(argüman yok)' },
  'tui.approval_risk_none': { en: 'NONE', tr: 'YOK' },
  'tui.approval_risk_low': { en: 'LOW', tr: 'DÜŞÜK' },
  'tui.approval_risk_medium': { en: 'MEDIUM', tr: 'ORTA' },
  'tui.approval_risk_high': { en: 'HIGH', tr: 'YÜKSEK' },
  'tui.approval_risk_critical': { en: 'CRITICAL', tr: 'KRİTİK' },

  // ─── `deckent plan-nl` preview/backup lines (Task 354-008 DIR-1-CMD —
  // sole-authority addition; cited by 354-008's own directive "yenisi
  // gerekirse notes→Task 15" for the two plain-English strings in
  // src/cli/commands/plan-nl.ts's formatPlanNlPreview()/backup print line —
  // the post-write confirmation itself already reuses the existing
  // set_directives.updated key, so it needs no new entry here) ─────────────
  'plan_nl.preview_banner': {
    en: 'Deckent Plan (NL) — preview only, DIRECTIVES.md was NOT modified. Re-run with --write to save.',
    tr: 'Deckent Plan (NL) — yalnızca önizleme, DIRECTIVES.md değiştirilmedi. Kaydetmek için --write ile tekrar çalıştırın.',
  },
  'plan_nl.backup_created': {
    en: 'Backed up existing DIRECTIVES.md → {path}',
    tr: 'Mevcut DIRECTIVES.md yedeklendi → {path}',
  },

  // ─── ApprovalCard labels (Task 355-011 APP-APPROVAL-WIRE — sole-authority
  // addition; cited by app.tsx's DEFAULT_APPROVAL_CARD_LABELS fallback comment
  // "until messages round-8 (Task 15, MESSAGES-KEYS-4) wires localized keys".
  // English values mirror DEFAULT_APPROVAL_CARD_LABELS byte-for-byte) ────────
  'approval_card.hint': {
    en: '(y = approve · n = deny · a = approve similar · d = details)',
    tr: '(y = onayla · n = reddet · a = benzerlerini onayla · d = detay)',
  },
  // Numeric position notation — identical across locales by design, same
  // precedent as the existing tui.confirm_progress key.
  'approval_card.progress': {
    en: '[{index}/{total}]',
    tr: '[{index}/{total}]',
  },
  'approval_card.details_heading': {
    en: 'Details',
    tr: 'Detay',
  },
  'approval_card.no_args': {
    en: '(no arguments)',
    tr: '(argüman yok)',
  },
  'approval_card.risk_none': { en: 'NONE', tr: 'YOK' },
  'approval_card.risk_low': { en: 'LOW', tr: 'DÜŞÜK' },
  'approval_card.risk_medium': { en: 'MEDIUM', tr: 'ORTA' },
  'approval_card.risk_high': { en: 'HIGH', tr: 'YÜKSEK' },
  'approval_card.risk_critical': { en: 'CRITICAL', tr: 'KRİTİK' },

  // ─── `deckent do "<goal>"` (Task 355-010 GOLDENFLOW-CMD — sole-authority
  // addition; cited by 355-010's own docImpact: "all do.ts user-facing
  // strings are plain English literals ... A follow-up task should add do.*
  // keys to messages.ts". English values mirror do.ts's literal strings
  // byte-for-byte (formatDoPlanPreview + registerDo)) ────────────────────────
  'do.preview_banner_run': {
    en: 'Deckent Do — plan preview ({count} task(s)). Confirm below to start the run now.',
    tr: 'Deckent Do — plan önizleme ({count} görev). Run\'ı şimdi başlatmak için aşağıdan onaylayın.',
  },
  'do.preview_banner_dry_run': {
    en: 'Deckent Do — plan preview (dry-run; {count} task(s)). Nothing was started. Re-run with --run to execute.',
    tr: 'Deckent Do — plan önizleme (dry-run; {count} görev). Hiçbir şey başlatılmadı. Çalıştırmak için --run ile tekrar çalıştırın.',
  },
  'do.what_will_happen': {
    en: 'What will happen:',
    tr: 'Ne olacak:',
  },
  'do.task_files': {
    en: 'files: {files}',
    tr: 'dosyalar: {files}',
  },
  'do.task_scope': {
    en: 'scope: {scope}',
    tr: 'kapsam: {scope}',
  },
  'do.task_go_criteria': {
    en: 'goCriteria: {goCriteria}',
    tr: 'goCriteria: {goCriteria}',
  },
  'do.empty_goal': {
    en: 'do: goal must not be empty',
    tr: 'do: hedef boş olamaz',
  },
  'do.confirm_start': {
    en: 'Proceed and start this run now?',
    tr: 'Devam edilsin ve run şimdi başlatılsın mı?',
  },
  'do.dry_run_complete': {
    en: 'Dry-run complete — nothing was started. Re-run with --run to execute this plan.',
    tr: 'Dry-run tamamlandı — hiçbir şey başlatılmadı. Bu planı çalıştırmak için --run ile tekrar çalıştırın.',
  },
  // F-2 — planning-phase heartbeat (the propose/plan step is a real LLM call).
  'do.planning_started': {
    en: '⏳ Planning with the LLM… (timeout: {timeoutMin} min — tune with brain_plan_timeout_ms)',
    tr: '⏳ Plan LLM ile hazırlanıyor… (zaman-aşımı: {timeoutMin} dk — brain_plan_timeout_ms ile ayarlanır)',
  },
  'do.planning_progress': {
    en: '⏳ Planning… {elapsed}s',
    tr: '⏳ Planlanıyor… {elapsed}s',
  },
  'do.gate_blocked': {
    en: 'Prompt gate: {count} blocking finding(s) — run NOT started (the detached child would die at PLAN with the same verdict). Fix the plan or re-run with an adjusted goal.',
    tr: 'Prompt-gate: {count} engelleyici bulgu — koşu BAŞLATILMADI (detached-child PLAN fazında aynı kararla ölecekti). Planı düzeltin ya da hedefi ayarlayıp yeniden deneyin.',
  },
  'do.cancelled': {
    en: 'Cancelled at stage "{stage}" ({reason}). Nothing was started.',
    tr: '"{stage}" aşamasında iptal edildi ({reason}). Hiçbir şey başlatılmadı.',
  },
  'do.finished': {
    en: 'Run finished — exitCode {exitCode} ({outcome}).',
    tr: 'Run tamamlandı — exitCode {exitCode} ({outcome}).',
  },
  'do.outcome_success': { en: 'success', tr: 'başarılı' },
  'do.outcome_failure': { en: 'failure', tr: 'başarısız' },

  // ─── `deckent doctor --fix` (keys added by Task 356-015; wired into
  // formatDoctorFixLines() by Task 367-006, closing the standing
  // "TODO(docImpact, Task 15)" — English values mirror
  // formatDoctorFixLines()'s literal strings byte-for-byte, pinned by
  // tests/cli/messages-round9-keys.test.ts. The conditional "attempted
  // (N FAILED)" header is split into two keys (_ok / _failed) since
  // getMessage() only does flat {var} substitution, same precedent as
  // do.preview_banner_run/do.preview_banner_dry_run) ─────────────────────
  'doctor.fix_nothing_to_repair': {
    en: 'doctor --fix: nothing to repair — all safe-fix checks passed.',
    tr: 'doctor --fix: onarılacak bir şey yok — tüm güvenli-onarım kontrolleri geçti.',
  },
  'doctor.fix_dry_run_header': {
    en: 'doctor --fix (dry-run) — {count} safe repair(s) available:',
    tr: 'doctor --fix (dry-run) — {count} güvenli onarım mevcut:',
  },
  'doctor.fix_would_fix_line': {
    en: '  [would fix] {description}',
    tr: '  [onarılacak] {description}',
  },
  'doctor.fix_apply_hint': {
    en: 'Run `deckent doctor --fix --yes` to apply.',
    tr: 'Uygulamak için `deckent doctor --fix --yes` çalıştırın.',
  },
  'doctor.fix_apply_header_ok': {
    en: 'doctor --fix --yes — {count} repair(s) attempted:',
    tr: 'doctor --fix --yes — {count} onarım denendi:',
  },
  'doctor.fix_apply_header_failed': {
    en: 'doctor --fix --yes — {count} repair(s) attempted ({failed} FAILED):',
    tr: 'doctor --fix --yes — {count} onarım denendi ({failed} BAŞARISIZ):',
  },
  'doctor.fix_line_fixed': {
    en: '  [fixed] {description}',
    tr: '  [onarıldı] {description}',
  },
  'doctor.fix_line_failed': {
    en: '  [FAILED] {description} — {error}',
    tr: '  [BAŞARISIZ] {description} — {error}',
  },

  // ─── `deckent doctor --fix` enrichment (Task 367-006 ONB-2-DOCTOR-FIX):
  // reversible-report "before value" line + the honest "manual" (not
  // auto-fixable) section ───────────────────────────────────────────────
  'doctor.fix_previous_value_line': {
    en: '        before: {previousValue}',
    tr: '        önce: {previousValue}',
  },
  'doctor.fix_no_auto_fixable_but_manual': {
    en: 'doctor --fix: no auto-fixable issues found — {count} check(s) need manual attention (see below).',
    tr: 'doctor --fix: otomatik onarılabilir bir sorun yok — {count} kontrol elle ilgi bekliyor (aşağıya bakın).',
  },
  'doctor.fix_manual_header': {
    en: 'Manual (not auto-fixable — {count} check(s) need your attention):',
    tr: 'Manuel (otomatik onarılamaz — {count} kontrol dikkatinizi bekliyor):',
  },
  'doctor.fix_manual_line': {
    en: '  [manual] {name} — {message}',
    tr: '  [manuel] {name} — {message}',
  },

  // ─── limits command (Sprint 361 Task 361-002, LIMIT-GATE-WIRE) ─────────
  'limits.header': {
    en: 'Subscription Limits',
    tr: 'Abonelik Limitleri',
  },
  'limits.unavailable': {
    en: 'Limit probe unavailable: {reason}',
    tr: 'Limit probu kullanılamıyor: {reason}',
  },
  'limits.col_window': {
    en: 'Window',
    tr: 'Pencere',
  },
  'limits.col_usage': {
    en: 'Usage',
    tr: 'Kullanım',
  },
  'limits.col_resets': {
    en: 'Resets',
    tr: 'Sıfırlanma',
  },
  'limits.window_session': {
    en: 'Session',
    tr: 'Oturum',
  },
  'limits.window_week_all': {
    en: 'Week (all models)',
    tr: 'Hafta (tüm modeller)',
  },
  'limits.window_week_fable': {
    en: 'Week (Fable)',
    tr: 'Hafta (Fable)',
  },
  'limits.no_reset': {
    en: '—',
    tr: '—',
  },
  'limits.verdict_ok': {
    en: 'OK — usage is within safe limits.',
    tr: 'OK — kullanım güvenli sınırlar içinde.',
  },
  'limits.verdict_warn': {
    en: 'WARNING — {window} usage at {pct}% is approaching the limit.',
    tr: 'UYARI — {window} kullanımı %{pct} ile limite yaklaşıyor.',
  },
  'limits.verdict_block': {
    en: 'BLOCKED — {window} usage at {pct}% has reached the limit (resets {reset}).',
    tr: 'ENGELLENDİ — {window} kullanımı %{pct} ile limite ulaştı (sıfırlanma: {reset}).',
  },
  'limits.gate_enabled': {
    en: 'Start-gate: enabled (limit_gate.enabled = true)',
    tr: 'Başlangıç-kapısı: açık (limit_gate.enabled = true)',
  },
  'limits.gate_disabled': {
    en: 'Start-gate: disabled (limit_gate.enabled = false)',
    tr: 'Başlangıç-kapısı: kapalı (limit_gate.enabled = false)',
  },
  'limits.force_bypass': {
    en: '[limit-gate] Blocked verdict bypassed via --force-limits.',
    tr: '[limit-gate] Engelleme --force-limits ile aşıldı.',
  },
  'limits.start_gate_blocked': {
    en: '[limit-gate] Run start blocked — {window} usage at {pct}% (resets {reset}). Use --force-limits to override.',
    tr: '[limit-gate] Run başlatma engellendi — {window} kullanımı %{pct} (sıfırlanma: {reset}). Aşmak için --force-limits kullanın.',
  },
  'limits.start_gate_warn': {
    en: '[limit-gate] Warning: {window} usage at {pct}% — proceeding.',
    tr: '[limit-gate] Uyarı: {window} kullanımı %{pct} — devam ediliyor.',
  },

  // ─── openrouter-probe command (OPENROUTER-LIVE-PREP, Sprint 365 Task 365-004) ─
  'openrouter_probe.header': {
    en: 'OpenRouter Live Probe',
    tr: 'OpenRouter Canlı Probu',
  },
  'openrouter_probe.unavailable': {
    en: 'OpenRouter probe unavailable: {reason}',
    tr: 'OpenRouter probu kullanılamıyor: {reason}',
  },
  'openrouter_probe.fetch_failed': {
    en: 'OpenRouter live fetch failed: {reason}',
    tr: 'OpenRouter canlı-çağrısı başarısız: {reason}',
  },
  'openrouter_probe.summary': {
    en: '{count} free model(s) found — cache written to {cacheFile}',
    tr: '{count} ücretsiz model bulundu — önbellek {cacheFile} konumuna yazıldı',
  },
  'openrouter_probe.model_line': {
    en: '  - {id} ({context} ctx, {modality})',
    tr: '  - {id} ({context} bağlam, {modality})',
  },
  'openrouter_probe.more': {
    en: '  … and {count} more',
    tr: '  … ve {count} tane daha',
  },

  // ─── onboarding wizard core (ONB-WIZARD-CORE, Sprint 361 Task 361-009) ─
  'onboarding.mcp.host_not_installed': {
    en: '{host}: CLI not installed — MCP attach skipped',
    tr: '{host}: CLI kurulu değil — MCP bağlama atlandı',
  },
  'onboarding.mcp.unsupported': {
    en: '{host}: this CLI does not support MCP attach',
    tr: '{host}: bu CLI MCP bağlamayı desteklemiyor',
  },
  'onboarding.mcp.already_attached': {
    en: '{host}: MCP already attached',
    tr: '{host}: MCP zaten bağlı',
  },
  'onboarding.mcp.attach_suggested': {
    en: '{host}: MCP attach suggested',
    tr: '{host}: MCP bağlama önerildi',
  },
  'onboarding.question.workspace_scope': {
    en: 'Where should this configuration live?',
    tr: 'Bu yapılandırma nerede saklansın?',
  },
  'onboarding.choice.workspace_scope.project': {
    en: 'This project only',
    tr: 'Yalnızca bu proje',
  },
  'onboarding.choice.workspace_scope.global': {
    en: 'Global (all projects on this machine)',
    tr: 'Global (bu makinedeki tüm projeler)',
  },
  'onboarding.question.plan_mode': {
    en: 'Select a working mode',
    tr: 'Bir çalışma modu seçin',
  },
  'onboarding.choice.plan_mode.performance': {
    en: 'performance (premium tier, max power)',
    tr: 'performans (premium katman, maksimum güç)',
  },
  'onboarding.choice.plan_mode.balanced': {
    en: 'balanced (standard brain + premium workers)',
    tr: 'dengeli (standart brain + premium worker)',
  },
  'onboarding.choice.plan_mode.economic': {
    en: 'economic (standard tier, cost-efficient)',
    tr: 'ekonomik (standart katman, maliyet-etkin)',
  },
  'onboarding.choice.plan_mode.api': {
    en: 'api (pay-per-use, premium brain + standard workers)',
    tr: 'api (kullandıkça öde, premium brain + standart worker)',
  },
  'onboarding.choice.plan_mode.max_plan': {
    en: 'max_plan (Claude Max subscription, performance preset)',
    tr: 'max_plan (Claude Max aboneliği, performans ön ayarı)',
  },
  'onboarding.choice.plan_mode.max5x_plan': {
    en: 'max5x_plan (Claude Max 5x subscription, higher usage ceiling)',
    tr: 'max5x_plan (Claude Max 5x aboneliği, daha yüksek kullanım tavanı)',
  },
  'onboarding.choice.plan_mode.pro_plan': {
    en: 'pro_plan (Claude Pro subscription, economic preset)',
    tr: 'pro_plan (Claude Pro aboneliği, ekonomik ön ayar)',
  },
  'onboarding.provider.none_authenticated': {
    en: 'No authenticated provider found — sign in to a provider CLI (claude / codex / gemini) and re-run onboarding.',
    tr: 'Kimliği doğrulanmış bir sağlayıcı bulunamadı — bir sağlayıcı CLI\'sine (claude / codex / gemini) giriş yapıp onboarding\'i yeniden çalıştırın.',
  },

  // ─── onboarding Ink UI (WIZARD-INK, Sprint 362 Task 362-011) ───────────
  'onboarding.ui.step.provider_detect': {
    en: 'Provider Detection',
    tr: 'Sağlayıcı Tespiti',
  },
  'onboarding.ui.step.auth_status': {
    en: 'Authentication Status',
    tr: 'Kimlik Doğrulama Durumu',
  },
  'onboarding.ui.step.mcp_suggestion': {
    en: 'MCP Attach',
    tr: 'MCP Bağlama',
  },
  'onboarding.ui.step.workspace_mode': {
    en: 'Workspace & Mode',
    tr: 'Çalışma Alanı ve Mod',
  },
  'onboarding.ui.step.summary': {
    en: 'Summary',
    tr: 'Özet',
  },
  'onboarding.ui.provider.present': {
    en: '{provider}: found (v{version})',
    tr: '{provider}: bulundu (v{version})',
  },
  'onboarding.ui.provider.missing': {
    en: '{provider}: not found',
    tr: '{provider}: bulunamadı',
  },
  'onboarding.ui.auth.logged-in': {
    en: '{provider}: logged in ({method})',
    tr: '{provider}: giriş yapıldı ({method})',
  },
  'onboarding.ui.auth.logged-out': {
    en: '{provider}: not logged in',
    tr: '{provider}: giriş yapılmamış',
  },
  'onboarding.ui.auth.unknown': {
    en: '{provider}: login status unknown',
    tr: '{provider}: giriş durumu bilinmiyor',
  },
  'onboarding.ui.question.mcp_attach': {
    en: 'Attach the recommended MCP servers?',
    tr: 'Önerilen MCP sunucuları bağlansın mı?',
  },
  'onboarding.ui.choice.mcp_attach.accept': {
    en: 'Yes, attach ({hosts})',
    tr: 'Evet, bağla ({hosts})',
  },
  'onboarding.ui.choice.mcp_attach.skip': {
    en: 'No, skip',
    tr: 'Hayır, atla',
  },
  'onboarding.ui.question.apply': {
    en: 'Apply this configuration?',
    tr: 'Bu yapılandırma uygulansın mı?',
  },
  'onboarding.ui.choice.apply.apply': {
    en: 'Apply',
    tr: 'Uygula',
  },
  'onboarding.ui.choice.apply.cancel': {
    en: 'Cancel',
    tr: 'İptal',
  },
  'onboarding.ui.progress': {
    en: 'Step {index}/{total}',
    tr: 'Adım {index}/{total}',
  },
  'onboarding.ui.hint.question': {
    en: '↑/↓ move · Enter select · s skip (default) · Esc cancel',
    tr: '↑/↓ hareket · Enter seç · s atla (varsayılan) · Esc iptal',
  },
  'onboarding.ui.hint.info': {
    en: 'Enter continue · Esc cancel',
    tr: 'Enter devam · Esc iptal',
  },
  'onboarding.ui.summary.config_path': {
    en: 'Config path: {path}',
    tr: 'Yapılandırma yolu: {path}',
  },
  'onboarding.ui.summary.mode': {
    en: 'Mode: {mode} (brain/worker tier: {strategy})',
    tr: 'Mod: {mode} (brain/worker katmanı: {strategy})',
  },
  'onboarding.ui.summary.scope': {
    en: 'Scope: {scope} (root: {root})',
    tr: 'Kapsam: {scope} (kök: {root})',
  },
  'onboarding.ui.summary.providers': {
    en: 'Providers — brain: {brain}, worker: {worker}, fallback: {fallback}',
    tr: 'Sağlayıcılar — brain: {brain}, worker: {worker}, fallback: {fallback}',
  },
  'onboarding.ui.summary.mcp_actions': {
    en: 'MCP attach actions: {count} ({hosts})',
    tr: 'MCP bağlama eylemleri: {count} ({hosts})',
  },
  'onboarding.ui.summary.mcp_none': {
    en: 'MCP attach actions: none',
    tr: 'MCP bağlama eylemleri: yok',
  },
  'onboarding.ui.summary.global_scope_error': {
    en: 'Global scope resolution failed: {error}',
    tr: 'Global kapsam çözümlemesi başarısız: {error}',
  },
  'onboarding.ui.done.applied': {
    en: 'Configuration plan confirmed.',
    tr: 'Yapılandırma planı onaylandı.',
  },
  'onboarding.ui.done.cancelled': {
    en: 'Onboarding cancelled — nothing changed.',
    tr: 'Onboarding iptal edildi — hiçbir şey değişmedi.',
  },

  // ─── onboard entry-wire (ONB-ENTRY-WIRE, Sprint 363 Task 363-005) ──────
  'onboarding.plan.title': {
    en: '=== Deckent Onboarding Plan ===',
    tr: '=== Deckent Onboarding Planı ===',
  },
  'onboarding.plan.section.providers': {
    en: 'Providers:',
    tr: 'Sağlayıcılar:',
  },
  'onboarding.plan.section.auth': {
    en: 'Authentication:',
    tr: 'Kimlik Doğrulama:',
  },
  'onboarding.plan.section.mcp': {
    en: 'MCP Attach:',
    tr: 'MCP Bağlama:',
  },
  'onboarding.plan.section.summary': {
    en: 'Summary:',
    tr: 'Özet:',
  },
  'onboarding.plan.not_applied': {
    en: 'No files were written — this was a plan preview only.',
    tr: 'Hiçbir dosya yazılmadı — bu yalnızca bir plan önizlemesiydi.',
  },

  // ─── onboard apply-wire (ONB-APPLY-WIRE, Sprint 367 Task 367-005) ──────
  'onboarding.apply.preview.title': {
    en: '=== Deckent Onboarding Apply Preview (dry-run) ===',
    tr: '=== Deckent Onboarding Uygulama Önizlemesi (dry-run) ===',
  },
  'onboarding.apply.result.title': {
    en: '=== Deckent Onboarding Apply ===',
    tr: '=== Deckent Onboarding Uygulama ===',
  },
  'onboarding.apply.section.changes': {
    en: 'Field changes:',
    tr: 'Alan değişiklikleri:',
  },
  'onboarding.apply.field_change': {
    en: '{key}: {previous} -> {next}',
    tr: '{key}: {previous} -> {next}',
  },
  'onboarding.apply.value_none': {
    en: '(none)',
    tr: '(yok)',
  },
  'onboarding.apply.no_changes': {
    en: 'No changes — the target config already matches this plan.',
    tr: 'Değişiklik yok — hedef yapılandırma zaten bu planla eşleşiyor.',
  },
  'onboarding.apply.confirm_prompt': {
    en: 'Apply this configuration to {path}?',
    tr: 'Bu yapılandırma {path} konumuna uygulansın mı?',
  },
  'onboarding.apply.cancelled': {
    en: 'Apply cancelled — no changes were written.',
    tr: 'Uygulama iptal edildi — hiçbir değişiklik yazılmadı.',
  },
  'onboarding.apply.applied': {
    en: 'Applied — configuration written to {path}.',
    tr: 'Uygulandı — yapılandırma {path} konumuna yazıldı.',
  },
  'onboarding.apply.verification_failed': {
    en: 'Warning: post-write verification failed: {errors}',
    tr: 'Uyarı: yazım sonrası doğrulama başarısız oldu: {errors}',
  },
  'onboarding.apply.dry_run_notice': {
    en: 'Dry-run — no changes were written.',
    tr: 'Dry-run — hiçbir değişiklik yazılmadı.',
  },

  // ─── onboarding chat meta-intents (ONB-CHAT-DILIM-2, Sprint 368 Task 368-004) ──
  'onboarding.suggestion.connect_provider': {
    en: 'Run `deckent connect` to sign in to a provider CLI (claude / codex / gemini).',
    tr: 'Bir sağlayıcı CLI\'sine (claude / codex / gemini) giriş yapmak için `deckent connect` çalıştırın.',
  },
  'onboarding.chat.suggestion.show_limits': {
    en: 'Run `deckent limits` to see your current subscription-window usage.',
    tr: 'Mevcut abonelik-penceresi kullanımınızı görmek için `deckent limits` çalıştırın.',
  },
  'onboarding.chat.suggestion.start_sprint': {
    en: 'Once setup is done, run `deckent plan` then `deckent start` to plan and launch a run.',
    tr: 'Kurulum bittiğinde bir run planlayıp başlatmak için `deckent plan`, ardından `deckent start` çalıştırın.',
  },
  'onboarding.chat.suggestion.run_doctor': {
    en: 'Run `deckent doctor` to diagnose and fix common setup problems.',
    tr: 'Yaygın kurulum sorunlarını teşhis edip düzeltmek için `deckent doctor` çalıştırın.',
  },

  // ─── cu-status (TOOL-CU CLI surface, Sprint 374 Task 374-002) ───────────────
  'cuStatus.title': {
    en: 'Computer-Use Status (TOOL-CU)',
    tr: 'Bilgisayar-Kullanımı Durumu (TOOL-CU)',
  },
  'cuStatus.flag_disabled': {
    en: 'Flag: disabled — {reason}',
    tr: 'Bayrak: kapalı — {reason}',
  },
  'cuStatus.how_to_enable': {
    en: 'To enable: set "computer_use": { "enabled": true, "allowed_capabilities": [...] } in .deckent/config.json (project or global), then rerun `deckent cu-status`.',
    tr: 'Açmak için: .deckent/config.json (proje veya global) dosyasına "computer_use": { "enabled": true, "allowed_capabilities": [...] } ekleyin, ardından `deckent cu-status` komutunu tekrar çalıştırın.',
  },
  'cuStatus.flag_enabled': {
    en: 'Flag: enabled',
    tr: 'Bayrak: açık',
  },
  'cuStatus.platform_known': {
    en: 'Platform: {platform} (known)',
    tr: 'Platform: {platform} (bilinen)',
  },
  'cuStatus.platform_unsupported': {
    en: 'Platform: {platform} (unsupported — no capability mapping for this platform)',
    tr: 'Platform: {platform} (desteklenmiyor — bu platform için yetenek eşlemesi yok)',
  },
  'cuStatus.allowed_capabilities_line': {
    en: 'Allowed capabilities: {list}',
    tr: 'İzinli yetenekler: {list}',
  },
  'cuStatus.allowed_capabilities_empty': {
    en: '(none)',
    tr: '(yok)',
  },
  'cuStatus.capabilities_header': {
    en: 'Capabilities:',
    tr: 'Yetenekler:',
  },
  'cuStatus.capability_available': {
    en: '  {kind}: available',
    tr: '  {kind}: mevcut',
  },
  'cuStatus.capability_unavailable': {
    en: '  {kind}: unavailable — {reason}',
    tr: '  {kind}: kullanılamıyor — {reason}',
  },
  'cuStatus.config_load_error': {
    en: 'could not resolve project configuration ({error}) — treating computer_use as unavailable',
    tr: 'proje yapılandırması çözülemedi ({error}) — computer_use kullanılamaz kabul ediliyor',
  },

  // ─── ADR-D-012 TERM-5 CommandRisk ladder (cmdCatalog.risk.*) ─────────────
  // Canonical 4-class plain-risk-language (src/cli/command-registry.ts
  // CommandRisk), consumed via src/cli/helpers/risk-language.ts. Key names
  // match the ADR's own draft spec (ADR-D-012 § Decision item 2).
  'cmdCatalog.risk.oku': { en: 'Read', tr: 'Oku' },
  'cmdCatalog.risk.oku.desc': {
    en: 'Read-only — displays information, changes nothing.',
    tr: 'Salt-okunur — bilgi gösterir, hiçbir şeyi değiştirmez.',
  },
  'cmdCatalog.risk.degistir': { en: 'Modify', tr: 'Değiştir' },
  'cmdCatalog.risk.degistir.desc': {
    en: 'Local-state modification — writes local project/session state, generally reversible.',
    tr: 'Yerel-durum değişikliği — yerel proje/oturum durumuna yazar, genelde geri alınabilir.',
  },
  'cmdCatalog.risk.calistir': { en: 'Execute', tr: 'Çalıştır' },
  'cmdCatalog.risk.calistir.desc': {
    en: 'Executes or spawns a process/action — starts something, often not reversible by re-running it.',
    tr: 'Bir süreç/eylem çalıştırır veya başlatır — bir şey başlatır, yeniden çalıştırarak geri alınamayabilir.',
  },
  'cmdCatalog.risk.otonom': { en: 'Autonomous', tr: 'Otonom' },
  'cmdCatalog.risk.otonom.desc': {
    en: 'Opens a continuous, human-out-of-the-loop decision/work loop.',
    tr: 'Sürekli, insan-döngü-dışı bir karar/iş döngüsü açar.',
  },

  // ─── desktop shell (DESK-1, born-496) ─────────────────────────────────
  // Consumed via src/desktop/src/main/i18n.ts's t()/getDesktopStrings() —
  // never call getMessage directly from desktop main-process modules.
  'desktop.tray.open': { en: 'Open Deckent', tr: "Deckent'i Aç" },
  'desktop.tray.quit': { en: 'Quit', tr: 'Çıkış' },
  'desktop.tray.tooltip': { en: 'Deckent Desktop', tr: 'Deckent Masaüstü' },
  'desktop.connection.add_title': { en: 'Add Connection', tr: 'Bağlantı Ekle' },
  'desktop.connection.kind.local': { en: 'Local', tr: 'Yerel' },
  'desktop.connection.kind.wsl': { en: 'WSL', tr: 'WSL' },
  'desktop.connection.kind.ssh': { en: 'SSH', tr: 'SSH' },
  'desktop.connection.kind.container': { en: 'Container', tr: 'Konteyner' },
  'desktop.connection.kind_not_yet_supported': {
    en: '{kind} connections are not yet available.',
    tr: '{kind} bağlantıları henüz kullanılamıyor.',
  },
  'desktop.connection.connect_button': { en: 'Connect', tr: 'Bağlan' },
  'desktop.connection.delete_confirm': {
    en: 'Delete connection "{label}"?',
    tr: '"{label}" bağlantısını sil?',
  },
  'desktop.connecting.spawning': {
    en: 'Starting deckent daemon…',
    tr: 'deckent daemon başlatılıyor…',
  },
  'desktop.connecting.adopting': {
    en: 'Connecting to running daemon…',
    tr: 'Çalışan daemon\'a bağlanılıyor…',
  },
  'desktop.connecting.health_check': {
    en: 'Checking daemon health…',
    tr: 'Daemon sağlığı kontrol ediliyor…',
  },
  'desktop.connecting.retry': {
    en: 'Retrying connection…',
    tr: 'Bağlantı yeniden deneniyor…',
  },
  'desktop.error.node_not_found': {
    en: 'Node.js was not found on the target. Install Node.js 18+ to run deckent.',
    tr: "Hedefte Node.js bulunamadı. deckent'i çalıştırmak için Node.js 18+ yükleyin.",
  },
  'desktop.error.deckent_not_found': {
    en: 'deckent was not found on the target. Install it with `npm install -g deckent`.',
    tr: "Hedefte deckent bulunamadı. `npm install -g deckent` ile yükleyin.",
  },
  'desktop.error.port_conflict': {
    en: 'Port {port} is already in use on the target.',
    tr: '{port} portu hedefte zaten kullanımda.',
  },
  'desktop.error.daemon_crashed': {
    en: 'The deckent daemon crashed unexpectedly.',
    tr: 'deckent daemon beklenmedik şekilde çöktü.',
  },
  'desktop.error.health_timeout': {
    en: 'The daemon did not become healthy in time.',
    tr: 'Daemon zamanında sağlıklı hale gelmedi.',
  },
  'desktop.error.view_logs': { en: 'View Logs', tr: 'Günlükleri Görüntüle' },
  'desktop.window.minimize_to_tray_hint': {
    en: 'Deckent keeps running in the tray. Right-click the tray icon to reopen or quit.',
    tr: "Deckent, sistem tepsisinde çalışmaya devam eder. Yeniden açmak veya çıkmak için tepsi simgesine sağ tıklayın.",
  },
  'desktop.update.available': {
    en: 'A new version is available.',
    tr: 'Yeni bir sürüm mevcut.',
  },
  'desktop.update.downloading': { en: 'Downloading update…', tr: 'Güncelleme indiriliyor…' },
  'desktop.update.restart_to_apply': {
    en: 'Restart Deckent to apply the update.',
    tr: "Güncellemeyi uygulamak için Deckent'i yeniden başlatın.",
  },
  'desktop.update.check_for_updates': {
    en: 'Check for Updates',
    tr: 'Güncellemeleri Denetle',
  },
  'desktop.menu.help': { en: 'Help', tr: 'Yardım' },
  // D4-2 — former renderer-local supplementary copy, promoted to this SSOT
  // (src/desktop/src/shared/desktop-messages.ts lists the served keys).
  'desktop.app.browser_fallback_notice': {
    en: 'Desktop bridge unavailable — running in browser preview mode.',
    tr: 'Masaüstü köprüsü kullanılamıyor — tarayıcı önizleme kipinde çalışıyor.',
  },
  'desktop.connection.list_title': { en: 'Connections', tr: 'Bağlantılar' },
  'desktop.connection.list_loading': { en: 'Loading…', tr: 'Yükleniyor…' },
  'desktop.connection.empty_state': {
    en: 'No saved connections yet. Add one below to get started.',
    tr: 'Kayıtlı bağlantı yok. Başlamak için aşağıdan bir tane ekleyin.',
  },
  'desktop.connection.list_error': {
    en: 'Could not load saved connections.',
    tr: 'Kayıtlı bağlantılar yüklenemedi.',
  },
  'desktop.connection.field_label': { en: 'Name', tr: 'Ad' },
  'desktop.connection.field_kind': { en: 'Kind', tr: 'Tür' },
  'desktop.connection.field_project_path': { en: 'Project path', tr: 'Proje yolu' },
  'desktop.connection.field_host': { en: 'Host', tr: 'Sunucu' },
  'desktop.connection.field_port': { en: 'Port', tr: 'Port' },
  'desktop.connection.field_auto_start': {
    en: "Start the daemon automatically if it isn't running",
    tr: 'Daemon çalışmıyorsa otomatik başlat',
  },
  'desktop.connection.field_orphan_shutdown': {
    en: 'Stop this daemon on quit (only if this app started it)',
    tr: "Çıkışta bu daemon'u durdur (yalnız bu uygulama başlattıysa)",
  },
  'desktop.connection.submit_button': { en: 'Save connection', tr: 'Bağlantıyı kaydet' },
  'desktop.connection.delete_button': { en: 'Delete', tr: 'Sil' },
  'desktop.connection.validation_required': {
    en: 'This field is required.',
    tr: 'Bu alan zorunludur.',
  },
  'desktop.connection.validation_port': {
    en: 'Enter a port between 1 and 65535.',
    tr: '1 ile 65535 arasında bir port girin.',
  },
  'desktop.connection.add_error': {
    en: 'Could not save this connection.',
    tr: 'Bağlantı kaydedilemedi.',
  },
  'desktop.connection.remove_error': {
    en: 'Could not delete this connection.',
    tr: 'Bağlantı silinemedi.',
  },
  'desktop.connecting.title': { en: 'Connecting', tr: 'Bağlanılıyor' },
  'desktop.connecting.idle': { en: 'Preparing…', tr: 'Hazırlanıyor…' },
  'desktop.connecting.connected': {
    en: 'Connected — loading dashboard…',
    tr: 'Bağlandı — panel yükleniyor…',
  },
  'desktop.error.title': { en: 'Connection failed', tr: 'Bağlantı başarısız' },
  'desktop.error.unknown': {
    en: 'Something went wrong while connecting.',
    tr: 'Bağlanırken bir sorun oluştu.',
  },
  'desktop.error.back_button': { en: 'Back to connections', tr: 'Bağlantılara dön' },
  // D4-2 — daemon-lifecycle errorKey'leri (öksüzdüler: renderer ham-anahtar basıyordu).
  'desktop.daemon.spawn_failed': {
    en: 'Could not start the daemon: {message}',
    tr: 'Daemon başlatılamadı: {message}',
  },
  'desktop.daemon.health_timeout': {
    en: 'The daemon did not respond in time.',
    tr: 'Daemon zamanında yanıt vermedi.',
  },
  // D4-3 — post-connect app shell (Console/Chat/Approval/History).
  'desktop.shell.nav.console': { en: 'Console', tr: 'Konsol' },
  'desktop.shell.nav.chat': { en: 'Chat', tr: 'Sohbet' },
  'desktop.shell.nav.approval': { en: 'Approvals', tr: 'Onaylar' },
  'desktop.shell.nav.history': { en: 'History', tr: 'Geçmiş' },
  'desktop.shell.connected_to': { en: 'Connected: {origin}', tr: 'Bağlı: {origin}' },
  'desktop.shell.flows_empty': {
    en: 'No flows yet — start one with `deckent do "<goal>"`.',
    tr: 'Henüz akış yok — `deckent do "<hedef>"` ile başlatın.',
  },
  'desktop.shell.flag_run_flow_off': {
    en: 'This daemon has terminal.run_flow_v2 disabled — the Console needs it enabled.',
    tr: 'Bu daemonda terminal.run_flow_v2 kapalı — Konsol için açık olması gerekir.',
  },
  'desktop.shell.live_events': { en: 'Live events', tr: 'Canlı olaylar' },
  'desktop.shell.approvals_pending': {
    en: '{count} pending approval(s)',
    tr: '{count} bekleyen onay',
  },
  'desktop.shell.chat_coming': {
    en: 'Chat arrives with the real-workflow slice (SURF-5).',
    tr: 'Sohbet, gerçek-iş-akışı dilimiyle (SURF-5) geliyor.',
  },
  'desktop.shell.load_error': {
    en: 'Could not reach the daemon. Check the connection and retry.',
    tr: 'Daemona ulaşılamadı. Bağlantıyı kontrol edip yeniden deneyin.',
  },
  // D4-4 — «Köprüüstü» four-shell design.
  'desktop.shell.console.course': { en: 'Course', tr: 'Rota' },
  'desktop.shell.console.log': { en: "Ship's log", tr: 'Seyir defteri' },
  'desktop.shell.approval.title': { en: 'Pending orders', tr: 'Bekleyen emirler' },
  'desktop.shell.approval.empty': { en: 'No pending orders.', tr: 'Bekleyen emir yok.' },
  'desktop.shell.history.title': { en: 'Voyage ledger', tr: 'Sefer kayıtları' },
  'desktop.shell.chat.eyebrow': { en: 'Watch radio', tr: 'Vardiya telsizi' },
  // SURF-5 — real-workflow organs: «Emir» (propose) + preview + «Telgraf».
  'desktop.shell.console.order_placeholder': {
    en: 'State the goal — a new course order for the crew…',
    tr: 'Hedefi yazın — mürettebata yeni bir rota emri…',
  },
  'desktop.shell.console.order_submit': { en: 'Issue order', tr: 'Emri ver' },
  'desktop.shell.order_failed': {
    en: 'The order could not be planned. Check the daemon log and retry.',
    tr: 'Emir planlanamadı. Daemon günlüğünü kontrol edip yeniden deneyin.',
  },
  'desktop.shell.preview.title': { en: 'Planned course', tr: 'Planlanan rota' },
  'desktop.shell.preview.meta': {
    en: 'Gate: {gate} · Policy: {policy} · Digest: {digest}',
    tr: 'Kapı: {gate} · Politika: {policy} · Özet: {digest}',
  },
  'desktop.shell.telegraph.title': { en: 'Engine telegraph', tr: 'Makine telgrafı' },
  'desktop.shell.telegraph.stop': { en: 'STOP', tr: 'DUR' },
  'desktop.shell.telegraph.slow': { en: 'SLOW AHEAD', tr: 'AĞIR YOL' },
  'desktop.shell.telegraph.full': { en: 'FULL AHEAD', tr: 'TAM YOL' },
  'desktop.shell.console.cancel': { en: 'Abort voyage', tr: 'Seferi iptal et' },
  'desktop.shell.approval.allow': { en: 'Allow', tr: 'İzin ver' },
  'desktop.shell.approval.deny': { en: 'Deny', tr: 'Reddet' },
  'desktop.shell.approval.decide_off': {
    en: 'Remote decisions are disabled on this daemon (approval.api_decide) — decide from the terminal.',
    tr: 'Bu daemonda uzaktan karar kapalı (approval.api_decide) — kararı terminalden verin.',
  },
  // D4-1 «Köprüüstü» — watch (vardiya) theme system.
  'desktop.theme.title': { en: 'Watch', tr: 'Vardiya' },
  'desktop.theme.watch.day-watch': { en: 'Day watch', tr: 'Gündüz seyri' },
  'desktop.theme.watch.night-watch': { en: 'Night watch', tr: 'Gece seyri' },
  'desktop.theme.watch.open-sea': { en: 'Open sea', tr: 'Açık deniz' },
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
