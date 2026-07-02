# DIRECTIVES — SPRINT-358: WIRE & UNWRAP — her şey kullanıcı-görünür + sarmalayıcılıktan çıkış (17 task)

## Goal
357'nin çekirdeklerini kullanıcı-görünür yap (Ink/help/ipc/policy wire'ları), onay-akışını
cross-process'e taşı (kart gerçek worker onayı görsün), REPL'den kilitlemeyen sprint-start,
native-M5 kanıt-kapısı + abonelik-transport tasarımı, governance borçları (458/460/461/464-guard),
PKG-SSOT kapanışı. DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (run.tsx YALNIZ Task 2 · app.tsx YALNIZ Task 6 · chat-native.ts YALNIZ Task 5 ·
  chat-slash-registry.ts YALNIZ Task 4 · chat-tool-bridge.ts YALNIZ Task 3 · ipc-registry.ts YALNIZ
  Task 7 · approval-worker-gate.ts YALNIZ Task 8 · task-builder.ts YALNIZ Task 10 ·
  sprint-retro-writer.ts YALNIZ Task 11).
- **DISK-VERIFY first**; ADR (D-004 yön: core→orchestra import YASAK); surgical; YAGNI.
- **Hermetik test** (tmpdir, async spawn, fake-clock); gerçek provider/exec YOK. **No build/install/login.**
- **npm/yarn/pnpm install-ailesi ASLA** — ihtiyaç doğarsa Dependency-Mutation Advisory kanalı.
- **goCriteria = makine-denetlenebilir** (komut+beklenen-çıktı); kaçış-cümlesi yok.
- **Flag-gated wiring** default-off + **flag-on'un CANLI loadConfig yolu test edilir** (born-464 dersi:
  inject-only test yetmez — resolver-passthrough + round-trip şart).
- **Mekanizma string-free** (label caller-injected); user-facing metin getMessage. **Honest result. No haiku.**

---

