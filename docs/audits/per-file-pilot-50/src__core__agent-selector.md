# Audit — `src/core/agent-selector.ts`

> Sprint 186 / Sprint 187 per-file pilot (50-task batch). Doc-only audit, no source code modified.
> File reviewed at git HEAD on 2026-05-21.

---

## 1. Inventory

| Metric | Value |
|---|---|
| Path | `src/core/agent-selector.ts` |
| LoC (incl. comments + blanks) | 197 (DIRECTIVES manifest reports 198, off-by-one due to trailing newline counting convention) |
| Module type | Pure library — no I/O, no side effects, no class state |
| Exports | `extractKeywords(text)`, `selectAgent(task, pool)`, `suggestNewAgent(tasks, pool)` |
| Internal helpers | `globMatch(pattern, text)` (file-private), `STOPWORDS` Set, `MIN_KEYWORD_LENGTH`, `SCORE_THRESHOLD` constants |
| Imports | `ModelType` (type-only, `./types.js`); `AgentDefinition`, `AgentPool`, `AgentSelectionResult` (type-only, `./agent-types.js`) |
| Runtime dependencies | None — pure functions over plain TS types |
| Reverse deps (production) | `src/orchestra/sprint-planner.ts` (line 60 — `selectAgent`), `src/orchestra/decision-steps/agent-step.ts` (line 12 — `selectAgent` boosted-scoring wrapper) |
| Reverse deps (tests) | `tests/core/agent-selector.test.ts` (391 LoC, primary test suite); indirect coverage via `tests/orchestra/agent-activation.test.ts`, `tests/orchestra/spawn-prevention.test.ts`, `tests/orchestra/sprint-controller.test.ts`, `tests/orchestra/finalize-sprint.test.ts`, `tests/orchestra/brain-agent.test.ts`, `tests/orchestra/dependency-pipeline.test.ts`, `tests/orchestra/runsprint-debt-integration.test.ts`, `tests/core/ci-guardian.test.ts` |
| Public API surface | 3 functions; 0 classes; 0 default exports |

---

## 2. Bağlam — Architectural Context

`agent-selector.ts` Deckent V1 routing katmanının çekirdek karar verme bileşenidir. Brain `PLAN` fazında her task için `selectAgent()` çağırarak havuzdaki 15 built-in + N temp agent arasından en uygun olanı puanlama tabanlı seçer. Skorlama kuralları:

- `+2` puan — agent `triggerKeywords` ile task title+description anahtar kelimeleri arasında her eşleşme
- `+3` puan — agent `triggerScopes` ile task `scope.directories` arasında prefix eşleşmesi (çift yönlü: dir⊂scope veya scope⊂dir)
- `+1` puan — agent `triggerFilePatterns` ile task `scope.filesWrite` arasında glob eşleşmesi

Eşik (`SCORE_THRESHOLD = 3`) altındaki agent'lar elenir; eşitlik durumunda `agent.stats.successRate` yüksek olan kazanır (öğrenme sinyali). Eşleşme yoksa `agent: null` döner — bu durumda Brain `generic` profille devam eder.

Bu modül `core/agent-types.ts` (AgentDefinition, AgentPool, AgentSelectionResult) ile tip kontratı paylaşır. `agent-types.ts` aynı zamanda V2 routing için `activation?: ActivationConfig` (manifestVersion=2) alanını barındırır — yani `agent-selector.ts` V1 routing (keyword/scope/file-pattern) için, `activation-engine.ts` V2 routing (structured rules) için kullanılır. ADR-028 (Decision-Engine V1→V2 Routing Migration) bu çift katmanlı geçişi belgeler; Brain `routing_engine` config'ine göre hangisinin çalışacağına karar verir.

`decision-steps/agent-step.ts` bu modülü "boost wrapper" olarak sarmalar: TaskAnalysis ürettiği `taskType` (bug/test/api/security/ui/...) kategorisine göre task description'a sentetik keyword'ler enjekte eder, sonra `selectAgent()` çağırır — yani agent-selector'ı modifiye etmeden TaskType taxonomy (ADR-053) entegrasyonu sağlar.

`suggestNewAgent()` ise cross-sprint öğrenme aracıdır: aynı sprintteki 3+ task ortak bir uncovered keyword içeriyorsa Brain'e yeni bir agent şablonu önerir (`{name, keywords, model: 'sonnet'}`) — kullanıcı veya promotion-pipeline bu öneriyi temp agent oluşturma için tüketebilir.

---

## 3. Debt Risk

