---
name: project_dashboard_realrun_findings
description: "Dashboard gerçek-kullanım denetimi (2026-06-01) — sprint-start donduruyor, chat hollow, eksik sayfalar; F7 \"DONE\"ları hollow çıktı"
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**Dashboard gerçek-kullanım denetimi (Alperen, 2026-06-01, `npx deckent serve` :3100 + tarayıcı).** Serve token-inject + /api/status artık çalışıyor (Sprint 216-006 run-proven), AMA dashboard birçok yönden hollow — Sprint 215 F7 "DONE"ları gerçek kullanımda eksik çıktı. Proof-of-Function gate'in ([[feedback_proof_of_function_dod]]) yakalaması gereken tam tipte bulgular.

**Doğrulanmış bulgular (kanıt: serve log + ekran görüntüsü):**
1. **🔴 P0 — Sprint başlatınca dashboard DONUYOR.** Serve log: `Directives updated via dashboard (0 tasks)` → `Plan requested (mode: auto)` → `Sprint started (jobId: ...)` → dashboard skeleton-loading'de asılı kalıyor (Config sayfası gri placeholder, sol-alt "..." bağlanamıyor). **Kök neden:** dashboard sprint-start `runSprint`'i AYNI serve process'inde çalıştırıyor → Node event loop bloke → serve HTTP'ye yanıt veremiyor. DECKENT.md gotcha'sının dashboard versiyonu ("deckent_start fire-and-forget: runSprint event loop'u bloke edebilir"). **Fix:** sprint-start'ı serve'den DETACH et (child_process `deckent start` spawn veya fire-and-forget async — HTTP loop hiç bloke olmamalı).
2. **🔴 Chat hollow** — sadece `status` intent'ine yanıt veriyor, gerçek sohbet round-trip YOK ([[feedback_wiring_pct_vs_user_working]]). 216-008 `handleChatMessage` API'de var ama dashboard ChatPage gerçek round-trip'e bağlı değil.
3. **🔴 Eksik sayfalar** — sidebar'da yalnızca 5 sayfa: Dashboard / History / Memory / Config / Chat. **Evolution / Nervous / Enterprise sayfaları (Sprint 215 "DONE") sidebar'da YOK** → route'a eklenmemiş veya görünmüyor. F7-006/009/010 "DONE"ları hollow.
4. **📌 Performans hedefi** — dashboard hızı NATIVE olmalı, kopma/freeze olmamalı (skeleton-loading takılması kabul edilemez).
5. **🎨 Tasarım iyileştirilmeli (Alperen)** — mevcut UI işlevsel-skeleton seviyesinde, god-level DEĞİL. Görsel/UX redesign (modern, tutarlı, sezgisel bilgi mimarisi) F7-003 ÇEKİRDEK iş, kozmetik değil. [[feedback_no_minimum_no_mvp_deckent]] — "bu god-level mi?" sorusu.

**Pozitif (gerçek çalışıyor):** Terminaller çalışıyor (#1 embedded terminal sağlam) ✅. Doğrudan proje dizininde çalışıyor ✅. Dashboard'dan plan+sprint-start MEKANİĞİ çalışıyor (217-001 docker worker healthy spawn oldu) — sadece donma + boş-directives UX sorunu var.

**Ayrıca UX:** Dashboard'dan sprint başlatma formu DIRECTIVES içeriği almıyor → boş "new sprint" (0 task) gönderiyor. Gerçek iş için formda DIRECTIVES editörü gerekli.

**🔴 Dashboard-v2 + Nervous geri-bildirimleri (Alperen 2026-06-02, Sprint 219 sonrası tarayıcı — Sprint 220 hedefi):**
1. **Canlı/değişen dashboard:** Dashboard sekmesi worker'ları güncellemiyor (ilk 6 worker sabit kalıyor). Sürekli-canlı, değişen worker grid olmalı.
2. **Status sayfası yanlış güncelliyor:** done işler hâlâ "working" görünüyor. Faz/durum gerçek-zamanlı yansımalı.
3. **Refresh + cooldown:** anlık-güncelleme yerine user-tetikli "refresh" butonu + cooldown (periyodik manuel güncelleme isteği). Sürekli poll yerine kontrollü.
4. **Evolution sekmesi boş/işlevsiz** + ADR timeline boş — gerçek veri bağla (219-013 sonrası endpoint var, UI doldurmuyor).
5. **Chat hâlâ status-only:** sadece "status" yazılabiliyor, başka işlev yok (219-004 agentic dispatch gelince düzelir; dashboard ChatPage de bağlanmalı).
6. **Config'de brain budget hatalı görünüyor** — düzelt.
7. **Tech debt sayfası çok uzun → FİLTRE ekle** (sprint/severity/status filtresi).
8. **Coverage takip edilmiyor:** history sayfasında 0 görünüyor. Coverage gerçek ölçüm + history'ye yansıt.
9. **Enterprise sayfası API-token istiyor** (boş) — auth wire.
10. **Alerts SPAM:** "CLAUDE.md güncellenmedi" sürekli basıyor (gemini/openai/diğer md'ler de güncellenmedi). Sürekli değil — **en sonda TEK uyarı** (dedup/throttle). Provider-neutral (sadece CLAUDE.md değil).
11. **Nervous'u AÇ:** `config.nervous_system.enabled: false` → `true` (observer wire VAR, 2 caller; sadece config gate kapalı). Doğru mod (`strict`/`balanced`?) + tam-aktivasyon (NERVOUS-TODO aktivasyon planı: bootstrap + action-handlers + smoke). Dashboard NervousPage'e canlı data akar.

**🔴 Sprint 219 run-verify bulgusu (2026-06-02, gerçek dist/cli/entry.js):** `deckent` argümansız REPL AÇILIYOR ✅ (219-001) AMA gerçek LLM'e bağlı DEĞİL — *"Path C skeleton, provider not yet wired, not connected to a real LLM"*. 219-002 "gerçek round-trip" mock-test geçti ama gerçek-binary'de provider-wire YOK (hollow). `chat --native --once` flag bile yok. **Sprint 220 P0:** native REPL'i gerçek subscription provider'a bağla (Path C: claude/codex/gemini CLI spawn → REPL round-trip; F2-008). Dashboard nav ✅ (bundle 19 route), /api/nervous/status 200 ✅, autonomous-runtime + agentic-dispatch export ✅ (iskelet gerçek). 219-010 (dashboard cache-bust e2e) NO_GO → Sprint 220.

**Sonraki sprint (gerçek 217+ veya 216-fix) kapsamı:** (a) sprint-start detach (P0 donma fix), (b) chat gerçek round-trip dashboard'a bağla, (c) Evolution/Nervous/Enterprise sayfalarını sidebar+route'a ekle (gerçek-load run-proven), (d) DIRECTIVES editörü formu, (e) native hız/no-freeze. Hepsi Proof-of-Function `Smoke:` ile (gerçek tarayıcı/HTTP kanıtı). İlgili: [[project_dashboard_control_plane]], [[feedback_proof_of_function_dod]].
