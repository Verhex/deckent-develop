# Current friction ve certification durumu

Bu sayfa dated repository-status raporudur; future behavior sözü değildir. Active planning authority `docs/MASTER-PLAN.md` olarak kalır; bu sayfa onu edit etmez veya replace etmez. [Kanıt: `AGENTS.md:96-101`; documentation boundary, 2026-08-01]

## Product-user perspektifi

CLI, MCP, API, terminal, dashboard, desktop, connector, worker, memory ve Nervous surface'leri vardır fakat kabul edilmiş 2026-08-01 audit, unattended end-to-end orchestration'ı production publication için certify etmez. Consequential work için explicit observation ve approval boundary kullanın. [Kanıt: `PAZARTESI.md:36-60`; surface registration'ları `src/cli/index.ts`, `src/mcp/tools/index.ts`, `src/api/server.ts`]

### Bugün güvenle çıkarılabilecek sonuçlar

- Help render eden command register edilmiştir; side effect'inin doğru tamamlandığının kanıtı değildir. [Kanıt: recursive real-binary help audit, 2026-08-01]
- Worker-written result evaluation input'udur, terminal truth değildir. [Kanıt: `src/core/task-result-schema.ts:205-300`; `src/orchestra/result-evaluator.ts`]
- Task/summary/receipt consistency open defect iken PASS gate tek başına completion evidence değildir. [Kanıt: `PAZARTESI.md:54-58`]
- Configured feature yine de yalnız partially certified olabilir. [Kanıt: manifest status inventory ve `PAZARTESI.md:36-58`]
- Recovery ve cleanup state consequence taşıyan operator action'larıdır; önce inspect edin ve gerektiğinde owner authority alın. [Kanıt: gerçek `recover --help`, `cleanup --help`, 2026-08-01; `AGENTS.md:81-94`]

## Dogfood / repository gerçeği

### 2026-08-01'de kabul edilmiş stabilization blocker'ları

| Finding | Durum | Observable risk | Kabul edilen closure yönü |
|---|---|---|---|
| Scoped criteria isolation | ⚠️ açık | Başka task'tan ambient TypeScript error bir task verdict'ünü kirletebilir. | Yalnız bounded criterion/evidence set'i evaluate et. [Kanıt: `PAZARTESI.md:39-41`] |
| Repair scope augmentation | ⚠️ açık | FIX, NO_GO'ya neden olan aynı impossible scope'u devralabilir. | Diagnose edilen eksik path'leri explicit authority ile ekle. [Kanıt: `PAZARTESI.md:41`] |
| Generated-skill durability | ⚠️ açık | PLAN-created skill FIX öncesi kaybolup `FORCED_SKILL_UNAVAILABLE` üretebilir. | Admitted skill'i repair attempt boyunca koru. [Kanıt: `PAZARTESI.md:42`] |
| Atomic result writing ve malformed recovery | ⚠️ açık | Adı verilen üç malformed `.result` case collection'ı bloke etti. | Write'ları atomic, collector recovery'yi typed yap. [Kanıt: `PAZARTESI.md:43`] |
| Collect→evaluate→status transactionality | ⚠️ açık | Valid result ile EXECUTING state aynı anda bulunabilir. | Collection, evaluation ve status'u tek consistent transition olarak settle et. [Kanıt: `PAZARTESI.md:44`] |
| Continuous slot refill | ⚠️ açık | EXECUTE bitmeden capacity idle kalabilir ve repair work gecikebilir. | Admitted slot'ları sürekli refill et. [Kanıt: `PAZARTESI.md:45`] |

### Live build/recovery friction'ları

| Finding | Durum | Evidence-backed detay |
|---|---|---|
| `bot stop` identity guard | ⚠️ açık | Build-source-mismatch HOLD, bot'u durdurma/recover amaçlı command'ı da bloke etti; kayıtlı workaround OS SIGTERM'dir. [Kanıt: `PAZARTESI.md:47-49`] |
| Stale bot PID | ⚠️ açık | SIGTERM `bot.pid` kaldırmadı; clean dead PID'i tolerate etti fakat PID hygiene çözülmedi. [Kanıt: `PAZARTESI.md:48-49`] |
| Dashboard build/clean policy conflict | ⚠️ açık | `clean` preservation ile `build:dashboard` empty-output expectation `E_DASHBOARD_BUILD_OUTPUT_NOT_EMPTY` üretti. [Kanıt: `PAZARTESI.md:50`] |
| Stale run projection'ları | ⚠️ açık | On dokuz `STALE`/`STALE_DEAD` run-flow/run-job projection typed recovery gerektirir. [Kanıt: `PAZARTESI.md:51`] |
| Generated documentation projection'ları | ✅ owner tarafından kapatıldı | 2026-08-01 handoff beş missing output ve `IDENTITY_REGISTRY_MISSING` kaydetti; owner pipeline-owned input/output'ları restore ettikten sonra 2026-08-02'de `docs:ref:check` 5/5 ve master-plan lint green doğrulandı. [Kanıt: `PAZARTESI.md:52`; owner-verified pipeline/gate run'ları, 2026-08-02] |
| Provider observation migration | ⚠️ açık | Source schema v2 beklerken live DB v1 bildirir; migration docs değil runtime ownership kapsamındadır. [Kanıt: gerçek PRAGMA snapshot; `src/core/provider-execution-observation-store.ts:14,114-169`; OQ-07] |

