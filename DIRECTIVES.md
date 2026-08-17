# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-17 (RUN-INSPECTOR-001 package-1 kapanışı sonrası truth-sync). Şu anda
aktif Deckent run/sprint YOKTUR ve bu dosya hiçbir execution authority taşımaz. Retained
DIRECTIVES içeriği ASLA aktif-iş kanıtı değildir (operating policy §2).

- Son kapanan wave: **sprint-541 — RUN-INSPECTOR-001 package 1** (canonical inspector
  read-model + sprint-live-service emekliliği). Dogfood kaydı dürüst ABORTED (task-1 DONE;
  task-2 worker 98/99, FIX worker'ı protokol Bash quote-parse hatasıyla öldü, ratio-guard
  %50 eşiğinde kesti); kalan tamamlama Brain el-koduyla (ADR-D-007 seam). Ürün kanıtı:
  99/99 battery + gerçek-binary smoke; kayıt MASTER 6071 evidence + `docs/SPRINT-LOG.md`.
- Aktif mode authority: `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
  `DECKENT-DEV-CONTROL` bloğu. Repo-development kontratı:
  `docs/governance/deckent-dev-operating-policy.md` (parity lint:gates içinde).

`DOGFOOD_MODE=ON` bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak yeniden üretilir; o ana kadar boş/idle kalır.
