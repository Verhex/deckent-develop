# DIRECTIVES — Sprint 278: COMM-1 Worker-to-Worker İletişim — Dormant Primitive'leri Canlandır

## Goal: Worker'lar aynı projeyi (canvas) boyuyor ama BİRBİRİYLE KONUŞAMIYOR (Alperen: enterprise orkestrasyon için kritik). Altyapı VAR ama worker'a bağlı DEĞİL: `SharedMemory` (write/read/listKeys/cleanup — 0 gerçek caller), `HandoffProtocol` (sprint-controller'da handoff OLUŞUYOR ama downstream worker prompt'unda GÖRMÜYOR), `multi-agent.ts runPipeline` (0-caller tam-dormant). Bu sprint köprüleri kurar: worker→shared yazım (.result), shared→worker okuma (prompt enjeksiyon), handoff→downstream-worker prompt enjeksiyon, structured handoff-notes (upstream→downstream mesaj), görünürlük (CLI/dashboard), multi-agent disposition (ADR-038). Hepsi **opt-in (worker_comms.enabled default-off) + additive + cache-prefix korunmuş** (F1-TOK dersi: shared blok prompt SONUNA, başa değil). MİKRO-TASK + DEPENDENCY + MODEL-KATMANLAMA (opus 3 · sonnet 6 · haiku 3).

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable fs; gerçek ağ YASAK; spawnSync YASAK.
- **CACHE-PREFIX KORUNUMU (F1-TOK dersi):** worker prompt'una eklenen shared/handoff blokları task-başı DEĞİŞKEN içerik taşır → prompt'un EN SONUNA (en-task-özel bölge) konur, paylaşılan prefix'i (Skills→Agent→ADR) BÖLMEZ. prompt-determinizm guard'ı (Sprint 273) yeşil kalır.
- **Opt-in + fail-safe:** worker_comms kapalıyken bayt-bayt mevcut davranış; comms hatası worker'ı/sprint'i ASLA düşürmez (best-effort).
- **i18n:** worker-prompt İçeriği İngilizce (worker standardı); CLI/dashboard user-facing → getMessage (en+tr).
- **SSOT:** SharedMemory/HandoffProtocol mevcut sınıflar — YENİDEN YAZMA, BAĞLA. prompt = prompt-god-template; result = result-collector/sprint-phases.
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş.

---

## Task 1: worker_comms config + .result sharedNotes/messages şeması
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/config-types.ts, src/core/config.ts, src/core/types.ts, tests/core/config-worker-comms.test.ts
- Scope: src/core/, tests/core/

### Description
(1) Config: `worker_comms?: { enabled: boolean; shared_memory_ttl_ms?: number (default 3600000); inject_handoffs?: boolean (default true when enabled); inject_shared?: boolean (default true when enabled) }` — default blok-yok=kapalı (resource_monitor deseni). (2) `src/core/types.ts` TaskResult'a OPSİYONEL `sharedNotes?: Array<{ key: string; value: string }>` (worker'ın paylaşacağı yapısal notlar) + `handoffNotes?: string` (downstream'e serbest mesaj). Şema additive (mevcut .result'lar geçerli kalır — api-surface Task 10). Validation: worker_comms alanları + sharedNotes shape. Testler: config geçerli/geçersiz/default; sharedNotes/handoffNotes tip kontrolü.

**Kanıt:** `npx vitest run tests/core/config-worker-comms.test.ts` yeşil; `grep -n "worker_comms" src/core/config-types.ts` ≥ 1; `grep -n "sharedNotes\|handoffNotes" src/core/types.ts` ≥ 1. **Test:** 6+.

---

## Task 2: worker→shared yazım köprüsü — .result sharedNotes → SharedMemory
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/result-collector.ts, tests/orchestra/shared-write-bridge.test.ts
- Dependencies: 278-001
- Scope: src/orchestra/, tests/orchestra/
- ModelEffort: low

