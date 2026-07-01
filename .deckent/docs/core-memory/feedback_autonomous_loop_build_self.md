---
name: feedback_autonomous_loop_build_self
description: "Otonom sprint-döngüsü (Alperen 2026-06-11): build:all'ı CC kendi koşar, onay alma, sprint kill yok, başarısızlık→notlar.md; madde sırası M-L-K-D-C-B/F-B/MF-diğer"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

Alperen (2026-06-11 gece): "madde sırası M-L-K-D-C-B/F-B/MF-diğerlerini istediğin sıradan; bu maddeleri planlayarak sprintleri devam ettir; yapabildiğin kadarını otonom modda; deckent dogfood→cc verify→sonraki iş döngüsü; `npm run build:all` komutunu KENDİN koşabilirsin her sprint sonrası; sprint kill yok bekle sonuç illa dönecektir; başarısızlıklarda analiz notu alıp `notlar.md` dosyasına okumam için bırak; tekrar onay almana gerek yok auto-mode devam."

**Why:** Tam otonom dogfood-loop — Alperen uyurken/yokken CC, MASTER-PLAN açık maddelerini sprint-by-sprint kapatır. Önceki blocker (her sprint sonrası build+mcp-restart Alperen'i bekliyordu) kalktı: build:all artık CC'de.

**How to apply:**
- **Döngü:** DIRECTIVES yaz → commit → `deckent plan --no-confirm` → `deckent start` (CLI, MCP değil) → monitor → her result disk-verify → sprint sonu: lint + kayıt-düzelt (stats/CLAUDE.md/memory.db/ledger) + commit/push + **`npm run build:all` (CC koşar)** → sonraki sprint. Kesintisiz.
- **Madde sırası (Alperen):** M (dashboard/monitoring/wire) → L (human-interaction kalan) → K (evolution) → D (process/autonomous) → C (native chat/REPL) → B/F (capability/ERP canlı) → B/MF (mixed-fleet+PSL) → gerisi CC seçimi (G MCP-client/H provider-native/I offline/J i18n/N perf/O docs/E enterprise/P launch).
- **/mcp restart GEREKMEZ:** dogfood `deckent` CLI'ı dist'ten koşar; build:all yeni dist'i yazar; sonraki `deckent start` onu okur. MCP tool kullanılmıyor sprint-döngüsünde (Bash'ten CLI). MCP restart yalnız ben `deckent_*` MCP tool çağırırsam gerekir — döngüde çağırmam.
- **Sprint kill YASAK** (mevcut kural pekişti) — bekle; sonuç döner; exit-without-result → FIX dalgası ya da CC manuel respawn (ADR-047).
- **Başarısızlık → `notlar.md`** (repo kökü): ne oldu + kök-neden + aksiyon + kalan risk; Alperen sabah okur. Başarı kısa, başarısızlık detaylı.
- Model-katmanlama + mikro-task + dependency + opt-in/fail-safe + cache-prefix korunumu standartları aynen sürer.
- İlgili: [[feedback_scale_up_autonomous]] [[feedback_build_mcp_restart_coordination]] (build artık CC'de — bu memory onu günceller) .
