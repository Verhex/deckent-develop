# Görev Yönlendirme — Per-Task Agent, Skill ve Provider Seçimi

deckent'te her görev, kendine özgü bir agent, skill seti ve provider ile çalışır. Bu seçim otomatik ve çok katmanlıdır: görevi statik kurallara değil, görevin içeriğine göre anlamsal olarak değerlendirir. Bu belge yönlendirme mimarisini, `TaskDNA` yapısını ve güven (confidence) mekanizmasını açıklar.

---

## Yönlendirme Sistemi — Genel Bakış

Görev yönlendirme şu iki katmandan oluşur:

```
task-router.ts         → per-task provider, auth-mode, timeout hesaplama
      │
      └── routing-engine.ts::routeTaskV2()   → 3-katman yönlendirme
            ├── Layer 1: intent-classifier.ts::classifyIntent()   → TaskDNA
            ├── Layer 2: activation-engine.ts::evaluateActivation() → agent/skill skorları
            └── Layer 3: routing-engine.ts seçim algoritması     → RoutingDecision
```

### `src/orchestra/task-router.ts` — Per-Task Yönlendirici

`task-router.ts`, her görev için şunları belirler:
- **Provider**: `config.worker_provider`, direktif `- Provider:` override'ı, skill routing config
- **Auth mode**: `task.authMode` (DIRECTIVES) > `config.auth_mode` > `'subscription'` öncelik sırası (ADR-076)
- **Timeout tahmini**: `brainEstimateTimeout()` — geçmiş sprint verisi + görev büyüklüğüne göre

```typescript
// src/orchestra/task-router.ts
export interface TaskRouting {
  provider: ProviderName;
  agent: string;
  skills: string[];
  reason: string;
  timeoutSeconds?: number;
  authMode: 'subscription' | 'api';
}
```

---

## Katman 1: Intent Sınıflandırıcı — `classifyIntent()`

```typescript
// src/core/intent-classifier.ts
export function classifyIntent(task: {
  title: string;
  description: string;
  scope: TaskScope;
}): TaskDNA
```

Bu fonksiyon bir görevi `TaskDNA` yapısına dönüştürür. Görevin başlık ve açıklamasındaki anahtar kelimeler, kapsam dizinleri ve dosya uzantıları birlikte değerlendirilir.

### TaskDNA Yapısı

```typescript
// src/core/routing-types.ts
export interface TaskDNA {
  intent: {
    primary: IntentType;      // ana niyet (örn. 'bugfix', 'documentation')
    secondary: IntentType[];  // ikincil niyetler
    confidence: number;       // 0.0-1.0 arası güven skoru
  };
  subIntent?: SubIntentType;   // 'types' | 'config' | 'routing' | 'observer' | ...
  tags: string[];              // çapraz kesim etiketleri (örn. 'test-coverage')
  domains: Array<{ name: string; weight: number }>;    // alan adı + ağırlık
  operations: Array<{ type: OperationType; weight: number }>;  // create/modify/delete/...
  complexity: {
    fileCount: number;
    moduleCount: number;
    crossCutting: boolean;
    estimatedSize: TaskSize;   // 'trivial' | 'small' | 'medium' | 'large' | 'epic'
  };
  scope: {
    writeRatio: Record<string, number>;  // dizin → yazma oranı
    primaryWriteTarget: string;
    testWriteRatio: number;              // 0.0-1.0
  };
}
```

### IntentType Kataloğu

12 intent tipi tanımlanmıştır:

| Intent | Tetikleyici Anahtar Kelimeler |
|--------|-------------------------------|
| `implementation` | implement, add, create, build, feature, module |
| `bugfix` | fix, bug, error, crash, regression, wire, runtime |
| `refactor` | refactor, cleanup, extract, split, consolidate |
| `documentation` | doc, readme, changelog, guide, jsdoc, güncelleme |
| `security` | security, auth, jwt, csrf, owasp, vulnerability |
| `devops` | ci, pipeline, deploy, docker, github actions |
| `performance` | performance, optimize, cache, benchmark, bottleneck |
| `design` | ui, ux, component, css, theme, responsive |
| `migration` | migrate, upgrade, schema, convert, transform |
| `architecture` | architecture, adr, roadmap, system design |
| `config` | config, setting, env, flag, parameter |
| `unknown` | (hiçbiri eşleşmezse) |

Kapsam sinyalleri anahtar kelime sinyallerine eklenir: örneğin `src/dashboard/` yolu `'design'` intent'ini +4 ağırlıkla güçlendirir.

---

## Katman 2: Aktivasyon Motoru — `evaluateActivation()`

```typescript
// src/core/activation-engine.ts
export function evaluateActivation(
  taskDNA: TaskDNA,
  config: ActivationConfig,
): ActivationResult
```

