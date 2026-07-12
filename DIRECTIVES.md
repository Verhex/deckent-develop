# DIRECTIVES — SPRINT-424: TERM-DİLİM-2 SHARED-PREVIEW + SCHED-5-ÖN DIVERGENCE-ANALİZ

## Goal
TERM-treni dilim-2 (shared actual-preview + digest) + SCHED-treni dilim-5-öncesi divergence-analizi
(9-sprint shadow-journal birikti). Tasarım-SSOT: `docs/analysis/term-flow-unify-design-2026-07-11.md`
Sprint-2 + `docs/analysis/scheduler-unify-design-2026-07-11.md` dilim-5.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/` runtime'ına DOKUNMA (scheduler-shadow SALT-OKU) · `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik; 20dk-forensik-sınırı.

## Task 1: TERM2 — shared actual-preview: plan-preview-service + proposal-compiler (CLI/MCP adapter'lı)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/orchestra/run-proposal-compiler.ts, src/orchestra/plan-preview-service.ts, src/cli/commands/plan.ts, src/mcp/tools/plan.ts, tests/orchestra/plan-preview-service.test.ts
- Scope: src/orchestra/, src/cli/commands/plan.ts, src/mcp/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): `docs/analysis/term-flow-unify-design-2026-07-11.md` Sprint-2 satırı +
"Preview" karşılaştırması. KANIT-BAĞLAM: plan-preview iki dünyada da GERÇEK-Brain-planı değil ve
preview→execution digest-bağı yok (TOCTOU riski). BU DİLİM: (1) YENİ run-proposal-compiler.ts:
RunProposal (sprint-422 contract'ı) → DIRECTIVES-markdown — directives-builder'ı code-repo
ADAPTER'ı olarak ÇAĞIRIR (builder'a dokunma); (2) YENİ plan-preview-service.ts: DIRECTIVES →
GERÇEK plan-üretim çekirdeği (mevcut plan-akışının fonksiyonunu bul; CLI-spawn DEĞİL) →
PlanPreview {planDigest: kanonik-JSON sha256, task-özetleri, gate-sonucu}; SALT-OKUR (task-dosyası
YAZMAZ — dry-run semantiği); (3) CLI `plan` + MCP `deckent_plan` iç-implementasyonda servise
delege — DAVRANIŞ-PARİTE (mevcut plan-testleri byte-yeşil; digest yalnız EK alan); (4) test:
determinizm (aynı-DIRECTIVES→aynı-digest) + farklı-set→farklı-digest + salt-okur pini + CLI/MCP
parite.
### goNogo
- goCriteria: compiler builder-adapter'lı; preview gerçek-plan-yolundan + deterministik-digest; salt-okur pini; CLI/MCP parite (mevcut testler byte-yeşil) + delege-kanıtı; tests/orchestra yeşil.
- nogo: ikinci plan-üretim-yolu icat NO_GO; mevcut çıktı-formatı değişirse NO_GO; servis task-dosyası yazarsa NO_GO.

## Task 2: SCHED5ON — shadow-journal divergence-analizi: 9-sprint verisinden sınıflandırma-raporu (SALT-ANALİZ, kod-yok)
- Model: sonnet | Agent: doc-writer | Effort: medium | Provider: claude
- Files: docs/analysis/scheduler-shadow-divergence-2026-07-12.md
- Scope: docs/analysis/
- Dependencies: none
### Description
KANIT-KAYNAK (SALT-OKU): `.deckent/runtime/scheduler-shadow/sprint-4{15..23}.jsonl` — 9 sprint'lik
legacy-vs-reducer karar-kıyası. GÖREV (kod DEĞİŞTİRME — yalnız rapor): (1) tüm journal'ları tara:
toplam-tick, divergence-sayısı, divergence-türleri (spawn-only-in-reducer / spawn-only-in-legacy /
cascade-farkı / queue-farkı...) sprint-bazlı tablo; (2) her divergence-örneğini tasarım-doc'un
'expected-divergence' sınıflarıyla (FIFO-dep-deliği vb.) eşleştir — hangileri BEKLENEN (tasarımın
düzelttiği legacy-hata) hangileri BEKLENMEDİK (reducer-hatası adayı); bilinen-vaka: sprint-415
seq-144 spawn-only-in-reducer 415-002 (dep-ready'de reducer-haklı görünüyor — doğrula); (3)
dilim-5 live-switch için NET GO/NO-GO önerisi + beklenmedik-divergence varsa her biri için
reproduce-fixture tarifi; (4) rapor-yapısı: Özet → tablo → örnek-kayıtlar (verbatim-JSON) →
sınıflandırma → öneri. Kanıt-disiplini: her iddia journal-satır-referanslı (seq+sprint).
### goNogo
- goCriteria: 9-sprint tam-tarama tablosu; her divergence sınıflı (beklenen/beklenmedik gerekçeli); 415-vakası doğrulanmış; net GO/NO-GO önerisi; kod-dosyası değişmemiş.
- nogo: journal-dışı spekülasyon NO_GO; kod değişirse NO_GO; sınıfsız-divergence bırakılırsa NO_GO.
