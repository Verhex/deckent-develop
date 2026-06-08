# Sprint 171 — Task 171-006 Audit: core Havuz + Routing Modülleri

> **Audit-Only Rapor — Türkçe (zorunlu).** Hiçbir kaynak kod, test, config veya DB
> kaydı değiştirilmedi. Tüm okumalar read-only. Hedef kitle: deckent kod tabanını
> daha önce görmemiş bir mühendis raporu okuyup aksiyona geçebilmelidir.
>
> **Tarih:** 2026-05-15  •  **Audit Eden:** w-171-006 (architect + typescript-expert)
> •  **Kapsam:** `src/core/` altında havuz (agent-pool, skill-pool, skill-registry)
> ve routing (routing-engine, intent-classifier, activation-engine, agent/skill
> selector ve cache), provider (provider, provider-capabilities), bildirim
> (notifications, notification-dispatcher, notify*, notify-adapters/,
> notification-providers/), marketplace (marketplace/*), rule-templates ve
> manifest-migrator modülleri.

---

## 1. Bulgular

Bu bölüm bulunan tüm bulguları kategorize eder. Severity ataması Bölüm 2'de
toplu yapılır. Her bulguya bir kod (`B-NN`) verilmiştir; Kanıt bölümünden bu
kodlarla referans alınabilir.

### 1.1 CRITICAL — Doküman ile Kod Arasında Doğrudan Tutarsızlık

**B-01 — skill-sandbox güvenilir built-in skill listesi geçersiz id'ler içeriyor.**
`marketplace/skill-sandbox.ts` içinde tanımlanan `BUILTIN_TRUSTED_SKILLS` kümesi
`typescript-expert`, `react-expert`, `node-expert`, `test-expert`, `doc-expert`
olmak üzere beş id taşır. Halbuki repoya kayıtlı 21 built-in skill arasından bu
listeyle birebir eşleşen yalnızca **bir** tane vardır (`typescript-expert`).
Listede geçen `react-expert`, `test-expert`, `doc-expert` adlı skill repoda
**yoktur** — gerçek karşılıkları `react-specialist`, `testing-expert`,
`documentation-writer`. `node-expert` ise hiçbir karşılığı olmayan bir hayalet
id'dir. Sonuç: marketplace'ten ya da `.deckent/skills/` altından gelen bir
skill için `SkillSandbox.isTrusted()` çağrısı, gerçekte built-in olan
`react-specialist` veya `testing-expert` için `false` döner; bu skill'ler
gereksiz yere regex+AST taramasına tabi tutulur. Daha kötüsü: kötü niyetli bir
yayıncı, `BUILTIN_TRUSTED_SKILLS`'de geçen `node-expert` adıyla bir skill
publish ederse o skill otomatik `isTrusted=true` olur (skill ismi gerçek bir
built-in'den gelmediği halde sandbox bypass'lar).

**B-02 — routing-engine.ts başlığı "v2" diyor ama dönen sürüm "v3".**
Dosyanın 1. satırı `// ─── Routing Engine v2 ─────` başlığıyla açılır,
`routeTaskV2()` adlı fonksiyon `routingVersion: 'v3' as const` döndürür
(routing-engine.ts:222). `routing-types.ts:125` ise hem `'v2'` hem `'v3'`
değerlerine izin verir. CLAUDE.md'de "Layer 3 — unified routing (routeTaskV2)"
geçer. Fonksiyon adı, dosya başlığı, dönen sürüm ve doküman katmanı isimleri
arasında ayrışma vardır. Bir kullanıcı routingVersion alanını filtreleyip
`==='v2'` koşulunda davranış kurarsa hiçbir karar eşleşmez (hep `'v3'` döner).

### 1.2 HIGH — Mimari Tutarsızlık, Üretim Yolundan Düşmüş Modüller

**B-03 — `agent-cache.ts` ve `skill-cache.ts` modülleri üretim koduna bağlı
değil.** İki dosya toplam 367 LoC tutuyor (agent-cache 171, skill-cache 196),
LRU+TTL'li seçim önbelleği uyguluyor; ama `src/` altında hiçbir yerden import
edilmiyorlar. Yalnızca `tests/core/agent-cache.test.ts` ve
`tests/core/skill-cache.test.ts` test dosyalarından çağrılıyorlar (ayrıca
`tests/core/non-null-safety.test.ts` SkillLoadingCache import ediyor). Bu
modüller test coverage'ına %100 yakın katkıda bulunur ama gerçek üretim
hattında ölü kod gibi davranır. Coverage istatistiği bu modüller için
yanıltıcıdır — "kodun her satırı testlerle dokunulmuş" doğru, "kod üretimde
çalışıyor" yanlış.

**B-04 — İki paralel bildirim dispatcher sınıfı bir arada yaşıyor.**
`notifications.ts:39` içinde `NotificationDispatcher` sınıfı webhook/discord/
slack için ayrı provider setter'lar ve `NotificationEventType` tipini
(`sprint_complete | sprint_failed | task_nogo | usage_warning`) tanımlar.
`notification-dispatcher.ts:45` içinde ise yeni `NotifyDispatcher` sınıfı,
`NotificationEventName` tipiyle (`sprint-started | task-done | task-no-go |
sprint-finalized | human-checkpoint-required`) `addAdapter(NotificationAdapter)`
arayüzü ve throttle kuyruğu sunar. İki sınıf arasında bir köprü/migrasyon
yoktur, event şemaları kelime düzeyinde bile birbirine girer (`task-no-go`
tire ile, `task_nogo` alt çizgi ile). nervous/dispatcher.ts ve
core/panic-guard.ts iki sınıftan birini import eder; mimari kafa karıştırıcı,
yeni bir kullanıcı hangi dispatcher'ı geri çağıracağına karar veremez. Bu
ikiliği kullanıcı (Alperen) henüz birleştirmemiş; ADR-035 "DECKENT→USER:NOTIFY"
yeni sınıfı tanıtıyor ama eski sınıfın "deprecate" yazısı yok.

**B-05 — V1 selectAgent + V3 routeTaskV2 üretimde paralel kullanılıyor.**
`routing-engine.ts:2` başlık yorumu: "Replaces selectAgent() + selectSkills()
with a unified, intent-based decision." Buna rağmen
`orchestra/sprint-planner.ts:59` ve `orchestra/decision-steps/agent-step.ts:12`
hâlâ `import { selectAgent } from '../core/agent-selector.js'` ile V1
selektörü çağırır. Aynı anda routing-engine `resolveComposition` için
`skill-selector.ts:159` fonksiyonunu kullanır (routing-engine.ts:30).
Sonuç: üç ayrı seçim sistemi paralel yaşar — V1 `selectAgent` (anahtar kelime
puanı), V1 `selectSkills` (yarım kullanılır), V3 `routeTaskV2` (TaskDNA
tabanlı). Hangi sprint hangi sistemi seçer kullanıcının görüş alanında
değildir. ADR-028 (V1→V2 routing migration) "accepted" durumunda olduğu
halde migration tam değildir.

**B-06 — AST sandbox tehlikeli modül listesi eksik.**
`marketplace/skill-sandbox.ts:47-56` `DANGEROUS_MODULES` kümesi yalnızca
`child_process`, `fs`, `os`, `net` (her biri `node:` öneki dahil) içerir.
Eksik olan tehlikeli modüller: `http`, `https`, `dns`, `vm` (yeni VM context
ile rastgele kod yürütme!), `worker_threads` (Worker ile kod yürütme),
`cluster`, `inspector`, `dgram`, `tls`. Özellikle `vm` ve `worker_threads`,
sandbox'tan çıkmanın klasik yollarıdır: bir skill `import('vm').Script(...)`
ile yeni bir context açıp keyfi kod çalıştırabilir. Regex pass1 `eval()`,
`Function(` ve doğrudan `child_process` yakalar ama `vm`/`worker_threads`
hiçbir geçişte yakalanmaz. Aynı şekilde `process.env` yalnızca regex (line 36)
ile yakalanır; AST visitor (line 156-161) `process` üzerine property
erişimini kontrol etmez — `process['en'+'v']` veya `const p=process; p.env`
gibi basit obfuskasyon regex'i atlatır.

**B-07 — getDynamicExclusions deckent iç dizin isimleri için sabit kodlu.**
`activation-engine.ts:303-317` `src/orchestra/`, `src/cli/`, `src/dashboard/`
yollarını referans alarak frontend-designer/accessibility-auditor/
data-engineer gibi agent'ları otomatik dışlar. Bu deckent'in *kendi* dizin
yapısıdır. Deckent başka bir projeye kurulduğunda (Product-Not-Service —
ADR-033) bu dizin adları başka semantiği taşır veya hiç bulunmaz; dynamic
exclusion sessizce çalışmaz. ADR-039 "Self-Modifying Task Detection"
felsefesine aykırı: deckent dogfood ile end-user proje ayrımı yapılmamış.

**B-08 — selectAgentByFallback statik dal pool doğrulaması yapmıyor.**
`routing-engine.ts:167-174` çağıran taraf `activeAgentIds` setini sağlamadığı
durumda `AGENT_FALLBACK_CHAIN[intent]` zincirinin ilk elemanını veya
`'architect'` literalini doğrudan döndürür. Pool'a (agentPool Map) bu id'nin
gerçekten kayıtlı olduğuna dair bir kontrol yoktur. Pool'da olmayan bir
agentId, sonraki adımlarda (prompt builder, worker spawn) `undefined` veya
sessiz hata olarak yansır. Aynı fonksiyonun aktif yol kısmı (`activeAgentIds`
verildiğinde, line 70-74) zinciri doğrular ama ultimate fallback yine
doğrulanmamış `'architect'` döner — `'architect'` agent'ı disable
edilmişse/silinmişse çağrı silsilesi kırılır.

### 1.3 NORMAL — Tasarım Pürüzleri, Stat Tutarlılığı, Edge Case'ler

**B-09 — Agent/skill stats güncellemesi race-prone load→mutate→save.**
`agent-pool.ts:361-388` ve `skill-pool.ts:150-179` aynı pattern: pool'dan
agent/skill al, stats nesnesini mutate et, dosyaya yaz. Lock veya atomik write
yok. Paralel worker'lar (Wave aynı agent'ı seçen 2 task) finalize aşamasında
aynı agent.json'a yazarsa son yazan kazanır. outcome-tracker.ts (ayrı dosya)
sprint düzeyinde "doğru" başarı sayısını tutar, ama agent.json'daki
`stats.totalUses` driftler.

**B-10 — Skill stats çift defter — successCount + successRate.**
`skill-pool.ts:166` `prevSuccessCount = stats.successCount ?? Math.round(
stats.successRate * prevTotal)`. Yani eski manifestlerde sadece `successRate`
varsa, geri-türetme yapılır. Float yuvarlama kaybı nedeniyle 0.6667 * 3 = 2.0001
→ Math.round → 2 (tamam), ama 0.6666 * 3 = 1.9998 → 2 (yine tamam, sınırda
patlar). 10 sprint sonra successCount/successRate ikilisi sessizce ayrışabilir.

**B-11 — V1→V2 migrasyon "language/framework" skill'leri için aşırı genel
kurallar üretiyor.** `activation-engine.ts:164-180` (`migrateV1SkillToActivation`),
kategorisi `language` veya `framework` olan bir V1 skill için her trigger
adına `{ 'intent.primary': { $not: 'unknown' } }` koşullu bir kural ekler.
`$not: 'unknown'` neredeyse her task'ta tetiklenir — V1 skill her şeyden +3
puan alır. V2'nin amacı puanlamayı sıkılaştırmaktı; migrasyon bu hedefi
zayıflatıyor.

**B-12 — resolveOverrides "first-non-undefined wins" yorumla çakışıyor.**
`routing-engine.ts:457-486` jsdoc yorumu "Higher priority overrides win".
Implementation sırayı descending olarak sıralıyor (line 463) sonra
`forceAgent === undefined` koşulunda ilk dolu değeri alıyor. Eşit önceliklere
sahip iki override aynı seviyede ise kaynak listenin sırasına göre karar
verir — kullanıcı için belirsiz. `overrides[0]?.source ?? 'task-directive'`
gibi sıraya bağlı kayıtlar da OverrideSource raporlamasını yanıltır
(routing-engine.ts:132).

**B-13 — registry-client.ts retry/backoff yok.**
`marketplace/registry-client.ts:135-194` `_request` tek seferde HTTP/HTTPS
isteği yapar. 5xx veya `ECONNRESET` gibi geçici hatalarda yeniden deneme
yoktur. Karşılaştırma: `notification-providers/webhook.ts:51-63` aynı sınıfta
**2 deneme** uygular (webhook.ts:52 `for (let attempt = 0; attempt < 2;
attempt++)`). Marketplace OSS GA'da deckent.dev/registry erişilemediği zaman
CLI komutları sert düşer.

**B-14 — NotifyDispatcher.scheduleFlush kuyruk fail-safe değil.**
`notification-dispatcher.ts:147-154` `processing` bayrağı eşzamanlı flush'ı
önler, ama `flush()` (line 131-135) yalnızca tek bildirim çıkarır. İki ardışık
`scheduleFlush` çağrısı arasındaki yarış: setTimeout zincirleme akar ama
yapıştırıcı yok — bir bildirim arkada kalabilir. Düşük etkili (üretim
verisinde nadir) ama gözlenmemiş.

**B-15 — Intent keyword listesi `test` kelimesini iki yerde sayar.**
`intent-classifier.ts:23` `implementation` keyword'leri içinde `'test'`,
`'spec'`, `'coverage'`, `'vitest'` geçer (Sprint 148 yorumuyla
açıklanmış). `intent-classifier.ts:34` `OPERATION_KEYWORDS.test` aynı
kelimeleri tekrar puanlar. Bir task description "test coverage vitest"
içeriyorsa **hem** implementation primary intent'i hem operation `test`
ağırlığı çift sayılır. detectOperations ayrı bir alan üretir (operations
weight) — semantik olarak yanlış değil ama puan çift duyma yaratır.

**B-16 — provider-capabilities.ts sabit fiyat/context model-registry ile
çakışıyor olabilir.** `provider-capabilities.ts:22-47` claude $15/$75,
codex $2/$8, gemini $1.25/$10 fiyatları ve 200K/1.04M/1.05M context window
sabitleri tutar. DECKENT.md "ModelRegistry — tek doğruluk kaynağı (model-
registry.ts)" diyor. cost-config-loader.ts ve pricing-data-baseline.json gibi
ayrı dosyalar var. Şu an çakışma olmasa bile iki yerde tutulan fiyat çift
güncellenme ihtiyacı doğurur — Sprint 172 OSS GA'dan önce stale risk.

**B-17 — Skill-registry.ts ile skill-pool.ts paralel iki kayıt sistemi.**
`skill-registry.ts:22` `SkillRegistry` sınıfı `skill-registry.json` adlı
dosyaya `register/search/getPopular/getAll/remove/count` API'si sunar.
`skill-pool.ts:22` `SkillPoolManager` ise `.deckent/skills/{id}/manifest.json`
dizinine `loadSkills/getSkill/listSkills/listByCategory/saveSkill/removeSkill`
API'si sunar. İki sınıf farklı persist mekanizmasıyla **aynı** kavramı
(skill) yönetir. Hangi sınıf hangi senaryoda otoritedir, kayıt çakışırsa
hangisi kazanır — kod bu soruya cevap vermiyor.

### 1.4 LOW / INFO — İyileştirme Fırsatı, Doğruluk Notu

**B-18 — Built-in skill manifestlerinde `lastUsedInSprint: ""` LRU eviction
yanlış yargı verir.** Örnek: typescript-expert/manifest.json:64 `""` değeri.
`sprintNumber('')` = 0 (agent-pool.ts:28). LRU sıralamasında bu skill "en
eskisi" gibi görünür. agent-pool source==='builtin' korumalı (agent-pool.ts:342)
ama skill-pool.ts'de **cleanup metodu hiç yok** — skill için LRU eviction
mekanizması mevcut değil, sorun teorik kalır. Ama gelecekte skill LRU
eklenirse aynı tuzak.

**B-19 — Routing tag'larına `secondary` aktarımı eksik.**
`activation-engine.ts:66-72` `evaluateRuleViaSecondary` yalnızca rule.when'in
`intent.primary` alanını secondary listeye karşı test eder ve %50 puan döner.
Diğer alanlar (`domains`, `operations.type`, `complexity.estimatedSize`) için
secondary fallback yok. Çoklu domain'li task'larda secondary domain'lere
puan akmaz.

**B-20 — agent-pool.ts:62 constructor field-init pattern karışık.**
`constructor(projectRoot: string, maxTempAgents = 50)` içinde
`this.projectRoot = projectRoot` ataması var ama `private projectRoot:
string` deklarasyonu satır 66'da, satır 62 constructor'ından sonra. Çalışır
(TypeScript class field hoisting), ama okunabilirlik düşük; modern
parameter property kullanılsa daha temizdir.

**B-21 — bootstrapProviders skip mesajları ProviderName türünde olmayan
değerler kabul ediyor.** `provider.ts:578-582` `skipped.push({ name:
config.brain_provider, reason: ... })`. `brain_provider` ProviderName tipinde
olmak zorunda ama config tarafında string olabilir; çağıran iyi davranır
ama tip dar değildir. Burada minor; "config validator" tarafında
yakalandığını varsayar.

**B-22 — globMatch fonksiyonu agent-selector.ts:51'de regex injection
güvenli.** Önce karakter sınıfları escape ediliyor sonra `**`/`*` özel
karakterleri yerleştiriliyor. Doğru pattern, ama try/catch + `return false`
ile sessizce başarısızlık (line 59-61) — bozuk pattern'ler farkedilmez.

---

## 2. Severity

| Kod | Bulgu Özeti | Severity | OSS GA Blocker? |
|-----|-------------|----------|-----------------|
| B-01 | skill-sandbox trusted built-in id'leri 4/5 hayalet | **CRITICAL** | Evet — sahte `node-expert` publish edilirse otomatik trust → güvenlik açığı |
| B-02 | routing-engine "v2" başlığı vs `'v3'` dönüş | **CRITICAL** | Hayır (doğrudan zarar yok) ama kullanıcı/AI hatalı dal seçimi yapabilir |
| B-03 | agent-cache + skill-cache üretimden bağlantısız | HIGH | Hayır ama coverage yalanı (~%X) — beta.2 öncesi karar gerekli |
| B-04 | İki paralel NotificationDispatcher sınıfı | HIGH | Hayır ama OSS GA "hangi adapter'ı kayıt edeyim" sorusu kullanıcıyı zora sokar |
| B-05 | V1 selectAgent + V3 routeTaskV2 paralel kullanım | HIGH | Hayır ama ADR-028 "accepted" iddiası kod gerçeği ile çelişiyor |
| B-06 | AST sandbox `vm`/`worker_threads`/`https` eksik | HIGH | **Evet** — marketplace public olduğunda sandbox bypass yolu |
| B-07 | getDynamicExclusions deckent-iç scope sabit kodlu | HIGH | Hayır ama Product-Not-Service mimari boyutu |
| B-08 | selectAgentByFallback static dal pool kontrolsüz | HIGH | Hayır ama nadir sprint crash sebebi |
| B-09 | Agent/skill stats load→mutate→save race | NORMAL | Hayır |
| B-10 | Skill stats successCount/successRate çift defter | NORMAL | Hayır |
| B-11 | V1→V2 language/framework migrasyonu aşırı genel | NORMAL | Hayır |
| B-12 | resolveOverrides "first-non-undefined wins" doğruluk | NORMAL | Hayır |
| B-13 | Marketplace registry-client retry yok | NORMAL | Hayır ama OSS GA CLI UX |
| B-14 | NotifyDispatcher scheduleFlush kuyruk yarışı | NORMAL | Hayır |
| B-15 | Intent keyword `test` çift sayım | NORMAL | Hayır |
| B-16 | provider-capabilities sabit fiyat/context drift riski | NORMAL | Hayır ama beta.2 dokümantasyon yarışıyla çakışır |
| B-17 | SkillRegistry vs SkillPoolManager iki kayıt sistemi | NORMAL | Hayır |
| B-18 | Skill manifest `lastUsedInSprint: ""` LRU tuzağı | LOW | Hayır |
| B-19 | activation-engine secondary fallback dar | LOW | Hayır |
| B-20 | agent-pool constructor field-init karışık | LOW | Hayır |
| B-21 | bootstrapProviders skip mesajı tip darlığı | LOW | Hayır |
| B-22 | globMatch silent catch | LOW | Hayır |

**Özet:** 2 CRITICAL + 6 HIGH + 9 NORMAL + 5 LOW = **22 bulgu**.
2 OSS-GA blocker (B-01, B-06). Geri kalan 20 bulgu Sprint 172 OSS GA
sonrasına ertelenebilir, ama HIGH bulguların 4'ü (B-04, B-05, B-07, B-08)
mimari netlik için beta.2'den önce karar gerektirir.

---

## 3. Kanıt

Her bulgu için en az bir `dosya:satır` referansı. Kanıt satırları audit anında
(2026-05-15) read-only okundu, değiştirilmedi.

### B-01 — skill-sandbox trusted id drift

`src/core/marketplace/skill-sandbox.ts:197-203`
```typescript
const BUILTIN_TRUSTED_SKILLS = new Set([
  'typescript-expert',
  'react-expert',       // ← built-in id mevcut değil; gerçek: 'react-specialist'
  'node-expert',        // ← built-in id mevcut değil; karşılık yok
  'test-expert',        // ← built-in id mevcut değil; gerçek: 'testing-expert'
  'doc-expert',         // ← built-in id mevcut değil; gerçek: 'documentation-writer'
]);
```
Gerçek 21 built-in skill listesi (`src/core/builtins/skills/` altındaki
dizinler): accessibility-expert, anthropic-sdk, api-builder, ci-testing,
code-simplifier, database-migration, devops-engineer, docker-expert,
documentation-writer, frontend-design, git-expert, graphql-expert,
migration-expert, monorepo-expert, performance-optimizer, python-expert,
**react-specialist**, security-specialist, system-architect, **testing-expert**,
**typescript-expert**. Sadece son üçü trust listesindeki adlarla doğrudan
örtüşür (`typescript-expert`); diğer ikisi (`react-specialist`,
`testing-expert`) sandbox listede yanlış adla yazılı (`react-expert`,
`test-expert`).

### B-02 — routing-engine başlık/sürüm drift

`src/core/routing-engine.ts:1`
```typescript
// ─── Routing Engine v2 ──────────────────────────────────────────────────────
// Layer 3: The main routing orchestrator.
// Replaces selectAgent() + selectSkills() with a unified, intent-based decision.
```

`src/core/routing-engine.ts:222`
```typescript
    routingVersion: 'v3' as const,
```

`src/core/routing-types.ts:125`
```typescript
  /** Routing engine version used to produce this decision */
  routingVersion: 'v2' | 'v3';
```

`/workspace/CLAUDE.md` (proje doküman):
```
routing-engine.ts: Layer 3 — unified routing (routeTaskV2), confidence scoring, override resolution
```
"v2" başlığı, fonksiyon adı (`routeTaskV2`), dönen sürüm (`'v3'`) ve CLAUDE.md
("Layer 3") arasında uyumsuzluk.

### B-03 — agent-cache / skill-cache yetim modüller

`src/core/agent-cache.ts:32` — sınıf tanımı:
```typescript
export class AgentSelectionCache {
```

Üretim importları (her arama, src/ altında, `*.test.ts` hariç):
```
$ grep -rn "agent-cache\|skill-cache" /workspace/src --include="*.ts"
(boş — hiçbir sonuç yok)
```

Test importları (kanıt: sadece testler bu modüllere bağlı):
- `tests/core/agent-cache.test.ts:2` — `import { AgentSelectionCache } from '../../src/core/agent-cache.js'`
- `tests/core/skill-cache.test.ts:3` — `import { SkillLoadingCache } from '../../src/core/skill-cache.js'`
- `tests/core/non-null-safety.test.ts:12` — `import { SkillLoadingCache } from '../../src/core/skill-cache.js'`

### B-04 — İki paralel NotificationDispatcher

`src/core/notifications.ts:4-8` — eski tip:
```typescript
export type NotificationEventType =
  | 'sprint_complete'
  | 'sprint_failed'
  | 'task_nogo'
  | 'usage_warning';
```

`src/core/notification-dispatcher.ts:13-18` — yeni tip:
```typescript
export type NotificationEventName =
  | 'sprint-started'
  | 'task-done'
  | 'task-no-go'
  | 'sprint-finalized'
  | 'human-checkpoint-required';
```

`src/core/notifications.ts:39` — eski sınıf:
```typescript
export class NotificationDispatcher {
```
`src/core/notification-dispatcher.ts:45` — yeni sınıf:
```typescript
export class NotifyDispatcher {
```

İki sınıfı birden kullanan dosyalar (kanıt: çift mimari):
```
$ grep -rl "NotificationDispatcher\|NotifyDispatcher" /workspace/src
src/mcp/server.ts
src/core/notify.ts
src/nervous/dispatcher.ts
src/core/notification-dispatcher.ts
src/core/notifications.ts
src/core/notify-registry.ts
src/core/panic-guard.ts
```

### B-05 — V1 selectAgent paralel kullanım

`src/core/routing-engine.ts:2`
```typescript
// Layer 3: The main routing orchestrator.
// Replaces selectAgent() + selectSkills() with a unified, intent-based decision.
```

Ama hâlâ `selectAgent` import edenler:
- `src/orchestra/sprint-planner.ts:59` — `import { selectAgent } from '../core/agent-selector.js';`
- `src/orchestra/decision-steps/agent-step.ts:12` — `import { selectAgent } from '../../core/agent-selector.js';`

`src/core/routing-engine.ts:30` — V3'ün `resolveComposition` için V1 selector'a
bağlılığı:
```typescript
import { resolveComposition } from './skill-selector.js';
```

### B-06 — AST sandbox eksik tehlikeli modüller

`src/core/marketplace/skill-sandbox.ts:47-56`
```typescript
const DANGEROUS_MODULES = new Set([
  'child_process',
  'node:child_process',
  'fs',
  'node:fs',
  'os',
  'node:os',
  'net',
  'node:net',
]);
```
`vm`, `node:vm`, `worker_threads`, `node:worker_threads`, `http`, `node:http`,
`https`, `node:https`, `dns`, `cluster`, `inspector`, `dgram`, `tls` listede
**yok**. Üstelik `process.env` AST visitor'ında yalnızca eval/Function
property access kontrol eder (skill-sandbox.ts:156-161):
```typescript
if (ts.isPropertyAccessExpression(node)) {
  const objName = ts.isIdentifier(node.expression) ? node.expression.text : '';
  if ((objName === 'global' || objName === 'globalThis') && DANGEROUS_CALLS.has(node.name.text)) {
    violations.push(`AST: Property access ${objName}.${node.name.text}`);
  }
}
```
`process.env` ve `process['env']` AST'de yakalanmaz; sadece pass1 regex'inde
(skill-sandbox.ts:36) ham `process.env` deseni yakalanır.

### B-07 — getDynamicExclusions hard-coded scope

`src/core/activation-engine.ts:303-317`
```typescript
for (const dir of scopeDirs) {
  if (dir.startsWith('src/orchestra/') || dir === 'src/orchestra') {
    exclusions.add('frontend-designer');
    exclusions.add('accessibility-auditor');
  }
  if (dir.startsWith('src/cli/') || dir === 'src/cli') {
    exclusions.add('frontend-designer');
    exclusions.add('accessibility-auditor');
    exclusions.add('migration-specialist');
  }
  if (dir.startsWith('src/dashboard/') || dir === 'src/dashboard') {
    exclusions.add('data-engineer');
    exclusions.add('migration-specialist');
  }
}
```

### B-08 — selectAgentByFallback statik dal kontrolsüz

`src/core/routing-engine.ts:167-174`
```typescript
} else if (agentId === null) {
  // No activeAgentIds provided — use static fallback
  const chain = AGENT_FALLBACK_CHAIN[taskDNA.intent.primary] ?? ['architect'];
  agentId = chain[0] ?? 'architect';
  agentScore = 50;
  agentConfidence = 'low';
  reasoning.push(`Agent static fallback: '${agentId}' (intent=${taskDNA.intent.primary})`);
}
```
`chain[0]` veya `'architect'`'in agentPool'da olup olmadığını sorgulamıyor.

### B-09 — Agent stats load-mutate-save

`src/core/agent-pool.ts:361-388` (full `updateAgentStats`):
```typescript
updateAgentStats(id, evaluation, coverage, sprintId): void {
  const agent = this.getAgent(id);          // disk read
  if (!agent) return;
  const stats = agent.stats ?? createDefaultStats();
  // ... mutate ...
  this.saveAgent(agent);                    // disk write — no lock
}
```

`src/core/skill-pool.ts:150-179` (full `updateSkillStats` — aynı pattern,
ek olarak çift defter):
```typescript
const prevSuccessCount = stats.successCount ?? Math.round(stats.successRate * prevTotal);
```

### B-12 — resolveOverrides yorum vs implementation

`src/core/routing-engine.ts:455-486`
```typescript
/**
 * Resolve user overrides by priority (task > sprint > project).
 * Higher priority overrides win.
 */
export function resolveOverrides(overrides: UserOverride[]): ... {
  const sorted = [...overrides].sort((a, b) => b.priority - a.priority);
  let forceAgent: string | undefined;
  ...
  for (const override of sorted) {
    if (override.forceAgent !== undefined && forceAgent === undefined) {
      forceAgent = override.forceAgent;   // ← "first non-undefined wins"
    }
    ...
  }
}
```

### B-13 — registry-client tek deneme

`src/core/marketplace/registry-client.ts:151-194` — `_request` içinde retry
yok, tek `req.end()` çağrısı, hata olduğunda direkt `reject` çağırılır.
Karşılaştırma — `src/core/notification-providers/webhook.ts:51-66`:
```typescript
// 1 retry (2 attempts total)
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const result = await this.httpClient.post(url, body, {...});
    ...
    return;
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
  }
}
```

### B-15 — Intent classifier `test` çift sayım

`src/core/intent-classifier.ts:23` — implementation keyword'leri:
```typescript
implementation: ['implement', 'add', 'create', 'build', 'feature', 'endpoint', 'command', 'module', 'function', 'adaptive', 'timeout', 'estimator', 'engine', 'validator', 'test', 'spec', 'coverage', 'vitest', 'types'],
```
`src/core/intent-classifier.ts:34` — operation keyword'leri:
```typescript
test: ['test', 'spec', 'coverage', 'verify', 'assert', 'validate'],
```

### B-16 — provider-capabilities sabit fiyat

`src/core/provider-capabilities.ts:22-47`
```typescript
const PROVIDER_CAPABILITIES: Record<ProviderName, ProviderCapability> = {
  claude:  { ... maxContextTokens: 200_000,    costPerMillionTokens: { input: 15,   output: 75 } },
  codex:   { ... maxContextTokens: 1_047_576,  costPerMillionTokens: { input: 2,    output: 8 } },
  gemini:  { ... maxContextTokens: 1_048_576,  costPerMillionTokens: { input: 1.25, output: 10 } },
};
```
DECKENT.md "ModelRegistry … single source of truth (model-registry.ts)" der.
Bu dosya bağımsız sabit kaynak — drift potansiyeli.

### B-18 — Built-in skill manifest stats placeholder

`src/core/builtins/skills/typescript-expert/manifest.json:59-65`
```json
"stats": {
  "totalUses": 0,
  "successCount": 0,
  "successRate": 0,
  "avgScore": 0,
  "lastUsedInSprint": ""
}
```
`src/core/agent-pool.ts:28` — `sprintNumber('')` 0 döner; LRU sıralamasında
en eski görünür.

### Doğrulama sayım kanıtları

`ls /workspace/src/core/builtins/agents/ | wc -l` → **15** (DECKENT.md
iddiası: "15 built-in agents" ✓)
`ls /workspace/src/core/builtins/skills/ | wc -l` → **21** (DECKENT.md
iddiası: "21 built-in skills" ✓)

### Provider fallback chain — KOD DOĞRULUĞU (positive finding)

`src/core/provider.ts:361-416` `resolveProviderWithFallback`:
- Step 1: primary deneme
- Step 2: primary unavailable → fallback_provider kontrol
- Step 3: fallback registered değilse → throw
- Step 4: fallback unavailable → throw
- Step 5: model remap + return

**Tek-retry, no-loop garantisi sağlanmış.** Bu pozitif bulgu — DIRECTIVES'in
"tek retry sonsuz döngü yok" beklentisi kod düzeyinde karşılanıyor.

---

## 4. Öneriler

Önerileri severity sırasına göre verilmiştir. Her öneri **kim/ne yapacak**,
**neden gerekli** ve **hangi sprintte** sorularına cevap verir.

### Sprint 172 OSS GA Öncesi (BLOCKER)

**Ö-01 (CRITICAL — B-01) skill-sandbox `BUILTIN_TRUSTED_SKILLS` listesini gerçek
built-in id'lerle eşle.** Kim/ne: bir worker (refactorer + security-specialist
agent), `BUILTIN_TRUSTED_SKILLS`'i `src/core/builtins/skills/` dizinindeki 21
gerçek id ile doldursun. İdeal olarak runtime'da `BUILTIN_TRUSTED_SKILLS =
new Set(fs.readdirSync(builtinsSkillsDir))` ile dinamik üretilsin — sonradan
yeni built-in eklenirse otomatik kapsanır. Neden: sahte `node-expert` adıyla
publish edilen bir skill bypass'a yol açar, OSS GA "marketplace public"
hedefinin minimum güvenlik sözleşmesidir.

**Ö-02 (CRITICAL — B-06) AST sandbox tehlikeli modül listesini genişlet.**
Kim/ne: security-auditor agent, `DANGEROUS_MODULES`'a `vm`, `node:vm`,
`worker_threads`, `node:worker_threads`, `http`, `node:http`, `https`,
`node:https`, `dns`, `node:dns`, `cluster`, `node:cluster`, `inspector`,
`node:inspector`, `dgram`, `tls` ekleyip; AST visitor'da `process` üzerine
property access'i (`process.env`, `process['env']`) DANGEROUS_PROPERTY_ACCESS
şeklinde yeni bir set ile kontrol etsin. Neden: marketplace public açıldığında
sandbox sözleşmesinin uygulanabilirliği bunlara bağlı.

### Sprint 172 OSS GA Sırası (HIGH — beta.2 öncesi tercih edilir)

**Ö-03 (B-02) routing-engine sürüm tutarlılığı.** Header yorumu, fonksiyon adı
ve dönen `routingVersion` değerini bir karara bağla — ya hepsi `v3` (en
güncel), ya da `routing-types.ts`'den `'v2'` literal'ini düşür. CLAUDE.md'deki
"Layer 3" yazısıyla hizalanmalı. Sprint 172 doc-reorg ile birlikte yapılır.

**Ö-04 (B-03) agent-cache + skill-cache karar.** İki opsiyon: (a)
routing-engine V3'e cache eklenir (V3'ün hot-path'i fast-replan sırasında
agent re-selection yaparsa), (b) dosyalar SİL + testler dispose. Hangi opsiyon
seçildiğinde de ADR-038 dispose formatıyla kayıt altına alınmalı. Coverage
oranı düzeltme tarafına yansır.

**Ö-05 (B-04) NotificationDispatcher mimarisi netleşsin.** Eski sınıf
(`notifications.ts`) deprecate yorumuyla işaretle veya yeni sınıfın
(`notification-dispatcher.ts`) içine merge et. Olası yol: yeni sınıf
`NotifyDispatcher` her şeyi yönetir, eski sınıfın provider tabanlı API'sı
webhook/discord/slack için adapter olarak yeni sınıfa enjekte edilir. ADR-035
güncellenmelidir.

**Ö-06 (B-05) V1 selectAgent kaldırma kararı.** sprint-planner.ts:59 ve
decision-steps/agent-step.ts:12'deki `selectAgent` çağrılarını V3
`routeTaskV2` ile değiştir. Migration tamamlandığında `agent-selector.ts`
silinebilir (ADR-038 dispose). ADR-028 statüsü "accepted" olarak korunur.

**Ö-07 (B-07) getDynamicExclusions deckent-özel kısmı izole et.** Şu anki
hard-coded `src/orchestra/`, `src/cli/`, `src/dashboard/` map'i deckent'in
**kendi** project config'inde tutulmalı (örn. `.deckent/dynamic-exclusions.json`),
core/activation-engine.ts ise bu mapping'i runtime'da yüklemeli. ADR-033
Product-Not-Service hizalaması.

**Ö-08 (B-08) selectAgentByFallback static dal pool kontrolü.** Statik
fallback dönmeden önce pool'da agent'ın var olduğunu doğrula; yoksa pool'un
varsa "any enabled architect"ı, o da yoksa pool'un ilk enabled agent'ını
kullan. Aksi halde sprint patlaması (rare ama oluşur).

### Sprint 173+ (NORMAL — eski borç netleştirme)

**Ö-09 (B-09, B-10) Stats persistence atomic write + tek defter.**
`safeWriteFileSync`/`atomicWriteFileSync` deseni ile agent.json/skill.json
yazımları yarış-güvenli olsun. successCount/successRate ikiliği için tek
otoriter alan seç (successCount tut, successRate compute-on-read).

**Ö-10 (B-11) V1→V2 migrasyonu sıkılaştır.** `migrateV1SkillToActivation`
language/framework kategorileri için `{ 'intent.primary': { $not: 'unknown' } }`
yerine triggerlardan türetilen daha spesifik kurallar üret (örn. trigger
listesinde gerçek bir IntentType varsa onu hedefle).

**Ö-11 (B-12) resolveOverrides "first wins" davranışını dokümante et veya
priority-strict yap.** Aynı priority'de iki override varsa hata fırlat (strict
mode) veya jsdoc'a "ties broken by input order" açıkla. Beklenti sözleşmesi
yazılı olsun.

**Ö-12 (B-13) registry-client retry desteği ekle.** webhook.ts pattern'ı
kopyala: 2 deneme, exponential backoff (500ms, 1500ms). 5xx ve
ECONNRESET/ETIMEDOUT için yeniden dene. 4xx'te yeniden deneme yok.

**Ö-13 (B-14) NotifyDispatcher scheduleFlush yarışını kapat.** `processing`
bayrağı yerine `Promise` chain veya queue'ya enqueue-time'da timer'ı sıraya
sok. Düşük etkili ama gözlenebilir hata.

**Ö-14 (B-15) intent-classifier `test/spec/coverage/vitest` kelimelerini
INTENT_KEYWORDS.implementation'dan çıkar.** Bunlar zaten operations.test
puanlamasında ve detectTags(`test-coverage`) tarafından yakalanır.

**Ö-15 (B-16) provider-capabilities ile model-registry birleşmesi.**
provider-capabilities.ts'in fiyat/context tablosu model-registry.ts'in
default'larını referans alsın; aksi halde her ikisini güncelleme zorunluluğu.

**Ö-16 (B-17) SkillRegistry ile SkillPoolManager arasındaki rol netleşsin.**
Hangi sınıf hangi senaryoda otoritedir? SkillRegistry'nin tek dosya
(`skill-registry.json`) tabanlı API'si SkillPoolManager dizin-tabanlı API'sının
"index/cache" katmanı olabilir, yoksa SkillRegistry silinmelidir.

### Sprint 173+ (LOW — gözden geçirme)

**Ö-17 (B-18) Built-in skill manifestlerine `lastUsedInSprint: "sprint-000"`
sentinel değer ata.** Boş string yerine sprint-000 ile LRU sıralamasında
"en eski" değil "ilkin" görünür.

**Ö-18 (B-19) activation-engine secondary fallback diğer alanlara genişlesin.**
`evaluateRuleViaSecondary` yalnızca intent.primary kontrol ediyor; domains ve
operations alanlarına da %50 puan uygulanabilir.

**Ö-19 (B-20) agent-pool constructor TypeScript parameter property kullansın.**
`constructor(private projectRoot: string, private maxTempAgents = 50)` —
satır 66'daki ayrı field deklarasyonu kaldırılır.

**Ö-20 (B-21) bootstrapProviders skip mesajlarını ProviderName tip-darlığıyla
yaz.** `config.brain_provider`'ı config validator'ün ProviderName olarak
zorunlu kılması veya skip alanı `name: string` esnetilmesi.

**Ö-21 (B-22) globMatch silent catch yerine log.** debugLog ile bozuk pattern
geliştiriciye sinyal versin.

---

## 5. Kapsam Haritası

Bu modül-task'ın denetim altına aldığı kaynak dosyaların eksiksiz listesi.
Hiçbir dosya başka bir audit raporunda mükerrer denetlenmedi (Task 1-14
modül-derin paylaşılan, dosya-paylaşımı yok). Cross-cut bulgular Task 15-22 ve
synthesis Task 29 tarafından konsolide edilecektir.

| Dosya | LoC | Audit Boyutu |
|-------|-----|--------------|
| `src/core/agent-pool.ts` | 491 | AgentPoolManager, LRU eviction, validation, stats |
| `src/core/agent-selector.ts` | 197 | V1 selectAgent, keyword scoring, suggestNewAgent |
| `src/core/agent-cache.ts` | 171 | AgentSelectionCache (yetim) |
| `src/core/agent-types.ts` | 96 | AgentDefinition tip, default stats |
| `src/core/skill-pool.ts` | 306 | SkillPoolManager, validation, stats |
| `src/core/skill-registry.ts` | 134 | SkillRegistry (paralel mimari) |
| `src/core/skill-selector.ts` | 199 | V1 selectSkills, resolveComposition |
| `src/core/skill-cache.ts` | 196 | SkillLoadingCache (yetim) |
| `src/core/skill-types.ts` | 114 | SkillDefinition tip |
| `src/core/provider.ts` | 609 | ProviderAdapter, ProviderRegistry, detection, fallback chain, bootstrap |
| `src/core/provider-capabilities.ts` | 156 | Provider capability matrix (fiyat/context) |
| `src/core/routing-engine.ts` | 625 | routeTaskV2, selectBestAgent, selectBestSkills, calculateSkillBudget, resolveOverrides, calculateConfidence, assessContextFit |
| `src/core/routing-types.ts` | 213 | TaskDNA, ActivationConfig, RoutingDecision tipleri |
| `src/core/intent-classifier.ts` | 466 | classifyIntent + detectPrimaryIntent + detectSecondaryIntents + detectDomains + detectOperations + analyzeComplexity + detectTags + detectSubIntent |
| `src/core/activation-engine.ts` | 320 | evaluateActivation, evaluateRule, evaluateRuleViaSecondary, V1→V2 migration, getDynamicExclusions |
| `src/core/condition-evaluator.ts` | 160 | path-based condition engine ($gt, $contains, $and, $or) |
| `src/core/manifest-migrator.ts` | 63 | needsMigration, isV2Manifest, migrateAgentManifest, migrateSkillManifest |
| `src/core/notifications.ts` | 118 | NotificationDispatcher (eski) |
| `src/core/notification-dispatcher.ts` | 199 | NotifyDispatcher (yeni — ADR-035) |
| `src/core/notification-config.ts` | 95 | config tip + parse |
| `src/core/notify.ts` | 102 | notify() global entry point + notifyAsync |
| `src/core/notify-registry.ts` | 42 | global NotifyDispatcher singleton |
| `src/core/notify-adapters/cli-adapter.ts` | 79 | parent-tty fd write |
| `src/core/notify-adapters/file-adapter.ts` | 41 | JSONL append |
| `src/core/notify-adapters/mcp-adapter.ts` | 84 | MCP loggingMessage |
| `src/core/notification-providers/discord.ts` | 110 | Discord webhook embed builder |
| `src/core/notification-providers/slack.ts` | 95 | Slack webhook builder |
| `src/core/notification-providers/webhook.ts` | 90 | Generic webhook + 2-retry |
| `src/core/marketplace/dependency-resolver.ts` | 271 | skill dependency graph |
| `src/core/marketplace/marketplace-auth.ts` | 150 | auth token storage |
| `src/core/marketplace/rating-system.ts` | 200 | rating CRUD |
| `src/core/marketplace/registry-client.ts` | 195 | remote registry HTTP client |
| `src/core/marketplace/skill-sandbox.ts` | 390 | regex+AST 2-pass sandbox, trust set, quarantine |
| `src/core/rule-templates/auditor.template.md` | (md) | template — kod denetimi yok, içerik yorum |
| `src/core/rule-templates/brain.template.md` | (md) | template |
| `src/core/rule-templates/worker-default.template.md` | (md) | template |
| `src/core/builtins/agents/*/agent.json` (15) | — | manifest count doğrulaması (DECKENT.md vs gerçek) |
| `src/core/builtins/agents/*/PROMPT.md` (15) | — | sayım doğrulaması |
| `src/core/builtins/skills/*/manifest.json` (21) | — | sayım + id drift doğrulaması (B-01) |
| `src/core/builtins/skills/*/SKILL.md` (20, ci-testing hariç) | — | sayım |
| **TOPLAM (.ts dosyaları)** | **~6777** | 31 modül `.ts` dosyası dahil |
| **TOPLAM (manifest/md)** | — | 15 agent + 21 skill manifest + 4 prompt/skill md + 3 rule template |

**Bu kapsam dışında kalan ve başka task'lara devredilen alanlar:**
- `src/core/types.ts`, `*-types.ts` (Task 4 — core Types + Config)
- `src/core/config*.ts`, `model-registry.ts`, `mode-presets.ts` (Task 4)
- `src/core/memory-*.ts` (Task 5 — Memory Subsystem)
- `src/core/plugin-loader.ts`, `plugin.ts`, `plugin-hooks.ts` (sınır — plugin loading
  marketplace ile etkileşse de plugin lifecycle Task 6 dışında, Task 4'e
  taşınabilir; bu task plugin-loader'ı yalnızca skill-sandbox bağlantısı
  açısından gözlemledi)
- `src/core/notification-*.ts` dışındaki tüm dosyalar (zaten yukarıdaki tabloda)
- ADR/ROUTING DB karar bütünlüğü (Task 28)

**Kapsam-Doğrulama Notu:** Yukarıdaki tablo, plan dosyasının Task 171-006
runbook'unda belirtilen tüm modülleri kapsar. Synthesis Task 29
coverage-doğrulama bölümünde diğer modül-task'lar (Task 1-14) ile
"dosya-bazlı `find src/core -name '*.ts'`" diff'i yapıldığında bu task'ın
beklenen union katkısı yukarıdaki 31 `.ts` + 4 `.md` template + 36 manifest
(15+21) dosya kümesidir. Eksik veya çakışan bir dosya raporlanırsa coverage-
gap olarak işaretlenir.

---

## Audit Sonucu (özetleyici)

- **Toplam bulgu:** 22 (2 CRITICAL, 6 HIGH, 9 NORMAL, 5 LOW)
- **OSS GA blocker:** 2 (B-01 sandbox trusted id drift, B-06 AST dangerous
  modules eksik) — Sprint 172 öncesi mutlaka kapatılmalı
- **Pozitif bulgu:** Provider fallback chain `resolveProviderWithFallback`
  DIRECTIVES'in "tek retry sonsuz döngü yok" beklentisini doğru karşılıyor
- **Doğrulanan iddialar:** 15 agent ✓, 21 skill ✓, 3 provider ✓
- **Karşıt iddialar:** routing-engine "v2"/`'v3'` drift, sandbox trusted set'in
  4/5 hayalet id'si, agent-cache + skill-cache yetim üretim hattı
- **Bir sonraki adım:** Synthesis (Task 29) bu raporun B-01 ve B-06'sını
  Sprint 172 OSS-GA blocker olarak ayrı bölüme alır; geri kalan 20 bulgu
  prioritized backlog'a girer. B-04/B-05/B-07/B-08 mimari netlik için
  beta.2 öncesi karar gerektirir.

*Rapor sonu — 2026-05-15 — w-171-006*
