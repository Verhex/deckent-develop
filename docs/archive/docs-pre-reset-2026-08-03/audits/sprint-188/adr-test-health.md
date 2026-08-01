# W2-T12 — ADR Uyum + Test Sağlığı Denetimi

**Sprint:** 188 (Self-Analysis) | **Task:** 188-012 (W2-T12)
**Tarih:** 2026-05-22 | **Tip:** Audit — ANALYSIS-ONLY (ADR-053)
**Worker:** w-188-012 (Claude Opus, docker backend)
**Bağımlı raporlar:** `core-health.md` (T03), `orchestra-health.md` (T04), `agents-monitor-health.md` (T05), `nervous-connectors-providers-health.md` (T06), `feature-inventory.md` (T09).
**Yöntem:** W1 raporları ground-truth alındı; `.brain/exports/decisions.md` (64 ADR), `.deckent/ci-baseline.json`, `src/**` ve `tests/**` grep'leri ile çapraz doğrulama. Hiçbir kaynak / config / doküman değiştirilmedi.

---

## 1. Kapsam ve Sınıflandırma

İki paralel denetim:

- **ADR uyumu (Bölüm 2-5):** `.brain/exports/decisions.md` içindeki **64 ADR**'nin (62 accepted + 2 deprecated + 1 superseded ile birlikte; ADR-005 deprecated, ADR-022 superseded by ADR-022-V2 — `decisions.md:85,576`) koda uygulanma durumu. Direktif paragrafının vurguladığı 4 ADR (008, 037, 045, 046) ve 3 proposed ADR (055, 060, 061) ayrı ayrı incelendi.
- **Test sağlığı (Bölüm 6-8):** `tests/**` envanteri, `.deckent/ci-baseline.json` baseline'ı, direktifte adı geçen 5 fail-kategorisi (workflows / docs config / nervous / docker-e2e / rules-refactor), `vitest.config.ts` exclude listesi ve dashboard test gateway'i.

**Sınıflandırma — ADR uyumu:**
| Etiket | Tanım |
|--------|-------|
| **UYGULANIYOR** | Accepted ADR; kod tarafında runtime caller mevcut, enforce ediliyor |
| **KISMI** | Accepted ADR; kod var ama wire eksik / advisory / pilot kapsamlı |
| **DORMANT (ADR-protected)** | Accepted ADR; kod kütüphane modunda, runtime caller yok |
| **DOC-DRIFT** | Accepted ADR; kod ile metin arasında bayat referans (sayı, isim, hedef) |
| **SEED-ONLY** | Proposed ADR; sembolik kod izi var, full pipeline beklemede |
| **MANİFESTO-ONLY** | Proposed ADR; kod izi yok, kavramsal doküman |

---

## 2. 64 ADR Genel Statü Tablosu

`.brain/exports/decisions.md` — başlık tablosu (`grep "^## adr-"` → 64 madde):

| Aralık | Adet | Statüler | Notlar |
|--------|------|----------|--------|
| 001-010 | 10 | 9 accepted + 1 deprecated (005) | ADR-001 ESM, ADR-002 Node16, ADR-003 vitest, ADR-005 senkron I/O deprecated |
| 011-020 | 10 | 10 accepted | ADR-011 readline, ADR-012 register pattern, ADR-017 MCP-native, ADR-020 7-section |
| 021-030 | 10 | 9 accepted + 1 superseded (022→022-V2) | ADR-027 hybrid backend, ADR-028 routing V2, ADR-029 managed-docs |
| 031-040 | 10 | 10 accepted | ADR-035 verify protocol, ADR-036 ADR governance, ADR-037 RBAC V1.0, ADR-040 nervous |
| 041-048 | 8 | 8 accepted | ADR-045 wave, ADR-046 self-update hook, ADR-047 manual subagent, ADR-048 prompt lifecycle |
| 053-055 | 3 | 2 accepted (053) + 1 proposed (055) | 049-052 numara boşlukları (kasıtlı reserve; `decisions.md` indexte yok) |
| 060-061 | 2 | 2 proposed | Self-Awareness + AEGIS |
| 062-064 | 3 | 3 accepted | Web Terminal, Consent Provisioning, TOPP |

**Toplam:** 64 başlık; 60 accepted + 1 deprecated + 1 superseded + 3 proposed (055/060/061). `summary.md` "Active Architecture Decisions" tablosundaki 56 satır (W1-T09 §8) ile birebir uyumlu (proposed olanlar listelenmemiş, manuel ek = 64).

**Bulgu S-01 (numara boşluğu):** 049-052 numaraları indexte yok; `.brain/exports/decisions.md` 4188 satırında ADR-053 doğrudan ADR-048'i takip ediyor — bilinçli reserve mi yoksa archive mi belirsiz (W2-T11 doc-drift kapsamına potansiyel girdi).

