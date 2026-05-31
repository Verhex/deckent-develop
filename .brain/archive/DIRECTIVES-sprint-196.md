# DIRECTIVES — Sprint 196: Prompt Engineering Tier 1 + Retroactive Reclassify (4 dalga, 6 task + 2 opsiyonel)

## Goal: Sprint 194/195'in disk-verify rescue commit'leri sonrası Brain Sprint 191/192/193/194/195 ararındaki sentetik NO_GO'ları retroactive reclassify edip agent stats düzelt; Worker Prompt Engineering "God-Level Stream" Tier-1 task'larını (persona matcher + prompt caching + boundary auto-derive + token estimation + idempotency mode + agent rotation policy) land et. 1 Haziran 2026 OSS GA beta launch'a 5 gün kala MOMENTUM korumak — Sprint 195'te kanıtlandı (8/8 disk DONE, 0 gerçek NO_GO), bu sprint Brain'i kendi başına dürüst raporlama yapabilir hale getirir.

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — Faz 1 + Faz 2 köprü sprint.
Kanıt-temelli bağlam:
- Sprint 195 195-002-fix `cacheReadTokens: 85000` ile **9x prompt cache save** kanıtladı (WP-5 ROI)
- Sprint 195 temp-react-ts-specialist 0/1 NO_GO, architect 3/3 DONE (WP-1 persona mismatch kanıt)
- Sprint 195 195-001 + 195-002 boundary violation tests/ scope dışı (WP-3 auto-derive kanıt)
- Sprint 195 token estimation 5.6x off (est 3.9K vs actual 22K — WP-4 kanıt)

---

## Tüm task'lar için ortak kurallar

