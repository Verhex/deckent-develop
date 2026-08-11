# OWASP ASI iş-planı yeniden doğrulaması — 2026-08-11

> **DURUM: UYGULANDI.** Alperen `G1 FILE` onayını 2026-08-11'de verdi; §9 paketi
> `docs/MASTER-PLAN.md`'ye uygulandı ve validator yeşil kapandı (**467 satır / 420 aktif**,
> projections in sync). Uygulama kaydı ve iki zorunlu sapma: **§14**.
> **Katman kuralı korunur:** 2026-08-05/06 tarihli 9 authority tasarımı ve Codex transkripti
> byte-sabittir; bu tur da onlara dokunmadı, düzeltmeler yalnız ledger evidence katmanında yaşar.
> **§9 metinleri tarihsel öneridir** — gerçekte uygulanan biçim §14'te kayıtlıdır.

---

## 1. Neden bu tur var

2026-08-06'da `CROSS-VERIFICATION-2026-08-06.md` 22 kod-truth iddiasını `HEAD 77bc721ae`
üzerinde doğruladı ve T1–T7 iş planını üretti. Aradan **243 commit** geçti. Owner'ın tespiti
("bu alana fazla dokunmadık") büyük ölçüde doğrudur — ama **tamamen** doğru değildir: güvenlik
yolundaki 7 dosya değişti ve bunlardan ikisi bulgu durumunu **tersine çevirdi**.

Ayrıca bu arada iki yapısal olay oldu:

1. **Repo topolojisi değişti** (commit `b5fca0039`, owner kararı 2026-08-11): `docs/` yalnız
   ürün dokümantasyonu; audit/transkript/prompt malzemesi `.analysis/` altına taşındı.
   Sonuç: ledger'daki `docs/audits/...` atıfları **kırıldı** (bkz. §8.1).
2. **Yeni bir baseline dokümanı üretildi**: `follow-up-works/owasp-asi-baseline-2026-08-11.md`
   (in-flight sprint çıktısı; ilk yazıldığı `docs/security/` konumundan taşındı).
   Bu doküman 4190'ın acceptance'ını **karşılamıyor** ve 6 adet var-olmayan dosya yolu
   içeriyor (bkz. §7).

**İş özeti (kod açmadan):** Beş gün önce çıkardığımız güvenlik açığı listesinin çoğu hâlâ
geçerli. İki tanesi bu arada kısmen kapandı — ama ledger'da hâlâ "hiç kapanmadı" yazıyor,
yani plan gerçekten daha iyi durumda olduğumuzu göstermiyor. Bir tanesi ise iki ayrı şeyi
aynı isim altında karıştırdığı için "kapandı" görünme riski taşıyor. Bugün üretilen yeni
güvenlik raporu ise dosya yollarını tahmin ettiği için kanıt değeri taşımıyor. Ve en
önemlisi: owner'ın onayladığı 9 tasarım belgesinin 8'i iş planında hiç anılmıyor.

---

## 2. Durum çıpası

