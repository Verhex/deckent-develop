# Deckent Tam-Spektrum Analizi — Bugün Neredeyiz → Hayaldeki Tamamlanmış Deckent'e Nasıl Gideriz

> Tarih: 2026-07-13  
> Rol: bağımsız mimari denetim ve ürün tasarımı  
> Amaç: iş-listesi üretmek değil, karar-turu-4 için kanıtlı karar mekanizması kurmak  
> İnceleme penceresi: başlangıç HEAD `f22df693`, final validation HEAD `364834a1`; arada shared-worktree'de yalnız born-686 kayıt commit'i geldi (K0, K18). Kod değiştirilmedi; bu belge dışındaki mevcut çalışma-ağacı değişikliklerine dokunulmadı.

## Okuma ve kanıt yöntemi

Bu rapor, North Star ve SSOT'yi `docs/MASTER-PLAN.md:20-39`, ürün anayasasını `docs/adr/adr-g-016-product-vision.md:19-68`, tamamlanmış ürün vizyonunu `docs/vision/VISION.md:7-21,109-142` ve verilmiş mimari kararları `docs/analysis/term-flow-unify-design-2026-07-11.md:177-232`, `docs/analysis/scheduler-unify-design-2026-07-11.md:219-228`, `.analysis/desktop-shell-research-2026-07-08.md:57-105`, `docs/adr/adr-g-035-memory-architecture.md:17-75`, `docs/adr/adr-g-036-zero-hardcode-model-flow.md:28-60` üzerinden sabit zemin kabul eder. Terminal-pivot, hybrid RunProposal, scheduler strangler, Electron thin-shell/system-Node daemon, DB-first memory ve zero-hardcode yeniden oylamaya açılmamıştır; aşağıdaki seçenekler yalnız bu kararların nasıl tamamlanacağına ilişkindir (`docs/MASTER-PLAN.md:20-39`).

Zorunlu mekanik/işlevsel referans ve generated ADR export'u da okundu (`DECKENT.md:6-8,17-55`; `.brain/exports/decisions.md:1-19`); born corpus'unun 195 kaydı full-JSON parse edildi (K18). Generated/legacy metin runtime SSOT ile çeliştiğinde source+artefact üstün tutuldu; örneğin `DECKENT.md` MRR notu aşağıdaki çelişki tablosunda açıkça düşürülmüştür (`DECKENT.md:52-55`; `src/orchestra/scheduler-truth.ts:1-17`).

“Kodda bir type/function var” ile “kullanıcı bunu yaşıyor” ayrılmıştır: source kanıtı yalnız capability/wiring; gerçek-user-surface kanıtı ise `dist/cli/entry.js`, gerçek run artefact'ı veya paketlenmiş binary/OS matrisi gerektirir (`docs/adr/adr-g-009-evaluation-integrity.md:17-48`). “DOĞRULANAMADI”, negatif iddia değil; bu incelemede gereken runtime receipt bulunamadığı anlamına gelir.

### Çalıştırılan komut kanıtları

| ID | Komut / gözlenen çıktı | Sonuç |
|---|---|---|
| K0 | İlk `git branch -vv` → `main f22df693`; final validation → `main 364834a1` | Shared-worktree inceleme sırasında ilerledi; born-686 final snapshot'a katıldı. |
| K1 | `node dist/cli/entry.js --version` → `1.0.0-beta.1`, Node `24.15.0`, `linux`, `tmux n/a`, `claude n/a` | Gerçek binary açılıyor; bu hostta iki dış bağımlılık yok. |
| K2 | `node dist/cli/entry.js --help`; `node dist/cli/entry.js do --help` → kullanıcı metni hâlâ “sprint”; `do` çalıştırma için `--run`, otomatik onay için `--yes` istiyor | Terminoloji ve discoverability ground-truth'u. |
| K3 | `node dist/cli/entry.js status --json` → exit `0`, JSON yerine “aktif run yok” ve bir pending approval | JSON sözleşmesi boş-sprint dalında kırık; kaynak dalı `src/cli/commands/status.ts:407-431`. |
| K4 | `npm run lint` → exit `0`; 70 CLI command, 47 MCP tool, bilinen parity baseline 34 CLI-only + 1 MCP-only; 113 i18n dosyası, 0 gated + 12 allowlisted; 2.227 hermetic-test dosyası, 8 allowlisted; 60 skill + 34 agent manifest | Statik ana gate yeşil; parity “sıfır” değildir. |
| K5 | `npm run lint:model-literal` → exit `0`, 85 sanctioned literal | Ratchet yeşil; “literal sıfır” değil, allowlist 85. |
| K6 | `npm run validate:publish` → exit `1`; pack size/count belirlenemedi, critical files absent, empty pack-category baseline; özet aynı anda `7 passed, 1 failed, 0 warnings` dedi | Bugünkü publish gate kırmızı ve hata özeti kendi alt bulgularıyla tutarsız. |
| K7 | `npm run tsc:desktop` → exit `0` | Desktop source type-check geçiyor. |
| K8 | `npm run test:desktop` → 3 file / 50 test passed | Store/lifecycle/IPC unit-composition kanıtı; gerçek Electron UX kanıtı değildir. |
| K9 | `npm run test:dashboard` → 100 file / 1.267 test passed; stderr'de `127.0.0.1:3000 EPERM` ve React `act(...)` uyarıları | Dashboard testleri yeşil; sandbox ağ/async uyarıları nedeniyle gerçek kullanıcı akışı kanıtı değildir. |
| K10 | `node dist/cli/entry.js config get brain_provider`; `worker_provider`; grouped `providers.brain`; performance `brain_model` → `claude`, `claude`, `claude`, `gpt-5.6-sol` | Bugünkü effective provider premise'i mixed-fleet değil; model/provider config'i çelişkili. |
| K11 | Full-JSONL sayaçları → 120 trace, 58.584.247 byte, 47 v1 + 73 v2, 28.599 message, 3.609 native tool call; v1'de 2.399 orphan tool-message, v2'de 0; son 430/431 görevleri `sonnet` | Bugünkü corpus ve live worker fleet ölçümü. Kaynak: `.deckent/traces/sprint-worker.jsonl:1-120`. |
| K12 | `runPipeline(...)` gerçek corpus'a → `linesRead=120`, `examplesWritten=120`, `skippedMalformed=0`, `truncatedCount=120`, `redactedCount=6`, `quarantinedSkipped=0`; çıktı 32.571.374 byte | Training pipeline, 47 legacy-v1 kaydı da corpus'a aldı; filtre kaynağı `src/training/pipeline.ts:304-313,329-362`. |
| K13 | `npm test` → uzun süre tamamlanmadı; socket/spawn `EPERM` ve timeout'lar görüldü, manuel `SIGINT`, exit `130` | Root-suite bugünkü pass/fail durumu **DOĞRULANAMADI**; bu sonuç “ürün kırık” kanıtı da değildir. |
| K14 | `npm run test:desktop` ve `npm run test:dashboard` ile ayrı surface koşuları | K8-K9'daki sınırlarla surface test tabanı var. |
| K15 | `rg -o '^    [a-z]{2}:' src/cli/helpers/messages.ts \| sort \| uniq -c` → 722 `en`, 722 `tr`; supported constants `['en','tr']` | Bugünkü ana i18n yüzeyi iki dil; kaynak `src/core/constants.ts:131`, `src/cli/helpers/messages.ts:3396-3416`. |
| K16 | `.deckent/routing/learnings.json` parse → `totalOutcomes=2805`, 38 skill-performance key, 9 evolved rule; latest 427–431 | Learning store bugünkü hacmi; dosya `.deckent/routing/learnings.json:1`. |
| K17 | 430/431 scheduler journal full parse → 356 tick, 0 known engine, 356 unknown engine, 0 divergent tick | Differential equality var; executed-engine receipt yok. Kaynak `.deckent/runtime/scheduler-shadow/sprint-430.jsonl:1-189`, `sprint-431.jsonl:1-167`. |
| K18 | `.analysis/born-backlog.json` full parse → 195 kayıt: 52 DONE, 8 OPEN, 1 DECIDED, 1 IN_PROGRESS, 133 status-unspecified; open `627,634,635,636,666,679,685,686` | Zorunlu born corpus'unun tamamı parse edildi; born-686 inceleme sırasında eklendi (`.analysis/born-backlog.json:3131-3137`). |

---

# A — Mevcut-Durum Ground Truth

## Yönetici özeti

Deckent'in orchestration çekirdeği, native terminal, typed RunFlow, Desktop daemon kabuğu, dashboard, enterprise substrate ve trace-v2 parçaları “boş blueprint” değildir; hepsinde ciddi source/test emeği vardır (`docs/MASTER-PLAN.md:45-100`). Ancak kullanıcı deneyimi ve tek-truth sınırları aynı olgunlukta değildir: `deckent do` ile gerçek run kabulü vardır, fakat flow correlation artefact'ta kopuktur; Desktop RunFlow tüketmez; dashboard monitoring-only kararına rağmen mutasyon yapar; scheduler'ın canlı engine receipt'i `unknown` kalır (`docs/MASTER-PLAN.md:46,79`, `src/orchestra/result-collector.ts:1542-1548`, `src/dashboard/src/components/SprintControlPanel.tsx:45-85`). Enterprise mekanizmaları opt-in ve parçalıdır; hard multi-tenant/RBAC/audit assurance henüz söylenemez (`docs/adr/adr-g-031-enterprise-foundation.md:56-83`). RC-treni dokümana göre bitmiş olsa da bugünkü `validate:publish` kırmızıdır; dolayısıyla publish-ready iddiası şu an NO-GO'dur (`docs/MASTER-PLAN.md:78`, K6).

## Kanıt tablosu

| Alan | İddia edilen | Source / test gerçeği | Gerçek binary / artefact | Hüküm |
|---|---|---|---|---|
| Terminal | NL→plan→gate→approve→detached-run→result kabul edildi | Typed contract, reducer, controller ve card mounted (`src/core/run-flow-contract.ts:23-151`; `src/cli/repl/run.tsx:773-890`) | `deckent do` gerçek sprint-430 kabulü SSOT'de; completion kaydında `flowId` yok (`docs/MASTER-PLAN.md:46`; `.deckent/runtime/jobs/sprint-430.json:97-129`) | Front-door gerçek; correlation ve REPL bütünlüğü kısmi. |
| Desktop | Thin Electron shell + daemon; DESK-2 henüz onay şartı | Shell daemon'ı adopt/spawn edip dashboard URL'sini yükler (`src/desktop/src/main/daemon-lifecycle.ts:124-197`; `src/desktop/src/main/window-manager.ts:209-230`) | Typecheck ve 50 test yeşil (K7-K8); Console/RunFlow consumer yok | Infrastructure GO; ürün deneyimi NO-GO. |
| Dashboard | Monitoring-only | SSE/metrics/monitoring geniş; aynı zamanda kill/cleanup/plan/start/directives mutasyonu var (`docs/adr/adr-g-033-dashboard-observability.md:25-94`; `src/dashboard/src/components/SprintControlPanel.tsx:45-85`) | 1.267 test yeşil, ağ/act uyarılı (K9) | İzleme güçlü; yetki-sınırı kararla çelişiyor. |
| Orchestration | 8 faz + scheduler 7/8 | Sekiz procedural stage; typed enum birebir sekiz değil (`src/orchestra/sprint-controller.ts:1108-1110,1439-1512,1732-1903`; `src/core/sprint-types.ts:8-19`) | 430/431 tamam; scheduler journal'ları `executedEngine=unknown` (`.brain/sprints/sprint-430.md:3-12`; `.deckent/runtime/scheduler-shadow/sprint-430.jsonl:1-189`) | Çekirdek güçlü; reducer retirement kanıtı yok. |
| Enterprise | Multi-tenant/RBAC/audit/rate/SCIM/OIDC foundation | Substrate gerçek, enforcement varsayılan advisory/role-optional ve config wiring eksik (`docs/adr/adr-g-031-enterprise-foundation.md:17-83`) | Enterprise E2E deployment receipt'i **DOĞRULANAMADI** | “Foundation” GO; “hard enterprise” NO-GO. |
| Security/release | RC 6/6 tamam | Single release authority/OIDC/xplat gate var (`.github/workflows/release.yml:1-10,77-173,238-266`) | Bugünkü publish validation exit 1 (K6) | Yayın bloklu. |
| Trace/SP-2 | Trace-v2 ve segment delivery | v2 projection wired; segment writer production caller'sız (`src/orchestra/sprint-phases.ts:2188-2224`; `src/agent/trace-recorder.ts:320-375`) | 73 v2 + 47 v1; pipeline 120/120 alıyor (K11-K12) | Veri var; training-ready corpus NO-GO. |
| Provider | Brain=Codex/Sol + worker=Claude/Sonnet canlı | Grouped config flat duplicate'i ezer; RunFlow config'i compiler'a geçirmiyor (`src/core/config-migration.ts:615-649`; `src/cli/repl/run-flow-controller.ts:199-203`) | Effective provider Claude/Claude; 430/431 worker Claude/Sonnet (K10-K11) | Mixed-fleet iddiası çürütüldü. |

## A1 — Terminal: do-first RunFlow gerçekten nereye kadar yaşıyor?

### Özet

Typed `RunProposal`/`PlanPreview`/snapshot contract, pure reducer, atomic store, approval card ve detached start yolu production source'ta birleşmiştir (`src/core/run-flow-contract.ts:23-151`; `src/orchestra/run-flow-reducer.ts:60-184`; `src/cli/repl/run-flow-controller.ts:159-309`). SSOT, sprint-430'da tek `deckent do "<NL>"` ile dört gerçek task'ın 4/4 DONE olduğunu kaydeder (`docs/MASTER-PLAN.md:46`). Bunun sınırı şudur: kanıt `deckent do` front-door'udur; serbest REPL NL, slash `/do`, çoklu-flow yönetimi ve doğru result correlation için eşdeğer runtime receipt yoktur (`src/cli/commands/do.ts:117-127,232-354`; `src/cli/repl/run-flow-controller.ts:22-27`).

### Kanıt-tabanlı analiz

| Halka | Kodda ne var? | Kullanıcıda ne kanıtlandı? | Boşluk |
|---|---|---|---|
| Exposure | `run_flow_v2` yalnız exact `true` iken açılır; source default OFF (`src/core/config.ts:224-228`; `src/cli/repl/native-tool-registry.ts:91-96`) | Dogfood repo config'i ON (`.deckent/config.json:118-126`) | Sprint-430 deckent-dev kanıtı fresh/default kullanıcı deneyimi kanıtı değildir. |
| NL→proposal | `compileRunProposal` ve controller preview üretir (`src/orchestra/run-proposal-compiler.ts:96-105`; `src/cli/repl/run-flow-controller.ts:199-216`) | Sprint-430 gerçek dört-task planı SSOT'de kayıtlı (`docs/MASTER-PLAN.md:46`) | `do` dışı arbitrary REPL NL'nin aynı coordinator'a girdiği kanıtlanmadı. |
| Preview→gate | Terminal card `gateFindings` render eder (`src/cli/repl/app.tsx:1516-1544,1621-1632`) | Gerçek `do` gate geçti (`docs/MASTER-PLAN.md:46`) | API preview aynı bulguları eksik döndürür (`src/api/run-flow-routes.ts:218-235`). |
| Approve→snapshot-start | CAS/digest/revision kontrollü start vardır (`src/cli/repl/run-flow-controller.ts:272-309`) | `--run --yes` ile detached run kabulü vardır (`docs/MASTER-PLAN.md:46`; K2) | Generic confirm ile runtime-wide ApprovalBroker aynı şey değildir; canlı worker→terminal approval hedefi açık kabul edilmiştir (`docs/MASTER-PLAN.md:29-31`). |
| Run→result-turn | Completion watcher ve idle-wake queue vardır (`src/cli/repl/run-completion-watch.ts:138-163`; `src/cli/repl/run.tsx:228-244`) | Completion record var, fakat 430/431 kaydında `flowId` yok (`.deckent/runtime/jobs/sprint-430.json:97-129`; `.deckent/runtime/jobs/sprint-431.json:96-128`) | `start` yalnız preplanned sprint'i geçirir; `RunSprintOptions` flowId taşımaz (`src/cli/commands/start.ts:353-366`; `src/orchestra/sprint-controller.ts:697-711`). |
| Çoklu-flow | Contract `flowId/revision` taşır (`src/core/run-flow-contract.ts:57-100`) | **DOĞRULANAMADI** | Controller tek `currentFlowId/currentRevision` tutar (`src/cli/repl/run-flow-controller.ts:22-27`). |
| Risk/izin | `checkActionAllowed` implementasyonu var (`src/cli/repl/term-mode.ts:93-132`) | Production caller **DOĞRULANAMADI** | Yalnız açıklama referansı bulunur (`src/cli/commands/chat-mode.ts:15`). |
| Flag-off compatibility | Legacy `runGoldenFlow`, DIRECTIVES swap ve synchronous start yaşamaya devam eder (`src/cli/commands/do.ts:117-127,232-271,332-354`) | K2 default-user exposure'ın RunFlow olduğunu kanıtlamaz | Canonical cutover/deprecation receipt'i yok. |
| `plan-nl --write` | Flag-on preview common service'e yaklaşsa da write yolu tek-task TODO scaffold içerir (`src/cli/commands/plan-nl.ts:50-77,155-181`) | Gerçek binary write journey **DOĞRULANAMADI** | `do` actual-plan başarısı tüm NL entrypoint parity'si değildir. |

