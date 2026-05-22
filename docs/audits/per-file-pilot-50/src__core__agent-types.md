# Audit — `src/core/agent-types.ts`

> Per-file audit (Sprint 187 / 50-task pilot — actually executing as Sprint 186 task 186-029).
> Source line count: **97 LoC** (pure type module + 2 factory helpers; zero side-effects on load).

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/core/agent-types.ts` |
| LoC (raw) | 97 |
| Effective LoC (non-comment, non-blank) | ~70 |
| File kind | Type definitions + small factory helpers (`core/` layer) |
| Created | Pre-Sprint 100 (Agent Pool foundation, exact origin sprint not tracked) |
| Last semantic change | Sprint 128–130 era — `manifestVersion` and `activation` fields added when V2 routing (ADR-028) landed |

### Exports

| Symbol | Kind | Purpose |
|--------|------|---------|
| `AgentStats` | interface | Per-agent telemetry (uses count, success rate, coverage, lastUsedInSprint) |
| `AgentDefinition` | interface | Full agent manifest record (id/name/prompt/triggers/stats + v1/v2 routing union) |
| `AgentPool` | type alias | `Map<string, AgentDefinition>` — runtime agent registry |
| `AgentSelectionResult` | interface | `selectAgent()` return shape (agent + score + reason) |
| `MultiAgentPipelineStep` | interface | `{ agentId, phase }` — pipeline step record |
| `createDefaultStats()` | function | Returns zeroed `AgentStats` (totalUses=0, successRate=0, avgCoverage=0, lastUsedInSprint='') |
| `createAgentDefinition(partial)` | function | Builds `AgentDefinition` with sensible defaults; requires only `id` and `name` |

### Imports

| Specifier | Kind | Purpose |
|-----------|------|---------|
| `./types.js` | type-only (`ModelType`) | Constrains `AgentDefinition.preferredModel` |
| `./routing-types.js` | type-only (`ActivationConfig`) | Constrains `AgentDefinition.activation` (V2 routing) |

Both imports are `import type` (compile-time only). Zero runtime side-effects on module load — module is pure declaration + two pure functions.

### Reverse dependencies

`grep -rEn "from ['\"].*core/agent-types"` summary:

- **`src/` consumers (6 files):** `orchestra/temp-skill-generator.ts`, `orchestra/mid-sprint-adapter.ts`, `orchestra/brain-context.ts`, `orchestra/decision-steps/scope-step.ts`, `orchestra/decision-steps/agent-step.ts`. (One file may import multiple symbols; module count = 5 distinct modules + the orchestra index re-exports.)
- **`tests/` consumers (~22 files):** `tests/core/agent-types.test.ts` (own type test), `tests/core/agent-pool.test.ts`, `tests/core/agent-selector.test.ts`, `tests/core/ci-guardian.test.ts`, `tests/core/manifest-migrator.test.ts`, `tests/core/routing-engine.test.ts`, `tests/orchestra/decision-replay.test.ts`, `tests/orchestra/mid-sprint-adapter.test.ts`, `tests/orchestra/agent-routing-health.test.ts`, `tests/orchestra/decision-steps/*`, `tests/orchestra/brain-agent.test.ts`, `tests/orchestra/brain-context.test.ts`, `tests/orchestra/agent-override-semantic-check.test.ts`, `tests/orchestra/routing-v2-e2e.test.ts`, `tests/orchestra/agent-activation.test.ts`, `tests/orchestra/decision-engine.test.ts`, `tests/integration/project-types/{python-fastapi,typescript-react,monorepo}.test.ts`, `tests/integration/{decision-engine,full-sprint-e2e,error-recovery}.test.ts`.

Per-symbol concentration:
- `createAgentDefinition` — used in ~20 test files (test fixture builder, primary API surface).
- `AgentDefinition` / `AgentPool` — type imports across orchestra and tests.
- `AgentSelectionResult` — imported by `orchestra/decision-steps/agent-step.ts` (single src/ consumer).
- `AgentStats` — imported transitively (via `AgentDefinition.stats`); only `tests/core/agent-types.test.ts` imports it by name.
- `MultiAgentPipelineStep` — defined here, used **only** by `tests/core/agent-types.test.ts` (its own type-shape test). **No `src/` consumer.**
- `createDefaultStats` — imported by `tests/core/routing-engine.test.ts`, `tests/orchestra/agent-activation.test.ts`, and indirectly via `createAgentDefinition`'s default.

---

## 2. Bağlam (Architectural Context)

`src/core/agent-types.ts` Deckent'in **agent pool foundation** modülüdür: `AgentPoolManager` (`src/core/agent-pool.ts`), task routing (`src/core/agent-selector.ts`, `src/core/routing-engine.ts`), V2 routing aktivasyon motoru (`src/core/activation-engine.ts`) ve orchestra katmanı (Brain agent selection, decision-steps, mid-sprint adapter) bu modülün ihraç ettiği tiplere yaslanır.

ADR ilişkileri:

- **ADR-008 (Brain merkezi import — tek yönlü bağımlılık):** `core/` katmanı `orchestra/`'dan veya `agents/`'dan import edemez. Bu dosya kuralı **harfi harfine** uygular — yalnızca aynı katmandaki iki `./types.js`, `./routing-types.js` modülünden type-import alır. `orchestra/temp-skill-generator`, `orchestra/brain-context` vb. *bu dosyaya* import eder; akış doğru yönde (orchestra → core).
- **ADR-028 (Decision-Engine V1 → V2 Routing Migration):** `manifestVersion?: 1 | 2` ve `activation?: ActivationConfig` alanları bu migration için eklendi. Manifest V1 → V2 geçişini `src/core/manifest-migrator.ts` yönetir; dual-mode (`triggerKeywords`/`triggerScopes` vs `activation`) bilinçli olarak burada birlikte tutuluyor — V2 mevcutsa V1 alanları yok sayılıyor.
- **ADR-029 / ADR-030 / ADR-032 (Managed-Docs):** Doğrudan ilgisi yok; agent manifest sistemi managed-docs konfigürasyonundan ayrı.
- **ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents):** `AgentDefinition.expertise: string[]` ve `triggerKeywords/triggerScopes/triggerFilePatterns` bu taksonomi kararının veri modelini taşır. Skills tarafı `src/core/skill-pool.ts` benzer şekilde paralel tip dosyasına sahiptir.
- **ADR-046 (Brain Self-Update Hook Architecture):** `stats.lastUsedInSprint` ve `enabled`/`persistent` alanları LRU eviction + sprint sonu finalize tarafından mutate edilir; bu manifest immutable değildir.

Mimari rol özeti: Bu dosya **agent pool için tip kontratıdır**. Davranış kodu içermez; yalnızca tip tanımları + iki guaranteed-deterministic factory function. Birim test boyutu (`tests/core/agent-types.test.ts` — 250+ satır) bu kontratın projedeki ağırlığını yansıtır.

---

## 3. Debt Risk

| ID | Risk | Severity | Likelihood | Impact |
|----|------|----------|------------|--------|
| D-1 | `MultiAgentPipelineStep` interface defined but no `src/` consumer — only its own type test references it (dead export) | 🟡 MEDIUM | HIGH (kanıtlandı) | YAGNI; if removed, only test rewrite needed |
| D-2 | Numeric range constraints in comments only (`successRate: number; // 0.0-1.0`, `avgCoverage: number; // 0-100`, `effortMultiplier: number; // 0.1-3.0`) — runtime/structural type-check yok; out-of-range değerler sessizce kabul edilir | 🟠 HIGH | MEDIUM | Stats drift, scoring math bozukluğu (skill-pool benzer pattern'i Sprint 125'te yaşadı) |
| D-3 | `manifestVersion` `1 \| 2` literal union ama V1 ve V2 alanlarının **birlikte var olması** branding ile compile-time ayrılmamış — V2 manifest'te yanlışlıkla doldurulmuş V1 `triggerKeywords` sessizce yok sayılabilir | 🟡 MEDIUM | MEDIUM | Routing surprise; manifest-migrator tarafından temizleniyor ama tip seviyesinde garanti yok |
| D-4 | `source: 'builtin' \| 'user' \| 'learned'` literal union ama factory default `'user'` — built-in agent oluşturulurken her seferinde manuel override gerekiyor; unutulursa pool'da yanlış kategorize edilir | 🟢 LOW | MEDIUM | Sınıflandırma kirliliği; LRU eviction yanlış seçim yapabilir |
| D-5 | `allowedTools` / `deniedTools` `string[]` — şeması yok (örn. `'Bash'`, `'mcp__claude_ai__*'` gibi enum sayım yok); typo'lar yakalanmıyor | 🟡 MEDIUM | MEDIUM | Permission-guard runtime'da `unknown tool` sessizce drop edebilir |
| D-6 | `AgentStats.lastUsedInSprint: string` — boş string default ile başlıyor; `''` "hiç kullanılmadı" sinyali olarak kullanılıyor (sentinel pattern, `null` yerine) | 🟢 LOW | LOW | Tarih comparator'ları boş string'i lexicographic minimum sayar — şu an doğru çalışıyor ama brittle |
| D-7 | `effortMultiplier` default `1.0` (sayı) — `Partial<AgentDefinition>` spread sırasında `0` geçirilirse JavaScript falsy nedeniyle değil ama explicit override semantiğiyle kabul edilir; sınır kontrolü yok | 🟢 LOW | LOW | Edge case; learned agent loop bunu hatalı set ederse routing skoru sıfırlanır |
| D-8 | `triggerKeywords` / `triggerScopes` / `triggerFilePatterns` üç ayrı `string[]` — overlap semantiği belirsiz (OR mu AND mı?). `activation-engine.ts` yorumu yapıyor ama tip seviyesinde dokümante değil | 🟡 MEDIUM | MEDIUM | Manifest yazan kullanıcı V1 davranışını yanlış varsayabilir |

Toplam: 8 risk maddesi (1 HIGH likelihood dead export, 1 HIGH severity numeric drift, 3 MEDIUM, 3 LOW).

---

## 4. Dead Code Candidates

**`MultiAgentPipelineStep` — kesin dead export.** Kanıt:

```bash
$ grep -rEn "MultiAgentPipelineStep" src/ tests/
src/core/agent-types.ts:53:export interface MultiAgentPipelineStep {
tests/core/agent-types.test.ts:11:  MultiAgentPipelineStep,
tests/core/agent-types.test.ts:238:// ─── MultiAgentPipelineStep type ─────────────────────────────────────────────
tests/core/agent-types.test.ts:240:describe('MultiAgentPipelineStep type', () => {
tests/core/agent-types.test.ts:242:    const step: MultiAgentPipelineStep = {
tests/core/agent-types.test.ts:251:    const pipeline: MultiAgentPipelineStep[] = [
```

Hiçbir `src/` modülü `MultiAgentPipelineStep` import etmez. Yalnızca kendi type-shape test'i tarafından tüketiliyor — bu klasik *test-only dead export* pattern'idir (silinen multi-agent pipeline tasarımının kalıntısı; pipeline runtime hiçbir zaman implemente edilmedi).

**Sprint 188 önerisi:** `MultiAgentPipelineStep`'i sil, `tests/core/agent-types.test.ts:238-263` arası testi de kaldır. `tsc --noEmit` + `vitest run` regresyon beklenmiyor.

Diğer semboller canlı:

```bash
# AgentSelectionResult: 1 src/ consumer
$ grep -rEn "AgentSelectionResult" src/ tests/ | head
src/core/agent-types.ts:45:export interface AgentSelectionResult {
src/orchestra/decision-steps/agent-step.ts:10:import type { AgentPool, AgentSelectionResult } from '../../core/agent-types.js';
# (+ tests)

# createDefaultStats: kullanımda
$ grep -rEn "createDefaultStats" src/ tests/ | wc -l
# ~5 satır (factory default + 3 test dosyası)

# createAgentDefinition: ana fixture builder
$ grep -rEn "createAgentDefinition" src/ tests/ | wc -l
# 30+ satır
```

`createDefaultStats`, `createAgentDefinition`, `AgentDefinition`, `AgentPool`, `AgentStats`, `AgentSelectionResult` hepsi aktif kullanımda — silinmemeli.

---

## 5. Documentation Gaps

| Gap | Açıklama | Önerilen Aksiyon |
|-----|---------|------------------|
| G-1 | Dosya header yok — sadece `// ─── Agent Pool Types ───` separator var; modülün rolü (agent pool tip kontratı, ADR-008/028/041 referansı) yazılı değil | TSDoc `@module` header ekle: amaç + ilgili ADR'ler + yan modüller (`agent-pool.ts`, `agent-selector.ts`, `routing-engine.ts`, `activation-engine.ts`, `manifest-migrator.ts`) |
| G-2 | `AgentStats` alan açıklamaları yorum-iç (`// 0.0-1.0`, `// 0-100`) — TSDoc değil; IDE tooltip'inde gözükmez | TSDoc per-field: `/** Success rate, range 0.0–1.0 inclusive. */` |
| G-3 | `AgentDefinition.manifestVersion` ve `activation` alanları arasındaki **V1/V2 dual-mode kontratı** TSDoc'ta yok; `manifest-migrator.ts`'a güvenmek gerekiyor | TSDoc'a "If `manifestVersion === 2`, `triggerKeywords`/`triggerScopes`/`triggerFilePatterns` are ignored; use `activation` instead. See ADR-028." ekle |
| G-4 | `triggerKeywords` vs `triggerScopes` vs `triggerFilePatterns` evaluation semantiği (OR/AND, weighting) burada yok | TSDoc'a "OR-semantics across all three; weighted by `activation-engine.ts`. See ADR-028." veya `routing-types.ts` link |
| G-5 | `source: 'builtin' \| 'user' \| 'learned'` enum semantiği belirsiz: 'learned' ne zaman atanır? (promotion-pipeline) | TSDoc: "builtin = ship içinde tanımlı, user = `.deckent/agents/` manifest, learned = promotion-pipeline tarafından temp→permanent yükseltilmiş" |
| G-6 | `persistent` vs `enabled` farkı dokümante değil — `enabled=false` ne anlama gelir? (geçici disable mi, kalıcı mı?) | TSDoc: `enabled` = runtime kullanılabilir, `persistent` = LRU eviction'a karşı korumalı |
| G-7 | `createAgentDefinition` factory'nin **`source: 'user'` default ile çağrıldığında built-in agent oluşturulamayacağı** uyarısı yok — sayısız test fixture bu nedenle `source: 'builtin'` override ediyor | TSDoc'a `@remarks` notu: built-in için `source: 'builtin'` override gerekli |
| G-8 | `MultiAgentPipelineStep` ne için tanımlanmış — TSDoc yok, kullanıldığı yer yok (D-1 ile birleşik) | Sil (R-1 önerisi) veya `@deprecated since Sprint NN — multi-agent pipeline not implemented` etiketle |

---

## 6. ADR Compliance Check

| ADR | Maddesi | Compliance | Not |
|-----|---------|-----------|-----|
| ADR-001 (TypeScript + ESM) | `.ts`, ESM, `import type` ayrıca kullanılmış | ✅ PASS | İdeal pattern — type-only import ile runtime cost yok |
| ADR-002 (Node16 module resolution) | `./types.js`, `./routing-types.js` uzantısı kullanılmış | ✅ PASS | ESM uzantı kuralına uyumlu |
| ADR-006 (spawnSync security pattern) | N/A (I/O yok) | ➖ N/A | Pure type module |
| ADR-008 (Brain merkezi import — tek yönlü) | `core/agent-types` yalnızca aynı katmandan import alıyor; orchestra/agents'a bağımlı değil | ✅ PASS | `agents/`-yön akışı tersine değil — diğer katmanlar bu dosyayı tüketiyor |
| ADR-009 (DEBT.md markdown tablo formatı) | N/A | ➖ N/A | Bu dosya markdown üretmiyor |
| ADR-010 (Tek runtime dependency — commander) | Hiç dep import yok | ✅ PASS | Type module |
| ADR-028 (Decision-Engine V1 → V2 Routing Migration) | `manifestVersion`, `activation` alanları V2 migration için eklendi | ✅ PASS | V1/V2 dual representation bilinçli; manifest-migrator ile yönetiliyor |
| ADR-035 (Verification Protocol Standard) | Tip kontratı; verification yok | ➖ N/A | Indirect — `AgentStats` finalizer tarafından yazılır |
| ADR-036 (ADR Governance Integration) | ADR ilişkileri TSDoc'ta linklenmiyor (G-3, G-4) | ⚠️ ATTENTION | Doc-only gap; runtime ihlal değil |
| ADR-037 (RBAC V1.0 — soft) | `allowedTools`/`deniedTools` ADR-037 authority matrix verisini taşır (warn-only) | ✅ PASS | Tip seviyesinde uyumlu; runtime enforcement orchestra'da |
| ADR-038 (Self-Modifying Task Detection) | Bu dosya geniş reverse-dep listesi nedeniyle "korumalı" sayılabilir — silme refactor'u yasaklı değil ama yüksek risk | ⚠️ ATTENTION | `refactorer` agent'ın bu dosyaya `// ─── separator` temizliği gibi cosmetic değişiklikler önermesi self-modifying flag'i tetiklemeli |
| ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) | `expertise`, `triggerKeywords/Scopes/FilePatterns` taksonomi veri modelini taşıyor | ✅ PASS | Taxonomy kararına uyumlu |
| ADR-046 (Brain Self-Update Hook Architecture) | `stats` mutable; sprint-finalizer tarafından update ediliyor (`updateAgentStats`) | ✅ PASS | Self-update kontratı destekleniyor |

