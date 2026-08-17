# DIRECTIVES — no active run (idle truth-state)

**Güncelleme:** 2026-08-17 (sprint-540 kapanışı sonrası truth-sync). Şu anda aktif Deckent
run/sprint YOKTUR ve bu dosya hiçbir execution authority taşımaz. Retained DIRECTIVES
içeriği ASLA aktif-iş kanıtı değildir (operating policy §2; brain kuralı: "do not infer
a live run from a retained document").

- Son kapanan wave: **sprint-540 — Phase-5 correction (governance battery live-ledger
  truth-sync)**. Run dürüst **NO_GO** ile terminal kapandı: honest-gate
  `WORK_ATTRIBUTION_HOLD: CLAIM_OUTSIDE_WRITE_SCOPE` — planner koşum sırasında doğan
  content-addressed projection-bundle path'lerini `filesWrite`'a koymamıştı (plan kusuru;
  replan disposition `reviseScope`). İşin kendisi diskte bağımsız doğrulamayla yeşildi
  (26/26 governance battery, iki generator `--check` exit 0, closure gate 2-event OK,
  korunan ledger path'lerinde 0 byte) ve **owner talimatıyla (Alperen 2026-08-17
  "540 işin sen landed yap") doğrudan main'e land edildi** — dogfood verdict'i
  değiştirilmedi, landing owner-directed seam'dir.
- Owner-onaylı bulgu (admission bekler): tek-görevli sprint'te 1/1 NO_GO = %100, run-seviyesi
  NO_GO-oran koruması FIX bütçesine hiç girmeden run'ı duraklatıyor — tek-task run'larda
  FIX fazı fiilen erişilemez.
- Aktif mode authority: `AGENTS.md`/`CLAUDE.md` başındaki machine-readable
  `DECKENT-DEV-CONTROL` bloğu (capsule/DIRECTIVES mode authority DEĞİLDİR). Aktif outcome
  kaydı: `docs/execution/active/` altındaki Outcome Capsule'lar.
- Repo-development çalışma kontratı: `docs/governance/deckent-dev-operating-policy.md`
  (host'lara OPERATING-POLICY bloğu olarak projekte edilir; parity
  `scripts/lint-operating-policy.mjs` ile lint:gates içinde machine-enforced'tur).

`DOGFOOD_MODE=ON` bir run başlatıldığında bu dosya o run'ın exact execution projection'ı
olarak yeniden üretilir; o ana kadar boş/idle kalır.