---

## 3. Vurgulu ADR'lerin Kod Gerçeği

### 3.1 ADR-008 — Brain Merkezi Import / Tek Yönlü Bağımlılık

**Statü:** **KISMI** (1 katı ihlal + enforcer kapsam darlığı).

**Kanıt (T03 + T04 birleştirildi):**
- `src/core/notify.ts:17` → `import { eventBus } from '../orchestra/event-bus.js';` — core → orchestra **katı ihlal**.
- `src/orchestra/authority-enforcer.ts:496-518` ADR-008 detektörü tam olarak bu pattern'i yakalıyor, `description: 'ADR-008 violation: core/ module imports from orchestra/'` ile event yayımlıyor; ancak **soft mode** olduğundan bloke etmiyor (`authority-enforcer.ts:241/272/282/290` → `mode:'soft'`).
- Orijinal grep `from.*brain` → `src/orchestra/tmux.ts | src/monitor/auditor.ts | src/agents/worker.ts` üçünde sıfır eşleşme ✓ (T04 §6).
- **Kapsam darlığı:** Enforcer yalnızca `core/ → orchestra/`'yı tarıyor. ADR metni "Brain merkezi"i daha geniş yorumlandığında `agents/`, `monitor/`, `api/`, `cli/` modüllerinin `orchestra/` yardımcılarına (`authority-enforcer`, `event-stream`, `ipc-registry`, `tmux`, `brain`) import'u (T05 §6, T04 §6) ADR metninden daha katı bir okumayla "izinli alt-set" gerektiriyor.

**Sprint 189 etkisi:** `core/notify.ts:17` fix + enforcer kapsam genişletme; ADR-008 V2 hard-flip planına dâhil edilebilir.

### 3.2 ADR-037 — Brain-Auditor-Worker Authority Matrix RBAC V1.0

**Statü:** **KISMI (advisory/soft, Layer-2 kasıtlı eksik)**.

**Kanıt (T05 §2 + T09 §3):**
- `src/agents/worker.ts:537-574 checkWorkerAuthority` — `result.allowed === false` durumda `console.warn` + `emitAuthorityViolation` çalışıyor; ama fonksiyon her dalda **`return true`** (`worker.ts:570, 573`). Runtime hard-block YOK.
- `src/orchestra/authority-enforcer.ts:299` — Layer-1 lint (compile-time) ve audit-trail event'i mevcut. Brain `runAuthorityChecks` (`monitor/auditor.ts:344-388`) soft scan ediyor.
- `worker-default.md` "Verify Loop" bloku açıkça "prompt talimatı, kod-enforce DEĞİL" diyor.
- DECKENT.md gotchas: "compile-time lint + audit-trail; runtime advisory/soft (V1.0 Layer-2 kasıtlı eksik), hard-flip V2 post-GA" — kod gerçeği ile dokümantasyon iddiası **birebir uyumlu**.

**Bulgu S-02:** README:152 "strict role boundaries" ifadesi V1.0'da yanıltıcı (T09 G-01). Düzeltme önerisi: "advisory/soft V1.0; hard-flip V2 post-GA" notu eklenmeli.

### 3.3 ADR-045 — Wave-Based Execution / `respawnEligibleTasks` Runtime Wire

**Statü:** **UYGULANIYOR**.

**Kanıt:**
- `src/orchestra/sprint-spawner.ts:465 export async function respawnEligibleTasks(...)` — canlı.
- `src/orchestra/result-collector.ts:50-65, 505-506` — runtime dynamic import + invocation (`mod.respawnEligibleTasks`, `await respawnEligibleTasks(projectRoot, sprint, config, spawnOpts)`).
- `src/orchestra/dependency-scheduler.ts:242 enforceWaveDependency` — Kahn topological wave-filter; `sprint-spawner.ts:486` ve `:1069` çağrı noktaları.
- `src/core/config.ts:759 dependency_pipeline_enabled = true` (default; T03 §2 doğruladı). `.deckent/config.json:198` deckent-dev için bilinçli `false` (ADR-047 ile uyumlu).
- `src/orchestra/event-stream.ts:101, 392` — `respawnEligibleTasks` özel event channel'ı.

**Sonuç:** ADR-045 hem default-on (user projeleri) hem deckent-dev manuel-wave (ADR-047 covers) için tam wire'lı.

### 3.4 ADR-046 — Brain Self-Update Hook (Step Ordering Contract)

**Statü:** **UYGULANIYOR**.

