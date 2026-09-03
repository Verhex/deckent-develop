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
  'tui.picker.title.config_value': { en: 'Choose a value', tr: 'Değer seç' },
  'tui.picker.title.confirm': { en: 'Confirm', tr: 'Onayla' },

  // ── hints / lines ──────────────────────────────────────────────────────
  'tui.picker.hint_pick': { en: '↑↓ move · type to filter · Enter select · Esc close', tr: '↑↓ gez · yazarak filtrele · Enter seç · Esc kapat' },
  'tui.picker.hint_scope': { en: 'Tab/←→ choose scope · Enter confirm · Esc back', tr: 'Tab/←→ kapsam seç · Enter onayla · Esc geri' },
  'tui.picker.hint_filter': { en: 'filter: {query}', tr: 'filtre: {query}' },
  'tui.picker.empty': { en: 'nothing to choose from', tr: 'seçilecek bir şey yok' },
  'tui.picker.more': { en: '{glyph} {n} more', tr: '{glyph} {n} daha' },
  'tui.picker.reveal': { en: '{glyph} full id: {id}', tr: '{glyph} tam kimlik: {id}' },
  'tui.picker.typed_hint': { en: 'type {command} <n|id> to choose', tr: 'seçmek için {command} <n|id> yazın' },
  'tui.picker.unavailable_surface': { en: 'the interactive menu is not available on this surface; type {command} <n|id>', tr: 'etkileşimli menü bu yüzeyde yok; {command} <n|id> yazın' },

  // ── state words (every row carries one; color only supplements) ────────
  'tui.picker.state.current': { en: 'current', tr: 'geçerli' },
  'tui.picker.state.ok': { en: 'ok', tr: 'uygun' },
  'tui.picker.state.blocked': { en: 'blocked', tr: 'engelli' },
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
  'tui.picker.blocked_generic': { en: 'unavailable ({code})', tr: 'kullanılamaz ({code})' },

  // ── outcomes ───────────────────────────────────────────────────────────
  'tui.picker.committed.session': { en: 'switched for this session: {value}', tr: 'bu oturum için geçildi: {value}' },
  'tui.picker.committed.default': { en: 'saved as default: {value}', tr: 'varsayılan olarak kaydedildi: {value}' },
  'tui.picker.committed.apply': { en: 'applied: {value}', tr: 'uygulandı: {value}' },
  'tui.picker.default_write_failed': { en: 'default not saved ({error}); the session switch stands', tr: 'varsayılan kaydedilemedi ({error}); oturum geçişi geçerli' },
});
