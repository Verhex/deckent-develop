# Run lifecycle

## Product-user perspektifi

Deckent structured workflow beş operator moment içerir: intent tanımlama, plan inceleme, admitted work başlatma, observation/evaluation ve learning settlement. CLI bunları `plan`, `start`, `status`/`watch`, `review` ve `retro`/`finalize` olarak sunar. [Kanıt: registrations `src/cli/index.ts:119-160`; aşağıdaki command source'ları]

### Tanımla ve planla

`DIRECTIVES.md` structured sprint input'udur. `plan --dry-run`, structured ve provider-optional preview zorlar; task file yazılmadan döner. Normal planning directives'i interrogate edebilir, prompt/scope gate uygular ve planı sonraki execution için transition'a taşır. [Kanıt: `src/cli/commands/plan.ts:121-205,253-254,367-461`]

Help ile doğrulanmış syntax:

```bash
deckent plan --dry-run
deckent plan --interrogate
```

Bu exact help path'leri real binary'de çalıştırıldı; action'lar audit'te çalıştırılmadı. [Kanıt: recursive binary-help audit, 2026-08-01]

### Yalnız admission sonrası başlat

`start [description]`, structured mevcut directive veya zero-config description destekler. Flag'leri doctor, scope ve prompt gate için explicit bypass sunar; bu bypass'lar sıradan convenience flag değil authority decision'dır. `--dry-run`, worker spawn etmeden planlar. [Kanıt: `src/cli/commands/start.ts:246-345,790-915`]

```bash
deckent start --dry-run
deckent start --watch
```

Execution owner boundary nedeniyle burada çalıştırılmadı. [Kanıt: OQ-20]

### Gözlemle

`status`; snapshot, watch, follow, raw, verbose, graph veya JSON view render edebilir. `watch --follow <taskId>`, worker backend'e göre Docker log, tmux pane veya subprocess log seçer. [Kanıt: `src/cli/commands/status.ts:1024-1040`; `src/cli/commands/watch.ts:134-184`]

Gerçek `status --json` run; `IDLE`, active sprint yok, persisted read model ve provider-observation HOLD döndürdü. Gerçek `dashboard --json` run, `{"error":"No active sprint. Run deckent start first."}` ile exit 1 verdi; terminal dashboard project edecek run yokken dürüstçe fail eder. [Kanıt: real-binary output'lar, 2026-08-01]

### Review, explain ve retrospective

`review --json`, review state'i okur; modification flag'leri pending item'ları auto-decide veya approve/reject eder. Audit snapshot'ta read-only command unknown sprint id'li tek pending review döndürdü—clean settlement gibi sunulmaması gereken geçerli data-quality evidence. [Kanıt: `src/cli/commands/review.ts:184-224`; real output, 2026-08-01]

`retro --json`, 14/14 completed, sıfır NO_GO ve sıfır tech debt olan sprint-490'ı döndürdü fakat coverage value yoktu. `history --json --last 1`, aynı sprint'i `coverage: "0.0%"` ile döndürdü; absence/zero conflict current reporting gap'tir. [Kanıt: real output'lar, 2026-08-01; `src/cli/commands/retro.ts:334-342`; `src/cli/commands/history.ts:222-232`]

`finalize`, managed knowledge/config projection'larını günceller ve skip edilmedikçe decay koşar. Consequential settlement action'dır; retro'nun read-only eşanlamlısı değildir. [Kanıt: `src/cli/commands/finalize.ts:237-270`]

## Internal sekiz fazlı lifecycle

Intended sekiz operator-visible phase:

`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`

PLAN work'ü parse/gate eder; SPAWN worker attempt'larını admit eder; EXECUTE sonuçları toplar; EVALUATE evidence-backed verdict uygular; FIX eligible NO_GO work'ü retry eder; RETRO outcome'ları kaydeder; DECAY memory policy uygular; CLEANUP artifact'ları settle eder. [Kanıt: `src/orchestra/sprint-controller.ts:1594-1596,2912-2934`; `src/orchestra/sprint-phases.ts:4170-4207`; manifest `sprint-controller` entry]

Public `SprintPhase` type `DIRECTIVE`, `TRANSITION` ve `COMPLETE` içerir ama `CLEANUP` içermez; source comment'leri CLEANUP ile COMPLETE arasında çelişir. Canonical phase naming OQ-04'te typed `HOLD` kalır. [Kanıt: `src/core/sprint-types.ts:9-20`; OQ-04]

## Evidence ve settlement chain

Task result declaration ile completion olmaz. Current code result evaluation, task settlement authority, invocation receipt, RunFlow append record, checkpoint, audit event ve retrospective output içerir. Exact authority flow [Evidence ve settlement](../operations/evidence-and-settlement.md) dokümanındadır. [Kanıt: `src/orchestra/result-evaluator.ts`; `src/core/task-settlement-authority.ts`; `src/core/invocation-receipt-store.ts`; `src/core/run-flow-store.ts`; `src/orchestra/sprint-checkpoint.ts`]

## Dogfood / repository gerçeği

| Capability | State | Current constraint |
|---|---|---|
| CLI lifecycle surface | ✅ canlı | Tüm command/help path'leri register ve render olur. |
| Sekiz fazlı implementation | ⚠️ kısmi | Lifecycle code kapsamlıdır; public phase vocabulary internally inconsistent (OQ-04). |
| Status/read model | ✅ canlı | Gerçek idle snapshot ve typed HOLD evidence döndü. |
| Review/retro/history | ⚠️ kısmi | Read path'ler çalışır; unknown sprint review ve coverage representation conflict gözlendi. |
| Automated settlement | ⚠️ kısmi | PAZARTESI collect→evaluate→status transaction gap'leri ve all-roots-NO_GO karşısında PASS gate contradiction'ları kaydeder. |
| Unattended certification | ⚠️ kısmi | 0/31 intervention-free audit sonucu; certification ladder tamamlanmadı. [Kanıt: `PAZARTESI.md`] |

Tek başına green process exit'ten `COMPLETE` çıkarmayın. Status authority, task verdict, settlement evidence ve gate output'u birlikte okuyun. [Kanıt: production-wiring rule `AGENTS.md:42-55`; `PAZARTESI.md`]
