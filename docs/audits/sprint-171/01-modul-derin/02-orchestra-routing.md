# orchestra Routing + Evaluation Audit — Audit Raporu (Sprint 171)

> Kapsam: `src/orchestra/{task-router, outcome-tracker, quality-assessor, mid-sprint-adapter, rule-evolver, debt-manager, rubric-registry}.ts` (toplam 2774 LoC).
> Hedef okur: deckent'i tanımayan mühendis raporu okuyup aksiyona geçebilmeli.
> Audit-only: bu denetim yalnızca okumaya dayanır, hiçbir kaynak dosya değiştirilmemiştir.

---

## 1. Bulgular (Findings)

### Bulgu 1 — `docs/audits/` hardcoded konvansiyonu kullanıcı zihin modeli ile çatışıyor (doc-vs-code drift)

`rubric-registry.ts`, audit task tespitini tek bir path kuralına bağlamış: `scope.filesWrite[0]` mutlaka `docs/audits/` ile başlamalı. Oysa repoda fiilen iki ayrı audit konvansiyonu yan yana yaşıyor:

- **Kod gerçeği:** `docs/audits/sprint-NNN/<name>.md` (rubric-registry, sprint-finalizer, authority-enforcer hep bu yolu hardcode ediyor).
- **Kullanıcı/operasyon gerçeği:** `.audit/sprint-167/`, `.audit/sprint-169/` adlı eski dizinler hâlâ repoda fiziksel olarak duruyor (`ls .audit/` çıktısıyla doğrulandı — `sprint-167` ve `sprint-169` mevcut).

Bir yeni kullanıcı/agent kendi audit raporunu `.audit/<sprint>/<name>.md` altına yazarsa: (a) `isAuditTask` false döner çünkü `target.startsWith('docs/audits/')` eşleşmez, (b) `coverageOptional` da false döner çünkü `detectTaskType` kod-geliştirme sayar, (c) `coverage: null` kabul edilmez, (d) Brain heuristic NO_GO çıkar. Yani çağrılanın "audit yazıyorum" demesi yetmez, dosya yolunu birebir `docs/audits/` ile başlatmak zorundadır. Bu kural kodun tek bir yerinde (`rubric-registry.ts:127`) gizlenmiş ve hiçbir Markdown dokümanında açıkça yazılmamıştır.

OSS GA öncesi bu drift kullanıcıyı yanıltır niteliktedir (CRITICAL). Sprint 171 mega-sprintinin kendi DIRECTIVES'i bile `docs/audits/sprint-171/` yolunu zorunda kalarak kullanmıştır — yani kullanıcı zihin modeli `.audit/self/...` istemesine rağmen koda uymak zorunda kalmıştır.

### Bulgu 2 — `rotateModelForFix` semantik olarak ters yönde çalışıyor (fix-model-downgrade tasarım hatası)

`debt-manager.ts:138` içindeki `rotateModelForFix` fonksiyonu, bir görev NO_GO olduğunda fix task'ın modelini **bir tier aşağı** indirir: `opus → sonnet`, `sonnet → haiku`, `gpt-5 → gpt-4.1`, `gemini-2.5-pro → gemini-2.5-flash` (haritası `MODEL_DOWNGRADE_MAP`, `debt-manager.ts:74-91`).

Tasarım gerekçesi (`debt-manager.ts:64-67`, 132-136): "fresh perspective — farklı reasoning trace + cost savings". Pratikte çelişki: NO_GO bir göreve **daha az yetenekli** model ataması, bir önceki worker'ın yapamadığı işi düşük tier'ın yapacağını varsayar; aksine kanıt geliyor: opus altında çözülemeyen task haiku'da çözülemez. "Fresh perspective"in asıl kaynağı agent değişikliğidir (`rotateAgentForFix`, çoğu durumda `code-reviewer`), model değil. Model rotasyonu prensip olarak iki ihlal birden işler:

1. **Görev zorluğu artmıştır (NO_GO oldu), kapasite azalmıştır** — antinatüral.
2. **`task.forceModel` (kullanıcının üst düzey bir model dayatmasını ifade eder) sessizce geçersiz kılınır** — `fixTask.forceModel = rotationStrategy.rotatedModel` (`debt-manager.ts:304`). Kullanıcı niyet olarak "bu işe opus harca" demişken fix turunda haiku'ya düşürülüyor.

Maliyet tasarrufu argümanı da OSS GA'da geçerli değildir: kullanıcı kendi API key'iyle çalıştırırsa zaten kendi kararıdır. Brain'in karar verebileceği iş değil.

### Bulgu 3 — `mid-sprint-adapter.reconcileSpuriousNoGo` shell injection vektörü açıyor (ADR-006 ihlali)

`mid-sprint-adapter.ts:228` içinde `defaultGetGitDiffStats` fonksiyonu, `task.scope.directories` içeriklerini doğrudan bir shell komutu metnine yazıyor:

