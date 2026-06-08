# 2026-06-08 — Birleşik Ürün-Akışı Analizi (Alperen RCA + Bağımsız Kod-Doğrulamalı Pas)

Bu doküman iki analizi **birleştirir**:
1. **Alperen CLI/MCP RCA** — `docs/alperen-analysis/2026-06-08-cli-mcp-product-flow-root-cause.md` (ürün-akışı kök-neden, open-beta 72/100).
2. **Bağımsız kod-doğrulamalı pas (2026-06-08)** — 5 paralel investigator (CLI/MCP parity · task/work model · onboarding/provider/auth · autonomous/flow/enterprise · coverage-critic), her iddia `file:line` doğrulamalı; alperen RCA'yı VERIFY + EXTEND + CORRECT + yeni-bulgu.

Amaç: SSOT'a (MASTER-PLAN/blueprint) yazılacak **pozisyon + iş planı revizyonu** için kanıtlanmış, çift-doğrulanmış birleşik karar katmanı. (Deep positioning revizyonu Alperen ile birlikte — bu doküman onun girdisi.)

---

## 0. Birleşik Verdict

**Alperen verdict'i geçerli + doğrulandı:** Sorun "özellik yokluğu" değil, **özellik niyetinin tek canonical execution contract altında birleşmemesi.** Kod çok güçlü parçalar içeriyor; bağımsız pas bunu `file:line` ile teyit etti.

