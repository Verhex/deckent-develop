# DIRECTIVES — SPRINT-426: TERM-DİLİM-4 EXACT-SNAPSHOT START + SCHED-5 CONTINUOUS LIVE-SWITCH

## Goal
TERM-treni dilim-4 (approved-snapshot'tan CAS-doğrulamalı start; fresh-replan ölür — flag'li) +
SCHED-treni dilim-5 (initial+watcher pass'ler tek injected driver'dan; engine-config'li, default legacy).
Tasarım-SSOT: `docs/analysis/term-flow-unify-design-2026-07-11.md` Sprint-4 satırı + Riskler bölümü,
`docs/analysis/scheduler-unify-design-2026-07-11.md` Sprint-5 satırı + Riskler bölümü (ZORUNLU-OKU).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/` runtime SALT-OKU · `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik; 20dk-forensik-sınırı. i18n-FIRST (REPL user-metni).

## Task 1: TERM4A — run-flow-store + run-job-service + snapshot-tüketen start (flag'li)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/cli/repl/run-flow-store.ts, src/orchestra/run-job-service.ts, src/cli/commands/start.ts, src/mcp/tools/start.ts, src/cli/helpers/detached-start.ts, src/orchestra/sprint-controller.ts, tests/orchestra/run-job-service.test.ts, tests/cli/run-flow-store.test.ts
- Scope: src/cli/, src/orchestra/, src/mcp/, tests/
- Dependencies: none
- Smoke: node dist/cli/entry.js start --help → exit 0 + usage metni
### Description
ÖNCE OKU (zorunlu): tasarım-doc Sprint-4 satırı + Riskler (double-start idempotency · preview/execution
TOCTOU · detached-handle korelasyonsuzluğu). KANIT-BAĞLAM: bugün detached start fresh lifecycle'da
runPlanPhase'i YENİDEN çağırıyor (sprint-controller start-yolu) — onaylanan plan ile koşan plan aynı
snapshot değil. BU DİLİM (terminal.run_flow_v2 flag'i ALTINDA; default-OFF — kapalıyken SIFIR
davranış-değişimi testle pinli): (1) YENİ run-flow-store.ts: approved-snapshot kalıcılığı (dilim-3'ün
bellekte-tut TODO'su buraya) — flowId+revision+planDigest anahtarlı, atomic-write, append-only,
proje-scoped; (2) YENİ run-job-service.ts: approved snapshot'ı TÜKETEN start-yolu — start önce digest'i
CAS ile doğrular (beklenen-digest uyuşmazsa typed hata, start OLMAZ), flag-açıkken fresh-replan ÖLÜR
(yeni plan-fazı çağrılmaz — testle kanıtla); (3) detached-start'a durable job-correlation: handle
flowId taşır (pid tek başına multi-session'da yanlış-eşleşir — tasarım Riskler); (4) mcp/tools/start.ts
+ commands/start.ts flag-açıkken snapshot-yolunu kullanır, flag-kapalı legacy fresh-plan AYNEN kalır;
(5) çifte-start idempotency: aynı flowId+digest ikinci start → no-op typed sonuç (double-start ölür).
### goNogo
- goCriteria: flag-off sıfır-davranış pini; CAS-digest testli (yanlış-digest start'ı typed-hatayla reddeder); flag-açıkken fresh-replan ölü (plan-fazı çağrılmaz — testle); aynı flowId+digest double-start no-op; detached handle flowId-korelasyonlu; tests yeşil.
- nogo: flag-off davranış değişirse NO_GO; ikinci plan-yolu doğarsa NO_GO; legacy start-yolu bozulursa NO_GO.

## Task 2: TERM4B — REPL canlı-mount: controller run/app'e + approve→start tetiği (flag'li)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/cli/repl/run.tsx, src/cli/repl/app.tsx, src/cli/repl/run-flow-controller.ts, src/cli/repl/native-agent-bridge.ts, src/cli/helpers/messages.ts, tests/cli/run-flow-mount.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: Task 1
### Description
Dilim-3'ün (sprint-425) kasıtlı-ertelemesi. BU DİLİM (aynı terminal.run_flow_v2 flag'i altında):
(1) run-flow-controller REPL'e GERÇEKTEN mount edilir (app/run bileşenleri — flag-açıkken
deckent_propose_run akışı canlı transcript'te kartıyla görünür; flag-kapalı SIFIR fark, testle pinli);
(2) approve sonrası controller Task-1'in run-job-service API'siyle STARTING→DETACHED_RUNNING'e sürer
(dilim-3'ün APPROVED'ta-dur sınırı kalkar); approved-snapshot artık bellek değil Task-1'in
run-flow-store API'siyle kalıcı — store/servis DOSYALARINA YAZMA, yalnız import edip kullan (Task-1
sahası); (3) i18n: her yeni user-metin getMessage en+tr; (4) Ink render-testleri: flag-off sıfır-fark
+ flag-on approve→start yörüngesi (run-job-service test-double ile — gerçek sprint başlatma YOK).
### goNogo
- goCriteria: flag-off sıfır-davranış pini; mount flag-açık render-testle gerçek; approve→start zinciri Task-1 servis-API'si üstünden (yeniden-icat yok); i18n en+tr; tests/cli yeşil.
- nogo: flag-off fark NO_GO; run-flow-store.ts veya run-job-service.ts dosyalarına yazarsa NO_GO; gerçek sprint spawn ederse NO_GO.

## Task 3: SCHED5 — continuous live-switch: initial+watcher tek injected driver (engine-config'li)
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/orchestra/result-collector.ts, src/orchestra/scheduler-driver.ts, src/orchestra/scheduler-effects.ts, src/orchestra/sprint-spawner.ts, src/core/config.ts, tests/orchestra/scheduler-driver-composition.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/
- Dependencies: none
### Description
ÖNCE OKU (zorunlu): tasarım-doc Sprint-5 satırı + Riskler (canonical-executor-öncesi live-switch
routing/persistence kaybı · immutable clone · retry-deadline reducer-input'u · initial-spawn tek-truth).
KANIT-BAĞLAM: shadow 9-sprint/2671-tick differential + koşul-kapatma fixture'ları (sprint-425)
→ divergence-raporu hükmü KOŞULLU-GO, koşullar kapandı, dilim-5 HAZIR. BU DİLİM (YENİ config anahtarı
scheduler.engine: legacy|reducer, DEFAULT legacy — legacy'de SIFIR davranış-değişimi testle pinli):
(1) initial-spawn pass + watcher pass AYNI injected driver'ı çağırır (initial bypass kalırsa tek-truth
iddiası boş — tasarım Riskler); (2) engine=reducer iken queue/ready/idle/respawn effect'leri TEK
executor'dan (scheduler-effects) geçer; legacy closures DURUR ama SİLİNMEZ (rollback = config-flip);
(3) YENİ scheduler-driver-composition.test.ts: injected runtime-driver call-order + effect-sırası +
legacy-vs-reducer davranış-eşdeğerliği (sprint-425'in sentetik shadow-fixture'ları EMSAL — kopyala-uyarla);
(4) shadow-journal mekanizması (dilim-4) engine'den bağımsız çalışmaya devam eder; (5) dogfood
config-DOSYASINA dokunma — canlı flip ayrı karar, sen yalnız mekanizmayı getir.
### goNogo
- goCriteria: scheduler.engine default legacy + legacy sıfır-fark pini; reducer-engine'de initial+watcher tek-driver testle kanıtlı; effect'ler tek-executor'dan; composition-test yeşil; shadow-journal engine'den bağımsız sürer.
- nogo: default reducer yapılırsa NO_GO; legacy closures silinirse NO_GO; canlı dogfood-config değiştirilirse NO_GO.
