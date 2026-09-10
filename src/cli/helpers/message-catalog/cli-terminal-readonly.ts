// src/cli/helpers/message-catalog/cli-terminal-readonly.ts
// ═══ TERMINAL-READONLY-APPROVAL-001 (7111) — `cli-terminal-readonly` family ══
//
// User-visible text for the read-only shell fast path and the round-scoped
// native permission card: the compact "read-only · auto" transcript marker
// the tool line carries when a `deckent_bash` read ran on the silent tier, and
// the grouped-intent rows of the NativePermissionIntentCard (one card per
// model round listing every proposed call with its scope/risk).
//
// Why a family file: see cli-common.ts (collision-checked merge, no edit
// contention on messages.ts). Both languages mandatory; mechanism modules
// (native-agent-bridge.ts, approval-card.tsx, native-permission-approval.ts)
// stay string-free and receive these via label injection.

import type { MessageFamily } from './cli-common.js';

export const CLI_TERMINAL_READONLY_MESSAGES: MessageFamily = Object.freeze({
  // ── transcript tool line marker (native-agent-bridge.ts toolSink note) ────
  'native.tool_read_only_marker': { en: 'read-only · auto', tr: 'salt-okunur · otomatik' },

  // ── NativePermissionIntentCard — round-scoped grouped intent ─────────────
  'native_permission.round_title': { en: 'This round proposes {count} tool call(s)', tr: 'Bu turda {count} araç çağrısı öneriliyor' },
  'native_permission.round_item': { en: '{index}. {tool} · {scope} · {risk} · {resource}', tr: '{index}. {tool} · {scope} · {risk} · {resource}' },
  'native_permission.round_item_current': { en: '(this decision)', tr: '(bu karar)' },
  'native_permission.round_item_auto': { en: '(auto · read-only)', tr: '(otomatik · salt-okunur)' },
  'native_permission.round_item_floor': { en: '(asks every time)', tr: '(her seferinde sorar)' },
  'native_permission.round_item_covered': { en: '(covered by this round)', tr: '(bu tur kararıyla kapsanır)' },
  'native_permission.round_item_denied': { en: '(denied by policy)', tr: '(politika tarafından reddedildi)' },
  'native_permission.round_more': { en: '… {n} more call(s) not listed', tr: '… {n} çağrı daha listelenmedi' },
  'native_permission.intent_round': { en: 'Once for the whole round', tr: 'Tüm tur için bir kez' },
  'native_permission.intent_round_consequence': { en: 'each remaining confirm-tier call listed above runs once without re-asking; always-tier calls still ask', tr: 'yukarıdaki kalan confirm-kademesi çağrıların her biri yeniden sorulmadan bir kez çalışır; always-kademesi yine sorar' },
  'native_permission.intent_cancel_dynamic': { en: '{keys} select · Esc/N cancel', tr: '{keys} seç · Esc/N iptal' },
  'native_permission.intent_cancel_round': { en: '{keys} select · Esc/N cancel', tr: '{keys} seç · Esc/N iptal' },
  'native_permission.scope.file-read': { en: 'read', tr: 'okuma' },
  'native_permission.scope.file-write': { en: 'write', tr: 'yazma' },
  'native_permission.scope.shell-exec': { en: 'shell', tr: 'kabuk' },
  'native_permission.scope.git-mutation': { en: 'git', tr: 'git' },
  'native_permission.scope.network': { en: 'network', tr: 'ağ' },
  'native_permission.scope.credential': { en: 'credential', tr: 'kimlik bilgisi' },
  'native_permission.scope.lifecycle': { en: 'lifecycle', tr: 'yaşam döngüsü' },
  'native_permission.scope.unclassified': { en: 'unclassified', tr: 'sınıflandırılmamış' },
  'native_permission.risk.none': { en: 'no risk', tr: 'risksiz' },
  'native_permission.risk.low': { en: 'low', tr: 'düşük' },
  'native_permission.risk.medium': { en: 'medium', tr: 'orta' },
  'native_permission.risk.high': { en: 'high', tr: 'yüksek' },
  'native_permission.risk.critical': { en: 'critical', tr: 'kritik' },
});
