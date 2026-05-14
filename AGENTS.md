# Deckent Built-in Agents

> **Sprint 148 Reform:** ADR-041 agent taxonomy reformu ile toplam **15 built-in agent** kaldı. Eski testleme rolü agent-based değil, task bazlı yönetiliyor.

## Agent Listesi

| Agent | Tercih Edilen Model | Birincil Intent | Aktivasyon Anahtar Kelimeleri |
|-------|--------------------|-----------------|-----------------------------|
| `architect` | opus | design | architecture, design, module, dependency, adr, scalability |
| `security-auditor` | opus | security | security, auth, jwt, xss, injection, vulnerability, token |
| `doc-writer` | haiku | documentation | docs, readme, comment, jsdoc, changelog, guide |
| `bug-fixer` | sonnet | bugfix | fix, bug, error, crash, regression, hotfix |
| `code-reviewer` | opus | refactor | review, refactor, quality, lint, cleanup, pr-review |
| `refactorer` | sonnet | refactor | refactor, cleanup, migrate, modernize, extract |
| `api-builder` | sonnet | feature | api, endpoint, route, schema, rest, openapi |
| `performance-analyzer` | sonnet | performance | perf, slow, optimize, memory, profiling, benchmark |
| `ci-guardian` | sonnet | testing | ci, pipeline, test, regress, build, actions |
| `architecture-planner` | opus | design | plan, roadmap, adr, milestone, proposal |
| `accessibility-auditor` | sonnet | security | accessibility, a11y, wcag, aria, keyboard |
| `data-engineer` | sonnet | feature | data, pipeline, etl, migration, schema, query |
| `devops-engineer` | sonnet | devops | devops, deploy, docker, compose, github-actions |
| `frontend-designer` | sonnet | feature | frontend, ui, component, css, responsive, design |
| `migration-specialist` | sonnet | migration | migration, upgrade, deprecation, breaking-change, framework |

---

## Agent Açıklamaları

### `architect`
Sistem tasarımı, modül sınırı analizi ve bağımlılık değerlendirmesi. ADR (Architecture Decision Record) yazar, trade-off analizi yapar. Kodu doğrudan değiştirmez — tavsiye ve analiz odaklıdır.

**Tetikleyici:** Büyük/epic kapsamlı değişiklikler, yeni modül tasarımı, mimari kararlar.

---

### `security-auditor`
OWASP Top 10 güvenlik açıklarını tarar, threat modeling (STRIDE) uygular, auth/şifreleme/giriş doğrulama kusurlarını tespit eder. Defense-in-depth stratejileri önerir.

**Tetikleyici:** `security`, `auth`, `jwt`, `xss`, `injection`, `vulnerability` anahtar kelimeleri; `src/auth/`, `src/api/`, `src/middleware/` kapsamları.

---

### `doc-writer`
README, JSDoc, API dokümantasyonu, changelog ve kılavuz oluşturur. Diataxis framework ile içeriği kategorize eder (tutorial/how-to/reference/explanation). TR/EN i18n desteği.

**Tetikleyici:** `docs`, `readme`, `comment`, `changelog` anahtar kelimeleri; `docs/`, `*.md` dosyaları.

---

### `bug-fixer`
Hata ayıklama, regression fix ve hotfix uzmanı. Root cause analizi yapar, minimal değişiklikle problemi çözer. Yanlışlıkla scope genişletmez.

**Tetikleyici:** `fix`, `bug`, `error`, `crash`, `regression`, `hotfix` anahtar kelimeleri.

---

### `code-reviewer`
Sistematik kod incelemesi: doğruluk hataları, güvenlik açıkları, okunabilirlik sorunları, test kapsamı. Actionable geri bildirim sağlar (must-fix vs nice-to-have). Kod yazmaz, sadece inceler.

**Tetikleyici:** `review`, `quality`, `refactor`, `cleanup`, `pr-review` anahtar kelimeleri; `src/` kapsamı.

---

### `refactorer`
Mevcut kodu yeniden yapılandırır: karmaşıklığı azaltır, okunabilirliği artırır, tekrar kullanılabilirliği geliştirir. İşlevselliği koruyarak modernize eder.

**Tetikleyici:** `refactor`, `cleanup`, `migrate`, `modernize`, `extract` anahtar kelimeleri.

---

### `api-builder`
REST API tasarımı ve implementasyonu. OpenAPI spec, endpoint versiyonlama, request/response şema validasyonu. Express/Fastify entegrasyonu.

**Tetikleyici:** `api`, `endpoint`, `route`, `schema`, `rest`, `openapi` anahtar kelimeleri.

---