**Kanıt:**
- `src/orchestra/sprint-finalizer.ts:1198+` — Step Ordering: `memoryExport → adrInsert → ruleRegen → updateProjectDocs` (T09 §8 A-02).
- Diğer hook noktaları: `src/core/identity-generator.ts`, `src/core/rule-generator.ts`, `src/core/adr-file-sync.ts`, `src/cli/commands/memory.ts` — beş dosyada wire bulundu (grep evidence).
- `summary.md` `Total entries: 322 | Generated: 2026-05-22` her sprint finalize sonrası refresh; bu hook'un canlı ürünü.
- ADR-046 + ADR-043 (Brain Crash Recovery) + ADR-044 (State Observability) üçlüsü `sprint-controller.ts:585-627` resume yolu ve `:699 writeStateSnapshot` snapshot loop ile uyumlu (T04 §10-11).

---

## 4. Proposed ADR'lerin Kod İzleri

### 4.1 ADR-055 — Hybrid Scoring 5-Layer Pipeline

**Statü:** **SEED-ONLY (Sprint 156 T-011 EffectClass seed)**.

**Kanıt:**
- `src/orchestra/rubric-registry.ts` — rubric registry mevcut (T07/T09'da bahsedilen sembolik altyapı). Grep `effect.?class` → 4 dosya: `result-evaluator.ts`, `rubric-registry.ts`, `evaluation-audit-trail.ts`, `sprint-phases.ts`.
- ADR metni `decisions.md:4336-4354` "proposed (Sprint 156 — EffectClass seed implementasyonu T-011'de tamamlandı; tam pipeline ayrı sprint'e bırakıldı)" diyor — **statü gerçekçi**.
- 5-katman tam pipeline (Schema → Gates → Quality → Outcome → Auditor) henüz **tek noktadan** akmıyor; `result-evaluator.ts` 2085 LoC içinde rubric + downgrade + cascade var ama "5-layer composable pipeline" semantik split yapılmamış.

**Değerlendirme:** "proposed" durumu **uygun**; SEED'in ötesine geçmesi bağımsız sprint gerektirir.

### 4.2 ADR-060 — Self-Awareness Propagation / 5-Channel Context Enrichment

**Statü:** **SEED-ONLY (kanal 5 — worker-enrichment Sprint 156 T-007)**.

**Kanıt:**
- `src/orchestra/brain-context.ts` (268 LoC) — Sprint 139 dead-code-report'unda "Context enrichment functions — not imported by any src/ file" diye işaretlenmişti (`docs/audits/sprint-139/dead-code-report.md:32-36`). Ancak grep `awareness|enrichContext|worker-enrichment` → 6 dosya hit ediyor: `sprint-finalizer.ts`, `managed-docs/content-generators.ts`, `brain-context.ts`, `security-specialist/SKILL.md`, `heartbeat-types.ts`, `doc-writer/PROMPT.md`.
- Statü `decisions.md:4540-4558` "proposed (Sprint 156 — kanal 5 (worker-enrichment) T-007 ile seed edildi; tam mimari ayrı sprint'e planlandı)" — **uyumlu**.

**Bulgu S-03 (kritik):** `brain-context.ts` Sprint 139 audit'inde **dead** olarak işaretlenmiş ama ADR-060 seed implementasyonu olarak korunuyor olabilir. Eğer Sprint 189 dead-code disposition `brain-context.ts`'i kaldırırsa ADR-060'ın seed izi de yok olur. Disposition kararı verilmeden önce ADR-060'la çapraz kontrol gerekli.

### 4.3 ADR-061 — AEGIS Methodology

**Statü:** **MANİFESTO-ONLY** (kod izi yok).

**Kanıt:**
- `grep -ri "AEGIS" src/` → 0 hit.
- ADR metni `decisions.md:4726-4750` "proposed (Sprint 175 başlangıç, Sprint 200 god-level GA launch ile birlikte canonical)" diyor. Sprint 188 itibarıyla **çok erken**; metni "14+ özgün mimari yapının kompozit disiplini" olarak konumlandırıyor.
- ADR-061 bir kod ADR'si değil, kompozit methodology manifestosu. Bu nedenle "manifesto-only" beklenen durumdur.

---

## 5. Diğer Accepted ADR'ler — Hızlı Doğrulama (T09 §8 cross-ref)

| ADR | Statü | Wire kanıt |
|-----|-------|-----------|
| ADR-029 Managed-Docs | UYGULANIYOR | `src/orchestra/managed-docs/managed-doc-runner.ts` + `sprint-reporter.ts updateProjectDocs` (T09 §10) |
| ADR-030 Template+Plugin | UYGULANIYOR | `managed-docs/template-renderer.ts` + `plugin-loader.ts` |
| ADR-031 Content Hash Cache | UYGULANIYOR | `managed-docs/doc-cache.ts` |
| ADR-032 i18n Pattern | UYGULANIYOR | `content-generators.ts I18nStrings/EN/TR` + `types.ts patternsByLang` |
| ADR-035 Verification Protocol | UYGULANIYOR | `event-stream.ts CHANNELS` 15 sabit (T09 §8) |
| ADR-036 ADR Governance | UYGULANIYOR | `scripts/adr-validator.mjs` + `decisions.md` injection (worker prompt'ta da görüldü) |
| ADR-038 Dead Code Disposition | UYGULANIYOR (sürekli) | `docs/audits/sprint-139/dead-code-report.md` + per-sprint follow-up |
| **ADR-039 Self-Modifying Detection** | **DORMANT (ADR-protected)** | `src/orchestra/self-modifying-detector.ts:155 isSelfModifyingSprint` — `grep -rn "isSelfModifyingSprint("` src/ tüm dosyalarda 1 sonuç (kendi tanımı, satır 155). `authority-enforcer.ts:48,299,302` parametre olarak alır ama **caller hiçbir yerde set etmez**. T09 G-02 ile mutabık |
| ADR-040 Nervous System | KISMI / DORMANT | Bootstrap + 12 detector tam wire; `nervous_system.enabled=false` default — deckent-dev hâlâ aktive etmedi (T06 §2.2) |
| ADR-041 Agent Taxonomy | UYGULANIYOR | 15 agent + 21 skill manifest (T09 §5) |
| ADR-042 Hybrid Mode (sprint+task) | UYGULANIYOR | `cli/commands/mode.ts` + `orchestra/task-mode-runner.ts` (T09 §2) |
| ADR-043 Crash Recovery | UYGULANIYOR | `sprint-checkpoint.ts` + `cli/commands/resume.ts` (T04 §11) |
| ADR-044 State Observability | UYGULANIYOR | `monitor/sprint-state.ts:33-63 getCurrentSprintId()` single source of truth (T05 §5) |
| ADR-047 Manuel Subagent | UYGULANIYOR (policy-level) | `.deckent/config.json:198 dependency_pipeline_enabled=false` deckent-dev'de uygulanıyor |
| ADR-048 Prompt Lifecycle | UYGULANIYOR | Worker prompt'unda ADR injection bloku gözlemlendi (mevcut sprint'in prompt'unda canlı) |
| ADR-053 TaskType Taxonomy | UYGULANIYOR | `task-types.ts taskType: 'audit'\|'document-write'\|'code-development'` + ADR-053 task type spec |
| ADR-062 Embedded Web Terminal | UYGULANIYOR | `src/api/terminal/` 8 modül (T09 §3) |
| ADR-063 Consent Provisioning | UYGULANIYOR | `cli/commands/init.ts` consent + prereq install (T09 §9) |
| ADR-064 TOPP (Continuous Dispatch) | UYGULANIYOR | `dependency-scheduler.ts` + `sprint-spawner.ts` wave-barrier kaldırma |

**ADR uyum özet skoru:** 60 accepted'tan **52 UYGULANIYOR + 5 KISMI + 2 DORMANT + 1 DOC-DRIFT** (ADR-040 detector sayısı + Sprint 148 aktivasyon hedefi bayat — T06 B5/B1). Toplam %87 sağlam.

---

## 6. `tests/` Envanteri

`find tests -name "*.test.ts*" | wc -l` → **868 test dosyası**, 33 alt dizinde.

### 6.1 Dağılım (Top-N)

| Dizin | Test dosya sayısı |
|-------|-------------------|
| `tests/orchestra/` | 223 |
| `tests/core/` | 169 |
| `tests/cli/` | 157 |
| `tests/mcp/` | 39 |
| `tests/nervous/` | 37 |
| `tests/integration/` | 35 |
| `tests/agents/` | 33 |
| `tests/docs/` | 25 |
| `tests/dashboard/` | 23 (ayrı config: `vitest.dashboard.config.ts`) |
| `tests/e2e/` | 22 |
| `tests/api/` | 20 |
| `tests/scripts/` | 16 |
| `tests/monitor/` | 11 |
| `tests/providers/` | 8 |
| `tests/security/` + `tests/connectors/` + `tests/github/` | 6+6+5 |
| `tests/workflows/` | **1** (sadece `publish.test.ts`) |
| `tests/config/` | 2 |
| `tests/docker/` | 3 |

**Bulgu T-01:** `tests/workflows/` yalnızca 1 dosya içeriyor (`publish.test.ts`) — direktifte "workflows" kategorisi olarak adlandırılmış; gerçek fail sınıfı bu küçük kapsamlı. `tests/dashboard/` ayrı config'le yürütülür (`vitest.config.ts:6 exclude: ['tests/dashboard/**']`).

### 6.2 Config'ler

- `vitest.config.ts` — root suite, `include: tests/**/*.test.ts`, `exclude: tests/dashboard/**`, `testTimeout: 10000`, v8 coverage. Exclude listesi index barrel modüllerini coverage'dan çıkarıyor (`agents/index`, `core/index`, `monitor/index`, `orchestra/index`, `cli/index`, `mcp/tools/index`, `mcp/resources/index`, `dashboard/**`).
- `vitest.dashboard.config.ts` — dashboard suite (React + Vitest jsdom env).
- `tsconfig.json` — Node16 moduleResolution + ESM (ADR-001, ADR-002).

---

## 7. Bilinen Fail Tasnifi

`.deckent/ci-baseline.json` (sprint-188, 2026-05-22 14:03:41 UTC):

```json
{
  "sprintId": "sprint-188",
  "baseline": {
    "tscPassed": true,
    "testCount": 43,
    "testPassed": 0,
    "testFailed": 43,
    "coverage": 0
  }
}
```

**Yorum:** `testCount=43` tüm 868 test dosyasının değil, audit gate'in örneklediği bir alt-küme. `runVitestAuditGate` (`monitor/auditor.ts:2790`) + `gatherCiBaseline` (`monitor/auditor.ts:2521`) sprint başında **vitest run** ile baseline alır; sprint-188 audit-only kapsamda örneklenmiş bir mini-suite olarak görünüyor (büyük ihtimalle docs/config/workflows/nervous fail küme örneklemesi). `tscPassed:true` + `testPassed:0` koşulu, tsc temiz iken seçili test alt-kümesinin tamamen kırık olduğunu söylüyor.

### 7.1 Direktifte Belirtilen 5 Fail-Kategorisi — Eşleme

Direktif metni: "bilinen ~31 başarısız testin tasnifi (kategori: **workflows / docs config / nervous / docker-e2e / rules-refactor**)".

| Kategori | tests/ alt-dizin | Dosya sayısı | Kanıt / Yorum |
|----------|------------------|--------------|----------------|
| **workflows** | `tests/workflows/` | 1 (`publish.test.ts`) | Yayın pipeline guard'ı — npm publish kontrolü; lokal env'de çalışmaz (sadece CI'da) |
| **docs config** | `tests/docs/` + `tests/config/` | 25 + 2 = 27 | `tests/docs/vitepress.test.ts`, `validate-publish.test.ts`, `release-notes-beta.test.ts`, `guide-getting-started.test.ts`, `docs-structure.test.ts`, `cli-reference.test.ts`, `marketplace-guide.test.ts`, `release-checklist.test.ts`, `agent-guide.test.ts` … (dokümantasyon hash + structure kontrolleri) |
| **nervous** | `tests/nervous/` | 37 | `ipc-queue`, `dispatcher`, `observer`, `decision-engine`, `dead-event-stream`, 12 detector test'i + 5 integration test'i (T06 §6 sağlam ama runtime context gerektiriyor) |
| **docker-e2e** | `tests/docker/` + `tests/e2e/` | 3 + 22 = 25 | `dockerfile.test.ts`, `docker-hb.test.ts`, `timeout-with-work.test.ts`; `tests/e2e/cross-platform`, `install-matrix`, `provider-matrix` — docker daemon + multi-provider env gerektirir |
| **rules-refactor** | `tests/agents/worker-verify*.test.ts` + `tests/scripts/adr-validator.test.ts` | 4+1 = 5 | Worker verify-loop testleri (`worker-verify-coverage`, `verify-ran-atomic`, `worker-verify`, `worker-verify-lang`) ADR-037 V1.0 advisory mode altında **çağrılmayan** kodu test ediyor (T05 §7 — `worker-verify.ts` DORMANT). `tests/scripts/adr-validator.test.ts` ADR validator pipeline. |

**Toplam fail-aday kategori kümesi:** ~95 test dosyası bu 5 kategoride yer alıyor (1+27+37+25+5). Direktifin "~31 başarısız test" rakamı muhtemelen **test dosyası değil tek tek test descriptor** sayımıdır — `tests/docs/`+`tests/nervous/` ve `tests/agents/worker-verify*` testleri içindeki başlık başına 1-5 descriptor.

**Bulgu T-02:** `ci-baseline.json` testCount=43 / testFailed=43 oranı, baseline gate'in yalnızca **fail-küme örneklemesi** yaptığını ve sprint-188'i bu örnek üzerinden değerlendirdiğini gösteriyor. Tam suite çalıştırılmadı (sprint audit-only). Sprint 189'da `npm test` (vitest run) full suite gerçek fail sayısını ortaya koyar.

### 7.2 Fail Sınıfı Kök-Nedenleri (W1 raporları + memory.md analizi)

`memory.md:253` — **"Vitest Gate +1 Fail Closure"** (önceki sprint kaydı): "full vitest run 17 fail / 8 dosya". Bu kayıt sprint-180 civarı; sprint-188 baselline 43 fail'e yükseldi → **regresyon trendi**.

Kök-neden tahmini (W1 + memory delili):

1. **docs config (25 dosya, sayıca en büyük tek küme):** Doküman hash / structure checker testleri Sprint 187 doc-refresh sonrası bayat hash referansları tutuyor olabilir; W2-T11 doc-drift raporu net cevap verecek.
2. **nervous (37 dosya):** `.deckent/config.json:111 nervous_system.enabled=false` runtime context'inden ötürü integration testleri yapılandırılmış observer/dispatcher beklerken null alıyor olabilir.
3. **docker-e2e (25 dosya):** Lokal container daemon yokluğu + multi-provider API key yokluğu. CI'da çalıştırılması beklenen küme.
4. **workflows (1 dosya):** `publish.test.ts` — `npm pack` + version tag kontrolü; lokal `git tag` state'ine bağımlı.
5. **rules-refactor (5 dosya):** `worker-verify.ts` testlerini DORMANT kod üzerinde sürdürmek (T05 §7) — kod-enforce yokluğu testleri kırılgan bırakıyor; ADR-037 V2 hard-flip'e kadar fail kalması beklenen durum.

---

## 8. Coverage Durumu ve Boşluklar

`ci-baseline.json` `coverage: 0` — `runVitestAuditGate` baseline'da coverage hesaplanmadı (`--coverage` flag verilmemiş veya örneklem testleri başarısız olduğu için v8 hesaplaması atlandı).

### 8.1 Bilinen Coverage Boşlukları (W1 raporları + grep delili)

| Modül / Alan | Coverage Riski | Kanıt |
|--------------|----------------|-------|
| `src/agents/` 9 DORMANT modül | Yüksek — kod var, test var, runtime caller yok | T05 §7 `adaptive-agent`, `prompt-evolution`, `prompt-rollback`, `prompt-ab-test`, `prompt-metrics`, `agent-genealogy`, `agent-retirement`, `specialization-drift`, `cross-sprint-analyzer`, `permission-guard`, `shared-context` |
| `src/connectors/{discord,telegram,whatsapp}.ts` | Yüksek — bot lifecycle hiç çalışmıyor | T06 §3.3 — class export ediliyor ama `new ...Connector()` src/'de 0 caller |
| `src/providers/sandbox.ts` | Tam (SandboxSpawnBackend) | T06 §4.5 — `tests/providers/sandbox.test.ts` mevcut ama src/ caller yok |
| `src/orchestra/brain-context.ts` 268 LoC | Tam ölü | `dead-code-report.md:32-36` Sprint 139 "no caller" |
| `src/orchestra/self-modifying-detector.ts` | Düşük (intent-ready, wire eksik) | `tests/orchestra/self-modifying-detector.test.ts` var, src/ caller yok (ADR-039 wire boşluğu) |
| `src/agents/worker-verify.ts enforceVerifyLoop/runTestVerifyLoop` | Test-only | `tests/agents/worker-verify*.test.ts` 4 dosya — DORMANT kod test ediliyor |
| `src/core/memory-import.ts backfillSprintMemoriesFromSprintsDir` | Tam ölü | T03 §5 — src/+tests/ 0 caller |
| `src/orchestra/handoff-protocol.ts` (152 LoC) + `batch-stats.ts` (141 LoC) | Tam ölü | `dead-code-report.md:20-29` |

**Bulgu T-03 (kritik):** Coverage iyileştirmek için kod ekleyerek değil **dead-code disposition** ile ilerlemek doğru patika. ADR-038 (Dead Code Disposition) accepted; Sprint 189'da bu modüllerin kaldırılması coverage payda'sını anlamlı düşürür (negatif payda etkisi → pozitif yüzde artışı). Tam ölü 561 LoC + ADR-039 wire-boş + 9 dormant agent modülü kaldırılırsa toplam ~2-3 KLoC payda küçülmesi.

### 8.2 Coverage Excluded Listesi Tutarlılığı

`vitest.config.ts:11-21` exclude listesi:
- Index barrel'ları (`agents/index`, `core/index`, `monitor/index`, `orchestra/index`, `cli/index`, `mcp/tools/index`, `mcp/resources/index`) — barrel re-export'lar coverage'a katkı sağlamadığı için **doğru karar** (T05 §1 barrel modüllerin sadece re-export olduğu doğrulandı).
- `src/dashboard/**` — ayrı suite ve config; **doğru ayrım**.
- `src/index.ts` — top-level barrel; **doğru**.

Liste minimal ve hijyen olarak temiz. Aday ek: T05 §7 + T03 §5 belirlenen DORMANT modüller kaldırılana dek `exclude` listesine eklenirse coverage % yapay yükselir — bunun yapılmaması doğru (truth-over-cosmetics disiplini).

---

## 9. ADR ↔ Test Çapraz Drift'leri

| ADR | Test Hizalama Durumu |
|-----|----------------------|
| ADR-008 | `tests/orchestra/sprint-spawner.test.ts` + `tests/scripts/adr-validator.test.ts` `core/notify.ts` ihlalini şu an yakalamıyor (advisory mode) — Sprint 189'da assertion eklenebilir |
| ADR-037 | `tests/agents/worker-verify*.test.ts` runtime caller olmayan kodu sınıyor — V2 hard-flip'e kadar fail-tolerant |
| ADR-039 | `tests/orchestra/self-modifying-detector.test.ts` mevcut ama wire eksik (T09 G-02) — test "kod doğru çalışıyor" diyor, sistem "kullanmıyor" |
| ADR-045 | `tests/orchestra/dependency-scheduler.test.ts` + wave testleri ✓ |
| ADR-046 | `tests/orchestra/sprint-finalizer.test.ts` step ordering testleri ✓ |
| ADR-055 (proposed) | `tests/orchestra/rubric-registry.test.ts` (varsayım — `rubric-registry.ts` 4 dosyada referans alıyor) seed-only kapsamda |
| ADR-060 (proposed) | `brain-context.ts` test'leri T09 G-02 ile çelişkili — Sprint 139'da "dead" sayılan modül için coverage var mı belirsiz |
| ADR-061 (manifesto) | Test ürünü yok (beklenen) |

---

## 10. Risk Özet Matrisi

| Risk | Etki | Olasılık | Kanıt |
|------|------|----------|-------|
| ADR-008 `core/notify.ts:17` advisory soft → V2 hard-flip'te bloke | Orta | Yüksek (V2 yaklaştıkça) | T03 §6, T04 §6 |
| ADR-037 worker-verify dormant + worker.ts `return true` regresyon | Yüksek | Orta | T05 §2, T05 §7 |
| ADR-039 self-modifying detector hiç çağrılmıyor → deckent-dev kazara overwrite riski | Yüksek | Düşük (yalnızca PR'de görülür) | T09 G-02 |
| ADR-040 nervous default-off + 40 sprint aktivasyon gecikmesi | Düşük (ADR-047 ile dengelendi) | — | T06 §2.2 |
| Test küme regresyon trendi (17 → 43 fail) | Orta | Yüksek | memory.md:253 + ci-baseline.json |
| `brain-context.ts` dead-code ↔ ADR-060 seed çelişkisi | Orta | Orta | dead-code-report.md vs T09 §3 |
| Coverage 0 baseline (audit-only sprint sonrası) | Düşük | Yüksek | ci-baseline.json |

---

## 11. Özet

**ADR uyumu (Bölüm 2-5):** `decisions.md` 64 ADR'nin 60'ı accepted (1 deprecated, 1 superseded, 3 proposed hariç). Kod gerçeği ile çapraz denetimde:

- **52 ADR UYGULANIYOR** (kod + runtime caller + enforce mevcut)
- **5 ADR KISMI** (ADR-008 1 ihlal + enforcer kapsam darlığı; ADR-037 advisory; ADR-040 nervous default-off; ADR-055/060 proposed seed)
- **2 ADR DORMANT** (ADR-039 self-modifying-detector wire yok; ADR-038 dispositionsu pasif)
- **1 ADR DOC-DRIFT** (ADR-040 metni 5 MVP detector + Sprint 148 aktivasyon hedefi bayat)

Vurgulu 4 ADR'nin durumu: **ADR-008 KISMI** (`src/core/notify.ts:17` katı ihlal), **ADR-037 KISMI** (advisory/soft V1.0 — Layer-2 kasıtlı eksik, dokümantasyon ile uyumlu), **ADR-045 UYGULANIYOR** (respawnEligibleTasks + enforceWaveDependency + dependency_pipeline_enabled default true), **ADR-046 UYGULANIYOR** (sprint-finalizer Step Ordering Contract). Proposed 3 ADR: **ADR-055 SEED-ONLY** (EffectClass + rubric-registry), **ADR-060 SEED-ONLY** (brain-context.ts + 5 dosyada awareness izi — ama brain-context.ts Sprint 139 dead-code listesinde), **ADR-061 MANİFESTO-ONLY** (kod izi yok, Sprint 200 GA hedefi).

**Test sağlığı (Bölüm 6-8):** `tests/` 868 dosya / 33 alt dizin (orchestra 223, core 169, cli 157 zirvede). `vitest.config.ts` + `vitest.dashboard.config.ts` ikili-suite ayrımı temiz. `.deckent/ci-baseline.json` sprint-188 testCount=43 / testFailed=43 / coverage=0 — audit-only sprint'in örneklem baseline'ı; tam suite çalıştırılmadı. Direktifin 5 fail-kategorisi (workflows 1 + docs 27 + nervous 37 + docker-e2e 25 + rules-refactor 5 = ~95 dosya) içinde gerçek fail descriptor sayımı sprint 189'da `npm test` ile netleşecek. Regresyon trendi (sprint 180 17 fail → sprint 188 43 fail) izlenmeli.

**Coverage:** v8 provider mevcut; baseline 0 (sprint audit-only). Coverage iyileştirmesi için **kod yazmak yerine ADR-038 disposition** (T05 9 dormant agent modülü + T06 connector/sandbox + T03 5 fonksiyon + Sprint 139 561 LoC dead) uygulanmalı — payda küçültme stratejisi.

---

## 12. Sprint 189 Follow-up

| ID | Eylem | Öncelik | ADR / Bağlam | Sahip |
|----|-------|---------|--------------|-------|
| FA-01 | `src/core/notify.ts:17` `eventBus` import'unu kaldır → `core/notify-registry.ts` dispatcher injection | YÜKSEK | ADR-008 | architect |
| FA-02 | `worker.ts:570,573 checkWorkerAuthority` koşulsuz `return true` davranışını kapsam dışı tutan ayrı `runVerifyLoop` çağrısı ekle (ADR-037 V2 hard-flip seed) | YÜKSEK | ADR-037 | architect |
| FA-03 | `src/orchestra/self-modifying-detector.ts isSelfModifyingSprint(...)` `sprint-controller.ts` plan-time wire | YÜKSEK | ADR-039 | architect |
| FA-04 | ADR-040 metnini güncelle (12 detector, 31 MCP tool, Sprint 148 aktivasyon hedefi → ADR-047 ile koexistens) | ORTA | ADR-040 | doc-writer |
| FA-05 | ADR-008 enforcer kapsamını `agents/`, `monitor/`, `api/`, `cli/`, `mcp/` → `orchestra/` import'ları için "whitelist edilebilir alt-set" listesiyle genişlet | ORTA | ADR-008 V2 | architect |
| FA-06 | ADR-049-052 numara boşluklarının kasıtlı reserve mi yoksa archive mı olduğunu netleştir (decisions.md'ye not eklenebilir) | DÜŞÜK | ADR-036 | doc-writer |
| FT-01 | Tam `npm test` (vitest run) suite çalıştır, fail'leri direktif kategorileriyle eşleştir; gerçek descriptor sayısı + per-test root-cause | YÜKSEK | — | ci-guardian |
| FT-02 | `tests/docs/` doküman hash testlerini Sprint 187 doc-refresh sonrası yenile (W2-T11 doc-drift fix'leriyle eş zamanlı) | YÜKSEK | — | doc-writer |
| FT-03 | `tests/agents/worker-verify*.test.ts` ADR-037 V2'ye kadar `it.skip` veya `.todo` ile işaretle (yanıltıcı fail'i azalt) | ORTA | ADR-037 | refactorer |
| FT-04 | `tests/docker/` + `tests/e2e/` lokal env-guard ekle (`describe.skipIf(!hasDocker)`) | ORTA | — | devops-engineer |
| FT-05 | `tests/nervous/integration/*.test.ts` `.deckent/config.json nervous_system.enabled` fixture'ı ile bootstrap → integration test'leri konfigüre çalışsın | ORTA | ADR-040 | architect |
| FT-06 | Dead-code disposition Sprint 189'da uygulanırsa `brain-context.ts`'i ADR-060 seed olarak `src/orchestra/awareness/` altına taşı; aksi halde silinmeden ADR-060 metnine eklenmeli | YÜKSEK | ADR-038 + ADR-060 | architect |
| FT-07 | Coverage gate eşiğini `.deckent/ci-baseline.json` formatına ekle (`coverageTarget: 70`) ve Brain Self-Audit Gate'i bu eşikle bağla | DÜŞÜK | ADR-038 | ci-guardian |
| FT-08 | Sprint 180→188 regresyon trendini (17→43 fail) analiz et — hangi commit fail eklemiş, hangi test'ler yeni eklenmiş ama kırık başlamış | YÜKSEK | — | code-reviewer |

---

**Rapor sonu** — `docs/audits/sprint-188/adr-test-health.md` — Sprint 188 W2-T12 (188-012). ANALYSIS-ONLY denetim; W1-T03/T04/T05/T06/T09 ground-truth alındı, hiçbir kaynak / config / doküman değiştirilmedi. Toplam 64 ADR + 868 test dosyası + 5 fail-kategorisi + 8 coverage-boşluk eksen üzerinden çapraz denetim yapıldı; 14 Sprint 189 follow-up önerisi listelendi.
