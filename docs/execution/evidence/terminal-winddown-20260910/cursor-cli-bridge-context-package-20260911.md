# Cursor paket — CLI bridge args + context budget UX (2026-09-11)

Owner oturumu: onay yüzeyi olumlu; `deckent_kill` onay sonrası CLI arg kaybı; MASTER/@ref yükünde tool-result bütçe mesajı.

## Plan (1–2–3)

| # | Kapsam | Kök neden | Düzeltme | Kanıt |
|---|--------|-----------|----------|-------|
| 1 | CLI lifecycle bridge | `cliArgsFor` yalnız `TOOL_COMMANDS` + `_rest`; MCP JSON (`taskId`, `all`, …) düşüyor | `deckent_kill` / `deckent_cleanup` / `deckent_recover` arg-aware builder | `tests/cli/chat-tool-bridge.test.ts` |
| 2 | Onay sonrası execution | S3 allow + spawn ama `deckent kill` argsız | (1) ile aynı; S4 reddetme mevcut permission testleriyle | Owner smoke + unit |
| 3 | Context bütçe UX | Dar `maxRenderedBytes` → broker throw; i18n “tur durdu” yanıltıcı | Min token payı/parallel; emergency broker; i18n + signal key | `loop.ts` + messages |

## Dosya diff özeti

- `src/cli/commands/chat-tool-bridge.ts` — MCP-parity argv
- `src/agent/loop.ts` — broker fallback, parallel floor
- `src/cli/helpers/messages.ts` — non-fatal copy
- `src/cli/repl/native-agent-bridge.ts` — signal allow-list

## Doğrulama (Cursor)

```bash
npx vitest run tests/cli/chat-tool-bridge.test.ts tests/agent/loop.test.ts
npm run lint:i18n
```

## Astra ENTRY 185 REVISE yanıtı (2026-09-11)

- **Context:** `Math.max(128)` ve 2048 byte emergency fallback kaldırıldı; kalan pay 0 iken shrink→yeniden ölçüm→aynı cap ile broker retry; yoksa `TOOL_RESULT_CONTEXT_BUDGET_EXHAUSTED` (overshoot yok).
- **Recover:** MCP `dryRun` default true → `{sprintId}` always `--dry-run`; `dryRun:false` → `cliArgsFor` null (CLI bridge mutation yok); structured `sprintId` iken `_rest` yok sayılır.
- **Proof:** recover parity + deny spawn tests; loop test `no synthetic floor` (typed exhaustion, batch devam).

## Astra ENTRY 187 REVISE yanıtı — rev3 (2026-09-11)

- **Recover gate:** `deckent_recover` static `TOOL_COMMANDS['recover','--force']` kaldırıldı; `resolveRecoverSprintId`; `_rest` sprint → `['recover', id, '--dry-run']`; `{ _rest:['sprint-731'], dryRun:false }` → null argv, spawn yok.
- **Custody:** `withholdToolResultFromContext` — `executedOk`, `meta.delivery=undelivered`, tam body `contentStore` spill (`resultRef`); wire satırı minimal; handler `ok` korunur (failure ile karışmaz).
- **Shrink:** `shrinkToolResultContent` envelope cap hatasında entry atlanır (turn abort yok).
- **Tests:** `tests/agent/tool-result-delivery-withhold.test.ts`; loop custody+spill; bridge counterexample.

```bash
npx vitest run tests/cli/chat-tool-bridge.test.ts tests/agent/loop.test.ts tests/agent/tool-result-delivery-withhold.test.ts
# 73/73 PASS
npm run lint:i18n
```

## HOLD (bu paket dışı)

- Formal PTY S4 live reddetme replay
- Full MASTER satır ledger
- `deckent_propose_run` search exposure wire kanıtı
- Owner live smoke: kill `{taskId}`, MASTER read under load, recover dry-run via bridge (post `build:all` + REPL restart)

## Astra istenen review

1. Scoped code ACCEPT / REVISE — bridge argv mapping doğru mu?
2. Context dilimi yeterli mi yoksa shrink/checkpoint sırası mı gerekir?
3. Ürün journey: hâlâ runtime HOLD; onay + kill path closure partial.