Net: aktif ADR ihlali **yok**. ADR-036 dokümantasyon zayıflığı (G-3, G-4) ve ADR-038 koruma alanı uyarısı dışında temiz.

---

## 7. Refactor Recommendations

Öncelik sırasına göre:

### R-1 (önerilen — quick win) — `MultiAgentPipelineStep`'i sil
- Caller listesi: 0 `src/`, 1 self-test → silme güvenli.
- `tests/core/agent-types.test.ts:238-263` arası `MultiAgentPipelineStep type` describe bloğunu da kaldır.
- Etki: −5 LoC (interface) + ~25 LoC (test), −1 dead export, −1 YAGNI sinyali.
- Risk: `tsc --noEmit` + `vitest run` doğrulamasıyla 0 regresyon beklenir.

### R-2 (orta) — TSDoc per-field comment migration
- G-2 ile G-7 arası dokümantasyon eksiklerini TSDoc'a taşı.
- Sayısal sınırları (`0.0-1.0`, `0-100`, `0.1-3.0`) hala `string` comment olarak kalacak — branded type vs `zod`/runtime-validator için ayrı bir refactor (Sprint 188+).
- Etki: +30-50 LoC (yalnızca yorum), runtime davranış değişmez, IDE deneyimi iyileşir.
- Risk: 0.

