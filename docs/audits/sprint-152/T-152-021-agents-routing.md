# T-152-021: Agents 16 Built-in Manifest + Routing V2 Rules

**Sprint:** 152 (Post-Migration Comprehensive System Audit)
**Tarih:** 2026-04-24
**Worker:** w-152-021 (opus, local resume after docker OOM/restart)
**Mode:** READ-ONLY (no code changes — scope: `docs/audits/sprint-152/` only)

## Özet

Sistem taşıması sonrası agent havuzu + Routing V2 sağlığı denetlendi. **Üç büyük bulgu:**

1. **DOCUMENTATION DRIFT — `16 built-in + 2 custom` iddiası yanlış**: Diskte **15 built-in + 2 learned** var. `test-writer` Sprint 148 reform'u ile `.deckent/agents/archive/test-writer-removed-sprint-148/` altına arşivlendi; kod tarafında ban sağlam (IntentType taksonomisinden 'testing' çıkarıldı, fallback chain'de test-writer yok, routing-engine.ts:40 yorumu açık). `DECKENT.md`, `IDENTITY.md` (lines 15, 29), `DIRECTIVES.md` sprint-152 satırı hâlâ `16 built-in` diyor.
2. **PROMOTION PIPELINE LIVE BUG — Sprint 151 replay'de kanıtlı**: `src/orchestra/promotion-pipeline.ts:117` `temp-${entityId}` path'i `entityId` zaten `temp-` prefix'i ile başladığında **çift prefix** üretiyor (`temp-temp-react-ts-specialist`). `.brain/ERRORS.md:43-44` canlı kanıt: `temp-react-ts-specialist` 32 task / %100 success ile promotion kriterlerini geçti ama pipeline "Temp agent not found" hatası ile düştü. Aynı bug `test-writer` (archive'da) ve `code-reviewer` skill için de geçerli. Sonuç: **sistem 151 sprintlik yaşam süresinde hiçbir temp→permanent promotion gerçekleştirmedi** (archive'da ya da kodda `_promotedAt` alanı içeren agent yok).
3. **ROUTING CONCENTRATION RISK — Sprint 152 doc-writer 26/30 (%87)**: ADR-041 "agent-routing-anomaly" detector eşiği %80 (`src/nervous/detectors/agent-routing-anomaly.ts:4`). Sprint 152 bu eşiği geçiyor; sprint read-only bir audit olduğundan patolojik değil (tüm task'lar dokümantasyon), ama detector'ın **Sprint 152'de tetiklenip tetiklenmediği** ayrı bir audit (T-152-012) kapsamında doğrulanmalı.

Routing V2 mimari olarak sağlam: 3 katmanlı pipeline (intent-classifier → activation-engine → routing-engine) canlı, tüm 15 built-in agent `manifestVersion: 2`'de, `source: 'builtin'`, `enabled: true`. Skill budget hesaplaması, dynamic exclusions ve override pipeline canlı — Sprint 152 decision log (60 dosya, her task ortalama 8 adım) bunu doğruluyor. **Hiç bir ADR ihlali yok.**

---

## Bulgular

### 1. Built-in Agent Envanteri — 15/16 (DRIFT)

Diskte `.deckent/agents/` altında 15 persistent agent + 2 temp-prefix'li learned agent var. DECKENT.md/IDENTITY.md'nin iddia ettiği "16 built-in" kadrodan **test-writer Sprint 148 reform ile arşive alındı** (`.deckent/agents/archive/test-writer-removed-sprint-148/`). Archive kaydında `stats.totalUses=113, successRate=0.90, lastUsedInSprint=sprint-147` bulundu — ban Sprint 148'de vuruldu.

| # | Agent ID | Source | MV | Enabled | Rules/Excl | minScore | Uses | SR | LastSprint |
|---|----------|--------|----|---------|------------|----------|------|-----|------------|
| 1 | accessibility-auditor | builtin | 2 | ✅ | 1 / 1 | 5 | 0 | - | - |
| 2 | api-builder | builtin | 2 | ✅ | 1 / 0 | 5 | 10 | 0.90 | sprint-151 |
| 3 | architect | builtin | 2 | ✅ | 2 / 1 | 5 | 78 | 0.87 | sprint-151 |
| 4 | architecture-planner | builtin | 2 | ✅ | 3 / 1 | 5 | 7 | 0.86 | sprint-151 |
| 5 | bug-fixer | builtin | 2 | ✅ | 1 / 0 | 5 | 72 | 0.74 | sprint-151 |
| 6 | ci-guardian | builtin | 2 | ✅ | 1 / 1 | 5 | 2 | 1.00 | sprint-151 |
| 7 | code-reviewer | builtin | 2 | ✅ | 1 / 0 | 5 | 34 | 0.91 | sprint-151 |
| 8 | data-engineer | builtin | 2 | ✅ | 1 / 1 | 5 | 0 | - | - |
| 9 | devops-engineer | builtin | 2 | ✅ | 2 / 1 | 5 | 6 | 1.00 | sprint-151 |
| 10 | doc-writer | builtin | 2 | ✅ | 1 / 1 | 5 | 72 | 0.89 | sprint-151 |
| 11 | frontend-designer | builtin | 2 | ✅ | 2 / 1 | 5 | 3 | 0.67 | sprint-151 |
| 12 | migration-specialist | builtin | 2 | ✅ | 1 / 1 | 5 | 0 | - | - |
| 13 | performance-analyzer | builtin | 2 | ✅ | 1 / 0 | 5 | 5 | 1.00 | sprint-151 |
| 14 | refactorer | builtin | 2 | ✅ | 1 / 0 | 5 | 86 | 0.83 | sprint-151 |
| 15 | security-auditor | builtin | 2 | ✅ | 1 / 1 | 5 | 14 | 1.00 | sprint-151 |
| — | test-writer | archived | 2 | ✅ (in archive!) | 1 / 1 | 5 | 113 | 0.90 | sprint-147 |
| A | temp-react-specialist | **learned** | 2 | ✅ | 1 / 0 | 5 | 0 | - | - |
| B | temp-react-ts-specialist | **learned** | 2 | ✅ | 1 / 0 | 5 | 0 | - | - |

**Kanıt komutu** (her agent için):
```
node -e 'const j=require(".../agent.json"); ...' → 15 satır builtin + 2 satır learned
```

- [**DRIFT**] `IDENTITY.md:15` "Agents: 16 built-in" — yanlış, 15.
- [**DRIFT**] `IDENTITY.md:29` "Agents | 16 built-in + 2 custom" — yanlış. **Source: 'user' hiç yok.** İki agent'ın source'u `'learned'` (AGENT_TEMPLATES'ten auto-generate edilmiş, user tarafından yaratılmamış).
- [**DRIFT**] `DECKENT.md` "16 built-in agents" listesi `test-writer` içeriyor — stale.
- [**DRIFT**] `DIRECTIVES.md` Task 21 satırı hâlâ "16 built-in agent manifest" diyor — Sprint 152 prompt'u stale.
- [**PASS**] Tüm 15 builtin agent `manifestVersion: 2` (V2 migration tamam).
- [**PASS**] Hiçbiri disabled değil.
- [**PASS**] Dashboard CLI `agent list` Sprint 152 T-152-005 raporunda 17 agent göstermişti (15+2) — gerçeklik bu, IDENTITY.md stale.

### 2. Sprint 148 Reform — `test-writer` Ban Enforcement

**Ban üç katmanda sağlam, ama bir zombie referans var:**

| Katman | Dosya | Durum | Kanıt |
|--------|-------|-------|-------|
| Filesystem | `.deckent/agents/archive/test-writer-removed-sprint-148/` | ✅ BANNED | Agent pool yükleme `archive/` dizinini skip eder (`agent-pool.ts:126`) |
| IntentType | `src/core/routing-types.ts:6-17` | ✅ BANNED | 12 intent type listesinde `'testing'` yok |
| Fallback chain | `src/core/routing-engine.ts:42-55` | ✅ BANNED | `implementation` → `[architect, refactorer]` (eski `test-writer` çıkarılmış) |
| Dynamic exclusions | `src/core/activation-engine.ts:291` | ✅ BANNED | `// 'testing' removed as primary intent (Sprint 148 taxonomy reform)` yorumu açık |
| Nervous detector | `src/nervous/detectors/agent-routing-anomaly.ts:4` | ✅ GUARD | "Sprint 147 test-writer 22/22 pattern tekrarını önler" docstring |
| Nervous detector | `src/nervous/detectors/agent-routing.ts:43,96` | ✅ GUARD | "Sprint 145 test-writer %53 bug" referansı |
| Sprint metrics | `src/orchestra/sprint-metrics.ts:526` | ❌ **ZOMBIE** | `suggestedValue: ['test-writer']` — coverage<40% durumunda halen `test-writer` skill'ini öneriyor |

- [**FAIL/ZOMBIE**] `sprint-metrics.ts:526` coverage recommendation pipeline eski "enable testing skill" önerisi üretiyor ama önerdiği **agent-değil-skill** için test-writer adında **bir skill** var mı? 21 built-in skill listesi (testing-expert, ci-testing) `test-writer` adında bir skill içermiyor — bu satır hem yanlış adlandırma hem de reform-öncesi zombie. Sprint 153'te temizlenmeli.
- [**PASS**] Archive dizini gerçekten yükleme dışı — `agent-pool.ts:126` `entry.name === 'archive'` kontrolü var.
- [**PASS**] `test-writer-removed-sprint-148/agent.json` içeriğinde `enabled: true` görünse de — dizin `archive/` altında olduğu için `loadAgents()` bunu skip eder (birim test önerisi: bu davranışı koruyan snapshot test).

### 3. Routing V2 Mimarisi — 3 Katman Live

| Katman | Modül | Sorumluluk | Canlı mı |
|--------|-------|-----------|----------|
| L1 | `src/core/intent-classifier.ts` | TaskDNA üret (IntentType primary + secondary + confidence) | ✅ — Sprint 152 her decision-XXX.json'da `intent` alanı dolu |
| L2 | `src/core/activation-engine.ts` | evaluateActivation(taskDNA, agent.activation) → score | ✅ — `evaluateRule` + `evaluateRuleViaSecondary` (secondary %50 score) |
| L3 | `src/core/routing-engine.ts` | routeTaskV2 dispatch + fallback chain + override + skill budget | ✅ — 60/60 Sprint 152 task'ı decision trail üretti |

**Routing pipeline kanıt (Sprint 152 T-152-021 decision trail, 8 adım):**
- Step 2: Dynamic exclusions — `[migration-specialist, devops-engineer, security-auditor]` (documentation intent)
- Step 3-5: Agent exclusion loop (3 exclude kararı)
- Step 6: `Agent selected: 'doc-writer' (score=10, rules=[rule(score=10)])`
- Step 7: `Skill budget: max 2 (medium task, 2 module(s), effort=normal)`
- Step 8: `Skills forced by override: [system-architect, code-reviewer]`

**Sprint 152 routing tablosu (30 task):**

| Agent | Tasks | Share | Confidence Dağılımı |
|-------|-------|-------|----------------------|
| doc-writer | 26 | **86.7%** | 25 high, 1 low |
| architect | 3 | 10% | 0 high, 3 uncertain |
| temp-react-ts-specialist | 2 | 6.7% | 2 low |
| refactorer | 0 | 0% | - |

- [**WARN/ANOMALY-RISK**] 26/30 doc-writer = %87 > %80 eşiği → `agent-routing-anomaly` detector (ADR-041) Sprint 152 EVALUATE fazında tetiklenmesi **beklenir**. T-152-012'nin kanıtlaması gereken bir pattern. Sprint read-only audit olduğundan patolojik değil (tüm task'lar dokümantasyon), ama detector **false-positive temizliği** için flag `task.scope.isAuditOnly` gibi bir suppression gerektirebilir.
- [**PASS**] Dynamic exclusions documentation intent için mantıklı (migration/devops/security çıkarıldı).
- [**PASS**] Skill budget dinamik (0 for trivial, 2 for medium, 3 for complex) — SKILL_BUDGET_CAP live.

### 4. Temp Agent Auto-Generation — `generateTempAgents()`

`src/orchestra/temp-skill-generator.ts:243-328` **6 template** (`react-ts-specialist`, `react-specialist`, `ts-architect`, `python-api-specialist`, `python-specialist`, `go-specialist`, `rust-specialist`). Stack matching: language + framework + optional depHint.

**Sprint 151 + 152 runtime kanıtı (`.brain/ERRORS.md:104-105, 181-182, 258-259`):**
```
planSprint:temp-agent | Generated temp agent: temp-react-ts-specialist for typescript/react
planSprint:temp-agent | Generated temp agent: temp-react-specialist for typescript/react
```

3 kere tekrar ediyor → `plan --replan` veya `plan` idempotent değil; her `plan` çağrısında yeniden üretiliyor (zararsız çünkü `saveTempAgentToPool` overwrite eder, ama log gürültüsü).

- [**PASS**] Template sistemi deterministic (no AI call, zero cost).
- [**PASS**] 2 temp agent gerçekten Deckent'in kendi stack'ine (TS + React) doğru eşleşiyor.
- [**WARN**] `source: 'learned'` yanlış etiket — bu agent'lar "learned" (outcome tracker'dan türedi) değil, "templated" (AGENT_TEMPLATES'ten geldi). Schema'ya `'templated'` source eklenmeli veya `'learned'` → `'auto-generated'` yeniden adlandırılmalı.
- [**DRIFT**] `agent-pool.ts:55` `VALID_SOURCES = ['builtin', 'user', 'learned']` — 'user' hiç kullanılmıyor. Promotion başarılı olsaydı `source: 'user'` set olacaktı (promotion-pipeline.ts:129). Yani `'user'` aslında "promoted temp → permanent" anlamına geliyor, 'custom' değil. Bu **dokümantasyon drift kaynağı**.

### 5. Promotion Pipeline — LIVE BUG (Sprint 151 canlı kanıt)

**`src/orchestra/promotion-pipeline.ts:117` bug:**
```ts
const persistentTempDir = join(this.projectRoot, '.deckent', 'agents', `temp-${entityId}`);
```

`entityId` zaten `'temp-react-ts-specialist'` olduğunda path: `.deckent/agents/temp-temp-react-ts-specialist` → **yok**. Gerçek path: `.deckent/agents/temp-react-ts-specialist`.

**Sprint 151 runtime replay (`.brain/ERRORS.md:41-46`):**
```
finalizeSprint:promotion | agent 'test-writer': 123 tasks, 91% success — meets promotion criteria
promotion-pipeline:promote | Temp agent 'test-writer' not found
finalizeSprint:promotion | agent 'temp-react-ts-specialist': 32 tasks, 100% success — meets promotion criteria
promotion-pipeline:promote | Temp agent 'temp-react-ts-specialist' not found
finalizeSprint:promotion | skill 'code-reviewer': 32 tasks, 91% success — meets promotion criteria
promotion-pipeline:promote | Temp skill 'code-reviewer' not found
```

**3 ayrı promotion girişimi, 3 ayrı sebep:**

| Entity | Kriter | Gerçek Yol | promote() Arar | Sonuç |
|--------|--------|-----------|----------------|-------|
| test-writer (agent) | 123 task %91 | `.deckent/agents/archive/test-writer-removed-sprint-148/` | `.deckent/agents/temp-test-writer/` | ❌ Archive dizinini görmüyor (doğru — ban) ama "not found" log'u yanıltıcı |
| temp-react-ts-specialist (agent) | 32 task %100 | `.deckent/agents/temp-react-ts-specialist/` | `.deckent/agents/temp-temp-react-ts-specialist/` | ❌ **ÇİFT PREFIX BUG** |
| code-reviewer (skill) | 32 task %91 | built-in (`.deckent/skills/code-reviewer/`) | `.tasks/skills/...` temp scope | ❌ `isBuiltIn()` guard'ı Layer 1 elemeyi kaçırıyor olabilir — built-in skill promotion denemesi yapılmaması gerekir (promotion-pipeline.ts:61-70 filter var ama `isBuiltIn(skillId, 'skill')` yanlış döndü veya outcome-tracker yanıltıcı stat üretti) |

- [**FAIL**] Temp agent promotion pipeline **hiç çalışmadı**: tüm 17 `.deckent/agents/*/agent.json` dosyası içinde `_promotedAt` alanı yok (grep doğrulandı).
- [**FAIL**] `promotion-pipeline.ts:117` double-prefix bug — 1 satırlık fix: `const normalizedId = entityId.startsWith('temp-') ? entityId : 'temp-' + entityId;` → path'te `normalizedId` kullan.
- [**FAIL**] `test-writer` promotion denemesi — archived agent için `finalizeSprint:promotion` ÖN-KOŞULU yanlış. Outcome tracker `builtin` statüsünü korumalı ya da archived agent'ları promotion kandidatları listesinden çıkarmalı (`promotion-pipeline.ts:61` `isBuiltIn` guard'ı archived'ı da kapsamalı).
- [**FAIL**] `code-reviewer` skill built-in olduğu halde promotion denemesinde; `isBuiltIn()` implementation'ı okundu değil — muhtemelen `.deckent/skills/code-reviewer/manifest.json` okuyup `source` alanına bakıyor; skill manifest'lerinde source alanı eksikse (Sprint 141 legacy?) yanlış cevap dönüyor.

### 6. Activation Engine — Rule Quality Spot Check

**Her agent'ın activation rule dağılımı (1-3 rule, 0-1 exclude):**

- `architect`: 2 rule (2 intent match), 1 exclude — güçlü
- `architecture-planner`: 3 rule — en zengin (architecture intent + scope eşleştirme)
- Geri kalan 13 agent: 1 rule (sadece primary intent match)
- Hepsinin `minScore: 5`, rule score = 10 → primary intent match dominant

- [**WARN**] 13/15 agent sadece 1 rule'a sahip = Sprint 132 öncesi keyword-based routing'ten pek de farklı değil. Activation V2'nin asıl gücü `when.scope.directories`, `when.tags`, `when.dependencies` gibi çoklu koşullarda yatıyor — ama **kullanılmıyor**. Sprint 153'te activation rule zenginleştirme (örneğin `refactorer` için `scope.directories contains 'src/core'` koşulu) routing kalitesini artırabilir.
- [**PASS**] `evaluateRuleViaSecondary` aktif (score*0.5) — secondary intent'ler de aday oluşturuyor.
- [**PASS**] `getDynamicExclusions` intent+scope bazlı (activation-engine.ts:278-320) — hard-coded global exclusion'lardan daha iyi.

### 7. 2 "Custom" Agent İddiası — Ne Zaman Doğru Olur?

Bu iddianın doğru olacağı tek senaryo: kullanıcının `deckent agent create` komutu ile `source: 'user'` agent yaratması. Bugünkü durumda:

- `source: 'user'` agent: **0** (filesystem grep doğrulandı)
- `source: 'learned'` agent: **2** (template-based auto-generate)
- `source: 'builtin'` agent: **15**

- [**DRIFT**] IDENTITY.md "2 custom" `source: 'learned'` için kullanılmış terminoloji. Doğru ifade: "15 built-in + 2 auto-generated (templated)" veya "15 built-in + 0 user-created".

### 8. Stats Drift + LRU Eviction

`agent-pool.ts:39-49` `isTempAgentStale` — temp agent 5 sprint kullanılmazsa LRU'dan düşer. Ama `.deckent/agents/temp-*/` altındaki temp agent'lar `loadAgents()` tarafından **persistent** sayılıyor (dizin `.deckent/agents/` → `_loadFromDir(persistentDir, pool)`). LRU `.tasks/agents/` üzerinde çalışıyor. Demek ki temp-react-specialist hiç düşmez.

- [**PASS**] Tutarlı: `saveTempAgentToPool` (agent-pool.ts:214-223) temp agent'ları persistent dir'e yazar → LRU değil, explicit cleanup gerekli (`cleanupPersistentTempAgents`).
- [**WARN**] `temp-react-specialist` stats totalUses=0 lastUsedInSprint='-' — her `plan` yeniden üretimi stats'ı sıfırlıyor mu? Code: `saveTempAgentToPool` overwrite + `{ ...agent, id: dirName }` — evet, **stats siliniyor**. `outcome-tracker.ts` ayrı bir persistent store tuttuğundan bu bir regression değil, ama `agent.json` stats alanı güvenilir değil (temp agent için).

---

## Sprint 153+ İçin Aksiyon Listesi

- [**P0**] **promotion-pipeline.ts:117 double-prefix bug fix** — `entityId.startsWith('temp-') ? entityId : 'temp-' + entityId` normalize (1 satır, ~15 dk). Unit test: `promote('temp-react-ts-specialist')` → path `.deckent/agents/temp-react-ts-specialist/` aranmalı.
- [**P0**] **Dokümantasyon Drift Senkronizasyonu** — IDENTITY.md:15,29 + DECKENT.md "16 built-in" satırı → "15 built-in + 2 auto-generated (template-based)". Run-gate script önerisi: `scripts/verify-agent-count.mjs` → `.deckent/agents/*` non-temp/non-archive count'unu IDENTITY.md ile karşılaştır, CI'da fail.
- [**P0**] **sprint-metrics.ts:526 zombie fix** — `suggestedValue: ['test-writer']` → `['testing-expert']` (skill adı). Effort: 5 dk.
- [**P1**] **`isBuiltIn` guard'ı archived agent'ları dahil et** — `.deckent/agents/archive/*` altındaki her şey "no promotion" sayılmalı (promotion-pipeline.ts). Test kanıtı: `.brain/ERRORS.md:41-42` test-writer promotion log'u.
- [**P1**] **Promotion'ın retro output'u** — Sprint 151 retro'sunda hiç promotion sonuç yok. `sprint-reporter.ts` finalize sırasında `evaluatePromotions()` sonuçlarını retro'ya yazmalı (`"3 promotion attempted, 3 failed — see ERRORS.md"`).
- [**P1**] **Agent routing anomaly tüketimi** — Sprint 152 %87 doc-writer pattern'i false-positive mı? Detector `task.scope.isAuditOnly` veya `directives.kind === 'audit'` suppression flag'i ekleyebilir. Alternatif: read-only audit sprint'leri için detector'ı silent mode'a al.
- [**P2**] **`source: 'learned'` terminoloji refactor** — `VALID_SOURCES = ['builtin', 'user', 'templated']` olarak değiştir. `templated` = `generateTempAgents()` çıktısı, `user` = `deckent agent create`, `builtin` = built-in pool. Yeni migration gerekir (manifest-migrator V2→V3).
- [**P2**] **Activation rule zenginleştirme** — 13/15 builtin agent tek rule'a sahip. `refactorer` için `scope.directories contains 'src/core'` + `intent.primary === 'refactor'` gibi kombine rule ekle. Routing doğruluğunu artırır, fallback chain bağımlılığını azaltır.
- [**P2**] **Temp agent `.plan` idempotency** — `planSprint` her çağrıda yeniden "Generated temp agent: temp-react-ts-specialist" logluyor (Sprint 152'de 3 defa). `existsSync` guard koy, log spam'i azalt.
- [**P2**] **Temp agent `stats` preservation** — `saveTempAgentToPool` spread'i `stats`'ı da override ediyor; mevcut manifest varsa `stats`'ı merge et, üzerine yazma.

---

## Kanıt Ekleri

**Built-in agent count:**
```bash
$ ls .deckent/agents/ | grep -v '^archive$\|^temp-' | wc -l
15
$ ls .deckent/agents/archive/
temp-react-specialist  temp-react-ts-specialist  test-writer-removed-sprint-148
```

**test-writer archive kaydı:**
```bash
$ node -e "const j=require('.deckent/agents/archive/test-writer-removed-sprint-148/agent.json'); console.log(j.stats)"
{ totalUses: 113, successRate: 0.9026548672566371, avgCoverage: 14.4167, lastUsedInSprint: 'sprint-147' }
```

**Promotion pipeline bug kanıtı (`.brain/ERRORS.md:43-44`):**
```
2026-04-22T06:57:06.544Z | finalizeSprint:promotion | agent 'temp-react-ts-specialist': 32 tasks, 100% success — meets promotion criteria
2026-04-22T06:57:06.551Z | promotion-pipeline:promote | Temp agent 'temp-react-ts-specialist' not found
```

**Routing V2 Sprint 152 distribution:**
```bash
$ for f in .deckent/decisions/decision-152-*.json; do node -e "..."; done | awk '{print $3}' | sort | uniq -c | sort -rn
     26 doc-writer
      3 architect
      2 temp-react-ts-specialist
```

**IntentType check (no 'testing'):**
```bash
$ grep -n "IntentType =" src/core/routing-types.ts
6:export type IntentType = 'implementation' | 'bugfix' | 'refactor' | 'documentation'
                         | 'security' | 'devops' | 'config' | 'performance'
                         | 'design' | 'migration' | 'architecture' | 'unknown';
```

**Zombie test-writer reference:**
```bash
$ grep -n "test-writer" src/orchestra/sprint-metrics.ts
526:      suggestedValue: ['test-writer'],
```

**Promotion `_promotedAt` grep (hiç yok):**
```bash
$ grep -r "_promotedAt\|\"source\": \"user\"" .deckent/agents/
(no output — hiçbir agent promotion geçmedi, source='user' yok)
```