### Description
Worker `.result`'ındaki `sharedNotes` (Task 1) → `SharedMemory.write()` (SSOT sınıf, `getSharedMemory(projectRoot, ttl)`). result-collector'ın result-işleme yolunda (collectResults/processResult — grep'le bul): YALNIZ `config.worker_comms?.enabled` iken, bir worker DONE/GO_WITH_TECH_DEBT result'ında sharedNotes varsa her birini SharedMemory'ye yaz (writerId = taskId; key = note.key). Best-effort try/catch (yazım hatası result-işlemeyi düşürmez). Kapalıyken hiç çağrı. Testler (tmpdir + mock SharedMemory ya da gerçek tmpdir SharedMemory): sharedNotes→write; kapalı→yok; bozuk-note atla; çoklu-note.

**Kanıt:** `npx vitest run tests/orchestra/shared-write-bridge.test.ts` yeşil; `grep -n "SharedMemory\|getSharedMemory\|sharedNotes" src/orchestra/result-collector.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 3: shared→worker okuma — spawn-time SharedMemory prompt enjeksiyonu (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/prompt-god-template.ts, src/orchestra/task-builder.ts, tests/orchestra/shared-prompt-inject.test.ts
- Dependencies: 278-001
- Scope: src/orchestra/, tests/orchestra/

### Description
Worker prompt'una "Shared Context" bloğu — diğer worker'ların paylaştığı notlar. task-builder `buildWorkerPrompt` SharedMemory'den mevcut entry'leri (expired olmayan, `listKeys`+`read`) okur → ctx'e ekler → prompt-god-template YENİ `buildSharedContextBlock(entries)` ile render eder. **KRİTİK (F1-TOK/cache-prefix):** bu blok prompt'un EN SONUNA (task/scope/deps'ten SONRA, en-task-özel bölge) konur — paylaşılan prefix'i (Skills→Agent→ADR) BÖLMEZ. YALNIZ `config.worker_comms?.enabled && inject_shared` iken; kapalı/boş → blok hiç emit edilmez (bayt-bayt mevcut prompt). Blok formatı: "=== Shared Context (other workers) ===\n- <key> (by <writerId>): <value>". Determinizm: entry'ler key'e göre sıralı (stable). Testler: enabled+entries → blok prompt SONUNDA; kapalı → blok yok; boş-shared → blok yok; sıralama deterministik; prompt-determinizm guard yeşil.

**Kanıt:** `npx vitest run tests/orchestra/shared-prompt-inject.test.ts tests/orchestra/prompt-determinism.test.ts` yeşil; `grep -n "buildSharedContextBlock\|Shared Context" src/orchestra/prompt-god-template.ts | head -2` ≥ 1. **Test:** 8+.

---

## Task 4: handoff→downstream worker prompt enjeksiyonu (OPUS)
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: architect
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/prompt-god-template.ts, src/orchestra/task-builder.ts, tests/orchestra/handoff-prompt-inject.test.ts
- Dependencies: 278-003
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint-controller handoff OLUŞTURUYOR (`createHandoff`/`executeHandoff`, dependency-tamamlanınca artifact taşıyor) ama downstream worker bunu prompt'unda GÖRMÜYOR. Köprü: task-builder, task'ın dependencies'i için `HandoffProtocol.listHandoffs()`'tan bu task'a (toTaskId) gelen execute-edilmiş handoff'ları okur → prompt-god-template `buildHandoffBlock(handoffs)` ile render (upstream artifact yolları + Task 5'in handoffNotes mesajı). Task 3'le AYNI dosyaları değiştirdiği için Dependencies (onun shared-blok düzeninin üstüne, handoff-blok onun yanına — ikisi de prompt SONU bölgesinde). YALNIZ `worker_comms.enabled && inject_handoffs`. "=== Upstream Handoffs ===\n- from <fromTaskId>: artifacts [...], note: <handoffNotes>". Cache-prefix korunur (son bölge). Testler: dependency-handoff → blok; handoff-yok → blok yok; kapalı → yok; çoklu-upstream.

**Kanıt:** `npx vitest run tests/orchestra/handoff-prompt-inject.test.ts` yeşil; `grep -n "buildHandoffBlock\|Upstream Handoff" src/orchestra/prompt-god-template.ts | head -2` ≥ 1. **Test:** 6+.

---

## Task 5: structured handoff-notes — upstream worker'dan downstream'e mesaj
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/handoff-protocol.ts, src/orchestra/sprint-controller.ts, tests/orchestra/handoff-notes.test.ts
- Dependencies: 278-001
- Scope: src/orchestra/, tests/orchestra/

### Description
HandoffProtocol'e serbest-metin not taşıma: `createHandoff(from, to, artifacts, notes?)` opsiyonel `notes` parametresi (Handoff interface'e `notes?: string`); sprint-controller handoff oluştururken upstream task'ın `.result.handoffNotes`'unu (Task 1) okuyup geçirir. Böylece upstream worker "downstream'e şunu ilettim" diyebilir → Task 4 prompt'a basar. Geri-uyum: notes opsiyonel, mevcut handoff'lar etkilenmez. Testler: createHandoff notes'lu/suz; sprint-controller handoffNotes→handoff.notes aktarımı; notes-yok geri-uyum.

**Kanıt:** `npx vitest run tests/orchestra/handoff-notes.test.ts` yeşil; `grep -n "notes" src/orchestra/handoff-protocol.ts | head -2` ≥ 1. **Test:** 5+.

---

## Task 6: worker prompt talimatı — sharedNotes/handoffNotes nasıl yazılır
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer, typescript-expert
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/comms-instruction.test.ts
- Dependencies: 278-003
- Scope: src/orchestra/, tests/orchestra/
- ModelEffort: low

### Description
Worker'ın paylaşım YAPMASI için prompt talimatı (Task 3 ile aynı dosya → Dependencies): worker_comms.enabled iken prompt'a kısa talimat bloğu — "Diğer worker'lar için paylaşmak istediğin yapısal bilgiyi `.result`'ta `sharedNotes: [{key, value}]` ile, bağımlı task'lara mesajını `handoffNotes` ile ver (ikisi de opsiyonel)." İçerik-korunumlu, EN SON bölgede, kapalıyken yok. Bu talimat olmadan worker alanları doldurmaz (Task 1-5 yolu boş kalır). Testler: enabled→talimat var; kapalı→yok.

**Kanıt:** `npx vitest run tests/orchestra/comms-instruction.test.ts` yeşil; `grep -n "sharedNotes\|handoffNotes" src/orchestra/prompt-god-template.ts | head -2` ≥ 1. **Test:** 4+.

---

## Task 7: multi-agent.ts disposition — runPipeline 0-caller (ADR-038)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: refactorer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/multi-agent.ts, tests/orchestra/multi-agent.test.ts, .brain/exports/decisions.md
- Scope: src/orchestra/, tests/orchestra/, .brain/

### Description
`multi-agent.ts` (`runPipeline`/`definePipeline`, 0 prod caller — nervous `runPipeline` AYRI fonksiyon, karıştırma) ADR-038 dead-code-disposition kararı: ÖNCE gerçekten 0-caller doğrula (grep + nervous-runPipeline'ın farklı imza olduğunu kanıtla, .result'a yaz). Karar — bu sprint COMM-1 sequential-pipeline'a İHTİYAÇ duyuyor mu? (worker'lar paralel + shared/handoff ile koordine — sequential pipeline farklı bir model). SEÇ: (a) COMM-1 ile wire (sequential-flow gerekiyorsa) VEYA (b) dead-code → arşivle/sil + ADR-038 kaydı (memory.db'ye `store.insert` değil — decisions.md export'una not; gerçek ADR insert sonraki memory-cycle). Hangisini seçtiğini gerekçesiyle .result'a. multi-agent test'i ya wire'ı doğrular ya silme-sonrası referans-yok teyidi. Karar net DEĞİLSE (b)-arşivle (güvenli, geri-alınabilir).

**Kanıt:** `npx vitest run tests/orchestra/multi-agent.test.ts` yeşil (ya da silindiyse referans-yok); .result'ta disposition gerekçesi. **Test:** mevcut/güncellenen.

---

## Task 8: worker-comms görünürlük — CLI durum + shared/handoff listesi
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/status.ts, src/cli/helpers/messages.ts, tests/cli/status-comms.test.ts
- Dependencies: 278-002, 278-005
- Scope: src/cli/, tests/cli/

### Description
`deckent status` çıktısına (worker_comms.enabled iken) "Worker Comms" bölümü: aktif SharedMemory key sayısı + son N entry (key/writer) + bekleyen/execute-edilmiş handoff sayısı. Kaynak: `getSharedMemory(root).listKeys()` + `HandoffProtocol(root).listHandoffs()`. Kapalıyken bölüm gizli (regresyon yok). i18n getMessage (en+tr). status.ts'in mevcut render desenini izle (DOKUNMA mevcut satırlar — ekle). Testler: enabled+entries → bölüm render; kapalı → yok; boş → "no shared context"; i18n.

**Kanıt:** `npx vitest run tests/cli/status-comms.test.ts` yeşil; `grep -niE "shared|handoff|comms" src/cli/commands/status.ts | head -2` ≥ 1. **Test:** 5+.

---

## Task 9: e2e comms akışı — iki-worker shared+handoff round-trip smoke
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/e2e/worker-comms-flow.test.ts
- Dependencies: 278-002, 278-003, 278-004, 278-005
- Scope: tests/e2e/

### Description
YENİ hermetik e2e (gerçek tmpdir, mock spawn — gerçek worker YOK): worker_comms.enabled config + 2 task (B, A'ya bağımlı). Simüle: A worker .result'a sharedNotes + handoffNotes yazar → result-collector SharedMemory'ye yazar (T2) + sprint-controller handoff oluşturur (T5) → B'nin prompt'u kurulurken (T3+T4) shared-context + upstream-handoff blokları B'nin prompt'unda görünür. Uçtan uca köprü kanıtı (A'nın paylaştığı → B'nin gördüğü). Kapalı-config kontrol koşusu: bloklar yok. Files'taki tek dosya.

**Kanıt:** `npx vitest run tests/e2e/worker-comms-flow.test.ts` yeşil. **Test:** 4+.

---

## Task 10: api-surface + config-reference — worker_comms + sharedNotes
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/api-surface.md, docs/reference/config-reference.md
- Dependencies: 278-001
- Scope: docs/reference/
- ModelEffort: low

### Description
DİSKTEKİ koddan: api-surface.md `.result` şemasına `sharedNotes`/`handoffNotes` alanları (crossVerify komşusu, additive); config-reference'a `worker_comms` bloğu (alanlar/default-off birebir). Uydurma YOK.

**Kanıt:** `grep -ciE "sharedNotes|worker_comms|handoffNotes" docs/reference/api-surface.md docs/reference/config-reference.md | awk -F: '{s+=$1} END{print s}'` ≥ 3. **Test:** yok — .result YAZ.

---

## Task 11: features + MASTER-PLAN — COMM-1 işaretleri
- Provider: claude
- Model: haiku
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/features.md, docs/MASTER-PLAN.md
- Dependencies: 278-003, 278-004, 278-008
- Scope: docs/
- ModelEffort: low

### Description
DİSKTEKİ koddan: features.md'ye worker-comms satırları (shared-memory wire + handoff-prompt + sharedNotes; tetikleyen `worker_comms.enabled`); MASTER-PLAN COMM-1 + WK-6 maddelerini işaretle (✅ Sprint 278: shared-memory + handoff worker-prompt wire + structured notes + görünürlük; multi-agent disposition; kalan: flow/autonomous/Brain comms genişlemesi + dashboard görünürlük). Tek-satır ekler, mevcut metni SİLME.

**Kanıt:** `grep -c "Sprint 278" docs/MASTER-PLAN.md` ≥ 2. **Test:** yok — .result YAZ.

---

**Beklenen:** 11 mikro task (opus 3 — shared/handoff prompt-wire kritik · sonnet 6 · haiku 2), zincirler: 002→001 · 003→001 · 004→003 · 005→001 · 006→003 · 008→002,005 · 009→002,003,004,005 · 010→001 · 011→003,004,008. Dosya çakışması: prompt-god-template.ts (003→004→006 SERİLEŞTİRİLDİ, hepsi prompt-SON bölgesi) + task-builder.ts (003,004) + sprint-controller.ts (005). Hepsi opt-in default-off + cache-prefix korunur + additive. CC sprint sonu: tsc + testler + prompt-determinizm guard + commit/push + 🔨 BUILD. Sonraki B-küme: BOT-1 (humanized bot) · ROUTE-1 (model atama+öğrenme) · DESK-1 (desktop+mobil app — ayrı büyük arc).
