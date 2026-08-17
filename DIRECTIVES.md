# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-17 (Phase-5 ilk authenticated ledger batch kapanışı sonrası truth-sync).
Şu anda aktif Deckent run/sprint YOKTUR ve bu dosya hiçbir execution authority taşımaz.
Retained DIRECTIVES içeriği ASLA aktif-iş kanıtı değildir (operating policy §2; brain kuralı:
"do not infer a live run from a retained document").

- Son kapanan wave: **sprint-539 — Phase-5 slice 3, signed writer + owner sign ceremony**
  (2/2 DONE; kayıt: `docs/SPRINT-LOG.md`, arşiv: `.deckent/archive/sprints/`). Ardından
  owner ceremony'siyle **ilk authenticated Closure OS ledger batch'i** append edildi
  (`dba89c03…`, 2 event, owner-signed ed25519 receipt) ve 8101+7140 MASTER settlement'ı
  kapandı — kanıt: `docs/governance/closure-dispositions.jsonl` + consumed
  `GR-2026-08-17-CLOSURE-BATCH-01/-02` receipt'leri.
- Aktif mode authority: `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
  `DECKENT-DEV-CONTROL` bloğu (capsule/DIRECTIVES mode authority DEĞİLDİR). Aktif outcome
  kaydı: `docs/execution/active/` altındaki Outcome Capsule'lar.
- Repo-development çalışma kontratı: `docs/governance/deckent-dev-operating-policy.md`
  (host'lara OPERATING-POLICY bloğu olarak projekte edilir; parity
  `scripts/lint-operating-policy.mjs` ile lint:gates içinde machine-enforced'tur).

`DOGFOOD_MODE=ON` bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak yeniden üretilir; o ana kadar boş/idle kalır.