```ts
const dirs = scope?.directories ?? [];
const pathArgs = dirs.length > 0 ? ` -- ${dirs.join(' ')}` : '';
const output = execSync(`git diff --stat HEAD${pathArgs}`, { cwd: projectRoot, ... });
```

ADR-006 ("spawnSync Security Pattern") tüm subprocess çağrılarının array-arg formuyla yapılması zorunluluğunu getirir. Burada `execSync` string interpolation kullanılıyor — `task.scope.directories` AI planner'dan veya kullanıcının DIRECTIVES'inden geldiği için kontrolü Brain'in dışında. Bir saldırgan ya da yanlışlıkla yazılmış bir AI planner çıktısı `scope.directories: ["src/; rm -rf ~"]` yerleştirirse, fix path'i otomatik tetiklendiğinde komut shell tarafından parse edilir.

Aynı vektör `defaultRunVitestScopeCheck` içinde de tekrarlanıyor (`mid-sprint-adapter.ts:284`):

```ts
const output = execSync(`npx vitest run --reporter=json ${testPatterns.join(' ')}`, ...);
```

`testPatterns` da `scope.directories`'den türetiliyor (`mid-sprint-adapter.ts:276-278`). Sprint 167–170'te bu reconciliation pipeline production'a wire edildi (Sprint 145 + Sprint 163'ten beri), dolayısıyla canlı yol.

### Bulgu 4 — `OutcomeTracker.recordOutcome` concurrent write race açığı barındırıyor

`outcome-tracker.ts:486-500` (`saveSprintOutcome`) çağrısı her worker sonucunda **read-modify-write** ediyor: dosyayı oku → array'e push → diske yaz. Eşzamanlı iki worker sonucu Brain tarafından aynı sprint sırasında işlenirse, son yazan ilk yazanın outcome'unu kaybeder.

`recordOutcome` (line 92-145), her başarı/başarısızlığı agentPerformance + skillPerformance haritalarına ekliyor; ardından `saveSprintOutcome` + `saveLearnings` çağırıyor. Brain controller bir sprint içinde sıralı (sequential) çağırırsa risk yok, fakat:

- Sprint 169 H1 dogfood'unda Brain çoklu wave + parallel evaluation phase'i sergiledi.
- `OutcomeTracker` `private learnings` in-memory state taşıyor; çoklu OutcomeTracker instance (test, mid-sprint-adapter, evaluator) ayrı objelerden aynı dosyaya yazarsa state bölünür.

Race penceresi küçük olsa bile audit raporlanması, learning bonus dağıtımı ve `synergy verdict` hesabını drift'e götürür. `OutcomeTracker` constructor'da projectRoot dışında lock yok; `saveLearnings` direkt `writeFileSync` çağırıyor (line 480).

### Bulgu 5 — `QualityAssessor` rubric-aware değil; audit task'larda otomatik 25 puan eksiltiyor

`quality-assessor.ts:35-40` puanlamayı sabit ağırlıklarla yapıyor:

```ts
const overall = Math.round(
  correctness * 0.35 +
  coverage * 0.25 +
  scopeAdherence * 0.2 +
  completeness * 0.2,
);
```

Ancak `rubric-registry.ts` farklı task tipi için farklı boyut kümesi tanımlamış: AUDIT_RUBRIC'te `coverage` yok, yerine `finding_count`/`citation_density` var. Audit task'ta `result.coverage === null` veya 0 olur; `assessCoverage` (line 60-63) `cov ?? 0` ile 0 puan döndürür; quality score otomatik olarak 25 puan kaybeder.

Bu skor `OutcomeTracker.recordOutcome → updateEntityPerformance` üzerinden `avgQualityScore`'a karışıyor; `computeBonus` (`outcome-tracker.ts:342-345`) `avgQualityScore < 40` durumunda -1 penalty veriyor. Audit'a yatkın `architect`, `security-auditor`, `doc-writer` gibi agent'lar zamanla yapay olarak penalize edilir. Coverage'ı opsiyonel kabul eden `coverageOptional` kuralı sadece schema gate'inde geçerli; quality skoru bu kuraldan habersiz.

### Bulgu 6 — Aynı isimli `detectTaskType` iki ayrı modülde, iki ayrı taksonomi (KISS/DRY ihlali)

İki public symbol aynı isimle ihraç ediliyor:

- `task-router.ts:90` `detectTaskType(task)` → `'design' | 'test' | 'doc' | 'design' | 'code' | 'unknown'`
- `rubric-registry.ts:166` `detectTaskType(task)` → `'audit' | 'document-write' | 'code-development'`

İki taksonomi farklı sınıflandırmalar yapıyor: `task-router` provider/skill seçimi için; `rubric-registry` rubric+coverage gate için. Worker bakımından kafa karıştırıcı: aynı task `doc` ve `audit` etiketlerini eş zamanlı taşıyabilir. Test yazımında, IDE auto-import'unda ve dogfood'da kaynak hatası yaratıyor (örn. `import { detectTaskType } from '../orchestra/task-router.js'` ile rubric beklentisi).