Composition testi flowId'yi finalizer yolundan gelmiş gibi fixture'a elle enjekte eder; bu, gerçek orchestration propagation kanıtı değildir (`tests/cli/term-flow-composition.test.ts:249-305`). Finalizer flowId kabul edip completion'a yazabilir, fakat phase çağrıları onu geçirmez (`src/orchestra/sprint-finalizer.ts:160-181,1038-1064`; `src/orchestra/sprint-phases.ts:3062-3069,3157-3162`). Bu nedenle 511’in “tek komutla gerçek iş” kabulü geçerlidir; “tam correlated-result zinciri production'da kapalı” iddiası geçerli değildir.

### Implementation karşılaştırması — canonical owner kararı yeniden açılmaz

| Seçenek | Artı | Eksi | NO-GO koşulu |
|---|---|---|---|
| A — Mevcut per-surface controller'ları büyüt | Kısa diff | Terminal/API/Desktop drift'i büyür; ikinci implementation yasağına ters | Desktop ayrı state machine veya ayrı digest üretirse NO-GO. |
| B — API'yi coordinator say | Desktop için doğal HTTP giriş | CLI/REPL offline akışı daemon'a bağımlı olur; core ürünün zero-required-cloud/local-first ilkesini zedeler (`docs/adr/adr-g-016-product-vision.md:25-33`) | Terminal daemon yokken RunFlow yapamazsa NO-GO. |
| C — Durable shared `RunFlowCoordinator`, surfaces thin adapter | Terminal/API/Desktop aynı CAS, event ve store'u kullanır; local in-process ve daemon transport birlikte mümkün | Migration ve backward-compatibility yükü daha yüksek | flowId propagation, replay ve idempotency receipt'i olmadan cutover NO-GO. |

**Net öneri:** Sabit hybrid RunProposal kararı nedeniyle C tek admissible canonical biçimdir. A/B mevcut/olası bridge'lerin neden owner olamayacağını gösteren counterfactual'lardır; karar seçeneği değildir (`docs/analysis/term-flow-unify-design-2026-07-11.md:177-232`).

## A2 — Desktop: blueprint ile çalışan ürün arasındaki mesafe

### Özet

Desktop bugün “hiç yok” değildir: Electron main process system-Node daemon'ı adopt/spawn eder, güvenli connection state tutar ve daemon URL'sini window'a yükler (`src/desktop/src/main/daemon-lifecycle.ts:124-197`; `src/desktop/src/main/window-manager.ts:209-230`). Fakat product surface bugün blueprint'in Console/Chat/Approval ürünü değil, daemon'ın dashboard'unu gösteren ince kabuktur (`src/desktop/src/main/index.ts:98-114`; `.analysis/desk2-blueprint-2026-07-10.md:6-15`). Source taramasında Desktop/dashboard tarafında RunFlow consumer yok; API'de de start endpoint'i yoktur (`src/api/run-flow-routes.ts:20-40`). Bu yüzden “Desktop altyapısı çalışıyor” denebilir; “Desktop'tan deckent geliştiriliyor” **DOĞRULANAMADI**.

### Kanıt-tabanlı analiz

| Capability | Bugün | Kanıt / boşluk |
|---|---|---|
| Thin shell + daemon | Var | IPC contract yalnız connection/daemon/app/window üyeleri taşır (`src/desktop/src/shared/desktop-api.ts:62-91`). |
| Profiles | Dört schema profile var, renderer yalnız local'i enable eder | `src/desktop/src/shared/desktop-api.ts:14-45`; `src/desktop/src/renderer/app.ts:334-340`. |
| Chat | Window `/chat` dashboard route'una gider; sayfa text-chat yapar | `src/dashboard/src/App.tsx:52-77`; `src/dashboard/src/pages/ChatPage.tsx:20-28,398-457`; API handler `src/api/server.ts:935-979`. |
| Console/RunFlow | **DOĞRULANAMADI** | `src/desktop/src` ve `src/dashboard/src` altında RunFlow consumer bulunmadı; mevcut route setinde start yok (`src/api/run-flow-routes.ts:20-40`). |
| Update/distribution | Stub / ayrı artifact hedefi | Auto-update dosyası stub (`src/desktop/src/main/auto-update.ts:1-18`); package private `0.1.0`, “Phase 4 signed artifact” der (`src/desktop/package.json:1-22`). |
| Gerçek UX test | **DOĞRULANAMADI** | 50 test store/lifecycle/IPC; Playwright dependency var ama bu koşuda packaged Electron E2E receipt yok (K8; `src/desktop/package.json:14-21`). |

Desktop release onayı publish'in explicit şartıdır (`docs/MASTER-PLAN.md:70-71`). Bu şart, shell'in boot etmesiyle değil, D bölümündeki terminal-parity acceptance'ıyla kapanmalıdır; aksi halde “Desktop bitti” yoruma açık kalır.

### Consumer karşılaştırması — thin-shell kararı yeniden açılmaz

| Seçenek | Artı | Eksi | NO-GO |
|---|---|---|---|
| A — Dashboard'u Electron içinde ürün say | En az yeni UI | Monitoring-only kararıyla ve blueprint'teki “dashboard-reuse ürün değil” hükmüyle çelişir (`docs/MASTER-PLAN.md:71`) | Console/approval/chat tek flow'u yönetemiyorsa NO-GO. |
| B — Terminal PTY embed | Hızlı power-user parity | Structured proposal/approval/accessibility ve mobil/remote semantics'i terminal escape sequence'lerine bağlar | Desktop state'i yalnız terminal screen scrape ederse NO-GO. |
| C — Blueprint UI + shared coordinator API/event stream | İkinci orchestration implementation yaratmadan gerçek Desktop ürünü | API auth/replay/start ve design-system işi gerekir | Surface kendi state transition'ını üretirse NO-GO. |

**Net öneri:** Thin-shell kararı altında C structured consumer'dır; A product olarak, B ise tek surface olarak inadmissible'dır. PTY yalnız “expert console” organı olarak kalabilir, product state'in truth'u olamaz (`.analysis/desktop-shell-research-2026-07-08.md:57-105`; `.analysis/desk2-blueprint-2026-07-10.md:6-15`).

## A3 — Dashboard: izleme rolü ne kadar dolu?

### Özet

Dashboard'ın observability yönü geniştir ve karar monitoring-only'dir (`docs/adr/adr-g-033-dashboard-observability.md:25-94`). Ancak bugünkü UI kill/cleanup, directives edit ve plan/start gibi write-capability'ler de sunar (`src/dashboard/src/components/SprintControlPanel.tsx:45-85`; `src/dashboard/src/components/NewSprintModal.tsx:52-80`; `src/dashboard/src/components/DirectivesEditor.tsx:34-47`). Böylece ürün rolüyle source behavior arasında açık bir authority çelişkisi vardır. RunFlow-specific SSE ise dashboard'ın generic SSE hook'una bağlı değildir; REST transition'ları da event publish etmez (`src/api/run-flow-event-stream.ts:59-95`; `src/dashboard/src/hooks/useSSE.ts:20-42`).

### Kanıt-tabanlı analiz

- Dashboard test tabanı geniştir: 100 file/1.267 test K9'da geçti; fakat sandbox `EPERM` ve React async uyarıları, live daemon/browser acceptance yerine geçmez (K9).
- RunFlow REST `propose/get/preview/decision` sunar, `start/cancel/resume/list` sunmaz (`src/api/run-flow-routes.ts:20-40`). Store module-local `Map` ve adapter ile tutulur; process restart/çok-instance durability kanıtı değildir (`src/api/run-flow-routes.ts:35-40,101-116`).
- Root koşuda RunFlow API composition testleri timeout grubundaydı; sandbox/port etkisi ayrıştırılamadığı için bugünkü API composition pass durumu **DOĞRULANAMADI** (K13). Source/test varlığı green receipt olarak sayılmamıştır (`tests/api/run-flow-api-composition.test.ts:1-27`).
- RunFlow SSE flow-scoped'tur, fakat sequence replay/backfill yoktur (`src/api/run-flow-event-stream.ts:59-95`). API composition testi event'i route transition'ından değil elle publish eder (`tests/api/run-flow-api-composition.test.ts:18-27,335-356`).
- Browser auth query token fallback kullanır; auth katmanı token prefix/validation uygular (`src/dashboard/src/lib/api.ts:82-93`; `src/api/auth.ts:157-163,240-248`; `src/api/server.ts:1871-1893`). URL token'ının history/log/proxy sızıntı modeli için end-to-end security receipt **DOĞRULANAMADI**.
- Daha temel bugünkü gap: server'ın query-token allowlist'i yalnız `/api/events`, `/api/chat/stream` ve `/api/workers/` prefix'ini içerir; `/api/run-flow/:flowId/events` yoktur (`src/api/server.ts:1871-1893`; RunFlow path'i `src/api/run-flow-event-stream.ts:1-34`). `EventSource` header koyamadığı için auth açık gerçek Desktop/browser RunFlow SSE consumer'ı query token ile geçemez; bu iddia source control-flow'dan türetilmiştir, gerçek HTTP receipt'i **DOĞRULANAMADI** (`src/api/auth.ts:240-253`).
- `ApprovalsPanel` read-only listeler; runtime-wide live approval action'ı sunmaz (`src/dashboard/src/components/ApprovalsPanel.tsx:10-16`).

### Monitoring-only cutover seçenekleri — nihai rol yeniden açılmaz

| Seçenek | Artı | Eksi | NO-GO |
|---|---|---|---|
| A — Tüm write controls hemen kapanır | Authority sınırı anında temiz | Desktop/Terminal eşdeğeri olmayan kullanıcı capability'si kaybolabilir | Eşdeğer action yokken silme NO-GO. |
| B — Capability-by-capability strangler + deprecation/deep-link | Geri dönüş ve kullanıcı sürekliliği; her adım kanıtlanır | Geçiş boyunca geçici compatibility yüzeyi taşınır | Yeni dashboard write eklemek veya flag'i kalıcılaştırmak NO-GO. |
| C — Desktop tümüyle bitince tek switch | Ara-state daha az | Authority borcu daha uzun yaşar; büyük-bang blast radius | Cutover öncesi server-side role/policy koruması yoksa NO-GO. |

**Net öneri:** B. Dashboard'ın nihai monitoring-only rolü sabittir; seçim yalnız cutover atomikliğidir. Shared coordinator'a salt-okur projection ve güvenli deep-link tüketir (`docs/adr/adr-g-033-dashboard-observability.md:74-94`).

## A4 — Orchestration çekirdeği: lifecycle, scheduler ve öğrenme halkası

### Özet

Deckent PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO/DECAY→CLEANUP procedural zincirini gerçekten çalıştırır (`src/orchestra/sprint-controller.ts:1108-1110,1439-1512,1732-1903`). Scheduler strangler source'ta pure reducer, driver, typed effects ve differential journal'a ulaşmıştır; proje config'i reducer ister (`docs/analysis/scheduler-unify-design-2026-07-11.md:219-228`; `.deckent/config.json:373-378`). Buna rağmen 430/431'de 356 tick'in tamamı `executedEngine=unknown` olduğu ve effect parity açık kaldığı için reducer default/legacy retirement kanıtı yoktur (`.deckent/runtime/scheduler-shadow/sprint-430.jsonl:1-189`; `.deckent/runtime/scheduler-shadow/sprint-431.jsonl:1-167`). Outcome→routing readback gerçek; promotion invocation wired, fakat kalibrasyon ve başarılı actuation receipt'i kısmi kalır (`src/orchestra/sprint-finalizer.ts:1433-1487,1592-1614`; `src/core/routing-engine.ts:1379-1460`).

### Scheduler kanıtı

| Boyut | Bugünkü hüküm | Kanıt |
|---|---|---|
| Engine selection | Product default legacy; project config reducer | `src/orchestra/scheduler-driver.ts:294-308`; `.deckent/config.json:373-378`. |
| Composition | Initial ve watcher aynı injected driver'ı çağırır | `src/orchestra/result-collector.ts:1550-1611,1725-1751`. |
| Live differential | 430: 189 tick/0 divergence; 431: 167 tick/0 divergence | `.deckent/runtime/scheduler-shadow/sprint-430.jsonl:1-189`; `.deckent/runtime/scheduler-shadow/sprint-431.jsonl:1-167`. |
| Engine receipt | 356/356 `unknown`; live call-site result engine'i journal'a geçirmez | `src/orchestra/scheduler-journal.ts:36-47,106-111`; `src/orchestra/result-collector.ts:1542-1548`. |
| Effects | `WriteCheckpoint` dependency verilmezse no-op; `Blocked/ClearBlocked/EmitMetric` skip edilir | `src/orchestra/scheduler-driver.ts:397-404`; `src/orchestra/scheduler-effects.ts:384-414,524-533`. |
| Closure leakage | `cascadeSkipDeadBlocked` driver dışında initial/watcher sonrasında da çalışır | `src/orchestra/result-collector.ts:1610-1611,1749-1751`. |
| MRR | Yalnız DONE dep-satisfying; MRR/NO_GO terminal-non-satisfying | `src/orchestra/scheduler-truth.ts:1-17,24-53`. |
| Restore | MRR korunur ve descendants cascade-skip olur; fakat trigger `watcher`, executor inline tekrar | `src/orchestra/sprint-checkpoint.ts:691-704,758-840`; `tests/orchestra/checkpoint-mrr-restore.test.ts:166-220`. |
| FIFO | Blocked head düşmeden sonraki eligible task seçilir | `src/orchestra/scheduler-reducer.ts:160-164,229-232`; `tests/orchestra/scheduler-fifo-composition.test.ts:1-26`. |

“8-faz state machine” ifadesi teknik olarak aşırı iddiadır: procedural olarak sekiz stage vardır, fakat `SprintPhase` enum'unda CLEANUP yoktur ve DECAY/CLEANUP aynı phase üzerinden temsil edilir (`src/core/sprint-types.ts:8-19`; `src/orchestra/sprint-controller.ts:1877-1899`).

### Öğrenme döngüsü kanıtı

- Finalizer outcome kaydeder; planner learnings okur; routing score'a bonus uygular (`src/orchestra/sprint-finalizer.ts:1433-1487`; `src/orchestra/outcome-tracker.ts:428-463`; `src/orchestra/sprint-planner.ts:596-605`; `src/core/routing-engine.ts:1379-1460`). Bu, capture→readback kapalı halkadır.
- Promotion pipeline finalizer'dan çağrılır (`src/orchestra/sprint-finalizer.ts:1592-1614`). Ancak GWTD tam başarı sayılır, sprint bonusu `tasks[0]` DNA'sına bağlanır ve tanımlı `minSprints` evaluation'da kullanılmaz (`src/orchestra/outcome-tracker.ts:34-38,135-158`; `src/orchestra/promotion-pipeline.ts:24-28,361-388`).
- Finalizer `promote()` boolean sonucunu doğrulamaz; gerçek başarılı promotion audit receipt'i **DOĞRULANAMADI** (`src/orchestra/sprint-finalizer.ts:1598-1604`; `src/orchestra/promotion-pipeline.ts:144-216`). Dolayısıyla “mekanik closed loop” kısmi; “epistemik olarak kalibre closed loop” değildir.
- 430/431 4/4 tamamlanmıştır, ancak raporlarda Coverage `NaN%`; 431 critical path `wait_results=863.623,88ms`, iki `skill.prompt_load_failed` ve bir collision vardır (`.brain/sprints/sprint-430.md:3-12`; `.brain/sprints/sprint-431.md:3-12`; `docs/audits/sprint-431/load-test-report.md:3-45`).

### Strangler retirement evidence seçenekleri — mimari karar yeniden açılmaz

| Seçenek | Artı | Eksi | NO-GO |
|---|---|---|---|
| A — Yalnız iki gerçek reducer run | Hızlı ve anlaşılır | Effect/restore state-space coverage'ını garanti etmez | `unknownEngine>0` veya açık effect varsa NO-GO. |
| B — Sabit N shadow/reducer run | Uzun gözlem drift yakalayabilir | N sayısı coverage'ın vekilidir; rare restore/FIFO vakasını kaçırabilir | Coverage map olmadan süre/sayı tek başına flip veremez. |
| C — Effect/checkpoint/restore/FIFO/MRR coverage + iki gerçek reducer run | Davranış alanını ve live receipt'i birlikte kanıtlar | Coverage instrumentation ve fixture matrisi gerekir | Her named effect/trigger receipt'i yoksa flip NO-GO. |