### Ek documentation audit bulguları

- Legacy material `config show` gösterir fakat current CLI reddeder; read surface bare `deckent config`'dir. [Kanıt: real binary run'ları, 2026-08-01; `src/cli/commands/config.ts`]
- `connect --json`, canonical MCP registration 49 tool export ederken `toolCount: 31` bildirdi. [Kanıt: real binary output; `src/mcp/tools/index.ts:54-177`]
- Doctor Node guidance `>=18` derken package ve identity Node `>=24` ister. [Kanıt: `src/cli/commands/doctor.ts`; `src/core/errors.ts:139`; `package.json:115-118`; `.deckent/workspace/IDENTITY.md:10`]
- Static error registry `DECKENT_E079`'da biterken live source `DECKENT_E081`–`DECKENT_E091` emit eder. [Kanıt: `src/core/errors.ts`; repository error-code scan; `docs/tr/reference/errors.md`]
- Run-flow router comment'i dört route ve start yok derken dispatcher start/cancel/diff dahil sekiz action route implement eder. [Kanıt: `src/api/run-flow-routes.ts`; `docs/tr/reference/api-surface.md`]
- Config metadata, 164 effective default leaf'in yalnız bir alt kümesini kapsar ve default disagreement içerir. [Kanıt: `src/core/config.ts:2674-2850`; built `createDefaultConfig` leaf inventory]

Her item'ın ayrıntılı disposition, correct-side judgment, recommended direction ve evidence'ı [CODE-DOC-DIFF-2026-08](../../analysis/CODE-DOC-DIFF-2026-08.md) içindedir.

### Certification ladder

Kabul edilen ladder sıralıdır: tek successful task; üç-task dependency chain; intentional NO_GO→FIX→DONE; malformed-result recovery; NOT_DISPATCHED→recover; mixed-provider refill; 50-task smoke. Failed rung'da durulur ve aynı bounded case replay edilir. Acceptance; en az üç ardışık owner-intervention-free `COMPLETE + gate PASS` sprint, sıfır malformed result ve sıfır task/summary/gate/receipt contradiction gerektirir. [Kanıt: `PAZARTESI.md:54-56`]

Current verdict: **HOLD — publish-grade autonomous execution için certify edilmedi.** Bu, her surface'i broken saymaz; implemented component ile kapanmamış end-to-end proof'u ayırır. [Kanıt: `PAZARTESI.md:36-60`]
