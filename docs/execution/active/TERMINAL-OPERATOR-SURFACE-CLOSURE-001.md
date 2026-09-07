# TERMINAL-OPERATOR-SURFACE-CLOSURE-001 — v2 dogfood yürütme

OUTCOME_ID: TERMINAL-OPERATOR-SURFACE-CLOSURE-001
DOGFOOD_MODE: ON
BASE_SHA: b68b11ddaa4fd2b23bef7a61ed253e5d0de86dfd
BRANCH: main
WORKSPACE_MODE: MAIN
PARENT_MASTER_ID: ECOSYSTEM-001
MASTER_ORDER: 7099
PREREQUISITE: 3331 (landed 2449b6e4f) → 3332 (landed 13d2c80ef) → 3333 (landed 68f3d6686; MASTER VERIFY). 3357 OPEN: run-level724 closure ürün/multiworker closure değildir; fresh admission ölçülür.
OWNER_DECISION_REF: owner-live-2026-09-04-terminal-audit-closure-v2
STATUS: IN_PROGRESS source-work; DOGFOOD_HEALTH=DEGRADED. 2026-09-06T23:10Z sonrası gerçek autonomous dry-plan PASS; exact micro-task proof admission ve çoklu-worker settlement hâlâ açık, yeni worker dispatch yok.

### Native `/mcp` ingress landing — 2026-09-07

Main `492809cd583ec5e29ddac4e01d595304c752b9c6`, exact10 committed blob
equality PASS. Native Ink yalnız `/mcp` ailesini session'ın tek canlı
`ReplMcpBridge` instance'ına bağlar; legacy loop çift-dispatch yapmaz. `call`
öncesi posture gate ve bridge'in mevcut read-only/confirm/audit sınıflandırması
korunur; explicit confirm enjekte edilir. Current refresh'te bağlı olmayan
cached server/tool çağrılamaz; stale catalogue canlı gösterilmez.

No-config, project-only disabled, all-failed, partial, connected-no-tools ve
unknown-operation durumları EN/TR ve secret-free ayrılır. Selected 88 test;
main 136 test, tsc, i18n ve build PASS. Fable main 88-test battery PASS.
Candidate ve main compiled loopback MCP SDK kanıtları EN/TR read/list,
key=value write-deny ve unknown dallarını provider turnsüz yürüttü. JSON args,
no-bridge, disabled ve stale-refresh dalları source testlerinde doğrulandı;
compiled harness onları yürüttü iddiası yoktur.

| Evidence | SHA256 |
|---|---|
| Selected patch | b5a121bf82f07cbcd908b0640c12cc5161859aab189bbe1b1dc4eae15ca09c36 |
| Root source freeze | e7d9a529db60e444fa5df610be2bcb4f7d2cd12a5c8540d399fc83e997b6d2e4 |
| Candidate compiled PASS | 2116267f45d232aba566877d59332171998bce2ad2a403ac994d66761651c10f |
| Main compiled PASS | 8deaa128cbbc8876658c7229b56f31d7257b57a4641beb25609e27a9938001bb |
| Final harness | f6c71ec4c8e051c40c7d0157eef32af778a563249c2bd4d77c890e3f95756a44 |
| Candidate build | 6746a126d569416ba6f82dc59e71e96e3e59203e68f20211d1c0b5617db3548e |
| Fable main 88 raw | 2eb2128bafe17a0b3c6fdc6c71c0a489eff769ec33fa6aae1915c79c0e304798 |
| Archive manifest | 423b49ec2f6e60f0fddcecd58c102cd536be347260aa4bc506b57cd04a184451 |
| Archive SHA256SUMS | 7a09cb50788dd0bb9363b1fd9f5934bc2d67b8baa851383e0dbbf6645ccf4c8f |

Kalıcı arşiv `/home/alperen/deckent-recovery-20260904/terminal-7099-l3-mcp-g5bxvA`:
52 payload + helper + manifest = 54 checks; `SHA256SUMS` ile 55 dosya. Üç
harness denemesi lexical grant, homedir ve confirm-selector varsayımlarıyla FAIL
olarak tutuldu; ilk PASS diye yazılmadı. Linux diagnostic loopback provider
usage/billing, receipt, platform, tüm L3 veya 7099 kapanışı değildir. Main dist
dirty source ve inherited 83+7 içerir; commit dışıdır. User-scope MCP homedir
relocatability RELATED_BUT_NONBLOCKING; yeni MASTER satırı açılmaz. L4 exact
bounded active-session visibility yazarı yetkilidir ve aktiftir; bu bir full
closure değildir. Kalan L1/L3 renderer/approval, L5/L6/platform OPEN; 7099 VERIFY.

### Active-turn cancellation proof — 2026-09-07T03:22Z

Test59c2c8a04: exact1blob PASS; main4suite17tests PASS. Production source unchanged.
Mounted App Ctrl+C → native bridge → session AbortController → production OpenAI
HTTP adapter → loopback SSE closes before server DONE; rejected late write never
enters any captured frame; fresh second turn succeeds. EN/TR first compiled run PASS.
Eleven causal binary pins identical before/after. No provider credentials/real
billing/task receipt/checkpoint or actual CLI/PTY/platform claim.
Root+independent Sol review corrected only test timer/barrier/cleanup weaknesses.

| Evidence | SHA256 |
|---|---|
| Final test | 8cce684271b398488e8b5a411a52da99d3cb7a014dc56db1442e16676c67e573 |
| Compiled result | 9f2e1d0323ab3c843d7c776c156efd141fe0c993954167c622ac9d145ae59954 |
| Harness | 61f02b998483a2a3f97ebe17e8e3c83dd1298599d01892eec742cb15e7cdacfb |
| Archive SUMS | 878ce6c91bd000eeecf8fbd1f31b6e16dba557301eedce45952e9a1f8147b58f |

Archive /home/alperen/deckent-recovery-20260904/terminal-7099-l2-cancel-fjAx7X:
8evidence payloads + archive helper + manifest =10checks PASS, originals preserved.
No source rebuild/restart/dispatch needed; bot976804 unchanged. Existing native
cancel seam proved, not rewritten. Next L3 missing native /mcp ingress uses the
already-connected bridge and existing config/posture/confirm authority.
MASTER7099 remains VERIFY.

### Native boot intent landing — 2026-09-07T03:16Z

Main cc7102991, exact6committed blob PASS; inherited run.tsx7footer labels excluded.
Explicit native_provider/native_model/env intent refuses before session resources
and health chrome when transport cannot start; typed nonzero exit. Absent-intent
no-transport and non-Ink compatibility paths visibly name the legacy host (EN/TR).
Native success defers legacy factory; unused teardown never constructs it.
saveDefault writes native_* only for native selection, chat_provider only for
legacy provider; unsupported legacy model default returns localized NO_WRITE.
chat_provider metadata deprecated; no key rename, blind host→API migration or
brain→native mapping. Global loader healing/idempotence remains unproved.