Her agent ve skill'in `agent.json` / `skill.json` dosyasında `ActivationConfig` tanımlanmıştır. Bu yapı şunları içerir:
- `rules`: koşul + skor çiftleri (örn. `intent.primary === 'security'` → +8 puan)
- `exclude`: belirli koşullarda o agent'ı devre dışı bırakan kurallar
- `minScore`: agent'ın seçilebilmesi için gereken minimum puan

`condition-evaluator.ts` içindeki yol tabanlı koşul motoru (`$gt`, `$contains`, `$and`, `$or` operatörleri) bu kuralları `TaskDNA` üzerinde değerlendirir.

---

## Katman 3: Routing Engine — `routeTaskV2()`

```typescript
// src/core/routing-engine.ts
export function routeTaskV2(
  task: { title: string; description: string; scope: TaskScope },
  agentPool: AgentPool,
  skillPool: Map<string, SkillDefinition>,
  options?: RoutingOptions,
): RoutingDecision
```

Bu fonksiyon 6 adımlık bir algoritma çalıştırır:

### Adım 1 — Intent Sınıflandırması
`classifyIntent()` çağrılarak `TaskDNA` üretilir.

### Adım 2 — Kullanıcı Override'larının Çözümlenmesi
DIRECTIVES'deki `- Agent:` ve `- Skills:` satırları öncelik alır. Override kaynağı (`'task-directive'`, `'sprint-directive'`, `'project-config'`) `RoutingDecision.overrideSource` alanında raporlanır. Sprint 182'den itibaren zorunlu override'lar semantic uyarıyla birlikte devam eder (F8 kontrolü).

### Adım 3 — Agent Seçimi
Her aktif agent'ın aktivasyon skoru hesaplanır. En yüksek skoru alan ve `minScore` eşiğini geçen agent seçilir. Eşik geçilemezse intent'e özgü **fallback chain** devreye girer:

```typescript
const AGENT_FALLBACK_CHAIN: Record<IntentType, string[]> = {
  'bugfix': ['bug-fixer', 'refactorer'],
  'documentation': ['doc-writer'],
  'security': ['security-auditor'],
  // ...
};
```

Sprint 209'dan itibaren domain eşleşme bonusu (`DOMAIN_MATCH_BONUS = 3`) eklenerek alan uzmanı agent'ların genel uygulamalı agent'lar karşısında tercih edilmesi sağlandı.

### Adım 4 — Skill Bütçesi Hesaplama
`calculateSkillBudget()`, görev büyüklüğüne ve effort düzeyine göre maksimum skill sayısı ve token bütçesi belirler.

### Adım 5 — Skill Seçimi
`selectBestSkills()`, skill pool'undaki her skill'i `TaskDNA`'ya göre değerlendirir. Skor hesaplamasında proje tech-stack uyumu, domain eşleşmesi ve öğrenme bonusları (geçmiş sprint başarısı) dikkate alınır.

### Adım 6 — Bağlam Bütçesi Değerlendirmesi
Seçilen modelin bağlam penceresi ile tahmini token kullanımı karşılaştırılır: `'ok'`, `'tight'` veya `'overflow'` kararı verilir.

---

## RoutingDecision — Yönlendirme Sonucu

```typescript
// src/core/routing-types.ts
export interface RoutingDecision {
  agentId: string | null;           // seçilen agent
  agentScore: number;               // aktivasyon skoru
  agentConfidence: ConfidenceLevel; // 'high' | 'medium' | 'low' | 'uncertain'
  skillIds: string[];               // seçilen skill'ler
  skillScores: Map<string, number>; // her skill'in skoru
  skillConfidence: ConfidenceLevel;
  overrideSource: OverrideSource;   // 'none' | 'task-directive' | ...
  taskDNA: TaskDNA;                 // sınıflandırma sonucu
  reasoning: string[];              // insan-okunabilir karar açıklamaları
  contextFit?: 'ok' | 'tight' | 'overflow';
  routingVersion: 'v2' | 'v3';     // kullanılan motor versiyonu
  overrideWarnings?: string[];      // F8 semantic uyarıları
}
```

`reasoning` dizisi, her seçim kararının gerekçesini içerir:
```
"Intent: documentation (confidence: 0.85)"
"Agent forced by override: doc-writer"
"Skill budget: max 3 (normal effort, medium complexity)"
"Skills selected: [documentation-writer, typescript-expert]"
```

---

## Yönlendirme Öğrenmesi

Sprint sonunda `outcome-tracker.ts`, her agent ve skill'in başarı/başarısızlık oranlarını kayıt altına alır. Sonraki sprint planlamasında bu veriler `learningData` olarak `routeTaskV2()` fonksiyonuna iletilir ve **öğrenme bonusu** (`LEARNING_BONUS_CAP` ile sınırlı) olarak aktivasyon skoruna eklenir. Bu sayede deckent, hangi agent/skill kombinasyonunun hangi tür görevlerde başarılı olduğunu öğrenir.