**Net öneri:** C. Verilmiş strangler sırası: engine receipt → effect parity → gerçek restore trigger/executor parity → coverage matrisi + iki gerçek reducer run → legacy-call ratchet. Rollback her dilimde `scheduler.engine=legacy` olmalıdır (`docs/analysis/scheduler-unify-design-2026-07-11.md:226-228`).

## A5 — Enterprise: hard-enforce ile advisory gerçeği

### Özet

Tenant context, RBAC types, authority matrix, audit chain, SCIM/OIDC adapters ve enterprise endpoint gerçek source'tur (`src/core/tenant-context.ts:12-93`; `src/core/rbac.ts:11-57`; `src/connectors/identity/providers/scim.ts:65-180`; `src/core/auth-oidc.ts:187-260`). Fakat config read-path bazı hard-enforcement alanlarını düşürür, role missing/unknown allow olabilir, strict tenant isolation default-off'tur ve rate rules runtime consumer'a bağlı değildir (`src/core/config.ts:1721-1896,2538-2623`; `src/nervous/authority-matrix.ts:303-378`; `docs/adr/adr-g-031-enterprise-foundation.md:81-83`). Bu yüzden “enterprise foundation” doğru, “hard multi-tenant enterprise” yanlış bir ürün iddiası olur. ADR-G-020'nin post-GA-V2 hard flip'i bugün roadmap'tir (`docs/adr/adr-g-020-authority-roles-flow-enforcement.md:123-138`).

### Enforcement matrisi

| Katman | Mevcut mekanizma | Gerçek enforcement | Hüküm |
|---|---|---|---|
| Internal RBAC | Fixed role hierarchy ve `ResolvedConfig.enforce_rbac` type alanı var (`src/core/rbac.ts:11-57`; `src/core/config-types.ts:1282-1288`) | `loadConfig`/`mergeConfigs` resolved object'leri alanı taşımıyor; consumer exact `true` görmeyince false çalışıyor (`src/core/config.ts:1721-1896,2538-2623`; `src/orchestra/sprint-runtime.ts:27-33`). Ayrıca missing/unknown role allow olabilir (`src/nervous/authority-matrix.ts:303-378`) | Hard flag structurally half-wired; advisory/conditional. |
| Scope | Authority enforcer realpath yapar (`src/orchestra/authority-enforcer.ts:354-385`) | Worker `projectRoot` geçmez; agentic guard realpath yapmaz (`src/agents/worker.ts:570-587`; `src/agents/scope-guard.ts:31-64`) | Semantics drift. |
| Tenant | Async tenant context ve Memory exact filter var (`src/core/tenant-context.ts:61-93`; `src/core/memory-store.ts:753-820`) | Strict default false; tenantless query unfiltered olabilir (`src/core/config.ts:1812-1814`; `src/core/memory-store.ts:770-818`) | Hard isolation değil. |
| Enterprise API | Config/audit/rate metadata endpoint'leri var (`src/api/enterprise-endpoint.ts:196-295`) | GET global; role/tenant gate görünmüyor; custom RBAC display-only (`src/api/enterprise-endpoint.ts:147-165,248-323`) | Management-plane assurance yok. |
| Rate limit | Token-bucket primitive var (`src/core/rate-limiter.ts:23-60`) | Persisted rules'in production consumer'ı **DOĞRULANAMADI** (`docs/adr/adr-g-031-enterprise-foundation.md:81-83`) | Unwired. |
| Audit | HMAC chain/fail-soft writer var (`src/core/audit-writer.ts:23-95,149-203`) | Secret public literal; export verify chain'i yeniden doğrulamaz (`src/core/audit-export.ts:38-51`) | Evidence-grade değil. |
| Connector permissions | Execute gate `requiredPermission` okuyabilir (`src/connectors/capabilities/execute.ts:27-33`) | Shipped capability'lerde production tag kapsamı **DOĞRULANAMADI**; örnek screenshot/mail tagsiz (`src/connectors/capabilities/builtin/screenshot.ts:57-64`; `src/connectors/capabilities/builtin/send-mail.ts:26-33`) | Fail-closed iddiası surface-wide değil. |
| Identity | SCIM ve OIDC primitives gerçek (`src/connectors/identity/providers/scim.ts:65-180`; `src/api/oidc-callback-endpoint.ts:216-257`) | SCIM connector bootstrap'ta disable; claims prod caller'ı **DOĞRULANAMADI** (`src/connectors/connector-bootstrap.ts:629-654`; `src/connectors/identity/providers/oidc-claims.ts:65-135`) | Adapter var, deployment wire eksik. |

### Enterprise paketleme/claim seçenekleri

| Seçenek | Artı | Eksi | NO-GO |
|---|---|---|---|
| A — “Enterprise-ready” olarak şimdi sat | Pazarlama hızlı | Security claim kaynakla çelişir; güven kaybı | Role-optional/tenantless path varken mutlak claim NO-GO. |
| B — GA'yı tüm enterprise assurance'a bağla | Tek güçlü launch | Community GA'yı bağımsız governance-depth yoluna rehin eder; ADR-G-016 ayrımını bozar (`docs/adr/adr-g-016-product-vision.md:47-68`) | Community core gereksiz yere beklerse NO-GO. |
| C — Community GA + açık etiketli Enterprise Preview; assurance gate sonrası Enterprise GA | Ürün anayasasına uygun; dürüst paketleme | İki readiness scorecard yönetimi gerekir | “Preview” hard guarantee gibi satılırsa veya feature paywall yaratılırsa NO-GO. |

**Net öneri:** C; hard-flip ancak tenant-isolation, role-required authority, keyed audit, rate-rule wire, SCIM/OIDC lifecycle ve cross-tenant negative E2E birlikte geçtiğinde yapılmalıdır (`docs/adr/adr-g-031-enterprise-foundation.md:60-83`).

İlk execution gate **ENT-TRUTH-0** olmalıdır: `src/core/config.ts:1721-1896,2538-2623` resolved config projections'ı `enforce_rbac`, `enforce_least_privilege` ve ilgili enterprise flags için typed SSOT'tan eksiksiz taşınır; `src/orchestra/sprint-runtime.ts:27-33` gerçek `true` receipt'i üretir; config roundtrip + gerçek denied-spawn composition testi olmadan hard-enforcement canary'si açılamaz. Sonraki dilimler unified realpath/scope, strict tenant negative suite, keyed audit/export, rate-rule wire ve OIDC/SCIM lifecycle'dır; her biri tenant-scoped flag ile rollbackable, Enterprise Preview'da fail-closed olmalıdır (`docs/adr/adr-g-031-enterprise-foundation.md:60-83`).

## A6 — Güvenlik ve publish hazırlığı

### Özet

Release workflow tek npm publish otoritesidir; version/tag/registry check, required CI/xplat attestation, audit ve OIDC trusted publish adımları source'ta vardır (`.github/workflows/release.yml:1-10,77-173,238-266`). Paket versiyonu, lock ve changelog `1.0.0-beta.1` ile uyumludur (`package.json:1-3`; `package-lock.json:1-3`; `CHANGELOG.md:13`). Buna karşın bugünkü `validate:publish` exit 1 olduğundan teknik yayın şartı sağlanmıyor (K6); Desktop onayı, born-666 kararı ve npmjs trusted-publisher external ayarı da SSOT'de açık şarttır (`docs/MASTER-PLAN.md:70,78,96`). “RC 6/6 bitti” tarihsel teslim iddiası ile “şimdi publish edilebilir” iddiası aynı değildir.

### Kanıt-tabanlı analiz

| Bulgu | Şiddet | Kanıt | Tek-cümle fix |
|---|---|---|---|
| `validate:publish` bugün kırmızı | **BLOCKER** | K6; `package.json:59-66` | Gate'in pack parser/critical-files/category hatasını temiz working tree + clean build artefact'ında yeniden üretip fail reason/summary'yi tek sonuçtan üret. |
| Desktop product approval yok | **BLOCKER** | `docs/MASTER-PLAN.md:70-71` | D2-D4 parity acceptance'ı Alperen imzalı executable release attestation yap. |
| born-666/561 external-call consent kararı açık | **BLOCKER** | `.analysis/born-backlog.json:2933-2940`; `docs/MASTER-PLAN.md:96` | Install-time network behavior'ı explicit consent + offline/no-network negative test ile kapat. |
| npmjs trusted-publisher external setup bekliyor | **BLOCKER** | `docs/MASTER-PLAN.md:78`; workflow OIDC `.github/workflows/release.yml:238-252` | npmjs publisher binding'i yapıp dry-run provenance receipt'ini release artefact'ına bağla. |
| Gate özeti alt bulguyla çelişiyor | **MAJOR** | K6 | Summary'yi aynı typed result collection'dan türet ve mismatch'i testte fail et. |
| `prepublishOnly` yalnız `build`, `build:all+validate` değil | **MAJOR** | `package.json:23-36,59-66` | Manual publish'i de canonical `release`/validate zincirine fail-closed bağla. |
| Desktop ayrı signed artifact henüz Phase 4 | **MAJOR** | `src/desktop/package.json:1-22`; auto-update stub `src/desktop/src/main/auto-update.ts:1-18` | macOS/Linux/Win-native/WSL packaging, signing, update, rollback ve SBOM matrisi olmadan Desktop “bitti” deme. |
| WSL release leg'i açık kanıtlı değil | **MAJOR** | Xplat workflow Ubuntu/macOS/Windows tanımlar (`.github/workflows/cross-platform-e2e.yml:65-88`); WSL leg'i **DOĞRULANAMADI** | Windows-native ve WSL'i ayrı required attestation legs yap. |
| Required xplat matrix flake ailesi | **MAJOR** | Win npm-install ve Ubuntu/tmux docs-only commitlerde düşüp rerun'da geçmiş; born-686 açık (`.analysis/born-backlog.json:3131-3137`) | Required status'u gevşetmeden step-level bounded retry, timeout/cache ve failure artifact + flake-rate ölçümü ekle. |
| RunFlow SSE auth allowlist eksik | **MAJOR** | Dynamic RunFlow SSE path'i var, query-token allowlist'te yok (`src/api/run-flow-event-stream.ts:1-34`; `src/api/server.ts:1871-1893`) | `/api/run-flow/` prefix'ini tenant/flow authorization ve negative HTTP testleriyle explicit query-token policy'ye bağla. |

Package contract kağıt üzerinde tutarlıdır: bin'ler `dist/cli/entry.js` ve `dist/mcp/server.js`, exports root ve `./sdk`, `files` dist/bin/assets/README/LICENSE, Node engine `>=24` (`package.json:6-20,94-117`). Fakat K6'nın “critical files absent” sonucu nedeniyle bugünkü tarball'ın bu contract'ı taşıdığı söylenemez. `npm pack` zihniyetiyle tek gerçek, validator'ın kırmızı olmasıdır.

### Counterfactual release stratejileri — sabit publish şartları yeniden açılmaz

| Seçenek | Artı | Eksi | NO-GO |
|---|---|---|---|
| A — Gate'i bypass edip beta publish | Takvim korunur | Release authority anlamsızlaşır; supply-chain güveni kırılır | K6 exit 1 iken kesin NO-GO. |
| B — Yalnız pack hatasını kapat, Desktop/consent'i release note'a bırak | npm artifact çıkar | Explicit Alperen şartını ve güvenlik kararını ihlal eder | Desktop approval/born-666 açıkken NO-GO. |
| C — Dört blocker'ı executable attestation'a çevir, sonra tag publish | Dürüst ve tekrarlanabilir | External npm ayarı ve Desktop acceptance beklenir | Attestation aynı commit/tarball digest'i pinlemiyorsa NO-GO. |

**Net öneri:** Sabit publish şartları nedeniyle C tek admissible stratejidir; A/B yalnız neden NO-GO olduklarını görünür kılar. Release tarihi değil, aynı digest üzerinde `build:all → validate:publish → xplat/WSL → security → Desktop acceptance → OIDC provenance` receipt zinciri karar versin (`.github/workflows/release.yml:115-173,238-266`).

## A7 — Trace ve eğitim verisi: SP-2'ye gerçekten hazır mı?

### Özet

Trace-v2, system/user prompt ve native tool-call eşleşmesini legacy-v1'e göre belirgin biçimde düzeltmiştir; 73 v2 kayıtta orphan tool result sıfırdır (K11; `src/core/trace-schema.ts:185-269`). EVALUATE production wire gerçek prompt/verdict ile kayıt yazar (`src/orchestra/sprint-phases.ts:2188-2224`). Ancak segment store production caller'sız, capture completeness quarantine'a taşınmıyor, FIX trajectory live proof'u yok ve mevcut pipeline 47 problemli v1 dahil 120/120 kaydı training corpus'a alıyor (`src/agent/trace-recorder.ts:320-375`; `src/training/pipeline.ts:304-362`; K12). Sonuç: trace toplama GO; SP-2 production training dataset'i NO-GO.

### Bugünkü ölçüm ve yük

| Metric | Bugün | Yorum |
|---|---:|---|
| Monolith boyutu | 58.584.247 byte | 120 record için yüksek I/O/parse yükü; kaynak `.deckent/traces/sprint-worker.jsonl:1-120` (K11). |
| v1 / v2 | 47 / 73 | Corpus schema karışık (K11). |
| Message | 28.599 | Tool/telemetry yoğunluğu yüksek (K11). |
| Native tool call | 3.609 | v2'daki structured action sinyali (K11). |
| Legacy orphan | 2.399 | Tamamı v1 sınıfında (K11). |
| Quarantine | 0 | Completeness kanıtı değildir; schema reason set'i capture-incomplete içermez (`src/core/trace-schema.ts:195-208,251-269`). |
| Pipeline accepted | 120/120 | v1 de eğitime giriyor; 120/120 truncated (K12). |
| Segment files | **DOĞRULANAMADI** | `appendTraceSegment` production caller'sız; writer monolith'e yazar (`src/agent/trace-recorder.ts:320-375`; `src/orchestra/output-collector.ts:61-68`). |

Docker capture 1MiB yolunu async stream, 256MiB ceiling ve timeout ile değiştirmiştir (`src/orchestra/spawn-backend-docker.ts:1096-1125,1186-1294`). Buna rağmen production consumer `capture.content` alıp `captureIncomplete` bilgisini trace meta'ya taşımıyor (`src/orchestra/spawn-backend-docker.ts:2491-2522`). FIX source'u `purpose/attempt/retryOf/verdict` üretir, fakat 120 canlı kaydın hiçbirinde bu alanlar yoktur; canlı NO_GO→FIX trajectory **DOĞRULANAMADI** (`src/orchestra/sprint-phases.ts:2482-2529`; K11).

### Seçenekler ve trade-off

| Seçenek | Artı | Eksi | NO-GO |
|---|---|---|---|
| A — 120 kaydı şimdi SP-2 train'e ver | Hızlı deney | v1 orphan, truncation ve provenance contamination | Production model training için kesin NO-GO. |
| B — Yalnız v2 filter ile pilot eval | Temizliğe hızlı yaklaşım | Segment/stable ID/completeness/FIX eksik | Analiz dışında model promotion yapılırsa NO-GO. |
| C — Monolith dual-read + segment dual-write; provenance/quarantine gate; kontrollü FIX corpus | Enterprise dataset lineage ve replay | Storage migration/manifest işi | Stable ID, duplicate detection, capture completeness ve provider/model receipt olmadan train NO-GO. |

**Net öneri:** C. SP-2 yalnız `v2 && !quarantine && complete-envelope && valid-tool-graph && stable-id && provider-receipt` dataset manifest'i imzalandığında açılmalıdır (`docs/MASTER-PLAN.md:87-100,155`).

## A8 — Provider katmanı: mixed-fleet iddiasının ground truth'u

### Özet

Provider adapter abstraction ve model equivalence gerçek mimaridir (`docs/adr/adr-g-008-provider-abstraction-fleet-usage.md:15-60`; `src/core/model-equivalence.ts:61-119`). Fakat dogfood config'te grouped `providers.brain=claude/worker=claude`, flat duplicate'te `brain_provider=codex` vardır; loader grouped değer varken flat'i siler (`.deckent/config.json:36-39,384-385`; `src/core/config-migration.ts:615-649`). Gerçek binary de brain/worker effective provider'ı Claude/Claude döndürür (K10); 430/431'in sekiz worker artefact'ı Claude/Sonnet'tir (`.brain/archive/sprints/sprint-430-tasks/task-430-001.json:5,31,97`; `.brain/archive/sprints/sprint-431-tasks/task-431-004.json:5,36,106`). “Brain=Codex/Sol + worker=Claude/Sonnet bugün canlı” premise'i bu nedenle yanlış; gerçek Brain invocation receipt'i ise **DOĞRULANAMADI**.

### Kanıt-tabanlı analiz

