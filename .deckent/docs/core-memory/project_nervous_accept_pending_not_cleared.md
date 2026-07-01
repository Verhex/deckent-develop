---
name: project_nervous_accept_pending_not_cleared
description: "Nervous accept IPC round-trip LANDS (resolved-marker kanıt, stale-bot DEĞİL) ama proposal'ı nervous-pending.json'dan SİLMİYOR → re-notify döngüsü; reject siliyor. Stale proposal'lar (önceki sprint) birikiyor."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b503489-a387-4808-b9f6-904626878468
---

**✅ ÇÖZÜLDÜ (2026-06-24, B-COLLISION-HANG kampanyası — `NERVOUS-APPROVAL-FIX-PLAN.md`):** Kök-neden netleşti + kapandı: accept shortCode'la geliyordu ama `executor.resolveApproval` map'i **full-id-key'liydi → shortCode MISS → `pendingStore.remove` HİÇ çağrılmıyordu** → `nervous-pending.json` temizlenmiyordu → re-notify. **FIX-2** (`5009717e`): resolveApproval artık shortCode|full-id ikisini de kabul edip full-id'yi resolve ediyor → `pendingStore.remove(fullId)` (=`nervous-pending.json` purge, makeFilePendingStore=AYNI dosya). **FIX-1** (`b3d41bc1`): consume'da `NERVOUS_APPROVAL_CONSUMED` jsonl-ack (görünürlük). **FIX-5/FIX-3**: collision re-notify debounce + serialize (sprint-tarafı kök). **FIX-6 guard-test** (`7d0ada80`) end-to-end doğruluyor. → accept artık reject ile pariteli (pending temizlenir, re-notify durur). KALAN: canlı end-to-end (build+restart sonrası Alperen). Aşağıdaki tarihsel teşhis arşiv.

**2026-06-19 (sprint-298 sonrası, Alperen bot'tan onaylıyordu):** `nervous-pending.json`'da 7 proposal vardı — hepsi **06-18'den (önceki, tamamlanmış sprint)** `scope-collision`/`stale-worker` tipli, ama CLI `deckent nervous` bunları **"⚠ WARNING — unknown / Detected: unknown"** render ediyor (proposal'da `type` ALANI VAR ama renderer type→label map'leyemiyor — display gap; gerçek `type` boş değil).

**Asıl bug (empirik disk-verify):**
- User bot'tan **accept** ettikçe → `nervous-ipc/resolved/` altında marker birikiyor (örn. `2ffd67a0` için **3× duplicate** resolved-marker) → yani **accept IPC round-trip LANDING** (bot→nervous IPC sağlam, **stale-bot DEĞİL**; 06-18'deki [[feedback_telegram_rich_approval_bot]] stale-bot teşhisinden farklı).
- AMA accept proposal'ı **`nervous-pending.json`'dan SİLMİYOR** → aynı proposal pending kalıyor → tekrar bildiriyor → user tekrar onaylıyor (duplicate marker'ların sebebi bu döngü).
- **`reject` ise pending'i DOĞRU siliyor** (test edildi: `deckent nervous reject <id>` → pending 7→6→…→0). Meşru proposal'lar (aktif sprint'in `SCOPE_COLLISION_REORDER`'ı) hem accept hem clear oluyor (history'de ×3 [accepted], temiz akış).
- **Aksiyon (alındı):** 7 stale 06-18 proposal'ı `reject` ile temizledim → pending **0** ("No pending notifications"); bot re-notify durdu.

**Why:** accept-path IPC-marker'ı resolve ediyor + (obsolete action'ı çalıştırmaya çalışıyor, no-op) ama **proposal'ı pending'den kaldırmıyor** — reject-path kaldırıyor. İki path arasında pending-removal pariteSİZ. Ayrıca tamamlanmış sprint'in proposal'ları **expire olmuyor** (TTL yok) → birikiyor.

**How to apply:** Bot "nervous onay" bildirimi spam'lerse → bunlar muhtemelen stale/obsolete; **`deckent nervous reject <full-id>`** ile temizle (accept değil — accept pending'i bırakır). Pending listesi: `deckent nervous`; full-id `nervous-pending.json`'dan. **Gerçek fix adayları:** (1) nervous accept handler başarıda proposal'ı `nervous-pending.json`'dan kaldırsın (reject ile parite); (2) önceki/tamamlanmış sprint proposal'larına TTL/expire; (3) CLI renderer `type`→okunur-label map'lesin ("unknown" yerine `scope-collision`/`stale-worker`). İlgili: [[project_spurious_bot_checkpoint_notify]] (bu 06-06 memory "nervous KAPALI, pending YOK" diyordu — durum değişti, nervous artık proposal üretiyor), [[project_human_interaction_wire_gap]], [[feedback_telegram_rich_approval_bot]].
