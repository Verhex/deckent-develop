// src/cli/helpers/message-catalog/cli-terminal-slash.ts
// ═══ TERMINAL-TOOLS-001 — `cli-terminal-slash` message-catalog family ═══════
//
// User-visible text for the native Terminal's command-discovery surface: the
// `/` menu and `/help` descriptions of every slash command in
// src/cli/commands/chat-slash-registry.ts (SLASH_CATALOG carries only the
// `descKey`; buildSlashRegistry(lang) resolves it here), the `/help` list
// header and the trust-tier headings of the `/help` Actions catalog.
//
// Why a family file: see cli-common.ts (collision-checked merge, no edit
// contention on messages.ts). Keys are `tui.slash.desc.<name>` — one per
// catalog entry, both languages mandatory (tests/cli/chat-slash-registry-
// i18n.test.ts proves en+tr for every entry; scripts/lint-i18n-hardcode.mjs
// fails on any `desc:` literal creeping back into the catalog).
//
// Voice: calm, precise, one line per command; examples stay concrete but never
// name a model or provider id (KANUN 10 — registry/config is the only source).

import type { MessageFamily } from './cli-common.js';

export const CLI_TERMINAL_SLASH_MESSAGES: MessageFamily = Object.freeze({
  // ── `/` menu scroll hints (input-bar.tsx; `{n}` = rows outside the window)
  //    and the legacy readline banner hint (chat-banner.ts) ───────────────
  'tui.menu_more_above': { en: '↑ {n} more', tr: '↑ {n} daha' },
  'tui.menu_more_below': { en: '↓ {n} more', tr: '↓ {n} daha' },
  'tui.banner.hint': { en: '/help for commands · natural-language chat', tr: '/help komutlar için · doğal dil sohbet' },

  // ── string-free mechanism guard — the ONLY user-facing explanation of an
  //    InjectedLabelMissingError (run.tsx buildReplErrorDescriber) ───────────
  'tui.injected_label_missing': {
    en: 'Terminal label "{label}" was not injected ({code}). This is a Deckent defect, not a configuration problem — report it with the code.',
    tr: '"{label}" terminal etiketi enjekte edilmedi ({code}). Bu bir yapılandırma sorunu değil, Deckent kusurudur — kodla birlikte bildirin.',
  },

  // ── TERMINAL-TOOLS-002 string-free closure: the last mechanism-owned
  //    literals moved here. `tui.reverse_search` is the Ctrl-R prompt of the
  //    Ink composer (input-bar.tsx); `tui.thinking_verbs` is the `|`-separated
  //    verb pool of the legacy readline ticker (`● deckent · <verb>…`, one
  //    verb picked per turn — chat-thinking-verbs.ts splits it). ─────────────
  'tui.reverse_search': { en: '(reverse-i-search)', tr: '(geriye dönük arama)' },
  // Never wired before this closure: run.tsx omitted both fields, so app.tsx's
  // English `??` defaults rendered in every session language (real-binary
  // finding, 2026-09-02). `{error}` = the turn exception text; `{kind}` =
  // the technical switch target token (`model` | `provider`).
  'tui.turn_error': { en: 'turn failed: {error}', tr: 'tur başarısız: {error}' },
  // TERMINAL-TOOLS-006 — Ctrl-C states its target (interrupt-policy.ts); the
  // hint names the next key. Shown for the second-press window only.
  'tui.ctrl_c_draft_cleared': { en: 'draft discarded · Ctrl-C again to exit', tr: 'taslak silindi · çıkmak için tekrar Ctrl-C' },
  'tui.ctrl_c_interrupt': { en: 'interrupt requested · Ctrl-C again to exit', tr: 'kesme istendi · çıkmak için tekrar Ctrl-C' },
  'tui.ctrl_c_arm': { en: 'Ctrl-C again to exit', tr: 'çıkmak için tekrar Ctrl-C' },
  // TERMINAL-TOOLS-008 — the honest interrupt line when the engine has no abort
  // seam (legacy loop): pending input was cleared, the turn itself continues.
  'tui.busy_interrupt_unavailable': {
    en: 'interrupt is not available on this engine — the turn will finish; pending input cleared',
    tr: 'bu motorda kesme yok — tur tamamlanacak; bekleyen girdi temizlendi',
  },

  // ── live-footer elapsed-time unit suffixes (helpers/live-footer.ts
  //    formatElapsed — `2h 5m`, `10m`, `30s`). XVerify (codex/gpt-5.6-sol,
  //    2026-09-02) flagged them as the last mechanism-owned user-facing
  //    literals; same abbreviations as tui.inbox_time_* (sa / dk). ──────────
  'live_footer.unit_hours': { en: 'h', tr: 'sa' },
  'live_footer.unit_minutes': { en: 'm', tr: 'dk' },
  'live_footer.unit_seconds': { en: 's', tr: 'sn' },

  // ── TERMINAL-TOOLS-010 — `/context` · `/compact` (run.tsx withContextSlashes)
  //    and the `?` shortcuts panel (input-bar.tsx, rows built by run.tsx). ─────
  'tui.slash.desc.context': { en: 'Show context usage (window, tokens in use, epoch, checkpoint)', tr: 'Bağlam kullanımını göster (pencere, kullanılan token, epoch, checkpoint)' },
  'tui.slash.desc.compact': { en: 'Compact the context now (bounded checkpoint, one provider call)', tr: 'Bağlamı şimdi sıkıştır (sınırlı checkpoint, tek sağlayıcı çağrısı)' },
  'native-context.slash.header': { en: 'Context', tr: 'Bağlam' },
  'native-context.slash.window': { en: 'window: {window} tokens', tr: 'pencere: {window} token' },
  'native-context.slash.measured': { en: 'in use: {used} tokens ({percent}%)', tr: 'kullanımda: {used} token (%{percent})' },
  'native-context.slash.measured_unknown': { en: 'in use: {unknown} — no measurement authority for this provider', tr: 'kullanımda: {unknown} — bu sağlayıcı için ölçüm otoritesi yok' },
  'native-context.slash.epoch': { en: 'context epoch: {epoch}', tr: 'bağlam epoch: {epoch}' },
  'native-context.slash.messages': { en: 'messages: {messages} · checkpoint preamble: {preamble}', tr: 'mesaj: {messages} · checkpoint önsözü: {preamble}' },
  'native-context.slash.checkpoint': { en: 'checkpoint: {status}', tr: 'checkpoint: {status}' },
  'native-context.slash.high_water': { en: 'auto-compaction at {percent}% of the window', tr: 'otomatik sıkıştırma pencerenin %{percent} doluluğunda' },
  'native-context.slash.refresh_planned': { en: 'a compaction is planned for the next turn', tr: 'bir sonraki tur için sıkıştırma planlandı' },
  'native-context.slash.unknown': { en: 'unknown', tr: 'bilinmiyor' },
  'native-context.slash.unavailable': { en: '/context is not available on this engine (legacy loop) — no context authority to read', tr: '/context bu motorda yok (eski döngü) — okunacak bağlam otoritesi yok' },
  'native-context.compact.compacted': { en: 'context compacted — epoch {epoch}, checkpoint saved', tr: 'bağlam sıkıştırıldı — epoch {epoch}, checkpoint kaydedildi' },
  'native-context.compact.degraded': { en: 'compaction degraded — the checkpoint could not be saved; epoch {epoch} kept', tr: 'sıkıştırma başarısız — checkpoint kaydedilemedi; epoch {epoch} korundu' },
  'native-context.compact.unavailable': { en: '/compact is not available here — no scratch store on this engine', tr: '/compact burada yok — bu motorda scratch deposu yok' },
  'tui.shortcuts.title': { en: 'Keyboard shortcuts', tr: 'Klavye kısayolları' },
  'tui.shortcuts.submit.keys': { en: 'Enter', tr: 'Enter' },
  'tui.shortcuts.submit.action': { en: 'send the message', tr: 'mesajı gönder' },
  'tui.shortcuts.newline.keys': { en: 'Shift+Enter', tr: 'Shift+Enter' },
  'tui.shortcuts.newline.action': { en: 'new line (terminals that report Shift)', tr: 'yeni satır (Shift bildiren terminaller)' },
  'tui.shortcuts.newline_alt.keys': { en: 'Alt/Option+Enter', tr: 'Alt/Option+Enter' },
  'tui.shortcuts.newline_alt.action': { en: 'new line', tr: 'yeni satır' },
  'tui.shortcuts.newline_ctrl_j.keys': { en: 'Ctrl+J', tr: 'Ctrl+J' },
  'tui.shortcuts.newline_ctrl_j.action': { en: 'new line (every terminal)', tr: 'yeni satır (her terminal)' },
  'tui.shortcuts.newline_backslash.keys': { en: '\\ then Enter', tr: '\\ sonra Enter' },
  'tui.shortcuts.newline_backslash.action': { en: 'continue on the next line', tr: 'sonraki satırda devam et' },
  'tui.shortcuts.interrupt.keys': { en: 'Esc', tr: 'Esc' },
  'tui.shortcuts.interrupt.action': { en: 'stop the running turn · close a menu', tr: 'çalışan turu durdur · menüyü kapat' },
  'tui.shortcuts.ctrl_c.keys': { en: 'Ctrl+C', tr: 'Ctrl+C' },
  'tui.shortcuts.ctrl_c.action': { en: 'discard the draft · twice to exit', tr: 'taslağı sil · çıkmak için iki kez' },
  'tui.shortcuts.ctrl_d.keys': { en: 'Ctrl+D', tr: 'Ctrl+D' },
  'tui.shortcuts.ctrl_d.action': { en: 'exit (empty composer)', tr: 'çık (boş composer)' },
  'tui.shortcuts.history.keys': { en: '↑ / ↓', tr: '↑ / ↓' },
  'tui.shortcuts.history.action': { en: 'move between draft lines · history at the edges', tr: 'taslak satırları arasında gez · uçlarda geçmiş' },
  'tui.shortcuts.history_search.keys': { en: 'Ctrl+R', tr: 'Ctrl+R' },
  'tui.shortcuts.history_search.action': { en: 'search history', tr: 'geçmişte ara' },
  'tui.shortcuts.clear_screen.keys': { en: 'Ctrl+L', tr: 'Ctrl+L' },
  'tui.shortcuts.clear_screen.action': { en: 'clear the screen', tr: 'ekranı temizle' },
  'tui.shortcuts.slash.keys': { en: '/', tr: '/' },
  'tui.shortcuts.slash.action': { en: 'commands (Tab completes, ↑↓ selects)', tr: 'komutlar (Tab tamamlar, ↑↓ seçer)' },
  'tui.shortcuts.at_ref.keys': { en: '@', tr: '@' },
  'tui.shortcuts.at_ref.action': { en: 'reference a project file', tr: 'proje dosyasına referans ver' },
  'tui.shortcuts.line_edit.keys': { en: 'Home/End · Ctrl+A/E · Ctrl+U', tr: 'Home/End · Ctrl+A/E · Ctrl+U' },
  'tui.shortcuts.line_edit.action': { en: 'line start/end · clear the line', tr: 'satır başı/sonu · satırı temizle' },
  'tui.shortcuts.shell.keys': { en: '!<command>', tr: '!<komut>' },
  'tui.shortcuts.shell.action': { en: 'run a shell command here (gated by /term mode and a one-time approval); its output is attached to your next message', tr: 'burada kabuk komutu çalıştır (/term modu ve tek seferlik onaya tabi); çıktısı bir sonraki mesajına eklenir' },
  // TERMINAL-TOOLS-011 — Ask/Run/Control action gate denial (term-gate.ts).
  // {risk} = risk-language label, {mode} = current mode label, {suggested} = mode token for /term.
  'tui.term_gate_denied': {
    en: '{target}: needs {risk} authority — terminal mode is {mode}; switch with /term {suggested}',
    tr: '{target}: {risk} yetkisi gerekiyor — terminal modu {mode}; /term {suggested} ile geçin',
  },
  // TERMINAL-TOOLS-012 — ApprovalCard §4 shared focus-rail fact rows
  // (approval-card.tsx buildApprovalFacts; wired by run.tsx buildApprovalLabels).
  'tui.approval_card.fact_requester': { en: 'requester', tr: 'talep eden' },
  'tui.approval_card.fact_action': { en: 'action · resource', tr: 'eylem · kaynak' },
  'tui.approval_card.fact_tenant': { en: 'tenant · user', tr: 'kiracı · kullanıcı' },
  'tui.approval_card.fact_policy': { en: 'policy', tr: 'politika' },
  'tui.approval_card.fact_lifecycle': { en: 'lifecycle', tr: 'yaşam döngüsü' },
  'tui.approval_card.fact_expiry': { en: 'expires', tr: 'süre sonu' },
  'tui.approval_card.fact_consequence': { en: 'consequence', tr: 'sonuç' },
  'tui.approval_card.fact_rollback': { en: 'rollback limit', tr: 'geri alma sınırı' },
  'tui.approval_card.fact_age': { en: 'requested', tr: 'istek zamanı' },
  'tui.approval_card.ago': { en: '{duration} ago', tr: '{duration} önce' },
  'tui.approval_card.just_now': { en: 'just now', tr: 'az önce' },
  'tui.approval_card.not_declared': { en: 'not declared by the requester', tr: 'talep eden bildirmedi' },
  // TERMINAL-TOOLS-013 — worded relation (no structural arrow in the mechanism).
  'tui.approval_card.expiry_outcome': { en: 'in {remaining}, then {outcome}', tr: '{remaining} içinde, sonra {outcome}' },
  'tui.approval_card.expired_outcome': { en: 'expired, {outcome} applies', tr: 'süresi doldu, {outcome} uygulanır' },
  // TERMINAL-TOOLS-013 — one-time confirm (operator's own `!` line) + paused-input anchor.
  'tui.confirm_hint_once': { en: '(y = allow once · N = deny)', tr: '(y = bir kez izin · N = reddet)' },
  'tui.input_paused': { en: 'input paused · decide the card above', tr: 'girdi duraklatıldı · yukarıdaki kartı karara bağla' },
  'tui.approval_card.policy.auto_approve': { en: 'auto-approve', tr: 'otomatik onay' },
  'tui.approval_card.policy.notify': { en: 'notify only', tr: 'yalnız bildir' },
  'tui.approval_card.policy.require_approval': { en: 'requires approval', tr: 'onay gerekli' },
  'tui.approval_card.policy.deny': { en: 'deny by policy', tr: 'politika gereği ret' },
  'tui.approval_card.action.allow': { en: 'allow', tr: 'izin ver' },
  'tui.approval_card.action.deny': { en: 'deny', tr: 'reddet' },
  'tui.approval_card.action.defer': { en: 'defer', tr: 'ertele' },
  'tui.approval_card.action.escalate': { en: 'escalate', tr: 'üst seviyeye taşı' },
  'tui.approval_card.scope.file_read': { en: 'file read', tr: 'dosya okuma' },
  'tui.approval_card.scope.file_write': { en: 'file write', tr: 'dosya yazma' },
  'tui.approval_card.scope.shell_exec': { en: 'shell execution', tr: 'kabuk çalıştırma' },
  'tui.approval_card.scope.git_mutation': { en: 'git mutation', tr: 'git değişikliği' },
  'tui.approval_card.scope.network': { en: 'network', tr: 'ağ' },
  'tui.approval_card.scope.credential': { en: 'credential', tr: 'kimlik bilgisi' },
  'tui.approval_card.scope.lifecycle': { en: 'lifecycle', tr: 'yaşam döngüsü' },
  'tui.approval_card.risk_tier.routine': { en: 'routine', tr: 'rutin' },
  'tui.approval_card.risk_tier.elevated': { en: 'elevated', tr: 'yükseltilmiş' },
  'tui.approval_card.risk_tier.critical': { en: 'critical', tr: 'kritik' },
  'tui.approval_card.blocking.request': { en: 'blocks this request', tr: 'bu isteği bloklar' },
  'tui.approval_card.blocking.trigger': { en: 'blocks the trigger', tr: 'tetikleyiciyi bloklar' },
  'tui.approval_card.blocking.run': { en: 'blocks the run', tr: 'koşuyu bloklar' },
  'tui.approval_card.blocking.security': { en: 'security hold', tr: 'güvenlik beklemesi' },
  'tui.approval_card.origin.confirmation': { en: 'tool confirmation', tr: 'araç onayı' },
  'tui.approval_card.origin.autonomous_trigger': { en: 'autonomous trigger', tr: 'otonom tetikleyici' },
  'tui.approval_card.origin.gateway_pairing': { en: 'gateway pairing', tr: 'ağ geçidi eşleme' },
  'tui.approval_card.origin.broker_native': { en: 'broker', tr: 'aracı' },
  'tui.approval_card.sla_stage.initial': { en: 'first notice', tr: 'ilk bildirim' },
  'tui.approval_card.sla_stage.renotify': { en: 're-notified', tr: 'yeniden bildirildi' },
  'tui.approval_card.sla_stage.alternate_channel': { en: 'alternate channel notified', tr: 'alternatif kanal bildirildi' },
  'tui.approval_card.sla_stage.park_alert': { en: 'parked with alert', tr: 'uyarıyla park edildi' },
  'tui.approval_card.sla_stage.expired': { en: 'expired', tr: 'süresi doldu' },
  'tui.approval_card.timeout.request_default': { en: 'on timeout: the outcome above applies', tr: 'zaman aşımında: yukarıdaki sonuç uygulanır' },
  'tui.approval_card.timeout.park_alert': { en: 'on timeout: park and alert', tr: 'zaman aşımında: park et ve uyar' },
  'tui.approval_card.timeout.park_undecidable': { en: 'on timeout: park as undecidable', tr: 'zaman aşımında: karar verilemez olarak park et' },
  'tui.approval_card.timeout.deny_expire': { en: 'on timeout: deny and expire', tr: 'zaman aşımında: reddet ve sonlandır' },
  'tui.shortcuts.help.keys': { en: '?', tr: '?' },
  'tui.shortcuts.help.action': { en: 'this panel (empty composer) · Esc closes', tr: 'bu panel (boş composer) · Esc kapatır' },

  // ── TERMINAL-TOOLS-007 — native engine BOOT outcomes (run.tsx
  //    localizeNativeError phase 'boot'). Same error codes as the
  //    `native.switch.*` rows in messages.ts, but a boot failure is not a
  //    switch: the engine never started and the legacy loop runs instead. ──
  'native.boot.missing-api-key': {
    en: 'native engine not started — {provider} needs an API key: set {detail}. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — {provider} için API anahtarı gerekli: {detail} tanımlayın. Bunun yerine eski döngü çalışıyor.',
  },
  'native.boot.missing-ollama-host': {
    en: 'native engine not started — ollama needs a host: set {detail} in .deckent/config.json. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — ollama için host gerekli: .deckent/config.json içinde {detail} tanımlayın. Bunun yerine eski döngü çalışıyor.',
  },
  'native.boot.missing-local-llm-endpoint': {
    en: 'native engine not started — local-llm needs an endpoint: set {detail} in .deckent/config.json. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — local-llm için endpoint gerekli: .deckent/config.json içinde {detail} tanımlayın. Bunun yerine eski döngü çalışıyor.',
  },
  'native.boot.missing-native-model': {
    en: 'native engine not started — local-llm needs an exact model ID: set {detail} (deckent config set native_model <id>) to one of the endpoint\'s published /models IDs. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — local-llm için tam model kimliği gerekli: {detail} değerini (deckent config set native_model <id>) endpoint\'in /models listesindeki kimliklerden biri yapın. Bunun yerine eski döngü çalışıyor.',
  },
  'native.boot.unsupported-native-provider': {
    en: 'native engine not started — "{detail}" has no native tool-use transport; valid: claude, openai, ollama, deepseek, qwen, glm, local-llm. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — "{detail}" için native tool-use transport yok; geçerli: claude, openai, ollama, deepseek, qwen, glm, local-llm. Bunun yerine eski döngü çalışıyor.',
  },
  'native.boot.legacy-model-alias': {
    en: 'native engine not started — "{detail}" is a legacy alias; use an exact provider API model ID. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — "{detail}" eski bir takma addır; tam sağlayıcı API model kimliği kullanın. Bunun yerine eski döngü çalışıyor.',
  },
  'native.boot.unknown-model': {
    en: 'native engine not started — unknown model "{detail}": use an exact registered provider API model ID. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — bilinmeyen model "{detail}": tam kayıtlı sağlayıcı API model kimliği kullanın. Bunun yerine eski döngü çalışıyor.',
  },
  'native.boot.no-transport': {
    en: 'native engine not started — no native transport configured: set ANTHROPIC_API_KEY / OPENAI_API_KEY / openai_base_url / ollama_host. Running the legacy loop instead.',
    tr: 'native motor başlatılmadı — native transport tanımlı değil: ANTHROPIC_API_KEY / OPENAI_API_KEY / openai_base_url / ollama_host tanımlayın. Bunun yerine eski döngü çalışıyor.',
  },
  'tui.switch_busy': {
    en: 'cannot switch {kind} while a turn is in progress — wait for it to finish, or /interrupt first',
    tr: 'tur sürerken {kind} değiştirilemez — bitmesini bekleyin ya da önce /interrupt kullanın',
  },
  'tui.thinking_verbs': {
    en: 'thinking|rearing up|diving deep|weighing|composing|connecting|distilling|focusing',
    tr: 'düşünüyor|şahlanıyor|derinlere dalıyor|tartıyor|kurguluyor|bağ kuruyor|damıtıyor|yoğunlaşıyor',
  },
  // Legacy loop live tool-activity line (`🔧 <verb>: <target>…`,
  // chat-render-region.ts renderToolActivity) — one row per built-in tool;
  // an unknown tool renders its raw name (technical token, never prose).
  'tui.tool_activity.deckent_write_file': { en: 'writing file', tr: 'dosya yazıyor' },
  'tui.tool_activity.deckent_edit_file': { en: 'editing file', tr: 'dosya düzenliyor' },
  'tui.tool_activity.deckent_read_file': { en: 'reading file', tr: 'dosya okuyor' },
  'tui.tool_activity.deckent_bash': { en: 'running command', tr: 'komut çalıştırıyor' },
  'tui.tool_activity.deckent_status': { en: 'reading status', tr: 'durum alıyor' },
  'tui.tool_activity.deckent_memory_query': { en: 'searching memory', tr: 'hafızada arıyor' },
  'tui.tool_activity.deckent_history': { en: 'reading history', tr: 'geçmişe bakıyor' },
  'tui.tool_activity.deckent_plan': { en: 'preparing plan', tr: 'plan hazırlıyor' },

  // ── `/help` list header + trust-tier headings ──────────────────────────
  'tui.help.commands_header': { en: 'Commands:', tr: 'Komutlar:' },
  'tui.help.tier.core': { en: 'Core', tr: 'Çekirdek' },
  'tui.help.tier.project': { en: 'Project', tr: 'Proje' },
  'tui.help.tier.mcp': { en: 'MCP', tr: 'MCP' },
  'tui.help.tier.enterprise': { en: 'Enterprise', tr: 'Kurumsal' },
  'tui.help.tier.danger': { en: 'Danger', tr: 'Tehlike' },

  // ── slash command descriptions (SLASH_CATALOG order) ───────────────────
  'tui.slash.desc.help': { en: 'List available commands', tr: 'Kullanılabilir komutları listele' },
  'tui.slash.desc.status': { en: 'Show the active sprint status', tr: 'Aktif sprint durumunu göster' },
  'tui.slash.desc.recall': { en: 'Search memory (e.g. /recall docker)', tr: 'Hafızada ara (örn: /recall docker)' },
  'tui.slash.desc.plan': { en: 'Plan a sprint', tr: 'Sprint planla' },
  'tui.slash.desc.do': {
    en: 'Plan and run a goal (e.g. /do add a health endpoint)',
    tr: 'Bir hedefi planla ve çalıştır (örn: /do sağlık ucu ekle) — terminal.run_flow_v2',
  },
  'tui.slash.desc.sprint': { en: 'Show sprint history', tr: 'Sprint geçmişini göster' },
  'tui.slash.desc.retro': { en: 'Show the last sprint retrospective', tr: 'Son sprint retrospektifini göster' },
  'tui.slash.desc.doctor': { en: 'Check codebase health', tr: 'Codebase sağlığını kontrol et' },
  'tui.slash.desc.models': { en: 'List model & provider registrations', tr: 'Model & provider kayıtlarını listele' },
  'tui.slash.desc.analyze': { en: 'Analyze the project stack & health', tr: 'Proje stack & sağlık analizi' },
  'tui.slash.desc.review': { en: 'Evaluate the last sprint result (GO/NO_GO)', tr: 'Son sprint sonucunu değerlendir (GO/NO_GO)' },
  'tui.slash.desc.explain': { en: 'Explain sprint results', tr: 'Sprint sonuçlarını açıkla' },
  'tui.slash.desc.agents': { en: 'List the registered agent pool', tr: 'Kayıtlı agent havuzunu listele' },
  'tui.slash.desc.skills': { en: 'List the registered skill pool', tr: 'Kayıtlı skill havuzunu listele' },
  'tui.slash.desc.features': { en: 'Query the feature manifest', tr: 'Özellik manifestini sorgula' },
  'tui.slash.desc.config': {
    en: 'Show/change configuration (e.g. /config set max_workers 4)',
    tr: 'Yapılandırmayı göster/değiştir (örn: /config set max_workers 4)',
  },
  'tui.slash.desc.nervous': {
    en: 'Show pending nervous notifications (e.g. /nervous accept <id>)',
    tr: 'Bekleyen nervous bildirimleri (örn: /nervous accept <id>)',
  },
  'tui.slash.desc.interrogate': {
    en: 'Show DIRECTIVES interrogation questions (pre-plan PLAN-INT-1)',
    tr: 'DIRECTIVES sorgulama sorularını göster (pre-plan PLAN-INT-1)',
  },
  'tui.slash.desc.resume': { en: 'Resume a previous chat session (e.g. /resume 1)', tr: 'Önceki sohbet oturumunu sürdür (örn: /resume 1)' },
  'tui.slash.desc.runs': { en: 'List concurrent runs (read-only)', tr: 'Eşzamanlı koşuların listesi (salt-okuma)' },
  'tui.slash.desc.sync': {
    en: 'Sync agent/skill manifests + routing (asks for confirmation)',
    tr: 'Agent/skill manifest + routing senkronize et (onay ister)',
  },
  'tui.slash.desc.checkpoint': {
    en: 'Approve/reject a checkpoint (e.g. /checkpoint approve <sprint> <phase>)',
    tr: 'Checkpoint onayla/reddet (örn: /checkpoint approve <sprint> <faz>)',
  },
  // Danger rows: the textual carrier is "(confirmation every time)" and the
  // /help Actions catalog adds the `!` tier badge; the former ⚠️ prefix was an
  // emoji icon with an ambiguous-width variation selector (SINGLE-SURFACE §7,
  // PLATFORM-MATRIX §6) and never fed the Danger classification (classifyTool
  // → 'always', chat-native.ts), so it is dropped in both languages.
  'tui.slash.desc.kill': {
    en: 'Stop the active sprint/worker (confirmation every time)',
    tr: 'Aktif sprint/worker durdur (her seferinde onay)',
  },
  'tui.slash.desc.cleanup': {
    en: 'Archive task files and clean up the sprint (confirmation every time)',
    tr: 'Task dosyalarını arşivle, sprint temizle (her seferinde onay)',
  },
  'tui.slash.desc.recover': {
    en: 'Recover a crashed sprint (e.g. /recover sprint-224, confirmation every time)',
    tr: 'Çökmüş sprint kurtar (örn: /recover sprint-224, her seferinde onay)',
  },
  'tui.slash.desc.autonomous': {
    en: 'Drive the autonomous engine (e.g. /autonomous status · backlog add <title> [--cron <expr>] · approve <id>)',
    tr: 'Otonom motor (örn: /autonomous status · backlog add <başlık> [--cron <expr>] · approve <id>)',
  },
  'tui.slash.desc.audit': {
    en: 'Run a sprint audit (e.g. /audit gate sprint-269 · query [channel] · compliance)',
    tr: 'Sprint audit (örn: /audit gate sprint-269 · query [kanal] · compliance)',
  },
  'tui.slash.desc.usage': { en: 'Show token/limit usage (e.g. /usage --sprint 275)', tr: 'Token/limit kullanımını göster (örn: /usage --sprint 275)' },
  'tui.slash.desc.resources': { en: 'Show an MCP resource snapshot (e.g. /resources --log)', tr: 'MCP kaynak anlık görüntüsü (örn: /resources --log)' },
  'tui.slash.desc.directives': {
    en: "Show DIRECTIVES.md · write with '/directives set <text>' (asks for confirmation)",
    tr: "DIRECTIVES.md göster · '/directives set <metin>' ile yaz (onay ister)",
  },
  'tui.slash.desc.mcp': {
    en: 'Use external MCP tools — list · call <tool> [args] (project .mcp.json)',
    tr: 'Harici MCP araçları — list · call <tool> [args] (proje .mcp.json)',
  },
  'tui.slash.desc.model': { en: 'Switch the model (ids: /models; e.g. /model <model-id>)', tr: 'Modeli değiştir (kimlikler: /models; örn: /model <model-id>)' },
  'tui.slash.desc.provider': { en: 'Switch the provider (e.g. /provider <name>)', tr: 'Provider değiştir (örn: /provider <ad>)' },
  'tui.slash.desc.approve': { en: 'Set the approval mode: suggest | auto-edit | full-auto', tr: 'Onay modu: suggest | auto-edit | full-auto' },
  'tui.slash.desc.renew': {
    en: 'Renew an exhausted working-budget epoch (billing counters keep running)',
    tr: "Tükenen working-budget epoch'unu yenile (billing sayaçları sürer)",
  },
  'tui.slash.desc.term': { en: 'Show/switch the terminal mode: /term ask|run|control', tr: 'Terminal modu göster/değiştir: /term ask|run|control' },
  'tui.slash.desc.cd': { en: 'Change the working directory (e.g. /cd ~/my-project)', tr: 'Çalışma dizinini değiştir (örn: /cd ~/deckent-dev)' },
  'tui.slash.desc.cancel': { en: 'Cancel queued pending messages', tr: 'Kuyruktaki bekleyen mesajları iptal et' },
  'tui.slash.desc.clear': { en: 'Clear the screen', tr: 'Ekranı temizle' },
  'tui.slash.desc.exit': { en: 'Leave the REPL (alias: /quit)', tr: "REPL'den çık (takma ad: /quit)" },
  'tui.slash.desc.quit': { en: 'Alias of /exit', tr: '/exit takma adı' },
});