- Type contract grouped provider'ın precedence'ını söyler; `loadConfig` merge öncesi duplicate temizler ve grouped değerleri runtime flat alanlara projekte eder (`src/core/config-types.ts:565-571`; `src/core/config.ts:1617-1622,1646-1654`).
- Performance brain model `gpt-5.6-sol` iken provider Claude'dur (K10). Sol registry'de Codex premium modelidir; target provider Claude ise equivalence `opus`a map edebilir (`src/core/model-registry.ts:250-276`; `src/orchestra/model-selector.ts:224-237`; `src/core/model-equivalence.ts:100-119`). Gerçek Brain çağrısında hangi modelin seçildiği receipt olmadığı için **DOĞRULANAMADI**.
- Dogfood `brain_planning=structured` normal sprint planner'ın AI dalına girmemesine yol açar (`.deckent/config.json:7-10`; `src/orchestra/sprint-planner.ts:261-265,310-335`). Bu durumda “Brain provider” config'i ile “bu run'da AI Brain çağrıldı” aynı metrik değildir.
- RunFlow terminal/API compiler call-site'ları resolved config'i geçirmez; compiler balanced fallback `sonnet` kullanır (`src/cli/repl/run-flow-controller.ts:199-203`; `src/api/run-flow-routes.ts:218-225`; `src/orchestra/run-proposal-compiler.ts:96-105`).
- FIX spawn executor model/provider/backend inheritance'ı resolution öncesi uygular; source guarantee vardır, fakat mixed-provider failure→FIX live receipt'i **DOĞRULANAMADI** (`src/orchestra/scheduler-effects.ts:249-277`).

### Seçenekler ve trade-off

| Seçenek | Artı | Eksi | NO-GO |
|---|---|---|---|
| A — Flat key'i canonical yap | Beklenen Codex değeri görünür | Mevcut type/migration/test kontratını bozar | Grouped precedence sürerken NO-GO. |
| B — Grouped canonical + duplicate fail-loud + invocation receipt | Tek truth; requested/effective/fallback görünür | Config migration ve eski project compatibility gerekir | Silent duplicate veya receipt'siz fallback kalırsa NO-GO. |
| C — Homogeneous Claude fleet'i resmileştir | Bugünkü gerçekliğe yakın | Provider-first/mixed-fleet hedefini terk eder; lock-in | North Star provider-first hedefi nedeniyle stratejik NO-GO (`docs/MASTER-PLAN.md:31`). |

**Net öneri:** B. Önce canonical config conflict'i kapat, sonra aynı gerçek sprintte Codex Brain receipt + Claude worker receipt ve failure→FIX inheritance receipt üret; bu kanıt olmadan “mixed-fleet canlı” deme.

## İddia–kod–runtime çelişkileri

| İddia | Çelişki | Karar etkisi |
|---|---|---|
| “511 correlated result tamam” | Completion record'da `flowId` yok; composition test elle inject ediyor (`.deckent/runtime/jobs/sprint-430.json:97-129`; `tests/cli/term-flow-composition.test.ts:249-305`) | 511 front-door kabulünü koru; correlation'ı D-P0 proof gap say. |
| “Scheduler reducer engine yürüdü” | 430/431 journal 356 tick `executedEngine=unknown` (`.deckent/runtime/scheduler-shadow/sprint-430.jsonl:1-189`; `src/orchestra/result-collector.ts:1542-1548`) | Default flip yok. |
| “RC train tamam / publish hazır” | Bugünkü validator exit 1 (K6; `docs/MASTER-PLAN.md:78`) | Tarihsel delivery ile current release readiness ayrılmalı. |
| “Desktop consumer surface hazır” | API surface var; Desktop RunFlow consumer yok (`src/api/run-flow-routes.ts:20-40`; `src/desktop/src/shared/desktop-api.ts:62-91`) | API hazır ≠ Desktop hazır. |
| “Dashboard monitoring-only” | Kill/cleanup/plan/start/directives write UI'ları mevcut (`src/dashboard/src/components/SprintControlPanel.tsx:45-85`; `src/dashboard/src/components/NewSprintModal.tsx:52-80`) | Authority cutover gerekir. |
| “Mixed Brain Codex / worker Claude canlı” | Effective config Claude/Claude, worker artefact Claude/Sonnet (K10-K11) | Fleet truth önce düzeltilmeli. |
| “Trace segment DONE” | Segment append production caller'sız; writer monolith (`src/agent/trace-recorder.ts:320-375`; `src/orchestra/output-collector.ts:61-68`) | Delivery source-level, production-wire değil. |
| “8-faz state machine” | Sekiz procedural stage var; enum birebir sekiz state değil (`src/core/sprint-types.ts:8-19`) | Terminoloji düzeltilmeli; davranış yeniden yazılmamalı. |
| `status --json` JSON verir | No-active branch JSON guard'ını atlıyor (`src/cli/commands/status.ts:407-431`; K3) | Surface contract regression. |
| `DECKENT.md` “DONE ∪ MRR dependency-satisfying” der | Runtime SSOT yalnız DONE satisfying, MRR terminal-non-satisfying der (`DECKENT.md:52-55`; `src/orchestra/scheduler-truth.ts:1-17,24-53`) | Doküman güncellenmeli; restore/runtime semantiği değiştirilmemeli. |

---

# B — “Hayaldeki Tamamlanmış Deckent” Tanımı

## Yönetici özeti

“Bitti”, backlog'un sıfırlanması değil; North Star'ın dört mercekte yazılı, ölçülebilir service-level contract'a dönüşmesidir (`docs/MASTER-PLAN.md:20-39`; `docs/vision/VISION.md:7-21`). Teknik mercekte aynı orchestration truth'u her OS/surface/tenant'ta deterministik ve replayable çalışmalı; UX merceğinde Terminal tam-control+yormayan, Desktop chat+console+approval ürünü olmalıdır (`docs/adr/adr-g-034-native-agentic-terminal.md:17-69`; `.analysis/desk2-blueprint-2026-07-10.md:6-42`). Kullanıcı merceğinde install→ilk kanıtlı değer ve günlük geliştirme loop'u komut ezberi gerektirmemeli; enterprise merceğinde governance-depth hard-enforce ve evidence-grade olmalıdır (`docs/adr/adr-g-016-product-vision.md:47-68`; `docs/adr/adr-g-031-enterprise-foundation.md:60-83`). SP-2, Hub/agentic-OS, ERP ve altı dil bu tanımın genişleme katmanlarıdır; core correctness ve surface parity'nin yerine geçmez (`docs/MASTER-PLAN.md:31,155,237-258`).

## Yazılı “bitti” kriterleri — kanıt tablosu

| ID | Mercek | “Bitti” kriteri | Kaynak dayanağı | Kabul kanıtı |
|---|---|---|---|---|
| T1 | Teknik | Bir `RunProposal`/scheduler/lifecycle truth'u; Terminal, Desktop, API/MCP yalnız adapter | Terminal hybrid karar (`docs/MASTER-PLAN.md:79`); surface parity ilkesi (`docs/adr/adr-g-011-surface-parity-thin-wrapper.md:17-55`) | Aynı `flowId/revision/digest` iki surface'te görülür; duplicate start sıfır; event replay deterministic. |
| T2 | Teknik | macOS, Linux, Windows-native, WSL'de packaged install/run/upgrade/rollback; unsupported capability fail-honest | Every-environment yasağı ve North Star (`docs/MASTER-PLAN.md:20-31`); mevcut three-OS gate (`.github/workflows/cross-platform-e2e.yml:65-88`) | Her OS leg required; WSL ayrı; failure contract/exit-code snapshot'ı. |
| T3 | Teknik | Multi-process/multi-instance durable state, tenant-partition, bounded backpressure ve million-scale load model | Tenant/scope kararları (`docs/adr/adr-g-017-multi-project-isolation.md:28-87`); event-stream açıkları (`docs/adr/adr-g-018-verification-protocol-event-stream.md:23-96`) | Restart/replay, concurrent CAS, cross-tenant negative ve load/SLO receipts. |
| T4 | Teknik | Provider-first mixed fleet; requested/effective/fallback receipt; model literal yalnız registry/config SSOT | Provider ADR (`docs/adr/adr-g-008-provider-abstraction-fleet-usage.md:15-60`); zero-hardcode ADR (`docs/adr/adr-g-036-zero-hardcode-model-flow.md:28-60`) | En az Codex+Claude aynı run; failover/fix inheritance; literal ratchet sıfıra yaklaşır ve yeni ihlal sıfır. |
| T5 | Teknik | SP-2 için lineage'lı, consent/redaction/completeness-gated dataset; model promotion eval-gated | Trace program ve SP-2 pause (`docs/MASTER-PLAN.md:84-100,155`) | Signed dataset manifest, contamination=0, held-out eval/regression/cost gates, rollbackable model registry. |
| T6 | Teknik | Core offline/air-gap: required network sıfır; bounded exceptions explicit consent + bundled fallback | Product invariant (`docs/adr/adr-g-016-product-vision.md:25-33,63`); born-666 (`docs/MASTER-PLAN.md:96`) | Network-disabled install/init/run/retro succeeds or precise unsupported error; packet-level deny test. |
| U1 | UX | Terminal “tam kontrol + yormayan”: intent→preview→risk→approval→live status→correlated result, progressive disclosure | Terminal contract (`docs/adr/adr-g-034-native-agentic-terminal.md:17-69`); North Star (`docs/MASTER-PLAN.md:20-31`) | Bir gerçek repo işi serbest NL ile, CLI alt-komutu elle yazmadan; interruption/resume/multi-flow/approval E2E. |
| U2 | UX | Desktop bir dashboard wrapper değil: Chat+Console+Approval+History/Retro, aynı flow truth | Desktop blueprint (`.analysis/desk2-blueprint-2026-07-10.md:6-42`); shell kararı (`.analysis/desktop-shell-research-2026-07-08.md:57-105`) | Signed packaged app'ta aynı gerçek işi başlat/izle/onayla/bitir; Terminal ile cross-surface handoff. |
| U3 | UX | Tutarlı design system, accessibility, keyboard/screen-reader, responsive states; user-facing hardcode sıfır | Zero-hardcode/i18n ratchet (`docs/adr/adr-g-036-zero-hardcode-model-flow.md:28-60`); blueprint persona/i18n ekseni (`.analysis/desk2-blueprint-2026-07-10.md:33-45`) | Visual/a11y regression, contrast/keyboard tests, literal lint, localization completeness. |
| U4 | UX | Altı dilde aynı semantic contract; locale yalnız string değil date/number/plural/error/help | Altı dil North Star (`docs/MASTER-PLAN.md:31`); bugün message map TR/EN (`src/cli/helpers/messages.ts:3-24`) | Altı locale bundle %100 required-key coverage; per-locale real-binary golden journeys. |
| P1 | Kullanıcı | Solo developer: clean foreign repo'da install→init→auth/provider→ilk DONE run ölçülür ve fail-honest | Provisioning consent (`docs/adr/adr-g-030-consent-based-provisioning.md:17-61`); transactional-init train (`docs/MASTER-PLAN.md:78`) | Median/P95 time-to-first-DONE, abort/retry/recovery, Docker/auth-yok negative journeys. |
| P2 | Kullanıcı | Günlük loop: born/goal aç, planı anla, çalıştır, canlı izle, onayla, diff/kanıt incele, retro/recall yap | TERM-DEV-LOOP kabulü (`docs/MASTER-PLAN.md:46,79`) | Terminal ve Desktop'ta aynı five-real-task dogfood suite. |
| P3 | Kullanıcı | Power-user: multiple flows, provider/model/cost controls, replay/recover, CLI/MCP/SDK automation | API/SDK parity hedefi (`docs/adr/adr-g-011-surface-parity-thin-wrapper.md:17-55`); provider-first yönü (`docs/MASTER-PLAN.md:31`) | Concurrency/recovery/cost budgets; stable JSON/event/version contracts. |
| P4 | Kullanıcı | Team: shared project truth, handoffs, approvals, roles ve audit; state iki surface'te senkron | Authority two-surface modeli (`docs/adr/adr-g-020-authority-roles-flow-enforcement.md:57-114`); multi-tenant foundation (`docs/adr/adr-g-031-enterprise-foundation.md:17-56`) | İki kullanıcı/iki rol/iki surface E2E; stale approval/lease/ownership negative tests. |
| E1 | Enterprise | Tenant/RBAC/scope/capability hard-enforce; fail-closed ve least-privilege | ADR-G-020 post-GA hard flip (`docs/adr/adr-g-020-authority-roles-flow-enforcement.md:123-138`) | Cross-tenant read/write/execute attack suite 0 escape; no-role deny. |
| E2 | Enterprise | Evidence-grade append-only audit, external key management, signed export/retention/legal hold | Gap map (`docs/adr/adr-g-031-enterprise-foundation.md:60-83`) | Tamper/delete/reorder tests fail; export independently verifies; retention policy receipt. |
| E3 | Enterprise | OIDC/SCIM lifecycle, JIT/deprovision/group-role mapping; multi-IdP | OIDC/SCIM substrate (`docs/adr/adr-g-031-enterprise-foundation.md:17-56`) | Real IdP contract suite; deprovisioned user immediately loses live session/capability. |
| E4 | Enterprise | Air-gap/BYO/local deployment, signed artifacts/SBOM/provenance, upgrade/DR | Local-first invariant (`docs/adr/adr-g-016-product-vision.md:25-33`); release chain (`.github/workflows/release.yml:115-173,238-266`) | Offline install/upgrade/restore drill; SBOM/provenance verification; RPO/RTO receipt. |
| E5 | Enterprise | Community=all base features MIT; paid boundary yalnız governance/audit/management depth | MOD-SPLIT (`docs/adr/adr-g-016-product-vision.md:31-68`) | Package/license matrix CI; community journey paywall'sız; enterprise SKU claim map. |

## B1 — Teknik bitiş resmi

Tamamlanmış core, scheduler/RunFlow/event/memory'nin ayrı ayrı “iyi modüller” olması değil, kararların tek typed state transition ve replayable event/audit receipt üretmesidir; bugün event sequence'in multi-process atomic olmadığı kabul edilmiştir (`docs/adr/adr-g-018-verification-protocol-event-stream.md:23-96`). DB-first memory korunur: Markdown export view, SQLite/FTS source of truth; completed state'te tenant scope, retention/decay, provenance ve local vector path aynı contract'ın parçasıdır (`docs/adr/adr-g-035-memory-architecture.md:17-75`). Offline, core'da network çağrısının yokluğu; marketplace/model catalog/provider gibi bounded exceptions'ta explicit intent, cache/fallback ve deny-network testidir (`docs/adr/adr-g-016-product-vision.md:25-33,63`). SP-2 “kendi modelimiz var” rozeti değil; trace lineage, held-out evaluation, rollback ve cost/quality dominance kanıtıdır (`docs/MASTER-PLAN.md:155`).

## B2 — Tasarım/UX bitiş resmi

Terminal'ın full-control kısmı bütün state ve risk ayrıntısına erişim; yormayan kısmı ise progressive disclosure, sensible defaults, interruption-safe resume ve bir sonraki doğru eylemin görünür olmasıdır (`docs/adr/adr-g-034-native-agentic-terminal.md:17-69`). Desktop Chat doğal-dil intent, Console structured plan/run, Approval risk/authority ve History/Retro evidence yüzeylerini aynı coordinator projection'ı olarak sunmalıdır (`.analysis/desk2-blueprint-2026-07-10.md:6-26`). Dashboard bu üçlünün üçüncü controller'ı değil, observability wall'ıdır (`docs/adr/adr-g-033-dashboard-observability.md:74-94`). Altı dil hedefi yalnız message key sayısı değil, her state/error/risk/help semantiğinin locale-independent typed code'dan render edilmesidir; bugün ana message map'in görülen contract'ı TR/EN'dir (`src/cli/helpers/messages.ts:3-24`; `docs/MASTER-PLAN.md:31`).

## B3 — Kullanıcı bitiş resmi

Solo user için başarı “init exit 0” değil, yabancı repoda ilk doğrulanmış DONE outcome'a ulaşmaktır; setup incomplete ve failed ayrı, dürüst recoverable state olmalıdır (`docs/MASTER-PLAN.md:78`). Power-user için CLI/MCP/SDK kaybolmaz; Terminal/Desktop'ın arkasındaki versioned contracts'i otomasyonda kullanır (`docs/adr/adr-g-011-surface-parity-thin-wrapper.md:17-55`). Team için aynı flow'u farklı kullanıcı/surface görebilmeli, ownership/lease/approval stale olmamalı ve her transition actor/tenant/revision ile audit edilmelidir (`docs/adr/adr-g-020-authority-roles-flow-enforcement.md:57-114`). Bu üç journey'nin her biri dogfood ve foreign-repo acceptance suite olmalıdır; source unit test tek başına yeterli değildir (`docs/adr/adr-g-009-evaluation-integrity.md:17-48`).

