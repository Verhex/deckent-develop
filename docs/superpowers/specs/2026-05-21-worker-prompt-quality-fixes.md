# Worker Prompt Quality Fixes — Sprint 182 Sub-Spec

**Date:** 2026-05-21
**Status:** Draft — Sprint 182 entegrasyonu için bağlayıcı sub-spec
**Author:** Claude Code (analiz) + Alperen (felsefe anchor)
**Trigger:** Sprint 181-001 (devops-engineer + CI workflow) ve Sprint 181-002 (refactorer + package.json) worker prompt'larının canlı incelemesi
**Anchor memory:** [[feedback-prompt-completeness-over-brevity]] — token-tasarruf yasak; tutarlılık + kalite önceliklidir.

---

## 1. Bağlam

Sprint 181 W1 wave'inde üretilen iki worker prompt'unu (181-001 devops-engineer, 181-002 refactorer) end-to-end inceledik:

- **Pipeline kanıtlanmış path:**
  `DIRECTIVES.md` → `task-builder.ts:986 buildWorkerPrompt()` → `prompt-god-template.ts:73 buildTaskPrompt()` → 6-block render (`agent | skill | adr | scope | deps | preamble+verify+heartbeat+result`)
- **Catalog uyumu doğrulandı:** `.deckent/agents/{devops-engineer,refactorer}/` + `.deckent/skills/{devops-engineer,typescript-expert}/` mevcut; `manifestVersion: 2`, activation rules + triggerKeywords + composableWith dolu.
- **Üretilen prompt incelemesi 8 sınıf problem ortaya çıkardı** — 3'ü concrete bug, 5'i tutarlılık/kalite. Tümü token-tasarruf eksenli DEĞİL; aksine bazıları (#F2, #F3) token cap'lerin **kaldırılması** istiyor.

## 2. Felsefe (uygulanırken bağlayıcı)

`feedback_prompt_completeness_over_brevity.md` (2026-05-21 anchor):

> Promptun ucu açık kalması hatalara sebebiyet veriyor; prompt dosyasının uzunluğunu dert etmeyeceğiz; tutarlılık ve kaliteye önem veriyoruz.

**Uygulamada:**
- Skill/ADR/agent content **kesilmez**. `EFFORT_TOKEN_MAP` truncation, `ADR_SECTION_MAX = 6000` cap, `perItemMax` skill clip — felsefeye aykırı; sökülecek.
- Effort field (low/normal/high) prompt **kapsamını** etkilemez; sadece task complexity sinyali.
- Tutarlılık: aynı bilgi iki yerden farklı render olmasın (single source of truth).
- Kalite: alakasız ADR/agent worker'ı yanıltır; eşleşme yoksa block tamamen kaldırılır (boş header da basılmaz).

## 3. Bulgu Envanteri — 8 Düzeltme

### F1. `${IDEMPOTENCY_KEY}` placeholder render edilmiyor

**Mevcut davranış:** `src/orchestra/prompt-god-template.ts:455`

```ts
sections.push(`## Idempotency Key
\${IDEMPOTENCY_KEY}
Use this key for external API calls (Idempotency-Key header) to make retries safe.`);
```

Template literal içinde `\${IDEMPOTENCY_KEY}` escape edilmiş; worker'a literal string `${IDEMPOTENCY_KEY}` gidiyor. Canlı kanıt: Sprint 181-001 ve 181-002 prompt'larının her ikisinde de literal placeholder duruyor.

**İstenen davranış:** Ya gerçek deterministik bir key inject edilsin (örn. `sha256(sprintId + taskId)` → 16 hex char), ya da bölüm tamamen kaldırılsın (worker'ın bu key'i kullandığı bir external call yoksa).

**Karar:** Inject et. Worker `tokenUsage` retry idempotency için meaningful; key = `${sprintId}-${taskId}` yeterli (kısa, deterministik, debug edilebilir).

**TDD RED testleri (`tests/orchestra/prompt-god-template-idempotency.test.ts`):**
- T1: `buildTaskPrompt({id:'001-001', sprintId:'sprint-182', ...})` çıktısı `${IDEMPOTENCY_KEY}` literal string İÇERMEMELI.
- T2: Çıktıda `## Idempotency Key\nsprint-182-001-001\n` substring BULUNMALI.
- T3: Aynı task iki kez render edildiğinde key identical (determinism).
- T4: Farklı taskId → farklı key (collision yok).

**GREEN implementation:**
- `RenderInput`'a `idempotencyKey: string` field ekle, `buildTaskPrompt` `${task.sprintId}-${task.id}` compute edip `renderTemplate`'e geçir.
- `renderTemplate` line 455'i `${input.idempotencyKey}` interpolasyonuna çevir.

---

### F2. Skill content truncation kaldır (felsefe)

**Mevcut davranış:** `src/orchestra/prompt-god-template.ts:131-157`

```ts
const perItemMax = EFFORT_TOKEN_MAP[effort] ?? 1500;
const sectionMax = Math.round(perItemMax * 2.67);
// ...
const truncated = truncateAtParagraph(sp.content, perItemMax);
const entry = `--- ${sp.name} ---\n${truncated}`;
if (totalLen + entry.length + 1 > sectionMax) break;
```

Skill içeriği effort'a göre kesiliyor; ayrıca section max'a ulaşılınca sonraki skill'ler tamamen düşürülüyor (`break`).

**İstenen davranış:** Her atanmış skill full SKILL.md gövdesiyle inject edilsin. Hiçbir truncation, hiçbir skip yok.

**TDD RED testleri (`tests/orchestra/prompt-god-template-skill-completeness.test.ts`):**
- T1: 3 skill (her biri 5000+ char), effort='low' → 3'ü de full inject (toplam içerik = sum(skill.length) + headers).
- T2: 5000 char skill, effort='low' → çıktıda skill'in son paragrafı (kuyruk) BULUNMALI.
- T3: 10 skill atandığında 10'u da inject (skip yok).
- T4: `truncateAtParagraph` çağrılmadığı assertion (mock veya istenmeyen kısaltma tag yokluğu).

**GREEN implementation:**
- `EFFORT_TOKEN_MAP`, `perItemMax`, `sectionMax`, `truncateAtParagraph` çağrısı, `if (... > sectionMax) break` — hepsi sökülür.
- Yeni döngü: `for (const sp of skillPrompts) { parts.push(\`--- ${sp.name} ---\n${sp.content}\`); outNames.push(sp.name); }`.
- `EFFORT_TOKEN_MAP` constant'ı ileride başka yerden referans alınmıyorsa tamamen silinir (grep verify).

---

### F3. ADR_SECTION_MAX cap kaldır

**Mevcut davranış:** `src/orchestra/prompt-god-template.ts:184-187`

```ts
const ADR_SECTION_MAX = 6000;
if (content.length > ADR_SECTION_MAX) {
  content = content.slice(0, ADR_SECTION_MAX) + '\n\n(ADR content truncated for prompt size)';
}
```

ADR seçildikten sonra gövdesi 6K char'da kesiliyor; "(ADR content truncated for prompt size)" eklentisi worker'ı uyarıyor — yarım ADR daha tehlikeli, çünkü "Mandatory ADR" header'ı altında.

**İstenen davranış:** ADR seçildiyse full content. Cap yok.

**TDD RED testleri (`tests/orchestra/prompt-god-template-adr-completeness.test.ts`):**
- T1: 12K char ADR atandığında çıktıda tam içerik (length ≥ 12K).
- T2: Çıktıda `(ADR content truncated for prompt size)` substring BULUNMAMALI.
- T3: 3 ADR (her biri 8K) → tüm 24K render.

**GREEN implementation:**
- `ADR_SECTION_MAX` constant ve truncation logic'i tamamen sil (line 184-187).
- `buildAdrPromptSection`'ın `mode: 'full' | 'summary'` dallanması da gözden geçirilsin — eğer "summary" sadece uzunluk azaltma için varsa kaldır; semantik bir özellik ise (örn. linked refs vs full text) korunur ve `mode: 'full'` default yapılır.

---

### F4. Agent prompt single source of truth (tutarlılık)

**Mevcut davranış:** `agent.json::systemPrompt` + `PROMPT.md` iki ayrı kaynak; her ikisi de "=== Agent: X ===" bloğuna ardarda inject ediliyor:

```ts
// task-router.ts veya agent loader: agentPrompt = `${systemPrompt}\n\n${PROMPT.md}`
// prompt-god-template.ts:126
return `=== Agent: ${agentId} ===\n${agentPrompt}\n\n=== Task ===\n`;
```

Kanıt: devops-engineer için her ikisi de aynı konuları (CI/CD, Docker, monitoring) iki farklı stilde anlatıyor. **devops-engineer agent'ında** `systemPrompt` "Reproducibility is paramount" diyor; `PROMPT.md` ise "Verification Steps" bölümünde aynı kavramı farklı kelimelerle tekrar ediyor — şu an küçük divergence başlamış, zamanla büyür.

**İstenen davranış:** Tek kanonik kaynak. `PROMPT.md` resmi agent dokümanı; `systemPrompt` yalnızca **kısa machine-readable tag/description** (routing scoring + dashboard listing için) olur, prompt'a inject EDILMEZ.

**TDD RED testleri (`tests/orchestra/agent-prompt-single-source.test.ts`):**
- T1: `loadAgentPrompt('devops-engineer')` çıktısı `agent.json.systemPrompt` substring'ini İÇERMEMELI.
- T2: Çıktı `PROMPT.md` içeriği ile birebir eşit (modulo trim).
- T3: Tüm 15 built-in agent için aynı invariant tutar (loop assertion).
- T4: Eksik PROMPT.md durumunda fallback: `systemPrompt` kullanılır (degraded mode warning emit).

**GREEN implementation:**
- Agent loader (`src/core/agent-pool.ts` veya benzeri): `getAgentPrompt(id)` → öncelik `PROMPT.md`, fallback `systemPrompt`.
- Concatenation kalkar.
- `agent.json::systemPrompt` schema'sı korunur (routing scoring + UI display için) ama prompt injection'a girmez.
- 15 agent için PROMPT.md mevcudiyeti audit ediliyor (varsa sweep — sprint task'ı olarak).

---

### F5. DIRECTIVES `Files:` → `task.scope.filesWrite` otomatik doldur

**Mevcut davranış:** DIRECTIVES'te `Files: package.json` yazılırsa `task.scope.filesWrite` boş kalıyor; render template'te `'(determined by your task scope)'` belirsiz string çıkıyor (Sprint 181-002 canlı kanıt).

**İstenen davranış:** DIRECTIVES parser `Files:` alanını okuyup `task.scope.filesWrite` array'ine push etsin. Boş kalıyorsa `Scope:` directory'lerinden auto-infer (warning emit) veya plan'da hard fail.

**TDD RED testleri (`tests/orchestra/directives-files-to-scope.test.ts`):**
- T1: DIRECTIVES `Files: a.ts, b.ts` → task.scope.filesWrite = ['a.ts', 'b.ts'].
- T2: `Files:` eksik + `Scope: src/foo/` → scope.filesWrite = [] (boş) ama plan warning'i emit edilir.
- T3: Render template'te boş `filesWrite` artık `'(determined by your task scope)'` substring BASMAZ — yerine açık liste veya `Scope:` direktif'inden inferred listing.

**GREEN implementation:**
- `task-builder.ts::parseDirectives()` veya benzeri DIRECTIVES parser: `Files:` line regex match → `task.scope.filesWrite` populate.
- `prompt-god-template.ts:204-206` fallback string'i değiştir — "(no explicit file list; you may write any file within Scope directories)" gibi açık formulation.

---

### F6. Title === Description duplicate + markdown bozulması

**Mevcut davranış:** `prompt-god-template.ts:450`

```ts
## Your Task
${task.id}: ${task.title} — ${task.description}
```

DIRECTIVES'te `## Task 1: W1-1 — CI workflow'una dashboard deps install` başlık satırı parse edildiğinde, title ve description'a aynı string atanmış → render'da `181-001: W1-1 — ... — W1-1 — ...` duplicate. Ayrıca description çok-paragraflı markdown (kod blokları, **bold**, listeler) tek satıra basıldığında **render bozuluyor**.

**İstenen davranış:**
- Title parse: `## Task N: <title>` satırından `<title>` alınır; sonraki `### Description` bloğu ayrı.
- Render: title kendi satırında, description sonraki paragrafta — markdown korunur.

**TDD RED testleri (`tests/orchestra/directives-title-description-split.test.ts`):**
- T1: DIRECTIVES `## Task 1: foo bar` + `### Description\n**Bold** content` → task.title = 'foo bar', task.description = '**Bold** content' (trimmed, title olmadan).
- T2: Render çıktısı:
  ```
  ## Your Task
  001-001: foo bar
  - Model: ...

  **Bold** content
  ```
  yani title ve description ayrı satırlarda; description'daki bold preserve.
- T3: Multi-paragraph description (kod bloğu içeren) line break'leri korur.

**GREEN implementation:**
- DIRECTIVES parser: `## Task N: <title>` regex'ten title, `### Description` heading'inden sonrasını description (sonraki `## Task` veya `---` separator'a kadar).
- Render template'i (`prompt-god-template.ts:450`):
  ```ts
  `## Your Task
  ${task.id}: ${task.title}
  - Model: ${task.model}
  - Effort: ${effort}

  ${task.description}`
  ```

---

### F7. ADR relevance threshold + alakasız ADR block kaldır

**Mevcut davranış:** `prompt-god-template.ts:168` `selectRelevantAdrs(task, allAdrs, 3)` her zaman top-3 dönüyor, score ne olursa olsun. Sprint 181-001'de (CI workflow task) seçilen ADR'ler: ADR-037 (RBAC), ADR-039 (self-modifying), ADR-047 (manuel subagent) — **hiçbiri CI/workflow ile semantik bağlı değil**. Worker yanlış constraint priming alıyor.

**İstenen davranış:**
- `selectRelevantAdrs` minimum relevance score threshold döndürür; threshold altı ADR'ler **eklenmez**.
- 0 ADR seçilirse blok tamamen yok (boş `=== Mandatory Architecture Rules (ADR) ===` header da basılmaz).
- Threshold değeri configurable: `.deckent/config.json::prompt.adr_min_relevance` (default 0.3 normalized score).

**TDD RED testleri (`tests/orchestra/prompt-god-template-adr-relevance.test.ts`):**
- T1: TaskDNA = {keywords: ['workflow', 'github-actions'], domains: ['ci']} + ADR pool'da hiç matching ADR yok → blok render edilmez, çıktıda `=== Mandatory Architecture Rules (ADR) ===` substring YOK.
- T2: Threshold üstü 1 ADR + threshold altı 5 ADR → sadece 1 ADR render.
- T3: Config override: `prompt.adr_min_relevance: 0.5` → daha sıkı filter.

**GREEN implementation:**
- `selectRelevantAdrs(task, allAdrs, maxCount, minScore?)` signature genişlet.
- `buildAdrBlock`: `if (ranked.length === 0) return '';` zaten var, ama threshold uygulamasını ekle.
- Config: `core/config-types.ts`'e `prompt.adr_min_relevance: number` ekle, `core/config.ts` default 0.3.

---

### F8. Agent override semantic mismatch warning (plan-time)

**Mevcut davranış:** DIRECTIVES'te `Agent: refactorer` override yazılırsa `forceAgent` doğrudan atanır; agent'ın activation rules / triggerKeywords / triggerScopes ile task DNA arasında eşleşme kontrolü YOK. Sprint 181-002 canlı kanıt: `Agent: refactorer` + `package.json` edit — refactorer'ın systemPrompt'u "Extract Method, Move Function..." kod refactoring için, JSON config edit'iyle alakasız → worker yanlış priming alıyor.

**İstenen davranış:** PLAN aşamasında, forceAgent atandığında:
1. Agent'ın activation rules'ı task DNA üzerinde çalıştır.
2. Min score altıysa **warning emit** (PLAN çıktısında ve stdout'ta).
3. **Override yine uygulanır** (kullanıcı bilerek demiş olabilir) — fail değil, transparency.

**TDD RED testleri (`tests/orchestra/agent-override-semantic-check.test.ts`):**
- T1: forceAgent='refactorer' + scope='./' + filesWrite=['package.json'] → planner çıktısında warning: `"Agent 'refactorer' force-assigned to task '001-002' has low activation score (0.1) — domain mismatch (config-edit vs code-refactor)"`.
- T2: forceAgent='devops-engineer' + filesWrite=['.github/workflows/ci.yml'] → score yüksek (≥0.7), warning YOK.
- T3: Warning emit edilse de `task.assignedAgent === 'refactorer'` (override honored).
- T4: PLAN çıktısı JSON'a `routingMeta.overrideWarnings: string[]` field eklenir.

**GREEN implementation:**
- `task-router.ts` veya `planner.ts`: forceAgent path'inde routing-engine.scoreAgent(taskDNA, agent) çağrısı; threshold (örn. 0.3) altıysa warning push.
- `Task.routingMeta` interface'ine `overrideWarnings?: string[]` ekle.
- Sprint reporter / dashboard warning'leri görünür kılar (post-spec, ayrı task).

---

## 4. Sprint 182 Task Taslağı

Spec dosyası başka session'da `sprint-182` spec'ine merge edilecek. Önerilen task ayrımı (TDD discipline ile her task RED → GREEN → REFACTOR):

| Task | Başlık | Files | Effort | Test count |
|---|---|---|---|---|
| 182-PQ-1 | F1 — `${IDEMPOTENCY_KEY}` injection bug fix | `prompt-god-template.ts`, `tests/orchestra/prompt-god-template-idempotency.test.ts` | low | 4 |
| 182-PQ-2 | F2 + F3 — Skill + ADR truncation cap'lerini söke (felsefe uygulaması) | `prompt-god-template.ts`, 2 yeni test dosyası | normal | 7 (skill 4 + ADR 3) |
| 182-PQ-3 | F4 — Agent prompt single source of truth | `core/agent-pool.ts`, `prompt-god-template.ts` (varsa), 15 built-in agent PROMPT.md audit, 1 yeni test dosyası | high | 4 + 15 agent sweep |
| 182-PQ-4 | F5 + F6 — DIRECTIVES parser fix: Files→filesWrite + title/description split | `task-builder.ts` (parseDirectives), `prompt-god-template.ts:450`, 2 yeni test dosyası | normal | 6 (Files 3 + title 3) |
| 182-PQ-5 | F7 — ADR relevance threshold + config field | `prompt-god-template.ts`, `core/config-types.ts`, `core/config.ts`, `selectRelevantAdrs`, 1 yeni test dosyası | normal | 3 |
| 182-PQ-6 | F8 — Agent override semantic warning (transparency) | `task-router.ts` veya `planner.ts`, `core/types.ts` (routingMeta), 1 yeni test dosyası | normal | 4 |
| 182-PQ-7 | Integration smoke — Sprint 181-001 ve 181-002 prompt regresyon snapshot karşılaştırması | `tests/integration/prompt-quality-regression.test.ts`, snapshot fixture | low | 2 (before/after diff) |

**Toplam:** 7 task, ~30 test descriptor, ~600 LoC değişiklik (mostly `prompt-god-template.ts` + `task-builder.ts`).

## 5. Bağımlılıklar + Risk

**Bağımlılık zinciri:**
- F1 / F2 / F3 / F4 / F5 / F6 / F7 birbirinden bağımsız → paralel wave.
- F8 (override warning) `task.routingMeta` schema değişikliği → mid-sprint; ama diğer fix'lere bloke etmez.
- F4 (agent single source) 15 PROMPT.md'nin tam olduğunu doğrulamak gerek; eksikse "PROMPT.md eksik" ön-task gerekebilir.

**Risk:**
- F2 + F3 truncation kaldırma → bazı prompt'lar 20K+ char olabilir. Bu **istenen davranış** ([[feedback-prompt-completeness-over-brevity]]). Ancak provider rate-limit/context window kontrolü yapılmalı (modele göre): Opus 1M, Sonnet 200K, Haiku 200K → 20K prompt rahat sığar; endişe yok. **Bu felsefe anchor olduğundan değişmez.**
- F7 threshold default 0.3 kalibrasyonu canlıda doğrulanmalı (ilk 3 sprint warning rate'i izlenir, gerekirse threshold ayarlanır).
- F4 agent prompt single source — `systemPrompt` field'ı stat'lar/UI tarafından okunabiliyor olabilir; sweep gerek.

**Geriye dönük uyumluluk:**
- F1: literal `${IDEMPOTENCY_KEY}` zaten kullanılmıyordu (bug), değiştirmek davranış değişikliği değil — fix.
- F2 + F3: prompt'lar daha tam olur; worker davranışı **iyileşir**. Test snapshot'larında length değişimi beklenir.
- F4: agent prompt içeriği değişmez (PROMPT.md zaten kanonik içerikti); duplicate kalkar — token sayısı düşer, davranış iyileşir.
- F5 + F6: yeni DIRECTIVES formatları çalışmaya devam eder; eski format auto-migrate.
- F7: ADR seçilmeyen task'larda daha kısa prompt — kalite iyileşmesi.
- F8: warning sadece görsel; davranış override'i bozmaz.

## 6. ADR İmplikasyonu

Sprint 182 PQ fix'leri **ADR-048 Prompt Lifecycle Contract**'ı somut hâle getirir. ADR-048 generic; PQ fix'leri sonrası şu eklenmeli:

> **Amendment (Sprint 182, post-PQ):**
> - Worker prompt: skill content + ADR content + agent prompt **truncation YASAK** (memory: [[feedback-prompt-completeness-over-brevity]]).
> - Agent prompt single source = `PROMPT.md`. `agent.json::systemPrompt` yalnızca routing scoring + UI display.
> - DIRECTIVES `Files:` field'ı `task.scope.filesWrite` ile birebir map. `Title` (`## Task N:`) + `Description` (`### Description`) parser tarafından ayrılır; render'da iki ayrı paragraf.
> - ADR injection threshold-based: relevance score altı ADR atlanır; 0 ADR kalırsa blok render edilmez.
> - Agent override (`forceAgent`): activation rules ile semantic check + warning, override honored (transparency).

ADR amendment Sprint 182 PQ-7 (integration smoke) sonrası yazılır.

## 7. Açık Sorular (Sprint 182 PLAN öncesi karara bağlanmalı)

1. **F1 IDEMPOTENCY_KEY içeriği:** `${sprintId}-${taskId}` mı, `sha256` mı, başka bir scheme mi? Öneri: `${sprintId}-${taskId}-${retryCount}` (retry idempotency için).
2. **F4 fallback davranışı:** PROMPT.md yoksa systemPrompt'a düşmek mi, hard fail mi? Öneri: degraded warning + fallback (yumuşak).
3. **F7 threshold default:** 0.3 / 0.5 / configurable-only? Öneri: 0.3 (lenient), config ile override edilebilir.
4. **F8 warning severity:** info / warn / error? Öneri: warn (PLAN durduğu yok, sadece görünür).

---

## Kaynak Referansları

- **Pipeline kanıt:** `src/orchestra/task-builder.ts:986-1045` (buildWorkerPrompt), `src/orchestra/prompt-god-template.ts:73-120` (buildTaskPrompt), `prompt-god-template.ts:435-517` (renderTemplate)
- **Catalog kanıt:** `.deckent/agents/devops-engineer/{agent.json,PROMPT.md}`, `.deckent/agents/refactorer/{agent.json,PROMPT.md}`, `.deckent/skills/devops-engineer/{manifest.json,SKILL.md}`
- **Canlı prompt örnekleri:** Sprint 181-001 + 181-002 üretimi (Alperen kullanıcı paylaştı 2026-05-21)
- **Felsefe:** [[feedback-prompt-completeness-over-brevity]] (2026-05-21)
- **İlgili ADR:** ADR-048 Prompt Lifecycle Contract (amendment beklemede), ADR-041 Agent Taxonomy, ADR-053 TaskType Taxonomy
- **Sprint 181 retro:** `.brain/exports/memory.md` Sprint 181 W1-1 NO_GO entry (CI workflow primary fix incomplete)