### Bulgu 7 — `task-router.routeTask` doküman yorumu (Priority order: 3. Agent preference) kodla uyumsuz

`task-router.ts:144-150` JSDoc yorumu 6-level routing'in 3. önceliğini şöyle anlatıyor:

> 3. Agent preference: task.assignedAgent has preferredProvider → use it (if available)

Aslında kod (line 212-222) `task.provider` (string) alanını kontrol ediyor — `task.assignedAgent.preferredProvider` diye bir lookup hiç yapmıyor. Yani "agent preference" mantığı koddan kayıp. JSDoc yanıltıcı; ADR-015 6-level routing dokümanını okumaya gelen yeni geliştirici "agent registry'sinde preferredProvider alanı vardır" sanır. CLAUDE.md / api-surface.md'de bu drift yansımıyor.

### Bulgu 8 — `AGENT_FRESH_EYES_MAP` içinde ölü agent referansı: `test-writer`

`debt-manager.ts:102` `'test-writer': 'bug-fixer'` satırı, ADR-041 (Sprint 166 reconfirmed) ile kaldırılmış `test-writer` agent'ına referans veriyor. DECKENT.md 15 built-in agent listesinde `test-writer` yok. ADR-041 açıkça "tüm testing agent'ları kaldırıldı — test görevi task-bazlı yönetiliyor" diyor. Bu satır artık ulaşılamaz dal (dead code).

### Bulgu 9 — `OutcomeTracker.updateEntityPerformance` float-round drift bug'ı

`outcome-tracker.ts:386-389` intent successRate güncellemesi:

```ts
const intentSuccesses = Math.round(intentPerf.successRate * (intentPerf.tasks - 1)) + (isSuccess ? 1 : 0);
intentPerf.successRate = intentSuccesses / intentPerf.tasks;
```

`successRate * (tasks - 1)` çarpımının `Math.round`'u, integer success sayısını rekonstrüksiyon ediyor; ama her güncelleme yeni bir round hatası ekler. Örnek senaryo: 7 success / 10 task → 0.70; 11. task NO_GO → `round(0.70 * 10) = 7`, `7 / 11 = 0.6363`. 12. task DONE → `round(0.6363 * 11) = 7`, `8 / 12 = 0.6667`. Gerçek değer 8 / 12 = 0.6667 olduğundan bu sefer denk geldi. Ancak 0.6363'ün round(7) olması ile 8 success/13 daha düşük tasklarda 9/13 = 0.692 alıp gerçek 8/13 = 0.6153'ten saparak `successRate` drift'i biriktirir.

Hâlbuki `successCount` ve `failCount` zaten ayrı sayaç olarak tutuluyor (line 371-373). Doğru yöntem `successCount / totalTasks` doğrudan hesaplamaktır; round/floor yuvarlama yolu bilim olarak gereksiz.

Aynı bug `updateSynergy` (line 422-423) içinde de tekrarlanıyor.

### Bulgu 10 — `mid-sprint-adapter.suggestReroute` kullanıcı dayatmasını sessizce geçersiz kılıyor

`mid-sprint-adapter.ts:118-130` reroute önerisinde, **hâlihazırda atanmış agent ve skill'leri** exclude listesine ekliyor. Kullanıcı DIRECTIVES dosyasında `Agent: architect` veya `Skills: typescript-expert` yazmışsa, fix turunda bu seçimler exclude'a düşüyor; routing engine farklı bir alternatif seçiyor. Üst öncelikli `task.forceAgent` / `task.forceSkills` override'ları kontrol edilmiyor — sadece kullanıcının önceden yazdığı `excludeAgent`/`excludeSkills` muhafaza ediliyor (line 129-130).

Bu davranış semantiksel olarak ters: kullanıcının "ben bu task'ı architect agent yapsın" diyen direktifi bir kez NO_GO olunca otomatik silinmiş gibi davranılıyor. ADR-037 RBAC kontratı ve `forceAgent` field'ının amacı bu sessiz override'ı yasakladığı için doğrudan ihlal.

### Bulgu 11 — `RuleEvolver` üretim path'inde aktif olarak çağrılmıyor (dead branch riski)

`rule-evolver.ts` tek başına bir public API sınıfı (`RuleEvolver`) sunuyor, ama src/orchestra dışından sadece test dosyaları (`tests/**`) tarafından import ediliyor. Sprint 167+ runtime'da `evolveRules()` veya `saveRules()` çağrısı sprint-controller / sprint-reporter / outcome-tracker üzerinden tetiklenmiyor. `OutcomeTracker.saveEvolvedRules` (line 314-318) `unknown[]` parametre alıyor — yapay tip; gerçek tetikleyici yok. Sprint sonu auto-rule generation dokümante edilmiş bir özellik ama runtime'da etkisiz: agent ve skill rule'larının otomatik evrilmesi şu anda **çalışmıyor**.