## B4 — Enterprise bitiş resmi

Enterprise “community özelliklerini açan lisans” değildir; aynı full-feature core üzerinde hard isolation, governance, audit, identity, management ve assurance derinliğidir (`docs/adr/adr-g-016-product-vision.md:47-68`). Bitiş halinde no-role fail-closed, tenantless query yasak, path/capability semantics tek enforcer, audit external key ve export verification, SCIM/OIDC full lifecycle ve air-gap deployment/DR birlikte kanıtlanmalıdır (`docs/adr/adr-g-031-enterprise-foundation.md:60-83`). Community GA ve Enterprise GA'nın readiness scorecard'ı bu nedenle ayrı olabilir; feature code fork'u olmamalıdır (`docs/adr/adr-g-031-enterprise-foundation.md:3-7`). Fiyat rakamı için repo kanıtı bulunmadı: kesin fiyat **DOĞRULANAMADI**; karar yalnız “all base features free, governance-depth paid” ilkesine bağlanabilir (`docs/adr/adr-g-016-product-vision.md:31-68`).

## Tamamlanmışlık mimarisi için seçenekler

| Seçenek | Artı | Eksi | NO-GO | Tavsiye |
|---|---|---|---|---|
| A — Feature-count completion | Kolay anlatılır | Wiring/user-proof/assurance ayrımını gizler | “Dosya var” başarı sayılırsa NO-GO | Reddedildi. |
| B — Surface bazlı ayrı roadmap | Her ekip kendi hızında | İkinci implementation ve parity drift üretir | Terminal/Desktop farklı flow truth kullanırsa NO-GO | Reddedildi. |
| C — Capability contract + evidence ladder: source→composition→binary→cross-surface→cross-platform→scale/security | Her “bitti” iddiası ölçülebilir; dört merceği bağlar | Acceptance altyapısı pahalıdır | Bir gate mock-only veya manual lore'a dayanırsa NO-GO | **Önerilen.** |

**Net öneri:** “Tamamlanmış Deckent” C evidence ladder'ıyla yönetilsin; MASTER durum sütunu delivery'yi, ayrı readiness scorecard ise runtime/product/assurance kanıtını göstersin. Böylece MASTER'daki “DONE source ama production caller yok” sınıfı (ör. trace segment) görünür kalır (`docs/MASTER-PLAN.md:92`; `src/agent/trace-recorder.ts:320-375`).

---

# C — Gap Matrisi

## Yönetici özeti

En büyük boşluk “özellik yokluğu” değil, mevcut güçlü parçaların tek durable truth ve executable acceptance etrafında kapanmamasıdır. En kısa stratejik yol, RunFlow coordinator/correlation, scheduler effect parity/receipt, publish truth, provider truth ve trace lineage'i önce kapatıp Desktop'ı bu ortak çekirdeğin ilk full consumer'ı yapmaktır (`docs/MASTER-PLAN.md:70,79,92,99-100`). Enterprise hardening, SP-2 ve Hub bu temel receipts üzerine çıkmalıdır; aksi sıra yeni surface/scale borcunu büyütür (`docs/adr/adr-g-031-enterprise-foundation.md:60-83`; `docs/MASTER-PLAN.md:155,252`). Zorluk S/M/L kodu takvim tahmini değil, cross-cutting state/migration/assurance alanıdır.

## Kanıt tablosu / kriter × gerçek durum

| Kriter | Bugün — kanıt | Boşluk | Zorluk | Üstüne inşa edilecek parça |
|---|---|---|---|---|
| T1 tek orchestration truth | RunFlow typed/reducer var; completion flowId yok; scheduler closure/effects dışarıda (`src/core/run-flow-contract.ts:23-151`; `src/orchestra/result-collector.ts:1610-1611,1749-1751`) | Durable coordinator, correlation, replay, scheduler retirement | L | RunFlow reducer/store + scheduler driver/journal. |
| T2 every-environment | Linux binary açılıyor K1; release matrix Ubuntu/macOS/Windows (`.github/workflows/cross-platform-e2e.yml:65-88`) | WSL ayrı leg; Desktop signed install/update/rollback; capability fail-honest | L | RC xplat smoke + daemon shell. |
| T3 scale/durability | Event/SSE ve tenant context var; RunFlow Map process-local, SSE replay'siz (`src/api/run-flow-routes.ts:35-40,101-116`; `src/api/run-flow-event-stream.ts:59-95`) | Durable event log, CAS, backpressure, HA/DR/load model | L | Core event-stream + run-flow store. |
| T4 provider-first | Four-provider abstraction var; effective dogfood Claude/Claude (K10; `docs/adr/adr-g-008-provider-abstraction-fleet-usage.md:15-60`) | Canonical config, receipt, failover/mixed proof | M | Provider registry/equivalence + model resolver. |
| T5 SP-2 dataset | 73 v2, 47 v1; EVALUATE wired (K11; `src/orchestra/sprint-phases.ts:2188-2224`) | Segment production wire, completeness, FIX lineage, eval/promotion gate | L | Trace-v2 schema + segment API + pipeline. |
| T6 offline/air-gap | Offline catalog fallback politikası var; init `--yes` install açığı açık (`docs/adr/adr-g-016-product-vision.md:25-33`; `docs/MASTER-PLAN.md:96`) | End-to-end deny-network suite, consent decision, bundled dependencies | M | SEC-04 catalog policy + transactional init. |
| U1 Terminal full-control+yormayan | Real `deckent do` 4/4 DONE (`docs/MASTER-PLAN.md:46`) | REPL free-NL parity, multi-flow, live approval, correlation, discoverability/status JSON | L | Native REPL card/controller/watcher. |
| U2 Desktop product | Thin shell daemon + 50 tests (K8; `src/desktop/src/main/daemon-lifecycle.ts:124-197`) | Console/Chat/Approval/History RunFlow consumer, signed E2E | L | Thin shell + blueprint + API facade. |
| U3 design/a11y/hardcode | i18n/model ratchets yeşil K4-K5 | Design token/a11y/visual acceptance; 85 model literal migration | M | Desktop blueprint, lint gates, shared renderer contracts. |
| U4 six languages | North Star six; ana map TR/EN (`docs/MASTER-PLAN.md:31`; `src/cli/helpers/messages.ts:3-24`) | Dört locale, plural/date/number semantics, per-locale binary tests | L | `getMessage` architecture + i18n lint. |
| P1 onboarding/first value | Transactional init train delivered; current binary host dependency snapshot K1 (`docs/MASTER-PLAN.md:78`) | TTFirstDONE telemetry-local, Docker/auth/Windows/WSL recover journeys, born-666 | M | Init outcomes + doctor + xplat packed smoke. |
| P2 daily dogfood loop | `do` real acceptance exists (`docs/MASTER-PLAN.md:46`) | born/retro/diff/approval parity in both surfaces | L | RunFlow + Brain finalizer/retro + Desktop Console. |
| P3 power-user | 70 CLI/47 MCP, SDK export var (K4; `package.json:12-20`) | Stable JSON; status bug; flow list/replay/cancel/resume; cost receipt | M | CLI registry, API/SDK, coordinator. |
| P4 team | Tenant/authority primitives var (`src/core/tenant-context.ts:12-93`; `src/nervous/authority-matrix.ts:303-378`) | Ownership/lease, stale approval expiry born-679, multi-user cross-surface E2E | L | ApprovalBroker + tenant context + durable events. |
| E1 hard governance | Advisory/conditional matrix (`docs/adr/adr-g-020-authority-roles-flow-enforcement.md:123-138`) | No-role deny, strict tenant default/required, unified realpath/capability | L | Authority enforcer + RBAC + tenant store. |
| E2 evidence-grade audit | HMAC writer var, literal secret/fail-soft (`src/core/audit-writer.ts:23-95,149-203`) | KMS/HSM keying, fail-closed policies, signed verified export/legal hold | L | Audit chain/query/export. |
| E3 OIDC/SCIM | Adapters var (`src/connectors/identity/providers/scim.ts:65-180`; `src/core/auth-oidc.ts:187-260`) | Production lifecycle wire, group mapping, deprovision/session revoke | L | Identity adapters + connector bootstrap. |
| E4 air-gap/supply chain | Release OIDC/xplat/attestation source'u var (`.github/workflows/release.yml:115-173,238-266`) | Current validator kırmızı K6; WSL/Desktop/SBOM/DR | L | Release authority + offline policy + signed Desktop. |
| E5 community/pro split | Written governance-depth boundary var (`docs/adr/adr-g-016-product-vision.md:31-68`) | Executable license/package taxonomy, SKU/claim map; fiyat DOĞRULANAMADI | M | Single codebase + feature manifest. |

## Gap kümeleri ve bağımlılık yorumu

1. **Truth gap:** RunFlow, scheduler, provider config, trace store ve learning promotion'da “source var ama execution receipt eksik” aynı pattern'dir (`src/orchestra/result-collector.ts:1542-1548`; `src/agent/trace-recorder.ts:320-375`; `src/orchestra/sprint-finalizer.ts:1598-1604`). Bu pattern kapanmadan yeni surface sayısı artırmak drift'i çoğaltır.
2. **Surface gap:** Terminal gerçek işi başlatabildi; Desktop yalnız shell; Dashboard fazla yetkili (`docs/MASTER-PLAN.md:46,71`; `src/dashboard/src/components/SprintControlPanel.tsx:45-85`). Ortak coordinator bu üç problemi tek kararla küçültür.
3. **Assurance gap:** Lint/unit green ile user journey/security assurance aynı readiness gibi raporlanıyor; K4/K8/K9 green iken K3/K6 gerçek contract'ları kırmızıdır. Evidence ladder ayrı tutulmalıdır (`docs/adr/adr-g-009-evaluation-integrity.md:17-48`).
4. **Scale gap:** Process-local Map, non-atomic sequence ve replay'siz SSE tek-host dogfood'da çalışabilir, multi-instance/million-scale contract değildir (`src/api/run-flow-routes.ts:35-40,101-116`; `docs/adr/adr-g-018-verification-protocol-event-stream.md:83-96`).

## Kimsenin sormadığı sorular

| Soru | Neden şimdi sorulmalı? | Kanıt / bilinmeyen |
|---|---|---|
| Aynı flow Terminal'da approve edilirken Desktop'ta stale revision gösterirse hangi surface kazanır? | Cross-surface ürünün correctness merkezi budur | CAS/revision contract var, durable multi-surface coordinator yok (`src/core/run-flow-contract.ts:57-100`; `src/cli/repl/run-flow-controller.ts:22-27`). |
| Daemon restart ile SSE sequence ve pending approval arasında gap oluşursa replay nereden gelir? | Approval kaybı güvenlik/UX olayıdır | RunFlow SSE replay'siz (`src/api/run-flow-event-stream.ts:59-95`); born-679 cross-process expiry açık (`.analysis/born-backlog.json:3064-3070`). |
| “DONE” quality metriği Coverage `NaN%` iken model learning neyi optimize ediyor? | Closed loop yanlış sinyali ölçekleyebilir | 430/431 raporları NaN; GWTD full-success ve first-task DNA sorunu (`.brain/sprints/sprint-430.md:3-12`; `src/orchestra/outcome-tracker.ts:34-38,135-158`). |
| RunFlow digest plan içeriğini pinlerken gate findings API/Terminal'da farklıysa karar aynı mı? | Approval aynı snapshot üzerinde görünmelidir | Terminal gate findings render; API preview omit (`src/cli/repl/run-flow-controller.ts:207-216`; `src/api/run-flow-routes.ts:218-235`). |
| Provider fallback başarılı olsa bile maliyet/data-residency policy ihlal ederse “başarı” mı? | Enterprise policy yalnız availability değildir | Equivalence/fallback var, invocation policy receipt **DOĞRULANAMADI** (`src/core/model-equivalence.ts:61-119`; `docs/adr/adr-g-008-provider-abstraction-fleet-usage.md:46-60`). |
| Training corpus'ta silme/retention talebi stable ID üzerinden model lineage'e kadar taşınacak mı? | GDPR/enterprise evidence ve model unlearning etkisi | Segment/stable-ID API source'ta; production wire yok (`src/agent/trace-recorder.ts:320-375`). |
| Community core “never phone home” iken Desktop auto-update/model catalog/marketplace hangi consent ledger'ını paylaşacak? | Üç ayrı network exception yeni güvenlik yüzeyi yaratır | Core invariant bounded exceptions tanımlar; Desktop update stub (`docs/adr/adr-g-016-product-vision.md:25-33,63`; `src/desktop/src/main/auto-update.ts:1-18`). |
| Node `>=24` ve native modules enterprise LTS/support politikasını nasıl etkiler? | Install success ve signed Desktop ABI birlikte yönetilmelidir | Engine ve `better-sqlite3/node-pty` dependencies (`package.json:94-110`). Support window kararı **DOĞRULANAMADI**. |
| Million-scale hedefte “million users/projects” control plane mi, tek local daemon mı, Hub federasyonu mu? | SLO/tenant/storage topolojisi buna bağlıdır | Hub işi açık (`docs/MASTER-PLAN.md:252`); kesin deployment topology **DOĞRULANAMADI**. |
| Bir flow aynı anda CLI/MCP/Desktop'tan cancel/retry edilirse idempotency key kim üretir? | Power-user parity race condition yaratır | RunFlow revision/digest var; cancel/resume endpoint'i yok (`src/core/run-flow-contract.ts:57-100`; `src/api/run-flow-routes.ts:20-40`). |

## Gap kapatma stratejisi seçenekleri

| Seçenek | Artı | Eksi | NO-GO | Tavsiye |
|---|---|---|---|---|
| A — Her gap'i MASTER sırasına göre bağımsız kapat | Lokal ownership kolay | Shared truth dependencies görünmez; rework | Desktop ve Terminal ayrı state çözümü geliştirirse NO-GO | Reddedildi. |
| B — Önce tüm core'u tamamla, sonra surface | Core odaklı | User-proof gecikir; dogfood feedback kesilir | Aylarca binary acceptance yoksa NO-GO | Tek başına reddedildi. |
| C — Vertical evidence slices: coordinator→Terminal proof→Desktop same-flow→cross-platform→enterprise/load | Her dilim dual-lens proof üretir | Cross-team orchestration gerekir | Her slice aynı truth'u ve rollback'i kullanmazsa NO-GO | **Önerilen.** |

**Net öneri:** C; D bölümündeki surface-parity dilimleri, E bölümündeki maturity gates'in ilk omurgası olmalıdır.

---

# D — Odak: Desktop + Terminal Tam-Kapsam

## Yönetici özeti

Hedef iki ayrı deckent yapmak değil, tek flow-service'in iki first-class client'ını tamamlamaktır; bu, önceden verilmiş hybrid RunProposal ve thin-shell kararlarının doğal sonucudur (`docs/MASTER-PLAN.md:79`; `.analysis/desktop-shell-research-2026-07-08.md:57-105`). Terminal bugünkü en ileri user surface'tir, fakat correlation/multi-flow/live approval/discoverability açıkları vardır; Desktop ise daemon lifecycle seviyesinde sağlam başlayıp product consumer seviyesinde boştur (`src/cli/repl/run-flow-controller.ts:22-27,159-309`; `src/desktop/src/main/daemon-lifecycle.ts:124-197`). Önce shared coordinator ve flowId/event receipts tamamlanmalı, sonra Terminal canonical client olarak pinlenmeli, ardından Desktop aynı contracts'i tüketmelidir. “Geliştirme ikisinden” kabulü, aynı gerçek flow'un bir surface'te başlatılıp diğerinde izlenmesi/onaylanması/sonuçlandırılmasıdır; iki ayrı demo yeterli değildir.

## Kanıt tablosu

| Soru | Bugün | Hedef | Kanıt |
|---|---|---|---|
| State truth nerede? | Terminal controller + API module Map + run-flow store parçalı | Durable `RunFlowCoordinator` | `src/cli/repl/run-flow-controller.ts:22-27`; `src/api/run-flow-routes.ts:35-40,101-116`; `src/orchestra/run-flow-reducer.ts:60-184`. |
| Start kimde? | Terminal/CLI snapshot-start; API route setinde yok | Coordinator command; in-process/HTTP aynı semantics | `src/cli/repl/run-flow-controller.ts:272-309`; `src/api/run-flow-routes.ts:20-40`. |
| Event truth? | flow-scoped SSE replay'siz; REST event publish etmiyor | Append-only sequenced event log + cursor replay | `src/api/run-flow-event-stream.ts:59-95`; `tests/api/run-flow-api-composition.test.ts:335-356`. |
| Terminal UX? | Proposal card + watcher var; tek-current-flow ve missing flowId completion | Multi-flow inbox, live approvals, correlated result-turn | `src/cli/repl/app.tsx:1516-1544`; `src/cli/repl/run-completion-watch.ts:138-163`; `.deckent/runtime/jobs/sprint-430.json:97-129`. |
| Desktop UX? | Profile picker/daemon shell/dashboard load | Chat+Console+Approval+History/Retro | `src/desktop/src/renderer/app.ts:189-340`; `src/desktop/src/main/window-manager.ts:209-230`; `.analysis/desk2-blueprint-2026-07-10.md:6-26`. |
| Dashboard rolü? | Monitoring + mutation | Salt-okur observability/deep-link | `src/dashboard/src/components/SprintControlPanel.tsx:45-85`; `docs/adr/adr-g-033-dashboard-observability.md:74-94`. |

