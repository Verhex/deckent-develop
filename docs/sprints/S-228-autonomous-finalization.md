# DIRECTIVES — Sprint 228: Autonomous Feature Finalization (i18n + manifest + doc + e2e)

## Goal: Sprint-226'da inen `deckent autonomous` CLI (F3-009 / AS-6) **canlı + çalışıyor** ama eksik kalanları kapat: (1) CLI **hardcoded string** içeriyor (getMessage=0, CLAUDE.md i18n-FIRST ihlali — 226-007 borcu), (2) **features-manifest.json'da yok** (sync-manifest.mjs FEATURE_DEFINITIONS'a eklenmeli), (3) **usage dokümantasyonu yok**, (4) gerçek-binary **e2e smoke** yok. Bu sprint hepsini god-level kapatır. **Build sonrası ilk sprint → integrity-fix'leri (rubric/export/decay) de canlı doğrular (temiz koşmalı, wipe YOK).** **RUN-VERIFY, hermetik, CI yeşil KORUNUR.**

## Ortak kurallar
- **🟢 RUN-VERIFY (ADR-079):** kanıt çağıran-dosyada; user-surface → `Smoke:` gerçek-binary. Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETİK:** tmpdir + sandbox HOME, async spawn (spawnSync YASAK), `test:ci-sim` yeşil.
- **🔴 i18n-FIRST (CLAUDE.md):** user-facing string ASLA hardcode — `getMessage(key, lang)`, en/tr. Mekanizma string-free.
- ESM `.js`. ≤200 LoC/task, YENİ test dosyası, sadece kendi filesWrite'ına yaz.

---

