# R45-A — Owner yetkilendirmesi (Alperen, 2026-09-15, canlı karar; Fable soru-cevap kaydı)

R45 RESULT.md'deki dört kırmızı için owner kararları. Bu dosya CUTOVER-PACKAGE.md'nin
"kırmızıları düzeltme" kuralını aşağıdaki DÖRT kalemle sınırlı olarak kaldırır; başka düzeltme
yetkisi vermez. Silinme tetiği CUTOVER-PACKAGE.md ile aynıdır.

1. **K0 tamamlama — EVET.** `.cursor/rules/deckent.mdc` DECKENT-DEV-CONTROL bloğu
   `AGENTS.md`/`CLAUDE.md` ile byte-identical (`DOGFOOD_MODE=OFF`,
   `DECISION_REF=owner-live-2026-09-15-refactor-cutover-dogfood-off`).
   `docs/governance/deckent-dev-operating-policy.md` karar geçmişine mevcut kalıpla satır:
   "Alperen 2026-09-15: `DECISION_REF=owner-live-2026-09-15-refactor-cutover-dogfood-off` —
   recovery R44'te donduruldu, kapsamlı refaktör için DOGFOOD_MODE=OFF; refaktör ayrı outcome."
   `lint-operating-policy` bu iki kalemde yeşil olmalı. Commit 1'e girer (AGENTS.md'deki 2026-09-13
   Codex bölümü aynı commit'te, mesajda anılır).

2. **Capsule'lar — archive'a TAŞI, içerik değişmez.** `git mv` ile
   `docs/execution/active/{RECOVERY-DO-DOGFOOD-001.md, RECOVERY-DO-DOGFOOD-001-R0B.md,
   RECOVERY-DO-DOGFOOD-001-R1-PLAN.md, RECOVERY-DO-DOGFOOD-001-REPAIR-PLAN.md,
   DOGFOOD-RESTORATION-2026-09-12.md}` ve untracked `DOGFOOD-CROSS-SURFACE-ANALYSIS-PLAN.md` →
   `docs/execution/archive/dogfood-recovery-2026-09/`. Önce gate'in tarama kökünün yalnız
   `docs/execution/active/` olduğu `scripts/lint-operating-policy.mjs` içinden gösterilir; değilse
   taşıma yapılmaz ve RESULT'a yazılır. Diğer untracked `active/` dizinleri
   (`DOGFOOD-UNIFIED-AUDIT-20260913/`, `dogfood-comparison/`, `parallel-4-post-recovery-762/`)
   gate'i kırmıyorsa dokunulmaz, EVIDENCE sınıfında kalır. Commit 5.

3. **Parity — katalogu DÜZELT, baseline kabulü YOK.** `src/mcp/tools/description-catalog.ts`
   `deckent_checkpoint` ve `deckent_explain` girişleri, CLI'nin gerçekten `.description(getMessage(...))`
   ile okuduğu anahtara bağlanır; anahtar yoksa `cli-shared` yerine gate'in kabul ettiği surface
   sınıfına alınır. `lint-cli-mcp-parity` yeşil, `--update-baseline` çalıştırılmaz. Commit 5.

4. **MASTER 8031/8032 — review-date=2026-10-15.** Her iki DEFERRED satırının kanıt hücresi tam
   olarak `reason=gerçek Apple/Windows host gerekir; refaktör sonrası;review-date=2026-10-15`
   (validator'ın istediği `reason=<...>;review-date=<YYYY-MM-DD>` şekli; ayraç kuralını validator
   hata metnine göre uygula). Ardından `npm run docs:master-plan` ile generated projeksiyon; elle
   düzenleme yok. Commit 6.

5. **Handoff alıcı oturum.** Refaktör planlaması Fable oturumunda, yürütme Astra'ya devredilecek.
   HANDOFF.json `receivingSession`: `refactor-plan-fable-20260915`; `executingAuthority`: Astra.
   Receipt yalnız K7 push tamamlandıktan sonra "prepared" olur.

Sıra: 1 → 2 → 3 → 4 → `lint-operating-policy`, `npm run lint`, `npm run docs:master-plan`,
konsolide test tek koşum (tekrar) → K7 commit 1–7 → `git push origin main` → status boş →
RESULT.md güncelle → CUTOVER-PACKAGE.md ve bu dosya silinir. Kırmızı sürerse yine durulur;
bu dosya dışında düzeltme yetkisi yoktur.