### R-3 (defansif — opsiyonel) — Branded numeric types
- `type SuccessRate = number & { __brand: 'SuccessRate' }` veya `zod.number().min(0).max(1)` ile compile-time/runtime sınırlar.
- Etki: D-2 ve D-7 kapanır; ama factory call-site'ları (~30+ test fixture) güncellenmek zorunda — yüksek geçiş maliyeti.
- Risk: orta — fixture'lar tek seferde refactor edilmeli; aksi takdirde test suite kırılır.
- Tavsiye: bu sprint'te **yapma**. Eğer scoring drift bug'ı görülürse Sprint 189+ ele alınmalı.

### R-4 (cosmetic) — `// ─── separator` yorumları temizle
- Dosyada 7 adet ASCII separator yorum var (`// ─── Agent Stats ───`, vb.) — TSDoc `@module` ile karşılaştırıldığında IDE outline'ında zayıf görünür.
- ADR-038 self-modifying-task detection'a takılabilir (cosmetic edit, large reverse-dep dosya).
- Tavsiye: R-2 ile birlikte yap; bağımsız PR'a değmez.

Net tavsiye: **R-1 + R-2** birlikte Sprint 188 cleanup wave'i içinde. R-3 ayrı epic, R-4 R-2 piggyback.

---

## 8. Sprint 188 Follow-up Items