**Bağımsız pasın eklediği iki yeni eksen (alperen RCA'nın CLI/MCP-merkezli kapsamı dışında):**
- **Hollow surface vs missing contract:** alperen "eksik sözleşme"ye odaklı; eşit aciliyetle **kullanıcıya boş görünen yüzeyler** var (enterprise dashboard sayfası backend'siz → kalıcı boş; VS Code extension stub; skill-marketplace backend yok; MCP-client REPL'e wire değil).
- **Wired vs proven:** birçok ana sistem (rule-evolver, promotion-pipeline, nervous, autonomous, MCP-client-broker) sprint lifecycle'a **wired ama kanıtlanmamış** (efficacy sinyali / integration-test yok).

**Birleşik open-beta skoru (çift-segment):**
- **Developer/dogfood beta: ~71/100** (alperen 72 ile tutarlı) — CLI sprint lifecycle sağlam, memory çalışır, MCP control-plane çekirdeği kapsar, nervous/auditor gerçek.
- **Enterprise-facing beta: ~52/100** — enterprise dashboard hollow + multi-tenant schema-only + VS Code stub + marketplace backend yok + connector data-classification yok + GPU-aware scheduling yok + InstallProfile kodda yok.

**Sonuç:** Developer/dogfood beta kontrollü başlatılabilir; **enterprise-facing beta için P0'lar + hollow-surface'ler kapanmadan ÖNERİLMEZ.** + **npm publish henüz yapılmadı** (en görünür gate; alperen RCA'da yok).

---

## 1. İki Analizin HEMFİKİR Olduğu (yüksek-güven, kod-doğrulamalı)

| Bulgu | Kanıt (file:line) | Severity |
|---|---|---|
| MCP `run` `provider:'claude'` hardcode + spawnWorkerMultiProvider by-pass | `src/mcp/tools/run.ts:63,75` | HIGH |
| `start` CLI/MCP davranış ayrışması (CLI autoApprove hep-true; MCP doctor-skip) | `start.ts:418`, `mcp/tools/start.ts:58-61,233` | HIGH (kontrat netliği) |
| `review` CLI persist vs MCP read-only | `review.ts:50-65` vs `mcp/tools/review.ts` | ORTA |
| Task modeli code/file-scope-centric; non-code work taşıyamaz | `task-types.ts:211-215` (TaskScope sadece dirs/files) | HIGH |
| `EnvironmentType` + `RequirementProfile` tamamen YOK | grep → 0 sonuç | HIGH |
| Shared `ExecutionRequest` yok (run/start/autonomous ayrı) | 3 ayrı path | ORTA |
| `OnboardingDecisionEngine` yok (init/analyze/recommend ayrı) | init.ts/analyze.ts/auto-setup.ts | HIGH |
| `InstallProfile` (assistant/developer/team/enterprise) kodda yok (sadece ChatMode UX-gate) | `chat-mode.ts:14` | HIGH |
| First-run proof-of-understanding akışı yok | grep → 0 | ORTA |
| Planner priority-context SABİT (dynamic LayerProfile yok) | `planner.ts:48-166` (priority 0-8 hard-coded) | DÜŞÜK-ORTA |
| RBAC runtime advisory/unwired (ADR-037 V1.0 Layer-2 kasıtlı) | `authority-enforcer.ts:584-621` (her iki branch true) | HIGH (enterprise) |
| Flow action string-level; enterprise process domain-contract yok | `scheduled-flow.ts` (action:string) | HIGH |
| Approval gate ROBUST (no-auto-approve, file-backed cross-process) | `approval-adapter.ts` | DÜŞÜK (iyi) |

**+ RCA-fix doğrulaması:** local-model RCA gap'leri A/B/C/E/F **hepsi FIXED** (merge `a58d86bf`), bağımsız pas kod'dan teyit etti.

---

## 2. Bağımsız Pasın YENİ/EXTENDED Bulguları (alperen RCA'da yok)

### 2A. Task / Execution model (en kritik küme)
- **🔴 5 uyumsuz `TaskType` enum'u + `Task`'ta `type` field'ı YOK.** `decision-types.ts` (7), `rubric-registry.ts` (3, ADR-053), `task-router.ts` (5), `adr-selector.ts` (10), `routing-types.ts` (IntentType). Tip evaluation-zamanı scope-shape'ten hesaplanıyor, Task'a yazılmıyor (ephemeral) → downstream sorgulayamıyor, 2 sistem uyumsuz mantıkla yeniden-hesaplıyor. **HIGH.**
- **🔴 Three-way agent/skill routing tutarsızlığı:** CLI run = full agent+skill; MCP run = full; **autonomous (`runTaskMode`) = HİÇ (her zaman generic)**. → autonomous task'lar aynı açıklamayla sprint task'larından sistematik olarak DAHA KÖTÜ performans (domain-expertise + skill enjekte edilmiyor). **HIGH** — autonomous vizyon için kritik.
- **🔴 EffectClass G3 autonomous policy-gate'e WIRE EDİLMEMİŞ → `risk-tagged` == `policy:auto`.** `getEffectClass(task)` **tanımlı** (`rubric-registry.ts:375`) ama autonomous'ta kullanılmıyor: tek caller `runtime-loop.ts:220` `decidePolicy(entry)`'yi **computed effect geçmeden** çağırıyor → default `'reversible'` (AUTO_SAFE); `BacklogEntry`'de `effectClass` field'ı yok. → risk-gate **defaulted-open**, park-path ulaşılamaz. Authority trusted-internal + bu → `risk-tagged` ile `auto` aynı yolu izliyor (sıfır marjinal kısıt). **HIGH.** *(Not: doğrudan spot-check D-investigator'ın "getEffectClass yok" detayını düzeltti — fonksiyon VAR ama wire değil; sonuç aynı.)*
- `TaskResult.coverage`/`testsPassed` **required** (non-code work ifade edemez); GoNogo freeform-text (machine-readable değil); `tenant` BacklogEntry'de var ama **Task'ta yok** (enterprise isolation execution-layer'a taşınmıyor, **HIGH**); idempotency yok (çift-execution guard yok); lineage fix-only; `deckent_style` binary (process-mode config-foundation yok); `maxRetries:0` tüm rubric'lerde dead.

### 2B. Provider-free residual (post-a58d86bf)
- **MCP `run` tek kalan routing GAP** (bootstrap+isAdapterProvider yok → ollama misroute; claude/codex/gemini için data-integrity). Diğer 7 path CLEAN.
- **🔴 `CLAUDE_AUTH_REQUIRED=1` koşulsuz inject** (`spawn-backend-docker.ts:532`, guard yok) + `worker.ts:696` `authHealthCheck` hardcoded `claude --version` → her codex/gemini docker worker claude-health-check tetikliyor → mixed-provider docker'da AUTH_FAILED. **HIGH.**
- **🔴 Docker `claudeArgs` + `--dangerously-skip-permissions` codex/gemini'ye geçiyor** (`spawn-backend-docker.ts:339-346`) → non-claude CLI parse-error. **HIGH.**
- `auto-setup.ts:57` `tierToModel` provider='claude' hardcode + `detectSubscription` claude-only → **non-claude `--auto` user yanlış (claude-haiku) config alır. HIGH.**
- `onboard.ts` ayrı komut, detection'ı düşük-fidelity duplike eder + i18n-violation (hardcoded string).

### 2C. Flow / autonomous / enterprise (D)
- **🔴 Flow ÇİFT-BLOK dead:** ScheduledFlow `requestedBy=tenantId` ('local') → trusted-internal `startsWith('system')` false → authority deny; + sadece `autonomous.execute` handler kayıtlı → diğer action string'leri "no handler". → **kullanıcı-config flow'lar çalışmıyor** (iki bağımsız neden). **HIGH.**
- `nextRun()` cron-skeleton (sadece `minute` field) → `0 9 * * *` her dakika ateşler. **ORTA.**
- **Recurring backlog entries DEAD:** `queryDue()` `recurring`'i hariç tutuyor; cron-reset path'i yok → `recurring` entry sonsuza dek pending. **ORTA.**
- Backlog done/failed entry'leri sınırsız büyür (purge yok). **DÜŞÜK.**
- Audit lineage yok (causationId/correlationId/parent-trace yok) → enterprise causal-lineage (SOC2/ISO) yetersiz. **ORTA.**
- F8 Capability Broker kodda YOK; ADR-071 self-dispatch proposed/partial.

### 2D. Cross-surface / production-grade (E — alperen'in CLI/MCP kapsamı dışı)
- **🔴 Enterprise dashboard sayfası HOLLOW:** `EnterprisePage.tsx` `/api/enterprise/{tenants,rbac,audit,rate}` çağırıyor; `api/server.ts`'de bu route'lar YOK → 4 tab kalıcı boş (production'da). **HIGH (enterprise).**
- **VS Code extension STUB** (`extension.ts` "Stub — Sprint 049"; handler'lar boş). **npm PUBLISH YAPILMADI** (registry'de yok — en görünür beta-gate). **MCP-client-broker REPL'e wire değil** (`project_mcp_client_not_wired_s229`). **Skill-marketplace backend serve etmiyor.**
- `tenantId:'local'` **6 runtime call-site'ta hardcode** → multi-tenant schema-only (tip var, enforcement yok).
- **GPU/VRAM körlüğü:** `system-capacity.ts` "GPU detection Sprint 151+" hiç gelmedi → tek-GPU'da çok-ollama-worker sessizce VRAM/slot-contention. **(local-model autonomous concurrency için kritik — RCA §3 ile birebir).**
- Coverage threshold'ları baseline'ın %5 altında (anti-ratchet, sessiz regresyon headroom). Dashboard tipleri `src/core/`'dan duplike (schema-share yok).

---

## 3. Alperen RCA'ya Düzeltmeler (bağımsız pas)

1. **Provider-coupling sistemik DEĞİL, MCP `run`'a lokalize.** CLI `run` + `runTaskMode` provider hardcode etmiyor. Çerçevele: "MCP run yapısal olarak ollama/codex/gemini'ye dispatch edemez", "tüm run path'leri" değil.
2. **ADR-053 accepted (proposed değil).** Çekirdek 3-tip taxonomy shipped (Sprint 172); genişletme (email/erp) kabul-edilmiş ADR'nin yapılmamış ikinci yarısı, net-yeni kavram değil.
3. **MCP safety-metadata KISMEN var.** 32 tool'un hepsi `readOnlyHint/destructiveHint/idempotentHint` taşıyor; eksik olan `long-running`/`approval-required` (MCP SDK contract'ında yok, custom-extension gerekir). "Metadata yok" yanlış.
4. **MCP tool-count drift YOK (şu an).** 32 tam eşleşiyor; drift gelecek-riski (test ile guard önerisi geçerli).
5. **`getProviderForModel` Claude-default DEĞİL** (unknown → throw). Claude-assumption'lar: `auto-setup.ts:57`, `spawn-backend-docker.ts:116/532`, `mcp/tools/run.ts:63`.
6. **`72/100` CLI/MCP-dilimi için adil** ama enterprise cross-surface için yüksek (~52). Denominator dar (dashboard/API/IDE/packaging bakılmadı).
7. **Bazı alperen P0'ları beta-blocking değil** (ExecutionRequest/TaskType = doğru tasarım-işi ama developer-beta-blocker değil). Gerçek beta-blocker'lar: MCP-run-hardcode fix + start-autoApprove davranış-dokümante + **npm publish** + hollow-enterprise-dashboard (enterprise-beta için).

---

## 4. Cross-Cutting Temalar (birleşik)
- **A. Hollow-surface vs missing-contract** — ikisi de aciliyetli; biri diğerini kapsamıyor.
- **B. Wired vs proven** — her alt-sistemi sınıfla: wired+proven / wired+unproven / unwired. (Pazarlamadan önce efficacy-proof.)
- **C. Single-tenant-runtime, multi-tenant-schema** — `tenantId:'local'` 6 yerde hardcode; tip multi-tenant der, runtime tek-tenant.
- **D. npm-publish blocker** — ürün npmjs'de yok; public-repo'dan temiz publish en görünür gate (alperen'de yok).
- **E. Local-model concurrency** — GPU-VRAM-aware scheduling + OLLAMA_NUM_PARALLEL backpressure yok (local-model-autonomous RCA §3 ile örtüşür; enterprise data-sovereignty pillar için kritik).

---

## 5. Birleşik Öncelikli Aksiyon Planı (iki planın merge'i)

**P0 — Canonical contract + beta-blocker'lar (enterprise-beta ön-koşulu):**
1. `ExecutionRequest` contract → `run`/`start`/autonomous CLI+MCP tek yol; **MCP `run` Claude-hardcode kaldır + provider-router** (autonomous=always-generic'i de düzelt → agent/skill enjekte et).
2. `TaskType/EnvironmentType/RequirementProfile` SSOT tasarımı + `Task`'a `type` field'ı yaz + 5-enum reconcile (ADR-053 single-source).
3. **EffectClass G3'ü gerçekten hesapla** (`getEffectClass` caller'a bağla) → `risk-tagged` park-path canlı; **flow çift-blok fix** (tenantId→system trust + handler) ; **MCP-run/docker provider-free** residual'ları (CLAUDE_AUTH_REQUIRED guard + claudeArgs non-claude).
4. `start` parity-contract (preflight/cost/sandbox/autoApprove/detached/force) + dead-letter `--auto-approve` flag'leri düzelt; MCP safety-metadata (`long-running`/`approval-required` custom) + registry-drift test.
5. **npm publish gate** (temiz public-repo publish) — beta'nın en görünür kapısı.

**P1 — Onboarding + profiller + cross-surface + autonomous-hardening:**
1. `OnboardingDecisionEngine` (init/analyze/recommend birleşik; tierToModel/detectSubscription provider-neutral) + `.deckent/first-run/` proof.
2. `InstallProfile` (assistant/developer/team/enterprise — capability-bundle, edition değil) + dynamic `LayerProfile` (planner).
3. **Enterprise dashboard backend** (`/api/enterprise/*` route'ları → hollow-page kapat) + dashboard↔core schema-share.
4. Autonomous Phase-2 hardening (Brain backpressure to OLLAMA_NUM_PARALLEL + per-worker timeout + /api/tags health-gate + task-artifact cleanup + recurring-entry execution + done-purge) + **GPU/VRAM detection** (`system-capacity`).
5. Autonomous backlog+flow yeni task-semantics'e; chat→conversation-control-plane; MCP-client-broker REPL'e wire.

**P2 — Enterprise-grade + scale:**
1. Hard-enforced RBAC (ADR-037 V2 hard-flip) + audit-lineage (causation/correlation) + multi-tenant runtime (tenantId:'local' hardcode kaldır).
2. T2 vLLM+LiteLLM enterprise multi-model gateway (8+ concurrent) + process-mode domain-contract (ProcessDefinition/ConnectorSpec/DataClassification) + F8 Capability Broker.
3. VS Code extension gerçek impl; skill-marketplace backend; profile-based docs; coverage upward-ratchet; performance/scale profiling.

---

## 6. Pozisyon İçin İmalar (deep revizyon Alperen ile — sonra)
- Bu birleşik analiz, "deckent = agentic-OS / orchestration runtime" vizyonunu **kod-temelli doğruluyor** (parçalar gerçek + güçlü) ama **ürünleşme = canonical-contract + cross-surface + proven-efficacy** üçlüsünü gerektiriyor.
- **Konumlandırma kararı (birlikte):** developer/dogfood-first beta (71/100, çekirdek hazır) → contract+hollow-surface kapanışı → enterprise-beta. "Tek-ürün, capability-bundle profiller" (ADR-033 product-not-service ile uyumlu).
- RCA'ların "SSOT'a eklenecek özet taslak" maddeleri (alperen RCA §514-526) + bu pasın yeni-bulguları birlikte MASTER-PLAN §4I AS-8 + blueprint'e işlenecek (Alperen onayıyla).

---

## 7. Kaynaklar
- Alperen RCA: `docs/alperen-analysis/2026-06-08-cli-mcp-product-flow-root-cause.md`.
- Local-model autonomous RCA: `docs/analysis/2026-06-08-local-model-autonomous-rca.md`.
- Bağımsız pas: 5 investigator (CLI/MCP-parity · task-model · onboarding/provider · autonomous/flow/enterprise · coverage-critic), 2026-06-08, hepsi file:line kod-doğrulamalı.
- SSOT: `docs/MASTER-PLAN.md` (§4I AS-8, §10A continuation), `docs/vision/blueprint.md` (§23 Phase-8).
</content>
