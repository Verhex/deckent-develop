---
name: project_social_identity_rbac_engine
description: "Social-identity↔RBAC köprüsü — grup-içi mesajda gönderenin tenant/RBAC yetkisine göre per-user authorization; Plan A (engine) PR#25, Plan B (wiring) sıradaki."
metadata: 
  node_type: memory
  type: project
  originSessionId: 92e1454f-a13b-4333-8995-f9e57c0ed36f
---

**Hedef:** Mesajlaşma gruplarında (Telegram/WhatsApp/Slack/Discord) **mesaj gönderenin** tenant/RBAC/proje yetkisine göre per-user authorization. Bugün connector auth'u **kanal-bazlı** (`incoming-command-router.ts:115` sessiz drop, `fromUser` kullanılmıyor) — istenen **kişi-bazlı**. (Alperen 2026-06-26 isteği.)

**Çekirdek kararlar (brainstorming onaylı):** kimlik bağlama = **hibrit/edition** (solo owner · team directory · enterprise OIDC/SCIM+verify-bind+audit) · izin = **rol + `resource:action`** · grup = **tenant'a bağlı, üye içinde çözülür**. Rol ingest **pluggable port** (Microsoft Entra/Teams, Okta SCIM içeri-al; import/export). Hot-path saf-local O(1), IdP sync out-of-band.

**Faz 1a (engine) ✅ DONE → PR #25** (`feat/social-identity-rbac`, VerhexIO/deckent-develop). 8 modül `src/connectors/identity/` + `rbac.ts` `principalCan()`. 33/33 hermetik test, ci-sim PASS, final whole-branch review (opus) = Ready-to-merge. Subagent-driven (her task: TDD impl + bağımsız reviewer). **Henüz erişilemez** (sıfır prod-importer) — güvenli. Spec `docs/superpowers/specs/2026-06-26-social-identity-rbac-design.md`, plan `docs/superpowers/plans/2026-06-26-social-identity-rbac-engine.md`.

**Faz 1b (Plan B = connector wiring) ✅ MERGED → PR #26** (origin/main `87cabbe3`; opus final re-review onaylı). _(Not: merge GitHub'da yapıldı; local main pull edilmedi çünkü başka oturum kirli working-tree tutuyordu — sıradaki pull'da senkron olur.)_ 6 görev: `identity?` config + gateway `getBinding/setBinding` · **L2 tool-gate** (`execute.ts` `principalCan` before `cap.run`, fail-closed) · router `onChat(…,msg)` · bootstrap per-message principal→CapabilityContext · i18n(en/tr)+**ADR-092** · `bot.ts` live-activation + config-channels→binding seed + Tier-1 e2e. **Opt-in** (`identity.enabled` default-off → mevcut botlar değişmez). Aktivasyon: `config.identity.channels` (chatKey=`connector:channelId`). 513 connector test yeşil. Subagent-driven (Tier-1 review'ları opus).

**Adversarial review 2 gerçek hata yakalayıp fix'ledi (DERS — per-task review yetmez, final whole-branch şart):** 🔴 confused-deputy (parked action son-gönderenin yetkisiyle koşuyordu → `requesterPrincipal`) · 🟠 I-1 inert (`identity.enabled:true` prod'da no-op'tu — `bot.ts` config'i geçmiyor + binding yok → threading+seed+production-path test).

**Faz 3 (Enterprise IdP) ✅ DONE → origin/main `0e8db10e`** (sprint-329 dogfood, doğrudan main'e commit+push): `ScimIdentityProvider` (sync()→store, resolve saf-local) + `OidcClaimsIdentityProvider` (claim→principal) + factory (scim/oidc live, csv honest-throw) + bootstrap background-sync + role-map groupKey live; identity suite 77/77. **DERS:** Brain eval bir stale-test regresyonunu kaçırdı (factory scim destekleyince eski unknown-kind testi kırıldı) → **disk-verify yakaladı+fix'ledi** ([[feedback_ccverify_full_affected_suite]], [[feedback_trust_brain_eval_not_worker]]).

**Açık follow-up (spec §11–§11.2, ADR-092 — sessiz değil):** dinamik `/bind` admin-komutu + pairing→binding bridge · multi-process cache coherence+bounding (stale-allow+DoS) · OTP hash · crypto `genCode` · guest least-privilege · `startVerify` rate-limit · init-failure strict-mode fail-closed · IdentityStore dispose-close · SCIM webhook push-sync + token-refresh + multi-IdP. _(confirmVerify tenant-match + owner=`['*']` + throw→deny + L2 chat-path Plan A/B'de kapatıldı.)_

İlişkili: [[project_messaging_gateway_rearch]] (üstüne kurulan gateway; auth-gate'siz publike açılmamalı) · [[feedback_shared_worktree_branch_hazard]] + [[project_deckent_self_git_mutation_bug]] (bu işte yaşandı: sprint-326 self-tree-wipe untracked plan dosyamı sildi → izole worktree'ye geçtik).
