# Audit — src/core/agent-pool.ts

**Sprint:** 186 (per-file pilot 50) · **Task:** 186-027 · **Audited:** 2026-05-21 · **Model:** opus · **Effort:** normal

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/core/agent-pool.ts` |
| LoC (raw) | 589 (DIRECTIVES'in deklare ettiği 589 LoC ile birebir) |
| Module type | 1 class (`AgentPoolManager`, 14 method) + 1 free function (`getAgentPrompt`) + 1 helper export (`isTempAgentStale`) + 2 sabit (`DEFAULT_MAX_TEMP_AGENTS`, `DEFAULT_MAX_AGENT_AGE`) |
| Side effects | Disk I/O — `fs.readdirSync`, `fs.readFileSync`, `fs.writeFileSync`, `fs.mkdirSync`, `fs.rmSync`, `fs.existsSync` (sync). `console.warn` (degraded fallback). |
| Imports (production) | `node:fs`, `node:path`, `./agent-types.js` (3 sembol), `./utils.js` (`readJsonSafe`), `./types.js` (`ALL_MODELS`) |
| Public exports (6) | `DEFAULT_MAX_TEMP_AGENTS`, `DEFAULT_MAX_AGENT_AGE`, `isTempAgentStale`, `AgentPoolManager`, `getAgentPrompt`, `AgentPromptResolution`, `AgentPromptSource` |
| Private helpers (2) | `sprintNumber`, `readFileIfExists` |
| Singletons / runtime state | Yok — `AgentPoolManager` per-call disk okuma, in-memory cache **yok** |

### Reverse Dependencies (callers — production)

| Dosya | Kullanılan API | Notlar |
|-------|----------------|--------|
| `src/orchestra/sprint-finalizer.ts` | `AgentPoolManager.updateAgentStats`, `saveAgent` | Sprint sonu evaluation hook'u; her task için stats güncellemesi |
| `src/orchestra/sprint-planner.ts` | `AgentPoolManager.saveTempAgentToPool` | Plan fazında üretilen temp agent'ların persiste edilmesi |
| `src/orchestra/sprint-phases.ts` | `AgentPoolManager` constructor | Sprint phases pipeline'ı için pool injection |
| `src/orchestra/result-collector.ts` | `getAgentPrompt` | Worker context injection — PROMPT.md kanonik kaynak (ADR-048) |
| `src/orchestra/managed-docs/template-renderer.ts` | `AgentPoolManager` | Managed-docs scope için agent listesi |
| `src/orchestra/managed-docs/content-generators.ts` | `AgentPoolManager` | `agent-performance` built-in generator |
| `src/cli/commands/agent.ts` | `AgentPoolManager` | `deckent agent list/add/remove` CLI yolu |

### Reverse Dependencies (callers — tests)

| Dosya | Test sayısı | Notlar |
|-------|------------|--------|
| `tests/core/agent-pool.test.ts` | **86 it/test blok**, 1185 LoC | Ana kapsam — validateAgentDefinition, LRU eviction, temp agent lifecycle, stats |
| `tests/orchestra/agent-stats-update.test.ts` | `updateAgentStats` davranışı | Success rate + coverage incremental update |
| `tests/orchestra/agent-activation.test.ts` | `manifestVersion`/activation alanları | V2 activation alan integrasyonu |
| `tests/orchestra/agent-prompt-single-source.test.ts` | `getAgentPrompt` ADR-048 kontratı | PROMPT.md > systemPrompt fallback testi |
| `tests/core/ci-guardian.test.ts` | Pool injection | CI-guardian agent enumeration |
| `tests/core/skill-pool.test.ts` | `listEnabled` benzer kontrat | (Cross-reference, doğrudan caller değil) |

---

## 2. Bağlam

`agent-pool.ts` deckent'in **agent registry'sinin disk-backed CRUD katmanı**. İki ayrı dizini yönetir:

```
.deckent/agents/<id>/agent.json           — persistent agents (builtin + user + learned)
.deckent/agents/<id>/PROMPT.md            — canonical agent prompt (ADR-048)
.tasks/agents/<sprintId>-<id>/agent.json  — sprint-scoped temp agents (LRU eviction)
```

Sorumluluk üç katmana bölünür:

1. **Pool CRUD** (satır 57-205) — `loadAgents()`, `saveAgent()`, `removeAgent()`, `getAgent()`, `listAgents()`, `listEnabled()`, `getActiveAgentIds()`. Her okuma diskten yapılır (no cache).
2. **Temp agent lifecycle + LRU eviction** (satır 207-354) — sprint-scoped temp agent yaratma/temizleme, `cleanup()` ile `lastUsedInSprint` üzerinden LRU. `DEFAULT_MAX_TEMP_AGENTS = 50`, `DEFAULT_MAX_AGENT_AGE = 5` sprint.
3. **Stats güncellemesi + validation** (satır 356-490) — `updateAgentStats()` incremental rate/coverage hesabı; static `validateAgentDefinition()` — şema-bağımsız manuel doğrulama.

Modül sonunda **bağımsız** bir bölüm:

4. **`getAgentPrompt()` — Prompt Lifecycle Contract (ADR-048, satır 493-588)** — agent için kanonik prompt çözümleyici. Lookup sırası: persistent `PROMPT.md` → temp `PROMPT.md` → `agent.json::systemPrompt` (degraded fallback, console.warn ile). **Concatenation yok** — tek kaynak ilkesi.

### Mimari rolü

`agent-pool.ts`, Sprint planner/finalizer pipeline'ında **read-write disk gateway**'idir. `AgentPoolManager` stateless tasarımı sayesinde her yöntem çağrısında diskten taze veri okur — process-level cache yok, bu yüzden `updateAgentStats()` çağrısı tipik olarak 2 readdirSync + N readJsonSafe + 1 writeFileSync maliyetinde.

### İlgili ADR'ler

| ADR | Bağlantı |
|-----|----------|
| ADR-001 | TypeScript + ESM — `.js` uzantıları importlarda kullanılıyor |
| ADR-005 | Synchronous I/O (deprecated) — bu modül **hâlâ tamamen sync** (fs.readdirSync, fs.writeFileSync, vb.) |
| ADR-008 | Brain merkezi import — tek yönlü — `agent-pool.ts` yalnızca `core/`'a bağımlı |
| ADR-038 | Dead Code Disposition — Sprint 139 audit — `saveAgent`/`removeAgent` canlılığı doğrulanmıştır (aşağıda bölüm 4) |
| ADR-041 | Agent Taxonomy — Horizontal Skills vs Vertical Agents — bu modül **vertical agent havuzunun tek sahibi**; 15 built-in agent burada CRUD edilir |
| ADR-046 | Brain Self-Update Hook — `updateAgentStats` sprint-finalizer içinden çağrılır |
| ADR-047 | Manuel Subagent Dispatch — temp agent yaratımı planner sırasında manuel akıştır |
| ADR-048 | Prompt Lifecycle Contract — `getAgentPrompt()` **kod yorumunda doğrudan referans** (satır 533): "ADR-048 (Prompt Lifecycle Contract) — Sprint 182" |

---

## 3. Debt Risk

| Risk | Şiddet | Açıklama |
|------|--------|----------|
| **Tam sync I/O** (`readdirSync`, `writeFileSync`, `rmSync`, vb.) | Orta-Yüksek | ADR-005 sync I/O deprecated; pool 50+ temp agent'ta `loadAgents()` event loop'u bloke ediyor. Async API yok. `getAgent()` her çağrıda full pool read — `updateAgentStats` içinden çağrıldığı için tek stats güncellemesi tüm pool'u disk'ten okuyor. |
| **In-memory cache yok** | Orta | `loadAgents()` her çağrıda diskten okur. `listAgents()`, `listEnabled()`, `getAgent()`, `getActiveAgentIds()` hepsi bağımsız çağrıda full disk scan tetikler. Sprint-finalizer döngüsünde her task için en az 2 tam read (`getAgent` + `saveAgent` → bir sonraki `updateAgentStats` için tekrar tam read). |
| **Race condition (saveAgent vs concurrent loadAgents)** | Yüksek (worker paralel çalışırken) | `saveAgent` atomic değil — `writeFileSync` partial write riski (özellikle docker backend graceful shutdown sırasında); `.locks/` mekanizması burada kullanılmıyor. ADR-027 hybrid spawn backend'de paralel worker'lar pool'a aynı anda yazabilir. |
| **`updateAgentStats` read-modify-write race** | Yüksek | İki worker aynı agent için aynı anda `updateAgentStats` çağırırsa: A `getAgent` → B `getAgent` → A `saveAgent` → B `saveAgent` (A'nın yazımı kaybolur). Lost update tipik. Sprint-finalizer bu çağrıyı seri yapıyorsa risk düşer ama kontrat enforcement yok. |
| **`raw as unknown as AgentDefinition` cast (satır 132, 339)** | Orta | `validateAgentDefinition` yalnızca alan tiplerini kontrol eder, **eksik alanlar için default uygulamaz**. `AgentDefinition` interface'i tüm alanları zorunlu kıldığı halde `description`, `systemPrompt`, `expertise[]` vb. validation'da `undefined` geçebiliyor — sonuç: type system'in vaat ettiği invariantlar runtime'da garantili değil. |
| **Magic numbers exported but not config-driven** | Düşük | `DEFAULT_MAX_TEMP_AGENTS = 50`, `DEFAULT_MAX_AGENT_AGE = 5` constructor parametresi olarak verilebiliyor ama `.deckent/config.json` üzerinden geçirildiğine dair tek-yön bağlantı (call site grep) yok. |
| **`console.warn` eslint-disable (satır 573)** | Düşük | Degraded fallback uyarısı doğrudan stderr'e yazılır — yapılandırılabilir logger yok; testlerde yan etki + CLI çıktısında gürültü riski. |
| **`ALL_MODELS` import mid-file (satır 53)** | Çok düşük (style) | Tüm diğer importlar tepede; bu import class'tan hemen önce ve mid-file. Hoist edilmeli. |
| **`source === 'builtin'` builtin koruması yalnızca `cleanup()` LRU yolunda** | Düşük | `loadAgents()` LRU eviction'ı (satır 90-104) `source` ayrımı yapmıyor; `tempPool` yalnızca `.tasks/agents/` okunduğu için builtin'in oraya düşmesi normalde gerçekleşmez ama yorum/test belgelenmemiş. |
| **`cleanupPersistentTempAgents` agresif silme** | Orta | `.deckent/agents/temp-*` prefix'i ile başlayan tüm dizinleri sorgulamadan siler — user'in kendi `temp-<name>` agent'ı ile çakışma riski. İsim alanı koruması yok. |

---

## 4. Dead Code Candidates

| Sembol | Durum | Kanıt |
|--------|-------|-------|
| `saveAgent` | **Canlı** | `src/orchestra/sprint-finalizer.ts:867` (`poolManager.saveAgent(agent)`) + `tests/core/agent-pool.test.ts` 2 test. |
| `removeAgent` | **Düşük kullanım** | Production caller **yok** (grep: 0 hit `src/**/*.ts` dışı tests); `tests/core/agent-pool.test.ts:158,163` 2 test. ADR-038 disposition: testlerde kapsamlı → API surface contract, kullanıcı CLI/MCP `deckent agent remove` için gerekli olabilir. Aday "korumalı" — silinmemeli. |
| `listEnabled` | **Canlı** | Tests + CLI `agent list --enabled` paralel kullanım (cross-reference `skill-pool.test.ts:203`). |
| `getActiveAgentIds` | **Düşük kullanım** | Production grep: 0 hit (yorumda "used by routing fallback chain to verify agent availability" — wire eksik mi?). **İnceleme önerilir** — yorum vaat ediyor, gerçek caller yok. |
| `saveTempAgentToPool` | **Canlı** | `src/orchestra/sprint-planner.ts:392` + 2 test. |
| `cleanupPersistentTempAgents` | **Canlı** | 3 test (`tests/core/agent-pool.test.ts:296, 308, 325`), production caller grep'i sıfır → **test-only? CLI cleanup hook'undan çağrılıyor olabilir** (commands/agent.ts incelenmeli). |
| `createTempAgent` | **Test-only?** | Grep production: 0 hit, sadece `tests/core/agent-pool.test.ts:243`. `saveTempAgentToPool` yeğleniyor olabilir — bir overlap. |
| `cleanupTempAgents(sprintId)` | **Test-only?** | Production grep: 0 hit, 3 test. Sprint-cleanup yolu artık `cleanup(maxAge)` LRU kullanıyor olabilir. |
| `isTempAgentStale` (named export) | **Canlı** | `cleanup()` içinden + 1 test. Re-export grep `src/core/index.ts`'de mevcut değil — yalnızca bu dosyadan kullanılıyor; export edilmesi testability için. |

**Grep komutları (kanıt):**
- `grep -rn "from ['\"].*agent-pool" --include='*.ts'` → 7 production caller + 5 test caller.
- `grep -rn "\.createTempAgent\b\|\.cleanupTempAgents\b\|\.getActiveAgentIds\b" src/` → 0 production hit (yalnızca self-reference + test).

**ADR-038 disposition önerisi:** `createTempAgent` ile `saveTempAgentToPool` arasında semantik örtüşme var — biri `.tasks/agents/`, diğeri `.deckent/agents/temp-*` yazıyor. Hangisinin kanonik olduğu doc'lanmamış. Sprint 188 için unification adayı.

---

## 5. Documentation Gaps

| Eksik | Etki |
|-------|------|
| **Module-level JSDoc yok** | "Agent Pool Manager" başlığı (satır 1) tek satır; agent havuzunun **iki dizin** kullandığı (`.deckent/agents/` ve `.tasks/agents/`) ve LRU semantiği dosya seviyesinde belgelenmemiş. |
| **`saveAgent` atomic değil uyarısı yok** | Worker paralelliği altında yazımın güvensiz olduğu API kullanıcısına bildirilmemiş — JSDoc'da "not concurrency-safe" notu eklenmeli. |
| **`updateAgentStats` lost-update riski** | Concurrent invocation davranışı belgelenmemiş; sprint-finalizer kontratı (seri çağrı?) doc'lanmalı. |
| **`getActiveAgentIds` "routing fallback chain" iddiası** | Yorum satır 194-195 vaat ediyor ama production caller yok → ya wire eksik ya yorum stale. ADR-046 self-update hook bağlantısı netleşmeli. |
| **`AgentDefinition` invariantları ile validation arasındaki boşluk** | `validateAgentDefinition` sadece `id`/`name` zorunlu kılıyor — interface tüm alanları zorunlu tutuyor. "Validation is permissive — caller must provide defaults via `createAgentDefinition`" notu eklenmeli. |
| **PROMPT.md fallback davranışı** | `getAgentPrompt` JSDoc'ı ADR-048'e atıf yapıyor ✅ ama `degraded === true` durumunun caller için ne anlama geldiği (e.g. UI'da warning göster?) belgelenmemiş. |
| **`@example` blokları yok** | Public API'de hiçbir export'ta runnable example yok. Özellikle `AgentPoolManager` constructor + `loadAgents` + `getAgent` için en az bir örnek beklenir. |
| **`cleanupPersistentTempAgents` namespace çakışma riski** | "Removes all directories with `temp-` prefix" davranışı user'in kendi `temp-` prefixli agent yaratamayacağını ima eder — bu kısıt doc'lanmamış. |

---

## 6. ADR Compliance Check

| ADR | Beklenti | Bu modülde | Durum |
|-----|----------|------------|-------|
| **ADR-001** TypeScript + ESM | `.js` uzantısı zorunlu | Tüm importlar `.js` ile (`./agent-types.js`, `./utils.js`, `./types.js`) | ✅ |
| **ADR-002** Node16 Module Resolution | Relative path + `.js` | Uyumlu | ✅ |
| **ADR-005** Synchronous I/O (deprecated) | Async tercih edilmeli | Tamamen sync (readdirSync, writeFileSync, rmSync) | ⚠️ **Drift** — ADR deprecated, ancak `agent-pool.ts` aktif olarak sync. Sprint 188 follow-up. |
| **ADR-008** Brain Merkezi Import | core/ → sadece core/ | İmportlar: `./agent-types.js`, `./utils.js`, `./types.js`, `node:*` — hiçbiri brain/orchestra/agents/auditor yönüne değil | ✅ |
| **ADR-010** Tek Runtime Dependency | Yalnızca commander.js + Node stdlib | Hiçbir 3rd-party import yok | ✅ |
| **ADR-027** Hybrid Spawn Backend | Docker/tmux/subprocess paralel worker'ları desteklemeli | Pool concurrency-safe değil — `saveAgent`/`updateAgentStats` race riski (bkz. bölüm 3) | ⚠️ **Drift** — backend paralelliği pool koruma sağlamıyor |
| **ADR-038** Dead Code Disposition | Audit sonucuna göre canlı/dispose et | `removeAgent`, `getActiveAgentIds`, `createTempAgent`, `cleanupTempAgents(sprintId)` üretim caller'ı yok ama test kapsamı var → "korumalı, dispose etme" (bkz. bölüm 4) | ✅ (compliance doğrudan) — Sprint 188 cleanup adayları belirtildi |
| **ADR-041** Agent Taxonomy — Horizontal Skills vs Vertical Agents | Vertical agent havuzu tek SoT'de tutulmalı | `AgentPoolManager` **bu havuzun tek sahibi**; 15 built-in vertical agent burada CRUD edilir. Horizontal skill'ler için ayrı `skill-pool.ts` mevcut → taxonomy düzgün ayrışmış. | ✅ |
| **ADR-046** Brain Self-Update Hook | Sprint sonu agent stats güncellemesi | `updateAgentStats` sprint-finalizer:774'den çağrılır → hook çalışıyor | ✅ |
| **ADR-047** Manuel Subagent Dispatch | Temp agent yaratımı planner manual akışı | `saveTempAgentToPool` planner:392 — manuel dispatch yolu açık | ✅ |
| **ADR-048** Prompt Lifecycle Contract | PROMPT.md kanonik > systemPrompt degraded; concatenation yok; warning emit | Satır 533 doğrudan atıf; lookup sırası birebir ADR-048 ile uyumlu; warning emit ediliyor (satır 574-576) | ✅ |
| **ADR-039** Self-Modifying Task Detection | Deckent codebase'ine özel path'ler diğer projelere sızmamalı | `.deckent/agents` ve `.tasks/agents` path'leri user-project yönelimli — deckent-only path yok | ✅ |

---

## 7. Refactor Recommendations

| # | Öneri | Kazanım | Risk |
|---|-------|---------|------|
| R1 | **In-memory pool cache** (process-level Map<string, AgentDefinition>) ekle; `fs.watch` veya `mtime` ile invalidate et | Sprint-finalizer döngüsünde N× disk read elenir; race window daralır | Orta — invalidate stratejisi (TTL/event) gerekir |
| R2 | **`saveAgent` atomic write** — `fs.writeFileSync` yerine tmp + `fs.renameSync` deseni (sprint-185 W1-1 mock hygiene fix paralel) | Partial write riski sıfır; concurrent reader corrupt JSON görmez | Çok düşük — single-line change |
| R3 | **`updateAgentStats` file-lock** — `.locks/agent-{id}.lock` ile read-modify-write koruması | Lost update eliminasyonu; paralel worker safety | Orta — file-lock infrastructure entegrasyonu (`src/orchestra/file-lock.ts` mevcut) |
| R4 | **Sync I/O → async API surface** (ADR-005 drift fix); `loadAgentsAsync`, `saveAgentAsync` eklenmeli; mevcut sync API'lar `@deprecated` işaretlenir | Event loop blocking riski elenir; modern Node best practice | Yüksek — tüm caller'lar (7 prod + 5 test) güncellenmeli |
| R5 | **`validateAgentDefinition` strict mode** — `AgentDefinition` interface'inin tüm zorunlu alanlarını kontrol et; `createAgentDefinition` defaults'unu burada da uygula | Type system invariantları runtime'da doğrulanır; cast (`raw as unknown as AgentDefinition`) güvenli | Orta — mevcut user agent.json dosyaları başarısız olabilir → migration adımı gerekir |
| R6 | **`createTempAgent` ile `saveTempAgentToPool` unification** — semantik örtüşmeyi tek API'ya indir; deprecated wrapper bırak | API surface basitleşir; user mental model netleşir | Düşük — geriye uyumlu wrapper |
| R7 | **`getActiveAgentIds` wire kontrolü** — "routing fallback chain" vaadi gerçekten yapılıyor mu? Production caller yok → ya wire et ya yorum-only sil (ADR-038 disposition) | Stale yorum/dead API temizliği | Çok düşük |
| R8 | **`cleanupPersistentTempAgents` namespace prefix güvenliği** — `temp-` prefix yerine `metadata.source === 'temp-promoted'` gibi attribute-tabanlı silme | User'in kendi `temp-X` agent'ı kazara silinmez | Düşük |
| R9 | **`console.warn` → structured logger** — `src/core/debug-log.ts` veya event-stream üzerinden emit | Test gürültüsü azalır; degraded fallback observability'si artar | Çok düşük |
| R10 | **Module-level JSDoc + `@example`** — iki dizin (persistent/temp), LRU semantiği, concurrency uyarıları | Onboarding süresi düşer | Sıfır |
| R11 | **`ALL_MODELS` import'unu top of file'a taşı** | Style consistency | Çok düşük (linting) |
| R12 | **`AgentPoolManager` stats updater dependency injection** — `getAgent` + `saveAgent` çağrısı doğrudan disk'e bağlı; updater fonksiyon olarak parametre alabilir, test edilebilirlik artar | Test ergonomics; mock kolaylığı | Düşük |

---

## 8. Sprint 188 Follow-up Items

| Öncelik | Item | Tahmini effort | İlgili refactor |
|---------|------|---------------|-----------------|
| P0 | **R3 — `updateAgentStats` file-lock** — sprint-finalizer paralel worker stats güncellemesi data race koruması (ADR-027 hybrid backend) | normal | Concurrency safety |
| P0 | **R2 — Atomic write (`tmp + rename`)** for `saveAgent` ve `saveTempAgentToPool` (sprint-185 W1-1 paralel) | low | Crash safety |
| P1 | **R1 — In-memory pool cache** + `mtime` invalidate; sprint-finalizer round başına 1 tam read | normal | Performans |
| P1 | **R7 — `getActiveAgentIds` wire kontrolü** + dead-yorum temizliği veya routing-fallback gerçek wire'ı | low | ADR-038 disposition |
| P2 | **R4 — Async API surface** (ADR-005 drift fix) — `loadAgentsAsync`, `saveAgentAsync` introduction; mevcut sync'ler `@deprecated` | high | Event loop hygiene |
| P2 | **R5 — `validateAgentDefinition` strict mode** + JSON Schema (`zod` ile değil — ADR-010 minimal-dep, manuel schema) | normal | Type safety |
| P2 | **R6 — `createTempAgent` / `saveTempAgentToPool` unification** — kanonik tek API | normal | API surface temizliği |
| P3 | **R8 — `cleanupPersistentTempAgents` namespace güvenliği** | low | UX safety |
| P3 | **R9 — `console.warn` → structured logger** | low | Observability |
| P3 | **R10 — Module-level JSDoc + `@example`** (her public export için) | low | DX |
| P3 | **R12 — Stats updater DI** | low | Testability |
| P3 | **R11 — `ALL_MODELS` import top'a taşı** | trivial | Style |

---

## 9. Summary

`src/core/agent-pool.ts`, deckent'in **vertical agent havuzu için tek source-of-truth gateway'i**. 589 LoC, 1 sınıf (14 metod) + 1 free function (`getAgentPrompt`, ADR-048 contract), ESM/Node16 (ADR-001/002) ve minimal-dependency (ADR-010) kurallarına tam uyumlu. Test kapsamı çok güçlü — yalnızca `tests/core/agent-pool.test.ts` 86 test, ek olarak 4 ilgili test dosyası. ADR-041 taxonomy ayrımı (vertical agent vs horizontal skill) net şekilde havuz seviyesinde uygulanmış; skill için ayrı `skill-pool.ts` mevcut.

**Genel sağlık:** Sarı. Modül mantıksal olarak temiz, ancak **iki kritik kalite gap'i** var:

**Kritik bulgu #1 (concurrency):** `saveAgent` atomic değil, `updateAgentStats` read-modify-write file-lock kullanmıyor. ADR-027 hybrid spawn backend altında paralel worker'lar aynı agent stats'ını güncellediğinde **lost update** kesin. Sprint-finalizer çağrı dizilimi sırayla güvenli olabilir ancak kontrat enforcement yok. **R2 + R3 (Sprint 188 P0)** olarak takip edilmeli.

**Kritik bulgu #2 (ADR-005 drift):** Tüm I/O sync — `readdirSync`, `writeFileSync`, `rmSync`. ADR-005 sync I/O'yu deprecated etmiş durumda; pool 50+ temp agent'ta event loop'u bloke ediyor. Sprint 188 P2 olarak async API surface introduction (R4).

**Yüzeysel iyileştirmeler:** `createTempAgent` ile `saveTempAgentToPool` arasında semantik örtüşme (R6), `getActiveAgentIds` vaadi wire'lanmamış (R7), `validateAgentDefinition` permissive — `AgentDefinition` interface invariantlarını runtime'da doğrulamıyor (R5).

**Dead code:** Üretim caller'ı olmayan **dört** metot — `removeAgent`, `getActiveAgentIds`, `createTempAgent`, `cleanupTempAgents(sprintId)` — hepsinin test kapsamı var. ADR-038 disposition: testlerde kapsanmış API surface contract olarak korumalı; ancak `getActiveAgentIds` yorumunda "routing fallback chain'de kullanılır" iddiası gerçekleşmiyor → ya wire et ya yorum sil.

**ADR uyum:** ADR-008/010/041/046/047/048 ✅ tam uyum. ADR-005 ve ADR-027 ile **drift mevcut** (sync I/O + concurrency koruması yok).

---

*Generated by w-186-027 · doc-only audit · no source modifications*