| Risk | Severity | Notes |
|---|---|---|
| `STOPWORDS` listesi yalnız İngilizce | MEDIUM | Türkçe deckent kullanıcılarında `agent.triggerKeywords` İngilizce, task description Türkçe ise eşleşme oranı düşer. ADR-032 i18n Pattern System bu boşluğa karşı yalnız managed-docs tarafını kapsıyor — agent-selector i18n-agnostik. |
| Glob regex catch ile sessiz hata yutuluyor (`globMatch` line 59-61) | LOW | Geçersiz pattern → `false`. Debug için log yok; brain testlerinde edge case kaçabilir. |
| `globMatch` glob desteği basit (`*`, `**`) — `?`, `{a,b}`, character class yok | LOW | Manifest yazarları `?` kullanırsa pattern hiçbir şeyle eşleşmez (regex-escape edilir). Doc'larda kısıtlama belirtilmemiş. |
| `triggerScopes` eşleşmesi simetrik (`dir.startsWith(scope) || scope.startsWith(dir)`) | MEDIUM | `scope: "src"` ve `dir: "src/agents"` doğru eşleşir; ama `scope: "src/core"` ile `dir: "src"` da eşleşir (false positive). Geniş scope agent'ları dar scope task'larda yanlış boost alabilir. |
| `SCORE_THRESHOLD = 3` sabit | LOW | Tek bir scope match `+3` puanla otomatik geçer; tek keyword match (`+2`) tek başına yeterli değil. Bu, dosya patern + keyword kombinasyonlarını dolaylı olarak zorunlu kılıyor — açık biçimde dokümante edilmemiş. |
| `agent.stats.successRate` tie-breaker — soğuk-başlangıç bias | MEDIUM | Yeni temp agent (`successRate=0`) eski built-in'lere karşı tie-break'i kaybeder; promotion-pipeline öğrenmesini yavaşlatır. Sprint 138+ outcome-tracker bonus mekanizması bu modülün dışında. |
| `extractKeywords` punctuation listesi sabit | LOW | Markdown formatlı description'larda `[`/`]` zaten splitter; ama em-dash (`—`) splitter değil — TR description'larda "task — açıklama" pattern'i token'leri birleştirebilir. |
| Tip kontratı `pool: AgentPool` (Map) — Iterator destructuring `[, agent]` | LOW | Modern TS/Node uyumlu; eski ESM target'larda sorun yaratmaz (Node 18+ guaranteed). |
| Pure function tasarımı — birim test kolaylığı yüksek | POSITIVE | 391 LoC test suite mevcut; coverage iyi. |

---

## 4. Dead Code Candidates

Grep kanıtları (production import zinciri):

```
$ grep -RE "from ['\"](\.\.?/)*core/agent-selector(\.js)?['\"]" src/
src/orchestra/sprint-planner.ts:60: import { selectAgent } from '../core/agent-selector.js';
src/orchestra/decision-steps/agent-step.ts:12: import { selectAgent } from '../../core/agent-selector.js';
```

- `selectAgent` — **CANLI**. İki production import; ayrıca `sprint-planner.ts:560` çalışma zamanı çağrısı.
- `suggestNewAgent` — **ŞÜPHELİ DEAD**. Production `src/` ağacında hiçbir import bulunamadı (`grep -RE "suggestNewAgent" src/` — sadece tanım dosyasında geçiyor). Yalnızca test kapsamı (`tests/core/agent-selector.test.ts`) mevcut. Sprint 188'de bir kullanıcı/orchestrator wire'ı yoksa kaldırılması veya `agent-pool.ts` LRU+suggestion akışına bağlanması değerlendirilmeli.
- `extractKeywords` — **CANLI** (named export). `src/orchestra/task-analyzer.ts:31` aynı isimde **paralel implementasyon** içeriyor (re-import değil, kopya) — kod tekrarı.
- `globMatch` — file-private; yalnız `selectAgent` içinden çağrılıyor. Yaşıyor.
- `STOPWORDS`, `MIN_KEYWORD_LENGTH`, `SCORE_THRESHOLD` — modül-içi sabitler, kullanımda.

**Kanıt grep**:
```
$ grep -RnE "suggestNewAgent" src/  →  src/core/agent-selector.ts:155 (tanım) — başka import yok
$ grep -RnE "suggestNewAgent" tests/ →  tests/core/agent-selector.test.ts (yalnızca)
```

---

## 5. Documentation Gaps