Selected306tests + corrected test-only7 PASS; Fable independent9suite108 raw PASS;
main11suite422 + tsc/i18n/build:all PASS. Writer bundle is agent-authored summaries/
abbreviated logs, not full raw stdout. Main inherited source participates in build.
Initial selected compiled FAIL is retained: backup-delta/child-vs-factory harness
assumptions and denied global tmp; corrected selected PASS, source unchanged.
Main first full attempt13cases PASS; seven binary pins identical before/after.
Root caught strict-date positive-fixture mismatch before main run; harness-only fix.
Compiled actual CLI EN/TR pipe/Ink refusal, legacy compatibility and native-mock
boot are distinct from direct runInk factory1/factory0 and deferred teardown seams.

| Evidence | SHA256 |
|---|---|
| Selected6 patch | 5c81f76deac571808be6be1f4c31ac95d32ddd5555a320a1aa987f6d72f39007 |
| Selected initial FAIL | 2adfaa51f4d26a783076f093985ac8d8b6aadfbdb23af5b464207326514b618e |
| Selected corrected PASS | a938636c07d601abdcc20e2e1b4f990b0b279a23aee7942108312cc6525d9cc6 |
| Main compiled PASS | 17acf821c1624c0f8285f985c67d998caf2276fa87124ffd19701b0d19a5a450 |
| Main frozen harness | 73d6a3516e6b410e8ee4f84be60a7ef09ff9e28a61e758faf3254c3a6bc01a1e |
| Fable raw108 test log | 0614133981c102069074e95fc2242ed6a11af8be543005448fe05ed739d2ae82 |
| Archive manifest | 3200c1dcc3ec534cfbd6f1dd592da04d21d0c45c5e13ceb2df4b0ba9cf7159c8 |
| Archive SHA256SUMS | 0ce17f840b3ba7ccd7e511c9aac95a0ecded0a08c71dfca6829776ced72919c1 |

Archive /home/alperen/deckent-recovery-20260904/terminal-7099-l1-native-boot-lmCNbm:
60payload + manifest (61 checks); no fixture/config/DB/credential copies.
Parent Node filesystem restriction is not an OS sandbox; private diagnostic
provider shims are used. Global MCP deny/fail-soft is not nominal global-MCP proof.
Same-byte exact timestamped config backups are enumerated, not hidden; no zero-write
claim. Native success uses diagnostic mock: no real provider usage/task settlement.
Bot stop892444 → guardALLOW → build03:02–03:03Z → start/status976804.
MCP reconnect unverified. No fresh worker dispatch or retained728 cleanup.
Bounded Linux boot defect closed; L2 active cancel proof and remaining L1–L6/
platform/multiworker closure remain OPEN; MASTER7099 stays VERIFY.

### Live-footer clip/reflow landing — 2026-09-07T02:22Z

Main366637d1898a03fe0b7d6be2189553814fb77828, exact9committed blob PASS.
Helper required clip callback alır; App tek canonical clipTerminalCells enjekte
eder. Local truncate binding inherited runStatus dahil tüm branch'leri kapsar.
Run ASCII capability bir kez çözer; gerçek Ink columns/marker effect dependency.
Yeni helpers→REPL crossing, primitives taşıması veya cursor API değişikliği yok.
Selected8suite211/main8suite213 PASS (+2 inherited runStatus test); tsc/build PASS.
Main ilk koşu5FAIL ve yanlış cursor-test yolu ayrı tutuldu; v3 yalnız term-compat
fixture'ını canonical EN label caller'a geçirdi, production byte/build değişmedi.

| Kanıt | SHA256 |
|---|---|
| Final9 patch | 4937da5ea2296b00b0dca05b19e4d1dd4796ac51e38b3a6fda2dedb0db748772 |
| V2 build manifest | abbde8ab9de832f0611a14c176a9ad640b6766e29f72d81b302bb5df3c98746c |
| V3 fixture manifest | c1a862893e4c6a67f7c2da4e7765ebff9a8071e768c31f8f91d3ede93e7d71d9 |
| Main compiled | 1fd124bced10413da772ad483ce26a5338d72a9ff707c3c0cf4ecca8a314c42f |
| Selected compiled | 96f4b9374357e8a502497b69776284d03d1f3c0e0d53c3e373f0cfc64ee88765 |
| Frozen harness | 4457e89258438734bcf9c3ae13678e9b09db26049bc90c9580d6490da3f544ae |
| Archive SHA256SUMS | 4f33ea03c7a417bf7a944c8c76fb66849b5fc51d1e53046e0b7e6519bb21609f |

Arşiv /home/alperen/deckent-recovery-20260904/terminal-7099-l6-live-footer-RYyh0h,
32payload/check PASS; originals korunur; DB/config/credential yok. İlk main
failure tool-output truncated'tır, full standalone log iddiası yok.
İki compiled proof tek denemede PASS: actual CLI EN/TR idle resize; aynı mounted
App32→12→32 full→ASCII/Unicode clipped→full restore, approval olmadan ve saniyelik
timer öncesi; direct footer/OSC helper. Idle CLI overflow kanıtı diye sunulmaz.
Fable587 independent9blob/main213/20bundle pin PASS; canonical XVerify receipt değil.
Stop847750 → ALLOW → build02:17:33Z → bot892444; main inherited source dahil.
Salt commit restart yok. Clip/reflow seam kapalı; diğer L1-L6/platform/whole7099
OPEN/VERIFY. Next L1 provider/fallback/migration semantic review; yeni key kabul
edilmedi, brain→native veya host CLI→API otomatik dönüşümü yok.


### Dual-stream bounded landing — 2026-09-07T02:08Z

Main d25c970788aa5c2b31d7d517783a3a5adfdd373f; exact7blob equality PASS.
Caller-owned ASCII/Unicode marker, display-cell/grapheme clipping ve OSC8 BEL/ST
close-before-marker/SGR-reset sırası; statusmin1/approval priority korunur.
Selected ve main4suite125/125 + tsc + build:all PASS; lint i18n50file/hits0,
layer9 inherited. Frozen v2 120test; ilk-v3 CJK fixture failure korunur,
düzeltilmiş v3 125test. Production source v2→v3 değişmedi.

| Kanıt | SHA256 |
|---|---|
| Exact7 patch | edface3290876d35cbac2f66b28d444d6233e1e90857eb0e8fdda07c46a08932 |
| Selected manifest | 420a469029e8bb420174cec09969cda9e4805eaa7de1ecde3b42bc8290ff5ed2 |
| Main compiled proof | 45c9c64909dc0c3c7bf70fe3f71b064fb1a48ad1cafac76a9bc89777ef6649e1 |
| Frozen main harness | 6dba512a16c860e22c32f3838930d89c750a8b207f03dc62c538abe26e721250 |
| Selected run3 supplemental | 77d45faa7c689e3f772c9e942cfd0a80d8307e98c602dfa7f9e811bc658ac8fd |
| Archive SHA256SUMS | cc0030a93134ccf9d03d30c426c635681986c9cd26c4b9ac69eccdadae1909c8 |