| ID | Item | Tip | Tahmini Effort |
|----|------|-----|----------------|
| FU-1 | `MultiAgentPipelineStep` interface'i sil + `tests/core/agent-types.test.ts:238-263` testini kaldır | refactor / dead-code | low (≤30 dk) |
| FU-2 | `AgentStats`, `AgentDefinition`, `createAgentDefinition`, `createDefaultStats` için TSDoc per-field açıklamalar ekle (G-1..G-7) | doc | normal (1-2 saat) |
| FU-3 | `AgentDefinition.manifestVersion === 2` durumunda V1 alanlarının yok sayıldığını TSDoc + (opsiyonel) `manifest-migrator.ts` warn log ile vurgula | doc + guard | low (≤45 dk) |
| FU-4 | `source: 'builtin'` override unutulan built-in agent oluşumlarını yakalayan unit test (defansif) | test | low (≤30 dk) |
| FU-5 | `allowedTools` / `deniedTools` için literal union veya enum şema (örn. `'Bash' \| 'Read' \| 'Edit' \| 'mcp__*'`) — permission-guard ile senkronize | type-tightening | normal (2-3 saat, geniş call-site etkisi) |
| FU-6 | `effortMultiplier` ve `successRate` için runtime range guard (`assertRange(0.1, 3.0)`) — D-2 / D-7 düşürür | safety | normal (1-2 saat) |
| FU-7 | `AgentStats.lastUsedInSprint` için `string \| null` veya `''` sentinel'i `'never'` ile değiştir; sıralama mantığını netleştir | refactor | low (≤30 dk, ama tüm comparator'lar dokunulmalı) |
| FU-8 | Bu dosyayı `refactorer` agent'ın "korumalı / yüksek-risk" listesine ekle (ADR-038 self-modifying detection için) — geniş reverse-dep nedeniyle silme/rename başlı başına özel inceleme istemeli | guard / safety | low (config-level) |