- **TSDoc kapsamı kısmi**: `extractKeywords`, `selectAgent`, `suggestNewAgent` JSDoc başlığı içeriyor; ancak hiçbiri `@param`, `@returns`, `@throws`, `@example` tag'lerini tam doldurmuyor. `selectAgent` skorlama algoritması yorum bloğunda "1.-5. step" listesi olarak veriliyor — `@remarks` veya `@example` ile zenginleştirilebilir.
- **Public API contract eksiği**: `score` ne anlama gelir (raw skor mu, normalize mi)? `reason` formatı stable mı (`Matched: keyword:xxx, scope:yyy`)? Cıktı kontratı dokümante değil; downstream `decision-steps/agent-step.ts` ham string'i parse etmiyor ama Brain log/retro'larda görüntüleniyor.
- **`globMatch` glob alt-küme** (`*`, `**` only — `?` ve `{a,b}` yok) dokümante değil — manifest yazarı için gizli kısıt.
- **`SCORE_THRESHOLD = 3` rationale yok**: yorum "Filter: score >= 3" diyor ama "neden 3?" gerekçesi (1 scope match = otomatik geçiş, 2 keyword match = otomatik geçiş, tek keyword = ret) belirtilmemiş.
- **`STOPWORDS` listesi statik** — locale/dil bilgisi yok. README/ADR-032 ile çapraz referans yok.
- **`suggestNewAgent` çıktısı `model: 'sonnet'` hard-coded** — neden sonnet (tier seçimi rationale)?
- **`agent.stats.successRate` tie-break sıralaması** doc'da var ama eşit `successRate` durumunda map iterasyon sırasının deterministikliği belirtilmemiş (Map insertion order — Node garanti).

---

## 6. ADR Compliance Check

| ADR | İlgili Madde | Durum |
|---|---|---|
| ADR-001 (TypeScript + ESM) | `import type` kullanımı, ESM relative imports `.js` suffix | ✅ Uyumlu — `./types.js`, `./agent-types.js` |
| ADR-002 (Node16 Module Resolution) | `.js` extension zorunlu | ✅ Uyumlu |
| ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) | core → orchestra/agents YASAK | ✅ Uyumlu — yalnız `core/*-types.js` import ediliyor; ters bağımlılık yok |
| ADR-010 (Tek Runtime Dependency — commander) | Üçüncü taraf bağımlılık YASAK | ✅ Uyumlu — sıfır external dep |
| ADR-028 (Decision-Engine V1→V2 Routing Migration) | V1 keyword/scope routing burada yaşıyor; V2 `activation-engine.ts`'te | ⚠ KISMEN — V2 manifest'li agent'lar bu fonksiyondan geçerken `activation` alanı dikkate alınmıyor (yalnız `triggerKeywords/Scopes/FilePatterns`). V2 routing engine ayrı koddan çağrılmalı; `selectAgent` legacy yol olarak korunmalı. Documented but call-site responsibility. |
| ADR-035 (Verification Protocol Standard) | I/O kontratları | N/A — pure function, channel/IPC yok |
| ADR-037 (RBAC Authority Matrix) | Brain karar verir, worker uygular | ✅ — yalnız Brain `PLAN` fazında çağrılır |
| ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) | Agent seçimi vertical, skill seçimi horizontal | ✅ Uyumlu — bu modül yalnız agent seçer; skill seçimi `skill-router` ayrı |
| ADR-053 (TaskType Taxonomy) | `decision-steps/agent-step.ts` taşıyıcısı boost ile entegre | ✅ Uyumlu — kategori boost wrapper'da, `selectAgent` agnostik |

---

## 7. Refactor Recommendations

