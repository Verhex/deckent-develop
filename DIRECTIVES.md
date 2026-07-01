# DIRECTIVES — OVERNIGHT ROUND 7 (WIRING): 353-çekirdeklerini canlı-yüzeylere bağla (15 task)

## Goal
353'te inen saf-çekirdekleri (footer/mode/queue/tool-dispatch/APR-ailesi/DeckBroker/builder) canlı
yüzeylere WIRE et. Riskli davranış-değişimleri FLAG-GATED DEFAULT-OFF iner (gece-güvenli): flag-off
yolu byte-identical. DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (Files=tek yazım-otorite; index.ts YALNIZ Task 8'de; messages.ts YALNIZ Task 15'te).
- **DISK-VERIFY first**; ADR kontrat (D-004 import-yönü!); surgical; YAGNI.
- **Hermetik test** (tmpdir; gerçek provider/exec yok). **No build/install/login.**
- **Flag-gated wiring**: default-off; flag-off byte-identical (testle kanıtla).
- **Honest result. No haiku.**

---

## Task 1: REPL-SURFACE-WIRE — footer+mode+queue'yu Ink-app'e bağla
- Model: sonnet
- Effort: high
- Skills: typescript-expert, react-specialist
- Files: src/cli/repl/app.tsx, tests/cli/repl-surface-wire.test.tsx
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
353-inen buildLiveFooter (helpers/live-footer.ts) + term-mode.ts + chat-turn-queue.ts'i (hepsi
disk-verify, READ-ONLY) REPL Ink-app'ine bağla: alt-bölgede canlı-footer (state-feed prop/seam ile),
mod-göstergesi (Ask/Run/Control) + mod-geçiş tuş/komutu, bg-event'ler ChatTurnQueue'dan YENİ-turn
olarak akar (mid-turn enjekte yok). `repl_surface.enabled` config-flag (default-off): flag-off render
byte-identical (mevcut app davranışı).
### goNogo
- goCriteria: flag-off snapshot-identical (ink-testing-library); flag-on footer+mode render + queue
  turn-drain testli; core-modüllere yazılmadı; `tsc` temiz.
- nogo: core-modül düzenlemek; default-on; mevcut REPL akışını bozmak.

## Task 2: TOOL-REPL-WIRE — deckent tool-yüzeyini native-tool-registry'ye köprüle
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/native-tool-registry.ts, tests/cli/tool-repl-wire.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
353-inen tool-registry/tool-search/tool-dispatch (core, READ-ONLY) native-REPL tool-yüzeyine:
`deckent_search_tools` + `deckent_describe_tool` + `deckent_call_tool` native-tool'ları — call_tool
planCall→risk-eşiği→confirm-seam (inject; approval-card follow-up)→execImpl-seam. Eager core-7,
TOOL-CORE deferred-index satırı ilk-turda. `tool_surface.enabled` flag default-off; flag-off mevcut
native-tool listesi byte-identical.
### goNogo
- goCriteria: flag-on 3 tool kayıtlı + search/describe/call-plan akışı fake-exec'le testli; flag-off
  identical; risk-eşiği confirm çağırır; `tsc` temiz.
- nogo: gerçek exec; core dosyalarına yazmak; default-on.

