# DIRECTIVES — SPRINT-425: TERM-DİLİM-3 NATIVE-PROPOSAL-CARD + SCHED-5 KOŞUL-KAPATMA

## Goal
TERM-treni dilim-3 (native proposal→card→approval; flag'li) + SCHED-5'in KOŞULLU-GO koşul-kapatması.
Tasarım-SSOT: `docs/analysis/term-flow-unify-design-2026-07-11.md` Sprint-3 +
`docs/analysis/scheduler-shadow-divergence-2026-07-12.md` (koşullar-bölümü ZORUNLU-OKU).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/` runtime SALT-OKU · `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik; 20dk-forensik-sınırı. i18n-FIRST (REPL user-metni).

## Task 1: TERM3 — native RunProposal akışı: tool→coordinator→plan-preview-card→approval (flag'li)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/cli/repl/run-flow-controller.ts, src/cli/repl/plan-preview-card.tsx, src/cli/repl/native-tool-registry.ts, src/cli/repl/cli-bridge-tool-specs.ts, src/cli/helpers/messages.ts, tests/cli/run-flow-controller.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): tasarım-doc Sprint-3 satırı + "Net Öneri" akış-şeması. KANIT-BAĞLAM: bugün
model raw set→plan→start tool'larını kendi sırasıyla çağırıyor; onay gerçek-planı görmeden
generic-confirm'de. BU DİLİM (terminal.run_flow_v2 flag'i ALTINDA; default-OFF — kapalıyken
SIFIR davranış-değişimi testle pinli): (1) YENİ run-flow-controller.ts: 422-reducer'ı süren
host-koordinatör — deckent_propose_run tool-çağrısını alır → run-proposal-compiler+
plan-preview-service (424) ile GERÇEK PlanPreview üretir → reducer'ı PREVIEWING→AWAITING_APPROVAL'a
sürer; (2) YENİ plan-preview-card.tsx: Ink transcript-içi kart — task-özetleri + digest + gate-sonucu
+ approve/reject (mevcut approval-kart desenlerini KOPYALA — APR-kartları emsal; string'ler
getMessage en+tr); (3) flag-açıkken registry'ye YENİ tool `deckent_propose_run` (typed RunProposal
şemalı) eklenir; ESKİ set/plan/start tool'ları KALIR (expert escape-hatch — tasarım-kararı) ama
flag-açık system-prompt'a 'canonical yol propose_run' notu; tool-sayı-pinleri güncellenir (flag-off
sayı DEĞİŞMEZ — pin iki-durumlu); (4) onay→APPROVED'a kadar (start dilim-4'ün işi — STARTING'e
GEÇME; approved-snapshot'ı flow-store yerine bellekte tut, TODO-notu dilim-4); (5) test: flag-off
sıfır-fark + flag-on propose→preview→approve/reject yörüngeleri (Ink render-test mevcut kart-test
desenleriyle).
### goNogo
- goCriteria: flag-off sıfır-davranış pini; controller reducer+424-servis üstünden (yeniden-icat yok); kart Ink-testli + i18n en+tr; tool-sayı-pinleri iki-durumlu; approve→APPROVED'ta durur (start yok); tests/cli yeşil.
- nogo: flag-off davranış değişirse NO_GO; start/detached'e geçilirse NO_GO; ikinci plan-yolu doğarsa NO_GO.

## Task 2: SCHED5K — divergence-raporunun KOŞULLU-GO koşullarını kapat (kapsam-boşlukları)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/orchestra/scheduler-driver.ts, src/orchestra/scheduler-journal.ts, tests/orchestra/scheduler-shadow-coverage.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): `docs/analysis/scheduler-shadow-divergence-2026-07-12.md` §4.2
kapsam-boşlukları + §5 koşullar. GÖREV — raporun GO-koşullarını YAŞAYAN-KANITA çevir (live-switch
DEĞİL — o koşullar kapanınca): (1) rapordaki her kapsam-boşluğu için (legacy-fifo 0-tick ·
cost-stop-tick'i · retry-backoff-tick'i · restore-yolu... raporda ne listelendiyse) SENTETIK
shadow-fixture: o senaryoyu üreten sprint-fixture'ında driver'ı koş → legacy-vs-reducer kıyası
testte (journal'a değil assert'e); expected-divergence sınıfları (FIFO-dep-deliği: legacy-spawn/
reducer-Blocked) İŞARETLİ-assert; (2) beklenmedik-divergence çıkarsa DÜRÜSTÇE kırmızı bırak +
notes'a (fix dilim-5'in kendisine); (3) journal'a coverage-özeti alanı (hangi trigger-türleri
görüldü — gelecek dogfood'un kapsamı ölçülebilir olsun); (4) rapordaki 415/seq-144 vakasının
'reducer-haklı' hükmü fixture'la pinlenir.
### goNogo
- goCriteria: raporun HER kapsam-boşluğu için sentetik-fixture kıyası; expected-divergence işaretli-assert; 415-vakası pinli; coverage-özeti journal-alanı; tests/orchestra yeşil (beklenmedik-divergence varsa dürüst-kırmızı + notes).
- nogo: canlı spawn-yoluna müdahale NO_GO; boşluk atlanırsa NO_GO.