### Bulgu 12 — `assessSkillRelevance` heuristik sertliği: audit task'larda typescript skill 0 boost

`quality-assessor.ts:113-145` skill relevance boost'u şu koşullara bağlı:

```ts
if (skillId.includes('typescript') && task.scope.filesWrite.some(f => f.endsWith('.ts'))) {
  score = Math.min(1, score + 0.15);
}
if (skillId.includes('testing') && result.filesChanged?.some(f => f.includes('.test.'))) {
  score = Math.min(1, score + 0.15);
}
```

Audit task'larda `filesWrite` yalnızca `.md` içerir; typescript skill her zaman boost'suz kalır. Sprint 171 plan, audit task'lara `typescript-expert` skill (Task 171-002 dahil) atadı — quality-assessor bu eşleşmeyi göremiyor. Bu, skill'in yararlılığını yapay olarak düşürür ve `RuleEvolver` etkin olsa `typescript-expert` için yanlış exclusion önerirdi.

### Bulgu 13 — `MIN_SAMPLES_FOR_BONUS = 3` default'u çok düşük (yanlış-pozitif penalty riski)

`outcome-tracker.ts:82, 211` default `MIN_SAMPLES_FOR_BONUS = 3`. Sadece 3 task numunesiyle `successRate = 0` → `SPRINT_RECENCY_FAILURE_PENALTY = -2` veya `successRate = 1` → `+3` bonus uygulanıyor. Yeni eklenen bir agent veya skill ilk 3 sprint'te kötü şans nedeniyle başarısız olursa kalıcı penalty cebir hesabına işlenir ve `RuleEvolver` aktif olduğunda exclusion rule türetebilir. İstatistiksel olarak güvenilir bir tahmin için 3 numune çok düşük; yaygın pratik 5–10'dur.

### Bulgu 14 — `applyFreshEyesRotation` her `architect` → `code-reviewer` çevirir, evrilme yolu yok

`debt-manager.ts:97-114` `AGENT_FRESH_EYES_MAP` tamamen statik. Bir agent kalıcı olarak başka bir agent'a yönlendirilmiş; outcome verisiyle güncellenmiyor (`OutcomeTracker.synergyMatrix` aktif olsa bile `applyFreshEyesRotation` bu haritayı dikkate almaz). Sprint 138-167 boyunca `architect → code-reviewer` rotasyonu sürekli kullanıldı; eğer code-reviewer agent'ı pek başarılı değilse kalıbı kıracak hiçbir mekanizma yok. Soft-coupling olması beklenirken hard-coupling var.

### Bulgu 15 — `task-router.ts:253, 272` tekrarlı `'claude' as ProviderName` cast'i gereksiz

`ProviderName = 'claude' | 'codex' | 'gemini'` literal union olduğu için string literal `'claude'` direkt type-safe atanabilir. `availableProviders[0] ?? 'claude' as ProviderName` cast'i süslü püslü ve confusing. Düşük öncelik tip safety hijyeni; ancak ADR-001 (TS strict) disiplinine aykırı.

### Bulgu 16 — `mid-sprint-adapter.reconcileSpuriousNoGo` yutuk hata yönetimi

`mid-sprint-adapter.ts:248-250` git diff başarısız olursa `catch { return { linesChanged: 0, filesChanged: [] }; }` döner ve fonksiyon `decision: 'NO_GO'` ile çıkar. Hatanın kendisi loglanmıyor; debugLog kaydı yok. Spurious NO_GO'nun nedeni "git diff başarısız" mı yoksa "gerçekten dosya değişimi yok" mu — Brain ayırt edemiyor. Sprint 169 H1 retro'sunda zaten "stale_heartbeat" pattern'in 3 tekrar görülmesinin RC analizinde benzer yutuk hata vakaları işaret edildi. MEDIUM observability bulgusu.

### Bulgu 17 — `rule-evolver.evolveSynergyRules` sample threshold (MIN_SAMPLES=5) tutarsız uygulanıyor

`rule-evolver.ts:160` synergy entry'ler `entry.tasks < MIN_SAMPLES` ile filtreleniyor, ama `OutcomeTracker.updateSynergy` (line 426-430) `entry.tasks >= 3` koşulunda verdict atıyor. İki modül arasında threshold farkı (3 vs 5); RuleEvolver gözle görür filtre çalıştırsa bile, outcome-tracker zaten 3 task'ta verdict atadığı için `getSynergyMatrix()` dönüşü RuleEvolver beklentisini gerçekleştirmeyebilir.

### Bulgu 18 — `getRubric` ve `getEffectClass` `Object.freeze`'li registry kullanıyor ama runtime mutasyon korunmasız ihraç ediliyor

