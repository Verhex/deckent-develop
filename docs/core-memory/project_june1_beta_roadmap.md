---
name: project-june1-beta-roadmap
description: "1 Haziran 2026 OSS GA beta launch KESİN tarih. Sprint Mode OSS olarak npm publish — v1.0.0-beta.1 hazır (Sprint 183 6/6 GREEN). Beta scope: 5 work stream P0 + 3 work stream partial; post-beta Faz 2-4 (Sprint 198+)."
metadata: 
  node_type: memory
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Karar tarih:** Alperen onaylı, 2026-04-21 sonrası kesinleşti, Sprint 183'te validate edildi.

**Beta launch tarih:** **1 Haziran 2026 (Pazartesi)**. KESİN, ertelenmez.

### Beta scope — neyin INCLUDE neyin EXCLUDE

**INCLUDE (Beta launch zorunlu — v1.0.0-beta.1):**
- ✅ **W-A** (OSS GA Blokerleri): coverage threshold, CHANGELOG, SECURITY.md threat model, ADR-037 advisory disclosure (5/5 done Sprint 189-195)
- ✅ **W-B P0** (Doc/wire drift critical): ADR-008 fix, MCP tool count sync, Memory V2 stale ref clean, API endpoint inventory (8/8 P0 done Sprint 189-191)
- ✅ **W-C Path B** (Native chat host subprocess `deckent chat`): Sprint 190 landed
- ✅ **W-F P0** (Provider): Gemini/Codex/Ollama detection + doctor command (4/4 done Sprint 189-190)
- ✅ **W-G P0** (API test infrastructure): endpoint inventory + happy-path tests + SSE/rate-limit/auth (3/3 done Sprint 189-191)
- ✅ **W-H P0** (README + Getting Started + ADR-037 disclosure)
- ✅ **20-gate exit criteria** (`docs/release/beta-tracker.md`): 19/20 PASS Sprint 166, Sprint 195-197 ek 3 gate

**EXCLUDE (Post-beta — Sprint 198+ Faz 2-4):**
- ❌ W-D (Dashboard UX reborn) — minimal state functional, beauty post-beta
- ❌ W-C Path A (PTY native) + Path C (native SDK) — Path B yeter
- ❌ W-E (Evrimsel mimari maturation) — Karpathy L-1..L-5 wire Sprint 191-197 başladı, E-10..E-21 Sprint 196-199
- ❌ W-K (Dead code → Live wire) — connectors aktive ASIL Sprint 198+
- ❌ W-I (OSS publish pipeline + public repo flip) — Sprint 200-202
- ❌ W-J (Million-user hardening) — Sprint 200-205
- ❌ W-F F-12..F-16 (Local LLM CUDA tier mapping)
- ❌ W-B B-16/B-17 (MCP agent/memory manage tools) — CLI yeter
- ❌ W-H H-4..H-20 (Reference docs + cookbook 5+) — Sprint 192-195 partial

### Publish süreci

1. **`npm publish` Alperen MANUEL** (per project policy — otomatik release YASAK)
2. Pre-publish: `npm run validate:publish` 6/6 GREEN (Sprint 183 kanıt)
3. Tarball: 2.7MB, 923 files
4. Tag: `v1.0.0-beta.1`
5. Public repo flip: `git push public main` (post-publish)

### Beta launch 1-week countdown (26 May 2026 başlangıç)

| Tarih | Sprint | Hedef |
|---|---|---|
| 26 May Sal | Sprint 195/196/197 + rescue commit'ler (yapıldı) | Brain dürüst raporlama + WP Tier-1 |
| 27 May Çar | Sprint 198 | Sentetik NO_GO kapanış + memory.db finalize + plan refresh |
| 28 May Per | Sprint 199 | Test baseline 41→15 + Dockerfile.worker Codex/Gemini install |
| 29 May Cum | Sprint 200 | Beta packaging + npm publish dry-run + smoke test |
| 30-31 May | Sprint 201/202 | Final smoke + beta announcement materyali (blog, social, GitHub release notes) |
| **1 Haziran Pzt** | **PUBLISH** | **v1.0.0-beta.1 NPM PUBLISH** (Alperen runs `npm publish`) |

### Post-beta roadmap

- **Faz 2 (Sprint 201-205):** W-D dashboard reborn, W-E maturation, W-H cookbook
- **Faz 3 (Sprint 206-215):** W-I OSS publish + public repo + community
- **Faz 4 (Sprint 216-225):** W-J million-user hardening + Sprint 250 `v1.0.0` stable

### Why 1 Haziran ertelenmez

- **Public commitment:** Sprint 183 sonrası Alperen Twitter/blog'da "Haziran beta" söz verdi
- **Trinity 3-face momentum:** Embedded web terminal Sprint 175, beta launch 175→200 sprint window
- **Sub-project pipeline:** #1 (chat), #2 (terminal), #3 (multi-tenant), #4 (enterprise) — sıraya alınıyor, beta launch trigger
- **WrongStack benchmark:** Alternatif tool'ların 110+ provider catalog avantajı; Deckent'ın olgunluk avantajı beta'da kanıtlanır
- **Karpathy/AEGIS academic paper:** Sprint 200 sonrası ICSE/FSE 2027 submission — beta launch academic credibility için zorunlu

**Risk:** Beta scope sürünmesi (creep) yasak. Sprint 198+'da yeni feature ekleme istemiyle gelirse Alperen onayı + post-beta'ya ertelenmesi şart.

İlgili: [[project_deckent_god_level_vision]], [[project_deckent_trinity_anchor]], [[project_deckent_agentic_os_vision]], [[feedback_no_minimum_no_mvp_deckent]]
