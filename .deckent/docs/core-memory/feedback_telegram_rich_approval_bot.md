---
name: feedback-telegram-rich-approval-bot
description: "✅ ÇÖZÜLDÜ+CANLI-DOĞRULANDI (2026-06-18): Telegram rich-approval bot (inline [Onayla]/[Reddet] buton → nervous-accept IPC) ZATEN wired (commit ff278cf1) + Telegram round-trip ile kanıtlandı. 06-16 'approve→LLM/buton-yok' artık geçersiz; o gün-ki failure stale-bot'tu."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2528b5e9-3d1e-4315-a351-b71fd3b95d20
---

**Durum (2026-06-18):** İstek KARŞILANDI + **canlı end-to-end doğrulandı.** Sentetik nervous-proposal + Telegram inline-button mesajı gönderildi (test-emit), Alperen Approve'a bastı → `.deckent/nervous/nervous-ipc/pending/<id>.json` yazıldı: `{ notificationId, decision:"accepted" }`. Buton→callback→resolver→`NervousIpcQueue.writeApproval`→executor zinciri ÇALIŞIYOR.

### Kök neden (06-16 failure) — düzeltildi/açıklandı
- 06-16'da park-approval onaylanamadı çünkü o anki çalışan bot **stale process**'ti (rich-approval wiring sonradan landed) VEYA `deckent approve <id>` text-formu yazıldı (regex-eşleşmedi → LLM'e düştü).
- **Wiring artık kodda + dist'te tam (taze):**
  - `telegram.ts`: `reply_markup.inline_keyboard` send ✓ + `callback_query` handler ✓ (`onCallback`).
  - `dispatcher.ts`: nervous notification → `callbackData='approve:<shortCode>'`/`'reject:<shortCode>'` ✓.
  - `connector-bootstrap.ts`: callback → `parseApprovalCallback` → sentetik `approve <id>` → commandRouter ✓.
  - `incoming-command-resolver.ts`: id/prefix/**shortCode** match → `NervousIpcQueue.writeApproval` ✓ (path `.deckent/nervous/nervous-ipc/pending/`).

### Why
Mobil onay-gate'i = autonomous'un human-in-the-loop kapısı. Artık Telegram'dan inline-buton ile çalışıyor — "safe-but-deaf" bu kanalda kapandı ([[project_human_interaction_wire_gap]]).

### How to apply (operasyonel ders)
- **Bot'u dist-rebuild sonrası MUTLAKA restart et** (`deckent bot stop` → `deckent bot listen`) — stale-bot eski-kodu koşar (bu bug'ın gerçek sebebiydi, kod değil).
- Buton-test için built-in komut YOK; sentetik-proposal + Telegram-API send (`.deck` TELEGRAM_TOKEN + config chat_id) ile test-emit edilebilir; doğrulama = IPC-approval dosyası.
- Executor pending'i ancak nervous-runtime (sprint/autonomous) koşarken consume eder — standalone tap IPC yazar ama pending'i resolve etmez (beklenen).
- Kalan iyileştirme (opsiyonel): text-`approve` (id'siz) hâlâ LLM'e gidebilir — yalnız buton-tap garantili. Komut-robustluğu (`deckent approve <id>` formu) ileride eklenebilir.

İlgili: [[project_autonomous_first_dogfood_grand_vision]], [[project_spurious_bot_checkpoint_notify]], [[feedback_dashboard_no_emoji_lucide]] (Telegram'da emoji-buton OK).
