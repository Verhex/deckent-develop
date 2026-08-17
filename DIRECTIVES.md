# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-17 (sprint-537 canary PASS sonrası truth-sync; owner kararı). Şu anda
aktif Deckent run/sprint YOKTUR ve bu dosya hiçbir execution authority taşımaz. Retained
DIRECTIVES içeriği ASLA aktif-iş kanıtı değildir (operating policy §2; brain kuralı: "do not
infer a live run from a retained document").

- Son kapanan wave: **sprint-537 — RUN-POLICY canary, owner-PASS** (terminal receipt COMPLETE,
  policy digest `54754a6b…` uçtan uca kanıtlı; kayıt: `docs/SPRINT-LOG.md`, arşiv:
  `.deckent/archive/sprints/sprint-537-tasks/`). Önceki wave: Sprint-533 local-llm GPU
  closure — COMPLETE.
- Aktif mode authority: `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
  `DECKENT-DEV-CONTROL` bloğu (capsule/DIRECTIVES mode authority DEĞİLDİR). Aktif outcome
  kaydı: `docs/execution/active/` altındaki Outcome Capsule'lar.
- Repo-development çalışma kontratı: `docs/governance/deckent-dev-operating-policy.md`
  (host'lara OPERATING-POLICY bloğu olarak projekte edilir; parity
  `scripts/lint-operating-policy.mjs` ile lint:gates içinde machine-enforced'tur).

`DOGFOOD_MODE=ON` bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak yeniden üretilir; o ana kadar boş/idle kalır.
