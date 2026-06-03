# Skills — Yatay Uzmanlık Katmanı, AST Sandbox Güvenliği

> 21 yerleşik skill, worker prompt'una enjekte edilen domain bilgisi katmanıdır — agent'ları tamamlar, onların yerini almaz.

## Ne işe yarar?
- Skill, bir görevin prompt'una **ek bağlam ve kısıtlama** ekler (örn. TypeScript strict-mode kuralları, OpenAPI tasarım kılavuzu).
- Agent **dikey** (kim yapacak), skill **yatay** (nasıl yapacak) — ADR-041 taksonomisi.
- Birden fazla skill aynı anda aktif olabilir; `composableWith` listesi uyumlu skill çiftlerini tanımlar.
- Stack algılama: proje `tsconfig.json` içeriyorsa `typescript-expert` otomatik aday olur.
- Kullanım istatistikleri (totalUses, successRate) her sprint sonrası güncellenir.

## Neden önemli?
- Worker'a generik prompt yerine alan uzmanlığı verildiğinde hata oranı düşer.
- AST sandbox: marketplace'ten gelen skill'ler **iki kademeli güvenlik taramasından** geçer — eval, child_process, fs, net gibi tehlikeli kullanımlar bloklanır.
- Skill'ler `SKILL.md` entrypoint olarak .md dosyası taşır → kod değil bilgi, versiyon kontrollü, insan-okunabilir.

## Nasıl çalışır?
- **Yığın tespiti:** `stackDetection.files` ve `stackDetection.dependencies` proje köküyle eşleştirilir.
- **Seçim:** `routeTaskV2` TaskDNA'yı skill manifest'leriyle karşılaştırır, `priority` ve skor göz önüne alınır.
- **Prompt enjeksiyonu:** Seçilen skill'lerin SKILL.md içeriği, worker prompt'una `position: prepend|append` ile eklenir (`maxTokens` bütçesine uyarak).
- **AST sandbox (marketplace skill'leri):** 2-pass — önce regex hızlı tarama, sonra .ts/.js dosyaları için AST doğruluğu.

## Komut / Örnek

```bash
# Tüm skill'leri listele (CLI)
deckent skill list

# Örnek çıktı:
# Name                 Category   Status   Triggers              Priority
# TypeScript Expert    language   enabled  typescript, type...   10
# React Specialist     frontend   enabled  react, hook, jsx...   8
# Testing Expert       testing    enabled  test, vitest, mock... 7
# Security Specialist  security   enabled  security, auth...     9
# ...

# Kategoriye göre filtrele
deckent skill list --category language

# Skill detayı
deckent skill info typescript-expert
```

**MCP eşdeğeri:**
```
deckent_skill_list → { root: "/projem" }
```

## Durum
- Olgunluk: ✅ canlı (21 built-in, kaynak: `.deckent/skills/` dizini)
- İlgili: ADR-041 · `src/core/skill-registry.ts` · `src/core/marketplace/skill-sandbox.ts`

---

### Yerleşik Skill Kataloğu (21 built-in)

| Skill | Kategori | Açıklama |
|-------|----------|----------|
| `typescript-expert` | language | TypeScript tip sistemi, ESM, generics |
| `testing-expert` | testing | Vitest/Jest, mock, coverage stratejisi |
| `documentation-writer` | docs | Markdown, JSDoc, API docs |
| `security-specialist` | security | Güvenlik pattern, input validasyon |
| `performance-optimizer` | perf | Async optimizasyon, memory, profiling |
| `api-builder` | api | REST tasarımı, OpenAPI spec |
| `devops-engineer` | devops | GitHub Actions, Docker, pipeline |
| `database-migration` | data | Query optimizasyon, migration, ORM |
| `react-specialist` | frontend | React, Vite, Tailwind, component |
| `python-expert` | language | Python ekosistemi, FastAPI |
| `ci-testing` | testing | CI ortamında test yürütme |
| `accessibility-expert` | a11y | WCAG standartları, a11y test |
| `anthropic-sdk` | sdk | Claude API, tool use, agent SDK |
| `code-simplifier` | refactor | Kod sadeleştirme, karmaşıklık azaltma |
| `docker-expert` | devops | Dockerfile, compose, container |
| `frontend-design` | frontend | UI component, CSS, responsive |
| `git-expert` | vcs | Git iş akışı, branch stratejisi |
| `graphql-expert` | api | GraphQL schema, resolver |
| `migration-expert` | migration | Framework geçişi, versiyon yükseltme |
| `monorepo-expert` | infra | Monorepo yönetimi, workspace |
| `system-architect` | architecture | Sistem mimarisi, tasarım desenleri |