1. **`extractKeywords` tek kaynağa konsolide et** — `src/orchestra/task-analyzer.ts:31`'deki paralel implementasyonu kaldırıp `core/agent-selector.ts` export'unu reuse et. Drift riski + bakım yükü.
2. **`triggerScopes` eşleşmesini tek yönlü yap** — Şu anki `dir.startsWith(scope) || scope.startsWith(dir)` simetrisi geniş scope'lu agent'lara haksız boost veriyor. Sadece `dir.startsWith(scope)` veya path-prefix `path.relative` tabanlı tercih edilebilir.
3. **`globMatch` için minimatch alt-küme veya tam parser** — Mevcut regex-replace güvenli ama eksik (`?`, `{a,b}` yok). Production usage düşükse "documented subset" yeterli; aksi halde küçük bir AST.
4. **`SCORE_THRESHOLD` ve puan ağırlıkları (2/3/1) konfigürlenebilir hale getir** — `core/decision-config.ts` veya `agent-types.ts` ile expose; sprintten sprinte deneme yapılabilsin.
5. **`reason` çıktısı için structured array** — `reason: string` yerine `matches: Array<{kind:'keyword'|'scope'|'file', value:string, points:number}>` döndür; downstream log/retro daha güvenilir parse eder.
6. **TSDoc tam pasaj** — `@param`, `@returns`, `@throws`, `@example` tag'lerini doldur; `@remarks` ile skorlama rationale ve V2 routing relationship'i.
7. **`STOPWORDS` i18n** — En azından Türkçe yaygın stopword'leri (`ve`, `ile`, `bir`, `bu`, `şu`, `o`, `için`, `ama`, `veya`...) ekle veya `Set<string>` parametre olarak override edilebilir yap.
8. **`suggestNewAgent` ya bağla ya kaldır** — Production wire yoksa `agent-pool.ts` LRU/promotion-pipeline akışına bağla (öğrenme kapanış halkası) veya `_deprecated/` altına taşı.
9. **`agent.stats.successRate` tie-break'inde cold-start düzeltmesi** — `totalUses < 5` agent'lara karşı `>= 5` agent'lar arasında ayrı bucket'a koy; aksi halde yeni agent'lar asla seçilmez (chicken-and-egg).

---

## 8. Sprint 188 Follow-up Items

- [ ] **FU-1** — `suggestNewAgent` reverse-dep grep'i (production) ve wire kararı: bağla / kaldır / promotion-pipeline'a taşı.
- [ ] **FU-2** — `task-analyzer.ts:31` `extractKeywords` duplikasyonunu konsolide eden 1 task (kod silme + import güncelleme + test).
- [ ] **FU-3** — V2 routing `activation` alanı `selectAgent`'a sızıyor mu? Tek bir entegrasyon testi (manifestVersion=2 agent geldiğinde davranış) yaz.
- [ ] **FU-4** — `triggerScopes` simetrik prefix testleri: `scope:"src/core"`+`dir:"src"` durumunda istenmeyen boost var mı? Pin'le.
- [ ] **FU-5** — `globMatch` desteklenmeyen pattern'ler için (`?`, `{a,b}`) doc + (opsiyonel) error log.
- [ ] **FU-6** — `STOPWORDS` TR genişletmesi + ADR-032 ile çapraz referans (cross-link).
- [ ] **FU-7** — `AgentSelectionResult.reason` kontratı: structured matches array. Migration: backward-compat geçici alan.
- [ ] **FU-8** — Cold-start tie-break: `totalUses < 5` agent'lara bucketed fairness.
- [ ] **FU-9** — Skor sabitleri (`+2/+3/+1`, threshold=3) için `core/decision-config.ts`'ten okuma + 4-5 testlik experimentation pattern.

---

## 9. Summary

`src/core/agent-selector.ts` 197 LoC, üç pure function export eden, sıfır bağımlılığa sahip kritik V1 agent routing modülüdür. Brain `PLAN` fazında 15+ built-in agent havuzu üzerinde keyword/scope/file-pattern tabanlı puanlama ile en uygun agent'ı seçer; eşit puanlarda `successRate` tie-break uygular. Production ağacında iki call-site (`sprint-planner.ts`, `decision-steps/agent-step.ts`) ve geniş test kapsamı (391 LoC suite + 8 orchestra entegrasyon testi) ile aktif kullanımdadır.

**Genel sağlık:** ✅ İYİ. ADR-001/002/008/010/041/053 ile uyumlu, pure function tasarımı bakım/test kolaylığı sağlıyor.

**Başlıca borçlar:**
1. `suggestNewAgent` production wire eksik (şüpheli dead code).
2. `extractKeywords` `task-analyzer.ts` ile duplike.
3. `triggerScopes` simetrik prefix eşleşmesi geniş scope agent'larında false positive.
4. `STOPWORDS` İngilizce-only — TR kullanıcılarda keyword recall düşer (ADR-032 ile uyumsuz değil ama eksik kapsam).
5. V2 routing (`activation` alanı) bu modülün dışında — Brain'in V1/V2 ayrımını call-site'ta yapması gerekli (ADR-028).

**Önceliklendirme:** Sprint 188'de **FU-2 (extractKeywords konsolidasyon)** ve **FU-1 (suggestNewAgent kararı)** düşük risk + yüksek netlik kazandırır. **FU-4 (scope simetrisi)** ve **FU-8 (cold-start tie-break)** orta vadede routing kalitesini artırır. Şu an kritik bir blocker yok — modül stabilde tutulabilir.