## D1 — Terminal “tam-kapsam” contract'ı

### Kullanıcı journey'si

1. **Intent:** Kullanıcı serbest NL goal yazar; system intent'i typed `RunProposal`a çevirir ve kullanılan provider/model/config receipt'ini gösterir (`src/core/run-flow-contract.ts:23-55`; `src/orchestra/run-proposal-compiler.ts:96-105`).
2. **Preview:** Multi-task plan, file scope, dependency, cost/effort, gate findings ve digest progressive disclosure ile görünür; API/Terminal aynı preview payload'ını tüketir (`src/cli/repl/run-flow-controller.ts:199-216`; bugünkü API farkı `src/api/run-flow-routes.ts:218-235`).
3. **Decision:** Approve/edit/reject/defer, typed actor/tenant/risk/revision ile ApprovalBroker'a gider; generic `--yes` yalnız explicit non-interactive policy'dir (`src/core/run-flow-contract.ts:57-100`; runtime-wide approval hedefi `docs/MASTER-PLAN.md:29-31`).
4. **Run:** Exact approved snapshot CAS ile bir kez başlar; start/retry/cancel/resume idempotency key taşır (`src/cli/repl/run-flow-controller.ts:272-309`; `src/orchestra/run-job-service.ts:1-40` mevcut service sınırı, delivery `docs/MASTER-PLAN.md:79`).
5. **Live:** Task/phase/provider/cost/approval/risk footer birden çok flow için filtrelenebilir; interruption/reconnect event cursor'dan devam eder (bugünkü single-flow sınırı `src/cli/repl/run-flow-controller.ts:22-27`; replay boşluğu `src/api/run-flow-event-stream.ts:59-95`).
6. **Result:** Completion aynı `flowId` ile yeni turn olur; diff, evaluation, debt, evidence ve next-action/retro link'i taşır (`src/cli/repl/run-completion-watch.ts:138-163`; bugünkü flowId açığı `.deckent/runtime/jobs/sprint-430.json:97-129`).
7. **Recover:** Daemon/REPL restart, stale handle, expired approval ve provider failover açık state olarak geri gelir; sessiz no-op olmaz (stale approval canlı açığı `.analysis/born-backlog.json:3064-3070`; claim geçmişi `.analysis/born-backlog.json:3083-3090`).

### Terminal açıkları ve bitiş kanıtı

| Açık | Bugünkü kanıt | Tamamlanma kanıtı |
|---|---|---|
| Correlation | Completion flowId yok (`.deckent/runtime/jobs/sprint-430.json:97-129`) | Gerçek binary run'da proposal/snapshot/job/finalizer/result event aynı flowId; elle injection yok. |
| REPL free-NL parity | Canonical `do` path kanıtlı; term-mode gate prod caller'sız (`docs/MASTER-PLAN.md:46`; `src/cli/repl/term-mode.ts:93-132`) | REPL prompt'ta NL goal, alt-komut yazmadan aynı typed proposal; safety mode enforcement receipt. |
| Multi-flow | Controller tek current flow (`src/cli/repl/run-flow-controller.ts:22-27`) | İki concurrent flow; filtre/switch; yanlış completion eşleşmesi sıfır. |
| Live approval | Generic confirm + approval files var; cross-process expiry açık (`.analysis/born-backlog.json:3064-3070`) | Worker request Terminal kartına gelir; approve/deny/expire/reconnect/dedup E2E. |
| Discoverability | Help hâlâ sprint dili; status JSON boş branch kırık (K2-K3) | `/help`/palette/context action doğru Run dili; JSON schema her state'te parse edilir. |
| Result-turn evidence | Watcher wired; production correlation eksik (`src/cli/repl/run-completion-watch.ts:138-163`) | New turn diff/eval/debt/next action taşır; restart sonrası replay edilir. |
| Provider/cost truth | Effective config çelişkili K10 | requested/effective/fallback/cost receipt her proposal/run/result'ta aynı. |

## D2 — Desktop mimarisi: ikinci implementation yaratmadan ürün

### Paylaşılan çekirdek sınırı

```text
                       ┌──────────────────────────────┐
Terminal in-process ──▶│ Durable RunFlowCoordinator   │◀── API command adapter ── Desktop
CLI / MCP / SDK ──────▶│ reducer + CAS + event log    │
                       │ ApprovalBroker + auth context│
Dashboard (read-only) ◀│ projections + replay cursor │
                       └──────────────┬───────────────┘
                                      ▼
                         8-stage orchestration core
                         scheduler / eval / memory
```

Bu sınırda reducer/state transition/digest/CAS/event sequence/approval policy `core/orchestra` içindedir; Terminal yalnız Ink render/input, Desktop yalnız Electron renderer/IPC/HTTP client, Dashboard yalnız projection render eder. Mevcut typed reducer bu merkezin başlangıcıdır (`src/orchestra/run-flow-reducer.ts:60-184`); mevcut API'nin duplicated glue ve module-local Map'i canonical olmamalıdır (`src/api/run-flow-routes.ts:11-18,35-40`). Electron main process token/daemon lifecycle ve window security'yi taşır; orchestration logic taşımaz (`src/desktop/src/main/daemon-lifecycle.ts:124-197`; `src/desktop/src/main/security.ts:1-130`).

### Terminal–Desktop parity matrisi

| Capability | Shared service | Terminal | Desktop | Dashboard |
|---|---|---|---|---|
| Goal/propose | Coordinator `propose` | Free NL + `/do`/tool | Chat composer + “New Run” | Yok; deep-link | 
| Preview/gate/digest | PlanPreview service | Ink card | Console plan graph/card | Read-only snapshot | 
| Approve/edit/reject | ApprovalBroker command | Keyboard/typed confirm | Approval center/risk drawer | Read-only status | 
| Exact start | Coordinator CAS command | In-process adapter | Authenticated API command | Yok | 
| Live events | Durable event log/cursor | Footer + flow switcher | Console timeline + notifications | Monitoring projection | 
| Worker live approval | ApprovalBroker | Modal/card | Native notification + approval center | Read-only | 
| Diff/evaluation/result | Completion projection | New-turn + detail | Chat result + Console evidence | Metrics/history | 
| Cancel/retry/resume/recover | Coordinator commands | Control mode | Console actions | Yok/deep-link | 
| Retro/recall/memory | Core query/service | Conversational/CLI | History/Memory panes | Aggregate read-only | 
| Provider/model/cost | Provider receipt/policy | Power controls | Profile/run settings | Aggregate monitoring | 

Parity'nin source dayanağı shared-contract ilkesidir (`docs/adr/adr-g-011-surface-parity-thin-wrapper.md:17-55`); Dashboard sütununun read-only olması sabit role dayanır (`docs/adr/adr-g-033-dashboard-observability.md:74-94`). Tablodaki Desktop product cells bugün hedef tanımıdır, “var” iddiası değildir; bugünkü Desktop contract'ın yalnız connection/daemon/app/window taşıdığı `src/desktop/src/shared/desktop-api.ts:62-91` ile kanıtlanır.

### Desktop ekran ve state contract'ı

| Ekran | Sorumluluk | State kaynağı | Failure state |
|---|---|---|---|
| Onboarding/Profile | Local/remote/enterprise profile, project, provider/auth health | Desktop profile store + daemon metadata (`src/desktop/src/main/connection-profile-store.ts:1-90`; `src/desktop/src/main/daemon-meta-client.ts:1-10`) | Unsupported profile explicit; bugün yalnız local enabled (`src/desktop/src/renderer/app.ts:334-340`). |
| Chat | Intent, clarification, result-turn | Coordinator conversation/flow projection | Provider/auth/offline error typed; dashboard chat'in generic endpoint'i canonical olmaz (`src/api/server.ts:935-979`). |
| Console | Preview, dependency graph, live task/phase/cost/log, control | Flow snapshot + sequenced events | Cursor gap → backfill; stale revision → refresh/merge, silent overwrite yok. |
| Approval Center | Pending/expired/decided requests, risk/actor/tenant | ApprovalBroker durable projection | Expired decision honest; dedup; born-679 acceptance (`.analysis/born-backlog.json:3064-3070`). |
| History/Retro | Completed flow evidence, diff/eval/debt/learning | Completion/retro/memory services | Missing artefact explicit, “DONE” metniyle örtülmez. |
| Settings | Profile/provider/model/cost/privacy/offline/i18n | Typed config APIs | Duplicate config conflict fail-loud; bugünkü duplicate provider sorunu K10. |

## D3 — “Geliştirme ikisinden” günlük akışları ve senkron durum

| Günlük iş | Terminal deneyimi | Desktop deneyimi | Cross-surface acceptance |
|---|---|---|---|
| born/goal aç | NL turn veya typed command; proposal'a source link | Chat goal + backlog context picker | Aynı born ID/proposal; duplicate work item yok. |
| `do`/run koş | Preview card→approve→start | Console preview→Approval→start | Birinde approve, diğerinde aynı revision approved görünür. |
| Canlı izle | Multi-flow footer/timeline | Console timeline/native notification | Cursor/sequence aynı; reconnect event kaybetmez. |
| Worker talebini onayla | Inline approval card | Approval Center/OS notification | First valid CAS decision wins; loser stale-decision mesajı alır. |
| Diff/kanıt incele | Result-turn detail/CLI pager | Side-by-side diff/eval evidence | Verdict/evidence digest birebir aynı. |
| Retry/FIX/cancel/resume | Control mode | Console actions | Idempotency; aynı task attempt/retryOf lineage. |
| Retro/recall | New turn veya `retro/recall` | History/Retro/Memory | Aynı DB-first memory record ve tenant filter (`docs/adr/adr-g-035-memory-architecture.md:17-75`). |
| Provider/cost ayarla | Run/profile scope control | Settings + proposal override | Canonical grouped config + receipt; silent fallback yok. |

Senkron state için zorunlu enterprise contract `{flowId, revision, eventSequence, planDigest, actor, tenant, commandId}` olmalıdır; mevcut contract flowId/revision/digest taşır, actor/tenant metadata proposal'da vardır, event replay ve command-idempotency'nin tüm surface'lerde birleşmesi açıktır (`src/core/run-flow-contract.ts:23-100`; `.deckent/runtime/run-flow-store/c297234c-dd69-4716-ad56-4406ad8a5db3.snapshot.jsonl:1`). [SPEKÜLASYON] Multi-device remote profile için Lamport/monotonic server sequence yeterli olabilir; active-active multi-region gereksinimi kanıtlanmadığından CRDT seçmek bugün erken olur. Bunun NO-GO eşiği: tek authoritative project coordinator varsayımı Hub topology kararıyla bozulursa sequence tasarımı yeniden değerlendirilmelidir (`docs/MASTER-PLAN.md:252`).

## D4 — Dilimli yol ve iki sıralama alternatifi

### Sıralama seçenekleri

| Seçenek | Sıra | Artı | Eksi | NO-GO |
|---|---|---|---|---|
| A — Desktop-visible first | Shell UI → API eksikleri → coordinator refactor → Terminal parity | Erken görsel ilerleme | UI geçici API semantics'e bağlanır; rework/drift | Desktop local reducer/Map/digest yaratırsa NO-GO. |
| B — Contract/evidence first **(önerilen)** | Correlation → coordinator/event replay → Terminal pin → Desktop Console → cross-surface/OS acceptance → dashboard cutover | En düşük ikinci-implementation riski; her dilim rollbackable | İlk iki dilim görsel olarak daha az çarpıcı | İki dilimden uzun user-binary proof'suz core çalışma yapılırsa NO-GO. |
| C — Terminal tamamen biter, Desktop sonra | Terminal polish → contract freeze → Desktop | En olgun surface hızla kusursuzlaşır | Desktop feedback'i gecikir; HTTP/event contract geç test edilir | Shared API consumer acceptance olmadan Terminal API şekli freeze edilirse NO-GO. |

**Net öneri:** B; fakat her core diliminin sonunda gerçek Terminal binary ve en geç ikinci dilimde headless API consumer acceptance çalışmalıdır.

### Sprint-dilimli uygulama planı

| Dilim | Kapsam ve dosyalar | Kanıt kriteri | Risk | Rollback |
|---|---|---|---|---|
| **SURF-0 — Truth receipt** | `src/orchestra/sprint-controller.ts`, `sprint-phases.ts`, `sprint-finalizer.ts`, `src/cli/commands/start.ts`, `src/cli/repl/run-completion-watch.ts`: `flowId/commandId` proposal→job→finalizer→completion propagation; gerçek composition fixture elle inject etmez | `dist/cli/entry.js do ... --run --yes` gerçek repo run; `.deckent/runtime/jobs/<id>.json` flowId; result-turn aynı ID | Lifecycle signature compatibility | Additive fields + existing `run_flow_v2` rollback; old completion reader dual-read. |
| **SURF-1 — Durable coordinator** | `src/orchestra/run-flow-reducer.ts`, `run-job-service.ts`, yeni/evrilmiş `run-flow-coordinator.ts`, run-flow store; command idempotency, multi-flow list/get, durable event sequence/replay | Restart sonrası two-flow state/replay; duplicate start/cancel/retry race test; Terminal real binary | Store migration/corruption | Dual-read old JSONL; coordinator flag; immutable snapshot backup. |
| **SURF-2 — API parity/security** | `src/api/run-flow-routes.ts`, `run-flow-event-stream.ts`, auth/tenant middleware; start/cancel/resume/retry/list/events/backfill; gateFindings parity; no module Map | Terminal vs API contract golden test; REST transition event'i kendisi publish eder; auth/tenant negative; reconnect cursor | Token leakage/tenant escape | Command endpoints feature-gated; old read endpoints preserved; daemon local-only fallback. |
| **SURF-3 — Terminal full client** | `src/cli/repl/run-flow-controller.ts`, `run.tsx`, `app.tsx`, `run-completion-watch.ts`, `term-mode.ts`, `chat-native.ts`, `messages.ts`; multi-flow inbox, risk/approval, result evidence, discoverability/status JSON | İki concurrent gerçek flow; worker approval; restart/replay; no CLI subcommand typing; EN/TR golden binary; `status --json` parse | Ink state complexity/approval fatigue | Per-capability flags; legacy loop `--legacy-loop`; event log unaffected. |
| **SURF-4 — Desktop design foundation** | `src/desktop/src/shared/desktop-api.ts`, main security/IPC/profile, renderer design tokens/i18n/router; Console/Chat/Approval/History shells consume generated/shared contracts | Packaged Electron local daemon handshake; keyboard/a11y/visual states; no orchestration logic import in renderer | Electron security/design scope | Shell keeps current dashboard fallback behind recovery-only flag. |
| **SURF-5 — Desktop real workflow** | Desktop renderer clients + API coordinator; native notifications; diff/eval/history; profile/provider/cost settings | Signed-like packaged build in Linux/macOS/Win-native; real deckent task Desktop-only; approval and result; no manual CLI | OS signing/update/native ABI | Disable Desktop command capability server-side; Terminal remains canonical recovery surface. |
| **SURF-6 — Cross-surface dogfood** | E2E fixtures/scripts under `tests/e2e`/`scripts`; one flow Terminal→Desktop and one Desktop→Terminal; daemon restart, stale revision, expired approval, provider failure | Five-real-task suite; zero lost/duplicate event; same digest/verdict; WSL leg | Flaky multi-process tests | Deterministic clock/port/tmpdir; failures block flip, not old surface. |
| **SURF-7 — Authority cutover** | Dashboard control components/routes kaldırılır veya deep-link/read-only projection'a çevrilir; capability policy ratchet | Dashboard mutation endpoint/UI zero; monitoring tests green; equivalent Desktop/Terminal actions proof | Existing dashboard operators | One release deprecation/read-only warning; server-side deny can rollback only by explicit emergency policy. |

SURF-0 ve SURF-1 bitmeden Desktop Console state yazamaz; SURF-5 bitmeden dashboard write controls kaldırılmaz. Bu iki ordering invariant'i, “ikinci implementation yok” ve “user capability kaybı yok” şartlarını birlikte korur (`docs/adr/adr-g-011-surface-parity-thin-wrapper.md:17-55`; `docs/adr/adr-g-033-dashboard-observability.md:74-94`).

### Organ nakli / ölen parçalar

