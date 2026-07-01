---
name: project_persistence_direction_sqlite_evolution
description: KARAR VERİLİ — persistence yönü better-sqlite evrim + sqlite-vec opt-in; Postgres/vector-DB göçü REDDEDİLDİ (ADR-G-035). Persistence/ölçek konuşurken İLK durak.
metadata: 
  node_type: memory
  type: project
  originSessionId: 3ece1803-d6f1-4c30-8b0e-f14035d81d88
---

**Deckent'in persistence/memory yön KARARI verilidir — açık çatal değil.** Kaynak: `docs/adr/adr-g-035-memory-architecture.md` (accepted, **ADR-G / Global-Constitution, immutable**), satır 64 + 84.

- **Karar (aynen ADR-G-035):** *"the deliberate 'evolve **better-sqlite**, **don't migrate to a vector DB**' decision"* — DB stratejisi = **better-sqlite evrim** (`.analysis/adr-governance-redesign-plan.md` §5).
- **SSOT:** SQLite (`better-sqlite3`, `src/core/memory-store.ts`) tek kaynak; `.md` dosyaları generated export (git diff yüzeyi). FTS5 **default** arama.
- **Semantic/vector:** `sqlite-vec` + Ollama-local embeddings, **opt-in**, **never-calls-home** — FTS5'in *yanına* eklenir, yerine değil. Ayrı bir vector-DB'ye (Pinecone/pgvector/Weaviate) veya Postgres'e **göç YOK**.
- **Neden moat:** local-first + zero-setup + never-phone-home bilinçli rekabet avantajı; ADR-D-005 dependency disiplini korunur.
- **Multi-tenant ölçek yolu:** engine değiştirmek DEĞİL — `tenant_id` row-scoping (`memory-store.ts`) + `withTenant(tenantId, root, fn)` AsyncLocalStorage context (`docs/reference/enterprise-foundation.md`, ADR-G-031 / ADR-068). Açık iş: strict-tenant-isolation'ı default yap (NULL-tenant leak fix), SCHEMA-VERSION-BUMP + backup-guard wire.
- **Ölçek her zaman belirtildi (Alperen):** solo→dünyanın en büyük enterprise'ları, milyon user/proje ([[feedback_millions_environments_scale]]). Bu ölçek **SQLite evrimiyle** çözülecek diye karar verildi; "Postgres daha iyi" diye geri açma.

**Kural:** Persistence/DB/vector/ölçek önerisi yaparken ÖNCE bu kaydı + ADR-G-035'i oku. SQLite'ı "eksik/geçici" gibi sunma; Postgres/vector-DB'yi yeni-fikir gibi önerme. Bkz. [[feedback_dont_relitigate_decided_architecture]].