`rubric-registry.ts:92, 284` her iki registry de `Object.freeze` ile donmuş ve `const` olarak iç tutuluyor — iyi pratik. Fakat `getRubric(task)` döndürdüğü `EvaluationRubric` reference'a herhangi bir tüketici `criteria.push(...)` çağırabilir; `criteria` array'i deep-freeze edilmemiş. Sadece üst seviye nesne dondurulmuş. Saldırgan tarafından runtime'da `getRubric(task).criteria.push({...})` çağrılırsa registry effectively kirletilir.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|-------|----------|---------|
| 1 | `docs/audits/` hardcoded vs `.audit/` kullanıcı yolu drift | **CRITICAL** | OSS GA blocker — yeni kullanıcı sessiz spurious NO_GO yaşar, kuralı kodun derininde keşfetmek zorunda kalır. |
| 2 | `rotateModelForFix` ters tasarım (downgrade) | **CRITICAL** | Fix worker kasıtlı olarak daha az yetenekli atanıyor; kullanıcının `forceModel` direktifi sessizce geçersiz kılınıyor. |
| 3 | `reconcileSpuriousNoGo` execSync string interpolation (ADR-006 ihlali) | **CRITICAL** | Command injection vektörü; production pipeline'da canlı çağrılıyor (Sprint 145 + Sprint 163). |
| 4 | `OutcomeTracker.saveSprintOutcome` concurrent write race | **HIGH** | Wave/paralel evaluation altında outcome kaybı; öğrenme verisi sessizce bozulur. |
| 5 | `QualityAssessor` rubric-aware değil — audit'lere -25 puan | **HIGH** | `avgQualityScore` agent performance'a karışıyor; audit-yatkın agent'lar yapay penalize ediliyor. |
| 6 | İki ayrı `detectTaskType` aynı isimle | **HIGH** | Yeni geliştirici doğru taksonomiyi seçmekte zorlanır; import hata kaynağı. |
| 7 | `routeTask` JSDoc "agent preference" mantığı koddan kayıp | **HIGH** | ADR-015 dokümante edilen davranış implementasyona yansımamış (doc-vs-code drift). |
| 8 | `AGENT_FRESH_EYES_MAP` içinde `test-writer` dead reference | **MEDIUM** | ADR-041 sonrası ulaşılamaz dal; küçük dead-code. |
| 9 | `updateEntityPerformance` float-round drift | **MEDIUM** | `successRate` zamanla yanlış değere drift; düşük frekanslı ama gerçek bug. |
| 10 | `suggestReroute` `assignedAgent`'i sessizce exclude'a düşürüyor | **HIGH** | Kullanıcının agent direktifini fix turunda iptal eden RBAC ihlali eğilimi. |
| 11 | `RuleEvolver` runtime'da çağrılmıyor | **HIGH** | Dokümante edilmiş self-learning kapasitesi fiili olarak ölü; OSS GA'da yanıltır. |
| 12 | `assessSkillRelevance` audit task heuristics zayıf | **MEDIUM** | `.md` çıktılı task'ta typescript skill her zaman boost'suz; relevance map drift'i. |
| 13 | `MIN_SAMPLES_FOR_BONUS = 3` default'u istatistiksel zayıf | **MEDIUM** | Yeni agent/skill'ler yanlış-pozitif penalty alabilir. |
| 14 | `applyFreshEyesRotation` hard-coupling, evrilmiyor | **MEDIUM** | Outcome verisi rotation kararını etkilemiyor; "fresh-eyes" iddiası kısıtlı. |
| 15 | `'claude' as ProviderName` gereksiz cast | **LOW** | Tip safety hijyeni; ADR-001 disiplinine küçük aykırılık. |
| 16 | `reconcileSpuriousNoGo` git diff hatasını yutuyor | **MEDIUM** | Observability eksikliği; spurious NO_GO RC'sini gölgeliyor. |
| 17 | `RuleEvolver` synergy threshold inconsistency (5 vs 3) | **LOW** | RuleEvolver canlı olmadığı sürece etkisi yok; canlanırsa tutarsız davranır. |
| 18 | Rubric registry shallow freeze | **MEDIUM** | Runtime registry mutasyonu mümkün; ADR-038 anti-tampering iddiasıyla çelişiyor. |

---

## 3. Kanıt (Evidence)

- **B1 — Kod kuralı:** `src/orchestra/rubric-registry.ts:127`

  ```ts
  if (!target.startsWith('docs/audits/')) return false;
  ```

  **Fiziksel çatışan dizinler:** `ls .audit/` → `sprint-167`, `sprint-169` (kullanıcı zihin modeli `.audit/<sprint>/...`).

- **B2 — Model downgrade haritası:** `src/orchestra/debt-manager.ts:74-91`

  ```ts
  const MODEL_DOWNGRADE_MAP: Readonly<Record<string, ModelType>> = Object.freeze({
    opus: 'sonnet',
    sonnet: 'haiku',
    haiku: 'haiku',
    ...
  });
  ```

  **Kullanıcı dayatmasının üzerine yazılması:** `src/orchestra/debt-manager.ts:303-304`

  ```ts
  model: rotationStrategy.rotatedModel,
  forceModel: rotationStrategy.rotatedModel,
  ```

