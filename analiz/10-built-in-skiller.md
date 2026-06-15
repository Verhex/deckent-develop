# Built-in Skill'ler — 21 Yatay Beceri

deckent, görevlerde uzmanlık katmak için 21 built-in skill sunar. Skill'ler, herhangi bir agent tarafından kullanılabilen **yatay becerilerdir** — bir agent'ın dikey uzmanlığını tamamlarlar. Sprint planlama sırasında `src/core/routing-engine.ts` her göreve uygun skill'leri otomatik atar; task DIRECTIVES'de `- Skills:` direktifiyle manuel override de mümkündür.

---

## Agent ile Skill Arasındaki Fark

| Boyut | Agent | Skill |
|-------|-------|-------|
| Tür | Dikey uzmanlık | Yatay beceri |
| Örnek | `architect` (mimari kararlar) | `typescript-expert` (tip sistemi) |
| Kullanım | Görev başına TEK agent | Görev başına BİRDEN FAZLA skill |
| Aktivasyon | Intent-based routing | Scope + stack analizi + `- Skills:` override |
| Kapsam | Kim yürütür? | Ne bilgisiyle yürütür? |

ADR-041 bu ayrımı mimariye kazdı: "test yazmak" bir yatay beceridir (`testing-expert` skill), ayrı bir dikey agent (`test-writer`) değil.

---

## Skill Kayıt ve Doğrulama

Skill'ler `.deckent/skills/<isim>/skill.json` dosyasıyla tanımlanır. `src/core/skill-pool.ts` + `src/core/skill-registry.ts` bu dosyaları yönetir.

**AST Sandbox Doğrulama:** Her skill tanımı kayıt sırasında AST (Abstract Syntax Tree) analizi ile doğrulanır. Bu mekanizma:
- Skill içeriğinin sözdizimsel bütünlüğünü kontrol eder.
- Skill prompt'larının beklenmedik kod çalıştırma riski taşımadığını doğrular.
- Geçersiz skill tanımı kayıt aşamasında reddedilir; runtime'a ulaşmaz.

---

## 21 Built-in Skill

### 1. `typescript-expert`
TypeScript tip sistemi, ESM modül çözümlemesi, generics, decorators ve ileri tip teknikleri.

### 2. `testing-expert`
Vitest/Jest ile test yazımı, mock stratejileri, coverage yönetimi, hermetic test tasarımı. Scope `tests/**` veya `*.test.ts` dosyaları içerdiğinde otomatik aktive edilir.

### 3. `documentation-writer`
Markdown, JSDoc, API dokümanları, CHANGELOG yazımı.

### 4. `security-specialist`
Güvenlik tasarım desenleri, input validasyon, kriptografi, OWASP uyumu.

### 5. `performance-optimizer`
Asenkron optimizasyon, bellek yönetimi, profiling teknikleri.

### 6. `api-builder`
REST API tasarımı, OpenAPI spec yazımı, versiyonlama stratejileri.

### 7. `devops-engineer`
GitHub Actions, Docker entegrasyonu, deployment pipeline tasarımı.

### 8. `database-migration`
Query optimizasyonu, şema migrasyon stratejileri, ORM kullanımı.

### 9. `react-specialist`
React, Vite, Tailwind CSS, component mimarisi ve state yönetimi.

### 10. `python-expert`
Python ekosistemi, FastAPI, veri işleme kütüphaneleri.

### 11. `ci-testing`
CI ortamında test yürütme, regresyon algılama, hermetic test doğrulama.

### 12. `accessibility-expert`
WCAG standartları, a11y test araçları, erişilebilirlik iyileştirmeleri.

### 13. `anthropic-sdk`
Claude API, Anthropic SDK, tool use, agent SDK ve MCP entegrasyonu.

### 14. `code-simplifier`
Kod sadeştirme, karmaşıklık azaltma, gereksiz soyutlama temizliği.

### 15. `docker-expert`
Dockerfile optimizasyonu, Docker Compose, container güvenliği.

### 16. `frontend-design`
UI component tasarımı, CSS, responsive layout, design system.

### 17. `git-expert`
Git iş akışı, branch stratejisi, merge ve rebase yönetimi.

### 18. `graphql-expert`
GraphQL schema tasarımı, resolver implementasyonu, subscription yönetimi.

### 19. `migration-expert`
Framework geçişleri, versiyon yükseltme, API migration stratejileri.

### 20. `monorepo-expert`
Monorepo yönetimi, workspace yapılandırması, paket bağımlılık optimizasyonu.

### 21. `system-architect`
Sistem mimarisi, tasarım desenleri, ölçeklenebilirlik analizi.

---

## Skill Otomatik Aktivasyonu

Routing engine, görev kapsamına göre skill'leri otomatik ekler:

- Scope `tests/**` veya `filesWrite` içinde `*.test.ts` → `testing-expert` eklenir.
- `src/api/**` kapsamlı görevler → `api-builder` eklenir.
- `src/dashboard/**` kapsamlı görevler → `react-specialist` + `frontend-design` eklenir.

DIRECTIVES'de `- Skills: typescript-expert, testing-expert` gibi açık belirtimle otomatik seçimin üzerine yazılabilir.

---

## Skill ile Agent İlişkisi

Bir sprint'te `architect` agent ile çalışan bir görev aynı zamanda `typescript-expert` + `testing-expert` skill'lerini alabilir. Skill'ler agent'ın sistem promptuna eklenir; agent dikey uzmanlığını skill'lerin yatay bilgisiyle birleştirir. Bu çarpan etkisi deckent'in routing verimliliğinin temelini oluşturur.
