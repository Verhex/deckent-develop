# DIRECTIVES — Sprint: Process-Mode CLI Parity + MCP-W1 Review-Debt Closeout

## Goal: deckent'in process-mode'una CLI yüzeyi kazandır (ADR-022 CLI/MCP parity — şu an yalnız MCP `deckent_process` var, CLI yok) ve MCP-W1 final-review'da defer edilen küçük borçları kapat. Bu sprint **auto-mode lifecycle dogfood**'udur: tam sprint akışını (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO) gerçek işle koşturup gözlemliyoruz. Her task TDD + i18n-temiz + cerrahi. Mock-only YASAK — gerçek davranışı assert et. tsc temiz, CI yeşil.

## Ortak kurallar (BAĞLAYICI)
- **Gerçek-davranış testi**, mock değil. **Cerrahi scope** — yalnız task'ın Files/Scope'una yaz. **Lossless** — mevcut testler geçmeye devam etsin. **ESM** `.js` uzantısı.

---

## Task 1: `deckent process` CLI komutu — MCP parity
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/process.ts, src/cli/entry.ts
- Scope: src/cli/

### Description
Process-mode şu an yalnız MCP'de (`deckent_process` tool, `src/mcp/tools/process.ts` — submit/status/result action'ları, ExecutionRequest gönderir → policy-gated auto-run/park, executionId ile status/result). CLI'da **yok** (ADR-022 CLI/MCP parity ihlali). Yeni `src/cli/commands/process.ts` ekle: `register<Process>(program)` deseniyle (ADR-012) bir `deckent process` komutu + alt-komutlar: `submit <description>` (ExecutionRequest gönder → executionId yaz), `status <executionId>`, `result <executionId>`. Mevcut process-runtime'ı (`src/mcp/tools/process.ts`'in çağırdığı `src/orchestra/process-*.ts` katmanı) **yeniden-kullan** — yeni runtime yazma, yalnız CLI-adapter. `entry.ts`'e `registerProcess(program)` ekle. i18n: kullanıcıya görünen string'ler `getMessage` üzerinden (en default).

**Kanıt:** `node dist/cli/entry.js process --help` → submit/status/result alt-komutları listelenir; `grep -n "registerProcess" src/cli/entry.ts` → eklendi.
**Test:** 3+ test (submit→executionId, status okuma, eksik/geçersiz executionId → dostane hata). Gerçek process-runtime'ı çağır (mock-only değil).

---

## Task 2: MCP-W1 defer'lı review-minor'ları kapat
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: tests/cli/messages-writer-lease.test.ts, src/mcp/server.ts
- Scope: src/mcp/, tests/cli/

### Description
MCP-W1 final-review'da defer edilen 2 küçük borç: **(a)** `tests/cli/messages-writer-lease.test.ts` — TR testinde `{pid}` interpolasyon-simetrisi eksik; EN testinde olan `expect(msg).not.toContain('{pid}')` assertion'ını TR testine de ekle (placeholder-doldurma TR'de de doğrulanır). **(b)** `src/mcp/server.ts:119` civarı — yorumda "singleton bound in createServer" ifadesi `mcpNotifyAdapter`'a atıfta ama MCP-W1 boot-singleton'ı kaldırdığı için yanıltıcı; "singleton" → "adapter" olacak şekilde yeniden-ifade et (yalnız yorum, kod değişmez).

**Kanıt:** `grep -n "not.toContain('{pid}')" tests/cli/messages-writer-lease.test.ts` → TR bloğunda da var (2 kez); `grep -n "singleton" src/mcp/server.ts` → boot-singleton atfı kalmadı.
**Test:** mevcut `messages-writer-lease.test.ts` yeşil kalır (2 test → assertion eklenir); davranış değişmez.

---

## Task 3: writer-lease release-hooks idempotency testi
- Model: sonnet
- Effort: low
- Skills: testing-expert
- Files: tests/mcp/writer-lease.test.ts
- Scope: tests/mcp/

### Description
MCP-W1 review'da `installWriterLeaseReleaseHooks` (src/mcp/writer-lease.ts) testsiz bırakıldı (defer-minor). İdempotency-latch'i (`releaseHooksInstalled`) doğrulayan hermetik bir test ekle: fonksiyonu aynı projectRoot ile iki kez çağır → `process.listenerCount('exit')` tam olarak 1 artar (ikinci çağrı no-op). Test sonunda eklenen exit-listener'ı temizle (`process.removeListener`) ki suite-leak olmasın. Yalnız test ekle — kaynak değişmez.

**Kanıt:** `grep -n "listenerCount\|installWriterLeaseReleaseHooks" tests/mcp/writer-lease.test.ts` → eklendi.
**Test:** 1+ test (iki-çağrı → +1 listener; idempotent). `npx vitest run tests/mcp/writer-lease.test.ts` yeşil.

---

**Beklenen:** 3 task DONE. Auto-mode lifecycle gözlemi: routing (process→api-builder/architect, test→testing-expert), eval (false-NO_GO yok, ADR-noise yok — comment/küçük-task'larda coverage-exemption tutar), disk-verify deliverable. Sprint-sonu tsc temiz, yeni testler yeşil.
