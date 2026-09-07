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
