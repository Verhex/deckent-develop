# Deckent — Ana Plan (Türkçe)

> **Durum:** KANONİK geliştirme planının Türkçe sürümü. İngilizce kaynak + her zaman güncel: [`docs/MASTER-PLAN.md`](MASTER-PLAN.md). Bu TR sürüm Alperen incelemesi için; çelişki olursa EN sürüm esastır.
> **Son uyum:** 2026-06-02 (Sprint 218 kapandı, Sprint 219 planlandı). **Sürüm:** v1.0.0-beta.1.
> **Doküman rolleri:** `MASTER-PLAN.md` = NASIL geliştiriyoruz (yol haritası — geliştirme SSOT). `docs/vision/blueprint.md` = deckent NE'dir/NEREDE (kimlik SSOT).

---

## 1. Kuzey Yıldızı & Vizyon

**Deckent, makinende yaşayan, sprint'lerini çalıştıran ve asla eve telefon etmeyen, kur-ve-çalıştır bir AI agent orkestratörüdür.**

Üç değişmez sütun:
1. **Sağlayıcı-bağımsız** — herhangi bir LLM: bulut aboneliği *veya* yerel Ollama, sıfır-API-key seçeneğiyle. Vendor kilidi yok.
2. **Sohbet-odaklı** — `claude` gibi çalışan native chat REPL (`deckent` / `deckent chat`); terminal, web UI ve IDE'den erişilir.
3. **Üç-yüz (Trinity)** — tek motor, üç kitle: geliştirici / kurum / birey.

**Lisans & model:** MIT, sonsuza dek ücretsiz. "Pro" katman yok, "team" planı yok, kapılı-özellikli enterprise edition yok. Dogfood döngüsünü çalıştıran aynı kod 10.000 kişilik şirkette de çalışır (ADR-033).

**Moat — evrimsel mimari:** Deckent her sprint'ten öğrenir. Brain kendi retro'larını okur, routing sonuçları agent/skill seçimini besler, prompt-evolution + adaptive-agent davranışı zamanla ayarlar. Bu kendini-iyileştirme döngüsü — tek bir özellik değil — ana farklılaştırıcıdır.