- **B3 — Shell injection:** `src/orchestra/mid-sprint-adapter.ts:226-232`

  ```ts
  const pathArgs = dirs.length > 0 ? ` -- ${dirs.join(' ')}` : '';
  const output = execSync(`git diff --stat HEAD${pathArgs}`, ...);
  ```

  Ek vektör: `src/orchestra/mid-sprint-adapter.ts:284`

  ```ts
  const output = execSync(`npx vitest run --reporter=json ${testPatterns.join(' ')}`, ...);
  ```

- **B4 — Read-modify-write race:** `src/orchestra/outcome-tracker.ts:486-500`

  ```ts
  let outcomes: RoutingOutcome[] = [];
  if (existsSync(filePath)) {
    outcomes = JSON.parse(readFileSync(filePath, 'utf-8'));
  }
  outcomes.push(outcome);
  writeFileSync(filePath, JSON.stringify(outcomes, null, 2), 'utf-8');
  ```

  Lock yok; her `recordOutcome` çağrısı doğrudan dosyaya yazıyor.

- **B5 — Sabit ağırlıklı quality boyutları:** `src/orchestra/quality-assessor.ts:35-40`

  ```ts
  const overall = Math.round(
    correctness * 0.35 +
    coverage * 0.25 +
    ...
  );
  ```

  Coverage drop in audit: `quality-assessor.ts:60-63` (`result.coverage ?? 0`).

- **B6 — İki `detectTaskType` aynı isimle:**
  - `src/orchestra/task-router.ts:90`: `export function detectTaskType(task: Task): TaskType` → `'code' | 'test' | 'doc' | 'design' | 'unknown'`
  - `src/orchestra/rubric-registry.ts:166`: `export function detectTaskType(task: Task): TaskType` → `'audit' | 'document-write' | 'code-development'`

- **B7 — JSDoc vs kod drift:** `src/orchestra/task-router.ts:147` yorumu agent preference diyor; ama `task-router.ts:212-222` `task.provider` field'ını kontrol ediyor — `task.assignedAgent.preferredProvider` lookup'ı yok.

- **B8 — Dead `test-writer`:** `src/orchestra/debt-manager.ts:102`

  ```ts
  'test-writer': 'bug-fixer',
  ```

  DECKENT.md 15 agent listesinde `test-writer` yok; ADR-041 ile kaldırıldı.

- **B9 — Round drift bug:** `src/orchestra/outcome-tracker.ts:386-389`

  ```ts
  const intentSuccesses = Math.round(intentPerf.successRate * (intentPerf.tasks - 1)) + (isSuccess ? 1 : 0);
  intentPerf.successRate = intentSuccesses / intentPerf.tasks;
  ```

  Aynı pattern: `outcome-tracker.ts:422-423` (`updateSynergy`).

- **B10 — Kullanıcı agent direktifi sessizce silinir:** `src/orchestra/mid-sprint-adapter.ts:118-126`

  ```ts
  if (task.assignedAgent && task.assignedAgent !== 'generic') {
    excludeAgents.push(task.assignedAgent);
  }
  if (task.assignedSkills && task.assignedSkills.length > 0) {
    excludeSkills.push(...task.assignedSkills);
  }
  ```

  `task.forceAgent` / `task.forceSkills` kontrol yok.

- **B11 — `RuleEvolver` runtime'da çağrılmıyor:** `grep -rn "RuleEvolver\|new RuleEvolver\|evolveRules()" src/orchestra/sprint-controller.ts src/orchestra/sprint-finalizer.ts src/orchestra/sprint-reporter.ts src/orchestra/brain.ts` → src dışında sadece test dosyaları sonuç verir.

- **B12 — Skill relevance heuristic:** `src/orchestra/quality-assessor.ts:132-134`

  ```ts
  if (skillId.includes('typescript') && task.scope.filesWrite.some(f => f.endsWith('.ts'))) {
    score = Math.min(1, score + 0.15);
  }
  ```

- **B13 — MIN_SAMPLES default:** `src/orchestra/outcome-tracker.ts:82`

  ```ts
  this.MIN_SAMPLES_FOR_BONUS = config?.minSamplesForBonus ?? 3;
  ```

- **B14 — `AGENT_FRESH_EYES_MAP` statik:** `src/orchestra/debt-manager.ts:97-114` — `Object.freeze`, runtime'da değişmiyor; outcome verisiyle güncellenmiyor.

- **B15 — Gereksiz cast:** `src/orchestra/task-router.ts:253`

  ```ts
  const fallback = availableProviders[0] ?? 'claude' as ProviderName;
  ```

  Aynı pattern line 272.