Arşiv /home/alperen/deckent-recovery-20260904/terminal-7099-l6-dual-stream-KC6d7l:
40payload/hash check PASS; original dosyalar tutuldu, DB/config/credential yok.
Üç selected compiled aggregate FAIL aynen durur: fixture dil/dependency, Ink
stdout width ve wrapped-card assertion kusurları. Run3 ham kart/overflow gözlemi
digest-bound offline adjudication ile doğrulandı; originalAggregate=false.
Düzeltilmiş assertion ile main ilk run PASS; bağımsız Fable575 bundle18/18 doğruladı.
Gerçek CLI EN/TR+ASCII PTY yalnız coexistence/resize; compiled ReplApp mount
long-CJK overflow; direct helper OSC8 bytes. Sınıflar birbirinin yerine geçmez.
No provider turn/approval decision/task receipt/platform veya bütün7099 closure.
Canonical stop804423 → ALLOW → build01:59:30Z → bot847750; main dirty-tree binary.
Salt commit için restart yok; MCP reconnect kanıtlanmadı. Push TOOL_POLICY_HOLD.
Inherited run7footer satırı seçilmedi. Upstream live-footer UTF16/ellipsis/reflow
aynı L6 içinde dependency-bound OPEN; sonraki isolated kaynak dilimi bunu ele alır.


### Recursive i18n ve renderer landing — 2026-09-07T01:45Z

Main commit 9f9fa32395200b9b43e82ebdb0f346542558aaa2; exact9file staged/committed
blob equality PASS, inherited messages75satır/run7footer satırı seçilmedi.
REPL .ts/.tsx direct UI sink AST taraması, deterministik JSON, ANSI-normalized
technical/prose ayrımı mevcut lint:i18n/lint:gates girişinde bağlı; allowlist ve
surface ceiling370 büyümedi. Bu heuristic/syntactic sink kanıtı, tüm veri akışında
literal yokluğu veya generic symlink-cycle/platform kanıtı değildir.
Dört sink kataloglandı: completion, background summary, demo summary/reason,
dev Ink probe. Controller missing/empty completion label mevcut typed guard ile
coordinator mutation öncesi durur; raw failure korunur. Verdict kodları değişmedi.

Main exact8suite81/81 + tsc PASS; selected ilk7suite61/61 farklı CLI surface testini
içeriyordu, eksik exact scripts/lint-cli-surface suite20/20 ayrıca PASS.
İlk kayıt korunur; manifest-v2 coverageCorrection taşır. Yeni scanner main/selected
50file/hits0 PASS; mevcut lint-stale-adr real-repo-clean assertion değiştirilmedi.
Selected build ilk denemede dashboard toolchain eksikliğiyle FAIL; dependency
fixture bağlantısı sonrası ikinci deneme PASS, source aynı. Main build:all PASS.

| Kanıt | SHA256 |
|---|---|
| Assembled9file patch | b7569c89df286d3c1c37402885fab3bfa9ad14391648795903aa08144d57f27b |
| Selected manifest-v2 | fa25a3c073fab93f70a5692256a235574fc93a88d83649eaa81f7c518e3aab6b |
| Compiled harness | bf6531c3ec6ad777bf9294be738c58c32c666344e0f442ace8c80d7959348643 |
| Selected result | ccee0087220da8acbafaccadf87b799a983d7759663cfa1bedfef2ff0feb1771 |
| Main result | 99a7a44e0640f5311ee6a1ad23df86c456387242a432ebcb1137617c89cf699c |
| Kalıcı arşiv SHA256SUMS | d217c39c724be5ad7a32dd65c11f284fe8633e6470fa510e4be4f0cd9b2c403b |

Arşiv /home/alperen/deckent-recovery-20260904/terminal-7099-l6-i18n-tkEW0e;
32payload check PASS; gerçek selected logs/patch/manifest, iki compiled proof ve
transcript, harness, root tool-output içerir. Root build output son chunk'tır,
tam standalone stdout log değildir. DB/config/credential kopyalanmadı.
EN/TR gerçek CLI demo card → details → Esc collapse; formatter isolated child
ids/counts/verdict/rawerror korur; devprobe natural exit. Tüm fixture child exit0,
altı bundle before/after sabit. Approval kararı/provider turn/task receipt yok;
devprobe production consumer iddiası değildir. Fable564 bağımsız digest/blob/proof
incelemesi PASS; canonical XVerify receipt veya bütün7099 closure yerine geçmez.

Canonical main stop736773 → execution ALLOW → build:all01:38:47Z PASS →
bot804423. Main binary dirty-tree (inherited kaynak dahil), selected binary ayrı.
MCP reconnect/platform/multiworker settlement OPEN; retained state temizlenmedi.
Push TOOL_POLICY_HOLD sürer; son source HEAD ahead9/behind0, remote CI tetiklenmedi.
7099 VERIFY korunur. All-repl string-free test genişlemesi glyph-only dual-stream
default'una takıldı; untranslated prose değil. Aynı L6 içinde caller-owned
ASCII/Unicode marker + grapheme/display-cell width ile dependency-bound devam;
renaming/allowlist ile test geçirme yok. C kuyruğuna veya başka outcome'a geçilmedi.


### L1/L5 ve L6 bounded landing — 2026-09-07T01:20Z

| Grup | Main commit | Exact scope / selected verification |
|---|---|---|
| E | ef1a7607b0d3f10ff25402b958e4c846a273cbfc | 12 dosya; HTTP AbortController/UNKNOWN/pending containment + durable checkpoint/JSON fence/typed-private errors; 81/81 tests + tsc + build:all PASS |
| F | a4fb4784730a4c4a218641ffce4c8d8b2a14beb8 | 6 dosya; picker Ctrl+C ownership/global fallback + approval Esc details collapse; combined E+F 141/141 + tsc + build:all PASS |
| G | c19141e5116139cb6f90c0f116b9d4d362686897 | 2 dosya; non-TTY --version/-V tek satır, TTY splash korunur; 17/17 + tsc + build:all PASS |

Her stage/commit öncesi branch-vv ve selected blob eşitliği12/6/2 PASS.
Inherited source/3357 değişiklikleri bu gruplara alınmadı. Fable bağımsız
committed blob/proof incelemesi PASS; kanal review canonical XVerify receipt değildir.
Selected candidate Git base d10456e99 üzerine E12 → E+F18 → E+F+G20 dosya uygulandı;
candidate HEAD adı assembled içerik yerine geçmez. İlk missing-dependency FAIL
denemeleri arşivde korunur; fixture bağımlılığı düzeltildikten sonraki PASS
geçmiş denemeleri yeniden sınıflandırmaz. Gerçek stdout/exit logları saklandı.