| Parça | Karar | Gerekçe / kanıt |
|---|---|---|
| `run-flow-contract.ts`, reducer, snapshot CAS | **Korunur ve merkezileşir** | Typed/deterministic temel hazır (`src/core/run-flow-contract.ts:23-151`; `src/orchestra/run-flow-reducer.ts:60-184`). |
| Terminal proposal card/result watcher | **Organ nakli: shared projection consumer** | UX organları gerçek (`src/cli/repl/app.tsx:1516-1544`; `src/cli/repl/run-completion-watch.ts:138-163`). |
| API module-local Map/duplicated glue | **Ölür** | Restart/multi-instance truth olamaz (`src/api/run-flow-routes.ts:11-18,35-40`). |
| REST testlerinde manual event publish | **Ölür** | Route transition event'i atomik üretmeli (`tests/api/run-flow-api-composition.test.ts:335-356`). |
| Desktop dashboard-as-product | **Ölür; recovery/monitor embed olabilir** | Blueprint “dashboard reuse ürün değil” (`docs/MASTER-PLAN.md:71`). |
| Dashboard mutating controls | **Equivalent client hazır olduğunda ölür** | Monitoring-only karar (`docs/adr/adr-g-033-dashboard-observability.md:74-94`). |
| PTY | **Expert Console organı** | Structured state truth değil; shell tool olarak değerlidir (`.analysis/desk2-blueprint-2026-07-10.md:6-15`). |
| Legacy `do.ts` adapter | **Compatibility shell; state logic ölür** | Canonical RunFlow delegation teslim edildi (`docs/MASTER-PLAN.md:79`). |

## D riskleri

- **Dual-write split-brain:** JSONL/store/event log iki truth olursa aynı flow farklı state gösterir; migration her command'da single writer + dual reader olmalıdır (`src/api/run-flow-routes.ts:35-40,101-116`).
- **Security expansion:** Desktop command API auth/tenant/CSRF/deep-link riskini büyütür; local bind tek başına authorization değildir (`src/api/auth.ts:157-163,240-248`).
- **SSE auth failure:** Bugünkü query-token allowlist RunFlow prefix'ini kapsamaz; SURF-2 çözülmeden Desktop live-flow acceptance NO-GO'dur (`src/api/server.ts:1871-1893`; `src/api/run-flow-event-stream.ts:1-34`).
- **Electron supply chain/ABI:** `electron`, `node-pty`, `better-sqlite3` signing/update/Node ABI matrisi ister (`src/desktop/package.json:14-21`; `package.json:94-110`).
- **Approval race:** iki surface aynı request'e karar verebilir; revision/CAS ve “stale decision” user feedback şarttır (mevcut CAS zemini `src/core/run-flow-contract.ts:57-100`).
- **Test illusion:** 50 Desktop/1.267 dashboard test, packaged real journey yerine geçmez (K8-K9; `docs/adr/adr-g-009-evaluation-integrity.md:17-48`).

---

# E — Merdiven: Beta → GA → Hayal

## Yönetici özeti

Merdivenin ilk kapısı beta publish değil, beta artefact'ının dürüst ve tekrar üretilebilir olmasıdır; bugün K6 kırmızıdır ve Desktop/born-666/trusted-publisher şartları açıktır (`docs/MASTER-PLAN.md:70,78,96`). Community GA'nın ana farkı feature sayısı değil, Terminal+Desktop günlük loop parity, every-environment support contract, recoverability ve current release evidence olmalıdır (`docs/MASTER-PLAN.md:20-39`). Enterprise hard-flip, SP-2 ve Hub/agentic-OS aynı anda başlatılabilir araştırma hatları olsa da production promotion'ları core evidence/tenant/trace gates'e bağımlıdır (`docs/adr/adr-g-020-authority-roles-flow-enforcement.md:123-138`; `docs/MASTER-PLAN.md:155,252`). ERP ve altı dil, ortak flow/capability/persona semantics üzerine eklenmelidir; yüzeylere ayrı ayrı yapıştırılmamalıdır (`.analysis/desk2-blueprint-2026-07-10.md:3-45`; `docs/MASTER-PLAN.md:31`).

## Bağımlılık grafiği

```text
[G0 Beta evidence closure]
  ├─ publish digest / consent / trusted publisher / Desktop acceptance
  └─ current validator green
                │
                ▼
[G1 Shared flow + scheduler + provider + trace truth]
  ├─ RunFlow correlation/coordinator/replay
  ├─ scheduler effect parity + executedEngine receipt
  ├─ provider requested/effective receipt
  └─ trace completeness + segment production wire
                │
        ┌───────┴──────────┐
        ▼                  ▼
[G2 Surface parity]   [G3 Assurance substrate]
 Terminal+Desktop      tenant/RBAC/audit/identity/load
 same-flow dogfood     fail-closed preview
        └───────┬──────────┘
                ▼
[G4 Community GA]
 every-environment + offline + SLO + support/upgrade/rollback
        ┌───────┼───────────────────┐
        ▼       ▼                   ▼
[G5 Ent GA] [G6 SP-2 promotion] [G7 Hub/agentic-OS]
 hard flip   signed corpus/eval    signed skills/gateway
        └───────┼───────────────────┘
                ▼
[G8 ERP drivers + six-language global product + federated scale]
```

G0'ın dayanağı release şartlarıdır (`docs/MASTER-PLAN.md:70,78,96`); G1'in dört truth açığı A1/A4/A7/A8'de kaynaklanmıştır. G5 hard-flip ADR-G-020'nin roadmap'idir (`docs/adr/adr-g-020-authority-roles-flow-enforcement.md:123-138`); G6 SP-2 bugün paused'tur (`docs/MASTER-PLAN.md:155`); G7 Hub P0 açık listedir (`docs/MASTER-PLAN.md:252`). G8'de ERP'nin dört-driver yönü ve Desktop blueprint persona/ERP tasarımı kayıtlıdır (`docs/MASTER-PLAN.md:30`; `.analysis/desk2-blueprint-2026-07-10.md:28-42`); production ERP contract detayları **DOĞRULANAMADI**.

## Aşama ve geçiş kanıtları

| Gate | Kapsam | Geçiş kanıtı — hepsi zorunlu | Bugünkü durum |
|---|---|---|---|
| **G0 Beta evidence closure** | npm tarball + Desktop approval + consent + OIDC publish | Aynı tarball digest'te `validate:publish=0`; critical files/size/categories; required Ubuntu/macOS/Win/WSL; born-666 explicit policy; npm OIDC provenance; Alperen Desktop acceptance | Validator kırmızı K6; WSL/consent/trusted publisher/Desktop açık (`docs/MASTER-PLAN.md:70,78,96`). |
| **G1 Truth closure** | RunFlow/scheduler/provider/trace | 2 gerçek flow'da completion flowId; 2 gerçek reducer run'da `executedEngine=reducer`; provider invocation receipts; v2 segment manifest + completeness | 430/431 flowId yok; 356 engine unknown; effective Claude/Claude; segment orphan (`.deckent/runtime/jobs/sprint-430.json:97-129`; `src/agent/trace-recorder.ts:320-375`; K10). |
| **G2 Surface parity** | Terminal + Desktop full daily loop | Five-real-task dogfood suite her surface'te; iki cross-surface handoff; restart/replay; approval race/expiry; no manual CLI in Desktop journey | Terminal one-real-run var; Desktop consumer yok (`docs/MASTER-PLAN.md:46`; `src/desktop/src/shared/desktop-api.ts:62-91`). |
| **G3 Assurance substrate** | Tenant/RBAC/audit/identity/load Preview | ENT-TRUTH-0 config roundtrip + real denied-spawn; cross-tenant negative suite 0 escape; no-role deny; keyed audit verify; rate wire; OIDC/SCIM lifecycle; 10×/100× load with bounded degradation | `enforce_rbac` resolved path'ta düşüyor (`src/core/config-types.ts:1282-1288`; `src/core/config.ts:1721-1896,2538-2623`); enforcement advisory/partial (`docs/adr/adr-g-031-enterprise-foundation.md:60-83`). |
| **G4 Community GA** | Supported product contract | G0-G2; root tests hermetic green; P95 first-DONE/run/event latency SLO; crash/restart/upgrade/rollback; offline; support matrix/docs current | Root-suite **DOĞRULANAMADI** K13; current publish red; Desktop gap. |
| **G5 Enterprise GA** | Governance assurance | G3 plus threat model/pen-test, signed audit export, SCIM deprovision, DR/RPO/RTO, air-gap install, policy/claim SLA | Foundation only; six mapped gaps (`docs/adr/adr-g-031-enterprise-foundation.md:60-83`). |
| **G6 SP-2 promotion** | Own model | Dataset gate; held-out quality ≥ selected external baseline; safety/regression zero critical; cost/latency target; canary/rollback; lineage | Training corpus NO-GO; SP-2 paused (`docs/MASTER-PLAN.md:155`; K12). |
| **G7 Hub/agentic-OS** | Signed ecosystem + always-on gateway | Ed25519 key custody/signing; manifest public schema; install sandbox; tenancy/approval policy; failure containment; ecosystem SLO | Hub P0 lists these gaps (`docs/MASTER-PLAN.md:252`); vision always-on gateway hedefi (`docs/vision/VISION.md:21,98`). |
| **G8 Global/ERP/federated** | Six locales, ERP drivers, million-scale federation | Six-locale journeys; ERP transaction/idempotency/approval/audit contract; multi-region/project topology; cost and isolation SLO | Six-language/ERP direction var; executable production acceptance **DOĞRULANAMADI** (`docs/MASTER-PLAN.md:30-31`; `.analysis/desk2-blueprint-2026-07-10.md:28-45`). |

“P95”, “10×/100×” veya external baseline için bugünkü numeric target repo kaynaklarında bulunmadı; kesin eşikler **DOĞRULANAMADI** ve karar-gündeminde seçilmelidir. NO-MVP gereği bu bilinmezlik load/SLI tasarımını ertelemez: gate açılmadan önce workload model, percentile ve error budget yazılı hale gelmelidir.

## Beta sonrası sıralama seçenekleri

| Seçenek | Artı | Eksi | NO-GO | Tavsiye |
|---|---|---|---|---|
| A — AI-moat first: G0→G1(trace)→SP-2→surface | Kendi model erken | Kirli corpus ve eksik UX ile yanlış şeyi optimize eder | K12 120/120 contaminated corpus ile train promotion NO-GO | Reddedildi; araştırma sandbox'ı olabilir. |
| B — Enterprise first: G0→G3/G5→surface | Büyük müşteri assurance erken | Community product loop/dual-lens dengesi bozulur | Desktop/Terminal dogfood yokken Enterprise GA claim NO-GO | Reddedildi; substrate parallel olabilir. |
| C — Evidence + surface spine: G0→G1→G2; G3 parallel; G4; sonra G5/G6/G7; G8 | Tek truth tüm sonraki ürünleri besler; dogfood sürekli | İlk aşama feature pazarlaması yerine doğruluk yatırımıdır | G1/G2 mock-only geçerse NO-GO | **Önerilen.** |

**Net öneri:** C. G3 assurance substrate G1/G2 ile paralel çalışabilir; fakat Enterprise GA etiketi G4 Community GA ve G3 receipts olmadan, SP-2 promotion G1 trace gate olmadan, Hub production G3 tenancy/approval olmadan açılamaz.

## Aşama bazlı rollback ilkeleri

- **G0:** Publish yalnız tag/registry action; failed attestation yeni tag üretmez, mevcut artifact overwrite edilmez (`.github/workflows/release.yml:77-113,238-266`).
- **G1 scheduler:** `scheduler.engine=legacy`; event/store migration dual-read; provider config önce conflict-report sonra canonical write (`src/orchestra/scheduler-driver.ts:294-308`; `src/core/config-migration.ts:615-649`).
- **G2 surfaces:** Server-side command capability flag; Terminal recovery surface; Desktop current dashboard fallback recovery-only (`src/desktop/src/main/window-manager.ts:209-230`).
- **G3/G5 enterprise:** Hard flip tenant/role scope'unda canary; fail-open community semantics ile enterprise assurance aynı deployment'ta karıştırılmaz (`docs/adr/adr-g-031-enterprise-foundation.md:3-7,56-83`).
- **G6 SP-2:** Model registry alias atomik canary/rollback; trace/dataset immutable manifest; selected external model fallback (`docs/adr/adr-g-008-provider-abstraction-fleet-usage.md:15-60`).
- **G7/G8:** Signed protocol/schema versioning ve backward compatibility; Hub/ERP failure orchestration core'u bloklamaz, fakat transaction/audit fail-closed policy'sini sessizce atlayamaz (`docs/adr/adr-g-016-product-vision.md:25-33,47-68`).

## E riskleri

1. Gate'ler manual checklist'e dönerse aynı tarihsel “DONE ama current kırmızı” problemi tekrar eder; executable receipt şarttır (`docs/MASTER-PLAN.md:78`; K6).
2. Parallel G3/G6 araştırması core contracts'i fork ederse merge maliyeti katlanır; registry/facade extension point dışında yeni truth NO-GO'dur (`docs/adr/adr-g-011-surface-parity-thin-wrapper.md:17-55`).
3. SP-2 kalite metriği GWTD/full-success kalibrasyonunu miras alırsa model yanlış target'a öğrenebilir (`src/orchestra/outcome-tracker.ts:34-38,135-158`).
4. Hub/ERP network calls core never-phone-home policy'sini aşarsa product identity kırılır; explicit layer/consent gerekir (`docs/adr/adr-g-016-product-vision.md:25-33,63`).

---

# F — Riskler ve Ölçüm

## Yönetici özeti

En büyük riskler yeni feature yetişmemesi değil, truth/receipt boşluklarının güçlü görünen source/test hacmi içinde görünmez kalmasıdır. Scheduler, RunFlow, provider, trace, enterprise ve release'te aynı erken-uyarı deseni kullanılabilir: requested/declared state ile executed/effective artefact farklıysa gate kırmızı olmalıdır (`src/orchestra/result-collector.ts:1542-1548`; `src/core/config-migration.ts:615-649`; K6). Bugünkü metrik tabanı parçalıdır: static lint ve surface unit suite'leri ölçülüyor, fakat time-to-first-DONE, full root pass, Desktop real workflow, cross-tenant escape ve Brain invocation receipt **DOĞRULANAMADI** (K4, K8-K10, K13). Tamamlanmışlık dashboard'u feature count değil, evidence ladder coverage ve user/assurance SLI'ları göstermelidir (`docs/adr/adr-g-009-evaluation-integrity.md:17-48`).

## En büyük 10 risk — kanıt ve erken uyarı

| # | Risk | Bugünkü kanıt | Erken-uyarı sinyali | Mitigasyon kararı |
|---:|---|---|---|---|
| 1 | **Scheduler split-brain / kanıtsız reducer flip** | 356 tick divergence 0 ama engine unknown; effects/closure leakage var (K17; `src/orchestra/scheduler-effects.ts:524-533`; `src/orchestra/result-collector.ts:1610-1611`) | `unknownEngine>0`, reducer/legacy effect checksum farkı, checkpoint restore mismatch | Receipt-gated strangler; default flip iki real reducer proof'tan sonra. |
| 2 | **RunFlow yanlış result / duplicate command** | 430/431 completion flowId yok; controller single-flow (`.deckent/runtime/jobs/sprint-430.json:97-129`; `src/cli/repl/run-flow-controller.ts:22-27`) | Uncorrelated completion, duplicate jobId, stale revision, event-sequence gap | Durable coordinator + command idempotency + replay. |
| 3 | **Release/supply-chain false green** | Validator exit 1 ve summary çelişkili; Desktop/trusted publisher/consent açık (K6; `docs/MASTER-PLAN.md:70,78,96`) | Gate summary≠detail, digest mismatch, required leg skipped, npm provenance yok | Same-digest executable attestation; bypass yasak. |
| 4 | **Provider/model drift ve silent fallback** | Grouped/flat conflict; effective Claude/Claude; Brain receipt yok (K10; `.deckent/config.json:36-39,384-385`) | requested≠effective without reason; fallback-rate/cost/residency policy ihlali; unknown model literal | Canonical grouped config, conflict error, invocation receipt, literal ratchet. |
| 5 | **Training contamination / yanlış model promotion** | Pipeline 120/120 alır; 47 v1, 2.399 legacy orphan, 120 truncated (K11-K12) | Quarantine=0 iken capture-incomplete; duplicate stable ID; v1 oranı; held-out regression | Segment/provenance/completeness gate; SP-2 promotion fail-closed. |
| 6 | **Tenant/RBAC/audit escape** | Role optional, strict isolation off, audit literal secret (`src/nervous/authority-matrix.ts:303-378`; `src/core/config.ts:1812-1814`; `src/core/audit-writer.ts:23-95`) | Tenantless query, no-role allow, unsigned/unverified export, cross-tenant negative-test failure | Enterprise Preview etiketi; hard flip assurance suite sonrası. |
| 7 | **Desktop ikinci ürün/ikinci truth ve Electron attack surface** | Desktop dashboard yükler, RunFlow contract taşımaz; auto-update stub (`src/desktop/src/main/window-manager.ts:209-230`; `src/desktop/src/shared/desktop-api.ts:62-91`; `src/desktop/src/main/auto-update.ts:1-18`) | Renderer orchestration import'u, local reducer/store, CSP/navigation exception, unsigned update | Thin client boundary lint + shared coordinator + signed packaged E2E. |
| 8 | **Green test illusion / flaky infrastructure** | Dashboard green iken EPERM/act; root suite tamamlanmadı; born-686 required xplat flake kaydeder (K9, K13; `.analysis/born-backlog.json:3131-3137`) | Timeout/EPERM/port collision, rerun-pass oranı, allowlist artışı, mock-only acceptance | Hermetic multi-process harness; real-binary tier ayrı required gate; required status gevşetilmez. |
| 9 | **Tek-kişi/external-control bottleneck** | Publish Desktop onayı ve npmjs external setup Alperen adımıdır (`docs/MASTER-PLAN.md:70,78`) | [SPEKÜLASYON] approval lead-time, bus-factor incident, credential/key custody tek owner | Dual-control/runbook/recovery delegates; fakat product approval authority Alperen'de kalabilir. |
| 10 | **Maliyet, bekleme ve observability yükü** | 431'de `wait_results=863.623,88ms` critical path; monolith trace 58,6MB/120 record (`docs/audits/sprint-431/load-test-report.md:3-45`; K11) | P95 run latency, turns/task, input tokens/task, wait share, trace bytes/task, parse/retention time | Per-flow cost/latency budget + segment storage/backpressure + routing calibration. |

