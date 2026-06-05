---
name: ""
metadata: 
  node_type: memory
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**Vizyon (Alperen, 2026-06-02): "Deckent orchestered for everyone everywhere."** Tek MIT ürün ([[project_deckent_positioning]]) her bağlamda çalışmalı — kuran kişi kendi projesini kolayca entegre edip geliştirebilmeli.

**6 kullanım senaryosu (deckent her yerde):**
1. **Sıfır projeler** — boş dizinde deckent → proje iskeleti + ilk sprint.
2. **Geliştirme aşamasındaki projeler** — mevcut koda entegre, sprint'lerle ilerlet.
3. **Bitmiş + sürekli takip edilen projeler** — bakım, regresyon, izleme modu.
4. **Gündelik işler** — kişisel/otomasyon görevleri (agentic REPL, connector'lar).
5. **ERP / enterprise süreçler** — process automation, DB read-only, RBAC, audit (core+enterprise-layer, AYNI MIT ürün — edition-split YOK).
6. Hepsi **tek motor, üç yüz** (Trinity: developer / individual / enterprise).

**AI-tool-first onboarding (kritik DNA):** Deckent AI araçlara (Claude Code, Cursor, vb.) kurulur → AI aracın **direkt nasıl kullanacağını bilmesi** şart.
- **Mevcut + işlevsel (disk-verify 2026-06-02):** `npm install -g deckent` + `npx deckent init` → `analyzeProject` stack-detect (`stack-detector.ts`) + **CLAUDE.md/DECKENT.md adapter yazımı** (AI aracın bağlam+kullanım rehberi) + `.brain/`/`.deckent/` + `claude mcp add deckent`. `config.skills.autoDetectStack` sisteme göre worker/stack ayarı.
- **Memory katmanı İŞLEVSEL (kanıtlı 2026-06-02):** `.brain/memory.db` 6MB, 487 entry (adr/sprint/retro/pattern/debt/memory), 11 tablo (entries+entries_fts FTS5+tags+relations+entry_history), 1860 tag, 444 relation. `deckent recall` dual-layer i18n FTS5 (TR "güvenlik" + EN "dashboard" → gerçek sonuç). **Token-azaltma + AI-projeyi-unutmama amacı gerçek** — Brain her sprint sorguluyor.
- **İyileştirme alanı (gelecek sprint):** zero-config hızlı-başlangıç, 6-senaryo preset'leri, "kuran kişi kendi projesini tek-komut entegre" cilası, MCP-first kurulum rehberi.

**🤖 Otonom agentic runtime hedefi (Alperen 2026-06-02):** On-demand sprint'in ÖTESİNDE — deckent **sürekli + otonom, belirlenen YETKİ SINIRLARINDA** çalışır. Örnek: enterprise'a kurulur → siparişleri takip eder, analiz eder, MRP kontrol eder, müşteri taleplerine RBAC+onay sınırında **aksiyon alır**. Temel: Process Mode (F3) + scheduled-flows + nervous approval + Capability Broker (F8 ERP read→write) + ADR-037 authority matrix. Agentic 20dk'da sprint bitiriyor (hızlı ✅) ama otonom = uzun-yaşayan/event-driven mod. **Docker timeout uzatıldı** (.deckent/config.json docker_max 14400→28800/8saat, min→5400) — otonom uzun-işler için.

**god-level format kuralı (MVP değil):** task'lar/işler her zaman god-level formatta — MVP/minimum ASLA ([[feedback_no_minimum_no_mvp_deckent]]).

**Doküman SSOT ayrımı (2026-06-02):** `docs/vision/blueprint.md` = deckent NE/NEREDE (kimlik, yetenek, mimari-as-built, positioning). `docs/MASTER-PLAN.md` = nasıl geliştiriliyor (roadmap/sequencing — geliştirme SSOT). `docs/vision/*` ilerleyişe göre güncellenir. blueprint.md 2869 satır Sprint 166'da stale → header güncellendi (Sprint 219), tam-body refresh Sprint 219 doc-task.

**Slogan:** "Open source for open world" + "Deckent orchestered for everyone everywhere."

**How to apply:** Her özellik 6-senaryoya karşı test edilmeli ("bireysel sıfır-proje kullanıcısı bunu kolayca yapabilir mi?" + "enterprise süreçte çalışır mı?"). Native agentic REPL ([[project_deckent_runtime_ecosystem]], Sprint 219) = bireysel-kolaylık ayağı. Onboarding/everywhere cilası → Sprint 220+ adayı. İlgili: [[project_deckent_god_level_vision]], [[project_deckent_trinity_anchor]].