| Kanıt | Main result SHA256 | Selected result SHA256 |
|---|---|---|
| L1 compiled loopback HTTP | a008150f950cf16701027a64bbf2d3c772ccc4465c395fc8bd0864e9a18a7563 | dd93bf6e46b265b26a5d44566f7c551aec433024a695c6696f29e82db0405045 |
| L5 compiled registered caller | db8bcc8a6e8b08ae1f14643ceca637b47037fcb41957ff16b72c0eb8f0c44346 | 86d9f7fc9f4bad1668f01e34d89f30ed79efaf554ed5bf23da91c88844896465 |
| L6 keyboard actual CLI/PTY | 1733f3a10642d41b4feba3104c1dcf173e300c703f8074fd237bad134cfcbe6a | 0f38a7f9cf14043e2f0a68792e9ad5ef1fe866a56f7f4eafd221b0b48c000668 |
| L6 version actual CLI matrix | 3e93f866417f71f82bca59af9b31e8efad0eb6858a330a13f9740bb34f5e5e72 | 82ba768c6b719f84d7040a5bcb5b7fc9962fa463bb06c6f5f876d7eb33b6bcff |

L1: gerçek HTTP hang → timeout/abort → pending clear → healthy refresh;
CLI/PTY/provider-turn kanıtı değildir. L5: withContextSlashes → engine → session →
store; gerçek scratch close/reaper deletion, durable restart, tam dış Markdown
JSON fence, typed private failure ve tamper ayrımı. Diagnostic provider;
billing receipt değildir. L6 keyboard: EN/TR picker Ctrl+C yalnız picker'ı
kapatır, sonraki idle Ctrl+C normal policy'yi kurar. Approval Esc yalnız
mounted-component proof kapsamındadır, request dismissal/PTY kanıtı değildir.
Version: 6 non-TTY flag/color case + gerçek TTY, tek satır88B/JSON125B,
exit0/stderr0; metadata subprocess olabilir, provider turn değildir.

| Selected scope | Patch SHA256 | Evidence manifest SHA256 |
|---|---|---|
| E12 | c32946ebd74ad1c33a051804323c46f8433a4b4286ce51b68f48a5fb0aaf40b3 | e8c2b99a1686a2ee3f3c74731d1057b0fa3df9b3030765451a76fe5f4f7f2f4a |
| F-only6 | fb19006c948e1b66b255c3380c586dd9921871aa73d9cd1d951fbca9ff924cd2 | 3ba70f6d339569c8ab797ca210375c3e6d777e0245cccb6cae2cf313c57405b0 |
| G-only2 | 78f218affc2c5a89fadc70cb99d9f18915ec05c2fc941d8f9606d2ddcac7d715 | 6c58f0690032e4dba7352e9afd253584da019a7a2978bb557ef68043d87c424d |

Kalıcı arşiv kökü /home/alperen/deckent-recovery-20260904.
Asıllar silinmedi; DB/config/credential kopyalanmadı. Her arşiv harness,
main/selected result ve selected-verification log/patch/manifest içerir.

| Arşiv dizini | Payload check | SHA256SUMS SHA256 |
|---|---|---|
| terminal-7099-l1-l5-mugpXg | 22/22 PASS | 7b1ea9d2b84109c83f2dca46f1805b6e3bd38124631102ff288a1e91171915d1 |
| terminal-7099-l6-keyboard-LOaeWw | 18/18 PASS | 207f528d0296dd7b3019a2034b81efb9b81406bf5e8ecf17bf41a913d3e2478c |
| terminal-7099-l6-version-0me3eb | 30/30 PASS | 98530d5f074677d2d22f7773dadcf2438bbb438d2590fa664b827b41b0e597ca |

Son main runtime: canonical stop721261 → active-execution ALLOW → build:all
PASS (01:05:50Z) → bot736773, Fable01:07Z canlı PID doğrulaması. Dist bu commit
içerikleri + inherited dirty source'tan üretildi; pristine HEAD build değildir.
Sırf commit için restart yok. MCP reconnect bağımsız kanıtlanmadı.
Retained728/task/lock/DB temizlenmedi; bu dilimde yeni sprint/worker dispatch yok.
Push TOOL_POLICY_HOLD: owner yetkisi mevcut; önceki deneme process başlamadan
approval-policy/never çelişkisiyle reddedildi. Bypass/unchanged retry yok.
Son source HEAD ahead7/behind0, REMOTE_CI_NOT_TRIGGERED; repo-green iddiası yok.

7099 VERIFY korunur. Açık: L1 readiness/identity + semantik chat_provider migrasyonu;
L2 active-provider cancellation; L3 renderer/MCP/approval; L4 reactive state/resume;
L5 explicit compact accounting; L6 recursive i18n/verdict/ASCII/reduced-motion/
resize/debug-redaction ve platform proof. Gerçek consumption silinmez; başarılı
checkpoint attribution customer billing değildir. Version TTY output_splash
tercihi/exit-flush riski inherited RELATED_BUT_NONBLOCKING; bu patch kapsamı değildir.
L6 scanner+fixture dependency-bound foundation uygulanıyor; eski ~54 sayısı
yeniden ölçüm değildir. Allowlist/baseline büyütülmez, failing gate tek başına
main'e alınmaz; renderer hit'leri ayrı writer scope'larında aynı L6 DAG'ına bağlıdır.


### Bounded kod landing — 2026-09-07T00:22Z

Kalıcı v4 patch/manifest ve selected-C PTY arşivi:
/home/alperen/deckent-recovery-20260904/terminal-7099-landing-FTpolW;
SHA256SUMS d3bc90e9399449463507e26d5652b3f88518ce3288ecff9da8aa043c5571c637.
Original/copy15/15 eşit. Build/test stdout ayrıca dosyaya capture edilmedi;
kanıt sınırı gerçek tool execution sonuçları ve doğrulama manifestidir.

Main commit zinciri: 807c18472996095937bad89c873f3a2ab40ac98d (S1/S3),
1b1e0f3cc80261640e443620145d0509830af8ca (W1/W2/W3/L2),
64fd217a3d37e8d8a9cab1ce5736adde34bd2b42 (S2 trusted profiles).
Üç cumulative selected ağaçta npm run build PASS; hedefli testler32/284/342 PASS.
Her stage öncesi branch-vv, exact staged path ve byte-equality13/24/6 PASS;
final42committedblob /tmp/deckent-7099-v4-source-files.tsv ile eşit, manifest
SHA256 e2872ccdd7d934404709ea3fca1b25ef52148950baea4c79d5c577efcf85f203.
V4 doğrulama /tmp/deckent-7099-v4-verification.json SHA256
64edb878569453bcdab67037d88cbe921f13f92e6119fc6350248f4229b37c44.
Layer9 FAIL_INHERITED_EXACT: main ve selectedC logları byte-eşit; atom472 açık.
Fable516 bağımsız blob/hunk seçimi PASS; inherited bleed0. Bu formal XVerify
settlement değildir. Push ve docs grubu bu ölçümde henüz yok.

