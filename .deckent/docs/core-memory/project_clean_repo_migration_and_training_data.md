---
name: project_clean_repo_migration_and_training_data
description: "🔴 İKİ YÖN (2026-06-12, develop→product birleşik): (1) Deckent Core eğitim-verisi = mevcut repo + .claude/projects/ + .brain/archive + .deckent/ (json/result/plan/transcript) → süreç-trace eğitim datasına dönüştürülecek (SP-2 data-engineering). (2) develop→product temiz repo geçişi (ADR-065 develop/product split yürütmesi, GA-2 = product-repo public flip): kodu dokümansız (doc-bağımlı testler olmadan, /docs/ hariç) yeni 'deckent' repo'suna taşı → rehber/mimari/design dokümanlarını koddan SIFIRDAN yaz; deckent-dev public→private. Ertelenmiş: dormant-code audit + i18n sweep."
metadata: 
  node_type: memory
  type: project
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

**Yön-1 — Deckent Core eğitim-verisi (SP-2 data-engineering detayı):**
Hazır veri-madeni toplanıp süreç-trace eğitim-datasına dönüştürülecek:
- `.claude/projects/-home-alperen-deckent-dev/` — memory + transcript'ler (CC oturum-geçmişi, karar-akışları)
- `.brain/archive/` + `.brain/memory.db` — ADR, sprint-learning, retro, pattern, debt
- `.deckent/` altı — config, agents/skills manifest, decisions, autonomous backlog
- `.tasks/archive/` (+ canlı) — task JSON, **result**, **plan**, handoff, worker-script
→ JSON/result/plan/transcript HEPSİ → "muazzam eğitim-verisi" (deckent kullanım-profili + kod-tecrübesi + süreç + tool-yönlendirme + ileride ERP-enterprise). Hermes dersi: agent-trace-ağırlıklı = sağlam tool-use.
🔴 **KRİTİK:** Bu veriler aynı zamanda temiz-repo-geçişinde GERİDE bırakılacak şeyler. Geçiş/private-yapma ÖNCESİ bu altın-madeni güvenle export/arşivle — yoksa SP-2'nin tek kaynağı kaybolur. (Geri-dönülmez risk.)

**Yön-2 — develop→product temiz repo geçişi (ADR-065 develop/product split yürütmesi):**
deckent şu an **develop repo** (deckent-dev); kod yeni temiz **product repo** (`deckent`)'a alınacak — **GA-2 = product-repo'nun public flip'i** (Work SSOT: `docs/MASTER-PLAN.md`). Flip-öncesi product-readiness ilkesi: **işlevsellik bitir → kod düzelt → süreç tamamla** ki temiz geçsin (çift-bakış: dogfood + product).
- Kodu **dokümansız** yeni `deckent` repo'suna taşı: `/docs/` hariç + **doc-bağımlı testler olmadan** (önce envanterlenip decouple/kaldırılmalı).
- Sonra rehber/mimari/design dokümanlarını **koddan SIFIRDAN** yaz (mevcut doc-debt taşınmaz). Managed-docs auto-generation'ın doc-debt kaynağı olduğu (ADR-029/013-W locale-leak) — yeni repo'da bu sistem yeniden değerlendirilmeli (otomatik-üretim mi, statik mi).
- deckent-dev **public→private**; product repo GA-2'de public. İki repo birden zor → diğer repo'nun issue/geliştirme/talep akışı buraya alınabilir.
- Gerekçe: deckent-dev'de **inanılmaz doküman-borcu** birikti; temiz başlangıç.

**🔴 Geçiş-öncesi karar/işler (sonraki oturum):**
1. **Veri-arşivle** (Yön-1 madeni) — private/clean ÖNCESİ, geri-dönülmez kayıp riski.
2. **Git-history kararı:** temiz-slate (sıfır history) mi, history-koru mu? Yüzlerce sprint geçmişi = büyük; clean-break cazip ama kayıp.
3. **Doc-bağımlı test envanteri:** hangi testler `docs/`/managed-doc okuyor → decouple/kaldır (taşımadan önce).
4. **Managed-docs kararı:** yeni repo'da otomatik-doc-üretim devam mı, statik-el-yazımı mı (doc-debt kökü).
5. **Lisans/community:** public→private geçişte mevcut görünürlük/issue'lar.

**⏳ Ertelenmiş (geçiş/product-readiness kapsamı dışı, sonra):**
- **Dormant-code audit/sweep** — emitTimeoutEvents 135-sprint-0-caller bulgusu motive etti; Alperen "işler bitince yeniden" dedi (2026-06-11).
- **i18n sweep** (AS-3 / §J) — büyük tarama ayrı iş; per-string i18n-first (getMessage) kuralı yine de her-an canlı.
- **Yüzey-realign (terminal-pivot 2026-06-29):** eski "Chat+Dashboard user+enterprise kusursuz" migration-odağı süpersized → terminal = ana yüzey, dashboard = yalnız-izleme, chat → Desktop-app.

İlgili: ADR-065 (develop/product two-repo split — bunun yürütmesi), [[project_deckent_core_model_and_provider]] (SP-2), [[project_deckent_native_terminal_agent]] (çift-beta product-flow), [[project_repl_dashboard_usage_dogfood]], [[project_deckent_god_level_vision]] (kalite-çapa), ADR-029/013-W (managed-docs locale-leak = doc-debt kaynağı).