## Task 1: APR-XPROC-CORE — approval-store dizin-izleyici çekirdeği (born-462 dilim-1)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/approval-store-watch.ts, tests/core/approval-store-watch.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-462. Relay attach'te store-replay yok → başka process'in diske yazdığı pending taze
sürece AKMIYOR. Çekirdek: `createApprovalStoreWatch(storeDir, handlers, opts)` — fs.watch + poll-fallback
(WSL/ağ-fs güvenilmez; Yasa #2) storeDir'i izler; yeni/değişen kayıtları approval-store'un MEVCUT
okuma yardımcılarıyla parse edip `handlers.onPending(request)` / `handlers.onDecided(id, decision)`
çağırır; gördüklerini id+status ile dedup'lar (aynı kaydı iki kez emit etmez); bozuk/yarım dosya atlanır
(atomic-write kontratı gereği tmp'ler yok sayılır); `dispose()` izlemeyi tamamen kapatır (unref'd
timer'lar — MOAT-2 dersi). Broker/relay'e DOKUNMA — tüketim Task 2'nin.
### goNogo
- goCriteria: tmpdir-store'a dışarıdan yazılan pending → onPending 1× (dedup testli); decided-geçiş →
  onDecided; tmp/bozuk dosya emit edilmez; dispose sonrası event yok + açık handle yok
  (`getActiveResourcesInfo` temiz); `npx vitest run tests/core/approval-store-watch.test.ts` pass; `tsc` temiz.
- nogo: approval-store.ts/broker/relay değişikliği; polling'siz yalnız-fs.watch (fallback şart).

## Task 2: APR-XPROC-WIRE — REPL'e cross-process onay beslemesi (born-462 dilim-2)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/run.tsx, tests/cli/repl/approval-xproc-wire.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: APR-XPROC-CORE
- Smoke: node dist/cli/entry.js --help → exit 0
### Description
runInkRepl'in approval-wire bloğuna (repl_surface.approvals=true dalı) Task 1 izleyicisini bağla:
onPending → broker'ın MEVCUT public yüzeyiyle isteği in-process pending'e al (disk'te ZATEN var olan
kaydı çift-YAZMADAN — disk-verify: broker.submit yeniden-yazar mı, yoksa recover/ingest yolu var mı;
yoksa relay'i doğrudan besleyen en dar temiz yol neyse onu kur ve gerekçele), onDecided → kart-kuyruğu
temizliği; REPL exit'inde watch.dispose(). Mevcut DECKENT_APPROVAL_DEMO ve fail-soft davranış korunur.
### goNogo
- goCriteria: hermetik test — tmpdir-store'a "dış-process" yazımı simüle → terminal-channel events'inde
  pending görünür; decide → dosyada decided; flag-off'ta watch hiç kurulmaz; REPL-testleri
  (tests/cli/repl/) yeşil; `tsc` temiz.
- nogo: app.tsx/broker/relay-çekirdeği değişikliği; demo-seed'in silinmesi.

## Task 3: REPL-DETACHED-START — REPL'den kilitlemeyen sprint-start
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/helpers/detached-start.ts, src/cli/commands/chat-tool-bridge.ts, tests/cli/detached-start.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js --help → exit 0
### Description
REPL tool-bridge'i `deckent start`'ı senkron koşarsa turn kilitlenir. `detached-start.ts`:
`spawnDetachedDeckent(argv, opts)` — kendi entry'sini detached+unref spawn eder (PGID ayrı; stdout/err
`.deckent/recently-works/<cmd>-<ts>.log`'a), PID+log-path döndürür. chat-tool-bridge'te start/run/process
komut-sınıfını bu yola yönlendir; dönüş mesajı "başlatıldı (pid, log-yolu) — izleme: /status ya da
live-footer" (getMessage'lı metin caller'da; bridge string-free kalır). Diğer komutların senkron yolu
DEĞİŞMEZ.
### goNogo
- goCriteria: fake-spawn ile detached çağrı argv/opts doğru (detached:true, unref çağrıldı, stdio log'a);
  start-sınıfı komut bridge'te detached-yola gider, status gibi komutlar senkron kalır (test);
  `tsc` temiz.
- nogo: gerçek sprint başlatma; run.tsx/app.tsx değişikliği; senkron-yolu bozmak.

## Task 4: REPL-DISPATCH-PARITY — /nervous köprü-tüketimi + /autonomous /mcp parite
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/chat-slash-registry.ts, tests/cli/repl-dispatch-parity.test.ts
- Scope: src/cli/, src/nervous/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js --help → exit 0
### Description
MASTER-PLAN Sıra-66 (REPL-001) + Sıra-72 kalanı. slash-registry'ye: `/nervous` alt-komutları
(list/accept/reject/edit) — 357-006 nervous-bridge.ts'i TÜKET (plan-objesi → injected-executor;
bridge'i değiştirme); `/autonomous` (start/backlog/status) ve `/mcp` (list/restart-hint) girişleri
mevcut cliArgsFor/командregistry desenleriyle. Registry-girişleri kategori/risk etiketli (TERM-3
deseni). handleEdit yolu: `/nervous edit <id> <json>` → bridge.handleEdit planı.
### goNogo
- goCriteria: registry'de 3 komut-ailesi + risk/kategori (test); /nervous accept/edit fake-executor'la
  plan-doğru; mevcut slash-testleri yeşil; `tsc` temiz.
- nogo: nervous-bridge.ts/chat-tool-bridge.ts değişikliği; gerçek nervous-exec.

## Task 5: HELP-SURFACE-WIRE — /help'e katalog + mode-filtre (Sıra-26+56 kapanışı)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/help-surface-wire.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js --help → exit 0
### Description
chat-native.ts:701 (`renderHelp(slashAction.registry)`) iki wire alır: (1) 357-010'un
`getVisibleCommands(mode)` export'u → registry mode-filtreli render (enterprise-slash user-mode'da
gizli; mevcut TermMode state'inden mode oku); (2) 357-002 catalog-render'ı /help çıktısının
"Tools/Actions" bölümü olarak tüket (tool-catalog'dan classifyToolTrust + trust-badge; labels
getMessage'dan enjekte). NO_COLOR'da düz metin.
### goNogo
- goCriteria: user-mode /help enterprise-komut İÇERMEZ, control-mode İÇERİR (test); /help çıktısında
  trust-badge'li katalog bölümü (fixture-test); mevcut chat-native testleri yeşil; `tsc` temiz.
- nogo: chat-mode.ts/catalog-render.ts değişikliği; hardcoded string.

## Task 6: APP-SURFACE-WIRE — /resume picker + açılış-teaser + busy-kontrolleri (app.tsx)
- Model: fable
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/app.tsx, tests/cli/repl/app-surface-wire.test.tsx
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js --help → exit 0
### Description
MASTER-PLAN Sıra-50+51 kalan Ink-wire'ları, app.tsx'te (bu task'a özel yazı-yetkisi): (1) açılışta
session-resume.ts `listRecentSessions` teaser'ı (kaynak boşsa HİÇ render etme — degrade-safe) +
`/resume` girişinde `pickSession` akışı (mevcut /resume varsa davranış-birleştir, disk-verify); (2)
busy-controls.ts durum-makinesini bağla: busy iken `/queue` `/interrupt` `/steer` + Esc→interrupt
key-map (çifte-Esc idempotent); steer-notları turn-sonunda drain (ChatTurnQueue kontratı — mid-turn
enjekte YOK). Labels caller/getMessage'dan; DUAL_STREAM/approval bölgesine DOKUNMA. ⚠ app.tsx kritik
yüzey — minimum-diff, mevcut render-düzenini (Static/anchor/input-pinned) bozma; ink-testing-library
deseni mevcut testlerdeki gibi.
### goNogo
- goCriteria: teaser yalnız oturum-varken render (2 fixture testi); /resume picker seçimi sessionId
  değiştirir; busy-matris (queue/interrupt/steer × busy/idle) render-testleri; mevcut app/repl testleri
  yeşil; `tsc` temiz.
- nogo: approval-card/dual-stream bölgesi değişikliği; session-resume.ts/busy-controls.ts değişikliği.

## Task 7: CKPT-QUESTION-BRIDGE-WIRE — worker-soruları gerçek onaya (Sıra-73 kapanışı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/ipc-registry.ts, tests/orchestra/ipc-question-bridge-wire.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
357-004 köprüsünü canlı yola bağla: `handleWorkerQuestion`'a opsiyonel `{ bridge?, broker? }` seam —
`approval.question_bridge` flag'i AÇIK ve köprü sağlanmışsa soru bridgeQuestionToApproval'a delege
(async yol: checkWorkerQuestions çağıranı için fire-and-forget + cevap yazımı köprü-dönüşünde);
flag-off = bugünkü davranış byte-aynı. **NPM-ADVISORY dalı HER DURUMDA köprüden ÖNCE ve deterministik
kalır** (mevcut testler kanıt). result-collector çağrı-noktasına config-flag'i geçir.
### goNogo
- goCriteria: flag-on+fake-bridge → soru köprüye gider, BrainAnswer köprü-kararından yazılır; flag-off
  byte-aynı (mevcut 33+9 ipc-testi yeşil); NPM-ADVISORY köprüye ASLA girmez (test); `tsc` temiz.
- nogo: question-approval-bridge.ts değişikliği; default-on; NPM-ADVISORY davranış değişikliği.

## Task 8: ALLOWSCOPE-COMPOSE — always-allow'u worker-gate önüne bağla (Sıra-69 kapanışı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, secure-coding
- Files: src/core/approval-worker-gate.ts, tests/core/allowscope-compose.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
357-005 approval-allowscope'u WorkerApprovalGate.guard() önüne opsiyonel lookup olarak bağla:
`WorkerApprovalGateOptions.allowStore?` seam — sağlanmışsa guard() submit'ten ÖNCE `matchesAllow(request)`
sorar; eşleşme → broker'a auto-approve-kararlı kayıt (audit-izi KAYBOLMAZ — istek yine submit+decide
edilir, sadece beklemez; gerekçe 'allowscope'). Seam yoksa davranış byte-aynı. Global-wildcard zaten
schema-red (357-005) — burada ikinci savunma: risk 'critical' ASLA allowscope'la geçmez (clamp).
### goNogo
- goCriteria: allow-eşleşen istek beklemeden allow döner AMA store'da submit+decide kaydı var (audit
  testi); critical-clamp testi; seam'siz mevcut worker-gate testleri byte-aynı yeşil; `tsc` temiz.
- nogo: approval-allowscope.ts/policy/broker değişikliği; audit-kaydını atlamak.

## Task 9: TRN-PIPE-WIRE — pipeline outcome-etiketi taksonomiden (Sıra-79 kapanışı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/training/pipeline.ts, tests/training/trn-pipe-label.test.ts
- Scope: src/training/, src/core/, tests/training/, docs/adr/
- Dependencies: none
### Description
357-012 docImpact'i: pipeline.ts `labels.outcome = meta.selfAssessment` (ham string) →
`mapTaskEvaluationToLabel` (src/core/trace-labels.ts) üzerinden 5-değerli RunOutcomeLabel'a çevir;
bilinmeyen/legacy değer → dürüst 'failed' değil, mapper'ın tip-yapısal sözleşmesine uy (disk-verify:
mapper unknown'u nasıl ele alıyor; almıyorsa pipeline-yanında dar bir normalize + test). Çıktı-şemasında
alan adı DEĞİŞMEZ (ShareGPT tüketicileri).
### goNogo
- goCriteria: 5 giriş-değeri → 5 doğru label (test); legacy/bilinmeyen giriş davranışı testli; mevcut
  pipeline testleri yeşil; `tsc` temiz.
- nogo: trace-labels.ts değişikliği; çıktı-şema alan-adı değişikliği.

## Task 10: DEP-REF-LOUD — çözülemeyen dependency-ref sessiz düşmesin (born-458)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/dep-ref-loud.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-458 (357 canlı-vakası): `- Dependencies: Task 1` uyarısız []'a düştü. Fix task-builder'da:
(1) `Task N` / `task N` insan-doğal formu DIRECTIVES'teki N'inci task'ın ID'sine resolve et;
(2) yine de çözülemeyen her ref için `[deckent] WARN: dependency ref '<ref>' çözülemedi (task <id>)`
stderr-uyarısı + plan-çıktısına işaret; (3) `dependency_ref_strict` config-alanı (default-off) —
açıkken çözülmeyen ref plan'ı BLOKLAR. Mevcut iki ref-stili (slot-id/title-prefix) davranışı değişmez.
### goNogo
- goCriteria: "Task 2" → 2. task'ın gerçek ID'sine bağlanır (test); çözülmeyen ref → WARN yakalanır
  (stderr-spy) + deps'e girmez; strict-flag açıkken throw; mevcut dependency-testleri yeşil; `tsc` temiz.
- nogo: default-strict; parser'ın mevcut geçerli-formlarını değiştirmek.

## Task 11: RETRO-DEBT-COUNT — retro sayaç-kaynağı düzelt (born-460)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-retro-writer.ts, tests/orchestra/retro-debt-count.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-460: kapanış "5 TECH_DEBT" derken `deckent retro` "Tech Debt: 0" + "17/17 (100%)" basıyor.
DISK-VERIFY: retro'nun tech-debt/no-go sayaçlarını hangi alandan okuduğunu bul (sprint-357 arşiviyle
reproduce: brainEvaluation alanları GO_WITH_TECH_DEBT iken sayaç 0) → sayacı Brain-nihai-verdikt
kaynağına (result.brainEvaluation ?? evaluation) çevir; success%'i de aynı kaynaktan tutarlı hesapla.
Retro-yazıcı dışında kök başka dosyadaysa (CLI retro-okuyucu) notes'a yaz + yazabildiğin kadarını yap.
### goNogo
- goCriteria: sprint-357-arşiv-şekilli fixture → retro sayaçları 12 DONE / 5 DEBT / 0 NO_GO (test);
  mevcut retro testleri yeşil; `tsc` temiz.
- nogo: evaluation-mantığı değişikliği; kapanış-satırı formatını bozmak.

## Task 12: REFDOCS-ADR-REGEX — docs:ref yeni ADR-taksonomisini tanısın (born-461)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: scripts/gen-reference-docs.mjs, tests/docs/refdocs-adr-regen.test.ts
- Scope: scripts/, tests/docs/, docs/adr/
- Dependencies: none
### Description
born-461 (357-015 keşfi): ADR_FILE_RE/ADR_HEADING_RE yalnız eski `^(\d+)-` adları tanıyor →
`npm run docs:ref` docs/adr/README.md'yi regen edemiyor. Regex'leri `adr-(g|d)-NNN-*` + başlık
formatına genişlet (eski-numeric arşiv-dizinini dışlama davranışı korunur); `--check` docs/adr'nin
41 dosyasını sayar; üretilen tablo 357-015'in el-yazdığı formatla diff-minimal (kanıt: regen → git diff
yalnız beklenen satırlar).
### goNogo
- goCriteria: `node scripts/gen-reference-docs.mjs --check` 41 ADR raporlar (test spawn'lı);
  regen-diff'i README'de içerik-eşdeğer (test fixture'la); `tsc` gerekmiyorsa lint-node geçer.
- nogo: README el-içeriğini bozan format değişikliği; docs/adr gövde değişikliği.

## Task 13: PKG-SSOT-CLOSE — kalan 13 hardcode-hint SSOT'a (Sıra-207 kapanışı)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/chat.ts, src/cli/commands/onboard.ts, src/cli/helpers/wizard.ts, src/core/provisioner.ts, src/core/errors.ts, src/providers/claude.ts, src/providers/codex.ts, src/providers/gemini.ts, tests/core/provider-packages.test.ts
- Scope: src/cli/, src/core/, src/providers/, tests/, docs/adr/
- Dependencies: none
### Description
357-016'nın envanterlediği 7-dosya/13-occurrence (+provisioner NPM_PKG ikinci-SSOT'u) —
provider-packages.ts SSOT'undan okur hale getir; provisioner.ts en yüksek-değer (doctor
getProviderInstallHint zincirini de düzeltir). Her çevrimde ratchet-baseline'ı DÜŞÜR
(tests/core/provider-packages.test.ts sayaçları — toBeLessThanOrEqual olduğundan düşürme güvenli;
hedef: bilinen-liste boşalır, src-geneli guard kalır). provider-packages.ts'e gerekirse dar export
ekle (YAGNI sınırında). **npm install ASLA.**
### goNogo
- goCriteria: grep-envanter sonrası src/'de SSOT-dışı provider-paket-literal = yalnız
  provider-packages.ts (ratchet-testi sıfır-baseline'la yeşil); dokunulan 8 dosyanın test-aileleri
  yeşil; `tsc` temiz.
- nogo: paket-adı değeri değişikliği; DISTINCT-FILE listesindekilere dokunmak.

## Task 14: CONFIG-ROUNDTRIP-GUARD — flag-drop sınıfına kalıcı mekanik kapan (born-464 guard)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, ci-testing
- Files: tests/core/config-flag-roundtrip.test.ts
- Scope: tests/core/, src/core/, docs/adr/
- Dependencies: none
### Description
born-464 dersini kalıcılaştır: test, GERÇEK loadConfig yoluyla (hermetik tmpdir-proje + yazılmış
config.json) opt-in blokların round-trip'ini kanıtlar — repl_surface/tool_surface/deck_broker/
training_trace/live_trace/worker_comms/cost_guard/gate/resource_monitor her biri: config.json'a yaz →
loadConfig → alan AYNEN döner. Ek mekanik kapan: config-types'taki ResolvedConfig opsiyonel-blok
alanlarını (kaynaktan regex/AST ile listele) loadConfig-çıktısının Object.keys kümesiyle karşılaştır —
tipte olup canlıda hiç dönemeyen alan = fail (gelecekte eklenen blok pass-through'suz kalamaz).
DECKENT_CONFIG_RELOAD=1 ile cache'i devre-dışı bırak; global-config leak'ine karşı HOME'u tmp'e izole et.
### goNogo
- goCriteria: 9+ blok round-trip yeşil; tip-vs-canlı alan-parite kapanı çalışır (kasıtlı-eksik fixture
  ile negatif-test); hermetik (gerçek ~/.deckent okunmaz); `tsc` temiz.
- nogo: src/core/config.ts değişikliği (yalnız test); flaky fs.watch bağımlılığı.

## Task 15: NATIVE-M5-GATE — native-agent parite kanıt-kapısı
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: tests/cli/native-parity-gate.test.ts
- Scope: tests/cli/, src/cli/, docs/adr/
- Dependencies: none
### Description
MASTER-PLAN Sıra-63 (TERM-NAT) kanıt-dilimi: legacy chat-loop ↔ native-engine davranış-parite matrisi
tek test-dosyasında — mock-adapter'la (DECKENT_NATIVE_MOCK deseni disk-verify) iki yol için: basit-turn
cevabı, tool-çağrısı→confirm→sonuç, çok-turn bağlam, iptal/hata-yolu, token-istatistiği. Amaç: M5
default-flip kararının dayanağı olan "hangi davranışlar birebir, hangileri bilinçli-farklı" tablosunu
TESTLE sabitlemek; farklar test-içi `KNOWN_DIVERGENCES` listesinde açık gerekçeli.
### goNogo
- goCriteria: ≥5 parite-vakası iki yolda da koşar; farklar KNOWN_DIVERGENCES'ta gerekçeli (boş olması
  şart değil — dürüstlük şart); test hermetik+deterministik; `tsc` temiz.
- nogo: src değişikliği (yalnız test + gerekirse test-helper); flaky-timing.

## Task 16: NATIVE-SUB-TRANSPORT-DESIGN — abonelik-transport tasarım dokümanı
- Model: sonnet
- Effort: normal
- Skills: doc-writing
- Files: docs/design/native-subscription-transport.md
- Scope: docs/design/
- Dependencies: none
### Description
"Sarmalayıcıdan çıkış"ın mimari kilidi: Anthropic aboneliği raw-API'ye kapalı → Claude'u abonelik-kotasıyla
sürmenin tek yolu CLI. Tasarım: native-engine'in agent-loop'u SAHİPLENİP claude-CLI'yı salt-transport
(dumb-pipe) olarak kullanma seçenekleri — (A) CLI'yı tek-turn text-gen modunda sürmek (tool-loop bizde;
CLI tool'ları kapalı), (B) CLI stream-json çıktısını adapter'da ProviderEvent'e çevirmek, (C) API-key
fallback hibrit. Her seçenek için: tool-use döngü sahipliği, maliyet/kota etkisi, kayıp-yetenekler
(cache, thinking), M5-cutover'a etkisi, öneri + karar-önerisi (ADR-taslak formatında "Önerilen Karar"
bölümü — ADR'yi Alperen onaylar, doküman öneri-seviyesinde kalır).
### goNogo
- goCriteria: 3 seçenek × 5 boyut karşılaştırma tablosu + net öneri + mevcut kod-referansları
  (native-transport.ts/native-agent-bridge.ts satır-refli, disk-verify'lı) mevcutta; dosya lint:link temiz.
- nogo: kod değişikliği; ADR-DB'ye kayıt (yalnız taslak-doküman).

## Task 17: CAT-TYPE-UNIFY — catalog-render tipini tool-catalog'a bağla (357-002 kalanı)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/cli/helpers/catalog-render.ts, tests/cli/catalog-render.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
357-002 dep-drop nedeniyle yapısal-tip tanımlamıştı; şimdi tool-catalog.ts gerçek — CatalogRenderEntry'yi
tool-catalog'un kanonik tipinden türet (yapısal-uyum kanıtıyla; render'ın kendi dar alan-alt-kümesi
kalabilir — YAGNI), trust-tier enum'unu tek kaynaktan import et. Davranış/çıktı byte-aynı.
### goNogo
- goCriteria: tip tool-catalog'dan; mevcut render-testleri byte-aynı yeşil; `tsc` temiz.
- nogo: render-çıktı değişikliği; tool-catalog.ts değişikliği.