### Risk seçenekleri ve portföy tavsiyesi

| İşletim modeli | Artı | Eksi | NO-GO | Tavsiye |
|---|---|---|---|---|
| A — MASTER status + test count | Mevcut ve ucuz | Runtime/effective truth'u gizler | “DONE” publish/engine/surface kanıtı sayılırsa NO-GO | Reddedildi. |
| B — Manual release/readiness checklist | Human judgment güçlü | Tekrar üretilemez, bus-factor ve stale evidence | Kanıt digest'e bağlı değilse NO-GO | Emergency supplement only. |
| C — Versioned evidence ledger + SLI dashboard + manual product sign-off | Machine truth ve product judgment birlikte | Instrumentation/retention yükü | Receipt actor/tenant/commit/digest içermiyorsa NO-GO | **Önerilen.** |

**Net öneri:** C; mevcut journal/job/trace/audit artefact'ları yeni telemetry sistemiyle değiştirilmemeli, ortak evidence envelope/projection ile birleştirilmelidir (`docs/adr/adr-g-018-verification-protocol-event-stream.md:23-96`).

## “Tamamlanmışlık” metrikleri — bugünkü baseline

| Metric | Tanım | Bugünkü değer | Hedef / geçiş kuralı |
|---|---|---|---|
| **M1 Release readiness** | Canonical validator + blocker attestation | `validate:publish` exit 1; 7/8 özet ama alt hata tutarsız (K6) | Beta için exit 0 + detail/summary parity + same-digest external/Desktop attestations. |
| **M2 Flow correlation** | Son gerçek do-runs completion'da flowId | 0/2: sprint-430 ve 431 completionRecord flowId'siz (`.deckent/runtime/jobs/sprint-430.json:97-129`; `.deckent/runtime/jobs/sprint-431.json:96-128`) | G1 için 2/2; GA'da tüm new RunFlow jobs 100%, legacy ayrı label. |
| **M3 Scheduler execution truth** | Known executed engine / differential tick | 0/356 known; 356 unknown; 0 divergent tick (K17) | Flip öncesi iki real run'da 100% reducer receipt + 0 unexplained divergence. |
| **M4 Surface real-work parity** | Full real task journey | Terminal `do` 1 accepted real sprint; Desktop real RunFlow **DOĞRULANAMADI** (`docs/MASTER-PLAN.md:46`; `src/desktop/src/shared/desktop-api.ts:62-91`) | G2 için five-task suite × Terminal/Desktop + 2 cross-surface handoff. |
| **M5 Verification health** | Static, component, root, real-binary tiers | Lint exit 0; Desktop 50 pass; Dashboard 1.267 pass+uyarı; root **DOĞRULANAMADI** (K4, K8-K9, K13) | Her tier ayrı green; warning/allowlist trend bütçeli; root deterministic. |
| **M6 Provider truth** | Requested/effective provider/model receipts | Config effective Brain/worker Claude/Claude; 430/431 sekiz worker Claude/Sonnet; Brain invocation **DOĞRULANAMADI** (K10-K11) | Her AI call 100% receipt; gerçek mixed-fleet matrix; silent fallback 0. |
| **M7 Dataset fitness** | Schema/provenance/integrity | 73 v2 + 47 v1; v2 orphan 0, v1 orphan 2.399; accepted 120/120; truncated 120/120 (K11-K12) | SP-2 manifest'te v1=0, orphan=0, incomplete=0, duplicate=0; truncation policy threshold karar sonrası. |
| **M8 i18n completeness** | Supported/target locale ve key symmetry | 2/6 locale; 722 EN + 722 TR key occurrence; hardcode lint 0 gated +12 allowlisted (K4, K15) | Global gate altı locale, required-key 100%, per-locale binary journeys; allowlist ratchet düşer. |
| **M9 Learning calibration** | Outcome/readback/promotion evidence | 2.805 outcome, 38 skill-performance key, 9 evolved rule; successful promotion receipt **DOĞRULANAMADI** (K16; `src/orchestra/sprint-finalizer.ts:1598-1604`) | Per-task DNA, weighted GWTD, minSprints enforced; promotion success/audit/canary/rollback receipt. |
| **M10 First-value & enterprise assurance** | P50/P95 install→first DONE; cross-tenant escape | Her iki baseline **DOĞRULANAMADI**; init delivery source'u var, enterprise enforcement partial (`docs/MASTER-PLAN.md:78`; `docs/adr/adr-g-031-enterprise-foundation.md:60-83`) | GA öncesi workload+SLO sayıları Alperen kararı; Enterprise GA cross-tenant escape=0 ve deprovision/audit/DR gates. |

M2'de sprint-431 doğrudan RunFlow snapshot'ı ile ilişkilendirilmiş görünse de completion file flowId taşımadığı için metrik yalnız artefact'a bakar; narrative association başarı sayılmaz (`.deckent/runtime/run-flow-store/3d66ecaf-f3b7-40c0-b9f9-d1d8f3c017c7.snapshot.jsonl:1`; `.deckent/runtime/jobs/sprint-431.json:96-128`). M8'in “2/6” değeri bugünkü code-supported `en,tr` ile North Star altı dil hedefinin oranıdır (`src/core/constants.ts:131`; `docs/MASTER-PLAN.md:31`).

## Ölçüm uygulama planı

| Dilim | Dosya/sınır | Çıktı | Rollback/riski |
|---|---|---|---|
| **OBS-1 Evidence envelope** | `src/core/event-stream.ts`, job completion, scheduler journal, provider call receipts, trace manifest | `{schemaVersion,commit,digest,tenant,actor,flowId,commandId,sequence}` ortak projection; eski artefact dual-read | Additive schema; writer failure core scheduling'i etkilemez ama readiness gate kırmızı olur. |
| **OBS-2 SLI collectors** | CLI/API/Desktop flow timers, init journey, provider/cost, approval, replay | M1-M10 local-first metrics; content değil operational metadata | Telemetry default-off korunur; local dashboard/CLI her zaman çalışır (`docs/adr/adr-g-017-multi-project-isolation.md:87-99`). |
| **OBS-3 Readiness scorecards** | Release workflow, Community/Enterprise/SP-2 gates | Digest-pinned machine verdict + human product sign-off | Eski MASTER delivery status silinmez; readiness ayrı truth olarak eklenir. |
| **OBS-4 Scale/retention** | Segment storage, audit/trace retention, aggregation | Cardinality/backpressure/retention budgets; tenant-local aggregation | Raw evidence kaybı olmadan compaction; legal hold enterprise policy. |

## F riskleri

- Metric gaming: “task DONE sayısı” quality/first-value yerine optimize edilebilir; outcome kalibrasyonu ve external/user acceptance birlikte tutulmalıdır (`src/orchestra/outcome-tracker.ts:34-38,135-158`).
- Privacy: evidence envelope project content taşımamalı; trace ayrı consent/redaction/retention policy'sine bağlı kalmalıdır (`docs/adr/adr-g-016-product-vision.md:25-33`; `src/core/trace-schema.ts:195-269`).
- Cardinality: flow/task/tool/tenant label'ları milyon ölçekte patlayabilir; raw event local segment, aggregate bounded dimension olmalıdır (`docs/adr/adr-g-018-verification-protocol-event-stream.md:83-96`).
- False precision: bugün baseline olmayan P95/SLO'ya keyfi sayı yazmak güven üretmez; karar verilip workload fixture'ıyla pinlenene kadar **DOĞRULANAMADI** kalmalıdır.

---

# KARAR-GÜNDEMİ — Alperen'in Karar-Turu-4'te Seçecekleri

> Bu sayfa uygulama backlog'u değil, önceki kararların üstüne konacak yön seçimidir. Sabit kararlar aşağıda oy konusu yapılmaz; A/B/C yalnız açık implementation/evidence/paketleme seçimleridir. Her satırdaki NO-GO, seçimden bağımsız güvenlik/ürün sınırıdır.

## Sabit zemin — yeniden oylanmayacak

| Sabit karar | Bu rapordaki yürütme yorumu | Kanıt |
|---|---|---|
| Terminal primary; Dashboard monitoring; Desktop chat/decision | Üç surface ayrı state owner olmaz | `docs/MASTER-PLAN.md:20-31`; `docs/adr/adr-g-033-dashboard-observability.md:74-94`. |
| Hybrid RunProposal + host-owned coordinator | Seçim yalnız coordinator migration/replay rollout biçimidir | `docs/MASTER-PLAN.md:79`; `docs/analysis/term-flow-unify-design-2026-07-11.md:177-232`. |
| Scheduler staged strangler | Seçim yalnız retirement evidence threshold'udur | `docs/analysis/scheduler-unify-design-2026-07-11.md:219-228`. |
| Electron thin-shell + system-Node daemon | PTY/dashboard product truth olamaz; Desktop shared service client'ıdır | `.analysis/desktop-shell-research-2026-07-08.md:57-105`. |
| DB-first memory | Yeni surface'ler Markdown'ı truth yapamaz | `docs/adr/adr-g-035-memory-architecture.md:17-75`. |
| Zero-hardcode | Provider/model/i18n defaults registry/config/message SSOT'tan gelir | `docs/adr/adr-g-036-zero-hardcode-model-flow.md:28-60`. |

## Açık kararlar — A/B/C

| # | Karar | A | B | C | Tavsiye | NO-GO |
|---:|---|---|---|---|---|---|
| 1 | **Beta activation cadence — sabit gate'ler yeşil olduktan sonra** | Aynı digest receipt sonrası hemen beta | [SPEKÜLASYON] 72 saat xplat/daemon soak sonrası beta | Community GA ile tek launch | **A** — SSOT beta hedefi; gate'ler zaten sabit (`docs/MASTER-PLAN.md:70,78,96`) | K6 exit 1, consent/trusted-publisher/Desktop onayı yoksa üçü de NO-GO. |
| 2 | **Verilmiş coordinator kararının migration biçimi** | Big-bang cutover | Single-writer + old/new dual-read strangler | Süresiz dual-write | **B** — rollback ve tek truth dengesi | İkinci reducer/digest owner veya iki writable truth yok. |
| 3 | **Surface delivery sırası** | Desktop-visible first | Contract/evidence→Terminal pin→Desktop | Terminal tamamen→Desktop | **B** — rework düşük, user proof sürekli | İki core dilimden uzun binary proof'suz ilerleme yok. |
| 4 | **Verilmiş scheduler strangler'ın retirement evidence threshold'u** | Yalnız iki reducer run | Sabit N shadow-run | Effect/checkpoint/restore coverage + iki gerçek reducer run | **C** (`docs/analysis/scheduler-unify-design-2026-07-11.md:219-228`) | `unknownEngine>0` veya effect parity açığı varken hiçbir threshold flip veremez. |
| 5 | **Monitoring-only dashboard'a cutover zamanı** | Tüm writes hemen kapanır | Capability-by-capability, equivalent Terminal/Desktop action sonrası | Desktop bütünü bitince tek switch | **B** — capability kaybı olmadan strangler | Dashboard'ın nihai monitoring-only rolü oy konusu değildir; yeni write eklemek NO-GO. |
| 6 | **Enterprise market etiketi** | Enterprise-ready şimdi | Tüm enterprise bitene kadar Community GA da beklesin | Community GA + dürüst Enterprise Preview; assurance sonrası Ent GA | **C** (`docs/adr/adr-g-016-product-vision.md:47-68`) | Advisory/role-optional path ile hard-ready claim yok. |
| 7 | **SP-2 açılışı** | Mevcut 120 kayıtla train | v2-only exploratory eval | Segment/provenance/completeness/FIX manifest sonrası train/promotion | **C** | v1/orphan/incomplete/receipt bilinmezken production promotion yok. |
| 8 | **Provider config migration** | Flat canonical'a kırıcı göç | Grouped canonical + conflict fail-loud + compatibility migration + invocation receipt | Homogeneous Claude'ı ürün standardı | **B** — mevcut type/migration contract'a uygun (`src/core/config-migration.ts:615-649`) | Silent duplicate/fallback veya receipt'siz mixed-fleet claim yok. |
| 9 | **born-666 install consent** | `--yes` provider CLI'ları kurar | `--yes` no-install; explicit `--install`/interactive scoped consent | Deckent hiçbir provider kurmaz, yalnız doctor instruction | **B** — repo önerisi ve air-gap dengesi (`docs/MASTER-PLAN.md:96`) | Non-interactive consent olmadan network/global mutation yok. |
| 10 | **GA yolu** | AI-moat first | Enterprise first | Evidence+surface spine; assurance parallel; sonra GA→Ent/SP-2/Hub | **C** | Mock-only veya feature-count gate yok. |
| 11 | **Altı dil yerleşimi** | Altı locale Community GA blocker | Mimari/key semantics şimdi, altı-locale acceptance Global GA gate | Yalnız EN/TR sürsün | **B** — no-hardcode mimarisi baştan, çeviri rollout'u kanıt-gated (`docs/MASTER-PLAN.md:31`) | Yeni user string hardcode veya surface-specific locale logic yok. |
| 12 | **Readiness yönetimi** | MASTER “DONE” yeter | Manual checklist | Delivery status + digest-pinned evidence scorecard + human product sign-off | **C** | Source delivery runtime/product assurance yerine geçmez. |
| 13 | **SLO/eşik sahipliği** | Repo'da sayı olmadan ilerle | Keyfi industry default | İlk workload baseline'ından sonra Alperen onaylı P50/P95/error-budget | **C** | Baseline'sız GA/scale claim veya ölçülemeyen SLO yok. |

## Önerilen tek cümlelik portföy kararı

**Beta'yı yalnız current same-digest gate'ler yeşil ve Desktop kabulü imzalıyken çıkar; hemen ardından shared durable RunFlowCoordinator + scheduler/provider/trace receipts'i kapat, Terminal'ı canonical proof client olarak tamamla, Desktop'ı aynı service'in full client'ı yap, dashboard'ı monitoring-only'ye kes; Community GA'yı bu surface/every-environment evidence'ına, Enterprise GA'yı hard assurance'a, SP-2/Hub/ERP/global-six-language genişlemesini de sırasıyla lineage/tenancy/global acceptance gate'lerine bağla** (`docs/MASTER-PLAN.md:20-39,70,79,155,252`; `docs/adr/adr-g-016-product-vision.md:31-68`).

## Karar sonrası ilk üç executable outcome

1. **Current release truth:** aynı commit/tarball üzerinde K6'nın alt nedenini kapatan validator receipt + born-666 kararı + npm OIDC setup + Desktop acceptance artefact'ı (`docs/MASTER-PLAN.md:70,78,96`).
2. **Cross-surface truth:** gerçek `do` run'ında flowId completion ve durable replay; aynı flow Desktop headless client tarafından görülür (`src/orchestra/sprint-finalizer.ts:1979-2000`; bugünkü açık `.deckent/runtime/jobs/sprint-430.json:97-129`).
3. **Execution truth:** iki reducer sprint'inde `executedEngine=reducer`, effect/checkpoint/restore parity; aynı runs'ta requested/effective provider/model ve trace segment manifest receipt'i (`src/orchestra/result-collector.ts:1542-1548`; `src/orchestra/scheduler-effects.ts:524-533`; `src/agent/trace-recorder.ts:320-375`).

Bu üç outcome yeni ürün özellikleri değil; Terminal, Desktop, enterprise, SP-2 ve Hub'ın üzerinde güvenle büyüyeceği ortak doğruluk zemini olacaktır (`docs/MASTER-PLAN.md:20-39`).
