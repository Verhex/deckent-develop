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