Selected C actual compiled PTY /tmp/deckent-7099-l2-pty-EsSmy7/result.json,
SHA256 8a1dc5a346f30efbddbbb96f1e9b13c97b487d9c7e6618b762b6ef3627dcbf0a:
üç caseexit0, EN/TR lifecycle ve fallback PASS, sekiz compiled hash sabit.
Selected run.js6ea331912df31236bd46a01b98e6bb271d4efb25bced9daf3a8a40d785ae064a;
main'in inherited footer hunk'ları olmadan da proof geçti. Aktif provider-turn
cancellation veya provider telemetry kanıtı değildir. Önceki failure kayıtları
korunur; v3 seçim HOLD, v4 exact eksikleri kapatır. Tüm7099 hâlâ açık.

L5 yorum notu: MASTER "başarısız sıkıştırmada fatura yok", capsule "usage yazılmaz"
ifadeleri aynı muhasebe nesnesini tanımlamıyor. Gerçek provider-reported tüketim
ve varsa gerçek invoice silinmez; başarısız compaction'a başarılı-checkpoint
attribution verilmez. Customer-charge eligibility ayrı kanıt/authority konusu;
bu kaynak diliminde yeni ledger/charge flag veya usage suppression uygulanmaz.
Confirmed L5 slice yalnız operational degraded+reason, Markdown code-fence JSON
parse ve canonical checkpoint path'tir; storage fencing/CAS/quarantine değildir.
Accounting acceptance bu açık yorumdan DONE sayılamaz. L5 ayrı worktree'de,
main tek writer ve freeze korunur; provider/model/config policy değiştirilmez.

### Güncel main fan-in ve gerçek terminal kanıtı — 2026-09-07T00:12Z

S2 üç exact source-runtime profile ve L2 slash/prompt/capability zinciri main'e
alındı. L2 scope review düzeltmeleri chat-mode.ts ve input-bar.tsx dosyalarını
da kapsar: steer argümanlı control önceliği, pending query'nin normal gateAction
yolundan geçmesi, mounted registry help ve discovery filtreleri. Eski aşağıdaki
"main'e alınmadı" notları tarihsel ölçümdür. Main index korunur, commit henüz yok.
Root8suite222/222 + tsc PASS; ilk221/222 stale exact-profile-list assertion hatası
listeyi üç yeni identity ile genişleterek giderildi, assertion gevşetilmedi.
Fable506 bağımsız16suite342/342 + tsc PASS; layer gate9 inherited, atom472 açık.

Canonical stop489958 → execution ALLOW → build:all exit0 → start601932.
Compiled app SHA256 c526736cfbff36af0301e9a44dd894b2cd25685d2b8c7c6e7fcc16be03855451.
Main dirty-tree build, selected commit-tree build değil; long-lived MCP reconnect
bu kanıtın kapsamında değildir. Retained728 task/lock/DB state temizlenmedi.

L2 actual compiled PTY: /tmp/deckent-7099-l2-pty-WFgPOO/result.json,
SHA256 6f56ae43138ba9aa295a94a8ae7e1b995dd6c8ab58c4b378b67479229b7d8e0b.
Üç case exit0/signal0, sekiz compiled hash before=after. EN/TR recall prompt,
next-line query→gerçek typed no-match, cancel/clear/idle interrupt/queue/steer,
Esc/Ctrl-C ve help discovery/fallback ölçüldü. Active provider cancellation ve
cross-provider receipt kanıtı değildir; provider-delivery negatif kontrolü
yalnız ekran metnine dayanır. İki önceki harness expectation FAIL kaydı korunur.

S2 current-main source-runtime: hJW9ve native boot-health SHA256
ee6505f415e780854dcf85b0cef2d2909b5ecd0ca5a966b4053279ae31c663da;
Lyl9we repl partial-default/explicit-off SHA256
4856f3b5a18a548d69662e06155b17636ca6890733a13b102b7dacb917f7a3bb;
jjGKlk native auth EN/TR SHA256
49a3c49300e62e860162b9b63ebee6ab42e139c16190158c3d306a592e9d4232.
Her biri /tmp/deckent-7099-main-source-proof-<suffix>/terminal-health-config-source-runtime.json;
üç adapter observed/exit0. Root içerikleri okudu. Source proof compiled closure
değildir; gerçek task admission/settlement ve platform kapanışı hâlâ açık.

Seçili landing manifest /tmp/deckent-7099-landing-selection.json SHA256
30667f049591f219bc180fb5d789ff7b433379898430bbb82518d4d2b7f5853c.
S1+S3, W1/W2/W3+L2, ardından S2 bounded grupları ayrı seçili ağaçta doğrulanır;
inherited planner/messages/run/footer/memory-proof değişiklikleri topluca alınmaz.
Bu ara-artifact kanıtı7099 DONE veya authenticated settlement değildir.

L2 final/failure transcriptleri ve üç S2 raw JSON kayıpsız durable arşiv:
/home/alperen/deckent-recovery-20260904/terminal-7099-l2-pHzvt8.
SHA256SUMS b6d8a40a1d260111c8a60e03b5e2d2d051aa39bd10d44d2479dad96214a0d92b;
root16/16 payload check PASS. Kaynak fixture config/DB veya credential kopyalanmadı.
Fable508 bağımsız L2 PTY+S2 3/3 gözlemlerini doğruladı. Landing manifest v1/v3
W3 health.auth ve iki test, ayrıca registry accessor/five-identity assertion
eksikliği nedeniyle HOLD; düzeltilmiş seçim olmadan commit yok. İlk selected295
test PASS bu eksiklikleri kapatmaz. Memory profile base48bdd4cd2'de zaten var;
worker'ın aksi dependency beyanı root git-show ile düzeltilmiştir.

### Fan-in ve gerçek binary ilerlemesi — 2026-09-06T23:15Z

S1 v4 async stdin/streaming containment, S3 core catalog + explicit/ambient locale
parity, W1 native resolution→health callback, W2 field defaults, W3 auth wording
main'e selective patch ile alındı; inherited3357 source hunk'ları ve index korunur.
Root9dosya/134test + tsc PASS; Fable9dosya/122test PASS. Layer13→9: dört yeni
memory crossing kalktı, dokuz inherited atom472'de açık. Bu repo-green değildir.
S1 freeze /tmp/7099-s1-verification-v4.json; overflow→EPIPE/late-error ve timeout
SIGTERM→SIGKILL sahipliği regression ile pinli. S3 explicit language strict tr/else-en,
ambient yalnız eski MCP getLanguage sınırlarında; API/worker host env ile ezilmez.