| Alan | 2026-08-06 turu | Bu tur (2026-08-11) |
|---|---|---|
| HEAD | `77bc721ae` | `9722a8cee` (doğrulama koşumu `b5fca0039`'da yapıldı) |
| Branch | `train-2026-08-06-o` | `train-2026-08-10-dogfood-ecosystem-plan` |
| Aradaki commit | — | **243** |
| MASTER-PLAN | eski yapı | yeniden yazılmış: 1715 satır, P00–P10, **454 satır / 407 aktif** |
| Validator | — | `lint-master-plan.mjs --check` → **OK**, projections in sync |
| Tasarım dokümanları | `docs/audits/` | `.analysis/audits/` (byte-sabit, mtime 2026-08-08 14:13) |

Güvenlik yolunda `77bc721ae..HEAD` arasında değişen dosyalar (yalnız ilgili küme):

```
src/api/terminal/ws-gateway.ts         |  40 +++-
src/core/config.ts                    | 109 +++++------
src/core/plugin-hooks.ts              | 132 ++++++++++++--      ← durum değiştirdi
src/orchestra/result-evaluator.ts     |  22 ++-
src/orchestra/spawn-backend-docker.ts | 179 +++++++++++++-----
src/orchestra/sprint-controller.ts    |  31 +++-                ← durum değiştirdi
src/orchestra/sprint-spawner.ts       | 334 ++++++++++++++++++++++++++++++++--
```

Diğer bulgu dosyalarının hiçbiri (audit-writer, cost-gate, tool-scope-gate, worker,
self-modifying-detector, authority-matrix, approval-contract, command-guard,
session-manager, provider-command-spec, mcp-client/config, auditor) **değişmedi**.

---

## 3. 33 iddianın yeniden doğrulaması

Sınıflar: `SABİT` = iddia ve satır aynı · `KAYDI` = iddia geçerli, satır numarası değişti ·
`DÖNDÜ` = iddianın durumu değişti · `YOL-YANLIŞ` = atıf edilen yol yok.

| # | İddia | Güncel konum | Sonuç |
|---|---|---|---|
| 1 | `AUDIT_HMAC_SECRET = 'deckent-audit'` sabit | `src/core/audit-writer.ts:35` | **SABİT** |
| 2 | `registerPluginHooks` securityConfig opsiyonel → atlanabilir | `src/core/plugin-hooks.ts:252,259` | **KAYDI** (166→252) |
| 3 | `loadPluginHooks` production'da opsiyonsuz çağrılıyor | `src/orchestra/sprint-controller.ts:1667` | **DÖNDÜ** → §5.1 |
| 4 | Cumulative spend gate warn-only | `src/core/cost-gate.ts:237,254,325` | **SABİT** |
| 5 | `enforce_spend_gate` yalnız uyarı açıyor | `src/core/cost-gate.ts:254` (`if (!limits.enforce_spend_gate) return null;`) · key `cost-config-loader.ts:90` | **KAYDI** (78→90) |
| 6 | `resource-monitor` gerçek harcama üretmiyor | `src/orchestra/resource-monitor.ts` → `costUsd` **0 eşleşme** | **SABİT** |
| 7 | Honest-gate `filesWrite` boşsa fail-open | `src/orchestra/result-evaluator.ts:2402` | **KAYDI** (2381→2402) |
| 8 | `.md` yazımları boundary kontrolünden muaf | `src/orchestra/result-evaluator.ts:2434` (`CONTROL_MD_FILES` hariç) | **KAYDI** (2409→2434) |
| 9 | Auditor git-diff alert-only + untracked-körü | `src/monitor/auditor.ts:752` `checkBoundaryViolations` → `git diff --stat`; tüketim `:1351`, alert `:1435` | **SABİT** |
| 10 | Docker `inspectionOnly` write-source türetimi | `src/orchestra/spawn-backend-docker.ts:3627-3628` | **KAYDI** (3567→3627) |
| 11 | Docker implementation worker'ı proje RW mount alıyor | `src/orchestra/spawn-backend-docker.ts:5762` | **KAYDI** (5664→5762) |
| 12 | `sprint-spawner` write-target'a `directories`'i koşulsuz katıyor | `src/orchestra/sprint-spawner.ts:515` | **SABİT** (davranış) / **KAYDI** (416→515) |
| 13 | `allowedTools` dalı `writeTargets` boşsa scope'suz | `src/orchestra/sprint-spawner.ts:1091` | **KAYDI** — 2026-08-06'da çürütüldü (`'.tasks/'` daima var → dal ulaşılamaz); gerçek bulgu #12'dir |
| 14 | `autoApprove` default `true` | `src/orchestra/execution-request-builder.ts:177` | **SABİT** |
| 15 | RBAC permissive default (aktör/rol yoksa `permit`) | `src/nervous/authority-matrix.ts:307,323-327` | **SABİT** |
| 16 | Terminal command-guard yalnız `shell` kind'ında çalışıyor | `src/api/terminal/command-guard.ts:55` | **SABİT** |
| 17 | Session host default `localhost` (üçüncü bypass) | `src/api/terminal/session-manager.ts:120` | **SABİT** |
| 18 | Session kimliği principal/owner/project taşımıyor | `src/api/terminal/types.ts` — `tenantId?: TenantId` (default `'local'`) dışında kimlik yok | **SABİT** |
| 19 | Approval `authorization` envelope opsiyonel | `src/core/approval-contract.ts:208` | **KAYDI** (207→208) |
| 20 | `approval.gate_enabled` default `false` | `src/core/config.ts:1527` | **KAYDI** (1523→1527) |
| 21 | Scope gate git hatasında fail-open | `src/orchestra/sprint-controller.ts:1940` | **KAYDI** (1917→1940) |
| 22 | Scope-gate persist hatası yutuluyor | `src/orchestra/sprint-controller.ts:1980` | **KAYDI** (1957→1980) |
| 23 | Planner memory enjeksiyonunda `source` düşüyor | `src/orchestra/sprint-planner.ts:179` | **KAYDI** (173→179) |
| 24 | Retro yazarı her kaydı `source: 'brain'` etiketliyor | `src/orchestra/sprint-retro-writer.ts` — **6 eşleşme** | **SABİT** |
| 25 | Identity katmanları ayrımsız birleşiyor | `src/agent/identity.ts:68` (`parts.join('\n\n')`) | **KAYDI** (52-69→68) |
| 26 | `stablePrefixKey` production caller'ı yok | `src/orchestra/prompt-segmentation.ts:232`; yalnız `tests/orchestra/prompt-segmentation.test.ts` | **SABİT** |
| 27 | `run-flow-plan-service` fail-closed (doğru olan) | `src/orchestra/run-flow-plan-service.ts:470,480` `SCOPE_GATE_HOLD` | **SABİT** |
| 28 | `skill.ts` kopyalamadan önce `rmSync` yapıyor | `src/cli/commands/skill.ts:384,459` | **SABİT** |
| 29 | `resolveSkillPrompts` digest/provenance taşımıyor | `src/orchestra/result-collector.ts:1005` | **SABİT** |
| 30 | Gate hatası "treat-as-honest" düşüyor | `src/orchestra/sprint-phases.ts:1760-1778` | **KAYDI** (1686→1760) |
| 31 | `tool-scope-gate` production caller'ı yok | `src/core/tool-scope-gate.ts:117` `createScopeGate`; yalnız `tests/core/tool-scope-gate.test.ts:18` | **SABİT** |
| 32 | `enforceSelfModifyingTask` production caller'ı yok | `src/orchestra/self-modifying-detector.ts:201`; yalnız `tests/orchestra/self-mod-enforce.test.ts` | **KAYDI** (203→201) |
| 33 | `SkillSandbox.requireSafe` production caller'ı yok | `src/core/marketplace/skill-sandbox.ts:297` — `requireSafe` çağrısı yok; `src/core/plugin-loader.ts:92` farklı giriş kullanıyor | **SABİT** |

Ek doğrulamalar (2026-08-06 turunda yoktu):

| # | İddia | Güncel konum | Sonuç |
|---|---|---|---|
| 34 | `checkWorkerAuthority(enforceRbac)` UNWIRED | **İSİM ÇAKIŞMASI** → §5.2 | **DÖNDÜ** |
| 35 | `provider-command-spec` codex/gemini `allowedToolsFlag: null` | `src/core/provider-command-spec.ts:129,145` | **SABİT** (yol düzeltildi) |
| 36 | Klonlanan `.mcp.json` default güvenilir | `src/mcp-client/config.ts:43,46,57` — `includeProjectScope` default `true` | **SABİT** (MCP kararla DEFERRED) |
| 37 | detect-secrets hook kurulu değil | `.pre-commit-config.yaml` var ama işaret ettiği `.secrets.baseline` **yok**; `.git/hooks/pre-commit` **kurulu değil** | **SABİT + keskinleşti** (çifte inert) |
| 38 | `self_mod_enforce` config-types'ta tanımsız | `src/core/config-types.ts` — yok (`enforce_rbac` `:1699` var) | **SABİT** |

**Bilanço: 38 iddia · 2 DÖNDÜ · 15 KAYDI · 21 SABİT · 0 çürütüldü.**
Hiçbir bulgu "kendiliğinden düzeldi" diye kapanmadı; iki tanesi gerçek kodla kapandı.

---

## 4. Satır-kayması: neden bu tek başına bir iş maddesi

Ledger satırları ve 9 tasarım dokümanı `file:line` atıfları üzerine kurulu. 243 commit sonra
15 atıf kaydı — bunlardan bazıları 60+ satır. Örnek: `sprint-spawner.ts:416 → :515`,
`sprint-phases.ts:1686 → :1760`, `plugin-hooks.ts:166 → :252`.

**Sonuç:** ledger'daki `file:line` atıfları **kanıt değil, iz**dir. §9'daki her evidence
tazelemesi bunu açıkça yazar. Kalıcı çözüm için satır numarası yerine sabit sembol adı
(`createScopeGate`, `checkBoundaryViolations`) atıfı tercih edilmelidir — bu, N5'in
crosswalk çıktısına bağlı bir kayıt disiplini önerisidir, ayrı bir satır değildir.

---

## 5. Durum değiştiren iki bulgu

### 5.1 Plugin-hook güvenlik pipeline'ı artık kablolu (row 7031)

2026-08-05 bulgusu: `sprint-controller.ts:1654` opsiyonsuz `loadPluginHooks` çağırıyordu →
`securityConfig undefined` → 4-adımlı pipeline production'dan hiç koşmuyordu.

**Güncel gerçek** (`src/orchestra/sprint-controller.ts:1655-1677`):

```ts
// row 7031: the production load carries the real plugin-security config, so the 4-step
// pipeline (allowed-path containment · SkillSandbox AST scan · SHA-256 integrity ·
// Ed25519 publisher identity) actually runs here instead of being skipped by an
// undefined config. Enforcement stays advisory unless the operator sets
// `plugins.security_enforcement: "enforce"` — flipping that default is an owner decision.
try {
  await loadPluginHooks(projectRoot, { ... });
```

`resolvePluginSecurityEnforcement` `:165`'te import edilmiş; `plugin-hooks.ts:322-328`
config'i çözüp `registerPluginHooks(plugin, securityConfig, enforcement)`'a veriyor.

**Ama kapanmadı — iki tipli residual:**

1. **`plugins.security_enforcement` `config-types.ts`'te tanımlı değil.** Kod bunu kendi
   dokümante ediyor (`src/core/plugin-hooks.ts:159`): *"`plugins.security_enforcement` is
   not declared in config-types.ts yet (that file is [bu dilimin write authority'si
   dışında])"* ve tipsiz cast ile okuyor (`:167`). Yani enablement authority'si typed
   değil → `E=~`, `E=1` değil.
2. **Default `advisory`.** `plugin-hooks.ts:278` ihlalde
   `PLUGIN_SECURITY_ADVISORY: ... loading anyway` basıyor. Fail-closed **değil**.

→ Row 7031: `OPEN 1/0/0/?/0/?/?` **yanlış**; gerçek `VERIFY 1/1/~/1/0/?/?`.
→ Yeni child satır gerekli (§9, **N1**).

### 5.2 `checkWorkerAuthority` — iki ayrı fonksiyon, tek isim

Row 4200 ve owner prompt'u tek bir "UNWIRED `checkWorkerAuthority(enforceRbac)`
(`agents/worker.ts:795`)" maddesi taşıyor. Gerçekte **iki farklı fonksiyon** var:

| | A — ADR-037 file-scope | B — RBAC |
|---|---|---|
| Konum | `src/agents/worker.ts:795` | `src/nervous/authority-matrix.ts` |
| İmza | `(filePath, scope, projectRoot, taskId, …)` | `(req, { enforceRbac, audit })` |
| Production caller | **YOK** (yalnız `tests/agents/worker-authority.test.ts`) | **VAR** |
| Durum | **UNWIRED** | **CONFIG-GATED** |

B'nin production zinciri: `src/orchestra/backlog-trigger.ts:32` (`checkBacklogEntryRbac`) ve
`src/orchestra/sprint-runtime.ts:33` (`checkSprintSpawnRbac`) → tüketiciler
`src/orchestra/autonomous/runtime-loop.ts:49-50` ve `src/orchestra/sprint-spawner.ts:377`
(`collectRbacBlockedTaskIds`). Flag: `enforce_rbac` (`config-types.ts:1699`).
Permissive default korunuyor: `authority-matrix.ts:307` — *"No actor / no role / unknown
role → `permit` (allow-all; backward-compatible)"*.

**Risk:** Row 4200 bu iki şeyi tek madde saydığı için, B'nin kablolanması A'yı da
"kapandı" gösterebilir. Ledger'ın ayırması zorunlu (§9, **E3**).

---

## 6. Değişmeyen ana riskler (özet)

| ASI | Risk | Enforcement sınıfı (bugün) | Sahip satır |
|---|---|---|---|
| ASI01 / ASI06 / ASI09 | Content-provenance ve taint sınırı yok; memory/identity/retro katmanları ayrımsız birleşiyor | **UNWIRED** | 4125 |
| ASI02 / ASI03 / ASI05 | codex/gemini worker'ında runtime write-scope yok (`allowedToolsFlag: null`); claude'da koşulsuz `Bash` grant'i path-scoping'i boşa düşürüyor | **ADVISORY** (typed+auditable, 2026-08-08 settlement) | 4060 |
| ASI04 | Plugin pipeline kablolu ama advisory + key typed değil | **CONFIG-GATED** | 7031 + N1 |
| ASI04 | Klonlanan `.mcp.json` default güvenilir | **UNWIRED** | 7040 (MCP kararla DEFERRED) |
| ASI06 | `AUDIT_HMAC_SECRET` sabit → audit zinciri kaynak-sahibi adversary'ye karşı sahtelenebilir | **ADVISORY** | 4120 + N2 |
| ASI07 | Agent-arası mesajlarda (`.tasks/*.json`, `.result`, TASK_ASSIGN) authentication/integrity/replay koruması yok | **UNWIRED** | **SAHİPSİZ** → §10 O1 |
| ASI08 | Honest-gate worker beyanına güveniyor (`:2402` fail-open, `:2434` `.md` muafiyeti); auditor alert-only + untracked-körü; scope gate git hatasında fail-open | **ADVISORY** | 4200, 3295 |
| ASI10 | 3 enforcement modülü hâlâ 0 production caller: `createScopeGate`, `worker.ts:795`, `enforceSelfModifyingTask`, `requireSafe` | **UNWIRED** | 4200 |
| — | Spend tavanı warn-only; gerçek harcama üreticisi yok (`resource-monitor` 0 `costUsd`) | **ADVISORY** | 4091 → 4092 |
| — | Approval `authorization` envelope opsiyonel; `gate_enabled` default `false`; `autoApprove` default `true` | **CONFIG-GATED** | 4050, 4054 |
| — | Terminal: command-guard yalnız `shell`; host default `localhost`; session kimliği principal taşımıyor | **ADVISORY** | **SAHİPSİZ** → N4 |
| — | detect-secrets çifte inert (`.secrets.baseline` yok + hook kurulu değil) | **UNWIRED** | 4200 |

---

## 7. `follow-up-works/owasp-asi-baseline-2026-08-11.md` değerlendirmesi

Bugün üretilen doküman **dürüst bir sınır beyanı** taşıyor ("read authority implementation
yollarını açmadı, bu yüzden her verdict `open`") — bu doğru bir refleks. Ancak iki sorun var:

### 7.1 Uydurulmuş dizin önekleri (6 adet)

Owner prompt'u (`follow-up-works/CODEX-OWASP-ASI-PROMPT.md`) yalnız **çıplak dosya adları** veriyor
(`audit-writer.ts:35`, `provider-command-spec.ts:129,145`, `command-guard.ts:54-55`…) —
tam yolları **hiç içermiyor** (dosyada tek bir `src/**.ts` yolu yok). Baseline dokümanı bu
adlara dizin öneki **tahmin ederek** ekledi ve "Evidence path" kolonunda kanıt gibi sundu.
6'sı yanlış:

| Dokümanda yazan | Var mı | Gerçek yol |
|---|---|---|
| `src/orchestra/audit-writer.ts:35` | ✗ | `src/core/audit-writer.ts:35` |
| `src/orchestra/plugin-hooks.ts:225-238` | ✗ | `src/core/plugin-hooks.ts` (~`:259-290`) |
| `src/orchestra/plugin-loader.ts` | ✗ | `src/core/plugin-loader.ts` |
| `src/orchestra/command-guard.ts:54-55` | ✗ | `src/api/terminal/command-guard.ts:55` |
| `src/orchestra/tool-scope-gate.ts` | ✗ | `src/core/tool-scope-gate.ts:117` |
| `src/providers/provider-command-spec.ts:129,145` | ✗ | `src/core/provider-command-spec.ts:129,145` |

Doğru olanlar: `src/agents/worker.ts:795`, `src/orchestra/self-modifying-detector.ts` (`:201`,
doküman `:203` diyor), `src/mcp-client/config.ts:46,57`, `src/monitor/auditor.ts:752-791`,
`src/orchestra/result-evaluator.ts:2380-2430` (bugün `:2402-2434`),
`src/orchestra/sprint-controller.ts:1654/1922` (bugün `:1667/:1940` — ve `:1654` bulgusu artık
kapandı, bkz. §5.1).

### 7.2 4190'ın acceptance'ını karşılamıyor

Row 4190 acceptance: *"10 ASI riskinin tamamı kod-referanslı (file:line) enforcement sınıfıyla
haritalanır; her gap ya mevcut bir ledger satırına bağlanır ya yeni satır önerisi olur."*

Doküman: 10/10 verdict `Open`, **0 enforcement sınıfı** atanmış, 8/10 satırda
`MASTER row: Not identified`. Kendi "Cross-cutting control inventory" bölümü bunu açıkça
söylüyor: *"This document does **not** classify any of them as covered or partially covered."*

→ **Değerlendirme:** dürüst bir *ön-not*, baseline **değil**. Row 4190 `Truth 0/0/0`
kalmalı ve evidence bunu kayda geçirmeli ki doküman sonradan baseline sanılmasın (§9, **E4**).
Bu tur (§3 + §6) 4190'ın acceptance'ının **kod-truth yarısını** üretti; kalan yarı
her ASI'nin sahip satırına bağlanmasıdır — E-serisi tam olarak onu yapıyor.

---

## 8. Ledger kapsama analizi

### 8.1 Kırık atıf

`docs/MASTER-PLAN.md:1040` (row 4125) acceptance'ı hâlâ
`docs/audits/content-provenance-context-integrity-authority-design-2026-08-06.md` diyor.
Bu yol **yok** — dosya `.analysis/audits/` altında. (`docs/MASTER-PLAN.md:914` de iki
`docs/audits/...` proof dosyasına atıf yapıyor, aynı düzeltme gerekir.)

Commit `b5fca0039` gerekçesinde *"they stay tracked so ledger citations keep resolving"*
yazıyor — dosyalar tracked kaldı ama **yol atıfları güncellenmedi**. `DOCS-TOPOLOGY-001`
(row 140) topolojiyi kodifiye etmekle yükümlü; bu atıf düzeltmesi onun kapsamında ya da
E1 ile ayrıca kapatılır.

### 8.2 8 tasarım dokümanı ORPHAN

Sahiplik **çıkarım değil**: 9 dokümanın **tamamı** kendi başlığında canonical ledger
sahibini `(order NNNN)` token'ıyla beyan ediyor. Aşağıdaki "Beyan edilen sahip" kolonu
dokümanların kendi metninden alınmıştır; "Ledger atıfı" kolonu ise `grep -c` ile
MASTER-PLAN'da ölçülmüştür.

| Onaylı tasarım | Ledger atıfı | Dokümanın kendi beyan ettiği sahip |
|---|---|---|
| `plugin-admission-authority-design-2026-08-05.md` | **0** | `PLUGIN-SANDBOX-WIRE-001` (order 7031) → 7030, 7020, 7000 |
| `rolling-spend-budget-authority-design-2026-08-05.md` | **0** | `LIMIT-SPEND-ENFORCE-001` (order 4091) → 4090, 4000, 4070 |
| `audit-authority-integrity-design-2026-08-06.md` | **0** | `AUDIT-001` (order 4120) → 4000, 4010, 4030 |
| `provider-neutral-worker-execution-authority-design-2026-08-06.md` | **0** | `TOOL-AUTHORITY-001` (order 4060) → 4000, 4030, 4040 |
| `attempt-effect-attribution-authority-design-2026-08-06.md` | **0** | `TRUST-HANDOFF-001` (order 4180) → 3175, 4060, 3040 |
| `enforcement-module-disposition-authority-design-2026-08-06.md` | **0** | `SEC-ENFORCE-WIRE-001` (order 4200) → 4060, 4140, 4180 |
| `terminal-session-execution-authority-design-2026-08-06.md` | **0** | 4190 (assurance) + 4200 (disposition) + authority owners 4010/4020/4030/4040/4050/4060/**4130**/4180 + product owners 5000/5010… |
| `project-inventory-scope-admission-authority-design-2026-08-06.md` | **0** | 4200 (disposition) + 4190 (assurance) + **truth/evidence owner `TRUTH-BASELINE-001` (40)** + 4040/4060/4180 + 8010 (platform) |
| `content-provenance-context-integrity-authority-design-2026-08-06.md` | 1 | 4190, `PROMPT-001` (9020), `MEMORY-AUTHORITY-001` (190) — dedicated sahip 4125 sonradan (2026-08-08) açıldı ✅ |

Bu tabloyla §9'un E-serisi eşlemeleri **birincil kaynakla** doğrulanmış olur. Yalnız iki
noktada karar gerekiyor:

- **A7** tek bir dedicated sahip beyan etmiyor; 4130 `API-SECURITY-001`'i authority owner
  olarak sayıyor. §9'daki **N4** bu yüzden 4130'un child'ı olarak önerilmiştir (kendi
  başına yeni bir parent değil).
- **A9** kendi metninde 4125'i saymıyor (4125 dokümandan iki gün SONRA açıldı) — bu, §9'un
  E1'inin neden gerekli olduğunu ayrıca doğrular.

**10. doküman (bugün eklendi):** `follow-up-works/dep-supply-defense-2026-08-11.md`
(21967 byte, "evaluation only") — npm dependency supply-chain savunmasını
Dependency Execution Broker olarak tasarlıyor, sahibi `DEP-SUPPLY-DEFENSE-001` (row 7100,
`OPEN 0/0/0/?/0/?/?`, `Updated 2026-08-04`). MASTER-PLAN'daki atıf sayısı: **0** → aynı
ORPHAN durumu, §9'da **E13**.

Row 4125'in evidence'ı bu durumu zaten tiplemiş:
*"2026-08-08 envanter: onaylı tasarım dokümanı ORPHAN'dı, hiçbir ledger satırı referans
vermiyordu — SSOT kuralı gereği açıldı."*

**Aynı kural 8 doküman için daha geçerli.** MASTER-PLAN §1: *"Analysis, handover,
specification, retrospective, memory ve evidence belgeleri yeni iş saklayamaz."*
8 onaylı tasarım şu an tam olarak bunu yapıyor.

### 8.3 Yasa-2 ihlali (ADR-recall) sürüyor

9 dokümanın 8'i **sıfır ADR** atıfı taşıyor. 4 doğrudan-alan çakışması:

| Tasarım | Çakışan ADR | ADR durumu (2026-08-11'de doğrulandı) | Çatışma | Reconciliation yolu |
|---|---|---|---|---|
| A6 enforcement-module-disposition | `ADR-G-021` self-modifying detection | **`Immutable: yes`** · accepted · Enforcement: runtime detection + rollback-guard | A6 D11 bu modeli retire etmeyi öneriyor | **successor ADR** (in-place yasak) |
| A7 terminal-session-execution | `ADR-G-029` embedded web terminal | **`Immutable: yes`** · accepted (provisional) | ADR `command/prompt guard`'ı **delivered** sayıyor; kod ise guard'ı yalnız `shell` kind'ında çalıştırıyor | **successor ADR** (in-place yasak) |
| A2 rolling-spend-budget | `ADR-G-037` execution-budget/landing | `Immutable: **no**` · `Enforcement-Level: hard` | ADR 9-maddelik landing/budget authority'yi zaten bağlamış (immutable owner hard ceiling, landing asla genişletmez, `LANDED` ≠ DONE/NO_GO) | **in-place amendment** yeterli |
| A3 audit-authority-integrity | `ADR-G-039` key custody/rotation | `Immutable: **no**` · `Enforcement-Level: hard` | HMAC + tek-aktif-imza-anahtarı + zorunlu HKDF-SHA256 domain separation **kabul edilmiş tasarım**; A3 onu kaza sanıyor | **in-place amendment** yeterli |

İki ayrı yol olduğu bu turda kesinleşti: `ADR-G-021` ve `ADR-G-029` `Immutable: yes` →
in-place dokunulamaz, `ADR-G-019` prosedürüyle **successor** gerekir. `ADR-G-037` ve
`ADR-G-039` `Immutable: no` → **amendment** yeterlidir (`ADR-G-037` zaten 2026-07-25'te
bir kez amend edilmiş). Bu ayrım, N5'in iş yükünü ikiye böler.

İki ek doğrulama:

- `ADR-G-029` status satırı kendi eksiklerini **zaten kaydediyor**: *"terminal-audit
  runtime-wiring is NOT wired [AUDIT-WIRE]: inv#3 clause-2 no-op sink; TerminalConfig
  hardcoded [TERM-CONFIG-WIRE]"*. Yani N4'ün iki maddesi ADR tarafından kabul edilmiş
  boşluklardır — çatışma yalnız `command/prompt guard = delivered` iddiasındadır.
- `ADR-G-039` decision metni açıkça diyor: *"Approval ingress, recurring-trigger occurrence
  ledger, and sealed evidence archive remain separate dependent slices under their already
  approved contracts."* Yani approval-ingress'in onaylı bir contract'ı **var**; approval
  işi sıfırdan tasarlanmaz, o contract'a bağlanır.

**Bu, implementation'ın önündeki gerçek kapıdır** ve sahibi yok → §9, **N5** (row 4191).

---

## 9. Önerilen MASTER-PLAN değişiklikleri

> Aşağıdaki metinler uygula-hazırdır. **Hiçbiri uygulanmadı.** `G1 FILE` onayı §11'de.
> Tüm `Updated` = `2026-08-11`. Order slotlarının boş olduğu doğrulandı.

### 9.1 E-serisi — mevcut satırlarda evidence/state tazeleme

**E1 · row 4125 `PROVENANCE-CONTEXT-001`** — kırık atıf + kanıt.
- Acceptance: `docs/audits/...` → `` `.analysis/audits/content-provenance-context-integrity-authority-design-2026-08-06.md` ``
- Evidence sonuna ekle:
  > `2026-08-11 yeniden doğrulama (b5fca0039): tasarım yolu .analysis/ taşınmasıyla kırıldı, düzeltildi. Kod-truth sabit — planner memory enjeksiyonu source'u düşürüyor (sprint-planner.ts:179), retro yazarı 6 kaydı koşulsuz source:'brain' etiketliyor, identity katmanları ayrımsız birleşiyor (identity.ts:68), prompt-segmentation stablePrefixKey (prompt-segmentation.ts:232) 0 production caller. Bu satır kanıtın enforcement üretmediğini kanıtlar, provenance authority'sinin var olduğunu kanıtlamaz.`

**E2 · row 7031 `PLUGIN-SANDBOX-WIRE-001`** — durum döndü.
- Truth: `1/0/0/?/0/?/?` → `1/1/~/?/0/?/?`
- State: **`OPEN` kalır.** Validator `scripts/lint-master-plan.mjs:2895` kuralı:
  *"VERIFY mutation claim requires a scoped receipt or typed historical provenance"* —
  elimde `receipt=GR-...` token'ı yok (kıyas: 4060 da `VERIFY` ve dört receipt taşıyor).
  `VERIFY`'a taşımak ayrı bir owner receipt'i gerektirir, bu tur onu üretmedi.
- `H` neden `1` değil: bu turda **hiçbir test koşulmadı**. Satırın mevcut evidence'ı
  ayrıca *"green tests gerçek fail-closed admissionı kanıtlamıyor"* diyor — yani var olan
  yeşil testler `H=1` üretmiyor. `H=?` dürüst değerdir.
- Evidence sonuna ekle:
  > `2026-08-11 yeniden doğrulama (b5fca0039): kablolama LANDI — sprint-controller.ts:1667 gerçek plugin-security config'iyle loadPluginHooks çağırıyor, resolvePluginSecurityEnforcement :165'te import, plugin-hooks.ts:322-328 registerPluginHooks(plugin, securityConfig, enforcement)'a veriyor. AÇIK typed residual: (1) plugins.security_enforcement config-types.ts'te TANIMLI DEĞİL, tipsiz cast ile okunuyor (plugin-hooks.ts:159,167 — kodun kendi notu), (2) default advisory, ihlalde PLUGIN_SECURITY_ADVISORY basıp yükleniyor (plugin-hooks.ts:278) — fail-closed değil. Closure child: PLUGIN-SECURITY-CONFIG-AUTHORITY-001. Onaylı tasarım: .analysis/audits/plugin-admission-authority-design-2026-08-05.md. Bu kanıt pipeline'ın koştuğunu kanıtlar, bloke ettiğini kanıtlamaz.`
- DependsOn'a ekle: `PLUGIN-SECURITY-CONFIG-AUTHORITY-001`

**E3 · row 4200 `SEC-ENFORCE-WIRE-001`** — isim çakışması + 5 satır kayması.
- Acceptance'taki `` `checkWorkerAuthority(enforceRbac)` (`src/agents/worker.ts:795`, 0 caller) `` maddesini şununla değiştir:
  > `` `checkWorkerAuthority` İKİ AYRI FONKSİYON — (a) ADR-037 file-scope sürümü `src/agents/worker.ts:795`, 0 production caller (yalnız tests/agents/worker-authority.test.ts) = UNWIRED, wire-or-retire kararı gerekir; (b) RBAC sürümü `src/nervous/authority-matrix.ts`, WIRED — backlog-trigger.ts:32 + sprint-runtime.ts:33 → autonomous/runtime-loop.ts:49-50 + sprint-spawner.ts:377, flag `enforce_rbac` (config-types.ts:1699), permissive default korunuyor (authority-matrix.ts:307 "no actor/unknown role → permit"); (b)'nin kapanması (a)'yı kapatmaz ``
- Acceptance'taki satır atıflarını güncelle: `tool-scope-gate` → `` `src/core/tool-scope-gate.ts:117` `createScopeGate`, 0 production caller `` · `self-modifying-detector.ts:203` → `:201` · `sprint-controller.ts:1922` → `:1940` · `command-guard.ts:54-55` → `` `src/api/terminal/command-guard.ts:55` `` · `session-manager.ts:13` → `` `:120` (etkin default; `:13` yalnız docstring) ``
- Evidence sonuna ekle:
  > `2026-08-11 yeniden doğrulama (b5fca0039): 4 modülden 3'ü hâlâ 0 production caller (createScopeGate, worker.ts:795, enforceSelfModifyingTask :201, SkillSandbox.requireSafe skill-sandbox.ts:297 — plugin-loader.ts:92 farklı giriş kullanıyor); self_mod_enforce config-types.ts'te hâlâ tanımsız. RBAC sürümü kablolandı (yukarıda). detect-secrets ÇİFTE inert: .pre-commit-config.yaml .secrets.baseline'a işaret ediyor ama o dosya YOK, ayrıca .git/hooks/pre-commit kurulu değil. Onaylı tasarım: .analysis/audits/enforcement-module-disposition-authority-design-2026-08-06.md — ADR-G-021 (Immutable: yes) ile doğrudan çakışıyor, SEC-ADR-CROSSWALK-001 önkoşuldur.`
- DependsOn'a ekle: `SEC-ADR-CROSSWALK-001`

**E4 · row 4190 `SEC-OWASP-ASI-001`** — yeni doküman baseline sayılmasın.
- Truth: değişmez (`0/0/0/?/0/?/?`)
- Evidence sonuna ekle:
  > `2026-08-11: follow-up-works/owasp-asi-baseline-2026-08-11.md üretildi ama bu satırın acceptance'ını KARŞILAMIYOR — 10/10 verdict "open", 0 enforcement sınıfı atanmış, 8/10 satırda "MASTER row: Not identified"; dokümanın kendisi hiçbir kontrolü covered/partially-covered sınıflamadığını beyan ediyor. Ayrıca 10 kanıt yolundan 6'sı VAR OLMAYAN dizin öneki taşıyor (owner prompt'u yalnız çıplak dosya adı verdiği için önekler tahmin edilmiş): src/orchestra/{audit-writer,plugin-hooks,plugin-loader,command-guard,tool-scope-gate}.ts ve src/providers/provider-command-spec.ts → gerçekleri src/core/* ve src/api/terminal/command-guard.ts. Doküman dürüst bir ön-nottur, baseline değildir. Acceptance'ın kod-truth yarısı 2026-08-11 yeniden doğrulamasıyla üretildi: 38 iddia — 2 DÖNDÜ (plugin-hook kablolaması landi, checkWorkerAuthority isim çakışması), 15 satır KAYDI, 21 SABİT, 0 çürütüldü; enforcement sınıfları ASI bazında bu satırların evidence'ına dağıtıldı (4125, 4060, 7031+7034, 4120+4126, 4200, 4091, 4050/4054, 4132, 7040). Kalan yarı ASI07'nin sahibi atanmasıdır — HÂLÂ SAHİPSİZ. Bu kanıt hiçbir enforcement'ın gerçekten bloke ettiğini kanıtlamaz; L boyutu ölçülmedi.`
  > **Not (O6):** yukarıdaki metin bilinçli olarak **kendi-kendine-yeterli**dir; ayrıntı raporu (`follow-up-works/OWASP-ASI-REVERIFY-2026-08-11.md`) tracked bir yolda olduğu için atıf çözülür, ama satır ona bağımlı DEĞİLDİR — kritik sayılar satırın içinde yazılı. Gerekçe: ledger'ın taşınabilirliği bir rapor dosyasının ömrüne bağlı olmamalı (O6).

**E5 · row 4091 `LIMIT-SPEND-ENFORCE-001`** — kanıt tazeleme.
- Evidence sonuna ekle:
  > `2026-08-11 yeniden doğrulama (b5fca0039): warn-only SABİT — cost-gate.ts:254 "if (!limits.enforce_spend_gate) return null;", :325 "WARN-ONLY — never blocks"; key cost-config-loader.ts:90. resource-monitor.ts'te costUsd 0 eşleşme → gerçek harcama üreticisi yok, SPEND-LEDGER-AUTHORITY-001 önkoşulu doğrulandı. Onaylı tasarım: .analysis/audits/rolling-spend-budget-authority-design-2026-08-05.md — ADR-G-037 (hard) landing/budget authority'siyle doğrudan çakışıyor, SEC-ADR-CROSSWALK-001 önkoşuldur.`
- DependsOn'a ekle: `SEC-ADR-CROSSWALK-001`

**E6 · row 4120 `AUDIT-001`** — kanıt + child.
- Evidence sonuna ekle:
  > `2026-08-11 yeniden doğrulama (b5fca0039): AUDIT_HMAC_SECRET = 'deckent-audit' src/core/audit-writer.ts:35'te DEĞİŞMEDİ (243 commit boyunca); dosyanın kendi docstring'i bunu tracked follow-up olarak kaydediyor. Closure child: AUDIT-SECRET-CUSTODY-001. Onaylı tasarım: .analysis/audits/audit-authority-integrity-design-2026-08-06.md — DİKKAT: ADR-G-039 (hard) HMAC + tek-aktif-imza-anahtarını KABUL EDİLMİŞ tasarım olarak bağlamış; tasarım bunu kaza sayıyor, SEC-ADR-CROSSWALK-001 önkoşuldur.`
- DependsOn'a ekle: `AUDIT-SECRET-CUSTODY-001`, `SEC-ADR-CROSSWALK-001`

**E7 · row 4060 `TOOL-AUTHORITY-001`** — named residual'ı child'a taşı.
- Evidence sonuna ekle:
  > `2026-08-11 yeniden doğrulama (b5fca0039): satırın kendi adlandırdığı "docker last-hop write-target divergence artı non-docker backend surface" residual'ı SÜRÜYOR — spawn-backend-docker.ts:3627-3628 (inspectionOnly ? [] : directories) ile sprint-spawner.ts:515 (koşulsuz ...task.scope.directories) farklı write-target türetiyor; docker implementation worker'ı proje RW mount alıyor (:5762). codex/gemini allowedToolsFlag: null src/core/provider-command-spec.ts:129,145'te sabit. Closure child: WRITE-SCOPE-BACKEND-PARITY-001. Onaylı tasarım: .analysis/audits/provider-neutral-worker-execution-authority-design-2026-08-06.md.`
- DependsOn'a ekle: `WRITE-SCOPE-BACKEND-PARITY-001`

**E8 · row 4180 `TRUST-HANDOFF-001`** — tasarım bağlama.
- Evidence sonuna ekle:
  > `2026-08-11: onaylı tasarım .analysis/audits/attempt-effect-attribution-authority-design-2026-08-06.md bu satıra bağlandı (ORPHAN'dı, SSOT §1 gereği). Kod-truth sabit: honest-gate worker beyanına güveniyor (result-evaluator.ts:2402 fail-open, :2434 .md muafiyeti), auditor git diff --stat alert-only + untracked-körü (auditor.ts:752 → :1351 → :1435), gate hatası treat-as-honest düşüyor (sprint-phases.ts:1760-1778).`

**E9 · row 40 `TRUTH-BASELINE-001`** — tasarım bağlama.
- Evidence sonuna ekle:
  > `2026-08-11: onaylı tasarım .analysis/audits/project-inventory-scope-admission-authority-design-2026-08-06.md bu satıra bağlandı (ORPHAN'dı, SSOT §1 gereği). Bu bağlama satırın BASELINE_CONFLICT blocker'ını çözmez.`

**E10 · row 9020 `PROMPT-001`** — kanıt notu.
- Evidence sonuna ekle:
  > `2026-08-11 kod-truth: prompt-segmentation.ts:232 stablePrefixKey 0 production caller (yalnız tests/orchestra/prompt-segmentation.test.ts) — cache-prefix stability yazılmış ama devrede değil.`

**E11 · row 7021 `SKILL-SUPPLY-CHAIN-INGRESS-001`** — kanıt notu.
- Evidence sonuna ekle:
  > `2026-08-11 kod-truth: src/cli/commands/skill.ts:384,459 kopyalamadan ÖNCE rmSync(targetDir, {recursive, force}) yapıyor — kopya başarısız olursa hedef geri dönülemez; checksum cpSync SONRASI ve "optional — skip on failure". result-collector.ts:1005 resolveSkillPrompts SKILL.md içeriğini digest/provenance olmadan prompt'a veriyor.`

**E13 · row 7100 `DEP-SUPPLY-DEFENSE-001`** — ORPHAN doküman bağlama.
- Evidence sonuna ekle:
  > `2026-08-11: onaylı değerlendirme follow-up-works/dep-supply-defense-2026-08-11.md bu satıra bağlandı (ORPHAN'dı, SSOT §1 gereği). Doküman "evaluation only" sınıfındadır ve hiçbir runtime/CI/dependency değişikliği yetkilendirmez; Dependency Execution Broker'ı worker (tenant/project ingress: npm ci project-controlled manifest'e karşı) ve CI (Deckent release ingress) olmak üzere iki trust domain'inde staged + fail-closed öneriyor, Phase 0'ı machine-derived kanıt üretimi olarak tiplemiş ve global ignore-scripts'i nihai tasarım olarak REDDEDİYOR (native/build-time paketlerin meşru script'leri sınıflandırılıp bilinçli admit edilmeli). Bağlı açık envanter boşlukları: DOCS-DEPS-HOME (dependency reference'ın kalıcı evi) ve nested docs npm project'in ownership/install policy'si. Bu kanıt bir tasarım yönü kanıtlar, hiçbir enforcement'ın var olduğunu kanıtlamaz; ADR-D-005 bugün npm audit'i advisory/continue-on-error bırakıyor.`

**E12 · row 7040 `MCP-TRUST-001`** — kanıt notu (iş açılmıyor).
- Evidence sonuna ekle:
  > `2026-08-11 kod-truth: src/mcp-client/config.ts:43,46,57 — git-tracked .mcp.json includeProjectScope default true, yani klonlanan reponun MCP sunucuları non-REPL her caller'da güvenilir. Owner kararı: MCP değerlendirmesi MCPV2 cutover SONRASINA DEFERRED (2026-08-06); bu not yalnız kanıt kaydıdır, iş açmaz.`

### 9.2 N-serisi — yeni satırlar

```
| 7034 | PLUGIN-SECURITY-CONFIG-AUTHORITY-001 | PLUGIN-SANDBOX-WIRE-001 | SECURITY | Plugin güvenlik enforcement'ının typed config authority'si ve owner-kararlı ratchet default'u | P0 | — | G2,G1 | OPEN | 1/~/0/?/0/?/? | `plugins.security_enforcement` `config-types.ts`'te typed key olarak tanımlanır ve `plugin-hooks.ts:167`'deki tipsiz cast retire edilir; advisory→enforce ratchet'i owner-set default taşır; enforce modunda imzasız/scope-dışı hook typed `PluginSecurityError` ile sprint'i bloklar (advisory log ile devam etmez); negatif test her iki modu ayrı kanıtlar | Açılış: 2026-08-11 yeniden doğrulama — 7031 kablolaması landi (`sprint-controller.ts:1667`) ama enablement authority'si typed değil: `plugin-hooks.ts:159` kodun kendi notu "`plugins.security_enforcement` is not declared in config-types.ts yet", `:167` tipsiz cast ile okuyor, `:278` ihlalde `PLUGIN_SECURITY_ADVISORY` basıp yüklemeye devam ediyor. Bu satır `E=1`'i üretir; `W=1`'i 7031 üretti | 2026-08-11 |
| 4126 | AUDIT-SECRET-CUSTODY-001 | AUDIT-001 | AUTHORITY | Audit zinciri HMAC anahtarı sabit kaynak-görünür string yerine config/secret-manager authority'sinden gelir | P0 | — | G2,G1 | OPEN | 1/0/0/?/0/?/? | `AUDIT_HMAC_SECRET` sabiti üretim yolundan kalkar; anahtar materyali tek config/secret authority'sinden çözülür; anahtar yok/güvensizse typed `HOLD` (sessiz sabit fallback yok); bağımsız verifier zinciri anahtar-sahibi olmadan yeniden hesaplayamaz; `ADR-G-039` HKDF-SHA256 domain-separation ve rotation contract'ı ile uyum kanıtlanır | Açılış: 2026-08-11 yeniden doğrulama — `src/core/audit-writer.ts:35` `export const AUDIT_HMAC_SECRET = 'deckent-audit'` 243 commit boyunca değişmedi; dosyanın kendi docstring'i "a production deployment should thread a single config/secret-manager-sourced secret" diyor. Kaynak-sahibi adversary audit zincirini sahteleyebilir. `ADR-G-039` (hard) bu alanı zaten bağladığı için `SEC-ADR-CROSSWALK-001` önkoşuldur | 2026-08-11 |
| 4061 | WRITE-SCOPE-BACKEND-PARITY-001 | TOOL-AUTHORITY-001 | AUTHORITY | Worker write-target türetimi tüm spawn backend'lerinde tek authority'den gelir | P0 | — | G1 | OPEN | 1/0/0/?/0/?/? | `sprint-spawner` ve `spawn-backend-docker` (ve declared her ek backend) aynı canonical write-target türeticisini tüketir; `directories`'in write-scope'a katılması tek yerde ve tipli koşulla olur; inspection-only task her backend'de aynı boş write-scope'u alır; divergence CI'da regression-gate edilir; kapanmayan backend dürüst `unsupported/HOLD` verir | Açılış: 2026-08-11 yeniden doğrulama — `TOOL-AUTHORITY-001`'in kendi adlandırdığı residual: `spawn-backend-docker.ts:3627-3628` `inspectionOnly ? [] : directories` ile `sprint-spawner.ts:515` `['.tasks/', ...task.scope.directories, ...task.scope.filesWrite]` farklı write-target üretiyor; docker implementation worker'ı ayrıca proje RW mount alıyor (`:5762`). Parent `VERIFY` olduğu için residual child'a taşındı (§3.3 invariant) | 2026-08-11 |
| 4132 | TERMINAL-SESSION-AUTHORITY-001 | API-SECURITY-001 | AUTHORITY | Terminal session execution authority: kind-bağımsız command guard, host-bağımsız yetki sınırı ve principal-bound session kimliği | P0 | PRINCIPAL-001 | G2,G1 | OPEN | ~/0/0/?/0/?/? | Command/prompt guard her `SessionKind` için çalışır (`shell` özel-durumu kalkar); yetki sınırı network binding'den bağımsızdır (loopback authority üretmez); session kimliği principal/owner/project taşır ve tenant-scoped fail-closed okunur; auth provider async/rotating credential contract'ını taşır; owner-onaylı `ADR-G-029` successor'ı olmadan `DONE` olamaz | Açılış: 2026-08-11 yeniden doğrulama — onaylı tasarım `.analysis/audits/terminal-session-execution-authority-design-2026-08-06.md` ORPHAN'dı, hiçbir ledger satırı referans vermiyordu (SSOT §1 gereği açıldı). Kod-truth: `src/api/terminal/command-guard.ts:55` `if (ctx.kind !== 'shell') return [];` → `ai`/`deckent` session'ları guard'sız; `session-manager.ts:120` `host: this.opts.host ?? 'localhost'` → üçüncü bypass; `types.ts` session kimliği `tenantId?` (default `'local'`) dışında principal taşımıyor. `ADR-G-029` `Immutable: yes` ve guard'ı "delivered" sayıyor → `SEC-ADR-CROSSWALK-001` önkoşuldur | 2026-08-11 |
| 4191 | SEC-ADR-CROSSWALK-001 | AUTHORITY-001 | AUTHORITY | 9 onaylı güvenlik tasarımının ADR crosswalk'ı ve 4 doğrudan-alan çakışmasının owner-kararlı reconciliation'ı | P0 | — | G2 | OPEN | 0/0/0/?/0/?/? | 9 tasarımın her biri için governing ADR listesi üretilir; 4 doğrudan-alan çakışması iki ayrı yola tiplenir — SUCCESSOR gerektiren `Immutable: yes` çifti (`ADR-G-021` self-modifying ↔ A6 D11 retire önerisi · `ADR-G-029` embedded-terminal ↔ A7, çatışma yalnız "command/prompt guard = delivered" iddiasında; AUDIT-WIRE/TERM-CONFIG-WIRE boşlukları ADR tarafından zaten kabul edilmiş) ve AMENDMENT yeterli olan `Immutable: no` çifti (`ADR-G-037` execution-budget `hard` ↔ A2 · `ADR-G-039` key-custody `hard` ↔ A3); her biri için kanıtlı ÖNERİ Alperen'e sunulur; satır KARAR VERMEZ, `Immutable: yes` ADR'ye in-place dokunulmaz, `ADR-G-019` prosedürü izlenir; owner kararı alınmadan bağlı hiçbir satır implementation'a geçmez | Açılış: 2026-08-11 yeniden doğrulama — 9 tasarımın 8'i SIFIR ADR atıfı taşıyor (Yasa-2 ihlali: spec yazmadan önce alan-ADR-recall zorunlu). `ADR-G-039` decision metni zaten "Approval ingress, recurring-trigger occurrence ledger, and sealed evidence archive remain separate dependent slices under their already approved contracts" diyor — approval işi sıfırdan tasarlanmaz, o contract'a bağlanır; A3 ise HMAC + tek-aktif-imza-anahtarı + zorunlu HKDF-SHA256 domain separation'ı kaza sayıyor, oysa ADR onu kabul edilmiş tasarım olarak bağlamış. Bu satır implementation'ın önündeki gerçek kapıdır | 2026-08-11 |
| 4210 | CONFIG-AUTHORITY-CONSOLIDATION-001 | AUTHORITY-001 | AUTHORITY | 9 güvenlik tasarımının config yüzeyi tek authority contract'ında uzlaştırılır ve paralel yazım serialize edilir | P1 | SEC-ADR-CROSSWALK-001 | G2,G1 | OPEN | 0/0/0/?/0/?/? | 9 tasarımın `config-types.ts`/`config.ts` yazımları tek merge contract'ında toplanır; hangi satırın hangi key'i tanımladığı ID-exact atanır; aynı dosyaya yazan satırlar DAG'da serialize edilir (paralel admission reddedilir); her yeni security key typed default + i18n'li diagnostic taşır; typed olmayan cast ile config okuma production yolunda kalmaz | Açılış: 2026-08-11 yeniden doğrulama — 9 tasarımdan 6'sı `config-types.ts`, 6'sı `config.ts` yazıyor (ölçüldü: inter-document file collision matrisi). Alperen 2026-08-06 kararı K7: dar-tanımlı erken uzlaştırma REDDEDİLDİ ("dar tanım şimdiyi kurtarsa sonra bize teknik borç oluşturur ... sonradan bu turu borç olarak master plandan ele alır güncelleriz") — bu satır o kabul edilmiş borcun kaydıdır. Halihazırda somut örnek: `plugins.security_enforcement` typed değil, tipsiz cast ile okunuyor (`plugin-hooks.ts:167`); `self_mod_enforce` hiç tanımlı değil | 2026-08-11 |
```

### 9.3 Uygulama sırası, validator kuralları ve yan etkiler

**Zorunlu sıra: N-serisi ÖNCE, E-serisi SONRA.** Validator
`scripts/lint-master-plan.mjs:1807` kuralı: *"DependsOn references missing Work ID"*.
E2, 7031'in `DependsOn`'una `PLUGIN-SECURITY-CONFIG-AUTHORITY-001` ekliyor; E3/E5/E6
`SEC-ADR-CROSSWALK-001`, E6 `AUDIT-SECRET-CUSTODY-001`, E7 `WRITE-SCOPE-BACKEND-PARITY-001`
ekliyor. Bu ID'ler N-serisi (7034, 4191, 4126, 4061) landmadan **yok** → E-serisi önce
uygulanırsa validator kırmızı verir.

Doğru sıra:

1. **N-serisi** (7034, 4126, 4061, 4132, 4191, 4210) — hiçbiri var olmayan ID'ye
   `DependsOn` vermiyor (4210 → 4191, aynı partide landiyor).
2. **E-serisi** (E1…E13).
3. `node scripts/lint-master-plan.mjs --write` — `docs/generated/master-plan-active.{json,md}`
   projection'larını yeniler. `--write` olmadan validator `projections out of sync` verir.

Beklenen satır sayısı: **454 → 460** (aktif: 407 → 413).

**Doğrulanan validator kuralları** (grep ile, `scripts/lint-master-plan.mjs`):

| Satır | Kural | Bu pakete etkisi |
|---|---|---|
| `:1807` | `DependsOn references missing Work ID` | N-önce-E sırası **zorunlu** (yukarıda) |
| `:2895` | `VERIFY mutation claim requires a scoped receipt or typed historical provenance` | 7031 `OPEN` kalır (E2), receipt yok |
| `:2967` | `DONE truth must contain only proven (1) or not-applicable (-)` | Bu pakette `DONE`'a taşınan satır yok — etkisiz |

**Yan etki — aggregate closure edge'leri (§3.3):** *"doğrudan child'ların tamamı
`DONE`/`DISPOSED` olmadan parent `READY`, `DONE` veya `DISPOSED` olamaz."* Bu paket
üç parent'a yeni child ekliyor:

- `AUTHORITY-001` (4000, `OPEN`) ← 4191, 4210
- `API-SECURITY-001` (4130, `BLOCKED`) ← 4132
- `AUDIT-001` (4120, `OPEN`) ← 4126
- `TOOL-AUTHORITY-001` (4060, `VERIFY`) ← 4061
- `PLUGIN-SANDBOX-WIRE-001` (7031, `OPEN`) ← 7034

Yani **4060'ın `DONE`'a gitmesi artık 4061'e bağlı**. Bu kasıtlıdır — 4060'ın kendi
evidence'ı residual'ı zaten adlandırıyordu ve §3.3 *"`DONE` satırında residual
bulunamaz"* diyor; child açmak invariant'ın gereğidir, ek bir kısıt değil.
Ama owner bunu görerek onaylamalı.

**Ölçülmedi:** §9 metinleri validator'da **koşturulmadı** (MASTER-PLAN'a dokunulmadı).
Yukarıdaki üç kural grep ile okundu, uygulanmış satır üzerinde test edilmedi. İlk
uygulamada `--check` kırmızı verirse hata bu üç kuralın dışında bir grammar
ayrıntısındadır (receipt token biçimi, `Updated` granularity, blocker register
tamlığı gibi) ve düzeltilerek yeniden koşulur.

---

## 10. Açık maddeler (owner kararı gerekiyor)

**O1 — ASI07 sahipsiz.** Agent-arası iletişimde (`.tasks/*.json`, `.result`, TASK_ASSIGN
payload) authentication/integrity/replay koruması yok. Codex turu bunu `LEDGER-UNKNOWN`
bıraktı. İki seçenek: (a) `TRUST-HANDOFF-001` (4180) kapsamına kat — o satır zaten
"agent-çıktısından host-etkisine güven-aktarım zinciri" diyor; (b) ayrı satır aç
(`INTERAGENT-INTEGRITY-001`). **Öneri: (a)** — 4180 Truth `0/0/0`, kapsam genişletmesi
yeni satırdan daha az parçalanma üretir. Karar Alperen'in.

**O2 — 4190'ın kaderi.** Bu tur 4190'ın kod-truth yarısını üretti. Seçenekler:
(a) E-serisi uygulandıktan sonra 4190'ı `VERIFY`'a al (her ASI sahip satıra bağlı);
(b) `OPEN` bırak, tek bir konsolide baseline dokümanı ayrıca üretilene kadar.
**Öneri: (a)**, çünkü acceptance "her gap ya mevcut bir ledger satırına bağlanır ya yeni
satır önerisi olur" diyor — E+N serisi tam olarak bunu yapıyor. Ama `L=0` kalır.

**O3 — `follow-up-works/owasp-asi-baseline-2026-08-11.md` ne olacak?** Doküman
`docs/security/` → `.analysis/` → `follow-up-works/` yolunu izledi ve **6 uydurma yol
hâlâ içinde** (bu tur sonunda yeniden ölçüldü: 6 önekten 6'sı duruyor, `Not identified`
10 satırda duruyor). Üç seçenek: (a) §7.1 tablosuyla yolları düzelt; (b)
`superseded-by: OWASP-ASI-REVERIFY-2026-08-11.md` başlığı ekleyip bırak; (c) sil
(topoloji kararı "consumed olanlar silinir, ürün ağacında arşivlenmez" diyor).
**Öneri: (a)+(b)** — 6 yol düzeltmesi mekaniktir ve dokümanı zararsız hale getirir;
`superseded-by` başlığı da onun baseline sanılmasını önler. Dokümanın dürüst sınır
beyanı ("read authority implementation yollarını açmadı") korunmaya değer.
**Uyarı:** bu dosya başka bir session'ın in-flight çıktısıdır (§12) — düzeltme
o session'ın işi bittikten sonra yapılmalı.

**O4 — Satır-numarası atıf disiplini.** 15/38 atıf 5 günde kaydı. Ledger evidence'ında
`file:line` yerine sabit sembol adı (`createScopeGate`, `checkBoundaryViolations`) atıfı
kalıcı çözümdür. Bu bir kayıt-disiplini kararıdır, satır değil — `DOCS-TOPOLOGY-001`
(row 140) kapsamına mı girer, ayrı mı? Karar Alperen'in.

**O5 — K8 (contract harmonization) hâlâ PROVISIONAL.** 2026-08-06'da "iyi düşünmeliyiz
şuan öneri makul ama yarın kararım değişebilir" dendi. Teyit gelmediği için E2/E3/E6/E8/
E9/E12 dışındaki harmonization düzeltmeleri (eski E2/E3/E6/E8/E9/E12/E14) uygulanmadı.

**O6 — KANIT PARADOKSU — ÇÖZÜLDÜ (owner müdahalesiyle).** Bu rapor ilk olarak
`.analysis/audits/` altına yazıldı; oradaki her **yeni** dosya gitignored'dır
(`.gitignore:236`, `:258`) — 2026-08-11 taşınmasıyla gelen 9 tasarım + transkript
`git mv` ile geldiği için tracked kaldı (gitignore mevcut tracked dosyaları etkilemez),
ama yeni dosya olmuyor. Yani ledger'ın bu rapora atıf vermesi fresh checkout'ta
**çözülemeyen** bir yol üretecekti.

Owner aynı tur içinde `follow-up-works/` dizinini işaret etti. Ölçüldü:

```
$ git check-ignore -v follow-up-works/     →  NOT ignored
$ git ls-files follow-up-works/            →  CODEX-OWASP-ASI-PROMPT.md
                                              dep-supply-defense-2026-08-11.md
                                              owasp-asi-baseline-2026-08-11.md
```

**Sonuç:** rapor `follow-up-works/OWASP-ASI-REVERIFY-2026-08-11.md`'ye taşındı; yol
tracked ve ignore edilmiyor, ledger atıfı çözülür. **O6 kapandı.** Bu, eski
`CROSS-VERIFICATION-2026-08-06.md` §17.4 **O3**'ünün de yapısal çözümüdür — o tur
untracked kalmayı seçmişti (K9), bu tur owner tracked bir ev verdi.

Yine de §9'un **E4** metni kasıtlı olarak kendi-kendine-yeterli bırakıldı: kritik sayılar
satırın içinde yazılı, atıf yalnız ek kolaylık. Gerekçe: ledger'ın taşınabilirliği bir
rapor dosyasının ömrüne bağlı olmamalı.

---

## 11. G1 FILE manifest

Aşağıdaki dosya mutasyonu için fresh owner onayı gerekiyor.

**Bu manifest bir kez düştü ve yeniden ölçüldü — bu turun kendisi `G1`'in neden var
olduğunun kanıtı.** İlk ölçüm `b5fca0039` çalışma kopyasında yapıldı
(`docs/MASTER-PLAN.md` = `5f0b12ef…`, 454 satır / 407 aktif). Bu rapor yazılırken **başka
bir session** P09'a 9 satır ekledi (`TRAINING-TRACE-001` güncellemesi + `TRACE-DATA-
GOVERNANCE-001`, `TRACE-AUTHORITY-SCHEMA-001`, `TRACE-CAPTURE-CUTOVER-001`,
`TRACE-HISTORICAL-MIGRATION-001`, `TRACE-CORPUS-PIPELINE-001`,
`TRACE-QUALITY-LEAKAGE-GATE-001`, `FINE-TUNE-001`, `DECKENT-CORE-MODEL-LIFECYCLE-001`) →
üç hash birden değişti. §2 kuralı gereği eski onay düşerdi.

**Çakışma kontrolü yapıldı — §9 etkilenmiyor:**

- Önerilen 6 order slotu (4061, 4126, 4132, 4191, 4210, 7034) **hâlâ boş** (eklenenler
  9010–9017 ve 9070–9071 aralığında).
- E-serisinin dokunacağı 13 satırın (40, 4060, 4091, 4120, 4125, 4180, 4190, 4200, 7021,
  7031, 7040, 7100, 9020) **hiçbiri** bu diff'te değişmedi.

Güncel baseline hash'ler (461 satır / 414 aktif, validator OK):

| Hedef | Baseline SHA-256 | İşlem |
|---|---|---|
| `docs/MASTER-PLAN.md` | `ade02d7359722f48c2aa5c717fdbccd62f95e435024959bcd02988a3db17299e` | §9.1 (13 evidence tazeleme) + §9.2 (6 yeni satır) |
| `docs/generated/master-plan-active.json` | `a71273207726c7a16936da89c56cec6fef5efc5cd18e8539dba08a52eb7427b6` | `--write` ile üretilen projection |
| `docs/generated/master-plan-active.md` | `82a923d22178608168b049c5ee2230a82bca09c7703d203f52c3fb140a699130` | `--write` ile üretilen projection |

**DİKKAT:** bu üç dosya şu an **uncommitted** (`M` durumunda) — diğer session'ın işi
henüz commit edilmemiş. Uygulamadan önce hash'ler **bir kez daha** ölçülmeli ve o
session'ın işi bittiğinden emin olunmalı. Beklenen sonuç: **461 → 467 satır**
(aktif 414 → 420).

**Hariç (bu manifest kapsamı DIŞI):** 9 tasarım dokümanı ve Codex transkripti (byte-sabit,
`.analysis/audits/`, tracked) · `src/**` (hiçbir kod değişmez) ·
`follow-up-works/owasp-asi-baseline-2026-08-11.md` (O3 kararına bağlı) ·
`follow-up-works/OWASP-ASI-REVERIFY-2026-08-11.md` (bu rapor; tracked yolda, `git add`
owner kararı) · commit/push (owner ayrıca istemedikçe yapılmaz).

Hash drift olursa onay yine düşer ve manifest yeniden ölçülür (§2 `G1 FILE`).

**Bu manifest §9'un tamamını tek onayla kapsar.** Parça-parça onay isteniyorsa
§9.3'ün `DependsOn` kısıtı sırayı belirler — E-serisi tek başına uygulanamaz:

| Parti | İçerik | Neden bu sırada |
|---|---|---|
| **1** | **E1** (row 4125 kırık atıf) | Hiçbir yeni ID'ye `DependsOn` vermiyor; tek başına doğru ve risksiz |
| **2** | **N-serisi tamamı** (7034, 4126, 4061, 4132, 4191, 4210) | E-serisinin atıf verdiği ID'leri var eder (`:1807` kuralı) |
| **3** | **E2, E3** (durum döndüren iki bulgu) | Ledger'ın **bugün yanlış** olan resmini düzeltir |
| **4** | Kalan E-serisi (E4–E13) | Kanıt tazeleme + 9 ORPHAN dokümanın bağlanması |
| **5** | `lint-master-plan.mjs --write` | Projection yenileme |

Yalnız Parti 1 onaylanırsa da anlamlı bir kazanç vardır (kırık atıf kapanır). Parti 2
olmadan Parti 3'e geçilemez.

---

## 12. Eşzamanlılık uyarısı

Bu doğrulama sırasında repo üzerinde **başka bir aktif session** çalışıyordu:

- `9722a8cee feat(orchestra): sprint-513 harvest` bu tur sırasında landi.
- `docs/security/owasp-asi-baseline-2026-08-11.md` ben okuduktan sonra silinip
  `follow-up-works/owasp-asi-baseline-2026-08-11.md`'ye taşındı.
- Çalışma ağacında `.brain/exports/*`, `.claude/hooks/pretooluse-guard.mjs`,
  `src/core/provider-execution-observation-store.ts` dirty.

Bu tur boyunca `docs/MASTER-PLAN.md` **iki kez farklı durumdaydı**: başta temiz/commit'li
(454 satır), sonunda `M` uncommitted (461 satır). Yani §9 uygulanmadan önce hash'ler
**mutlaka** yeniden ölçülmelidir (§11'de bir kez yapıldı, bir kez daha gerekecek) —
`master-plan-active.json` 960+ satırlık authority registry'sidir ve `--write` onu bütünüyle
yeniden üretir; eşzamanlı yazımda conflict maliyeti yüksektir.

**Owner'a not:** en güvenli sıra, diğer session'ın P09 işini commit etmesini beklemek,
sonra §9'u tek partide uygulayıp `--write` koşmaktır. §9'un hiçbir maddesi P09'a
dokunmadığı için işler bağımsızdır; yalnız aynı dosyaya yazdıkları için serialize
edilmeleri gerekir.

---

## 13. Bu turun bilançosu

**Kanıtladığı:** 2026-08-06 iş planının kod-truth tabanı 5 gün ve 243 commit sonra
%95 geçerli; 2 bulgu gerçek kodla döndü; 15 atıf kaydı; 8 onaylı tasarım ledger'da
sahipsiz; 4 ADR çakışması implementation'ın önünde duruyor; bugünkü baseline dokümanı
6 uydurma yol taşıyor.

**Kanıtlamadığı:** Hiçbir enforcement'ın gerçekten bloke ettiğini — bu tur salt-okunur
kod ve ledger doğrulamasıdır, tek bir binary koşumu veya negatif test içermez.
`L` (live-proven) boyutu bu turda hiç ölçülmedi.

**Uygulanmadı:** §9'un tamamı. `G1 FILE` onayı bekliyor (§11).

---

## 14. Uygulama kaydı — 2026-08-11

**Owner onayı:** Alperen, 2026-08-11, canlı: *"onaylıyorum, G1 verildi — uygula ve validator koş"*.
`G1 FILE` manifesti (§11) uygulama anında yeniden ölçüldü ve **drift yoktu**
(`docs/MASTER-PLAN.md` = `ade02d73…`, manifestteki değerle birebir).

### 14.1 Uygulanan

| Kalem | Sayı | Sonuç |
|---|---|---|
| Yeni satır (N-serisi) | 6 | 4061, 4126, 4132, 4191, 4210, 7034 |
| Evidence tazeleme (E-serisi) | 13 | 40, 4060, 4091, 4120, 4125, 4180, 4190, 4200, 7021, 7031, 7040, 7100, 9020 |
| Truth düzeltmesi | 1 | 7031: `1/0/0/?/0/?/?` → `1/1/~/?/0/?/?` |
| `Updated` → `2026-08-11` | 19 | tüm dokunulan satırlar |
| Validator | — | `--check` **OK**, `--write` sonrası projections in sync |

Satır sayısı **461 → 467**, aktif **414 → 420** — §9.3'te öngörülen değerlerin aynısı.

Post-apply hash'ler:

| Dosya | SHA-256 |
|---|---|
| `docs/MASTER-PLAN.md` | `fbcc481389c6652577baa37dc749c93d3b24d2ac0ba07b8db321602906ec1f9c` |
| `docs/generated/master-plan-active.json` | `17c7b789704fe7c9cb753909b532ddb73b59e270ca1b47b4a301ca0d622b0786` |
| `docs/generated/master-plan-active.md` | `950b0f55a5961d8093c16398d026382fdb46cbcd768393fe8196fa98d6998cc9` |

Üç dosya **uncommitted** (`M`) bırakıldı — commit owner talebine bağlıdır.

### 14.2 İki zorunlu sapma — `IDENTITY_DEFINITION_DRIFT`

İlk uygulama denemesi validator tarafından **reddedildi**: 6 adet
`IDENTITY_DEFINITION_DRIFT` (4060, 4091, 4120, 4125, 4200, 7031). Kural
`scripts/lint-master-plan.mjs:3821`:

> `immutable parent/program/outcome/acceptance/dependency/gate definition changed for <id>`

`:3818`'deki karşılaştırma `definitionDigest` üzerinden yapılıyor. Yani yayımlanmış bir
satırın **Parent · Program · Outcome · Acceptance · DependsOn · Gate** alanları
**değiştirilemez**; yalnız **State · Truth · Priority · Evidence · Updated** serbesttir.
MASTER-PLAN §3.3 prose'u bunu bu keskinlikte söylemiyordu; ampirik olarak öğrenildi.

Dosya `.bak`'tan geri alındı (hash `ade02d73…` doğrulandı) ve paket iki noktada
değiştirilerek yeniden uygulandı:

**Sapma 1 — Acceptance düzeltmeleri Evidence'a taşındı.**
- **E1** (row 4125): Acceptance'taki kırık `docs/audits/...` yolu *in-place düzeltilemedi*.
  Evidence artık şunu kayda geçiyor: yol 2026-08-11 topoloji taşınmasıyla kırıldı, çözülen
  güncel yol `.analysis/audits/content-provenance-context-integrity-authority-design-2026-08-06.md`,
  ve Acceptance'taki yol yalnız **historical citation** olarak okunmalı.
- **E3** (row 4200): isim çakışması + 5 satır kayması + detect-secrets keskinleştirmesi
  Acceptance'a yazılacaktı; Evidence'a taşındı ve metin açıkça
  *"düzeltmeler burada bağlayıcıdır ve Acceptance metnindeki karşılıkları supersede eder"*
  diyor. `checkWorkerAuthority`'nin iki ayrı fonksiyon olduğu ve **(b)'nin kapanmasının
  (a)'yı kapatmadığı** böylece ledger'da kayıtlı.

**Sapma 2 — dependency edge'i yeni satırlara verildi.**
Mevcut satırların `DependsOn`'u da immutable olduğu için 7031/4200/4091/4120/4060'a
prerequisite eklenemedi. Edge iki yolla taşınıyor:

1. **Parent aggregate-closure (§3.3)** — zaten yeterli: 4061→`TOOL-AUTHORITY-001`,
   4126→`AUDIT-001`, 7034→`PLUGIN-SANDBOX-WIRE-001`, 4132→`API-SECURITY-001`.
   Yani 4060 artık 4061 kapanmadan `DONE` olamaz. Eklemek istediğim edge **zaten vardı**;
   `DependsOn` girişimi gereksizdi.
2. **Yeni satırların kendi `DependsOn`'u** — `SEC-ADR-CROSSWALK-001` (4191) ADR kapısını
   4126, 4132 ve 4210'a bağlar. Bu, ADR reconciliation'ı yapılmadan o üç işin
   admission alamamasını sağlar.
3. Kapatılamayan yön (mevcut satır → yeni satır) her dokunulan Evidence'a prose olarak
   yazıldı: *"bu satırın DependsOn hücresi definitionDigest'in parçası olduğu için
   değiştirilemedi; önkoşul/closure edge'i child satırın Parent'ı ve bu prose kaydıyla taşınır"*.

**Sonuç:** paketin niyeti tam olarak korundu, mekanizması ledger'ın immutability
contract'ına uyacak şekilde değişti. Hiçbir yayımlanmış satır kimliği bozulmadı
(`IDENTITY_ORDER_DRIFT`, `IDENTITY_DELETION` ve `IDENTITY_DEFINITION_DRIFT` = 0).

### 14.3 Ölçülen, ölçülmeyen

**Ölçüldü:** validator grammar + identity continuity + projection sync (467/420, OK) ·
19 satırın disk üzerindeki son hâli (6 yeni satır alan alan doğrulandı, 13 satırın
`Updated`/`Truth` değeri okundu) · tablo bütünlüğü (yeni bozuk satır yok; `NF=18` olan
row 510 `CLI-VOCAB-001` **önceden vardı**, backup'ta da aynı) · pre/post hash'ler.

**Ölçülmedi:** hiçbir test koşulmadı, hiçbir binary çalıştırılmadı, hiçbir kod değişmedi.
Bu paket **yalnız ledger truth'unu** düzeltti; tek bir enforcement'ı devreye almadı.
19 satırın hiçbiri `DONE`'a taşınmadı, hiçbiri yeni `L` veya `H` kanıtı kazanmadı.

### 14.4 Uygulama sonrası açık kalan owner maddeleri

- **O1 — ASI07 sahipsiz.** 4180'in Evidence'ına *"owner kararı bekliyor: bu satırın
  kapsamına katılması önerildi, henüz onaylanmadı"* olarak yazıldı. Karar hâlâ gerekli.
- **O2 — 4190 `OPEN` bırakıldı.** `VERIFY`'a taşımak scope-exact receipt gerektiriyor
  (§3.4 + validator `:2895`); bu tur receipt üretmedi.
- **O3 — baseline dokümanının 6 uydurma yolu duruyor.** `follow-up-works/owasp-asi-baseline-2026-08-11.md`
  düzeltilmedi (başka session'ın in-flight çıktısı). 4190 Evidence'ı artık yanlış yolları
  ve doğrularını listeliyor, yani ledger tarafında zarar sınırlandı.
- **O4 — satır-numarası atıf disiplini.** Karar verilmedi.
- **O5 — K8 teyidi.** Alınmadı.
- **YENİ O7 — DOSYALANMAMIŞ BİLİNEN SSOT DEFEKTİ (owner kararı gerekiyor).**
  4125 ve 4200'ün Acceptance metinleri artık bilinçli olarak **eskimiş**; düzeltmeleri
  yalnız Evidence'ta yaşıyor. Bu bugün yaratılmış, kalıcı ve **aynı satırın iki hücresi
  arasında** bir çelişkidir: 4200'ün Acceptance'ını okuyan biri, uzun Evidence hücresinin
  sonuna kadar okumadıkça metnin supersede edildiğini göremez. Acceptance immutable
  olduğu için oraya uyarı da konulamaz — mutable hücreler yalnız State/Truth/Priority/
  Evidence/Updated.

  **Neden bu turda satır açılmadı:** `G1 FILE` manifesti (§11) scope-exact'ti — "§9.1
  (13 evidence tazeleme) + §9.2 (6 yeni satır)". 7. bir satır eklemek scope drift'tir ve
  §2 gereği onayı düşürür. Alp Discipline: *"Genişlemeyi asla kendine verme; kararı sahip
  verir."* Bu yüzden defekt **bilerek dosyalanmadı** ve burada açıkça işaretlendi —
  sessizce bırakılmadı.

  **Owner onayı gelirse eklenecek satır (hazır):**

  `| 145 | LEDGER-ACCEPTANCE-AMENDMENT-001 | P00 | TRUTH | Yayımlanmış satırların eskiyen Acceptance metni için owner-onaylı, izlenebilir amendment yolu | P1 | — | G2,G1 | OPEN | 0/0/0/?/0/?/? | definitionDigest immutability'si korunurken Acceptance düzeltmesi tipli bir yolla mümkün olur: ya successor satır contract'ı ya validator'a owner-receipt-bound acceptance-amendment kaydı; her iki durumda eski metin machine-readable olarak superseded işaretlenir ve okuyucu Evidence'ın sonuna kadar okumak zorunda kalmaz; mevcut iki bilinen vaka (4125 kırık tasarım yolu, 4200 checkWorkerAuthority isim çakışması artı 5 satır kayması) migrate edilir | Açılış: 2026-08-11 — validator scripts/lint-master-plan.mjs:3821 IDENTITY_DEFINITION_DRIFT kuralı parent/program/outcome/acceptance/dependency/gate alanlarını dondurur (:3818 definitionDigest). OWASP paketi uygulanırken 4125 ve 4200'ün Acceptance düzeltmeleri bu yüzden Evidence'a taşınmak zorunda kaldı; sonuç aynı satırın iki hücresi arasında kalıcı çelişkidir. Bu satır o çelişkinin sahibidir; hiçbir Acceptance mutation'ı bu satırla yetkilenmez | 2026-08-11 |`
