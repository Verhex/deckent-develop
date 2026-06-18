# ADR-090: Documentation Tracking & Staleness (DCR + content-hash + multi-signal)

**Status:** accepted

**Date:** 2026-06-18

**Related:** ADR-029/030/031 (Managed-Docs), ADR-088 (Memory V2 DB-First), ADR-010 (Tek Runtime Dependency), ADR-087 (Async I/O & Test Hermeticity)

---

**Context:** Projelerde dokümantasyon karmaşıklaşıyor; hangi doc güncel, hangisi koddan geride, hangisi önemli — körlemesine. `DOC-POLICY.md`'nin 4-katmanlı tiering'i el-bakımlı; ADR-031 content-hash yalnız managed-docs auto-section'ları için. Tüm repo dokümanları için makine-okunur bir tazelik + önem sinyali yok.

**Decision:** Her (geçici-olmayan) `.md` dokümana **DCR (Document Criticality Rank — `doc_rank`, 0=en kritik, sonsuz seviye)** + **gövde-content-hash (sha256)** + **last_updated** ata; bunları hem YAML front-matter'da hem `memory.db` `doc_tracking` tablosunda (ayrı `better-sqlite3` bağlantısı, `entries`'e dokunmadan) izle. **Çok-sinyalli stale**: content-drift + age (rank-duyarlı eşik) + (Faz 2) code-drift; `doc_rank` ile ağırlıklı `priority_score`. Geçici doc (`scratch/` veya `status:draft|temp`) hashlenmez (EXEMPT). Kapsam: tüm repo `**/*.md` − `trackIgnore`. `CLAUDE.md`/`DECKENT.md`/`AGENTS.md`/`GEMINI.md` = DB-only (front-matter enjeksiyonu riskli). Hash gövde-only (front-matter hariç, CRLF→LF + tek trailing `\n` normalize) → metadata yazımı drift-churn yaratmaz. CLI: `deckent docs track scan|status|sync`.

**Consequences (+):** Stale/önemli doc'lar makine-tespitli; takip/öneri/analiz netleşir; DOC-POLICY tiering'inin sayısal genelleştirmesi. Mevcut `doc-cache` (SHA-1) ve MemoryStore bozulmaz (additive). 725-doc canlı tarama proof-of-function ile doğrulandı.

**Consequences (−):** Front-matter mutasyonu git-diff gürültüsü ekler (gövde-only hash ile churn sınırlı); ikinci sqlite bağlantısı (WAL ile güvenli). Age sürekli-sinyal olduğundan bugün commit edilmemiş doc en az DRIFT görünür (DRIFT bilgilendirici, "need attention" yalnız STALE/CRITICAL_STALE'i sayar). Code-drift + CI-gate + MCP/dashboard Faz 2'ye ertelendi.

**References:** `docs/superpowers/specs/2026-06-18-doc-tracking-design.md`, `docs/superpowers/plans/2026-06-18-doc-tracking.md`, `docs/reference/api-surface.md` (doc_tracking şeması).

---

**Amendment (Faz 2, 2026-06-18):** code-drift sinyali canlı (`tracks:` glob → `git ls-files` + author-date karşılaştırması, `src/core/doc-tracking/code-drift.ts`; scanner'da wire); `deckent docs track scan --check [--max-rank n]` CI-gate (CRITICAL_STALE → non-zero exit); sprint-finalize hook (`config.doc_tracking.sync_on_finalize`, default OFF, DB-only, fail-safe); MCP `deckent_docs` `track-scan`/`track-status` action'ları; HTTP `GET /api/docs/health` (rank×state heatmap, auth-gated) + dashboard "Docs Health" sayfası (heatmap + drill-down). Tier-1 proof-of-function: serve + `/api/docs/health` 200 (832 doc canlı) + 401 auth-gate + dashboard component test. Spec: `docs/superpowers/specs/2026-06-18-doc-tracking-phase2-design.md`. **Status:** accepted.
