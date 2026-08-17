# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-17 (RUN-INSPECTOR-001 package-2 kapanışı sonrası truth-sync). Şu anda
aktif Deckent run/sprint YOKTUR ve bu dosya hiçbir execution authority taşımaz. Retained
DIRECTIVES içeriği ASLA aktif-iş kanıtı değildir (operating policy §2).

- Son kapanan wave: **sprint-542 — RUN-INSPECTOR-001 package 2** (5-task paralel DAG:
  read-model runs+lineage genişletmesi · /api/inspector/runs · `deckent inspect` Terminal
  yüzü · Desktop lifecycle chip · iki dilli reference dokümantasyonu). Dogfood kaydı
  dürüst ABORTED (4/5 DONE; 004 verdict'i kriter-metni artifact'ı — istenen desktop suite
  repoda yok, iş diskte yeşil); kalan tamamlama + smoke Brain el-koduyla (ADR-D-007 seam).
  Kanıt: MASTER 6071 evidence, `docs/SPRINT-LOG.md`, 109/109 battery, gerçek-binary smoke.
- Aktif mode authority: `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
  `DECKENT-DEV-CONTROL` bloğu. Repo-development kontratı:
  `docs/governance/deckent-dev-operating-policy.md` (parity lint:gates içinde).

`DOGFOOD_MODE=ON` bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak yeniden üretilir; o ana kadar boş/idle kalır.