## Task 1: 228-001 — [P0] autonomous CLI i18n retrofit (hardcode → getMessage)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/autonomous.ts, src/cli/helpers/messages.ts, tests/cli/autonomous-i18n.test.ts
- Scope: src/cli/commands/, src/cli/helpers/, tests/cli/
### Description
**Borç (226-007):** `autonomous.ts` tüm user-facing string'leri hardcoded ("Autonomous runtime status", "Pending approvals: N", "No audit events yet", start/stop mesajları) — `getMessage` 0 kullanım. **Çözüm:** tüm user-facing çıktıyı `getMessage(key, lang)`'a taşı; `messages.ts`'e en/tr key'ler ekle (`autonomous_status_header`, `autonomous_pending`, `autonomous_no_audit`, `autonomous_started`, `autonomous_stopped`, vb. — `{placeholder}` interpolation ile sayılar). `--lang` opsiyonu zaten var → onurlanmalı. Mekanizma string-free, label caller'dan. Caller autonomous.ts.
**Kanıt:** `grep -c "getMessage" src/cli/commands/autonomous.ts` → ≥5 (hardcode'dan dönüş); `grep -cE "console\.(log\|error)\(['\\\`][A-Z]" src/cli/commands/autonomous.ts` → 0 (düz string kalmadı); `npx vitest run tests/cli/autonomous-i18n.test.ts` → 4+ pass
**Test:** ≥4 (status en, status tr, pending-count interpolation, no-audit mesajı i18n) — hermetik (tmpdir)
**Smoke (Tier-1 ZORUNLU):** `LANG=tr env -u ANTHROPIC_API_KEY node dist/cli/entry.js autonomous status 2>&1 | head` → TR çıktı (catalog'tan); `--help` + status İngilizce default — hardcode-EN değil.

## Task 2: 228-002 — features-manifest entry (sync-manifest.mjs → regenerate)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: scripts/sync-manifest.mjs, .deckent/features-manifest.json, tests/scripts/manifest-autonomous.test.ts
- Scope: scripts/, .deckent/, tests/scripts/
### Description
**Eksik:** autonomous-runtime features-manifest'te yok. Manifest `scripts/sync-manifest.mjs` `FEATURE_DEFINITIONS`'tan üretiliyor (elle JSON düzenleme YOK). **Çözüm:** `FEATURE_DEFINITIONS`'a `autonomous-runtime` entry ekle (id, label "Autonomous Runtime — F3-009 authority-bounded loop", files: `src/orchestra/autonomous/*` + `src/cli/commands/autonomous.ts`, description, **active** bucket — CLI wired + canlı). Regenerate `.deckent/features-manifest.json`. Caller sync-manifest.mjs.
**Kanıt:** `grep -c "autonomous" scripts/sync-manifest.mjs` → ≥1; `grep -c "autonomous-runtime\|Autonomous Runtime" .deckent/features-manifest.json` → ≥1 (regenerate sonrası); `npx vitest run tests/scripts/manifest-autonomous.test.ts` → 3+ pass
**Test:** ≥3 (FEATURE_DEFINITIONS'ta autonomous var, regenerate manifest'e yazar, active bucket'ta) — hermetik
**Smoke:** `node scripts/sync-manifest.mjs && grep -c autonomous .deckent/features-manifest.json` → ≥1.

## Task 3: 228-003 — Autonomous usage doc (TR/EN, güvenlik modeli dahil)
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: docs/guide/autonomous.md, tests/docs/autonomous-doc.test.ts
- Scope: docs/, tests/docs/
### Description
**Eksik:** otonom kullanım dokümantasyonu yok. **Çözüm:** `docs/guide/autonomous.md` — `start|status|stop` komutları + opsiyonlar (--interval-ms/--max-iterations/--root/--lang); **döngü mimarisi** (Trigger→Authority→Approval→Action→Audit); **güvenlik invariant'ı** (default-deny + insan-onay-gate, OTO-APPROVE YOK, oto-sprint-start YOK); AS-6 / F3-009 bağlamı; örnek çıktılar. Kod-doğru (gerçek subcommand/opsiyon adları). Test ground-truth doğrular.
**Kanıt:** `grep -cE "autonomous (start\|status\|stop)\|default-deny\|--max-iterations\|F3-009" docs/guide/autonomous.md` → ≥4; `npx vitest run tests/docs/autonomous-doc.test.ts` → 3+ pass
**Test:** ≥3 (komutlar koda uyar, güvenlik-modeli anlatılmış, opsiyonlar doğru) — kod-referanslı
**Smoke:** (Tier-0 docs) unit yeterli.

## Task 4: 228-004 — Autonomous e2e smoke harness (gerçek-binary start→status→stop)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/autonomous-smoke.mjs, tests/scripts/autonomous-smoke.test.ts
- Scope: scripts/, tests/scripts/
### Description
**Çözüm:** `scripts/autonomous-smoke.mjs` — gerçek `dist/cli/entry.js autonomous`: `start --max-iterations 2 --interval-ms 200` (bounded, tmpdir root) → loop 2-tick temiz koşar + `.result`/audit yazılır → `status` pending/audit gösterir → temiz exit (PASS/FAIL). Async spawn, timeout-guard, tmpdir-izole. Default-deny korunur (oto-aksiyon yok). Caller scripts.
**Kanıt:** `grep -cE "autonomous\|start\|status\|max-iterations\|entry.js\|spawn" scripts/autonomous-smoke.mjs` → ≥4; `npx vitest run tests/scripts/autonomous-smoke.test.ts` → 3+ pass
**Test:** ≥3 (bounded-start temiz exit, status-çıktı, tmpdir-izole) — async hermetik
**Smoke (Tier-1):** `node scripts/autonomous-smoke.mjs` → bounded loop 2-tick PASS (run-proven).

---

**Beklenen:** 4/4 DONE. Tek wave (4 distinct filesWrite — autonomous.ts+messages / sync-manifest+json / docs / scripts). `deckent autonomous` artık: i18n-temiz + manifest'te + dokümante + e2e-proven. **Bonus:** build sonrası ilk sprint → integrity-fix'ler (rubric diagnostic / export-guard / decay-safety) canlı doğrulanır — export/memory wipe OLMAMALI, rubric 78.75'e sabitlenmemeli. Koşu sonrası kontrol: `grep -cE "adr-" .brain/exports/decisions.md` (≥75 korunmalı, wipe yok).

**Pre-flight:** main temiz+commit'li+push'lu ✅ + DB backup. build:all + /mcp restart + RE-PLAN (Alperen). **CLI'dan `env -u ANTHROPIC_API_KEY`**.

İlgili: MASTER-PLAN §4A/AS-6 · F3-009 · ADR-037 (RBAC) · ADR-040 (nervous) · ADR-012 (CLI register) · CLAUDE.md i18n-FIRST. Memory: [[feedback_god_level_i18n_quality_bar]] · [[feedback_proof_of_function_dod]] · [[project_brain_integrity_sprint226_cluster]] (bu sprint fix'leri canlı-test eder).