**Konumlandırma (2026-06-02 — "anti-X" dili YOK; kıyasla, kötüleme):** Deckent, **açık bir agent'ın god-level orkestre + enterprise katmanı** — ve bu gücü **tek bir kullanıcının bile zahmetsiz kullanabileceği** kadar kolay. Bir geliştiricinin laptop'undan 10.000 kişilik kuruma kadar tek MIT ürün. **"Open source for open world."** Rakipleri (Devin, Cursor, Claude Code, Cowork, Perplexity, açık agent CLI'lar) yetenek üzerinden kıyaslarız; asla "anti-X" konumlanmayız.

**Veri mimarisi:** İki dik (ortogonal) DB kavramı:
1. **Deckent'in kendi orkestrasyon belleği** = `.brain/memory.db` — gömülü **SQLite + FTS5**, per-proje, zero-config, asla-eve-telefon-etmez. ADR/sprint/retro/pattern/debt tek kaynağı. **SQLite KALIR** — hedef proje Postgres/Oracle kullansa bile taşınmaz.
2. **Hedef projenin verisi** (örn. Postgres/Oracle ERP) = connector/capability işi — Capability Broker (F8 `db.query`/`erp.read`, önce read-only) + RBAC + onay kapısı ile erişilir.
- **Vektör DB / embeddings:** opsiyonel post-GA (semantik recall); yerel embeddings (RTX 5090 Ollama) — never-calls-home korunur. FTS5 mevcut ölçekte yeterli.

**Pozisyon evrimi:** Deckent artık sadece "kurduğun ürün" değil — **AI runtime ekosistemi**: (a) bireysel geliştiricinin orkestratörü, (b) bireyin otonom agent'ı, (c) kurumun god-level orkestrasyon ekosistemi — milyon-kullanıcı/ortam/agent ölçeğinde. Kolay kurulum, düşük gereksinim, öğrenen/evrilen. Enterprise (ERP dahil) ayrı edition değil, *runtime hedefi* (ADR-033 geçerli).

---

## 2. Trinity — Üç Yüz (olgunluk)

| Yüz | Kitle | Mod | Olgunluk | 100%'e açık |
|-----|-------|-----|----------|-------------|
| **AI Geliştirici** | Geliştirici | Sprint Mode | ~90% | F1-004/005 docker provider-aware → 95% |
| **AI Sistem İşçisi** | Kurum | Process Mode | ~80% | F3-004 k8s + F7-006 enterprise UI → 90%+ |
| **AI Asistan** | Birey | Chat Mode | ~80% | F2 streaming + native-chat-everywhere + otonom REPL → 90%+ |

Tek motordan üç yüz; paralel olgunlaşır, sırayla değil.

---

## 3. Güncel Durum (Sprint 218 kapandı, 2026-06-02)

- **Sprint 218 ✅ DONE** — Dashboard God-Level: git self-mutation guard (deckent-dev tree reset koruması), sprint-start detach (serve donmuyor), 4 hollow sayfa route+sidebar'a bağlandı, ChatPage gerçek round-trip, native UI (theme/use-live-data/Layout). ADR-080. Dashboard 8 sayfa **tarayıcıda doğrulandı** (Layout navItems kök-fix).
- **Sprint 216 ✅ DONE** — Proof-of-Function DoD (ADR-079): `isUserSurfaceTask` Tier-0/1, sprint-içi Smoke gate, serve localhost API-token auto-mint FIXED (run-proven /api/status 200). Sprint 216 git-reset-wipe olayı → Sprint 218'de kurtarıldı + git-guard eklendi.
- **Sprint 211-215:** F5 evrim wire (6 modül canlı, ADR-075), routing skill→agent affinity, CI-hermeticity kalıcı (test:ci-sim), 8-provider fleet (DeepSeek/Qwen/GLM register + overflow), evrim moat görünür.
- **Test:** ~18.880 geçti + dashboard ~742, 0 fail, `tsc` temiz. CI yeşil.
- **Memory katmanı işlevsel (kanıtlı 2026-06-02):** memory.db 6MB, 487 entry (adr/sprint/retro/pattern/debt/memory), 11 tablo, FTS5 dual-layer i18n recall (TR+EN). Token-azaltma + AI-projeyi-unutmama amacı gerçek.
- **Motor:** PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP; 3 backend (docker/tmux/subprocess); 15 agent + 21 skill; routing-engine v2; Memory V2; 32 MCP tool + 8 resource; 49+ CLI; React dashboard (8+ sayfa) + embedded terminal; VS Code extension.

**🔴 Proof-of-Function dersi:** "DONE" ≠ kullanıcı-çalışıyor. Mock test wiring'i kanıtlar, UX'i değil. User-surface task'lar gerçek-binary `Smoke:` ile doğrulanır (ADR-079, kodda canlı).

---

## 4. Özellik Matrisi (F1-F10 özet)

- **F1 Sağlayıcı bağımsızlık ~95%** — Ollama + 8-provider fleet (Claude/Gemini/Codex subs + DeepSeek/Qwen/GLM API + local). Kalan: docker provider-aware (F1-004/005).
- **F2 Native Chat ~90%** — tool-use loop, memory, session resume ✅. Kalan: gerçek streaming (F2-007, Sprint 219), native SDK Path C (F2-008), **`deckent` argümansız agentic REPL (Sprint 219)**.
- **F3 Process Mode ~85%** — tenant, scheduled-flows, event triggers ✅. Kalan: k8s pod-exec, Workflow Composer.
- **F4 Enterprise ✅ 100%** — RBAC, audit (HMAC), rate-limit, enterprise config. Kalan (ops): SSO/SIEM derinlik.
- **F5 Evrimsel ~90%** — 6 modül canlı (ADR-075). Kalan: aktif identity-mutation ölçek (F5-008 ~70%).
- **F6 Auth Esneklik ~50%** — model katalog ✅. Kalan: hybrid mode tam-wire, auth matrix test, API aktivasyon (post-beta).
- **F7 Dashboard ~95%** — 8 sayfa route+sidebar, god-level UI, run-proven. Kalan: terminal polish (F7-004), enterprise sayfa API-token.
- **F8 Capability Broker** ⬜ önerildi (ERP `db.query`/`erp.read` soyutlaması).
- **F9 MCP Client** ⬜ önerildi (dış MCP server'ları tüketme — yüksek değer).
- **F10 Policy Engine** ⚠️ kısmi (RBAC+activation+condition birleştirme).

---

## 5. Alt-Projeler (Agentic-OS Pipeline)
- **#1 Embedded Web Terminal** ✅ GA (ADR-062).
- **#2 Self-security** ⬜ başlamadı.
- **#3 Milyon-ölçek** ⚠️ kısmi (multi-tenant/mTLS/k8s).
- **#4 Enterprise entegrasyonlar** ✅ çekirdek (SSO/SIEM ops).
- **#5 Local LLM (Ollama/CUDA)** ⚠️ kısmi (adapter canlı, fully-local preset eksik).
- **#ERP** ⬜ önerildi — deckent kurumun *içinde*: süreç otomasyonu, DB read-only, kontrollü yönetim. F3 + F8 + RBAC üstüne.

---

## 6. Native Chat Everywhere + Otonom Agentic (öncelik)

Hedef: `deckent` terminalde `claude` gibi native conversational agentic REPL. **Sprint 219 = "Native Agentic Deckent":** `deckent` argümansız → agentic REPL, doğal dil → MCP aksiyon (onay kapılı) + session persist + F2 streaming.

**🤖 Otonom agentic runtime (yön):** on-demand sprint'in ötesinde — deckent **sürekli + yetki-sınırlı** çalışır (sipariş takip, MRP, müşteri talebi → RBAC+onay sınırında aksiyon). Temel: F3 + scheduled-flows + nervous + Capability Broker (F8 ERP) + ADR-037. Sprint 219-014 iskelet.

---

## 7. İş Streamleri (özet)
- W-A OSS GA blocker ✅ | W-B doc-drift ⚠️ | W-C native chat (Path B✅, A/C devam) | W-D dashboard ✅ (Sprint 218) | W-E evrim ✅ | W-F provider ✅P0 | W-G API test ✅ | W-H doküman ⚠️ | W-I OSS publish ⬜ | W-J milyon-ölçek hardening ⬜ post-beta | W-K dead-code wire ✅

---

## 8. İş / Lansman / OSS
- **Model:** MIT, ücretsiz, self-hosted. **TEK ÜRÜN** — open-core/Odoo-tarzı ayrı Enterprise Edition YOK (karar 2026-06-02). Enterprise yetenekleri aynı kodun modüler açık katmanları (`core` + `enterprise-layer`). ADR-033.
- **Beta:** v1.0.0-beta.1, OSS public beta 2026-06-01. İlk `npm publish` = Alperen manuel.
- **Kıyaslama (kötüleme değil):** çok-agent paralel + sprint lifecycle + scope enforcement + memory/learning + multi-provider + MCP-native birleştiren tek OSS aracı. **"Open source for open world."**
- **Yayın boru hattı eksikleri (GA):** secret-scrub (gitleaks/git-filter-repo) — public flip öncesi ŞART; `.github/` ISSUE/PR template (kısmen var), 96%-claim doğrula, threat-model, landing page. → Sprint 220.

---

## 9. Beta Kapıları
20 kapı geçti: tsc temiz, ~18.880 test + dashboard 742, coverage, 32 MCP + 49 CLI, npm pack, cross-platform, multi-provider, i18n, Memory V2, sıfır CRITICAL debt, ADR governance, disk-verify gate. **CI YEŞİL** (aylarca kırıktı, Sprint 214'te yeşertildi). Kalan: README badge sync, 96%-claim benchmark, messaging trio token aktivasyon, M1-M4 monitoring.

---

## 10. Sıralama (Sprint 219+)
- **219** ✅ planlandı — Native Agentic Deckent (REPL + tool-use + streaming + dashboard kalıcı + TR doc + otonom temel). 14 task.
- **220 adayı** — GA-readiness (secret-scrub + .github + 96%-claim + threat-model) + otonom agentic tam-wire + onboarding/everywhere (6-senaryo preset).
- **post-beta** — provider/local-LLM, milyon-ölçek hardening (OTel), self-security, F8/F9/F10 ekosistem.
- **gated** — Voice (10K star), Mobile (50K star).

---

## 11. Çapa Kuralları / DNA
- **MVP yok, hep god-level** ("bu god-level mi?").
- **Disk-verify + run-verify ground truth** — Brain verdict'e değil, diske/gerçek-koşuya güven.
- **Proof-of-Function DoD** — user-surface DONE = gerçek-binary kanıt.
- **Subscription-first** (API mode beta'da yasak).
- **npm publish = Alperen manuel.**
- **Karpathy 4-disiplin** worker çapası.
- **git self-mutation guard** — deckent-dev tree'sinde worker-spawn reset YAPMAZ (ADR-039).
- **ADR-033** tek-ürün · **ADR-037** RBAC · **ADR-040** nervous · **ADR-079** Proof-of-Function · **ADR-080** dashboard.

---

## 12. Riskler
1. Routing collapse (refactorer-ağırlığı) → surface-bonus + diversity guard (çözülüyor).
2. Native-chat scope creep → sıkı sıra.
3. Doc-reality drift → MASTER-PLAN tek SSOT.
4. ✅ git self-mutation (Sprint 216 kaybı) → guard ile çözüldü.
5. ✅ CI red → çözüldü (hermeticity).

---

## 13. Kapsam Dışı (kayıpsız kayıt)
Cloud SaaS (ADR-033 red), Microsoft-ekosistem core (opsiyonel post-GA), LangSmith (never-calls-home ihlali), ayrı Enterprise Edition (tek-ürün kararı), extra provider adapter'lar (P3+), `deckentd` daemon (gereksiz).

---

*Geliştirme tek-kaynağı EN sürümdür: [`docs/MASTER-PLAN.md`](MASTER-PLAN.md). Bu TR özet ilerleyişe göre senkronlanır.*
