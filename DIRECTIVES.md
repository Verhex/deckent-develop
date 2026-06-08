# DIRECTIVES — Sprint 246: Security Threat Model (DOC-1 slice)

## Goal: `docs/security/threat-model.md` (yeni) — deckent'in güvenlik tehdit-modelini DÜRÜST belgele (W-H beta-doc eksiği). Mevcut güvenlik mimarisini gerçeğe-sadık anlat: ne korumalı (auth/secrets/scope/audit/data-sovereignty), ne ADVISORY/partial (RBAC, sandbox, multi-tenant) — overclaim YOK. **DOC-ONLY, sıfır kod-riski.**

## Ortak kurallar
- **Dürüstlük (overclaim YASAK):** advisory/partial postür'leri "tam" gibi gösterme (RBAC runtime advisory ADR-037 V1.0, sandbox=git-stash, multi-tenant schema-only). i18n muaf (EN security-doc). No tech debt. Tier-0 doc → test yok; doğruluk = kod-gerçeğiyle uyum.

---

## Task 1: 246-001 — docs/security/threat-model.md
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, documentation-writer
- Files: docs/security/threat-model.md
- Scope: docs/security/

### Description
Önce ilgili güvenlik kodunu OKU + doğrula: `src/api/auth.ts` (token auth), `src/core/provider.ts` `applyDeckSecretsToEnv` (.deck secrets), `src/orchestra/authority-enforcer.ts` (RBAC/scope — advisory mi), `src/providers/sandbox.ts` + start `--sandbox-mode` (git-stash), `src/core/tenant-context.ts` (multi-tenant), `src/api/terminal/audit-integrity.ts` (HMAC audit chain), `src/core/telemetry.ts` (never-calls-home). Sonra **dürüst** bir threat-model yaz:

1. **Assets & trust boundaries:** worker spawn (docker/tmux/subprocess), provider credentials (.deck), memory.db, MCP server/client, dashboard/API, autonomous backlog.
2. **Threats + mevcut mitigasyonlar (gerçeğe-sadık):** (a) API token auth — timing-safe SHA-256, localhost-auto-inject opt-in; (b) secrets — .deck env-injection, per-provider isolation; (c) worker scope/RBAC — **ADVISORY** (ADR-037 V1.0, git diff --stat ile izlenir, hard-enforce DEĞİL — dürüstçe yaz); (d) sandbox — `--sandbox-mode` = git-stash rollback (network-isolation DEĞİL); (e) Docker — fs/mem isolation, network-isolation YOK (dürüst); (f) audit — HMAC-SHA256 chain (PTY/terminal); (g) data-sovereignty — never-calls-home (telemetry default-off), local-ollama option.
3. **Known limitations / residual risk (overclaim-karşıtı):** RBAC advisory, multi-tenant schema-only (`tenantId:'local'`), sandbox≠full-isolation, no SIEM/secret-vault (post-beta). ADR-037 V2 hard-flip roadmap'te.
4. **Threat-actor perspektifi:** malicious task/DIRECTIVES, scope-escape attempt, credential-leak, supply-chain (plugin/skill sandbox AST).

Açık başlıklar (STRIDE-benzeri veya asset-merkezli), tablo'lar, dürüst "implemented vs advisory vs post-beta" ayrımı.

**Kanıt:** `docs/security/threat-model.md` var · "advisory" RBAC dürüstçe geçer · "never-calls-home"/data-sovereignty + HMAC-audit + token-auth bölümleri var · multi-tenant schema-only dürüstçe işaretli. Bitince DONE.

**Test:** yok. **Smoke:** (doc) disk-verify — Brain/ben dürüstlük (advisory overclaim yok) + kod-uyumu kontrol eder.

---

**Beklenen:** 1/1 DONE. Dürüst, kod-gerçeğine sadık threat-model. Disk-verify: dosya var + RBAC-advisory + multi-tenant-schema-only dürüstçe + token-auth/HMAC/sovereignty bölümleri + overclaim yok.

İlgili: [[project_merged_product_flow_analysis]] (güvenlik postür bulguları) · ADR-037 (RBAC advisory) · ADR-034 (multi-project isolation) · ADR-062 (audit) · [[project_air_gapped_offline_pillar]] (data-sovereignty).
</content>