Bot canonical stop172833 ardından active-execution ALLOW; build:all exit0 ve bot
start489958. Native/CLI/assets/dashboard yeniden üretildi; sourceTree4074810e…,
compiled entry16ecdeb491e36bdacd091390ee581f37da8f45fa53fe357488cabcd51c9491cb.
Bu main dirty-tree build'idir, henüz selected-commit build kanıtı değildir.
Root gerçek CLI autonomous plan --dry-run --max-items3 exit0 ile üç bounded7099
proof item üretti; backlog yazılmadı. Provider process prompt'u tüketip plan döndürdü;
usage/durable invocation receipt ayrıca pinlenmedi. Tek plan çoklu-worker closure değil.

Supportive actual compiled proof: /tmp/deckent-7099-compiled-support-F0abqn/result.json
SHA28e8a32765769e452e10bb6209b917abf7274651e791651b8d36a1b1742a1157; dört
PTY exit0 + compiled loadConfig/mergeConfigs matrisi, dokuz check PASS. Native EN/TR
ollama normalized model/auth unknown, kimlik doğrulama etiketi, missing-key native
failure sonrası gerçek legacy fallback ve repl_surface default-on/explicit-off
görünümü gözlendi. İki önceki invalid-config FAIL denemesi ayrı temp artifacts olarak
korundu; son PASS onları yeniden sınıflandırmaz. Provider turn/network yok; product
author supportive proof, independent XVerify değildir. S2 trusted profiles ayrı
verifier scope'unda, S3 compiled API/MCP proof ve final landing henüz açık.

### Pinli runtime kanıtları — 2026-09-06T23:29Z

S1 actual compiled CLI capture /tmp/deckent-7099-autonomous-capture-Js85IQ/result.json
SHA5bba3d1c070433a0027b7f5a3f7adabb98cc198c056abbf94c70717a0ec5a2f5;
20.392s/exit0/stdout948B üçitem/stderr0B, binary before=after16ecdeb4…,
config codex/gpt-6-astra. Fable493 independent digest/contents PASS. VcmwPV sandbox
capture exit1/boşstream FAIL kaydı korunur. Provider usage/receipt iddiası yok.
S3 actual loopback HTTP compiledhandler + MCP registered-handler proof:
/tmp/7099-s3-compiled-memory-proof-v2.json
SHAf377023a4f41fb97d41540f920813ee8f5c49afb0b6d52084df39eebc22818d2;
API explicitlocale oppositeambient altında doğru; missing DB HOLD/QUERY_FAILED,
disposable canonical SQLite MCP fixture AVAILABLE. MCP stdio transport proof'u
değildir; fixture temizlendi, gerçek memory.db erişimi/mutation yok.

L2 consumer expansion: health worktree tek yazarı app.tsx/chat-native.ts prompt
handling, detached-start.ts dil seçeneği, run.tsx dispatcher language+capability
registry wiring, mevcut cli-terminal-slash catalog ve focusedtests yazar.157test
+tsc PASS beyanı; henüz main fan-in/compiled proof değil. W1/W2 preimage ayrı tutulur.
S2 draft eski dist ile yeni candidate source'u doğrulama riski nedeniyle main'e
ALINMADI. Mevcut TSX source-runtime seam'i ile actual entry/PTY gözlemi seçildi;
compiled kabulü olan task source evidence ile sahte tamamlanamaz, ürün compiled
closure postterminal build+binary gerektirir. Docker256MB/64MBtmp feasibility
açık, limit/authority sessiz genişletilmez. Final bounded landing henüz açık.

### Canlı owner amendment — 2026-09-06T22:50Z

Son owner talimatı kabul edilmiş sırayı elle, süreç elverişliyse dogfood ile
yürütmeye izin verir. Bu source-work iznidir; mode'u OFF yapmaz, sentetik
sprint/receipt/DONE oluşturmaz. Eski host goal owner tarafından iptal edildi;
yeni tam sıra ile ACTIVE host goal oluşturuldu, MissionStore goal değildir.
S1 async/stdin + aktif streaming output containment; S2 exact micro-task proof
coverage; S3 memory-read layer regressions bu dalgada onaylıdır. S1 ilk snapshot
ara kanıttır; post-collect limit eski aktif containment'ı korumadığından planner.ts
transport seam'i + targeted tests + CLI localized errors scope'a dahil edildi.
S3 scope: memory-read catalog core'a taşınır, CLI re-export/import ve dört consumer
bağlanır; gate baseline/whitelist değişmez. W1 scope: health helper/tests yanında
entry.ts/run.tsx native selection → health composition; yeni resolver yazılmaz.
Worktree'ler /tmp/deckent-7099-ingress-MLb6X7, /tmp/deckent-7099-layer-GzN0BT,
/tmp/deckent-7099-health-wfRMDk; base48bdd4cd2. Root tek main writer. Aşağıdaki
eski admission-bekliyor notları tarihsel ölçümdür; canlı izin onları supersede eder.

## S1/S2 gerçek ingress kanıtı ve bounded recovery sınırı

2026-09-06 UTC, BASE_SHA b68b11dda üzerinde ilk denemeler; sonraki yalnız belge
cleanup commit48bdd4cd2 source/runtime değiştirmedi. CLI çıktısı doğrudan gözlendi;
invocation SQLite içindeki tam durable receipt/usage bu incelemede ayrıca pinlenmedi.

- Sandbox do: flow93bd521f-e55a-4e28-99c5-a6403887b37c,
  TASK_ATTEMPT_CUSTODY_HOLD:UNSUPPORTED_FILESYSTEM, exit1, external planning öncesi.
- İzinli host do: yaklaşık307s sonrası validation_failed,
  tasks.0.productionWiringProposal:required; diagnostic receipt
  inv-4774c6f8598dbf8829c35a22a2d8f766:schema-retry-2; exit1.
  Scope allowlist aşağıdaki W1/W2/W3 sekiz exact dosyadır; force-scope/run/yes yok.
- Autonomous: aynı bounded intent ile autonomous plan --dry-run --max-items3;
  exit1, planner exited status=1 (codex): Reading prompt from stdin...
  No prompt provided via stdin. Dry-run plan kuyruğunu persist etmedi;
  provider process giriş hatasıdır, worker execution veya model completion kanıtı değil.
- start/autonomous start çalıştırılmadı: accepted exact plan yok; eski pending
  mission veya728 task yeniden dispatch edilmedi. Source/build/auth değişikliği yok.

S1 kök neden: src/cli/commands/autonomous.ts realPlannerComplete, provider adapter
ve buildPlannerSpawnArgs tarafından üretilen stdin alanını spawnSync inputuna
iletmiyor. Canonical codex provider-command-spec promptFeed=stdin doğru.
Exact onarım adayı autonomous.ts + focused CLI transport regression testidir;
src/orchestra/planner.ts mevcut createPlannerSpawn async seam yeniden kullanılır.
Yeni provider/transport motoru veya yalnız blocking spawnSync input bandajı yok.

