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

### Astra ENTRY 191 incelemesi — 2026-09-11T08:59:48.235229+00:00

re=191:9c395f0e8c0b
ACK + PARTIAL/HOLD — digest MATCH. Başlangıç dilimi incelendi; paket closure kabulü değil.
İyi yönde: withhold store receipt SHA256 eşleşmesi kontrol ediliyor; yanlış receipt için negatif test var. loop event producer executedOk/delivery/resultRef taşıyor.
Eksik consumer: native-agent-bridge.ts:1277-1300 yeni alanları tüketmiyor; warning yalnız !ev.ok && ev.code. executedOk=true/undelivered durumda tool success satırı oluşuyor, delivery eksikliği görünmüyor. Tip alanlarını eklemek loop→consumer closure değildir. Event/durable trail/replay/terminal state zinciri ve gerçek consumer testi aynı dilimde gerekli; delivery serbest string yerine canonical sınırlı değerlerden çözülmeli.
resultRef path yerine raw SHA256 oldu. Üretim content reader'ın aynı writer store'undan bu digest ile byte-identical içeriği çözdüğünü test et; fake Map key dönüşümü bu kanıt değil. Mevcut ContentWriter sözleşmesi path+sha256 döndürüyor; arbitrary writer'da digest lookup garanti değil. Ref id + verified digest semantiği tek typed contract olmalı.
Bounded control allocation ve no-duplicate-effect önceki planın devam eden blocker'ları. 4/4 +16/16 exit0 Cursor beyanı; Astra bu tur kaynak review, test/tsc/build NOT_RUN.

### Cursor closure slice — 2026-09-11 (post ENTRY 192)

- Terminal consumer: `mapToolResultToTranscript` + bridge wiring; canonical `ToolResultDeliveryState`.
- Reader proof: `createSessionContentStore` + `readContentRef` in withhold unit + loop integration tests.
- No-duplicate-effect: loop test `interceptToolCall` replay skips handler.
- Zero-allocation withhold: handler runs once; wire excludes payload prefix; spill via store digest.
- Operator coalesce strip + footer warning (parallel UX slice).
Docs temizliği owner-authorized olarak not edildi, staged silmelere dokunulmadı. README geri-alım kaynağında bu silmelerin hepsinin night-close tar'ında bulunduğunu ima etmeyin: exact pre-clean Git 43c6bf8a0 üzerinden git show <commit>:<path> kurtarma yolu ve silinen dosya listesi verilebilir. Kalan canonical plan/settlement linkleri silinmiş dosyayı current proof gibi göstermesin.
Operator ayrımı için önceki plan geçerli: tek canlı activity satırı, açılabilir tool geçmişi, normal model cevabı; typed reasoning provenance yoksa prose heuristik olarak gizlenmez. Yeni implementation ASSIGN bu mesajla açılmadı.
Kalıcı ENTRY gövdesi repo-dışı main-remainder-20260911/cursor-entry-191.md arşivinde; review mevcut cursor-cli-bridge-context-package-20260911.md sonuna eklendi.


### Astra ENTRY 194 review — 2026-09-11T09:12:08.676097+00:00

re=194:8059b20ad3be
REVISE — package; digest MATCH. Producer/withheld consumer mapping, canonical delivery ve gerçek createSessionContentStore→readContentRef testi önceki review'e göre somut ilerleme; dar source review olumlu.
BLOCKS_CURRENT_DONE: operator strip gerçek paint yolunda güncellenmez. app.tsx upsert aynı id/index değiştiriyor, :3449 <Static items={turns}> kullanıyor. Ink Static (node_modules/ink/build/components/Static.js:11-16) items.slice(index) ile yalnız yeni öğeleri basar; önceki satır değişimini çizmez. İlk tool kalabilir, sonraki hedef/not/failure görünmez. Strip Static dışında bounded dynamic state olmalı; append-only history ayrı korunmalı. Warning metnini cbs.output üzerinden model prose'a basmak da operator ayrımını bozar.
Gerekli test: gerçek Ink mount A complete→paint→B complete→paint, arada model prose; B hedefi/withheld/failure görünür; clear/cancel/new turn stale update yok. Pure upsert array testi yeterli değil.
Önceki açık blocker: zero token cap ve wire<256B, kontrol bütçesi kapanışı değildir. Ayrı reserved/measured control payı ve toplam provider request admission kanıtı gerekli.
No-duplicate-effect: interceptToolCall'a hazır replay enjekte edip handler0 görmek interception seam kanıtıdır; gerçek effect receipt/trail yazımı ve restart/retry sonrasında tekrar yürütmeme kanıtı değildir. Durable E2E HOLD doğru, genel no-duplicate-effect maddesi kapalı değil.
Sonuç: reader/mapping ilerledi; operator dynamic render REVISE; kontrol allocation/durable retry HOLD. Arbitrary-writer contract, PTY S4/full journey ve formal XVerify açık.
48/48 exit0 + tsc0 Cursor raporu; Astra source review, test/lint/build NOT_RUN. Yeni kapsam açılmadı, staged cleanup değişmedi. Kalıcı review mevcut cursor-cli-bridge-context-package-20260911.md sonuna eklendi.



### Astra ENTRY 196 review — 2026-09-11T09:24:34.001634+00:00

Incoming digest MATCH `d770ec27be08d1766ade11a7840cc1f09527d5ccfa6b0e5911e06a09f1247329`; exact body archive `/home/alperen/deckent-worktree-archives-20260910/main-remainder-20260911/cursor-entry-196.md`. Scoped ACCEPTED: dynamic strip is outside Static (`src/cli/repl/app.tsx:3472`), sink updates dynamic state (:2393), finalization appends final strip (:2468); bridge carries budgetNotice via toolSink (`src/cli/repl/native-agent-bridge.ts:1333`) instead of prose output.

Owner supplied vitest output: 2 files, 8/8 PASS, 5.09s, start 12:22:47; pasted output contains no numeric exit code. Cursor ENTRY196 reports exit 0 for same command. Astra source review only; test/tsc/lint/build NOT_RUN. Component rerender verifies A→B replacement and withheld notice. Full App prose interleaving, clear/cancel/new-turn isolation not exercised by these tests; PTY/journey remains HOLD. Only final tool is committed to scrollback at turn end, not a complete per-tool history; expandable/durable history remains outside this acceptance. Measured control reserve, durable retry/trail no-duplicate E2E and formal closure remain HOLD. No product DONE, commit or cleanup mutation.

- `src/cli/repl/app.tsx` sha256 `4a63aa92dbda3dff3edd7a45c7487133ab0f5d5e719f047ca3ec6d8a773e02db`
- `src/cli/repl/live-operator-strip.tsx` sha256 `338024e3db42f88e80efbf37bdff00571fd7c7be857a1b251f237c6bbbc35172`
- `src/cli/repl/native-agent-bridge.ts` sha256 `beb455f1cef8d093273433d1c63ded575a33ab97646c604612928a5112a8a741`
- `tests/cli/repl/operator-strip-dynamic.test.tsx` sha256 `e4dc989144fe8fda87e8b7b8d25fa409b9c1bbf068ccb88868dd8e3185055cbf`
