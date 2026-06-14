# DIRECTIVES — Sprint 287: Doc-Audit FIX — Vision De-Competitor + Enterprise Depth

## Goal: Sprint 286 doküman-audit'inin disk-verify ile bulunan 3 boşluğunu kapat. (1) `docs/vision/roadmap.md` eskimiş bir iç-strateji/launch dokümanı — rakip-kıyas (OpenClaw/Aider/Devin/Cursor "vs", 🏆-tabloları) + launch-pazarlama (Sprint-150, Show HN/Reddit taktikleri) + eski metrikler (148 sprint, 41 ADR, %99.12) içeriyor → temiz, GÜNCEL, user-facing yol-haritasına dönüştür. (2) `blueprint.md`/`blueprint-TR.md` aynı rakip-ref + eski-metrik sorunu. (3) `enterprise-*` referansları 286'da yüzeysel kaldı → derinleştir. Hedef: rakip-ismi=0, eski-metrik=0, deckent.ai, bugünün deckent'ini (v1.0.0-beta.1, sprint-285+, 89 ADR, 34 MCP tool/8 resource, 15 agent/21 skill, 4 provider) yansıtan dokümanlar.

## Ortak kurallar (BAĞLAYICI)
- **Rakip-ismi YASAK:** Devin/Cursor/Aider/OpenClaw/Claude-Code/Copilot "vs/kıyas/🏆-tablo/bashing-tagline" → TAMAMEN KALDIR. deckent'in kendi değer-önermesiyle yeniden yaz (evrimsel mimari, dependency-pipeline waves, Memory V2 FTS5, multi-provider, Nervous System, autonomous engine, ADR-governance, MIT-açık). Meşru IDE-entegrasyonu (deckent'i Cursor/VS Code'a MCP ile kurma rehberi) rakip-kıyas DEĞİL — o tür içerik varsa korunur.
- **Eski-metrik YASAK:** Koda/`.brain/exports/summary.md`'e karşı doğrula — sprint sayısı 285+, ADR 89, MCP 34 tool/8 resource, agent 15, skill 21, model 13/tier 4, sürüm 1.0.0-beta.1. Uydurma/eski sayı (148 sprint, 41 ADR, %99.12 coverage, star-sayısı) → güncelle veya çıkar.
- **Launch-pazarlama içeriği YASAK (roadmap'te):** "Show HN / Reddit / Twitter thread / Perşembe 10:00 launch / tagline adayları" gibi iç-pazarlama-taktiği user-facing roadmap'e ait değil — çıkar. Roadmap = mevcut-durum → yakın-vade → vizyon (ürün yönü), iç-launch-planı değil.
- **deckent.ai** her zaman (deckent.agency asla). **EN/TR senkron** (blueprint ↔ blueprint-TR).
- **Cerrahi:** Sağlam/güncel bölümleri koru; yalnız rakip/eski/launch-içeriğini düzelt. Tam-yeniden-yazım yalnız bölüm kökten yanlışsa.

---

## Task 1: roadmap.md — user-facing yol-haritasına dönüştür
- Provider: claude
- Model: opus
- Backend: docker
- Effort: high
- Agent: doc-writer
- Skills: documentation-writer, system-architect
- Files: docs/vision/roadmap.md
- Scope: docs/vision/, .brain/exports/summary.md, src/
### Description
`docs/vision/roadmap.md` şu an eskimiş iç-strateji dokümanı. Dönüştür: (a) `## 7. Rekabet Konumu — OpenClaw vs Deckent` kıyas-tablosunu KALDIR → deckent'in benzersiz değerleri (kimseyi kıyaslamadan). (b) `## 8. Pazarlama Mesajları` (Show HN/Reddit/tagline/launch-tarihi) KALDIR — user-facing roadmap'e ait değil. (c) "Deckent vs Aider" satırı + kalan rakip-ref → reframe/kaldır. (d) Eski metrikleri (148 sprint, 41 ADR, %99.12, 21+20 skill) güncel-koddan doğrula (285 sprint, 89 ADR, 21 skill). (e) Roadmap'i mevcut-durum → yakın-vade → uzun-vade vizyon (native-agent program, autonomous engine, agentic-OS, enterprise) olarak düzenle. Sağlam teknik-roadmap bölümleri korunur.
**Kanıt:** `grep -ciE "devin|cursor|aider|openclaw|show hn|99\.12|148 sprint|41 adr" docs/vision/roadmap.md` = 0 + `grep -c "deckent.ai" docs/vision/roadmap.md` ≥ 1.

## Task 2: blueprint.md + blueprint-TR.md — de-competitor + de-stale
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/vision/blueprint.md, docs/vision/blueprint-TR.md
- Scope: docs/vision/, .brain/exports/summary.md, src/
### Description
blueprint (EN) + blueprint-TR (ayna): rakip-ref'leri (Devin/Cursor/Aider/OpenClaw) kaldır → deckent değer-önermesi. Eski metrik/tarih (2026-06-02 pozisyon-snapshot, eski sprint/ADR sayıları) güncel-koddan doğrula. Teknik-blueprint (mimari, katmanlar, yol-haritası) korunur ama güncel. blueprint.md önce → blueprint-TR.md birebir ayna.
**Kanıt:** `grep -ciE "devin|cursor|aider|openclaw" docs/vision/blueprint.md docs/vision/blueprint-TR.md` = 0 + iki dosya bölüm-sayısı eşit.

## Task 3: enterprise referansları — derinleştir (286-020 yüzeysel kaldı)
- Provider: claude
- Model: sonnet
- Backend: docker
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, security-specialist
- Files: docs/reference/enterprise-foundation.md, docs/reference/enterprise-integrations.md
- Scope: docs/reference/, src/api/, src/core/, src/orchestra/
### Description
286-020 (false-NO_GO) enterprise dokümanlarına yalnız ADR-governance satırı ekledi — yüzeysel. Derinleştir: enterprise-foundation + enterprise-integrations'ı koda karşı tam-audit — SSO/OIDC (auth-jwks RS256), RBAC (rbac.ts enforce_rbac), multi-tenant (tenant-aware audit/scope dürüstçe partial), audit-query, scheduled-flows, webhook-triggers (ADR-068/069/071). Aspirational olanları dürüstçe işaretle. SECURITY.md'nin hard-vs-advisory dürüstlük-tonunu izle.
**Kanıt:** ADR-068/069/071 referansları doğru + RBAC rol-isimleri (admin/operator/viewer) koddaki ile + `grep -c "deckent.agency"` = 0.

---

**Beklenen:** 3 task FIX. opus 1 (roadmap — eskimiş büyük doküman, yargı gerekli) · sonnet 2. doc-writer ağırlık. Bağımsız → paralel. Sprint-sonu CC: 3 dokümanda rakip-ismi=0 + eski-metrik=0 doğrula, commit.
