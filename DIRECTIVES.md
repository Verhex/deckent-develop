# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-17 (DEV-OPERATING-CONTRACT-001 truth-sync). Şu anda aktif Deckent
run/sprint YOKTUR ve bu dosya hiçbir execution authority taşımaz. Retained DIRECTIVES içeriği
ASLA aktif-iş kanıtı değildir (operating policy §2; brain kuralı: "do not infer a live run
from a retained document").

- Son kapanan wave: Sprint-533 local-llm GPU acceleration closure — COMPLETE
  (kayıt: `docs/SPRINT-LOG.md`; işletim kanıtı MASTER `OWNER-MODEL-POLICY-001` satırında).
- Aktif mode authority: `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
  `DECKENT-DEV-CONTROL` bloğu (capsule/DIRECTIVES mode authority DEĞİLDİR). Aktif outcome
  kaydı: `docs/execution/active/` altındaki Outcome Capsule'lar.
- Repo-development çalışma kontratı: `docs/governance/deckent-dev-operating-policy.md`
  (host'lara OPERATING-POLICY bloğu olarak projekte edilir; parity
  `scripts/lint-operating-policy.mjs` ile lint:gates içinde machine-enforced'tur).

`DOGFOOD_MODE=ON` bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak Deckent tarafından yeniden üretilir; o ana kadar boş/idle kalır.
