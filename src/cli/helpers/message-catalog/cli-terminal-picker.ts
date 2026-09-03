// src/cli/helpers/message-catalog/cli-terminal-picker.ts
// ═══ TERMINAL-PICKER-001 — `cli-terminal-picker` message-catalog family ═════
//
// User-visible text for the Terminal's interactive value picker (src/cli/repl/
// picker.ts + picker-card.tsx): the one selection primitive behind bare
// `/model`, `/provider`, `/approve`, `/term`, `/resume` and `/config`. The
// mechanism is string-free — run.tsx buildPickerLabels resolves these keys and
// injects them (requireInjectedLabel guards every field).
//
// Keys are `tui.picker.*`; both languages mandatory (tests/cli/repl/
// picker-catalog.test.ts). Placeholders: {n} {query} {command} {glyph} {id}
// {value} {error} {code} {detail}. Voice: calm, precise; never names a model or
// provider id (KANUN 10 — the registry/config is the only source).

import type { MessageFamily } from './cli-common.js';

export const CLI_TERMINAL_PICKER_MESSAGES: MessageFamily = Object.freeze({
  // ── titles per picker kind ─────────────────────────────────────────────
  'tui.picker.title.model': { en: 'Choose a model', tr: 'Model seç' },
  'tui.picker.title.provider': { en: 'Choose a provider', tr: 'Sağlayıcı seç' },
  'tui.picker.title.approve': { en: 'Choose the approval mode', tr: 'Onay modunu seç' },
  'tui.picker.title.term': { en: 'Choose the terminal authority posture', tr: 'Terminal yetki duruşunu seç' },
  'tui.picker.title.resume': { en: 'Choose a session to resume', tr: 'Sürdürülecek oturumu seç' },
  'tui.picker.title.config_key': { en: 'Choose a setting', tr: 'Ayar seç' },
  'tui.picker.title.config_value': { en: 'Choose a value for {key}', tr: '{key} için değer seç' },
  'tui.picker.title.confirm': { en: 'Confirm', tr: 'Onayla' },

  // ── hints / lines ──────────────────────────────────────────────────────
  'tui.picker.hint_pick': { en: '↑↓ / j k move · type to filter · Enter select · Esc close', tr: '↑↓ / j k gez · yazarak filtrele · Enter seç · Esc kapat' },
  'tui.picker.hint_filter_esc': { en: 'Esc clears the filter · Enter select', tr: 'Esc filtreyi temizler · Enter seç' },
  'tui.picker.hint_scope': { en: 'Tab/←→ choose scope · Enter confirm · Esc back', tr: 'Tab/←→ kapsam seç · Enter onayla · Esc geri' },
  'tui.picker.hint_filter': { en: 'filter: {query}', tr: 'filtre: {query}' },
  'tui.picker.empty': { en: 'nothing to choose from', tr: 'seçilecek bir şey yok' },
  'tui.picker.more': { en: '{glyph} {n} more', tr: '{glyph} {n} daha' },
  'tui.picker.reveal': { en: '{glyph} full id: {id}', tr: '{glyph} tam kimlik: {id}' },
  'tui.picker.typed_hint': { en: 'type {command} <n|id> to choose', tr: 'seçmek için {command} <n|id> yazın' },
  'tui.picker.unavailable_surface': { en: 'the interactive menu is not available on this surface', tr: 'etkileşimli menü bu yüzeyde yok' },
  'tui.picker.typed_form': { en: 'type the value directly: {command} <value>', tr: 'değeri doğrudan yazın: {command} <değer>' },
  'tui.picker.not_found': { en: 'no such choice: {arg}', tr: 'böyle bir seçenek yok: {arg}' },

  // ── state words (every row carries one; color only supplements) ────────
  'tui.picker.state.current': { en: 'current', tr: 'etkin' },
  'tui.picker.state.ok': { en: 'ok', tr: 'uygun' },
  'tui.picker.state.blocked': { en: 'blocked', tr: 'engellendi' },
  'tui.picker.state.unknown': { en: 'unknown', tr: 'bilinmiyor' },

  // ── commit scopes ──────────────────────────────────────────────────────
  'tui.picker.scope.session': { en: 'this session only', tr: 'yalnız bu oturum' },
  'tui.picker.scope.default': { en: 'save as default', tr: 'varsayılan yap' },
  'tui.picker.scope.apply': { en: 'apply', tr: 'uygula' },
  'tui.picker.scope.cancel': { en: 'cancel', tr: 'vazgeç' },

  // ── typed blocked reasons (code → sentence); generic carries the code ──
  'tui.picker.blocked.MODEL_INACTIVE': { en: 'inactive under the owner model policy — activate it with deckent models activate', tr: 'sahip model politikasında pasif — deckent models activate ile etkinleştirin' },
  'tui.picker.blocked.MODEL_NOT_IN_ACTIVE_SET': { en: 'not in the explicit active set of this provider', tr: 'bu sağlayıcının açık aktif setinde değil' },
  'tui.picker.blocked.NO_NATIVE_TRANSPORT': { en: 'no native transport for this provider in the Terminal', tr: 'Terminal için bu sağlayıcıda yerel taşıma yok' },
  'tui.picker.blocked.MISSING_CREDENTIAL': { en: 'credential missing — {detail}', tr: 'kimlik bilgisi eksik — {detail}' },
  'tui.picker.blocked.NOT_ENUMERABLE': { en: 'not enumerable here — use deckent config set', tr: 'burada listelenemez — deckent config set kullanın' },
  'tui.picker.blocked.NO_MODELS_LISTED': { en: 'no models are listed for this provider', tr: 'bu sağlayıcı için listelenmiş model yok' },
  // ── TERMINAL-PROVIDER-EVIDENCE-001 — evidence-store reasons ────────────
  'tui.picker.blocked.NOT_LOGGED_IN': { en: 'host CLI is not logged in — run its login first', tr: 'host CLI oturumu açık değil — önce giriş yapın' },
  'tui.picker.blocked.UNREACHABLE': { en: 'unreachable — {detail}', tr: 'erişilemiyor — {detail}' },
  // ── TERMINAL-PICKER-007 — closure rows ─────────────────────────────────
  'tui.picker.fact.models': { en: '{n} models', tr: '{n} model' },
  // ── TERMINAL-PROVIDER-VOCAB-001 — one vocabulary: the transport is a fact ──
  'tui.picker.fact.via.host_cli': { en: 'via host CLI', tr: 'host CLI üzerinden' },
  'tui.picker.fact.via.api': { en: 'via API', tr: 'API üzerinden' },
  'tui.picker.fact.via.local': { en: 'local', tr: 'yerel' },
  'tui.picker.seam_missing': { en: 'this session has no config write seam', tr: 'bu oturumda config yazma bağlantısı yok' },
  'tui.picker.read_only_busy': { en: 'read-only while a turn is running', tr: 'bir tur çalışırken salt-okunur' },
  'tui.picker.blocked_generic': { en: 'unavailable ({code})', tr: 'kullanılamaz ({code})' },

  // ── row facts for the approval-mode picker (TERMINAL-PICKER-003) ───────
  'tui.picker.fact.approve.suggest': { en: 'ask before every tool call', tr: 'her araç çağrısından önce sor' },
  'tui.picker.fact.approve.auto_edit': { en: 'file edits run, shell commands ask', tr: 'dosya düzenlemeleri çalışır, kabuk komutları sorar' },
  'tui.picker.fact.approve.full_auto': { en: 'no prompts (always-confirm tools still ask)', tr: 'soru yok (her-zaman-onay araçları yine sorar)' },

  // ── outcomes ───────────────────────────────────────────────────────────
  'tui.picker.committed.session': { en: 'switched for this session: {value}', tr: 'bu oturum için geçildi: {value}' },
  'tui.picker.committed.default': { en: 'saved as default: {value}', tr: 'varsayılan olarak kaydedildi: {value}' },
  'tui.picker.committed.apply': { en: 'applied: {value}', tr: 'uygulandı: {value}' },
  'tui.picker.default_write_failed': { en: 'default not saved ({error}); the session switch stands', tr: 'varsayılan kaydedilemedi ({error}); oturum geçişi geçerli' },
  // ── /config settings menu (TERMINAL-PICKER-004) ────────────────────────
  'tui.picker.fact.config.current': { en: 'now {value}', tr: 'şimdi {value}' },
  'tui.picker.fact.config.default': { en: 'default {value}', tr: 'varsayılan {value}' },
  'tui.picker.committed.config': { en: 'saved: {key} = {value}', tr: 'kaydedildi: {key} = {value}' },
  'tui.picker.config_write_failed': { en: 'not saved ({error})', tr: 'kaydedilemedi ({error})' },
});