## Task 3: APR-SHELLCLIENT — Ink onay-kartı (row 33)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, react-specialist
- Files: src/cli/repl/approval-card.tsx, tests/cli/approval-card.test.tsx
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
ApprovalEventStream'e (core, READ-ONLY) abone Ink kartı: maskedArgs-özet + risk-rozeti + y/n/a/d
(approve/deny/approve-all-similar/details) tuşları → broker.decide (seam-inject). Kuyruklu çoklu-pending
(tek kart + sayaç). App-wiring follow-up (Task 1'in bölgesine sonra takılır — bu görev bileşen+test).
### goNogo
- goCriteria: ink-testing ile tuş-akışları (y→approve decide çağrısı, d→details genişler); maskedArgs
  gösterilir (raw asla); çoklu-pending sayacı; `tsc` temiz.
- nogo: app.tsx'e yazmak; broker/stream core'una yazmak; raw-args render.

## Task 4: APR-DUALSTREAM — çift-bölge kompozitörü (row 36)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/repl/dual-stream.ts, tests/cli/dual-stream.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Run-status (footer) + approval-bölgesi AYNI anda, çakışmasız: `composeDualStream({statusLines,
approvalLines, width, height})` → bölge-tahsisli satır-listesi (approval öncelikli ama status asla
tamamen kaybolmaz — min-1 satır); taşmada kırpım-işareti. Saf.
### goNogo
- goCriteria: tahsis-matrisi testleri (dar/kısa terminal dahil); approval-yokken tam-status;
  determinizm; `tsc` temiz.
- nogo: Ink/IO; Task-1/3 dosyalarına yazmak.

## Task 5: WORKERGATE-WIRE — riskli worker-tool'ları gate'le (flag-gated)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, secure-coding
- Files: src/agents/agentic-worker-tools.ts, tests/agents/workergate-wire.test.ts
- Scope: src/agents/, src/core/, tests/agents/, docs/adr/
- Dependencies: none
### Description
353-inen WorkerApprovalGate'i (core, READ-ONLY) worker tool-katmanına: riskli tool-sınıfları
(shell-exec/git-mutation/network — command-registry risk hizası) çağrı-öncesi gate.guard'dan geçer.
`approval_gate.enabled` flag DEFAULT-OFF (workers bloklanmaz); flag-off yol byte-identical. Gate-deny
→ tool-hata (structured) + result-notes izi; timeout policy'ye (auto-deny değil — FallbackResolver).
### goNogo
- goCriteria: flag-off identical (test); flag-on riskli-tool guard-çağrısı + deny-akışı + allow-akışı
  (fake broker); riskli-sınıf listesi registry-riskiyle tutarlı; `tsc` temiz.
- nogo: default-on; gate'i bypass eden ikinci yol; core'a yazmak.

## Task 6: DECKBROKER-WIRE — subprocess secret'ları broker'dan (flag-gated)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, secure-coding
- Files: src/core/provider.ts, src/providers/subprocess.ts, tests/providers/deckbroker-wire.test.ts
- Scope: src/core/, src/providers/, tests/providers/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-005/G-017 (row 422 wiring-yarısı). `deck_broker.enabled` flag'iyle (DEFAULT-OFF):
applyDeckSecretsToEnv yolu (disk-verify provider.ts) broker.resolveForTask'tan beslenir — worker-env'e
yalnız o task'ın secret'ları, audit-kayıtlı, TTL'li; `.deck` dosya-yolu worker'a asla. Flag-off mevcut
akış byte-identical (env-scrub + mevcut inject aynen). MOAT-2/PGID düzenleri (unref/detached) bozulmaz.
### goNogo
- goCriteria: flag-off identical (test); flag-on task-scoped env (başka task'ın secret'ı yok — test) +
  audit-kaydı; subprocess moat2/pgid suite'leri yeşil; `tsc` temiz.
- nogo: default-on; broker-bypass; .deck-yolunu env'e koymak.

## Task 7: TERM-FLOW — altın-akış orkestratörü (row 40)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/golden-flow.ts, tests/orchestra/golden-flow.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Simple-task altın akışı tek saf-orkestratörde: `runGoldenFlow(goal, seams)` — intent→(builder-seam:
directives-builder READ-ONLY kullan)→plan-preview payload→approve-seam→start-seam→evaluate-özeti.
Her seam inject (LLM/exec testte fake); adım-adım event-emit (TERM-LIVE feed'ine uygun şekil). İptal
her adımda temiz.
### goNogo
- goCriteria: uçtan-uca fake-seam akışı; approve-red → temiz-iptal; event-sırası deterministik;
  builder'a yazmadan; `tsc` temiz.
- nogo: gerçek sprint başlatma; LLM çağrısı.

## Task 8: DIR1-CMD — `deckent plan-nl` + komut-kayıtları (index.ts TEK-yetkili)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/plan-nl.ts, src/cli/index.ts, tests/cli/plan-nl-cmd.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/, docs/adr/
- Dependencies: CONNECT-CMD
### Description
`deckent plan-nl "<goal>"`: yapılandırılmış-niyet (şimdilik goal→tek-task şablonu; LLM-katmanı
follow-up) → directives-builder → önizleme; `--write` ile DIRECTIVES.md yaz (yedek alarak), default
dry-run-önizleme. index.ts'e KAYIT: hem plan-nl hem CONNECT-CMD'nin ürettiği connect komutu
(dependency ile o önce biter — disk-verify edip register et). i18n: mevcut key'ler; yenisi gerekirse
notes→Task 15.
### goNogo
- goCriteria: dry-run önizleme + --write yedekli yazım (tmpdir); round-trip parse testi; İKİ komut da
  registered (commander-program testi); `tsc` temiz.
- nogo: DIRECTIVES'i yedeksiz ezmek; builder'ı değiştirmek.

## Task 9: CONNECT-CMD — `deckent connect` komutu (kayıtsız — kayıt Task 8'de)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/connect.ts, tests/cli/connect-cmd.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
353-inen connect-wizard çekirdeğini komuta giydir: `registerConnect(program)` export'u (Task 8 kayıt
eder — index.ts'e DOKUNMA); gerçek probe'lar mevcut yardımcılardan (provider-auth-probe/doctor —
disk-verify import), `--json` çıktı + insan-okur özet; salt-teşhis (mutasyon yok).
### goNogo
- goCriteria: registerConnect izole-program testinde çalışır; injected-probe matrisi; --json şeması;
  `tsc` temiz.
- nogo: index.ts'e yazmak; gerçek CLI-probe testte.

## Task 10: MOAT3-FIXPHASE — NOT_DISPATCHED → FIX re-dispatch
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/moat3-fixphase.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
MOAT-3 hikâyesinin FIX-yarısı: evaluation=NOT_DISPATCHED task'lar FIX-fazında worker-suçu sayılmadan
RE-DISPATCH adayı olur (orijinal task aynen yeniden-kuyruğa; failure-classification/skipFix bunları
infra-fail'den AYRI tutar — dispatch hiç olmadı, retry anlamlı). Max-1 re-dispatch turu (sonsuz-döngü
yok); yeniden de dispatch-olmazsa dürüst NOT_DISPATCHED kalır + summary'de ayrı sayaç.
### goNogo
- goCriteria: NOT_DISPATCHED→re-dispatch-plan testi (fake spawn-seam); 1-tur sınırı; skipFix
  infra-sınıflandırması NOT_DISPATCHED'ı worker-crash'ten ayırır (test); mevcut FIX testleri yeşil.
- nogo: sonsuz re-dispatch; NO_GO-akışını değiştirmek.

## Task 11: DEBT-LEDGER-COVERAGE — self-DEBT'ler neden ledger'a düşmüyor
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/debt-manager.ts, tests/orchestra/debt-ledger-coverage.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
352 kanıtı: evaluator-kaynaklı DEBT'ler (008/013) ledger'a düştü, worker-self-DEBT'ler (005/010/012)
DÜŞMEDİ. Disk-verify: debt-manager girdisini nereden alıyor (evaluation-map? result.selfAssessment?)
— hangi dal self-DEBT'i atlıyor; fix: evaluation=GO_WITH_TECH_DEBT olan HER task (kaynak farketmez)
notes-özetiyle ledger'a. Çift-kayıt olmaz (idempotent anahtar).
### goNogo
- goCriteria: kök-neden file:line; self-DEBT fixture → ledger-kaydı (test); evaluator-DEBT regresyonu
  korunur; idempotent; `tsc` temiz.
- nogo: kayıt-formatını değiştirmek; çift-kayıt.

## Task 12: APR-RULES-LOAD — policy-kuralları config'ten (saf yükleyici)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/approval-rules-load.ts, tests/core/approval-rules-load.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Plain config-objesinden (`approval.rules[]`) ApprovalPolicy kural-setine zod-doğrulamalı yükleyici:
bilinmeyen alan/enum → o kural atlanır + uyarı-listesi döner (fail-soft, sprint'i kırmaz); boş/yok →
güvenli-default set (critical→require, high→require, medium→notify, low/none→auto). config.ts wiring
follow-up.
### goNogo
- goCriteria: geçerli/bozuk/karışık kural-setleri testli; default-set güvenli-sıralı; policy-motoruna
  YAZMADAN uyumlu-çıktı; `tsc` temiz.
- nogo: config.ts düzenlemek; sessiz-düşürme (uyarı-listesi şart).

## Task 13: APR-EXPIRY-DRIVER — TTL süpürücü (G-013-güvenli)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/core/approval-expiry-driver.ts, tests/core/approval-expiry-driver.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Broker.expire + store.prune'u süren yaşam-döngüsü-güvenli driver: {start(intervalMs) → unref'd
interval (ADR-G-013: coordinator'ı asla pinlemez), stop() idempotent, tick() test-için-açık}.
Fail-soft tick (hata loglanır, driver ölmez).
### goNogo
- goCriteria: unref kanıtı (hasRef===false); stop-idempotent; tick fail-soft; fake-clock testleri.
- nogo: ref'li timer; broker/store'a yazmak.

## Task 14: STATE-FEED — live-footer gerçek besleme
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/run-state-feed.ts, tests/cli/run-state-feed.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
buildLiveFooter'ın state-seam'ine gerçek kaynak: .tasks/*.hb + .deckent/sprint-state.json okuyucusu
(fs-seam inject; poll-aralıklı snapshot; dosya-yokluğu → dürüst idle). Provider-health/auth alanları
mevcut probe-özetlerinden (varsa cache'ten; probe TETİKLEMEZ). Saf çekirdek + fs-fake testler.
### goNogo
- goCriteria: hb+state fixture'larından doğru footer-state; eksik-dosya idle; probe-tetiklemez;
  `tsc` temiz.
- nogo: gerçek probe; footer/render dosyalarına yazmak.

## Task 15: MESSAGES-KEYS-3 — round-7 i18n (tek-yetkili)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, tests/cli/messages-round7-keys.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: REPL-SURFACE-WIRE, APR-SHELLCLIENT, DIR1-CMD
### Description
Round-7 görevlerinin notes'larındaki key-ihtiyaçlarını topla (bu sprint .result'ları) + en+tr
çiftleriyle ekle; çakışma/fallback testli. Yalnız anahtar-ekleme.
### goNogo
- goCriteria: bildirilen ihtiyaçlar karşılandı (kaynak cite); en+tr çift; messages testleri yeşil.
- nogo: tek-dilli; yapısal değişiklik.
