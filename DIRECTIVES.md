# DIRECTIVES — SPRINT-429: 11 MİKRO-TASK — NL→GERÇEK-PLAN (511) · TERM-7 API · PLANNER-PRECEDENCE · GATE-FIX'LER

## Goal
born-678 P0 NL→gerçek-plan sentezi (Task 1-2 — 511'in kalan yarısı, dilim-6.5) · born-677 delimiter (Task 3) ·
born-675 çok-noktalı-basename (Task 4) · born-676 executed-engine loud-log (Task 5, SCHED-8 önkoşulu) ·
planner brain_planning precedence Bug-1 + Bug-2-artığı (Task 6-7, eski 🔴) · TERM dilim-7 API-consumer (Task 8-10).
Born-spec'ler `.analysis/born-backlog.json`; TERM tasarımı `docs/analysis/term-flow-unify-design-2026-07-11.md` Sprint-7 satırı.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files'ına yaz · `.deckent/` runtime SALT-OKU · `.brain/`, `.tasks/` DOKUNMA · git stash-reset YASAK · `npm run build` YASAK · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-FIRST; test hermetik; 15dk-forensik-sınırı. i18n-FIRST (user-metni).

## Task 1: N678A — run-proposal-compiler'a planner-çekirdeği: NL→gerçek çok-task plan
- Model: sonnet | Agent: bug-fixer | Effort: high | Provider: claude
- Files: src/orchestra/run-proposal-compiler.ts, tests/orchestra/run-proposal-planner.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-678 spec'ini OKU (P0). Bugün compileProposal NL-hedeften tek-task TODO-SCAFFOLD üretiyor
(kendi yorumu: 'multi-task decomposition is a follow-up') → gate haklı olarak reddediyor, kullanıcı
çalışır plan alamıyor. FIX: compiler'a injectable planner-seam — prod'da sprint-planner'ın
AI/structured çekirdeği NL-hedefi GERÇEK çok-task plana çevirir (task-ayrıştırma + dosya-scope +
task-bazlı DOĞRULANABİLİR goCriteria/nogo; TODO-placeholder ölür); test'te fake-planner (hermetik —
gerçek AI-çağrısı YOK). buildPlanNlIntent canonical-ölü — DİRİLTME; planner-çekirdeği kullan.
Planner-hatası typed-hata (sessiz-scaffold'a düşme YOK — dürüst).
### goNogo
- goCriteria: NL→çok-task gerçek plan (fake-planner testli); TODO-placeholder üretimi ölü; planner-hatası typed; seam injectable; test yeşil.
- nogo: buildPlanNlIntent dirilirse NO_GO; sessiz-scaffold fallback NO_GO.

## Task 2: N678B — do/propose_run gate-yeşil uçtan-uca (511 hermetik kabulü)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: tests/cli/do-real-plan.test.ts
- Scope: tests/cli/
- Dependencies: Task 1
### Description
`deckent do` flag-on yolu fake-planner'lı gerçek çok-task planla: propose→preview(digest)→GATE
GEÇER→(--run --yes) snapshot-start (runSprint mock) zinciri e2e; ayrıca gate-kırmızı senaryosu
(kriter-siz plan) dürüst-red. 428'in term-flow-composition desenini kopyala-uyarla.
### goNogo
- goCriteria: gate-yeşil tam-zincir + gate-kırmızı dürüst-red e2e; test yeşil.
- nogo: gerçek sprint spawn NO_GO.

## Task 3: N677 — directives-builder delimiter-güvenliği
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/directives-builder.ts, tests/orchestra/directives-delimiter-safety.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-677 spec'ini OKU. CANLI-VAKA: NL-hedefte ';' → 'contains the ";" join delimiter — would not
round-trip' HARD-ERROR. Kullanıcı-metni delimiter-güvenli değil: builder liste-serializasyonunda
user-içeriği escape/normalize etsin (ya da delimiter-siz yapıya geçsin) — hard-error ölür,
round-trip korunur. Fixture: ';' · ',' · newline · backtick içeren NL-hedef üçlüsü.
### goNogo
- goCriteria: delimiter'li user-metni round-trip'li işlenir (hard-error yok); mevcut round-trip garantisi korunur; test yeşil.
- nogo: doğrulama tamamen kaldırılırsa NO_GO (güvence kalksın istemiyoruz — user-metni güvenli hale gelsin).

## Task 4: P675 — scope-sanitizer çok-noktalı basename düşürmesi
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/scope-sanitizer.ts, tests/orchestra/scope-sanitizer-multidot.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-675 spec'ini OKU. CANLI-VAKA: 'src/agent/assets/soul.default.md' Files+Scope nitelemesiyle bile
'default.md'/'soul.default.md' diye bölünüp WRITE-listesinden GERÇEKTEN düştü (gate doğru uyardı,
parser hatalı — sessiz-drop sınıfı). Path-tokenizer çok-noktalı basename'i (x.y.md, a.b.c.ts) tek
dosya-adı olarak korusun. Regresyon: soul.default.md + a.b.c.ts + dizin-önekli/öneksiz varyantlar.
### goNogo
- goCriteria: çok-noktalı basename korunur (drop yok); mevcut gerçek-drop davranışları (gerçekten öneksiz ad) korunur; test yeşil.
- nogo: sanitizer'ın gerçek-koruma davranışı gevşerse NO_GO.

## Task 5: L676 — scheduler executed-engine loud-log + journal alanı (SCHED-8 önkoşulu)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/scheduler-driver.ts, src/orchestra/scheduler-journal.ts, tests/orchestra/scheduler-executed-engine.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
born-676 spec'ini OKU. (a) sprint-start'ta BİR KEZ 'scheduler engine: legacy|reducer' loud-log
(mevcut sprint-log kanalı); (b) journal tick-kaydına additive executedEngine alanı (hangi kararın
YÜRÜTÜLDÜĞÜ — journal bugün iki kararı da yazıyor, yürüteni yazmıyor); eski-okuyucu kırılmaz.
### goNogo
- goCriteria: loud-log tek-satır; executedEngine additive+doğru; dual-read korunur; test yeşil.
- nogo: journal-şeması kırılırsa NO_GO.

## Task 6: PLNR1 — brain_planning top-level precedence (eski-🔴 Bug-1)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/core/config.ts, src/core/config-types.ts, src/orchestra/sprint-planner.ts, tests/orchestra/brain-planning-precedence.test.ts
- Scope: src/core/, src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
KANIT-BAĞLAM (2026-06-06'dan beri açık): DEFAULT_MODES 4 preset'te de brain_planning:'auto' hardcode
(config.ts ~397-428); top-level user `brain_planning` ResolvedConfig'te YOK → sprint-planner (~:245)
preset'in 'auto'sunu alır → kullanıcının top-level 'structured' niyeti YOK SAYILIR (init-template bu
knob'u reklamlıyor — kullanıcı tuzağı). FIX: top-level brain_planning typed-alan olur ve EXPLICIT
top-level, preset'i EZER (preset yalnız top-level-yokken kazanır); deckent-dev'in manuel
modes.performance maskesi davranışı değişmemeli (aynı sonucu üretir).
### goNogo
- goCriteria: top-level explicit > preset; top-level-yokken preset (bugünkü) korunur; init-template knob'u artık gerçek; test dört-preset kapsamlı; test yeşil.
- nogo: preset-only kullanıcıların davranışı değişirse NO_GO.

## Task 7: PLNR2 — structured-force guard'ına Agent/Skills override'ları (Bug-2 artığı)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/sprint-planner.ts, tests/orchestra/planner-override-precedence.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: Task 6
### Description
4640fc30'un guard'ı (sprint-planner ~:254) yalnız t.provider||t.forceModel kontrol ediyor — yalnız
`- Agent:`/`- Skills:` taşıyan direktif ai/auto'da structured'a zorlanmıyor → o override'lar AI-planner'da
düşüyor. Guard forceAgent/forceSkills'i de kapsasın; mevcut 4-case testine yeni case'ler eklenir.
### goNogo
- goCriteria: Agent/Skills-only direktif structured'a zorlanır (notify'lı); mevcut case'ler yeşil kalır; test yeşil.
- nogo: provider/model yolu değişirse NO_GO.

## Task 8: D71 — api/run-flow-routes: REST consumer (TERM-7)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/api/run-flow-routes.ts, tests/api/run-flow-routes.test.ts
- Scope: src/api/, tests/api/
- Dependencies: Task 1
### Description
ÖNCE OKU: TERM-tasarım Sprint-7 satırı ('Desktop aynı flow-service'i tüketir'). YENİ route-modülü:
propose (NL→proposal+preview) · preview-get · approve/reject · flow-state-get — HEPSİ mevcut
compiler/preview-service/reducer/store üstünden (yeniden-icat yok, terminal-controller'la aynı
servisler); mevcut api auth/rate-limit desenlerini izle; terminal.run_flow_v2 kapalıyken 404/kapalı
dürüst yanıt. Start-endpoint'i YOK (bu dilimde yalnız propose→approve; start dilim-sonrası karar).
### goNogo
- goCriteria: dört route servis-delegeli; flag-off dürüst-kapalı; auth/rate-limit mevcut desen; test yeşil.
- nogo: ikinci akış-kopyası NO_GO; start-endpoint eklenirse NO_GO.

## Task 9: D72 — run-flow SSE event-stream + server wiring (TERM-7)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/api/run-flow-event-stream.ts, src/api/server.ts, tests/api/run-flow-event-stream.test.ts
- Scope: src/api/, tests/api/
- Dependencies: Task 8
### Description
Flow-event'lerinin (versioned RunFlowEvent) SSE akışı: flowId-scoped subscribe; mevcut api SSE
desenini (server'daki emsal) kopyala-uyarla; server.ts'e route+stream kayıtları flag-duyarlı.
### goNogo
- goCriteria: flowId-scoped SSE; versioned-event şekli korunur; flag-off kapalı; test yeşil.
- nogo: global-broadcast (scope'suz) NO_GO.

## Task 10: D73 — API composition + consumer-pin güncellemesi (TERM-7 kapanışı)
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: tests/api/run-flow-api-composition.test.ts, tests/orchestra/run-flow-reducer.test.ts
- Scope: tests/
- Dependencies: Task 9
### Description
Route-level e2e: propose→preview→approve→state zinciri (fake-planner + mock-auth); SSE'de event-sırası.
VE (ders — bayat-pin sınıfı ölsün): run-flow-reducer.test KNOWN_CONSUMERS pinine Task 8-9'un yeni
meşru tüketicileri (api/run-flow-routes.ts, api/run-flow-event-stream.ts) yorum-satırlı eklenir.
### goNogo
- goCriteria: zincir e2e; pin güncel (allowlist-dışı sızıntı sıfır kalır); test yeşil.
- nogo: pin genişletmesi yorum-gerekçesiz olursa NO_GO.

## Task 11: HYG — 427-011 inventory-dosyası .deckent hijyeni doğrulaması
- Model: sonnet | Agent: bug-fixer | Effort: normal | Provider: claude
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/tool-inventory-hygiene.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
427-011'in persist'i `.deckent/<sprintId>-tool-inventory.txt` — sprint başına dosya birikir (temizlik
yok) ve yol düz `.deckent/` kökünde. (a) Yol `.deckent/runtime/tool-inventory/<sprintId>.txt`'e taşınır
(runtime-artifact evi; eski-yoldan okuma fallback'i BİR sürüm korunur — dual-read); (b) finalize/cleanup
akışındaki mevcut artifact-temizlik desenine bağlanır (birikme ölür); (c) gitignore-kapsamı doğrulanır.
### goNogo
- goCriteria: yeni-yol + dual-read; temizlik mevcut desenle; gitignore kapsıyor (testle); test yeşil.
- nogo: aktif-sprint inventory'si silinirse NO_GO.
