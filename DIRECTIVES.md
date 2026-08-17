# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-17 (RUN-INSPECTOR-001 package-3 kapanışı sonrası truth-sync). Şu anda
aktif Deckent run/sprint YOKTUR ve bu dosya hiçbir execution authority taşımaz. Retained
DIRECTIVES içeriği ASLA aktif-iş kanıtı değildir (operating policy §2).

- Son kapanan wave: **sprint-543 — RUN-INSPECTOR-001 package 3** (revision-cursor observer ·
  `/api/sprint/live/stream` SSE · `deckent_inspect` MCP twin · Desktop Runs paneli · doc
  güncellemeleri). Dogfood kaydı dürüst ABORTED (3/5 DONE; 003+004 NO_GO'ları planner'ın
  yeni-doğan dosya yollarını `filesWrite`'a koymaması — BLOCKS_CURRENT_DONE ürün bulgusu,
  3. veri noktası); tamamlama Brain el-koduyla (ADR-D-007 seam). Kanıt: MASTER 6071
  evidence, 160/160 battery, SSE+MCP gerçek-binary smoke.
- Aktif mode authority: `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
  `DECKENT-DEV-CONTROL` bloğu. Repo-development kontratı:
  `docs/governance/deckent-dev-operating-policy.md` (parity lint:gates içinde).

`DOGFOOD_MODE=ON` bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak yeniden üretilir; o ana kadar boş/idle kalır.