---

## 9. Summary

`src/core/agent-types.ts` **97 satırlık saf type modülü + 2 factory helper**'dir; Deckent'in agent pool kontratını taşır ve `core/` katmanının ADR-008 tek yönlü bağımlılık kuralına ideal şekilde uyar. `AgentStats`, `AgentDefinition`, `AgentPool`, `AgentSelectionResult`, `createDefaultStats`, `createAgentDefinition` ihraçları aktif kullanımda — yalnızca **`MultiAgentPipelineStep`** ölü export'tur (sadece kendi type-shape test'i tüketiyor, 0 `src/` consumer). ADR uyum durumu temiz: ADR-001/002/008/010/028/037/041/046 ile uyumlu, ADR-036 (TSDoc/ADR referansı eksikliği) ve ADR-038 (geniş reverse-dep dosyası — silme/rename refactor'u yüksek risk) için **dikkat** gerekir. Ana borç sinyalleri: (1) numeric range constraint'lerin yalnızca yorum-içi olması (D-2 HIGH severity), (2) V1/V2 dual-mode manifest representation'ının tip seviyesinde branding'i olmaması (D-3), (3) `MultiAgentPipelineStep` dead export (D-1). **Önerilen Sprint 188 aksiyonu: R-1 (dead interface sil) + R-2 (TSDoc per-field migration) birlikte; toplam ~3 saat, 0 regresyon, +iyileşmiş IDE deneyimi.** R-3 branded numeric types ayrı epic — şu an tetikleyen bug yok. Toplam debt etkisi: 8 risk maddesi (1 HIGH likelihood, 1 HIGH severity, 3 MEDIUM, 3 LOW); silme/dokümantasyon iyileştirmesiyle 3 madde kapatılabilir.