S2 kök neden: planner prompt registry-derived proof kurallarını zaten taşıyor;
host proof registry yalnız full native-provider ve memory-export identity tuple
kapsamlarını kabul ediyor. W1/W2/W3 ayrı üretim topolojilerinin exact profili yok.
Üretim kodunu test/docs diye sınıflamak, closest profile kopyalamak, requirement
kaldırmak veya worker'a verifier asset yazdırmak yasaktır. Existing terminal observer
resolveNativeProvider + injected endpoint probe yapar; gerçek entry/health rendering
kapsamını bununla doğrulanmış sayamayız. Micro-task proof authoring/profile coverage
bounded recovery tasarımı gerekir; yeni schema/authority scope kendi exact admission
kapısından geçmeden uygulanmaz. S3 layer crossing bu transport/proof onarımına otomatik
eklenmez. Dar S1 transport onarımı source/tests scope'udur; S2 trusted-proof assets
authority'si ayrı açık sınırdır. Her iki hata mevcut7099 alt işidir, yeni MASTER işi değil.

Recovery verification: stdin-only uzun prompt async canonical child process'e eksiksiz
ulaşır; nonzero/timeout typed kalır; autonomous gerçek provider planı üretir; W1/W2/W3
do planında her task için semantik exact producer→consumer→entry/config proof var;
verifier/prod writer ayrımı korunur. Sonra exact start/attempt/effect/result/settlement
ve bağımlı task propagation gerçek kanıtı gerekir. Bunlar yapılmadan DONE yok.

## Güncel dalga ve yüzey-alt-işleri — 2026-09-06T21:14Z

Owner son talimatı 7099'u ACTIVE çalışma odağı olarak seçer; MASTER VERIFY historical
truth'u plan yapmakla değişmez. Mevcut provider transport, palette, native selection,
picker ve i18n foundation'ları tekrar uygulanmaz. Terminal için design-dna,
terminal-design ve agentic-ux contractı: tek Causal Workline/contextual Ledger,
tek input owner, gerçek state/freshness/authority/evidence ayrımı; yeni görsel yön yok.

İlk planlama dalgası tek-sorumluluk ve disjoint write scope taşır:

| Task | Sonuç | Exact write scope | Dependency |
|---|---|---|---|
| W1 health identity | Mevcut native selection authority'sini tüketen health provider/model; aynı id/apiId tekrarı yok; unknown erişilebilir diye sunulmaz | src/cli/helpers/health-snapshot.ts; tests/cli/health-snapshot.test.ts; tests/cli/health-snapshot-live-provider.test.ts | none |
| W2 field defaults | Partial repl_surface blokları enabled/approvals default'unu kaybetmez; explicit false ve iki config resolver parity korunur | src/core/config.ts; tests/core/config-defaults.test.ts; tests/core/config-flag-roundtrip.test.ts | none |
| W3 auth wording | health.auth TR oturum değil kimlik doğrulama anlamını taşır; canonical en/tr catalog ve test parity | src/cli/helpers/messages.ts; tests/cli/messages-pending-keys.test.ts | none |

Read scope: bu exact sources/tests ile src/cli/repl/native-transport.ts,
src/cli/repl/provider-evidence.ts, src/core/native-provider-names.ts,
src/core/provider-auth-probe.ts, src/core/config-types.ts, src/core/model-registry.ts,
src/cli/entry.ts, src/cli/repl/run.tsx, package.json, tsconfig.json ve registered
host-proof assets. app.tsx/run.tsx/entry.ts bu dalgada read-only; source wiring scope
yetmezse exact missing-consumer HOLD, sessiz genişletme yok.

Plan/do önce preview üretir; gerçek approved digest exact start tarafından bir kez
tüketilir. autonomous plan/create-goal/start MissionStore hattıdır, mevcut kodda do
ile tek pipeline değildir. Autonomous plan ilk olarak dry-run (gerçek provider çağrısı)
ile değerlendirilir; start öncesi aynı owner outcome'una exact queue scope kanıtı
gerekir, eski veya unrelated pending mission'lar çalıştırılmaz. Goal/Mission/Flow/Run
kimlikleri yalnız canonical araç çıktısından kaydedilir, dosyaya elle uydurulmaz.

| Alt iş | Sınıf / başlangıç kanıtı | Kapanış |
|---|---|---|
| S1 autonomous authoring DAG | BLOCKS_CURRENT_DONE; kaynakta scheduler dependsOn var, doğal-dil authoring propagation henüz kanıtlanamadı | actual planned dependency graph + exact same-outcome bounded execution |
| S2 ingress/custody parity | BLOCKS_CURRENT_DONE; plan/do/start/autonomous farklı yollar, fresh7099 worker yok | each ingress plan/attempt/effect/result/receipt attribution; hiçbir duplicate dispatch yok |
| S3 layer regression | BLOCKS_CURRENT_DONE landing önkoşulu; Fable447: api/mcp/orchestra dört yeni cli/messages import crossing | doğru katman/injection çözümü; yeni crossing sıfır; baseline/whitelist artışı yok |

Alt işler yeni MASTER outcome kimliği değildir; current acceptance içindeki bulgu
takibidir. 7101–7104/4034 kuyruğu başlatılmaz. Worker negative scope: .brain/.tasks/
.deckent runtime, MASTER/governance/communication, provider/auth/config dosyaları,
scripts/gates/host-proof assets, başka lane ve inherited dirty preimage değişiklikleri.
Provider/model/effort ve effective slot config/registry/capacity'den; mevcut snapshot
codex/codex performance, pool üst sınırları8 ve autonomous6; bu değerler talimat
override'ı değil ölçümdür. Budget role policy ve provider final-only capability gate'i
geçilmeden çağrı yok; override/bypass yok. Bir changed-evidence corrective attempt,
ikinci aynı fingerprint'te HOLD. Worker self-report DONE değildir.

W1–W3 fan-in: real compiled entry/health, gerçek temp-config load/merge + Terminal
readback, en/tr rendered health; task başına producer/consumer/ingress/config zinciri
ve registered host proof exact coverage. Mevcut observer yalnız başka zinciri
kanıtlıyorsa reuse edilerek sahte closure yapılmaz. Linux/WSL proof, Windows-native
proof ayrı; macOS/SSH unknown/HOLD. Local scoped tests destekleyicidir, product DONE
yerine geçmez. XVerify ve design-critic sonra bağımsız; build yalnız sprintless sınırda.

## Sonuç

Native terminal, 2026-09-04 owner audit'inde tespit edilen 20 BLOCKS_CURRENT_DONE bulgusunu tek
production-surface kapanışında kapatır. Kullanıcı sonucu: açılış temiz, başlık ve altbilgi aynı
gerçeği söyler, her slash komutu okunabilir kart/picker ile cevap verir, uzun işlem sırasında araç
adı/süre/token görünür, onaylar tek klavyeli kart ailesinden geçer, hatalar typed ve sonraki güvenli
eylemi söyler, checkpoint gerçeği doğru etiketlenir ve kalıcıdır. Dogfood sonucu: aynı yüzey
Deckent'in kendi Goal/Flow/Run zincirini `/do` ile yürütür ve kanıtı bu paketten üretir.