- **B16 — Yutuk hata:** `src/orchestra/mid-sprint-adapter.ts:248-250`

  ```ts
  } catch {
    return { linesChanged: 0, filesChanged: [] };
  }
  ```

  No debugLog, no rethrow.

- **B17 — Threshold tutarsızlığı:**
  - `src/orchestra/rule-evolver.ts:31`: `MIN_SAMPLES = 5`
  - `src/orchestra/outcome-tracker.ts:426`: `if (entry.tasks >= 3) { ... verdict = 'synergy' ... }`

- **B18 — Shallow freeze:** `src/orchestra/rubric-registry.ts:92`

  ```ts
  const RUBRIC_REGISTRY: Readonly<Record<TaskType, EvaluationRubric>> = Object.freeze({...});
  ```

  `criteria` array'i (line 35-40) iç içe — `Object.freeze` deep değil; `getRubric(task).criteria.push(...)` çalışır.

---

## 4. Öneriler (Recommendations)

### Sprint 172 OSS GA Backlog (CRITICAL — public flip öncesi)

- **Bulgu 1 (Düzelt):** `docs/audits/` path zorunluluğunu açık konfigürasyonla esnetin. `rubric-registry.ts` içinde `AUDIT_PATH_PREFIXES = ['docs/audits/', '.audit/']` sabiti tanımlayın ve `isAuditTask` her iki prefix'i kabul etsin. Ayrıca `.deckent/config.json` üzerinden override (`audit.path_prefixes`) ekleyin. README/CLAUDE.md'de "audit task output convention" başlığı altında belgele.
- **Bulgu 2 (Düzelt):** `rotateModelForFix` semantiğini ters çevirin: fix turu için yukarı tier'a `MODEL_UPGRADE_MAP` tanımlayın (haiku → sonnet, sonnet → opus, sonnet → opus için sonsuza). Alternatif: rotation'ı opsiyonel hale getirip varsayılan olarak `task.forceModel`'i koruyun; sadece `task.forceModel === undefined` durumunda agent rotation + maliyet-aware tier seçimi devreye alın. `task.forceModel` user-override olduğundan sessizce ezilmemeli.
- **Bulgu 3 (Düzelt):** `mid-sprint-adapter.ts` execSync çağrılarını `spawnSync` array-arg formuna geçirin:
  ```ts
  spawnSync('git', ['diff', '--stat', 'HEAD', '--', ...dirs], { cwd: projectRoot, ... });
  spawnSync('npx', ['vitest', 'run', '--reporter=json', ...testPatterns], { cwd: projectRoot, ... });
  ```
  Ayrıca `scope.directories` değerlerinde shell-metakarakter veya `..` traversal validation ekleyin.

### Sprint 172 OSS GA Backlog (HIGH)

