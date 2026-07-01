---
name: project_doc_audit_286_287
description: 2026-06-14 deckent dokümantasyonu dogfood ile baştan denetlendi+düzeltildi (Sprint 286/287); user-facing ürün-docs kod-doğrulamalı + rakip-temiz
metadata: 
  node_type: memory
  type: project
  originSessionId: b06127f7-7928-4546-89e4-97f19c87f1ca
---

2026-06-14: deckent'in **tüm user-facing dokümantasyonu** dogfood ile kapsamlı denetlendi+düzeltildi.

**Sprint 286** (48 task, worker-başına 2-4 doküman, koda-karşı-doğrulama): 130 doküman güncellendi
(+10386/−3326). 53/57 DONE, 0 boundary-violation, 47dk, $0 (subscription). DIRECTIVES deseni: her
worker AZ doküman + "DOĞRULA varsayma" + AUTOGEN-koru + rakip-ref-kaldır + deckent.ai. Granüler-task
kalite getirdi.

**Sprint 287** (3 task FIX, disk-verify boşlukları): `roadmap.md` −965 satır eskimiş kıyas
(OpenClaw/Aider 🏆-tablo) + launch-pazarlama (Show HN/tagline) + eski-metrik (148sprint/41ADR)
temizlendi → user-facing yol-haritası; blueprint(-TR) de-competitor; enterprise-* derinleşti.

**Hand-verify follow-up (06-14, KRİTİK DERS):** Alperen blueprint.md'de stale içerik gösterdi
("sprintin doğru çalışmadığına eminim :D"). CC 5-paralel-ajan kod-doğrulamalı denetim yaptı →
**~80 RESIDUAL olgusal hata** (sprint DONE demişti). Bulunanlar: kırık komutlar (`run <task-id>`
gerçekte `run <description>`; re-run = `spawn <taskId>`; `recover <sprint-id>`; `config --show`
yok; `nervous status` yok), hayalet config-key'ler (docker_memory_limit/ollama_host/preflight/
worker_model/memory.budget yok), yanlış default'lar (mode=performance balanced-değil, brain_planning=
auto, dependency_pipeline=true), uydurma ADR-084, olmayan `src/providers/docker-backend.ts`(×4),
13→14 model, modüller 94/148/25/7. Hepsi CC tarafından ELLE kod-doğrulamalı düzeltildi + 5 HIGH
komut **binary-test**'le kanıtlandı. blueprint.md/-TR (2989-sat stale master-plan) → archive.
Commit'ler: 88518714(baseline)→b75e82bc(286)→7eca06db(287)→ebc55b03(archive)→c12dac9c/04fe4312/
702c7c7b/887bab2a(hand-fix ~85).

**DERS (bağlayıcı):** dogfood doc-sprint **sayıları/yapıyı** hizalar ama worker her **komutu RUN
etmez / her config-key'i grep'lemez** → ~80 hata kaçtı. User-facing doc-accuracy için sprint sonrası
**CC kod-doğrulamalı hand-verify pass ŞART** (5-ajan cluster-audit + binary-test komutlar). features/
cluster yüksek-doğruluktaydı (worker orada derin doğruladı) → kalite worker-disiplinine göre değişken.
Ayrıca: "Claude Code"/`.cursor/rules`/`--cursor` MEŞRU (deckent worker-runtime + IDE-adapter, rakip değil).

**Sonuç:** user-facing ürün-docs **komut/config/sayı koda hizalı, rakip-kıyas=0, deckent.agency=0**
(kod+binary-doğrulamalı). Kalan ~6 cosmetic-LOW (skills.md metadata-tablosu, birkaç örnek-çıktı).

**Öğrenimler:**
- **False-NO_GO nüksetti:** worker işi yapıp `.result` yazmadan çıkıyor → Brain NO_GO der ama
  disk-diff iş-yapıldığını gösterir. Her sprint sonu **disk-verify ground-truth** ([[feedback_brain_synthetic_nogo_disk_verify]]).
- **"Claude Code" ref'leri MEŞRU** — deckent worker-runtime'ı olarak Claude Code CLI'ı spawn eder
  (bağımlılık, rakip-kıyas DEĞİL). `.cursor/rules/`/`--cursor`/`detected_env` = çoklu-IDE adapter
  (meşru). Rakip-tarama bunları false-positive verir; "vs/kıyas/🏆-tablo/bashing" gerçek ihlal.
- **İç-strateji docs ayrı kategori:** `competitive-analysis*.md` (Dahili Strateji), `beta-tracker*.md`
  (SUPERSEDED, provenance) kendini arşiv-etiketler + doğası gereği rakip-ref içerir. User-facing
  ürün-doc değil → arşiv-mi-bırak kararı Alperen'in (strateji-belgesi, taşıma onayı gerekir).
- Dokunulmaz: CLAUDE/AGENTS/DECKENT/GEMINI.md, docs/adr, docs/sprints, docs/archive, MASTER-PLAN,
  AUTOGEN docs/reference (cli/mcp-tools/agents/api*/mcp-resources — `npm run docs:ref` üretir).

İlgili: [[feedback_dual_perspective_dogfood_product]] [[project_clean_repo_migration_and_training_data]]
