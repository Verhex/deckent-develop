# DIRECTIVES — SPRINT-422: TERM-DİLİM-1 RUNFLOW-CONTRACT + TT556 PLANNER-PREFLIGHT

## Goal
🏁 RC-treni bitti → karar-turu-3 Faz-B açılışı: TERM-treni dilim-1 (544: typed RunProposal
contract + reducer; flag'li, davranışsız) + TRACE-treni son-P1 TT556 (born-661 + gate-false-positive
ailesi born-650/653). **TRACE-task'ı model=opus (Alperen).** Tasarım-SSOT:
`docs/analysis/term-flow-unify-design-2026-07-11.md` (ZORUNLU-OKU, Sprint-1 dilimi).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/`, `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik (tmpdir, async spawn, ≤16GB); 20dk-forensik-sınırı.

## Task 1: TERM1 — run-flow-contract + reducer: typed RunProposal→…→Completion durum-makinesi (flag'li, production-caller YOK)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/core/run-flow-contract.ts, src/orchestra/run-flow-reducer.ts, src/core/config-types.ts, src/core/config.ts, tests/orchestra/run-flow-reducer.test.ts
- Scope: src/core/, src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): `docs/analysis/term-flow-unify-design-2026-07-11.md` — "Net Öneri" state-seti +
Sprint-1 dilimi + Riskler (idempotency/digest). KANIT-BAĞLAM: karar-turu-3 hibrit-kararı — model
yalnız typed RunProposal üretir; plan→digest→onay→exact-snapshot→detached-run→completion
host-owned coordinator'da. BU DİLİM yalnız SÖZLEŞME+REDUCER (UI/tool-bridge YOK — dilim-3+):
(1) src/core/run-flow-contract.ts: RunFlowState (COLLECTING→PROPOSAL_READY→PREVIEWING→
AWAITING_APPROVAL→APPROVED→STARTING→DETACHED_RUNNING→COMPLETED|FAILED|CANCELLED|BLOCKED) +
RunProposal {flowId, tenant/project/actor/origin, revision, intent-özeti} + PlanPreview
{planDigest, task-özetleri, policy/gate/cost-sonucu} + ApprovedPlanSnapshot {digest-CAS alanları} +
RunHandle {flowId, jobId, logRef} + versioned RunFlowEvent (schemaVersion; domain-general —
work-model eksenine uyumlu, code-repo'ya DIRECTIVES yalnız adapter-notu); (2)
src/orchestra/run-flow-reducer.ts: PURE reducer (fs/env/Date.now YOK; now/id'ler girdiden) —
geçiş-invariant'ları golden-flow'un stage/cancel organ-nakli (src/orchestra/golden-flow.ts:~153
stage-order + reject/abort'ta start'a geçilmez semantiği AYNEN taşınır; kaynak-yorumuna nakil-notu);
geçersiz-geçiş = typed-hata (sessiz no-op YASAK); duplicate-onay/duplicate-start idempotent
(flowId+revision+digest anahtarıyla — tasarım-doc'un double-start riski); (3) config:
`terminal.run_flow_v2` flag (default FALSE; üçlü-desen) — bu dilimde HİÇBİR production-caller yok
(testle pinle: src'de reducer'ı import eden tek yer test); (4) test: tam-yörünge (mutlu-yol) +
her geçersiz-geçiş + cancel-her-aşamada + idempotency-çiftleri + revision-uyuşmazlığı-BLOCKED.
### goNogo
- goCriteria: contract tüm tipleriyle (schemaVersion'lı event dahil); reducer pure + golden-flow-invariant nakli (kaynak-notlu); geçersiz-geçiş typed-hata; idempotency testli; flag default-off + sıfır-production-caller pini; tests/orchestra yeşil.
- nogo: UI/tool-bridge/CLI'ya dokunulursa NO_GO; reducer'da fs/env/Date.now NO_GO; golden-flow DEĞİŞTİRİLİRSE (yalnız oku/naklet) NO_GO.

## Task 2: TT556 — PLANNER-PREFLIGHT: scope-satisfiability genişletme + gate-false-positive ailesi (born-661+650+653)
- Model: opus | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/orchestra/planner.ts, src/orchestra/prompt-gate.ts, src/core/task-builder-scope.ts, tests/orchestra/planner-preflight.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/
- Dependencies: none
### Description
KANIT (üç canlı-aile, hepsi bu marathon'da): (a) born-661: davranışın kıracağı testler plan-time
write-scope'a eklenmiyor → worker'lar scope-dışı bayat-pin'leri güncelleyemeyip debt'e düşüyor
(413-001 27-test · 413-004 kırık-grep-testi · 414-001 '2 out-of-scope dosya' — CC her seferinde
el-fix'ledi); (b) born-650: G6 kod-token'larını (`Date.now/process.env`, `$2.23/4.25dk`) dosya-yolu
sanıp haksız-BLOCK; (c) born-653: scope-türetmesi Files'tan sahte-yollar üretiyor
(tests/docs/x.test.ts→docs/-kökü kopyası [414-001 canlı] + 'src/core/deck-file.ts/'
dosya-adı+slash sahte-dizinleri [decision-journal'da]). GÖREV — gerçek ev-dosyalarını bul
(Files-listesi tahminidir; gate/planner/scope-derivation'ın gerçek modüllerini grep'le,
sapmaları notes'a): (1) 653-fix: scope-derivation uzantı-tespitli (dosya-yolu dizin-sanılmaz) +
türetilen-yol Files'ta yoksa EKLENMEZ; regresyon-fixture: 411-001 + 414-001 gerçek
Files-listeleri → sahte-yol sıfır; (2) 650-fix: G6 path-extraction gerçek-yol-desenine
sıkılaşır — yol-adayı = [uzantılı VEYA bilinen-kök-önekli (src/ tests/ docs/ scripts/ .github/)]
VE kod-API-blacklist-dışı (Date.now, process.env, import.meta...) VE sayı/para-deseni-dışı;
regresyon-çifti: '(Date.now, process.env ve fs importu YOK)' cümlesi BLOCK'suz + gerçek
eksik-yol vakası hâlâ BLOCK; (3) 661-çekirdek: preflight 'affected-test taraması' —
plan-time'da her task'ın filesWrite'ındaki kaynak-modülleri import-eden/pinleyen test-dosyaları
(hızlı-grep: kaynak-yolu ya da modül-adı geçen tests/**) tespit edilir → task'ın write-scope'una
OTOMATİK eklenir (rapor-satırıyla: 'affected-test-expansion: +N dosya') — cap makul (≤25;
aşımda uyarı+ilk-25); tam dependency-graph İCAT ETME (o born-661'in kalan-vizyonu; notes'a).
(4) Üç fix de RED-first gerçek-vaka fixture'larıyla.
### goNogo
- goCriteria: 653 sahte-yol-sıfır (gerçek-liste fixture'lı) · 650 regresyon-çifti (false-positive ölür + gerçek-vaka yaşar) · 661 affected-test-expansion capli+raporlu; üçü RED→GREEN; mevcut gate/planner testleri yeşil.
- nogo: gerçek-eksik-yol vakası artık yakalanmıyorsa (gate zayıflatıldıysa) NO_GO; expansion cap'siz/sessizse NO_GO.