- **Bulgu 4 (Düzelt):** `OutcomeTracker.saveSprintOutcome`/`saveLearnings` çağrılarını file-lock veya `proper-lockfile` ile koruyun. Alternatif: yazımı `appendFileSync` ile `.jsonl` formatına geçirin (atomik), `getSynergyMatrix`/`getLearnings` okuma esnasında parse etsin. Read-modify-write tamamen kaldırılmış olur.
- **Bulgu 5 (Düzelt):** `QualityAssessor` rubric'i parametre alsın: `assessQuality(task, result, evaluation, rubric)`. Coverage ağırlığını rubric'ten okuyun; audit rubric'inde coverage 0 ağırlık verin ve `finding_count`/`citation_density` boyutlarını ekleyin (TBD: bunlar için heuristik yazmak gerekli — rapor satır sayısı, file:line referansı sayısı vb.).
- **Bulgu 6 (Düzelt):** `detectTaskType` çiftine farklı isimler verin. Önerilen: `task-router.ts:detectTaskType → detectRoutingCategory`; `rubric-registry.ts:detectTaskType → detectTaskRubricType` (veya kısaca `detectTaskType` kalsın, task-router'daki adı `detectRoutingCategory`).
- **Bulgu 7 (Düzelt):** `task-router.ts:routeTask` JSDoc'unu kodla hizalayın. "Agent preference" başlığını "Task-level provider field" olarak değiştirin. Agent registry'de `preferredProvider` field'ı dokümante etmek istiyorsanız, kodu doc'a uydurun; aksi takdirde doc'u koda uydurun.
- **Bulgu 10 (Düzelt):** `mid-sprint-adapter.suggestReroute` içinde, `task.forceAgent` veya `task.forceSkills` set ise reroute'u iptal edip caller'a "user-pinned, cannot reroute" hatası dönsün. Kullanıcı direktifi sessizce silinmesin.
- **Bulgu 11 (Tamamla veya Sil):** `RuleEvolver`'i ya `sprint-reporter.ts`'in retro fazına bağlayın (her sprint sonu evolveRules() + saveRules()), ya da deprecate edip kodu sırf test'in ihtiyacıyla yaşatmayın. Dokümantasyonu (DECKENT.md "Self-Learning") koda hizalayın.

### Sprint 172 OSS GA Backlog (MEDIUM)

- **Bulgu 8 (Sil):** `AGENT_FRESH_EYES_MAP` içinden `'test-writer': 'bug-fixer'` satırını çıkarın. Test ek olarak ADR-041 dispose formatına uygun şekilde dokümante edin.
- **Bulgu 9 (Düzelt):** `updateEntityPerformance` ve `updateSynergy` içinde successRate'i `successCount / totalTasks` ile doğrudan hesaplayın. Round drift kalıcı olarak temizlenir; mevcut learnings.json yeniden hesaplama ile düzelir.
- **Bulgu 12 (Düzelt):** `assessSkillRelevance` audit task heuristiklerini ekleyin: `skillId === 'documentation-writer' && filesWrite[0].startsWith('docs/audits/')` → +0.15; `skillId === 'system-architect' && task.assignedAgent === 'architect'` → +0.15. Daha sağlıklı: rubric-aware relevance map'i `rubric-registry.ts`'e taşıyın.
- **Bulgu 13 (Düzelt):** `MIN_SAMPLES_FOR_BONUS` default'unu 5'e çıkarın (RuleEvolver `MIN_SAMPLES`'ı ile hizalansın). Mevcut config override yolu zaten var; sadece default değiştir.
- **Bulgu 16 (Düzelt):** `defaultGetGitDiffStats` ve `defaultRunVitestScopeCheck` catch bloklarına `debugLog('reconcile:...', err)` ekleyin. Yutuk hata yerine sebep loglansın.
- **Bulgu 18 (Düzelt):** `Object.freeze` çağrılarını deep freeze haline getirin: `criteria` array de dondurulsun. Alternatif: `getRubric` her çağrıda `structuredClone` veya tipte `readonly criteria: readonly RubricCriterion[]` tipi kullansın.

### Sprint 172 OSS GA Backlog (LOW)

- **Bulgu 15 (Düzelt):** `'claude' as ProviderName` cast'ini kaldırın. Compiler `'claude'` literal'ını zaten `ProviderName` olarak kabul eder.
- **Bulgu 17 (Hizala):** `RuleEvolver.MIN_SAMPLES = 5` ile `OutcomeTracker.updateSynergy` threshold'unu (3) aynı sabit'e bağlayın (`shared-constants.ts` veya `routing-types.ts`).

### Mimari Bütünsel Öneri

`rubric-registry.ts`, `quality-assessor.ts` ve `outcome-tracker.ts` arasındaki rubric drift bir bütün olarak ele alınmalı. Önerilen yapı:

1. `rubric-registry.ts` üç farklı rubric tanımlar (AUDIT, DOC_WRITE, CODE) — single source of truth.
2. `quality-assessor.ts` rubric-aware olur; ağırlıkları registry'den okur.
3. `outcome-tracker.ts` qualityScore'u rubric ağırlıkları üzerinden alır; agent/skill performance hesabı task-type'a göre kategorize edilir (audit task'ları audit-yatkın agent'lara karşı değerlendirir, code agent'lara karşı değil).

Bu üç modül arasında **EvaluationRubric** tek geçer kontrat olur; doc-vs-code drift tamamen ortadan kalkar.

---

## 5. Kapsam Haritası (Files Covered)

| Dosya | LoC | Okundu | Not |
|-------|-----|--------|-----|
| `src/orchestra/task-router.ts` | 318 | Tam | 6-level routing, `detectTaskType` (routing taxonomy), `emitTimeoutEvents` — Bulgular #6, #7, #15. |
| `src/orchestra/outcome-tracker.ts` | 501 | Tam | `recordOutcome`, `calculateBonuses`, sprint recency, synergy matrix — Bulgular #4, #9, #13. |
| `src/orchestra/quality-assessor.ts` | 145 | Tam | Sabit ağırlıklı boyut puanlama, skill relevance heuristics — Bulgular #5, #12. |
| `src/orchestra/mid-sprint-adapter.ts` | 618 | Tam | Reroute kararı, `reconcileSpuriousNoGo`, `reconcileRubricNoGo` — Bulgular #3, #10, #16. |
| `src/orchestra/rule-evolver.ts` | 278 | Tam | Activation/exclusion/synergy rule türetimi, persist API — Bulgular #11, #17. |
| `src/orchestra/debt-manager.ts` | 599 | Tam | Fresh-eyes rotation, debt CRUD, decay — Bulgular #2, #8, #14. |
| `src/orchestra/rubric-registry.ts` | 315 | Tam | Task-type taxonomy, `isAuditTask`, `coverageOptional`, `getEffectClass` — Bulgular #1, #6, #18. |
| **Toplam** | **2774** | — | Kapsama boşluğu yok; 7/7 dosya char-level okundu. |
