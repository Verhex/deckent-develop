---
doc_rank: 50
status: active
last_updated: 2026-06-19
content_hash: sha256:8deebc84baf7e9e1d355c6c196881f751c9372e4c00944fcec20b5017f200b14
---

# DIRECTIVES — Sprint: Fix sprint-303 SCOPE-W1 impl gap (escalation event)

## Goal: sprint-303 SCOPE-W1 (303-004) **test yazıldı ama impl UYGULANMADI** (false-DONE) → `tests/agents/scope-w1-escalation.test.ts` 3 fail: `SCOPE_INSUFFICIENT_CHANNEL` const event-stream.ts'de YOK (import→undefined) + agentic-worker-runner out-of-scope-reddinde event EMIT etmiyor. 1 task, cerrahi.

## Ortak kurallar (BAĞLAYICI)
- **Cerrahi** — yalnız Files/Scope. **ESM** `.js`. **No haiku.** **Hermetik.**
- **CC-verify gate:** `tsc --noEmit` temiz + **`npx vitest run tests/agents tests/orchestra tests/nervous` YEŞİL**.

---

## Task 1: SCOPE-W1 impl — SCOPE_INSUFFICIENT_CHANNEL + escalation emit
- Model: sonnet | Effort: normal | Agent: architect | Skills: typescript-expert
- Files: src/orchestra/event-stream.ts, src/agents/agentic-worker-runner.ts, tests/agents/scope-w1-escalation.test.ts
- Scope: src/orchestra/, src/agents/, tests/agents/
### Description
SCOPE-W1 escalation-primitive impl'i eksik. **Fix:**
1. `src/orchestra/event-stream.ts`'e (diğer CHANNEL sabitlerinin yanına) `export const SCOPE_INSUFFICIENT_CHANNEL = 'WORKER→BRAIN:SCOPE_INSUFFICIENT';` ekle.
2. `src/agents/agentic-worker-runner.ts`'te scope-guard out-of-scope write'ı **reddettiği** noktada (mevcut error-string dönüşünden ÖNCE) `writeEvent(...)` ile `SCOPE_INSUFFICIENT_CHANNEL`'a event emit et — payload `{ taskId, attemptedPath, reason, goCriteria, currentScope }` (test'in beklediği alanlar). **Her out-of-scope girişimde bir event** (test C: 2 girişim → 2 event). In-scope write → emit YOK (test B). Mevcut scope-guard reddi (advisory/hard) + error-string dönüşü KORUNUR.
3. `tests/agents/scope-w1-escalation.test.ts` (yazılı, kırık) — impl'e göre GEÇSİN; test-import `{ SCOPE_INSUFFICIENT_CHANNEL }` çözülür, event-payload doğru.
**Kanıt:** `grep -n "SCOPE_INSUFFICIENT" src/orchestra/event-stream.ts src/agents/agentic-worker-runner.ts` → const + emit mevcut; `npx vitest run tests/agents/scope-w1-escalation.test.ts` → 3/3 (+in-scope-no-emit) yeşil.
**Test:** out-of-scope write_file → SCOPE_INSUFFICIENT event (payload doğru); in-scope → emit yok; 2 ihlal → 2 event.

---

**Beklenen:** 1 task. Sprint-sonu: `tsc --noEmit` temiz + **`npx vitest run tests/agents tests/orchestra tests/nervous tests/core tests/monitor` YEŞİL** (son 3 regresyon giderilir → sprint-303 ARC-GOV batch tam-yeşil). CC: sprint-303+304+305 birlikte build.