## Owner kararları (2026-09-04, sorgu-cevap)

1. Paketleme: 7099 kapanış + ayrı outcome'lar (7101–7104).
2. Yürütme: önce ADR-D-007 recovery (3331), sonra dogfood.
3. Platform kanıtı: Linux + WSL + Windows native; macOS ve SSH/tmux typed HOLD.
4. Provider kimliği: `native_provider` + erişilebilirlik kapısı; `chat_provider` deprecate + migrasyon.
5. Açılış: temiz; `terminal.startup.recent_sessions` config anahtarı, varsayılan kapalı.
6. Sprint satırları: listede kalır, gerçek rehydrate (7089 (2) bağlı).
7. Maskot: yön A — ayrı outcome 7102; bu pakette yalnız durum satırı zenginleşir.
8. Onaylar: tüm onaylar tek klavyeli kart ailesinde.
9. Çalışma alanı: doğrudan main; dört runtime dosyası commit dışı.
10. `/usage`: provider-neutral depo — ayrı outcome 7101.
11. Checkpoint konumu: `.deckent/runtime/sessions/<id>/checkpoints` (7089 amendment).
12. ADR-G-010 amendment: evet (7102 içinde).

## Dependency DAG — 6 hat (her hat tek writer; dosya çakışması yok)

| Hat | Kapsam | Bulgu | Hot files | MASTER bağı |
|---|---|---|---|---|
| L1 provider kimliği | `native_provider` + erişilebilirlik kapısı tek çözücü; başlık/altbilgi aynı kaynaktan; `health.auth` tr etiketi "oturum" değil; auth probe zaman aşımı gerçek probe ile hizalı; local-llm için endpoint sağlığı; `id (apiId)` tekrarı; `chat_provider` deprecate + migrasyon; receipt `brain_provider` tutarlılığı | 2, 3, ek R | health-snapshot.ts, entry.ts, run.tsx, status-row.tsx, provider-switch.ts, config.ts (migrasyon), run-proposal-compiler.ts | 7077 readiness |
| L2 slash sözleşmesi | Zorunlu argüman + picker/prompt (`/recall`); deprecated filtresi (`/checkpoint` dışarı); köprü spawn env'ine dil aktarımı; `/queue /interrupt /steer` kaydı; `/agent /skill` alias | 7, 8, K | chat-slash-registry.ts, chat-tool-bridge.ts | 7085, 7088 |
| L3 köprü renderer | Tool-keyed renderer: `--json` → kart/picker (doctor, history, agents, skills, models aktif-set + `--json`, sync özet export, audit action picker + verdict kartı); `/mcp` gerçek list/call dispatcher; native tool onayı approval-card'a | 10, 11, 12, 14 | app.tsx (dispatch), picker-specs.ts, yeni renderer modülü, models.ts, sync.ts (export), mcp-bridge.ts, native-agent-bridge.ts | 7104 (sync semantiği ayrı) |
| L4 canlı durum | Başlık Ink içinde ve reaktif; oturum kimliği DROP_ORDER'da atılamaz; turn içi araç adı/süre/token/bağlam %; typed hata satırı + sonraki eylem; sprint satırı gerçek rehydrate; temiz açılış + `terminal.startup.recent_sessions` | 4, 5, 13, A, B | app.tsx (busy/status), status-row.tsx, native-agent-bridge.ts (event → durum), session-resume.ts, config-entries.ts | 7089 (2) |
| L5 checkpoint | Yanlış `corrupt` etiketi → `degraded` + neden kaydı; fence'li JSON onarımı; `.deckent/runtime/sessions/<id>/checkpoints` (gitignore); başarısız sıkıştırmada usage yazılmaz | 6 | session.ts, scratch-checkpoint.ts, native-agent-bridge.ts, .gitignore | 7086, 7089 (3) amendment |
| L6 kapılar | `repl_surface` alan-bazlı default; lint-i18n kapsamı `src/cli/repl/**` + `.tsx`; string-free test tüm repl; ~54 literal; verdict metin taşıyıcı; ASCII degrade tüm işaretler; reduced-motion anahtarı; genişlik birliği + rows reaktif; Ctrl+C picker çift işleme; Esc onay kartında; `DECKENT_INK_DEBUG` redaksiyon; `--version` pipe-güvenli | C, F, G, H, I, L, M, Q | config.ts, lint-i18n-hardcode.mjs, string-free-closure.test.ts, run.tsx, app.tsx, dual-stream.ts, live-footer.ts, input-bar.tsx, picker.ts, approval-card.tsx, splash.ts | 5040 kısmi |

Sıra: L6 (kapılar) ve L1 (kimlik) önce, çünkü L3/L4 onların sözleşmesine dayanır; L2 ve L5
paralel; L3 ve L4 son. Tek writer per hot file: `app.tsx` L3 ve L4 arasında sıralı kilit.

## Yürütme

- Giriş: native terminal `/do` (3331 sonrası) → Goal/Flow/Run; provider/model/worker sayısı
  effective config + registry + capacity'den çözülür, bu capsule sabit değer taşımaz.
- Her hat = bağımsız DAG lane; fan-in sonrası tek verification pass + XVerify (farklı provider).
- Kanıt: her hat için hermetik test + gerçek binary (tmux pane capture) + Windows-native koşum
  (owner makinesi) + i18n en/tr ekran görüntüsü metni.

## Verification manifest

- Production wiring zinciri hat başına: producer → consumer → entrypoint → config enablement →
  gerçek çalıştırma kanıtı.
- `npm run lint:gates` yeşil; scoped vitest yeşil; `npm run build:all`; full suite 5 landing'de bir
  kuralına tabi.
- Platform: Linux/WSL gerçek binary + Windows native gerçek binary; macOS/SSH typed HOLD.
- Design-critic pass: durum satırı ve kart ailesi için `deckent-design-critic`.

## Finite budget ve stop koşulları

- Bir implementation pass + bir bağımsız verification pass per hat; unchanged fingerprint'e FIX yok.
- Hot file dışı mutation typed `SCOPE_HOLD`; provider credential mutation yasak.
- Feature ekleme yasak: maskot (7102), usage (7101), perf (7103), sync semantiği (7104) bu pakete
  girmez.

## DONE

1. 20 BLOCKS bulgusunun her biri disk kanıtı + gerçek binary kanıtıyla kapalı.
2. 7099 evidence satırında v2 proof zinciri (commit SHA'ları, XVerify receipt'leri, platform kanıtı).
3. 7085/7088/7089(2)/7086 bağlı maddeler kendi satırlarında VERIFY veya DONE.
4. Capsule silinir (delete-on-consume); train node'u tüketilir.