- **Test scope ZORUNLU:** `scope.filesWrite` test dosyalarını AÇIKÇA içermeli — `tests/orchestra/`, `tests/core/`, `tests/scripts/` gibi. Sprint 195 195-001 + 195-002 boundary violation'ı bu eksiklikten kaynaklandı, tekrarı yasak.
- Worker yalnızca `scope.filesWrite` içine yazar; scope dışına dokunmak yasak (ADR-037 advisory + honest-gate hard catch).
- Her kod task'ı **vitest minimum 4 test** (mutlu/edge/hata/regresyon). Doc task'ları audit (kanıt komutları + yapı kontrol).
- `dosya:satır` kanıtı zorunlu, `.result` notes'una kanıt komutu çıktısı yapıştır.
- ADR ihlali → NO_GO + amendment proposal.
- `.brain/memory.db` write yalnızca core/memory-*.ts yolundan; **DB silmek YASAK**.
- Sprint sonu tsc temiz + test regresyon yok (53 baseline fail Sprint 195'ten, artmasın).
- **Dishonest result YASAK** — `linesAdded` claim disk'le çakışmalı.
- **Sprint çalışırken /login, claude logout YASAK** ([[feedback_no_auth_touch_during_sprint]]).
- **API mode YASAK** — Tier 1 30K tok/min cap, Tier 2 sonrası tekrar denenir.
- **Karpathy 4-disciplines zorunlu**: `.plan` first, YAGNI, surgical, goal-driven.

---

## DALGA 0 — Retroactive Reclassify (1 task — ZORUNLU İLK)

> **Neden tek başına:** Brain memory.db ve agent stats Sprint 191-195'ten kalan sentetik NO_GO'larla çarpıtılmış. Bu reclassify diğer Sprint 196 task'larının doğru pattern'leri öğrenmesini sağlar (rule-evolver hatalı pattern öğrenmesin).

---

## Task 1: 196-001 — Sprint 191/192/193/194/195 retroactive bulk reclassify
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: scripts/sprint-retroactive-reclassify.mjs, tests/scripts/sprint-retroactive-reclassify.test.ts
- Scope: scripts/, tests/scripts/

### Description

**Problem:** Sprint 191-195'te toplam ~16 task Brain tarafından sentetik NO_GO işaretlendi, AMA disk-verify gerçeği DONE/GO_WITH_TECH_DEBT:
- Sprint 191: ~14 task carry-over (Sprint 192/193 task'larıyla land etmişti)
- Sprint 192: 192-019 retroactive carry-over (Sprint 193 W-INTEGRITY ile çözüldü)
- Sprint 194: 194-001, 194-002, 194-004, 194-005 (1633 LoC manuel rescue, commit'lendi)
- Sprint 195: 195-004 + 195-004-fix (selfAssessment DONE, rubricScores 95-100, container OOM)

Bu çarpıtma agent stats'ı bozuyor: temp-react-ts-specialist 0/1 görünüyor (gerçekte 195-004 DONE). Architect 3/3 doğru ama önceki sprint'lerden eksik veri var.

**Çözüm:**

1. **`scripts/sprint-retroactive-reclassify.mjs` (yeni, ~150 LoC):**
   - CLI: `node scripts/sprint-retroactive-reclassify.mjs --sprint sprint-194 --task 194-001 --decision DONE --reason "..."`
   - Bulk mode: `--from-file reclassify-list.json` (JSON array: [{sprint, task, decision, reason}, ...])
   - .brain/memory.db `sprint` entry'sinde `task_outcomes` field'ını update
   - Agent stats recalculate (`.deckent/agents/*/agent.json` totalUses/successRate)
   - Skill stats recalculate (`.deckent/skills/*/manifest.json` usage)
   - Audit trail: `.deckent/decisions/decision-reclassify-YYYY-MM-DD.json` (rationale + before/after)
   - Idempotent — aynı task ikinci kez reclassify edilmez (existing decision file check)

2. **Reclassify listesi (manuel inline JSON, scripts/reclassify-sprint-194-195.json):**
   ```json
   [
     {"sprint":"sprint-194","task":"194-001","decision":"DONE","reason":"Disk +321 LoC, 5 test pass, commit 37ba9532"},
     {"sprint":"sprint-194","task":"194-002","decision":"DONE","reason":"honest-gate +911 LoC, 19 test pass, commit a6aa86ce"},
     {"sprint":"sprint-194","task":"194-004","decision":"DONE","reason":"WORKER_NODE_OPTIONS landed in commit 37ba9532"},
     {"sprint":"sprint-194","task":"194-005","decision":"DONE","reason":"host-detector +328 LoC, 14 test pass, commit 1bec2144"},
     {"sprint":"sprint-195","task":"195-004","decision":"DONE","reason":"selfAssessment DONE, rubricScores correctness:95, scope:100, commit 5c1b0328"},
     {"sprint":"sprint-195","task":"195-004-fix","decision":"DONE","reason":"Container OOM kill not code defect, rubricScores correctness:100, scope:100"}
   ]
   ```

3. **`tests/scripts/sprint-retroactive-reclassify.test.ts` (yeni, ≥6 test):**
   - (a) Single reclassify update memory.db + agent stats
   - (b) Bulk from-file 6 entry process
   - (c) Idempotency (aynı task 2. kez no-op)
   - (d) Invalid decision string → error
   - (e) Audit trail write (decisions/*.json)
   - (f) Agent stats recompute consistency check

**Kanıt:**
- `node scripts/sprint-retroactive-reclassify.mjs --from-file scripts/reclassify-sprint-194-195.json` → "Reclassified 6 tasks"
- `deckent agent stats --agent temp-react-ts-specialist` → Sprint 195 entry DONE (0/1 → 1/1)
- `ls .deckent/decisions/decision-reclassify-*` → 1 audit file
- `npx vitest run tests/scripts/sprint-retroactive-reclassify.test.ts` → 6+ pass

**Test:** ≥6 test.

---

## DALGA 1 — Prompt Engineering Tier 1 (3 task, paralel)

> Sprint 195 prompt analizinde tespit edilen 10 sorundan en yüksek ROI 3 fix. WP-5 Prompt cache (9x save kanıtlı), WP-1 Persona matcher (mismatch kanıtlı), WP-3 Boundary auto-derive (Sprint 195 violation kanıtlı).

---

## Task 2: 196-002 — WP-1 Persona-task domain matcher (worker prompt routing fix)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, src/orchestra/task-router.ts, src/core/agent-pool.ts, tests/orchestra/persona-task-matcher.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

**Problem:** Sprint 195'te `temp-react-ts-specialist` persona'sı 195-004 (CLI/Node.js model-catalog task) için atandı, persona-task mismatch sonucu Brain NO_GO (gerçekte container OOM ama persona uyumsuzluğu prompt quality riski). 195-004-fix'te `code-reviewer` rotation oldu. WP-1 bu pattern'i pro-active çözer.

**Çözüm:**

1. **`src/orchestra/task-builder.ts` veya `task-router.ts` — Persona-task domain matcher:**
   - `validatePersonaTaskMatch(agent, task): { valid: boolean, mismatch?: string[], suggestedAgent?: string }`
   - Task scope.directories ve scope.filesWrite path'lerinden task domain çıkar:
     * `src/cli/` → CLI specialist
     * `src/api/`, `src/dashboard/` → React/UI specialist
     * `src/orchestra/`, `src/core/` → architect / system designer
     * `tests/` → testing-expert
     * `docs/`, `*.md` → doc-writer
     * `.deckent/`, `scripts/` → devops-engineer
   - Agent persona'sından domain çıkar (agent.json'da `domain` field varsa, yoksa skills'ten infer)
   - Mismatch tespit edilirse `routingMeta.overrideWarnings` push (existing field, Sprint 182 F8) + alternatif agent öner
   - Brain selectAgent() bunu kullanır — eğer mismatch HIGH ise re-route, LOW ise warn-only

2. **`src/core/agent-pool.ts` — agent.json'a domain field optional:**
   - `Agent` interface: `domain?: 'cli' | 'react' | 'system' | 'test' | 'doc' | 'devops' | 'security' | 'data'`
   - Backward compat: undefined → "generic" (mevcut davranış)
   - 15 built-in agent için domain field manuel kalibrasyon (sadece JSON edit, ~15 satır)

3. **`tests/orchestra/persona-task-matcher.test.ts` (yeni, ≥6 test):**
   - (a) CLI task + react specialist → mismatch HIGH, suggest architect
   - (b) System task + architect → match, no warning
   - (c) Test task + testing-expert → match
   - (d) Doc task + doc-writer → match
   - (e) Multi-domain task (src/cli + src/api) → ambiguous, no override
   - (f) Generic agent (no domain) → no mismatch (legacy)

**Kanıt:**
- `grep -n "validatePersonaTaskMatch\|domain:" src/orchestra/task-builder.ts src/core/agent-pool.ts` → 4+ match
- 15 agent.json dosyasında `"domain":` 12-15 match (yeni)
- `npx vitest run tests/orchestra/persona-task-matcher.test.ts` → 6+ pass

**Test:** ≥6 test.

---

## Task 3: 196-003 — WP-5 Anthropic prompt cache wire (9x cost save)
- Model: opus
- Effort: high
- Skills: typescript-expert, anthropic-sdk
- Files: src/providers/claude.ts, src/orchestra/task-builder.ts, src/orchestra/spawn-backend-docker.ts, tests/providers/claude-prompt-cache.test.ts
- Scope: src/providers/, src/orchestra/, tests/providers/

### Description

**Problem:** Sprint 195 195-002-fix `cacheReadTokens: 85000` kanıtladı — Anthropic prompt cache kullanıldığında 9x cost saving. Ama mevcut wire **incidental** (worker prompt'unun başı boilerplate olduğu için cache hit'ti), tasarlanmış değil. Karpathy + ADR + Skills frozen section ~22K token × N worker = devasa boş cost.

**Çözüm:**

1. **`src/providers/claude.ts` — Anthropic SDK prompt caching wire:**
   - Worker prompt'unu 4 bölüme ayır:
     * **FROZEN system** (Karpathy 4-discipline + tüm ADR + skill prompts) — `cache_control: { type: "ephemeral" }`
     * **STATIC task** (task type, scope, evidence commands) — opsiyonel cache
     * **DYNAMIC instructions** (task-specific description) — no cache
     * **USER input** — no cache
   - Claude CLI subscription mode'da `cache_control` headers — CLI wrapper'la enable et
   - API mode'da Anthropic SDK `messages.create` ile cache_control beta header

2. **`src/orchestra/task-builder.ts` — Worker prompt struct refactor:**
   - `buildWorkerPrompt()` return string yerine `{ frozen: string, static: string, dynamic: string }`
   - Backward compat: caller string isterse concat
   - `frozen` section'ı her worker için aynı (Karpathy + global ADR + global skills)

3. **`src/orchestra/spawn-backend-docker.ts` — Cache identity:**
   - Container env'inde `DECKENT_PROMPT_CACHE_KEY=sha256(frozen)` set
   - Worker bu key'i Anthropic header'a koyabilir

4. **`tests/providers/claude-prompt-cache.test.ts` (yeni, ≥5 test):**
   - (a) Frozen section deterministic (aynı agent + skills → aynı hash)
   - (b) Dynamic section task'tan task'a değişir
   - (c) Cache hit telemetry (cacheReadTokens) test fixture'lar
   - (d) Cache miss fallback (ilk worker veya değişen frozen)
   - (e) Backward compat (string consumer)

**Kanıt:**
- Sprint 196'da spawn olan worker'ların `tokenUsage.cacheReadTokens` ortalaması > 50K (Sprint 195'te tek bir tane vardı, hedef: tüm worker'larda)
- `grep -n "cache_control\|DECKENT_PROMPT_CACHE_KEY" src/providers/claude.ts src/orchestra/` → 3+ match
- `npx vitest run tests/providers/claude-prompt-cache.test.ts` → 5+ pass

**Test:** ≥5 test.

---

## Task 4: 196-004 — WP-3 Boundary guard scope auto-derive (test dizini otomatik)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, src/orchestra/scope-deriver.ts, tests/orchestra/scope-deriver.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description

**Problem:** Sprint 195 195-001 ve 195-002 boundary violation'a takıldı — DIRECTIVES'te `scope.filesWrite` test dosyalarını eksik içeriyordu (`tests/core/types*.test.ts` 195-001 için, `tests/scripts/changelog-backfill.test.ts` 195-002 için). Pattern: src/X.ts yazan worker tests/X.test.ts veya tests/Y/X.test.ts'a da yazmak zorunda. DIRECTIVES manuel kalmamalı.

**Çözüm:**

1. **`src/orchestra/scope-deriver.ts` (yeni, ~80 LoC):**
   - `deriveTestScope(filesWrite: string[]): { extraFiles: string[], extraDirs: string[] }`
   - Heuristic: her `src/X/Y.ts` için olası test path'leri infer:
     * `tests/X/Y.test.ts` (mirror)
     * `tests/X/Y-edge.test.ts`, `tests/X/Y-split.test.ts` (Sprint 195 195-001 pattern)
     * `tests/scripts/Y.test.ts` (script test)
   - `scripts/X.mjs` için `tests/scripts/X.test.ts`
   - `docs/X.md` için test gerekmez (doc-only)
   - Sadece path string'leri döner (dosya var olmasa bile)

2. **`src/orchestra/task-builder.ts` — createTask hook:**
   - `createTask()`'ın `scope` build aşamasında `deriveTestScope()` çağır
   - Inferred test path'leri `scope.filesWrite`'a ekle (sadece eksikse, idempotent)
   - `task.routingMeta.scopeDerivation: { extraFiles: [...], reason: 'test-mirror' }` audit trail

3. **`tests/orchestra/scope-deriver.test.ts` (yeni, ≥6 test):**
   - (a) src/core/X.ts → tests/core/X.test.ts inferred
   - (b) Multi-file src/orchestra/A.ts + B.ts → A.test.ts + B.test.ts both
   - (c) scripts/X.mjs → tests/scripts/X.test.ts
   - (d) docs/X.md → no test path
   - (e) Idempotency (zaten scope'ta varsa duplicate yok)
   - (f) Edge: src/X.ts (no subdir) → tests/X.test.ts

**Kanıt:**
- `grep -n "deriveTestScope" src/orchestra/` → 2+ match
- `npx vitest run tests/orchestra/scope-deriver.test.ts` → 6+ pass
- Sprint 196 task'larında scopeDerivation field görünür (.tasks/task-*.json inspect)

**Test:** ≥6 test.

---

## DALGA 2 — Prompt Engineering Tier 2 (2 task)

> Token estimation + idempotency mode — Sprint 195 kanıtlarına dayalı.

---

## Task 5: 196-005 — WP-4 Token usage orchestrator-side fill (worker'dan kaldır)
- Model: opus
- Effort: normal
- Skills: typescript-expert, anthropic-sdk
- Files: src/orchestra/token-counter.ts, src/orchestra/result-collector.ts, src/agents/worker.ts, tests/orchestra/token-counter.test.ts
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description

**Problem:** Sprint 195 worker `tokenUsage` field'ı self-report — 195-002-fix `estimatedTokens: 3.9K` AMA actual input 22K (5.6x off). LLM kendi token kullanımını güvenilir tahmin edemez ([[feedback_worker_prompt_engineering_god_level]] sorun #7). Anthropic SDK / Claude CLI çıktısında gerçek token count var, orchestrator bunu doldurmalı.

**Çözüm:**

1. **`src/orchestra/token-counter.ts` (yeni, ~100 LoC):**
   - `extractTokenUsageFromClaudeCli(stdout: string): TokenUsage | null` — Claude CLI çıktısında `[deckent:tokens]` veya benzeri marker parse
   - `extractTokenUsageFromAnthropicResponse(response): TokenUsage` — SDK kullanılıyorsa
   - `mergeWithWorkerClaim(workerReported, measured): TokenUsage` — measured öncelik, worker'ın `provider`/`model` field'ları kalsın

2. **`src/orchestra/result-collector.ts` — `.result` write öncesi token fill:**
   - Worker `.result` yazdıktan sonra Brain log'dan token count çek (Claude CLI subscription mode'da `claude --json` output'undan)
   - Mevcut `tokenUsage` field'ı override et (measured > worker estimate)

3. **`src/agents/worker.ts` — Worker prompt'tan token estimation talimatını kaldır:**
   - Mevcut "best estimate inputTokens/outputTokens" prompt'tan çıkar
   - Worker sadece `{ "provider": "claude", "model": "..." }` döner, tokens orchestrator doldurur

4. **`tests/orchestra/token-counter.test.ts` (yeni, ≥5 test):**
   - (a) Claude CLI marker parse happy path
   - (b) Marker yoksa null
   - (c) Anthropic SDK response parse
   - (d) Merge logic (measured > worker)
   - (e) Provider/model preservation

**Kanıt:**
- Sprint 196 task'larında `tokenUsage.inputTokens` accuracy >%90 (5.6x off → <%10 off hedefi)
- `grep -n "extractTokenUsageFromClaudeCli\|extractTokenUsageFromAnthropicResponse" src/orchestra/` → 2+ match
- `npx vitest run tests/orchestra/token-counter.test.ts` → 5+ pass

**Test:** ≥5 test.

---

## Task 6: 196-006 — WP-2 FIX worker idempotency mode flag (verify-only vs re-implement)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, src/core/task-types.ts, tests/orchestra/fix-mode.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description

**Problem:** Sprint 195 FIX worker'ları (195-001-fix, 195-002-fix, 195-004-fix) intent belirsizdi — "yeniden yaz mı, doğrula mı?" 195-004-fix code-reviewer agent ile geldi ama context cascade'de "previous worker correct, just verify" çıkarımı kendi başına yaptı (notes: "Code review + verification pass"). Bu **lucky** outcome — pattern'i deterministic yapmak gerek.

**Çözüm:**

1. **`src/core/task-types.ts` — Task interface'ine fix mode field:**
   - `fixMode?: 'verify-only' | 'amend' | 're-implement'`
   - verify-only: önceki worker output doğru varsayılır, sadece kanıt komutları çalıştır
   - amend: önceki output'a ekleme (eksik test, scope dışı dosya geri al)
   - re-implement: sıfırdan yeniden yap (önceki kod muhtemelen yanlış)

2. **`src/orchestra/task-builder.ts` — FIX task spawn'da mode infer:**
   - Önceki .result `selfAssessment` DONE + rubricScores high (>90) → verify-only
   - selfAssessment DONE + boundary violation → amend (sadece scope-extension)
   - selfAssessment NO_GO + code defect notes → re-implement
   - Worker prompt'a `fixMode` injection edilir, action net olur

3. **`tests/orchestra/fix-mode.test.ts` (yeni, ≥4 test):**
   - (a) Önceki DONE + rubric high → verify-only
   - (b) Önceki DONE + boundary violation → amend
   - (c) Önceki NO_GO + defect → re-implement
   - (d) Ambiguous → default amend (safest)

**Kanıt:**
- `grep -n "fixMode" src/core/task-types.ts src/orchestra/task-builder.ts` → 3+ match
- `npx vitest run tests/orchestra/fix-mode.test.ts` → 4+ pass
- Sprint 196'da herhangi NO_GO olursa FIX task spawn'da `task.fixMode` field görünür

**Test:** ≥4 test.

---

## OPSİYONEL — DALGA 3 (eğer ilk 6 hızlı landerse, ~30dk)

## Task 7 (OPSİYONEL): 196-007 — Test fail kategorize update (Sprint 195 sonrası 53 fail)
- Model: haiku
- Effort: low
- Skills: testing-expert, documentation-writer
- Files: docs/audits/sprint-196/test-fail-categorize.md
- Scope: docs/audits/sprint-196/

### Description

**Problem:** Sprint 189-015'te 62 test fail kategorize edildi (36 baseline + 19 TDD + 7 env). Sprint 195 sonrası 53 fail var (toplam azaldı ama drift olabilir). Pre-beta 1 Haziran öncesi son test sağlık raporu.

**Çözüm:**
- `npx vitest run 2>&1` çıktısını parse, fail testlerini grupla
- Kategoriler: baseline (Sprint 189'dan), regression (Sprint 190-195 sonrası), env (docker/network gerek), TDD pending (yazılmış ama henüz pass edilmemiş)
- `docs/audits/sprint-196/test-fail-categorize.md` rapor (her kategori için liste + öneri)

**Kanıt:** Rapor dosyası ≥80 satır + 4 kategori başlık.

**Test:** Audit task, test gerektirmez.

---

## Task 8 (OPSİYONEL): 196-008 — CHANGELOG Sprint 172-194 kalan entries
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: docs/CHANGELOG.md
- Scope: docs/

### Description

**Problem:** Sprint 195'te CHANGELOG backfill scripti 19 entry land etti (157-171, 176, 184, 185, 194). Sprint 172-175, 177-183, 186-193 = 19 entry daha kalan. Pre-beta v1.0.0-beta.1 publish için tam backfill.

**Çözüm:**
- `node scripts/changelog-backfill.mjs --since sprint-172 --until sprint-194` çalıştır
- Script idempotent (mevcut entry'ler skip)
- Yeni eklenen 19 entry'i CHANGELOG.md'da review et (manuel düzeltme gerekmez, otomatik)

**Kanıt:** `grep -c "^## \[Sprint 1" docs/CHANGELOG.md` → ≥38 (öncesi 19+1 = 20, hedef 38)

**Test:** Audit, test gerektirmez.

---

## Sprint Sonu Notu

**Beklenen sonuç:** 6/6 DONE + 0-2 opsiyonel. Sprint 195 disk-verify gate runtime'a girdiği için (commit 2c7b39eb landed + build edildi + /mcp restart sonrası), Brain ARTIK sentetik NO_GO yazmadan ÖNCE disk-verify yapar — eğer sentetik NO_GO olursa MANUAL_REVIEW_REQUIRED status'üne taşır. Yani Sprint 196 ilk Brain'in dürüst raporlama yaptığı sprint olacak.

**Pre-beta uyarı:** Sprint 196 koşulurken /login, claude logout, MCP restart YASAK. Sprint başlamadan önce `~/.claude/.credentials.json` canlı doğrulanmış (`claude -p` test edildi 2026-05-26 14:00). ANTHROPIC_API_KEY env'den unset (manuel + bu shell'de yapıldı).

**Tahmini süre:** 2-3.5 saat (6 zorunlu). Token tüketimi ~280K (Pro 45/5h sınırı içinde). Mesaj sayısı ~25-30.

Next (Sprint 197 önizleme): Pre-beta final polish — npm publish v1.0.0-beta.1 packaging + Dockerfile.worker image build/push automation + final smoke test + beta announcement materyali. Sprint 198 = 1 Haziran beta launch günü.

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — Faz 1 cleanup + Faz 2 köprü. WP Stream genişlemesi: [[feedback_worker_prompt_engineering_god_level]] memory entry'sinde WP-7..WP-12 post-beta hedefli.
