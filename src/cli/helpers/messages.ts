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
    tr: 'Run {sprintId} (sprint) aktif',
    en: 'Run {sprintId} (sprint) active',
  },
  'status.no_sprint': {
    tr: 'Aktif run (sprint) yok',
    en: 'No active run (sprint)',
  },

  // ─── catalog network policy (SEC-04, task 418-003) ────────────────────
  'catalog.network_fetch_notice': {
    en: 'Fetching the latest model catalog from models.dev… (set DECKENT_OFFLINE=1 to skip)',
    tr: 'Güncel model kataloğu models.dev üzerinden alınıyor… (atlamak için DECKENT_OFFLINE=1 ayarlayın)',
  },
  'cli.binary_identity.hold': {
    en: 'DECKENT_BINARY_IDENTITY_HOLD: this Deckent source checkout is being driven by a different or unverified CLI build (reason: {issue}).',
    tr: 'DECKENT_BINARY_IDENTITY_HOLD: bu Deckent source checkout farklı veya doğrulanmamış bir CLI build tarafından çalıştırılıyor (neden: {issue}).',
  },
  'cli.binary_identity.warn': {
    en: 'DECKENT_BINARY_IDENTITY_WARN: the build in `dist/` no longer matches this source checkout (reason: {issue}). Continuing — run `npm run build` so the CLI reflects your current source.',
    tr: 'DECKENT_BINARY_IDENTITY_WARN: `dist/` içindeki build bu source checkout ile artık eşleşmiyor (neden: {issue}). Devam ediliyor — CLI güncel kaynağı yansıtsın diye `npm run build` çalıştırın.',
  },
  'cli.binary_identity.paths': {
    en: 'Project checkout: {projectRoot}\nRuntime package: {runtimeRoot}',
    tr: 'Proje checkout: {projectRoot}\nRuntime paketi: {runtimeRoot}',
  },
  'cli.binary_identity.hint': {
    en: 'Run `npm run build`, then use `node dist/cli/entry.js <command>` from this checkout. The diagnostic cross-checkout override never bypasses same-checkout source/build drift.',
    tr: 'Bu checkout içinde `npm run build` çalıştırın, ardından `node dist/cli/entry.js <komut>` kullanın. Diagnostic cross-checkout override aynı-checkout source/build drift kontrolünü asla atlamaz.',
  },
  'cli.binary_identity.override': {
    en: 'DECKENT_BINARY_IDENTITY_OVERRIDE: explicit cross-checkout override accepted (reason: {issue}); runtime behavior may not match this source checkout.',
    tr: 'DECKENT_BINARY_IDENTITY_OVERRIDE: açık cross-checkout override kabul edildi (neden: {issue}); runtime davranışı bu source checkout ile eşleşmeyebilir.',
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
  'start.exact_capability_required': {
    en: 'Exact approved-plan execution requires a complete detached-child capability. The --exact-* flags are supplied by the run-flow coordinator, not by hand — execute an approved flow through the canonical journey (`deckent do` / the REPL run-flow surface), which spawns this command with the full capability itself.',
    tr: 'Exact onaylı-plan yürütmesi eksiksiz detached-child capability gerektirir. --exact-* bayrakları elle değil run-flow koordinatörü tarafından sağlanır — onaylı bir flow\'u kanonik yolculukla (`deckent do` / REPL run-flow yüzeyi) yürütün; bu komutu tam capability ile kendisi başlatır.',
  },
  // B1a (smoke 2026-08-07, GR-2026-08-07-DOGFOOD-B1A-01): bare `start` used to
  // replan silently — with REAL provider cost — while an approved, unconsumed
  // RunFlow snapshot sat in the store. These messages carry the typed refusal.
  'start.approved_flow_guard.header': {
    en: 'An approved, not-yet-executed plan already exists — refusing to silently replan ({count} flow(s)):',
    tr: 'Onaylı ve henüz yürütülmemiş bir plan zaten var — sessizce yeniden planlama reddediliyor ({count} flow):',
  },
  'start.approved_flow_guard.flow_line': {
    en: '  • flow {flowId} · revision {revision} · planDigest {planDigest} · approved {approvedAt}',
    tr: '  • flow {flowId} · revizyon {revision} · planDigest {planDigest} · onay {approvedAt}',
  },
  'start.approved_flow_guard.more': {
    en: '  … and {count} more approved flow(s).',
    tr: '  … ve {count} onaylı flow daha.',
  },
  'start.approved_flow_guard.remedy': {
    en: 'Execute the approved plan through the canonical journey (`deckent do` / the REPL run-flow surface). To consciously discard it and plan fresh anyway, re-run with --force-replan.',
    tr: 'Onaylı planı kanonik yolculukla yürütün (`deckent do` / REPL run-flow yüzeyi). Bilinçli olarak vazgeçip yine de sıfırdan planlamak için --force-replan ile tekrar çalıştırın.',
  },
  'start.approved_flow_guard.consuming': {
    en: 'Consuming the approved plan through the canonical run-flow machinery: flow {flowId} · revision {revision} · planDigest {planDigest}. A detached run child executes it; follow with `deckent status` / `deckent watch`.',
    tr: 'Onaylı plan kanonik run-flow makinesiyle tüketiliyor: flow {flowId} · revizyon {revision} · planDigest {planDigest}. Detached run child yürütüyor; `deckent status` / `deckent watch` ile izleyin.',
  },
  'start.approved_flow_guard.consumed_duplicate': {
    en: 'This approved flow already has a start attempt (state: {state}) — nothing new was started. Follow with `deckent status`.',
    tr: 'Bu onaylı flow için zaten bir start attempt var (durum: {state}) — yeni bir şey başlatılmadı. `deckent status` ile izleyin.',
  },
  'start.approved_flow_guard.multiple': {
    en: 'Multiple approved, not-yet-executed flows exist — choose one with --consume-approved <flowId>, or discard them consciously with --force-replan.',
    tr: 'Birden çok onaylı ve yürütülmemiş flow var — --consume-approved <flowId> ile birini seçin ya da --force-replan ile bilinçli vazgeçin.',
  },
  'start.approved_flow_guard.v2_required': {
    en: 'Canonical consumption requires config.terminal.run_flow_v2 = true; enable it and re-run, or use --force-replan to consciously plan fresh.',
    tr: 'Kanonik tüketim için config.terminal.run_flow_v2 = true gerekir; etkinleştirip yeniden deneyin ya da --force-replan ile bilinçli sıfırdan planlayın.',
  },
  'start.approved_flow_guard.overridden': {
    en: 'Approved-flow guard overridden via --force-replan — planning fresh; the approved snapshot stays in the store untouched.',
    tr: 'Onaylı-flow koruması --force-replan ile bilinçli geçildi — sıfırdan planlanıyor; onaylı snapshot store\'da dokunulmadan duruyor.',
  },
  'start.exact_attempt_mismatch': {
    en: 'Exact start attempt does not match the approved plan or detached-child capability.',
    tr: 'Exact start attempt, onaylı plan veya detached-child capability ile eşleşmiyor.',
  },
  'start.exact_accepted': {
    en: 'Exact run {flowId} revision {revision} was accepted as attempt {attemptId}; admission is pending.',
    tr: 'Exact run {flowId} revision {revision}, {attemptId} attempt kimliğiyle kabul edildi; admission bekleniyor.',
  },
  'start.exact_duplicate': {
    en: 'Exact run {flowId} revision {revision} is already admitted or terminal as attempt {attemptId}; no duplicate process was started.',
    tr: 'Exact run {flowId} revision {revision}, {attemptId} attempt kimliğiyle zaten admitted veya terminal durumda; duplicate process başlatılmadı.',
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
  'planning.proof': {
    en: 'Planner proof: requested={requested} · actual={actual} · model-call={call} · reason={reason}',
    tr: 'Planner kanıtı: istenen={requested} · gerçekleşen={actual} · model-çağrısı={call} · neden={reason}',
  },
  'planning.receipt_ref': {
    en: 'Invocation receipt: {invocationId} · tenant={tenantId} · project={projectId}',
    tr: 'Çağrı makbuzu: {invocationId} · tenant={tenantId} · project={projectId}',
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

  // ─── run command — canonical model boundary (453-001) ────────────────
  'run.opt_model': {
    en: 'Model to use — an exact provider model ID (e.g. claude-sonnet-5, gpt-5.6-sol). '
      + 'Omit to use the configured default. Moving/legacy aliases (sonnet/opus/haiku/gpt-5/gpt-5.6) are rejected.',
    tr: 'Kullanılacak model — tam sağlayıcı model kimliği (örn. claude-sonnet-5, gpt-5.6-sol). '
      + 'Yapılandırılmış varsayılanı kullanmak için boş bırakın. Hareketli/eski takma adlar (sonnet/opus/haiku/gpt-5/gpt-5.6) reddedilir.',
  },
  // `{providers}` interpolated from `ALL_PROVIDER_NAMES` — see the note above
  // `run.model_err.provider_unverified` (OPENROUTER-PROVIDER, row 477).
  'run.opt_provider': {
    en: 'Explicit provider ownership ({providers}) — required to register an '
      + 'unseen versioned model ID; validated against the canonical registry.',
    tr: 'Açık sağlayıcı sahipliği ({providers}) — görülmemiş sürümlü bir model '
      + 'kimliğini kaydetmek için gereklidir; kanonik registry\'ye karşı doğrulanır.',
  },
  'run.model_err.invalid_id': {
    en: 'Cannot use model "{model}": the model ID is empty or malformed.',
    tr: '"{model}" modeli kullanılamıyor: model kimliği boş veya hatalı biçimlendirilmiş.',
  },
  'run.model_err.legacy_alias': {
    en: 'Cannot use model "{model}": it is a legacy alias — use the exact provider model ID '
      + '(e.g. claude-sonnet-5) instead.',
    tr: '"{model}" modeli kullanılamıyor: bu eski bir takma addır — bunun yerine tam sağlayıcı '
      + 'model kimliğini (örn. claude-sonnet-5) kullanın.',
  },
  'run.model_err.provider_mismatch': {
    en: 'Cannot use model "{model}" with provider "{provider}": the model is owned by a '
      + 'different provider.',
    tr: '"{model}" modeli "{provider}" sağlayıcısıyla kullanılamıyor: model farklı bir '
      + 'sağlayıcıya ait.',
  },
  // OPENROUTER-PROVIDER (row 477): the provider list is INTERPOLATED (`{providers}`),
  // never spelled out in the message text. These two strings hardcoded
  // "claude|codex|gemini|ollama", so adding a provider left the user reading a list
  // that no longer matched what the CLI accepted. Callers pass the runtime set
  // (`ALL_PROVIDER_NAMES`) — zero-hardcode, and both languages stay correct for free.
  'run.model_err.provider_unverified': {
    en: 'Cannot use model "{model}": it is unknown — pass --provider <{providers}> '
      + 'to register it explicitly.',
    tr: '"{model}" modeli kullanılamıyor: bilinmiyor — açıkça kaydetmek için '
      + '--provider <{providers}> geçin.',
  },
  'run.model_err.unknown_provider': {
    en: 'Unknown provider "{provider}" — valid providers: {providers}.',
    tr: 'Bilinmeyen sağlayıcı "{provider}" — geçerli sağlayıcılar: {providers}.',
  },
  'run.budget_hold': {
    en: 'Run held before task creation: execution budget policy is not ready '
      + '(reason: {reason}, required profile: {profile}). Configure an owner-authored '
      + 'worker budget profile; no provider or backend was started.',
    tr: 'Run, görev oluşturulmadan beklemeye alındı: execution budget policy hazır değil '
      + '(neden: {reason}, gerekli profil: {profile}). Owner tarafından yazılmış bir '
      + 'worker budget profili yapılandırın; provider veya backend başlatılmadı.',
  },
  'run.provider_authority_hold': {
    en: 'Run held before task creation: provider execution authority is not ready '
      + '(reason: {reason}, evidence: {evidence}). No task, provider, or backend was started.',
    tr: 'Run, görev oluşturulmadan beklemeye alındı: provider execution authority hazır değil '
      + '(neden: {reason}, kanıt: {evidence}). Görev, provider veya backend başlatılmadı.',
  },
  /** Actionable remedy appended to a hold the operator can actually resolve. */
  'run.provider_authority_hold.remedy_keyring': {
    en: 'Remedy: the provider authority keyring is not provisioned. Inspect it with '
      + '`deckent provider-authority keyring status`; the owner provisions it with '
      + '`deckent provider-authority keyring init`.',
    tr: 'Çözüm: provider authority keyring sağlanmamış. Durumu için '
      + '`deckent provider-authority keyring status`; sahibi '
      + '`deckent provider-authority keyring init` ile sağlar.',
  },
  // ─── task settlement authority (one-shot execution truth) ───────────────
  'task.cmd_desc': {
    en: 'Inspect and reconcile immutable one-shot task settlement evidence',
    tr: 'Tek seferlik görevlerin değişmez settlement kanıtını incele ve uzlaştır',
  },
  'task.settle.desc': {
    en: 'Inspect a task settlement plan; apply only with explicit operator attestation',
    tr: 'Görev settlement planını incele; yalnız açık operatör beyanıyla uygula',
  },
  'task.settle.opt_apply': {
    en: 'Apply an evidence-eligible reconciliation (default: dry-run)',
    tr: 'Kanıtça uygun bir uzlaştırmayı uygula (varsayılan: dry-run)',
  },
  'task.settle.opt_attestation_reason': {
    en: 'Operator-authored reason for the reconciliation (required with --apply)',
    tr: 'Uzlaştırma için operatörün yazdığı gerekçe (--apply ile zorunlu)',
  },
  'task.settle.opt_operator': {
    en: 'Stable operator identifier; only its hash-bound opaque reference is persisted (required with --apply)',
    tr: 'Sabit operatör kimliği; yalnız hash-bound opak referansı kalıcılaştırılır (--apply ile zorunlu)',
  },
  'task.settle.opt_reason_code': {
    en: 'Typed pre-dispatch reason for a declared eventless receipt ({codes})',
    tr: 'Bildirilen eventless receipt için tipli pre-dispatch nedeni ({codes})',
  },
  'task.settle.opt_json': {
    en: 'Emit the stable machine-readable settlement DTO',
    tr: 'Kararlı makine-okunur settlement DTO çıktısı üret',
  },
  'task.settle.apply_guard': {
    en: 'Refused: --apply requires both --attestation-reason <text> and --operator <id>. No receipt event was appended.',
    tr: 'Reddedildi: --apply için hem --attestation-reason <metin> hem --operator <kimlik> zorunludur. Receipt event\'i eklenmedi.',
  },
  'task.settle.invalid_task_id': {
    en: 'Refused: "{taskId}" is not a valid task identifier. Nothing was read or changed.',
    tr: 'Reddedildi: "{taskId}" geçerli bir görev kimliği değil. Hiçbir şey okunmadı veya değiştirilmedi.',
  },
  'task.settle.invalid_reason_code': {
    en: 'Refused: "{reasonCode}" is not an allowed pre-dispatch reason. Allowed values: {codes}. Nothing was changed.',
    tr: 'Reddedildi: "{reasonCode}" izin verilen bir pre-dispatch nedeni değil. İzin verilen değerler: {codes}. Hiçbir şey değiştirilmedi.',
  },
  'task.settle.reason_code_required': {
    en: 'This declared receipt has no dispatch event. --reason-code is required to settle it; allowed values: {codes}. Nothing was changed.',
    tr: 'Bu bildirilmiş receipt dispatch event\'i içermiyor. Kapatmak için --reason-code zorunlu; izin verilen değerler: {codes}. Hiçbir şey değiştirilmedi.',
  },
  'task.settle.reason_code_not_applicable': {
    en: 'Refused: --reason-code {reasonCode} is not applicable while settlement authority reports {authorityReason}. Nothing was changed.',
    tr: 'Reddedildi: settlement authority {authorityReason} bildirirken --reason-code {reasonCode} uygulanamaz. Hiçbir şey değiştirilmedi.',
  },
  'task.settle.not_found': {
    en: 'Task {taskId} or its readable task evidence was not found. Nothing was changed.',
    tr: '{taskId} görevi veya okunabilir görev kanıtı bulunamadı. Hiçbir şey değiştirilmedi.',
  },
  'task.settle.dry_run': {
    en: 'DRY-RUN — task {taskId}: raw={rawStatus}, effective={effectiveStatus}, decision={decision}, reason={reason}. Re-run with --apply plus explicit attestation only after reviewing the evidence.',
    tr: 'DRY-RUN — görev {taskId}: ham={rawStatus}, etkin={effectiveStatus}, karar={decision}, neden={reason}. Kanıtı inceledikten sonra yalnız --apply ve açık beyanla yeniden çalıştırın.',
  },
  'task.settle.applied': {
    en: 'SETTLED — task {taskId}: raw={rawStatus}, effective={effectiveStatus}, receipt={receiptId}, evidence={evidenceRef}.',
    tr: 'SETTLED — görev {taskId}: ham={rawStatus}, etkin={effectiveStatus}, receipt={receiptId}, kanıt={evidenceRef}.',
  },
  'task.settle.already_settled': {
    en: 'UNCHANGED — task {taskId} was already settled: raw={rawStatus}, effective={effectiveStatus}, receipt={receiptId}.',
    tr: 'DEĞİŞMEDİ — {taskId} görevi zaten kapanmıştı: ham={rawStatus}, etkin={effectiveStatus}, receipt={receiptId}.',
  },
  'task.settle.ineligible': {
    en: 'Refused: task {taskId} is not evidence-eligible for reconciliation ({reason}). Nothing was changed.',
    tr: 'Reddedildi: {taskId} görevi kanıta dayalı uzlaştırma için uygun değil ({reason}). Hiçbir şey değiştirilmedi.',
  },
  'task.settle.failed': {
    en: 'Task settlement failed: {message}',
    tr: 'Görev settlement işlemi başarısız: {message}',
  },
  'task.settle.pre_dispatch_reason_line': {
    en: 'Settled typed pre-dispatch reason: {reasonCode}',
    tr: 'Kalıcılaştırılan tipli pre-dispatch nedeni: {reasonCode}',
  },
  'task.settle.requested_pre_dispatch_reason_line': {
    en: 'Requested typed pre-dispatch reason (not yet settled): {reasonCode}',
    tr: 'İstenen tipli pre-dispatch nedeni (henüz kalıcı değil): {reasonCode}',
  },
  'task.settle.decision.eligible': {
    en: 'eligible',
    tr: 'uygun',
  },
  'task.settle.decision.hold': {
    en: 'held',
    tr: 'beklemede',
  },
  'task.settle.decision.already-settled': {
    en: 'already settled',
    tr: 'zaten kapanmış',
  },
  'task.settle.reason.receipt-dispatch-rejected': {
    en: 'the immutable receipt proves dispatch was rejected',
    tr: 'değişmez receipt dispatch işleminin reddedildiğini kanıtlıyor',
  },
  'task.settle.reason.receipt-ready-for-rejection': {
    en: 'the declared receipt has no dispatch event and is ready for a typed pre-dispatch rejection',
    tr: 'bildirilmiş receipt dispatch event\'i içermiyor ve tipli pre-dispatch reddi için hazır',
  },
  'task.settle.reason.legacy-attestation-verified': {
    en: 'legacy absence evidence and operator attestation were verified',
    tr: 'legacy yokluk kanıtı ve operatör beyanı doğrulandı',
  },
  'task.settle.reason.already-settled': {
    en: 'an immutable terminal settlement already exists',
    tr: 'değişmez terminal settlement zaten var',
  },
  'task.settle.reason.receipt-missing': {
    en: 'the expected invocation receipt is missing',
    tr: 'beklenen invocation receipt eksik',
  },
  'task.settle.reason.receipt-ambiguous': {
    en: 'multiple or conflicting receipts prevent a unique decision',
    tr: 'birden çok veya çelişkili receipt tekil kararı engelliyor',
  },
  'task.settle.reason.dispatch-started': {
    en: 'dispatch-started evidence exists; NOT_DISPATCHED cannot be asserted',
    tr: 'dispatch-started kanıtı var; NOT_DISPATCHED beyan edilemez',
  },
  'task.settle.reason.terminal-conflict': {
    en: 'existing terminal evidence conflicts with this reconciliation',
    tr: 'mevcut terminal kanıt bu uzlaştırmayla çelişiyor',
  },
  'task.settle.reason.scope-mismatch': {
    en: 'tenant or project scope does not match the receipt authority',
    tr: 'tenant veya proje kapsamı receipt authority ile eşleşmiyor',
  },
  'task.settle.reason.unsupported-task-domain': {
    en: 'this settlement authority is limited to canonical run-* one-shot tasks',
    tr: 'bu settlement authority yalnız canonical run-* one-shot görevleriyle sınırlı',
  },
  'task.settle.reason.task-content-mismatch': {
    en: 'the attested task bytes do not match the task evidence',
    tr: 'beyan edilen görev byte\'ları görev kanıtıyla eşleşmiyor',
  },
  'task.settle.reason.attestation-evidence-mismatch': {
    en: 'the attestation does not bind the current absence evidence',
    tr: 'beyan güncel yokluk kanıtına bağlı değil',
  },
  'task.settle.reason.attestation-required': {
    en: 'explicit operator attestation is required',
    tr: 'açık operatör beyanı gerekli',
  },
  'task.settle.reason.pre-dispatch-reason-required': {
    en: 'a typed pre-dispatch rejection reason is required for this declared receipt',
    tr: 'bu bildirilmiş receipt için tipli bir pre-dispatch red nedeni gerekli',
  },
  'task.settle.reason.absence-evidence-incomplete': {
    en: 'absence evidence is incomplete or unknown',
    tr: 'yokluk kanıtı eksik veya bilinmiyor',
  },
  'task.settle.reason.active-execution-evidence': {
    en: 'live process, backend, or task artifact evidence is present',
    tr: 'canlı process, backend veya görev artifact kanıtı var',
  },
  'task.settle.reason.probe-unsupported': {
    en: 'this environment cannot prove every required absence signal',
    tr: 'bu ortam gerekli tüm yokluk sinyallerini kanıtlayamıyor',
  },
  'task.settlement.evidence_line': {
    en: 'Settlement: raw={rawStatus} · effective={effectiveStatus} · receipt={receiptId} · reason={reasonCode} · evidence={evidenceRefs}',
    tr: 'Settlement: ham={rawStatus} · etkin={effectiveStatus} · receipt={receiptId} · neden={reasonCode} · kanıt={evidenceRefs}',
  },
  'task.settlement.no_receipt_line': {
    en: 'Settlement: raw={rawStatus} · effective={effectiveStatus} · receipt=none · reason={reasonCode} · evidence={evidenceRefs}',
    tr: 'Settlement: ham={rawStatus} · etkin={effectiveStatus} · receipt=yok · neden={reasonCode} · kanıt={evidenceRefs}',
  },
  'task.settlement.none': {
    en: 'none',
    tr: 'yok',
  },
  'task.execution_fence_conflict': {
    en: 'Task {taskId} changed execution state concurrently; dispatch or settlement was refused.',
    tr: '{taskId} görevinin execution durumu eşzamanlı değişti; dispatch veya settlement reddedildi.',
  },
  'task.execution_snapshot_invalid': {
    en: 'Task {taskId} has an invalid canonical execution snapshot; dispatch was refused.',
    tr: '{taskId} görevinin canonical execution snapshot kaydı geçersiz; dispatch reddedildi.',
  },
  'task.execution_already_settled': {
    en: 'Task {taskId} is immutably settled as NOT_DISPATCHED; dispatch was refused.',
    tr: '{taskId} görevi değişmez biçimde NOT_DISPATCHED olarak kapatılmış; dispatch reddedildi.',
  },
  'task.execution_authority_conflict': {
    en: 'Task {taskId} has conflicting immutable execution authority ({reasonCode}); dispatch was refused.',
    tr: '{taskId} görevinin değişmez execution authority kaydı çelişkili ({reasonCode}); dispatch reddedildi.',
  },
  'status.task_settlements.header': {
    en: '\n--- Immutable Task Settlement ---',
    tr: '\n--- Değişmez Görev Settlement Durumu ---',
  },
  'output.invalid_task_id': {
    en: 'Refused: "{taskId}" is not a valid task identifier. Nothing was read.',
    tr: 'Reddedildi: "{taskId}" geçerli bir görev kimliği değil. Hiçbir şey okunmadı.',
  },
  'run.settlement_declared': {
    en: 'Invocation receipt declared: {receiptId}',
    tr: 'Invocation receipt bildirildi: {receiptId}',
  },
  'run.settlement_dispatch_rejected': {
    en: 'Dispatch rejection settled: receipt={receiptId} · reason={reason} · evidence={evidence}',
    tr: 'Dispatch reddi kapatıldı: receipt={receiptId} · neden={reason} · kanıt={evidence}',
  },
  'run.settlement_rejection_incomplete': {
    en: 'Receipt {receiptId} could not reach NOT_DISPATCHED (reason: {reason}); reconciliation is required.',
    tr: '{receiptId} receipt\'i NOT_DISPATCHED durumuna ulaşamadı (neden: {reason}); uzlaştırma gerekiyor.',
  },
  'run.settlement_rejection_failed': {
    en: 'Receipt {receiptId} could not persist its pre-dispatch rejection: {message}',
    tr: '{receiptId} receipt\'inin pre-dispatch reddi kalıcılaştırılamadı: {message}',
  },
  'run.settlement_reconciliation_required': {
    en: 'Dispatch may have started; receipt {receiptId} remains open for reconciliation (evidence: {evidence}). Task evidence was preserved.',
    tr: 'Dispatch başlamış olabilir; {receiptId} receipt\'i uzlaştırma için açık bırakıldı (kanıt: {evidence}). Görev kanıtı korundu.',
  },
  'run.settlement_terminal': {
    en: 'Terminal settlement persisted: receipt={receiptId} · effective={effectiveStatus} · evidence={evidence}',
    tr: 'Terminal settlement kalıcılaştırıldı: receipt={receiptId} · etkin={effectiveStatus} · kanıt={evidence}',
  },
  'run.settlement_backend_mismatch': {
    en: 'Dispatch refused before provider work: declared backend {expected} does not match boundary backend {actual}.',
    tr: 'Dispatch provider çalışmasından önce reddedildi: bildirilen backend {expected}, boundary backend {actual} ile eşleşmiyor.',
  },
  'run.settlement_dispatch_boundary_mismatch': {
    en: 'Dispatch authority mismatch for task {taskId}; provider work was refused.',
    tr: '{taskId} görevi için dispatch authority eşleşmiyor; provider çalışması reddedildi.',
  },
  'run.settlement_dispatch_boundary_missing': {
    en: 'No dispatch authority boundary was published for task {taskId}; the receipt remains open for reconciliation.',
    tr: '{taskId} görevi için dispatch authority boundary yayınlanmadı; receipt uzlaştırma için açık.',
  },
  'run.settlement_terminal_without_dispatch': {
    en: 'Task {taskId} produced terminal evidence without a dispatch authority boundary; settlement was refused.',
    tr: '{taskId} görevi dispatch authority boundary olmadan terminal kanıt üretti; settlement reddedildi.',
  },
  'run.result_identity_mismatch': {
    en: 'Result identity mismatch for task {taskId}. The receipt remains open for reconciliation and task evidence was preserved.',
    tr: '{taskId} görevi için sonuç kimliği eşleşmiyor. Receipt uzlaştırma için açık ve görev kanıtı korunmuş durumda.',
  },
  'cmdCatalog.task.summary': {
    en: 'Inspect or attest evidence-backed one-shot task settlement',
    tr: 'Kanıta dayalı tek seferlik görev settlement durumunu incele veya beyanla kapat',
  },
  'cmdCatalog.provider-authority.summary': {
    en: 'Inspect and rotate host-scoped provider authority integrity keys',
    tr: 'Host kapsamlı provider authority bütünlük anahtarlarını incele ve döndür',
  },
  'cmdCatalog.execution-authority.summary': {
    en: 'Inspect and explicitly reconcile execution authority bindings',
    tr: 'Execution authority bağlarını incele ve açıkça uzlaştır',
  },
  // ─── execution-authority mount adoption ─────────────────────────────────
  'execution_authority.cmd_desc': {
    en: 'Inspect and reconcile project execution authority bindings',
    tr: 'Proje execution authority bağlarını incele ve uzlaştır',
  },
  'execution_authority.mount_adopt.desc': {
    en: 'Reconcile namespace-local Linux/WSL mount metadata without changing execution authority',
    tr: 'Execution authority\'yi değiştirmeden namespace-local Linux/WSL mount metadata\'sını uzlaştır',
  },
  'execution_authority.mount_adopt.mcp_title': {
    en: 'Execution Authority Reconciliation',
    tr: 'Execution Authority Uzlaştırması',
  },
  'execution_authority.mount_adopt.mcp_desc': {
    en: 'Inspect or explicitly reconcile namespace-local Linux/WSL mount metadata. Stable dev+ino execution authority and its epoch do not change. Dry-run is the default; apply requires operator and justification.',
    tr: 'Namespace-local Linux/WSL mount metadata\'sını incele veya açıkça uzlaştır. Stable dev+ino execution authority ve epoch değişmez. Varsayılan dry-run\'dır; apply için operator ve justification zorunludur.',
  },
  'execution_authority.mount_adopt.mcp_action': {
    en: 'Execution-authority action; currently mount-adopt',
    tr: 'Execution-authority işlemi; şu anda mount-adopt',
  },
  'execution_authority.mount_adopt.opt_apply': {
    en: 'Apply eligible observational metadata reconciliation (default: dry-run)',
    tr: 'Uygun gözlemsel metadata uzlaştırmasını uygula (varsayılan: dry-run)',
  },
  'execution_authority.mount_adopt.opt_operator': {
    en: 'Stable operator identifier; only its SHA-256 digest is persisted',
    tr: 'Sabit operatör kimliği; yalnız SHA-256 özeti kalıcılaştırılır',
  },
  'execution_authority.mount_adopt.opt_justification': {
    en: 'Operator-authored reconciliation justification; only its SHA-256 digest is persisted',
    tr: 'Operatörün uzlaştırma gerekçesi; yalnız SHA-256 özeti kalıcılaştırılır',
  },
  'execution_authority.mount_adopt.opt_json': {
    en: 'Emit the stable machine-readable adoption DTO',
    tr: 'Kararlı makine-okunur adoption DTO çıktısı üret',
  },
  'execution_authority.mount_adopt.apply_guard': {
    en: 'Refused: --apply requires both --operator <id> and --justification <text>. Nothing was changed.',
    tr: 'Reddedildi: --apply için hem --operator <kimlik> hem --justification <metin> zorunludur. Hiçbir şey değiştirilmedi.',
  },
  'execution_authority.mount_adopt.eligible': {
    en: 'DRY-RUN — authority {authorityEpoch}: namespace-local mount observation {previousMountId} → {currentMountId}; optional audited metadata reconciliation is eligible, authority is unchanged.',
    tr: 'DRY-RUN — authority {authorityEpoch}: namespace-local mount gözlemi {previousMountId} → {currentMountId}; opsiyonel audit\'li metadata uzlaştırması uygun, authority değişmedi.',
  },
  'execution_authority.mount_adopt.adopted': {
    en: 'RECONCILED — authority {authorityEpoch}: mount observation {previousMountId} → {currentMountId}; stable generation and epoch were unchanged, immutable evidence was recorded.',
    tr: 'UZLAŞTIRILDI — authority {authorityEpoch}: mount gözlemi {previousMountId} → {currentMountId}; stable generation ve epoch değişmedi, değişmez kanıt kaydedildi.',
  },
  'execution_authority.mount_adopt.not_required': {
    en: 'UNCHANGED — authority {authorityEpoch}: this namespace already records mount observation {currentMountId}; stable dev+ino authority is unchanged.',
    tr: 'DEĞİŞMEDİ — authority {authorityEpoch}: bu namespace zaten {currentMountId} mount gözlemini kaydediyor; stable dev+ino authority değişmedi.',
  },
  'execution_authority.mount_adopt.evidence': {
    en: 'Evidence: {evidenceRefs}',
    tr: 'Kanıt: {evidenceRefs}',
  },
  'execution_authority.mount_adopt.failed': {
    en: 'Execution authority mount-metadata reconciliation was refused ({reason}). Nothing was deleted.',
    tr: 'Execution authority mount-metadata uzlaştırması reddedildi ({reason}). Hiçbir şey silinmedi.',
  },
  // ─── provider-authority keyring (owner-gated integrity material) ──────────
  'provider_authority.cmd_desc': {
    en: 'Inspect and provision the host-scoped provider authority keyring (owner-gated)',
    tr: 'Host kapsamlı provider authority keyring\'ini incele ve sağla (sahip yetkisinde)',
  },
  'provider_authority.keyring.cmd_desc': {
    en: 'Provider authority keyring — status / init / rotate',
    tr: 'Provider authority keyring — status / init / rotate',
  },
  'provider_authority.keyring.status_desc': {
    en: 'Show keyring location and revision state (never prints key material)',
    tr: 'Keyring konumunu ve revizyon durumunu göster (anahtar materyali asla yazılmaz)',
  },
  'provider_authority.keyring.init_desc': {
    en: 'Provision the keyring genesis revision (owner action; refuses if one exists)',
    tr: 'Keyring genesis revizyonunu sağla (sahip işlemi; varsa reddeder)',
  },
  'provider_authority.keyring.rotate_desc': {
    en: 'Rotate the active authority key (requires --expect-revision)',
    tr: 'Aktif authority anahtarını döndür (--expect-revision gerekir)',
  },
  'provider_authority.keyring.opt_expect_revision': {
    en: 'Revision hash the rotation must apply to (from `status`) — prevents clobbering a concurrent update',
    tr: 'Rotasyonun uygulanacağı revizyon hash\'i (`status` çıktısından) — eşzamanlı güncellemeyi ezmeyi önler',
  },
  'provider_authority.keyring.location': {
    en: 'Keyring directory: {dir}',
    tr: 'Keyring dizini: {dir}',
  },
  'provider_authority.keyring.absent': {
    en: 'State: NOT PROVISIONED — every run holds fail-closed with `keyring_unavailable` until the owner runs `deckent provider-authority keyring init`.',
    tr: 'Durum: SAĞLANMAMIŞ — sahibi `deckent provider-authority keyring init` çalıştırana kadar her run `keyring_unavailable` ile fail-closed bekler.',
  },
  'provider_authority.keyring.unreadable': {
    en: 'State: UNREADABLE ({code}) — {message}',
    tr: 'Durum: OKUNAMIYOR ({code}) — {message}',
  },
  'provider_authority.keyring.present': {
    en: 'State: PROVISIONED — keyring {keyringId}, revision {revision}, revision hash {revisionHash}, active key {activeKeyId}, {keyCount} key(s).',
    tr: 'Durum: SAĞLANMIŞ — keyring {keyringId}, revizyon {revision}, revizyon hash {revisionHash}, aktif anahtar {activeKeyId}, {keyCount} anahtar.',
  },
  'provider_authority.keyring.key_line': {
    en: '  - {keyId} [{status}] domains={domains} derivation={derivation} created={createdAt}',
    tr: '  - {keyId} [{status}] alanlar={domains} türetme={derivation} oluşturma={createdAt}',
  },
  'provider_authority.keyring.project_scope_note': {
    en: 'Note: this material is deliberately stored OUTSIDE the project tree — the project directory is mounted into workers, so a project-scoped authority key would be worker-readable.',
    tr: 'Not: bu materyal bilinçli olarak proje ağacının DIŞINDA tutulur — proje dizini worker\'lara mount edilir, proje kapsamlı bir authority anahtarı worker tarafından okunabilir olurdu.',
  },
  'provider_authority.keyring.init_created': {
    en: 'Provisioned: keyring {keyringId} revision {revision} (hash {revisionHash}) at {dir}. Key material was generated locally and never printed.',
    tr: 'Sağlandı: keyring {keyringId} revizyon {revision} (hash {revisionHash}) — {dir}. Anahtar materyali yerel üretildi ve hiç yazdırılmadı.',
  },
  'provider_authority.keyring.init_exists': {
    en: 'Refused: a keyring already exists ({keyringId}, revision {revision}). Use `rotate --expect-revision {revisionHash}` to roll the active key; init never overwrites.',
    tr: 'Reddedildi: keyring zaten var ({keyringId}, revizyon {revision}). Aktif anahtarı döndürmek için `rotate --expect-revision {revisionHash}`; init asla üzerine yazmaz.',
  },
  'provider_authority.keyring.rotated': {
    en: 'Rotated: revision {revision} (hash {revisionHash}), active key {activeKeyId}. Retired keys stay verifiable.',
    tr: 'Döndürüldü: revizyon {revision} (hash {revisionHash}), aktif anahtar {activeKeyId}. Emekli anahtarlar doğrulanabilir kalır.',
  },
  'provider_authority.keyring.rotate_needs_revision': {
    en: 'Refused: --expect-revision <hash> is required. Read the current hash from `deckent provider-authority keyring status`.',
    tr: 'Reddedildi: --expect-revision <hash> zorunludur. Güncel hash\'i `deckent provider-authority keyring status` çıktısından alın.',
  },
  'provider_authority.keyring.rotate_absent': {
    en: 'Refused: no keyring to rotate. Provision one first with `deckent provider-authority keyring init`.',
    tr: 'Reddedildi: döndürülecek keyring yok. Önce `deckent provider-authority keyring init` ile sağlayın.',
  },
  'doctor.provider_authority_keyring_name': {
    en: 'Provider authority keyring',
    tr: 'Provider authority keyring',
  },
  'doctor.provider_authority_keyring_ok': {
    en: 'provisioned (revision {revision})',
    tr: 'sağlanmış (revizyon {revision})',
  },
  'doctor.provider_authority_keyring_absent': {
    en: 'not provisioned — every run will hold with `keyring_unavailable`; owner remedy: `deckent provider-authority keyring init`',
    tr: 'sağlanmamış — her run `keyring_unavailable` ile bekler; sahip çözümü: `deckent provider-authority keyring init`',
  },
  'doctor.provider_authority_keyring_unreadable': {
    en: 'unreadable ({code}) — runs will hold; inspect with `deckent provider-authority keyring status`',
    tr: 'okunamıyor ({code}) — run\'lar bekler; `deckent provider-authority keyring status` ile inceleyin',
  },
  // Row 477: E_MODEL_PRICING_UNVERIFIED previously fell into the generic
  // provider_unverified message, which tells the user to "pass --provider" they
  // already passed — misleading. The real remedy is refreshing the verified
  // pricing inventory.
  // ─── xverify — session-level adversarial cross-verification (XVERIFY-TOOL) ──
  'xverify.cmd_desc': {
    en: 'Cross-verify a claim on a DIFFERENT provider; the host derives ALLOW/NO-GO/HOLD from typed evidence',
    tr: 'Bir iddiayı FARKLI sağlayıcıda çapraz doğrula; ALLOW/NO-GO/HOLD kararını typed kanıttan host üretir',
  },
  'xverify.opt_author': {
    en: 'Provider that authored the claimed work ({providers}) — the verifier must differ. Required.',
    tr: 'İddia edilen işi yapan sağlayıcı ({providers}) — hakem farklı olmak zorundadır. Zorunlu.',
  },
  'xverify.opt_verifier': {
    en: 'Explicit verifier provider (optional; must differ from --author; default: cross_verify.verifier_priority)',
    tr: 'Açık hakem sağlayıcısı (opsiyonel; --author ile aynı olamaz; varsayılan: cross_verify.verifier_priority)',
  },
  'xverify.opt_verifier_model': {
    en: 'Explicit verifier model id (canonical provider API id, e.g. gpt-5.6-sol) — bypasses tier-equivalence resolution',
    tr: 'Açık hakem model kimliği (kanonik sağlayıcı API id, örn. gpt-5.6-sol) — tier-eşdeğerlik çözümlemesini atlar',
  },
  'xverify.opt_diff': {
    en: 'Attach `git diff HEAD` as evidence context for the verifier',
    tr: 'Hakeme kanıt bağlamı olarak `git diff HEAD` çıktısını ekle',
  },
  'xverify.opt_files': {
    en: 'Comma-separated list of files the claim says were changed',
    tr: 'İddianın değiştirildiğini söylediği dosyaların virgülle ayrılmış listesi',
  },
  'xverify.opt_timeout': {
    en: 'Verifier timeout in milliseconds (default: 300000)',
    tr: 'Hakem zaman aşımı, milisaniye (varsayılan: 300000)',
  },
  'xverify.opt_json': {
    en: 'Machine-readable JSON output (for the MCP twin / session-to-session use)',
    tr: 'Makine-okunur JSON çıktısı (MCP eşi / oturumlar-arası kullanım için)',
  },
  'xverify.err.author_required': {
    en: '--author is required and must be one of: {providers}. The verifier is chosen to DIFFER from it.',
    tr: '--author zorunludur ve şunlardan biri olmalıdır: {providers}. Hakem ondan FARKLI seçilir.',
  },
  'xverify.err.unknown_verifier': {
    en: 'Unknown verifier "{provider}" — valid providers: {providers}.',
    tr: 'Bilinmeyen hakem "{provider}" — geçerli sağlayıcılar: {providers}.',
  },
  'xverify.err.self_verify': {
    en: 'Verifier must differ from --author ("{provider}") — self-verification defeats the purpose of an independent second opinion.',
    tr: 'Hakem --author ("{provider}") ile aynı olamaz — öz-doğrulama bağımsız ikinci görüşün amacını boşa çıkarır.',
  },
  'xverify.dispatching': {
    en: 'Dispatching adversarial verifier (author: {author}, priority: {priority})…',
    tr: 'Hakem gönderiliyor (iddia sahibi: {author}, öncelik: {priority})…',
  },
  'xverify.verdict': {
    en: 'Verdict: {verdict} (verifier: {verifier}) — host adjudication report: {report}',
    tr: 'Karar: {verdict} (hakem: {verifier}) — host adjudication raporu: {report}',
  },
  'xverify.final_only_risk': {
    en: 'Risk: {verifier} reports usage only when the call ends — token ceilings settle afterwards. Containment for this call is the host wall clock: {seconds}s.',
    tr: 'Risk: {verifier} kullanımı yalnız çağrı bitince bildirir — token tavanları sonradan hesaplanır. Bu çağrının sınırı host duvar-saati: {seconds}sn.',
  },
  'xverify.report.execution': {
    en: '**Execution outcome:** {outcome} (initial attempt: {initial}, terminal attempt: {terminal})',
    tr: '**Çalıştırma sonucu:** {outcome} (ilk deneme: {initial}, terminal deneme: {terminal})',
  },
  'xverify.report.cumulative_usage': {
    en: '**Cumulative host usage:** {turns} turns · {tokens} total tokens · {cacheRead} cache-read tokens',
    tr: '**Kümülatif host kullanımı:** {turns} turn · {tokens} toplam token · {cacheRead} cache-read token',
  },
  'xverify.report.verifier_model': {
    en: '**Verifier model:** {model}',
    tr: '**Hakem modeli:** {model}',
  },
  'xverify.report.none_dispatched': {
    en: '(none dispatched)',
    tr: '(çalıştırma yok)',
  },
  // A verifier that was never dispatched produced no verdict. An em dash says
  // that; UNCLEAR would claim the verifier ran and could not decide.
  'xverify.report.no_verdict': {
    en: '— (no verdict — verifier produced no output)',
    tr: '— (karar yok — hakem çıktı üretmedi)',
  },
  // Worker-facing prompt fragments (deliberately EN-only content, keyed for
  // single-source maintenance — the VERIFIER reads these, not the operator).
  'xverify.go_criteria': {
    en: 'The bounded evidence supports every material factual premise of the claim and, when the claim proposes a dependency order, supports that order without a prerequisite reversal.',
    tr: 'Sınırlı kanıt, iddianın her maddi olgusal öncülünü ve iddia bir bağımlılık sırası öneriyorsa önkoşul tersine dönmeden bu sırayı destekler.',
  },
  'xverify.nogo_criteria': {
    en: 'The bounded evidence directly contradicts a material factual premise or proves a concrete safety, correctness, evidence, or dependency-order gap. Missing evidence alone is not NO-GO; it requires UNCLEAR.',
    tr: 'Sınırlı kanıt, maddi bir olgusal öncülü doğrudan çürütür veya somut bir güvenlik, doğruluk, kanıt ya da bağımlılık-sırası boşluğunu kanıtlar. Eksik kanıt tek başına NO-GO değildir; UNCLEAR gerektirir.',
  },
  'xverify.mcp.title': {
    en: 'Cross-verify (host adjudicated)',
    tr: 'Çapraz doğrula (host kararlı)',
  },
  'xverify.mcp.description': {
    en: 'Dispatch an adversarial verifier on a different provider. Provider output is evidence; the host returns CONFIRMED/REFUTED/UNCLEAR plus an authoritative ALLOW/NO-GO/HOLD disposition.',
    tr: 'Farklı sağlayıcıda adversarial hakem çalıştırır. Sağlayıcı çıktısı kanıttır; host CONFIRMED/REFUTED/UNCLEAR ile yetkili ALLOW/NO-GO/HOLD disposition döndürür.',
  },
  'xverify.mcp.claim': {
    en: 'Exact authored claim to cross-verify',
    tr: 'Çapraz doğrulanacak exact authored iddia',
  },
  'xverify.mcp.author': {
    en: 'Provider that authored the claim; verifier must differ',
    tr: 'İddiayı yazan sağlayıcı; hakem farklı olmalıdır',
  },
  'xverify.mcp.verifier': {
    en: 'Explicit verifier provider; must differ from author',
    tr: 'Açık hakem sağlayıcısı; yazardan farklı olmalıdır',
  },
  'xverify.mcp.verifier_model': {
    en: 'Exact canonical verifier model API id',
    tr: 'Exact kanonik hakem model API kimliği',
  },
  'xverify.mcp.diff': {
    en: 'Record a bounded host-side git diff context; v2 evidence remains broker-owned',
    tr: 'Sınırlı host-side git diff bağlamını kaydet; v2 kanıtı broker yönetir',
  },
  'xverify.mcp.files': {
    en: 'Comma-separated exact project-relative evidence files',
    tr: 'Virgülle ayrılmış exact proje-relative kanıt dosyaları',
  },
  'xverify.mcp.timeout': {
    en: 'Verifier timeout in milliseconds (default 300000)',
    tr: 'Hakem zaman aşımı, milisaniye (varsayılan 300000)',
  },
  'xverify.mcp.failed': {
    en: 'xverify failed: {error}',
    tr: 'xverify başarısız: {error}',
  },
  'run.model_err.pricing_unverified': {
    en: 'Cannot use model "{model}": its OpenRouter pricing is unverified. '
      + 'Run `deckent openrouter-probe` to refresh the verified free-model inventory, '
      + 'or supply explicit pricing for a paid model.',
    tr: '"{model}" modeli kullanılamıyor: OpenRouter fiyatlandırması doğrulanmamış. '
      + 'Doğrulanmış ücretsiz-model envanterini yenilemek için `deckent openrouter-probe` çalıştırın '
      + 'veya ücretli bir model için açık fiyatlandırma sağlayın.',
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
  'plan.force_scope_option': {
    en: 'Acknowledge suspect scope paths for this exact plan',
    tr: 'Bu exact plan için şüpheli kapsam yollarını açıkça kabul et',
  },
  'plan.adopt_existing_option': {
    en: 'Explicitly reconcile an existing legacy Sprint projection into this exact plan',
    tr: 'Mevcut legacy Sprint projection’ını bu exact planla açıkça reconcile et',
  },
  'plan.expected_plan_digest_option': {
    en: 'Owner-observed V4 execution-plan digest required for adoption',
    tr: 'Adoption için gerekli, owner tarafından gözlemlenmiş V4 execution-plan digest’i',
  },
  'plan.expected_projection_digest_option': {
    en: 'Owner-observed legacy task-projection digest required for adoption',
    tr: 'Adoption için gerekli, owner tarafından gözlemlenmiş legacy task-projection digest’i',
  },
  'plan.expected_canonical_projection_digest_option': {
    en: 'Owner-observed post-reconciliation task-projection digest required for adoption',
    tr: 'Adoption için gerekli, owner tarafından gözlemlenmiş reconciliation-sonrası task-projection digest’i',
  },
  'plan.adoption_actor_option': {
    en: 'Stable owner/principal identity authorizing projection adoption',
    tr: 'Projection adoption’ını yetkilendiren kalıcı owner/principal kimliği',
  },
  'plan.adoption_justification_option': {
    en: 'Bound operator justification for the one-time projection adoption',
    tr: 'Tek seferlik projection adoption için bağlanan operator gerekçesi',
  },
  'plan.adoption_authority_required': {
    en: 'Exact adoption requires all three expected digests, an adoption actor, and a justification. Run the adoption dry-run first.',
    tr: 'Exact adoption üç expected digest’in tamamını, adoption actor’ını ve gerekçeyi gerektirir. Önce adoption dry-run çalıştırın.',
  },
  'plan.adoption_dependency_hold': {
    en: 'Projection adoption is on HOLD because the fresh plan contains unresolved dependencies.',
    tr: 'Fresh plan çözümlenmemiş dependency içerdiği için projection adoption HOLD durumunda.',
  },
  'plan.adoption_inspection_ready': {
    en: 'Adoption inspection for {sprintId} is ready with {count} exact tasks; no task file or canonical plan was changed.',
    tr: '{sprintId} için adoption incelemesi {count} exact task ile hazır; hiçbir task dosyası veya canonical plan değiştirilmedi.',
  },
  'plan.adoption_approved': {
    en: 'Legacy projection {sprintId} is bound to the approved exact plan. Its additive schema migration remains admission-gated until exact start.',
    tr: 'Legacy projection {sprintId} onaylı exact plana bağlandı. Additive schema migration, exact start’a kadar admission-gated kalacak.',
  },
  'plan.adoption_hold': {
    en: 'Exact projection adoption is on HOLD: {reason}. Existing task files were preserved.',
    tr: 'Exact projection adoption HOLD durumunda: {reason}. Mevcut task dosyaları korundu.',
  },
  'plan.task_projection_invalid_id': {
    en: 'Exact plan task "{taskId}" cannot be represented as a portable task artifact. The canonical plan was not executed.',
    tr: 'Exact plandaki "{taskId}" görevi portable bir task artifact olarak temsil edilemiyor. Canonical plan yürütülmedi.',
  },
  'plan.task_projection_conflict': {
    en: 'Task artifact "{taskId}" conflicts with the exact plan. Existing files were preserved; explicit reconciliation is required.',
    tr: '"{taskId}" task artifact’i exact planla çakışıyor. Mevcut dosyalar korundu; açık reconciliation gerekiyor.',
  },
  'plan.task_projection_directory_hold': {
    en: 'The project task-artifact directory is outside the verified project boundary or is not a regular directory. Planning is on HOLD.',
    tr: 'Projenin task-artifact dizini doğrulanmış proje sınırının dışında veya regular directory değil. Planlama HOLD durumunda.',
  },
  'plan.task_projection_durability_hold': {
    en: 'The platform could not prove durable atomic publication of the exact plan task artifacts. Existing files were preserved; planning is on HOLD.',
    tr: 'Platform, exact plan task artifact’lerinin durable atomic yayımını kanıtlayamadı. Mevcut dosyalar korundu; planlama HOLD durumunda.',
  },
  'plan.mcp_approve_option': {
    en: 'Approve and durably bind the generated exact plan',
    tr: 'Üretilen exact planı onayla ve durable olarak bağla',
  },
  'plan.mcp_ack_scope_option': {
    en: 'Acknowledge suspect scope paths for this exact plan',
    tr: 'Bu exact plan için şüpheli kapsam yollarını açıkça kabul et',
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
  // Dogfood-449 B1 / 452-003 — scope-gate mirror verdict, shared verbatim by
  // formatScopeGateLines (plan-preview-card.tsx) between the REPL card AND
  // the CLI (do.ts's formatRunFlowDoPreview) — the two must never diverge.
  'runFlow.planPreview.scopeGate.fail': {
    en: 'Scope gate: FAIL',
    tr: 'Scope-gate: BAŞARISIZ',
  },
  'runFlow.planPreview.scopeGate.overridden': {
    en: 'Scope gate: overridden via --force-scope — the child will spawn anyway.',
    tr: 'Scope-gate: --force-scope ile bilinçli geçildi — child yine de doğacak.',
  },
  'runFlow.planPreview.topology.pass': {
    en: 'Execution topology: PASS',
    tr: 'Yürütme topolojisi: GEÇTİ',
  },
  'runFlow.planPreview.topology.block': {
    en: 'Execution topology: BLOCK',
    tr: 'Yürütme topolojisi: BLOKE',
  },
  'runFlow.planPreview.topology.concurrency': {
    en: 'Concurrency (configured/effective):',
    tr: 'Eşzamanlılık (yapılandırılmış/etkin):',
  },
  'runFlow.planPreview.topology.collisions': {
    en: 'Shared writers:',
    tr: 'Ortak yazıcılar:',
  },
  'runFlow.planPreview.topology.syntheticEdges': {
    en: 'Safety edges:',
    tr: 'Güvenlik kenarları:',
  },
  'runFlow.planPreview.topology.waves': {
    en: 'Effective waves:',
    tr: 'Etkin dalgalar:',
  },
  'runFlow.planPreview.topology.findings': {
    en: 'Structural findings:',
    tr: 'Yapısal bulgular:',
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
    en: 'No active run (sprint). Run `deckent start` first.',
    tr: 'Aktif run (sprint) yok. Önce `deckent start` çalıştırın.',
  },
  'status.pending_approvals.header': {
    en: '⏳ Pending approvals: {count} — act in the run terminal or the dashboard:',
    tr: '⏳ Bekleyen onaylar: {count} — run terminalinde veya dashboard\'tan onayla:',
  },
  'status.pending_approvals.more': {
    en: '… and {count} more (run `deckent nervous` to see all)',
    tr: '… ve {count} tane daha (hepsi için: `deckent nervous`)',
  },
  'pause.notification_title': {
    en: 'Run {sprintId} is paused and awaiting a continuation decision',
    tr: '{sprintId} run’ı duraklatıldı ve devam kararı bekliyor',
  },
  'pause.notification_summary': {
    en: '{reason}. Verify the recovery preview, then continue with: {command}',
    tr: '{reason}. Kurtarma önizlemesini doğrulayıp şu komutla devam edin: {command}',
  },
  'pause.post_fix_circuit_breaker_reason': {
    en: '{unresolved}/{total} logical tasks remain NO_GO after the admitted FIX budget ({ratio}%; count threshold {countThreshold}, ratio threshold {ratioThreshold}%). The run was paused to prevent an unbounded repair cascade.',
    tr: 'Kabul edilen FIX bütçesi sonrasında {unresolved}/{total} logical task hâlâ NO_GO ({ratio}%; sayı eşiği {countThreshold}, oran eşiği %{ratioThreshold}). Sınırsız bir düzeltme zincirini önlemek için run duraklatıldı.',
  },
  'pause.exhausted_repair_blocks_dependents_reason': {
    en: 'The admitted FIX budget is exhausted for {unresolvedTasks}, and unfinished dependent tasks remain blocked: {blockedTasks}. The run was paused with its recovery authority preserved; COMPLETE is not an allowed settlement.',
    tr: '{unresolvedTasks} için kabul edilen FIX bütçesi tükendi ve tamamlanmamış bağımlı task’lar bloke kaldı: {blockedTasks}. Recovery authority korunarak run duraklatıldı; COMPLETE geçerli bir settlement değildir.',
  },
  'pause.unresolved_lineage_operator_decision_reason': {
    en: 'Logical tasks remain unresolved after repair settlement: {unresolvedTasks}. The circuit-breaker threshold was not reached, but COMPLETE is still invalid; the run is paused for an explicit recovery or force-finalize decision.',
    tr: 'Repair settlement sonrasında çözümlenmemiş logical task’lar kaldı: {unresolvedTasks}. Circuit-breaker eşiğine ulaşılmadı ancak COMPLETE yine de geçersiz; run açık bir recover veya force-finalize kararı için duraklatıldı.',
  },
  'pause.action_resume': {
    en: 'Resume',
    tr: 'Sürdür',
  },
  'pause.action_finalize': {
    en: 'Force finalize',
    tr: 'Zorla sonlandır',
  },
  'status.dashboard_read_failed': {
    en: 'Failed to read dashboard file.',
    tr: 'Dashboard dosyası okunamadı.',
  },
  'status.read_model_hold': {
    en: 'RUN_STATUS_READ_MODEL_UNAVAILABLE: live run status is held until the canonical persisted read model is republished.',
    tr: 'RUN_STATUS_READ_MODEL_UNAVAILABLE: canlı run durumu canonical persisted read model yeniden yayımlanana kadar HOLD durumundadır.',
  },
  'status.desc': {
    en: 'Show the current run dashboard',
    tr: 'Güncel run dashboard\'ını göster',
  },
  'status.graph_no_active_run': {
    en: 'No active run found — cannot display dependency graph.',
    tr: 'Aktif run bulunamadı — bağımlılık grafiği gösterilemiyor.',
  },
  'status.graph_not_found': {
    en: 'No dependency graph found for {id}.\nStart a run with dependencies to generate the graph.',
    tr: '{id} için bağımlılık grafiği bulunamadı.\nGrafiği oluşturmak için bağımlılıkları olan bir run başlatın.',
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
  'cleanup.sprint_option': {
    en: 'Clean only artifacts owned by the exact sprint ID',
    tr: 'Yalnız exact sprint ID tarafından owned artifaktları temizle',
  },
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
  'cleanup.authority_hold': {
    en: 'Cleanup held for {sprintId}: {reason}. Recover or finalize the run before removing mutable projections.',
    tr: '{sprintId} cleanup işlemi beklemeye alındı: {reason}. Değişebilir projection kayıtlarını kaldırmadan önce run’ı recover veya finalize edin.',
  },
  'cleanup.archive_hold': {
    en: 'Cleanup held: {count} owned task artifact(s) could not be archived and byte-verified ({files}). Live evidence was retained.',
    tr: 'Cleanup beklemeye alındı: {count} owned task artifaktı arşivlenip byte-verify edilemedi ({files}). Live kanıt korundu.',
  },
  'lifecycle.execution_lock_bind_failed': {
    en: 'Project leadership could not be bound to execution {sprintId}.',
    tr: 'Project leadership execution {sprintId} ile bağlanamadı.',
  },
  'lifecycle.coordinator_pid_authority_required': {
    en: 'Coordinator PID authority could not be established for execution {sprintId}.',
    tr: 'Execution {sprintId} için coordinator PID authority oluşturulamadı.',
  },
  'kill.settlements_reconciled': {
    en: 'Closed {count} host-owned execution settlement(s) after containment.',
    tr: 'Containment sonrası {count} host-owned execution settlement kapatıldı.',
  },
  'kill.settlement_recovery_failed': {
    en: 'Workers were contained, but host-owned execution settlement recovery failed: {reason}',
    tr: 'Worker containment tamamlandı ancak host-owned execution settlement recovery başarısız oldu: {reason}',
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
  'finalize.aborted': {
    en: 'Run {sprintId} was force-finalized as ABORTED: {done}/{total} logical tasks were done and {unresolved} remained unresolved. No unresolved lineage was promoted to COMPLETE.',
    tr: 'Run {sprintId}, ABORTED olarak zorla kapatıldı: {total} logical taskın {done} tanesi tamamlanmıştı, {unresolved} tanesi unresolved kaldı. Hiçbir unresolved lineage COMPLETE durumuna yükseltilmedi.',
  },
  'finalize.coordinator_terminated': {
    en: 'Coordinator PID {pid} reached verified termination ({escalation}).',
    tr: 'Coordinator PID {pid} doğrulanmış biçimde sonlandı ({escalation}).',
  },
  'finalize.coordinator_hold': {
    en: 'Finalize held: coordinator PID {pid} could not reach verified termination ({reason}). PID authority was preserved.',
    tr: 'Finalize beklemeye alındı: coordinator PID {pid} doğrulanmış biçimde sonlandırılamadı ({reason}). PID authority korundu.',
  },
  'finalize.description': {
    en: 'Finalize a sprint: update MEMORY.md, RETRO.md, IDENTITY.md, config, and run decay',
    tr: 'Bir sprinti sonlandır: MEMORY.md, RETRO.md, IDENTITY.md, config ve run decay güncelle',
  },
  'finalize.sprint_option': { en: 'Specific sprint ID to finalize (e.g. sprint-063); defaults to task auto-detection', tr: 'Sonlandırılacak belirli sprint kimliği (örn. sprint-063); varsayılan görevlerden otomatik algılamadır' },
  'finalize.skip_decay_option': { en: 'Skip the memory/debt decay phase', tr: 'Memory/debt decay aşamasını atla' },
  'finalize.skip_hooks_option': { en: 'Skip plugin afterSprint hooks', tr: 'Plugin afterSprint hooklarını atla' },
  'finalize.force_option': { en: 'Finalize even if tasks are in progress or the sprint is already finalized', tr: 'Görevler sürüyorsa veya sprint zaten sonlandıysa da sonlandır' },
  'finalize.notification_title': { en: 'Sprint {sprintId} finalized', tr: 'Sprint {sprintId} kapandı' },
  'finalize.notification_summary': { en: '{done}/{total} DONE, {debt} TECH_DEBT, {noGo} NO_GO, {unevaluated} UNEVALUATED', tr: '{done}/{total} DONE, {debt} TECH_DEBT, {noGo} NO_GO, {unevaluated} DEĞERLENDİRİLMEDİ' },
  'finalize.attribution_excluded': { en: '{count} work claim(s) excluded: exact attempt attribution was HOLD or unavailable', tr: '{count} iş iddiası dışlandı: exact attempt attribution HOLD veya unavailable durumundaydı' },
  'finalize.mixed_sprints': { en: 'Warning: mixed sprint IDs detected: {sprintIds}. Proceeding with {sprintId}.', tr: 'Uyarı: karışık sprint kimlikleri algılandı: {sprintIds}. {sprintId} ile devam ediliyor.' },
  'finalize.incomplete_tasks': { en: 'Cannot finalize: {count} task(s) are still in progress ({ids}). Use --force to override.', tr: 'Sonlandırılamaz: {count} görev hâlâ sürüyor ({ids}). Geçersiz kılmak için --force kullanın.' },
  'finalize.force_incomplete_tasks': { en: 'Warning: forcing finalize with {count} in-progress task(s).', tr: 'Uyarı: {count} sürmekte olan görevle sonlandırma zorlanıyor.' },
  'finalize.workers_terminated': { en: 'Terminated {count} live worker(s): {ids}', tr: '{count} canlı worker sonlandırıldı: {ids}' },
  'finalize.workers_termination_failed': { en: 'Cannot finalize: {count} worker(s) could not be terminated ({ids}); terminal settlement is on HOLD.', tr: 'Sonlandırılamaz: {count} worker sonlandırılamadı ({ids}); terminal settlement HOLD durumunda.' },
  'finalize.already_finalized': { en: 'Sprint {sprintId} has already been finalized. Use --force to re-finalize.', tr: 'Sprint {sprintId} zaten sonlandırıldı. Yeniden sonlandırmak için --force kullanın.' },

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
  'doctor.provider_auth_confirmed': {
    en: 'authentication confirmed ({method})',
    tr: 'kimlik doğrulama onaylandı ({method})',
  },
  'doctor.provider_auth_method_subscription': {
    en: 'subscription session',
    tr: 'abonelik oturumu',
  },
  'doctor.provider_auth_method_api_key': {
    en: 'API key',
    tr: 'API anahtarı',
  },
  'doctor.provider_auth_method_unclassified': {
    en: 'provider session',
    tr: 'sağlayıcı oturumu',
  },
  'doctor.provider_auth_logged_out': {
    en: 'CLI present but NOT logged in — run: {command}',
    tr: 'CLI mevcut ama oturum AÇILMAMIŞ — çalıştırın: {command}',
  },
  'doctor.provider_auth_unknown': {
    en: 'CLI present but authentication could not be verified',
    tr: 'CLI mevcut ama kimlik doğrulama teyit edilemedi',
  },
  'doctor.provider_auth_check_name': {
    en: '{provider} authentication',
    tr: '{provider} kimlik doğrulaması',
  },
  'doctor.provider_auth_recommendation': {
    en: '{count} provider authentication warning(s) remain. Start only with providers whose authentication is confirmed.',
    tr: '{count} sağlayıcı kimlik doğrulama uyarısı sürüyor. Yalnız kimlik doğrulaması onaylanmış sağlayıcılarla başlatın.',
  },
  'doctor.provider_local_runtime_available': {
    en: 'local runtime available (authentication not required)',
    tr: 'yerel çalışma zamanı kullanılabilir (kimlik doğrulama gerekmiyor)',
  },
  'doctor.provider_diagnostics_auth_missing': {
    en: 'binary OK, authentication missing',
    tr: 'binary hazır, kimlik doğrulama eksik',
  },
  'doctor.provider_diagnostics_auth_unverified': {
    en: 'binary OK, authentication unverified',
    tr: 'binary hazır, kimlik doğrulama teyit edilmedi',
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
  'kill.sprints_aborted': {
    en: '{count} sprint(s) aborted; no active workers remained.',
    tr: '{count} sprint sonlandırıldı; aktif worker kalmamıştı.',
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
  'agent.create.description': {
    en: 'Create a custom agent (use --prompt/--description for wizard-style setup)',
    tr: 'Özel bir agent oluştur (--prompt/--description ile yönlendirmeli kurulum)',
  },
  'agent.create.option_model': {
    en: 'Canonical provider API model ID (defaults to the active config)',
    tr: 'Canonical provider API model kimliği (varsayılan: aktif config)',
  },
  'agent.create.option_triggers': {
    en: 'Trigger keywords for task routing',
    tr: 'Task routing için tetikleyici anahtar kelimeler',
  },
  'agent.create.option_prompt': {
    en: 'Set the agent system prompt content directly (written to PROMPT.md)',
    tr: 'Agent system prompt içeriğini doğrudan ayarla (PROMPT.md dosyasına yazılır)',
  },
  'agent.create.option_description': {
    en: 'Set the agent description',
    tr: 'Agent açıklamasını ayarla',
  },
  'agent.create.invalid_name': {
    en: 'Invalid agent name "{name}". Use alphanumeric characters and hyphens only.',
    tr: 'Geçersiz agent adı "{name}". Yalnız alfanümerik karakter ve tire kullanın.',
  },
  'agent.create.invalid_model': {
    en: 'Invalid or unregistered canonical model "{model}". Registered API IDs: {models}',
    tr: 'Geçersiz veya kayıtlı olmayan canonical model "{model}". Kayıtlı API kimlikleri: {models}',
  },
  'agent.create.trigger_empty': {
    en: 'Empty trigger keyword',
    tr: 'Boş tetikleyici anahtar kelime',
  },
  'agent.create.trigger_invalid': {
    en: 'Invalid trigger "{trigger}": use alphanumeric chars, hyphens, underscores, dots, or wildcards',
    tr: 'Geçersiz tetikleyici "{trigger}": alfanümerik karakter, tire, alt çizgi, nokta veya joker kullanın',
  },
  'agent.create.invalid_triggers': {
    en: 'Invalid triggers:\n  {errors}',
    tr: 'Geçersiz tetikleyiciler:\n  {errors}',
  },
  'agent.create.exists': {
    en: 'Agent "{name}" already exists.',
    tr: '"{name}" agent\'ı zaten var.',
  },
  'agent.create.default_description': {
    en: 'Custom agent: {name}',
    tr: 'Özel agent: {name}',
  },
  'agent.create.created': {
    en: 'Agent "{name}" created at {path}',
    tr: '"{name}" agent\'ı {path} konumunda oluşturuldu',
  },
  'agent.create.file': { en: '  - {file}', tr: '  - {file}' },
  'agent.create.model': { en: '  Model: {model}', tr: '  Model: {model}' },
  'agent.create.description_value': {
    en: '  Description: {description}',
    tr: '  Açıklama: {description}',
  },
  'agent.create.triggers': { en: '  Triggers: {triggers}', tr: '  Tetikleyiciler: {triggers}' },
  'agent.create.prompt': {
    en: '  Prompt: (custom, {chars} chars)',
    tr: '  Prompt: (özel, {chars} karakter)',
  },
  'test.model_invalid': {
    en: 'Invalid or unregistered canonical model: {model}',
    tr: 'Geçersiz veya kayıtlı olmayan canonical model: {model}',
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
  'init.option_yes': {
    en: 'Use non-interactive defaults; never install missing prerequisites',
    tr: 'Etkileşimsiz varsayılanları kullan; eksik önkoşulları asla kurma',
  },
  'init.option_install': {
    en: 'Explicitly install supported missing prerequisites without prompting',
    tr: 'Desteklenen eksik önkoşulları açık yetkiyle ve sormadan kur',
  },
  'init.option_no_install': {
    en: 'Detect missing prerequisites but never install them',
    tr: 'Eksik önkoşulları algıla ancak asla kurma',
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
  // TERM-AT-REF (583/N2b) — hint under the InputBar's `@` path menu.
  'tui.atref_menu_hint': {
    en: '↑↓ move · Tab/Enter insert path · Esc close',
    tr: '↑↓ gez · Tab/Enter yolu ekle · Esc kapat',
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
  'native.switch.legacy-model-alias': {
    en: 'switch failed — "{detail}" is a legacy alias; use an exact provider API model ID such as claude-sonnet-5 or gpt-5.6-sol',
    tr: 'geçiş başarısız — "{detail}" eski bir takma addır; claude-sonnet-5 veya gpt-5.6-sol gibi tam sağlayıcı API model kimliği kullanın',
  },
  // REPL-575 K6 — an unrecognized non-claude model id refused instead of shipped
  // at the Anthropic transport with a false 'switched' report.
  'native.switch.unknown-model': {
    en: 'switch failed — unknown model "{detail}": use an exact registered provider API model ID or switch provider first',
    tr: 'geçiş başarısız — bilinmeyen model "{detail}": tam kayıtlı sağlayıcı API model kimliği kullanın veya önce sağlayıcı değiştirin',
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
  // 583/N4 — git confirm summaries (add/commit = the human seal, KARAR-2).
  'tool.confirm_git_add': {
    en: 'Stage changes: {paths}',
    tr: 'Değişiklikleri stage et: {paths}',
  },
  'tool.confirm_git_commit': {
    en: 'Commit: {subject}',
    tr: 'Commit: {subject}',
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
  'autonomous.plan_mission_written': {
    en: 'Wrote {count} item(s) atomically to MissionStore mission {missionId} (pending).',
    tr: '{count} madde MissionStore mission {missionId} içine atomik yazıldı (pending).',
  },
  'autonomous.plan_mission_replayed': {
    en: 'MissionStore mission {missionId} already contains the exact {count}-item plan; no duplicate was created.',
    tr: 'MissionStore mission {missionId} aynı {count} maddelik planı zaten içeriyor; mükerrer kayıt oluşturulmadı.',
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
  'autonomous.plan_kind_rejected': {
    en: 'Goal-v2 rejected item {id} ({kind}) before persistence: {reason}. Live-admitted kinds: {allowed}.',
    tr: 'Goal-v2, {id} ({kind}) maddesini kalıcı kayıttan önce reddetti: {reason}. Canlı kabul edilen türler: {allowed}.',
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
  'memory.export.not_found': {
    en: 'memory.db not found. Run migration first.',
    tr: 'memory.db bulunamadı. Önce migration çalıştırın.',
  },
  'memory.export.success': {
    en: 'Exported {count} .md files to .brain/exports/.',
    tr: '.brain/exports/ dizinine {count} .md dosyası aktarıldı.',
  },
  'memory.export.guard_hold': {
    en: 'Export held: preserved {files} because existing snapshots contain more authority data than this memory.db ({written} safe file(s) written). Reconcile the project database before retrying.',
    tr: 'Export bekletildi: mevcut snapshot bu memory.db dosyasından daha fazla otorite verisi içerdiği için {files} korundu ({written} güvenli dosya yazıldı). Yeniden denemeden önce proje veritabanını uzlaştırın.',
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
  'serve.approval_authority_hold': {
    en: 'Attended execution approval authority is on HOLD ({reason}/{detail}); API decisions cannot authorize unsupported remote execution.',
    tr: 'Attended execution approval authority HOLD durumunda ({reason}/{detail}); API kararları desteklenmeyen remote execution için yetki veremez.',
  },
  'api.approval.fresh_oidc_required': {
    en: 'Fresh OIDC step-up authentication is required.',
    tr: 'Yeni bir OIDC step-up kimlik doğrulaması gereklidir.',
  },
  'api.approval.idempotency_required': {
    en: 'Idempotency-Key header is required.',
    tr: 'Idempotency-Key başlığı gereklidir.',
  },
  'api.approval.authority_unavailable': {
    en: 'Attended execution approval authority is unavailable.',
    tr: 'Attended execution approval authority kullanılamıyor.',
  },
  'api.approval.decision_rejected': {
    en: 'Approval decision rejected: {reason}',
    tr: 'Approval kararı reddedildi: {reason}',
  },
  'api.approval.request_expired': {
    en: 'Approval request expired.',
    tr: 'Approval isteğinin süresi doldu.',
  },
  'api.approval.decision_failed': {
    en: 'Approval decision failed: {error}',
    tr: 'Approval kararı başarısız oldu: {error}',
  },
  'autonomous.approval_request_summary': {
    en: 'Approve Goal-v2 item {id}: {title}',
    tr: 'Goal-v2 iş kalemini onayla {id}: {title}',
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
  'bot.stop_desc': {
    en: 'Stop the bot daemon',
    tr: 'Bot daemon\'ını durdur',
  },
  'bot.status_desc': {
    en: 'Show whether the bot daemon is running',
    tr: 'Bot daemon\'ının çalışıp çalışmadığını göster',
  },
  'bot.root_option': {
    en: 'Project root override',
    tr: 'Proje kökü geçersiz kılma değeri',
  },
  'bot.lang_option': {
    en: 'Language override (en|tr)',
    tr: 'Dil geçersiz kılma değeri (en|tr)',
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
  'bot.daemon_pid_record_failed': {
    en: '⚠️ Bot listener started, but its process ownership record could not be claimed. The listener was stopped safely.',
    tr: '⚠️ Bot dinleyicisi başladı ancak process ownership kaydı alınamadı. Dinleyici güvenli biçimde durduruldu.',
  },
  'bot.daemon_ownership_unknown': {
    en: '⛔ Bot process ownership cannot be proven (pid {pid}, reason {reason}); no signal or new daemon was issued.',
    tr: '⛔ Bot process ownership kanıtlanamıyor (pid {pid}, neden {reason}); sinyal gönderilmedi ve yeni daemon başlatılmadı.',
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
  'recover.snapshot_required': { en: 'Recovery stopped: a verified snapshot for {sprintId} could not be created.', tr: 'Kurtarma durduruldu: {sprintId} için doğrulanmış snapshot oluşturulamadı.' },
  'recover.dry_run_restore_conflict': { en: '--dry-run and --restore-tasks cannot be combined; no action was taken.', tr: '--dry-run ve --restore-tasks birlikte kullanılamaz; hiçbir işlem yapılmadı.' },
  'recover.json_requires_force': { en: 'Mutating JSON recovery requires explicit --force.', tr: 'Değişiklik yapan JSON kurtarma açıkça --force gerektirir.' },
  'recover.restore_requires_force': { en: 'Snapshot restoration requires explicit --force.', tr: 'Snapshot geri yükleme açıkça --force gerektirir.' },
  'recover.archive_incomplete': { en: 'Recovery stopped: archive evidence is incomplete (expected {expected}, archived {actual}).', tr: 'Kurtarma durduruldu: arşiv kanıtı eksik (beklenen {expected}, arşivlenen {actual}).' },
  'recover.resume_restore_conflict': { en: '--resume and --restore-tasks are mutually exclusive.', tr: '--resume ve --restore-tasks birlikte kullanılamaz.' },
  'recover.resume_json_conflict': { en: '--resume streams the canonical resume command and cannot be combined with --json.', tr: '--resume canonical resume komutunun çıktısını aktarır ve --json ile birlikte kullanılamaz.' },
  'recover.resume_option': { en: 'Resume a canonically PAUSED/ORPHANED run through its durable checkpoint', tr: 'Canonical PAUSED/ORPHANED run’ı kalıcı checkpoint üzerinden sürdür' },
  'recover.auto_approve_option': { en: 'Forward auto-approval to the resumed worker run', tr: 'Otomatik onayı sürdürülen worker run’ına aktar' },
  'recover.force_scope_option': { en: 'Preserve explicit approval for intentional new write paths while resuming', tr: 'Sürdürürken bilinçli yeni yazma yolları için açık onayı koru' },
  'recover.resume_authority_missing': { en: 'Run {sprintId} has no canonical resumable PAUSED/ORPHANED authority.', tr: '{sprintId} için canonical, sürdürülebilir PAUSED/ORPHANED authority bulunamadı.' },
  'recover.resume_entry_missing': { en: 'Deckent CLI entry path is unavailable.', tr: 'Deckent CLI giriş yolu kullanılamıyor.' },
  'recover.invalid_sprint_id': { en: 'Invalid sprint id: {sprintId}', tr: 'Geçersiz sprint kimliği: {sprintId}' },
  'recover.active_authority_refused': { en: 'Recovery refused: run {sprintId} still has live coordinator authority.', tr: 'Kurtarma reddedildi: {sprintId} run’ının canlı coordinator authority kaydı sürüyor.' },
  'recover.approval_required': { en: 'Recovery mutation requires an explicit exact-identity approval for {sprintId}.', tr: '{sprintId} recovery mutation işlemi açık ve exact-identity bağlı onay gerektirir.' },
  'recover.approval_mismatch': { en: 'Recovery approval no longer matches the exact generation or fence for {sprintId}.', tr: 'Recovery onayı artık {sprintId} için exact generation veya fence ile eşleşmiyor.' },
  'recover.settlement_authority_missing': { en: 'Recovery stopped: no canonical settlement authority was derived for {sprintId}.', tr: 'Kurtarma durduruldu: {sprintId} için canonical settlement authority üretilemedi.' },
  'recover.settlement_failed': { en: 'Recovery settlement failed for {sprintId} ({code}).', tr: '{sprintId} recovery settlement işlemi başarısız ({code}).' },
  'recover.description': { en: 'Recover a crashed or stuck sprint through the canonical recovery operation', tr: 'Çökmüş veya takılmış bir sprinti canonical recovery operation ile kurtar' },
  'recover.dry_run_option': { en: 'Preview recovery without making changes', tr: 'Değişiklik yapmadan kurtarmayı önizle' },
  'recover.force_option': { en: 'Skip interactive confirmation', tr: 'Etkileşimli onayı atla' },
  'recover.skip_audit_option': { en: 'Skip the audit gate', tr: 'Denetim kapısını atla' },
  'recover.restore_tasks_option': { en: 'Restore task files from the pre-archive snapshot instead of recovering forward', tr: 'İleri kurtarma yerine görev dosyalarını pre-archive snapshot’tan geri yükle' },
  'recover.json_option': { en: 'Output the stable recovery result as JSON', tr: 'Kararlı kurtarma sonucunu JSON olarak çıktıla' },
  'recover.separator': { en: '  ─────────────────────────────────────────', tr: '  ─────────────────────────────────────────' },
  'recover.internal_error': { en: 'Recovery failed due to an internal operation error.', tr: 'Kurtarma dahili bir operation hatası nedeniyle başarısız oldu.' },
  'recover.unknown_error': { en: 'unknown error', tr: 'bilinmeyen hata' },
  'pause.provider_auth_hold': {
    en: 'Provider {provider} authentication failed at task {taskId}; healthy providers were not stopped. Re-authenticate, then resume this run.',
    tr: '{provider} provider kimlik doğrulaması {taskId} görevinde başarısız oldu; sağlıklı provider\'lar durdurulmadı. Yeniden giriş yapıp bu run\'ı sürdürün.',
  },
  'pause.provider_usage_hold': {
    en: 'Provider {provider} usage authority stopped dispatch at task {taskId}; healthy providers were not stopped. Restore provider availability, then resume this run.',
    tr: '{provider} provider kullanım authority\'si {taskId} görevinde dispatch\'i durdurdu; sağlıklı provider\'lar durdurulmadı. Provider erişimini yenileyip bu run\'ı sürdürün.',
  },
  'prompt_gate.test_not_discoverable': {
    en: 'Planned test path "{path}" is not discoverable by {runner}: {config} includes only [{include}].',
    tr: 'Planlanan "{path}" test yolu {runner} tarafından keşfedilemiyor: {config} yalnız [{include}] desenlerini kapsıyor.',
  },
  'prompt_gate.test_not_discoverable_fix': {
    en: 'Move the test under a configured include path or amend {config}; do not dispatch workers with a proof command the runner cannot discover.',
    tr: 'Testi yapılandırılmış bir include yoluna taşıyın veya {config} dosyasını düzenleyin; runner\'ın keşfedemediği proof komutuyla worker dispatch etmeyin.',
  },
  'resume.invalid_sprint_id': { en: 'Invalid run id: {sprintId}', tr: 'Geçersiz run kimliği: {sprintId}' },
  'resume.checkpoint_missing': { en: 'No checkpoint found for run "{sprintId}".', tr: '"{sprintId}" run\'ı için checkpoint bulunamadı.' },
  'resume.status_hint': { en: 'Run "deckent status" to see available runs.', tr: 'Kullanılabilir run\'ları görmek için "deckent status" çalıştırın.' },
  'resume.checkpoint_unreadable': { en: 'Checkpoint for run "{sprintId}" is malformed or unreadable.', tr: '"{sprintId}" run\'ının checkpoint\'i bozuk veya okunamıyor.' },
  'resume.pause_restore_failed': {
    en: 'Run {sprintId} failed to resume and its prior pause authority could not be restored; use deckent status before taking further action.',
    tr: '{sprintId} run\'ı sürdürülemedi ve önceki pause authority geri yüklenemedi; başka işlem yapmadan önce deckent status çalıştırın.',
  },
  'resume.header': { en: '\nResuming run {sprintId} from checkpoint #{checkpoint}', tr: '\n{sprintId} run\'ı checkpoint #{checkpoint} üzerinden sürdürülüyor' },
  'resume.summary': { en: '  Written: {timestamp}\n  Phase: {phase}\n  Completed tasks: {completed}\n  Pending tasks: {pending}\n  Active workers: {active}', tr: '  Yazım: {timestamp}\n  Faz: {phase}\n  Tamamlanan görev: {completed}\n  Bekleyen görev: {pending}\n  Aktif worker: {active}' },
  'resume.stale_header': { en: '\n  ⚠ Stale workers detected: {count}', tr: '\n  ⚠ Bayat worker tespit edildi: {count}' },
  'resume.stale_item': { en: '    - {workerId} (task {taskId}): {reason}, age {age}min', tr: '    - {workerId} (görev {taskId}): {reason}, yaş {age}dk' },
  'resume.stale_action': { en: '  Proven-stale workers will be stopped and their tasks resumed.', tr: '  Bayatlığı kanıtlanan worker\'lar durdurulacak ve görevleri sürdürülecek.' },
  'resume.crash_completed': { en: '\n  ✓ Tasks completed before crash: {taskIds}', tr: '\n  ✓ Çökmeden önce tamamlanan görevler: {taskIds}' },
  'resume.settlement_hold': {
    en: '\nHOLD: host settlement is pending or invalid for {tasks}; no task was reset or spawned.',
    tr: '\nHOLD: {tasks} için host settlement bekliyor veya geçersiz; hiçbir görev sıfırlanmadı ya da başlatılmadı.',
  },
  'resume.settlement_reconciling': {
    en: '\nReconciling host settlement before checkpoint restore: {tasks}.',
    tr: '\nCheckpoint restore öncesinde host settlement uzlaştırılıyor: {tasks}.',
  },
  'resume.settlement_state_required': {
    en: 'Resume HOLD: settlement-first recovery for {sprintId} requires its matching durable run state.',
    tr: 'Resume HOLD: {sprintId} için settlement-first recovery eşleşen kalıcı run durumunu gerektirir.',
  },
  'resume.dry_run': { en: '\n[dry-run] Would resume {count} task(s): {taskIds}. No workers spawned.', tr: '\n[dry-run] {count} görev sürdürülecek: {taskIds}. Worker başlatılmadı.' },
  'resume.none': { en: '(none)', tr: '(yok)' },
  'resume.nothing': { en: '\nAll tasks already completed or are not proven safe to resume.', tr: '\nTüm görevler tamamlanmış veya sürdürmenin güvenli olduğu kanıtlanmamış.' },
  'resume.terminalizing': { en: '\nPublishing missing terminal authority for {sprintId} ({mode}) without redispatching work.', tr: '\n{sprintId} için eksik terminal authority, iş yeniden dispatch edilmeden yayımlanıyor ({mode}).' },
  'resume.retro_hint': { en: 'Run "deckent retro" to see the retrospective.', tr: 'Retrospektifi görmek için "deckent retro" çalıştırın.' },
  'resume.config_failed': { en: 'Failed to load config: {error}', tr: 'Config yüklenemedi: {error}' },
  'resume.stale_killing': { en: '\nStopping proven-stale workers...', tr: '\nBayatlığı kanıtlanan worker\'lar durduruluyor...' },
  'resume.commit_failed': { en: 'Resume HOLD: durable state could not be committed: {error}', tr: 'Resume HOLD: durable durum commit edilemedi: {error}' },
  'resume.reset_tasks': { en: '  Reset {count} task(s) to PENDING: {taskIds}.', tr: '  {count} görev PENDING durumuna alındı: {taskIds}.' },
  'resume.artifact_cleanup_failed': { en: 'Resume HOLD: stale artifact could not be removed: {path}', tr: 'Resume HOLD: bayat artefact kaldırılamadı: {path}' },
  'resume.reset_artifacts': { en: '  Reset {count} stale worker artifact(s).', tr: '  {count} bayat worker artefact\'ı sıfırlandı.' },
  'resume.spawning': { en: '\nSpawning {count} pending task(s)...\n', tr: '\n{count} bekleyen görev başlatılıyor...\n' },
  'resume.preplanned_failed': { en: 'Resume HOLD: preplanned run could not be rebuilt: {error}', tr: 'Resume HOLD: preplanned run yeniden oluşturulamadı: {error}' },
  'resume.other_sprint_active': { en: 'Resume HOLD: another run owns the runtime state: {sprintId}', tr: 'Resume HOLD: runtime durumu başka bir run\'a ait: {sprintId}' },
  'resume.state_clear_failed': { en: 'Resume HOLD: stale state for {sprintId} could not be cleared.', tr: 'Resume HOLD: {sprintId} için bayat durum temizlenemedi.' },
  'resume.pause_clear_failed': { en: 'Resume HOLD: pause authority for {sprintId} could not be cleared safely.', tr: 'Resume HOLD: {sprintId} pause authority güvenli biçimde temizlenemedi.' },
  'resume.not_complete': { en: 'Run resumed but did not complete (status: {status}).', tr: 'Run sürdürüldü ancak tamamlanmadı (durum: {status}).' },
  'resume.completed': { en: '\nRun resumed and completed.', tr: '\nRun sürdürüldü ve tamamlandı.' },
  'resume.outcome_running': {
    en: 'Recovery outcome: resumed-running. The canonical coordinator authority remains active.',
    tr: 'Recovery sonucu: resumed-running. Canonical coordinator authority aktif kalıyor.',
  },
  'resume.outcome_paused': {
    en: 'Recovery outcome: resumed-paused. The run is durably paused; this is not an internal command failure. Resume: {recoveryCommand} · Abort: {finalizeCommand}',
    tr: 'Recovery sonucu: resumed-paused. Run kalıcı olarak duraklatıldı; bu bir dahili komut hatası değildir. Sürdür: {recoveryCommand} · Sonlandır: {finalizeCommand}',
  },
  'resume.outcome_aborted': {
    en: 'Recovery outcome: aborted. The run reached a truthful terminal ABORTED authority.',
    tr: 'Recovery sonucu: aborted. Run dürüst terminal ABORTED authority durumuna ulaştı.',
  },
  'resume.outcome_failed': {
    en: 'Recovery outcome: failed ({reason}).',
    tr: 'Recovery sonucu: failed ({reason}).',
  },
  'resume.failed': { en: 'Run resume failed: {error}', tr: 'Run sürdürme başarısız: {error}' },
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
  'history.desc': { en: 'Show run history', tr: 'Run geçmişini göster' },
  'history.opt_last': { en: 'Show only last N runs', tr: 'Yalnızca son N run\'ı göster' },
  'history.opt_trend': { en: 'Show success rate/coverage trend analysis for last 5 runs', tr: 'Son 5 run için başarı oranı/kapsam trend analizini göster' },
  'history.trend_header': { en: '--- Trend (last {n} runs) ---', tr: '--- Trend (son {n} run) ---' },
  'config.set': { en: 'Set {key} = {value}', tr: '{key} = {value} olarak ayarlandı' },
  'config.invalid': { en: 'Invalid config: {errors}', tr: 'Geçersiz yapılandırma: {errors}' },
  'config.provider_alias_conflict': {
    en: 'Conflicting provider settings in the {layer} config: {flatKey}={flatValue} differs from {groupedKey}={groupedValue}. Remove one definition or make both values equal.',
    tr: '{layer} yapılandırmasında çakışan provider ayarları var: {flatKey}={flatValue}, {groupedKey}={groupedValue} değerinden farklı. Tanımlardan birini kaldırın veya iki değeri eşitleyin.',
  },
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
  // SURF-6 — cross-surface parity: the SAME content hash the Desktop preview shows.
  'tui.inbox_detail_digest': { en: '  digest: {digest}', tr: '  plan-imzası: {digest}' },
  // SURF-6 — in-card decision keys (Telegraph vocabulary: STOP/SLOW AHEAD/FULL AHEAD).
  'tui.inbox_decide_hint_awaiting': {
    en: 'a approve · f full ahead · r reject',
    tr: 'a onayla (ağır yol) · f tam yol · r reddet (dur)',
  },
  'tui.inbox_decide_hint_approved': { en: 's start', tr: 's başlat' },
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
  // SURF-6 `deckent runs <n> --approve|--reject|--start` — cross-surface decide.
  'runs.decide.approved': {
    en: 'Approved — revision {revision} · digest {digest}',
    tr: 'Onaylandı — revizyon {revision} · özet {digest}',
  },
  'runs.decide.rejected': { en: 'Rejected.', tr: 'Reddedildi.' },
  'runs.decide.rejected_reason': { en: 'Rejected — {reason}', tr: 'Reddedildi — {reason}' },
  'runs.decide.started': {
    en: 'Run started (detached) — job {jobId}',
    tr: 'Koşu başlatıldı (arka planda) — iş {jobId}',
  },
  'runs.decide.start_duplicate': {
    en: 'Already started — idempotent, nothing was spawned again.',
    tr: 'Zaten başlatılmış — idempotent, yeniden başlatılmadı.',
  },
  'runs.decide.flag_conflict': {
    en: '--approve and --reject are mutually exclusive.',
    tr: '--approve ile --reject birlikte kullanılamaz.',
  },
  'runs.decide.reason_without_reject': {
    en: '--reason is only valid with --reject.',
    tr: '--reason yalnız --reject ile kullanılır.',
  },
  // 583/N1 — `deckent runs <n> --diff`: the run's real footprint, line-level.
  'runs.diff.header': {
    en: 'Diff — {n} file(s), base {base}',
    tr: 'Diff — {n} dosya, taban {base}',
  },
  'runs.diff.empty': { en: 'No changes in this run\'s footprint.', tr: 'Bu koşunun ayak izinde değişiklik yok.' },
  'runs.diff.no_base': {
    en: 'Note: no recorded start commit (pre-N1 run) — showing the working tree vs HEAD.',
    tr: 'Not: kayıtlı başlangıç-commit\'i yok (N1-öncesi koşu) — çalışma ağacı HEAD\'e karşı gösteriliyor.',
  },
  'runs.diff.not_git': { en: 'This project is not a git repository — no diff available.', tr: 'Bu proje bir git deposu değil — diff üretilemiyor.' },
  'runs.diff.truncated': { en: '… diff truncated (size cap).', tr: '… diff kırpıldı (boyut sınırı).' },
  // 583/N4 — the post-run incele→commit flow (`runs <n> --commit`, KARAR-2).
  'runs.commit.not_terminal': {
    en: 'Run {id} is {state} — commit is a post-run step (wait for a terminal state).',
    tr: 'Koşu {id} {state} durumunda — commit koşu-sonu adımıdır (terminal durumu bekleyin).',
  },
  'runs.commit.not_git': {
    en: 'This project is not a git repository — nothing to commit.',
    tr: 'Bu proje bir git deposu değil — commit edilecek bir şey yok.',
  },
  'runs.commit.clean': {
    en: 'Working tree clean — nothing to commit.',
    tr: 'Çalışma ağacı temiz — commit edilecek değişiklik yok.',
  },
  'runs.commit.header': {
    en: 'Commit proposal — {n} file(s), +{ins} −{del}:',
    tr: 'Commit önerisi — {n} dosya, +{ins} −{del}:',
  },
  'runs.commit.suggested': { en: 'Message:', tr: 'Mesaj:' },
  'runs.commit.prompt': { en: 'Commit? [y/N] ', tr: 'Commit edilsin mi? [y/N] ' },
  'runs.commit.aborted': {
    en: 'Commit aborted — nothing was staged or committed.',
    tr: 'Commit iptal edildi — hiçbir şey stage edilmedi, commit atılmadı.',
  },
  'runs.commit.noninteractive': {
    en: 'Non-interactive session — pass --yes to commit (and --message to set the message).',
    tr: 'Etkileşimsiz oturum — commit için --yes verin (mesajı --message ile belirleyin).',
  },
  'runs.commit.staged': { en: 'Staged {n} file(s).', tr: '{n} dosya stage edildi.' },
  'runs.commit.done': { en: 'Committed {sha}.', tr: 'Commit edildi: {sha}.' },
  'runs.commit.add_failed': { en: 'git add failed: {error}', tr: 'git add başarısız: {error}' },
  'runs.commit.commit_failed': { en: 'git commit failed: {error}', tr: 'git commit başarısız: {error}' },
  'runs.decide.gate_warn': {
    en: 'Warning: the plan gate is FAIL ({n} blocking finding(s)) — the run will refuse at start unless overridden.',
    tr: 'Uyarı: plan kapısı FAIL ({n} blocker) — koşu, override edilmedikçe start anında reddedecek.',
  },
  'runs.decide.needs_row': {
    en: 'Decision flags need a run number: deckent runs <n> --approve | --reject | --start',
    tr: 'Karar bayrakları koşu numarası ister: deckent runs <n> --approve | --reject | --start',
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
    en: 'Dry-run complete — nothing was started. The exact proposal remains awaiting approval.',
    tr: 'Dry-run tamamlandı — hiçbir şey başlatılmadı. Exact öneri onay beklemeye devam ediyor.',
  },
  'do.dry_run_approve_hint': {
    en: 'Approve and start this exact proposal ({flowId}) without replanning: {command}',
    tr: 'Bu exact öneriyi ({flowId}) yeniden planlamadan onaylayıp başlatın: {command}',
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
  'do.scope_gate_blocked': {
    en: 'Scope gate: run NOT started (the detached child would die at PLAN with the same verdict). Fix the write paths, or acknowledge intentional new paths with --force-scope.\n{message}',
    tr: 'Scope-gate: koşu BAŞLATILMADI (detached-child PLAN fazında aynı kararla ölecekti). Yazma-yollarını düzeltin ya da bilinçli yeni-yolları --force-scope ile onaylayın.\n{message}',
  },
  'do.write_allowlist_option': {
    en: 'Bind the exact plan to an existing-file closed write allowlist; repeat paths after the option',
    tr: 'Exact planı mevcut dosyalardan oluşan kapalı write allowlist’e bağla; option sonrasında path’leri sıralayın',
  },
  'do.write_allowlist_requires_run_flow': {
    en: '--write-allowlist requires the canonical RunFlow path (terminal.run_flow_v2=true); no plan was created.',
    tr: '--write-allowlist canonical RunFlow yolunu gerektirir (terminal.run_flow_v2=true); plan oluşturulmadı.',
  },
  'do.closed_write_scope_blocked': {
    en: 'Closed write scope blocked the plan before approval. Every allowed path must already be tracked and every task write must be allowlisted; --force-scope cannot override this authority. Violations: {violations}',
    tr: 'Kapalı write scope planı onaydan önce durdurdu. İzin verilen her path zaten tracked olmalı ve her task write allowlist içinde bulunmalı; --force-scope bu authority’yi aşamaz. İhlaller: {violations}',
  },
  // do.scope_gate_preview_fail / do.scope_gate_overridden (the preview-only
  // renderings) were retired by 452-003 — the preview verdict text now comes
  // from runFlow.planPreview.scopeGate.* (see above), shared verbatim with
  // the REPL card via formatScopeGateLines (plan-preview-card.tsx).
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

  // ─── REPL `/do <goal>` slash (452-002 REPL-DO-SLASH-WIRE) — the two NON-run
  // edges of the terminal.run_flow_v2 gate. Flag-ON drives the SAME RunFlow
  // preview→approval chain the native `deckent_propose_run` tool and CLI
  // `deckent do` use (no new controller); only these off/usage notices are
  // string-surfaces owned here (mechanism modules stay string-free — run.tsx's
  // buildDoSlashLabels resolves these via getMessage, English default). ───────
  'do.slash_flag_off': {
    en: '/do requires the RunFlow surface — enable terminal.run_flow_v2 in .deckent/config.json.',
    tr: '/do için RunFlow yüzeyi gerekir — .deckent/config.json içinde terminal.run_flow_v2 açın.',
  },
  'do.slash_usage': {
    en: 'usage: /do <goal> — describe what to plan and run (e.g. /do add a health endpoint).',
    tr: 'kullanım: /do <hedef> — planlanıp çalıştırılacak işi yazın (örn. /do sağlık ucu ekle).',
  },

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
  'limits.verdict_unknown': {
    en: 'UNKNOWN — live limit evidence is unavailable.',
    tr: 'BİLİNMİYOR — canlı limit kanıtına ulaşılamıyor.',
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
    en: '[limit-gate] Blocked verdict bypassed via --force.',
    tr: '[limit-gate] Engelleme --force ile aşıldı.',
  },
  'limits.start_gate_blocked': {
    en: '[limit-gate] Run start blocked — {window} usage at {pct}% (resets {reset}). Use --force to override.',
    tr: '[limit-gate] Run başlatma engellendi — {window} kullanımı %{pct} (sıfırlanma: {reset}). Aşmak için --force kullanın.',
  },
  'limits.start_gate_warn': {
    en: '[limit-gate] Warning: {window} usage at {pct}% — proceeding.',
    tr: '[limit-gate] Uyarı: {window} kullanımı %{pct} — devam ediliyor.',
  },
  'limits.start_gate_unknown': {
    en: '[limit-gate] Limit state is unknown — advisory policy is proceeding without a live signal.',
    tr: '[limit-gate] Limit durumu bilinmiyor — advisory policy canlı sinyal olmadan devam ediyor.',
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
  'desktop.shell.nav.console': { en: 'Bridge', tr: 'Köprü' },
  'desktop.shell.nav.chat': { en: 'Chat', tr: 'Sohbet' },
  'desktop.shell.nav.approval': { en: 'Approvals', tr: 'Onaylar' },
  'desktop.shell.nav.history': { en: 'Runs', tr: 'Koşular' },
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
  // DT-1 «Telsiz» (583 tasarım-turu) — the Desktop's real chat.
  'desktop.shell.radio.empty_hint': {
    en: 'The watch radio is open — ask deckent anything about this project.',
    tr: 'Vardiya telsizi açık — deckent\'e bu projeyle ilgili her şeyi sorabilirsiniz.',
  },
  'desktop.shell.radio.placeholder': { en: 'Transmit a message…', tr: 'Mesaj geçin…' },
  'desktop.shell.radio.send': { en: 'Transmit', tr: 'Gönder' },
  'desktop.shell.radio.role_operator': { en: 'bridge', tr: 'köprü' },
  'desktop.shell.radio.role_deckent': { en: 'deckent', tr: 'deckent' },
  'desktop.shell.radio.gate_off': {
    en: 'Remote chat is disabled on this daemon (api.control_mutations) — Desktop-spawned daemons enable it automatically; for an adopted daemon, enable the flag on its side.',
    tr: 'Bu daemonda uzaktan sohbet kapalı (api.control_mutations) — Desktop\'ın başlattığı daemonlarda otomatik açıktır; devralınan daemon için bayrağı daemon tarafında açın.',
  },
  'desktop.shell.radio.failed': {
    en: 'transmission failed: {message}',
    tr: 'iletim başarısız: {message}',
  },
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
  // SURF-6 kuyruk-D — gate-fail visibility: the blocking findings surface in
  // the preview instead of hiding behind a bare 'Gate: fail' summary line.
  'desktop.shell.preview.gate_findings': {
    en: 'Gate blockers ({n}):',
    tr: 'Kapı blockerları ({n}):',
  },
  // 583/N1 — the run's line-level footprint in the Console (GAP-4 closes).
  'desktop.shell.diff.title': { en: 'Changes ({n} files)', tr: 'Değişiklikler ({n} dosya)' },
  'desktop.shell.diff.empty': { en: 'No changes in this run\'s footprint.', tr: 'Bu koşunun ayak izinde değişiklik yok.' },
  'desktop.shell.diff.no_base': {
    en: 'No recorded start commit — showing the working tree vs HEAD.',
    tr: 'Kayıtlı başlangıç-commit\'i yok — çalışma ağacı HEAD\'e karşı gösteriliyor.',
  },
  'desktop.shell.diff.not_git': { en: 'Not a git repository — no diff available.', tr: 'Git deposu değil — diff üretilemiyor.' },
  'desktop.shell.diff.truncated': { en: '… truncated (size cap).', tr: '… kırpıldı (boyut sınırı).' },
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
  // 583/N3 «Makine Dairesi» — the Desktop PTY panel (ADR-G-029 secondary surface).
  'desktop.shell.nav.terminal': { en: 'Engine Room', tr: 'Makine Dairesi' },
  // KABUL Gün-1 A1/A4 — sol-ray grupları + «Changes» görünümü.
  'desktop.shell.nav.group_voyage': { en: 'Voyage', tr: 'Seyir' },
  'desktop.shell.nav.group_work': { en: 'Work', tr: 'Çalışma' },
  'desktop.shell.nav.changes': { en: 'Changes', tr: 'Değişiklikler' },
  'desktop.shell.changes.commit': { en: 'Commit', tr: 'Commit' },
  'desktop.shell.changes.gate_off': {
    en: 'Remote commit is disabled on this daemon (api.control_mutations) — Desktop-spawned daemons enable it automatically; use `deckent runs <n> --commit` in the terminal otherwise.',
    tr: 'Bu daemonda uzaktan commit kapalı (api.control_mutations) — Desktop\'ın başlattığı daemonlarda otomatik açıktır; aksi hâlde terminalden `deckent runs <n> --commit` kullanın.',
  },
  // 588/F1 «Köprü» — operasyon-merkezi + Worker-Penceresi kelimeleri.
  'desktop.shell.bridge.phase_label': { en: 'Phase', tr: 'Faz' },
  'desktop.shell.bridge.workers_title': { en: 'Workers', tr: 'Worker\'lar' },
  'desktop.shell.bridge.files_title': { en: 'Files in motion', tr: 'Hareketteki dosyalar' },
  'desktop.shell.bridge.no_sprint': {
    en: 'No live run — issue an order below to set sail.',
    tr: 'Canlı run yok — yelken açmak için aşağıdan emir verin.',
  },
  'desktop.shell.bridge.hb_age': { en: '{n}s', tr: '{n}sn' },
  'desktop.shell.worker.back': { en: '← Bridge', tr: '← Köprü' },
  'desktop.shell.worker.tab_live': { en: 'Live', tr: 'Canlı' },
  'desktop.shell.worker.tab_task': { en: 'Task', tr: 'Görev' },
  'desktop.shell.worker.tab_plan': { en: 'Plan', tr: 'Plan' },
  'desktop.shell.worker.tab_result': { en: 'Result', tr: 'Sonuç' },
  'desktop.shell.worker.log_unavailable': {
    en: 'No log yet — the worker has not written its first line.',
    tr: 'Henüz log yok — worker ilk satırını yazmadı.',
  },
  'desktop.shell.worker.go_criteria': { en: 'GO criteria', tr: 'GO ölçütleri' },
  'desktop.shell.worker.scope': { en: 'Write scope', tr: 'Yazma-kapsamı' },
  'desktop.shell.worker.no_plan': { en: 'No .plan written yet.', tr: 'Henüz .plan yazılmadı.' },
  'desktop.shell.worker.no_result': { en: 'No result yet.', tr: 'Henüz sonuç yok.' },
  'desktop.shell.worker.assessment': { en: 'Self-assessment', tr: 'Öz-değerlendirme' },
  'desktop.shell.bridge.past_flows': { en: 'Past voyages ({n})', tr: 'Geçmiş seferler ({n})' },
  'desktop.shell.bridge.past_flows_more': { en: '… {n} more in Runs.', tr: '… {n} tanesi daha Koşular\'da.' },
  'desktop.shell.worker.stream_on': { en: 'stream live · {n} line(s)', tr: 'akış canlı · {n} satır' },
  'desktop.shell.worker.stream_down': {
    en: 'stream disconnected — retrying…',
    tr: 'akış koptu — yeniden deneniyor…',
  },
  'desktop.shell.worker.files_changed': { en: 'Files changed ({n})', tr: 'Değişen dosyalar ({n})' },
  'desktop.shell.worker.notes': { en: 'Notes', tr: 'Notlar' },
  'desktop.shell.worker.raw': { en: 'raw', tr: 'ham' },
  'desktop.shell.worker.not_found': { en: 'Task not found (it may be archived).', tr: 'Görev bulunamadı (arşivlenmiş olabilir).' },
  // KABUL Gün-1 A2 — Runs detay-sayfası kelimeleri.
  'desktop.shell.runs.goal': { en: 'Goal', tr: 'Hedef' },
  'desktop.shell.runs.gate': { en: 'Plan gate', tr: 'Plan kapısı' },
  'desktop.shell.runs.tasks': { en: '{done}/{total} tasks', tr: '{done}/{total} görev' },
  'desktop.shell.runs.revision': { en: 'Revision {r}', tr: 'Revizyon {r}' },
  'desktop.shell.term.title': { en: 'Engine room', tr: 'Makine dairesi' },
  'desktop.shell.term.new_session': { en: 'New session:', tr: 'Yeni oturum:' },
  'desktop.shell.term.kind_shell': { en: 'Shell', tr: 'Shell' },
  'desktop.shell.term.kind_deckent': { en: 'deckent', tr: 'deckent' },
  'desktop.shell.term.kind_claude': { en: 'Claude', tr: 'Claude' },
  'desktop.shell.term.kind_gemini': { en: 'Gemini', tr: 'Gemini' },
  'desktop.shell.term.kind_codex': { en: 'Codex', tr: 'Codex' },
  'desktop.shell.term.close_session': { en: 'Close session', tr: 'Oturumu kapat' },
  'desktop.shell.term.connecting': { en: 'Connecting…', tr: 'Bağlanıyor…' },
  'desktop.shell.term.reconnecting': {
    en: 'Connection lost — reconnecting…',
    tr: 'Bağlantı koptu — yeniden bağlanılıyor…',
  },
  'desktop.shell.term.disabled': {
    en: 'This daemon\'s terminal surface is off (non-local bind or --no-terminal) — start the daemon locally to open the engine room.',
    tr: 'Bu daemonun terminal yüzeyi kapalı (yerel-dışı bind veya --no-terminal) — makine dairesini açmak için daemonu yerelde başlatın.',
  },
  'desktop.shell.term.shell_kind_off': {
    en: 'Plain shell sessions are disabled by config (terminal.allowShellKind) — deckent/AI sessions stay available.',
    tr: 'Düz shell oturumları config ile kapalı (terminal.allowShellKind) — deckent/AI oturumları açık.',
  },
  'desktop.shell.term.sessions_empty': {
    en: 'No live sessions — open one below deck.',
    tr: 'Canlı oturum yok — güverte altında bir tane açın.',
  },
  'desktop.shell.term.exited': { en: 'exited ({code})', tr: 'kapandı ({code})' },
  // D4-1 «Köprüüstü» — watch (vardiya) theme system.
  'desktop.theme.title': { en: 'Watch', tr: 'Vardiya' },
  'desktop.theme.watch.nova': { en: 'Nova', tr: 'Nova' },
  // 589/R1 — NOVA-kabuğu + Komuta-sahnesi (Jarvis-nötr yeni-kök).
  'desktop.nova.nav.command': { en: 'Command', tr: 'Komuta' },
  'desktop.nova.nav.terminal': { en: 'Terminal', tr: 'Terminal' },
  'desktop.nova.nav.classic': { en: 'Classic view', tr: 'Klasik görünüm' },
  'desktop.nova.palette.placeholder': { en: 'search scenes & actions…', tr: 'sahne ve eylem ara…' },
  'desktop.nova.scene.idle': { en: 'system ready — awaiting orders', tr: 'sistem hazır — emir bekleniyor' },
  'desktop.nova.scene.connecting': { en: 'linking…', tr: 'bağlanıyor…' },
  'desktop.nova.scene.offline': { en: 'daemon unreachable', tr: 'daemon erişilemez' },
  'desktop.nova.scene.ready': { en: 'READY', tr: 'HAZIR' },
  'desktop.nova.river.you': { en: 'you', tr: 'sen' },
  'desktop.nova.river.deckent': { en: 'deckent', tr: 'deckent' },
  'desktop.nova.cmd.placeholder': { en: 'tell deckent — ask, order, decide…', tr: 'deckent\'e söyle — soru, emir, karar…' },
  'desktop.nova.cmd.hint': { en: 'enter = talk · ctrl+enter = ORDER (start work) · ⌘K palette', tr: 'enter = konuş · ctrl+enter = EMİR (iş başlat) · ⌘K palet' },
  'desktop.nova.order.sent': { en: 'order received — drafting the plan…', tr: 'emir alındı — plan hazırlanıyor…' },
  'desktop.nova.order.previewing': { en: 'previewing the plan…', tr: 'plan önizleniyor…' },
  'desktop.nova.order.preview_title': { en: 'Order preview', tr: 'Emir önizlemesi' },
  'desktop.nova.order.gate_fail': { en: 'plan gate: FAIL — starting will be refused unless overridden', tr: 'plan kapısı: FAIL — override edilmedikçe start reddedilir' },
  'desktop.nova.order.full_ahead': { en: 'FULL AHEAD', tr: 'TAM YOL' },
  'desktop.nova.order.dismiss': { en: 'dismiss', tr: 'vazgeç' },
  'desktop.nova.order.started': { en: 'run started — the core is waking.', tr: 'koşu başladı — çekirdek uyanıyor.' },
  'desktop.nova.order.failed': { en: 'order failed', tr: 'emir başarısız' },
  'desktop.nova.river.tool': { en: 'tool', tr: 'araç' },
  'desktop.nova.focus.empty': { en: 'no narrative yet — the worker is thinking…', tr: 'henüz anlatı yok — worker düşünüyor…' },

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