### `performance-analyzer`
Profiling, bellek optimizasyonu, N+1 sorgu tespiti, async optimizasyon. Benchmark karşılaştırmaları yapar ve ölçülebilir iyileştirme önerileri sunar.

**Tetikleyici:** `perf`, `slow`, `optimize`, `memory`, `profiling`, `benchmark` anahtar kelimeleri.

---

### `ci-guardian`
CI/CD sağlığı: test regresyon tespiti, pipeline hata ayıklama, build stabilitesi. GitHub Actions workflow optimizasyonu. Test coverage koruma.

**Tetikleyici:** `ci`, `pipeline`, `test`, `build`, `actions`, `workflow` anahtar kelimeleri.

---

### `architecture-planner`
Mimari planlama ve yol haritası oluşturma. ADR taslağı, teknik karar belgesi, sprint önceliklendirme. Uzun vadeli sistem evrimi için strateji geliştirir.

**Tetikleyici:** `plan`, `roadmap`, `adr`, `proposal`, `milestone` anahtar kelimeleri.

---

### `accessibility-auditor`
WCAG 2.1 AA/AAA uyumluluğu, ARIA rolleri, klavye navigasyonu, renk kontrastı, ekran okuyucu uyumluluğu. Erişilebilirlik testleri ve raporlama.

**Tetikleyici:** `accessibility`, `a11y`, `wcag`, `aria`, `keyboard` anahtar kelimeleri.

---

### `data-engineer`
Veri pipeline tasarımı, ETL süreçleri, veritabanı şema tasarımı, sorgu optimizasyonu. SQLite, PostgreSQL, ORM entegrasyonu. FTS5 ve arama altyapısı.

**Tetikleyici:** `data`, `pipeline`, `etl`, `schema`, `query`, `migration` anahtar kelimeleri.

---

### `devops-engineer`
CI/CD pipeline tasarımı, Docker/containerization, deployment otomasyonu, altyapı güvenliği. GitHub Actions workflow, multi-stage build, non-root container.

**Tetikleyici:** `devops`, `deploy`, `docker`, `compose`, `github-actions`, `infra` anahtar kelimeleri.

---

### `frontend-designer`
React component mimarisi, Tailwind CSS, responsive tasarım, Vite optimizasyonu. Erişilebilir ve kullanıcı odaklı UI tasarımı. TypeScript + React hooks.

**Tetikleyici:** `frontend`, `ui`, `component`, `css`, `responsive`, `design` anahtar kelimeleri; `src/dashboard/` kapsamı.

---

### `migration-specialist`
Framework/kütüphane geçişleri, API kırılma değişikliği yönetimi, versiyon yükseltme stratejisi. Geriye dönük uyumluluk planlaması ve deprecation yönetimi.

**Tetikleyici:** `migration`, `upgrade`, `deprecation`, `breaking-change`, `framework` anahtar kelimeleri.

---

## Routing Mekanizması

Agent seçimi `src/core/routing-engine.ts` tarafından yapılır:

1. **Layer 1 — Intent Classifier** (`intent-classifier.ts`): Task açıklamasından birincil niyet çıkarılır (`design`, `bugfix`, `security`, `refactor`, `feature`, `testing`, `performance`, `documentation`, `migration`, `devops`).
2. **Layer 2 — Activation Engine** (`activation-engine.ts`): Her agent'ın activation rules'u değerlendirilir, skor hesaplanır.
3. **Layer 3 — Routing Engine** (`routing-engine.ts`): En yüksek skorlu agent seçilir; `forceAgent` override, `excludeAgent` dışlama desteklenir.

### Override Kullanımı (DIRECTIVES'te)

```markdown
## Task 1: Title
- Agent: architect          # forceAgent override
- Skills: system-architect  # forceSkills override
```

## Temp Agents

`.deckent/agents/` altında proje başına geçici agent'lar oluşturulabilir:
- LRU eviction: max 50 temp agent, 5 sprint yaşlandırma
- `deckent agent list` ile listelenir
- Başarılı sprint sonrası promotion pipeline'ı ile kalıcılaştırılabilir

---

*Son Güncelleme: Sprint 149 | Reform: ADR-041 Agent Taxonomy*

## Built-in Agents
| Agent | Tasks | Done | Success |
|-------|-------|------|--------|
| code-reviewer | 2 | 2 | 100% |
| doc-writer | 1 | 0 | 0% |
| data-engineer | 1 | 1 | 100% |
| bug-fixer (**FORENSIC MODE — no fix, root cause only**) | 1 | 1 | 100% |
| security-auditor | 1 | 1 | 100% |
| architect | 1 | 1 | 100% |
| generic | 3 | 3 | 100% |
