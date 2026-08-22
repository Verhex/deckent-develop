# EVALUATION-001 / 9040 — enforce-canary authority-restart evidence

Tarih: 2026-08-22

Bu kayit 9040'in `UNDECIDABLE -> ROUTE -> confirmation -> debt -> terminal
receipt` dilimini, restart sonrasinda human ve LLM authority zincirleriyle
kapatir. `acceptance_enforcement` global defaultu `observe` olarak korunmustur;
`enforce` davranisi canary config ve production composition testleriyle
kanitlanmistir. Bu nedenle bu belge global default-ON karari degildir.

## Dogfood execution truth

- Sprint 619, dort logical task ve bes attempt calistirdi. Dort logical taskin
  tamaminda worker result `DONE`, active/unsettled attempt sayisi sifirdir.
- Task 619-001'in ilk sonucu Brain tarafindan `NO_GO` aldi; FIX attempt'i LLM
  authority receipt kaynagini advisory resulttan degil validated host receipt
  bytes'ina baglayarak kapatti.
- Controller RETRO'da eski pre-fix gate/projection nedeniyle
  `TERMINAL_EVIDENCE_HOLD` verdi. PID `1268095` artik canli degildi. Owner
  authority ile `finalize --force` calistirildi ve sprint durustce `ABORTED`
  terminal receipt'i aldi; hicbir unresolved lineage COMPLETE'e
  yukseltilmedi.
- Terminal receipt SHA-256:
  `95a56a9fb3a84ed42ce064bbb17cf3023e9c3e320cc08966f8a653c263c10a85`.
  Logical settlement digest:
  `d6c10b29489a774f25b589cc7f14d334bfb84df7db18dcd25df5ff1c76f69f81`.
- Root `.tasks` dosyalari silinmedi;
  `.tasks/archive/sprint-619-aborted-product-green-2026-08-22/` ve
  `.tasks/archive/orphan-residue-2026-08-22/` altina tasindi. Root task-file
  sayisi sifirdir.

`ABORTED` dogfood run outcome'udur; asagidaki product kanitlarini `COMPLETE`
diye yeniden yazmaz. Product dilimi ayrica LOCAL_VERIFIED olarak kanitlanmistir.

## Production solution

1. Canonical acceptance lineage artik tenant, project, sprint, task, attempt,
   generation ve evaluation/result/policy/source digestlerinin tamamini tek
   content-addressed confirmation kimligine baglar.
2. LLM karari terminal confirmation write'inden once private, 0600,
   confirmation-id indexed, immutable first-writer-wins binding olarak yazilir.
   Binding exact `TaskResultSettlementRefV1` ve genuine
   `cross-verify-verdict:sha256:*` host receipt'ini fresh-read ile yeniden
   dogrular; provider prose veya prefix-only ref authority degildir.
3. Human branch yalniz ApprovalBroker kararinin live-session MAC zarfini kabul
   eder. OIDC caller authentication'i karar evidence'i olarak kullanilmaz.
4. `deckent serve`, approval human authority HOLD/disabled olsa bile LLM restart
   reconciler'ini acar. API tick in-flight coalescing, structured audit ve
   shutdown drain sonrasinda exactly-once owner closure uygular.
5. PREPARED receipt debt CAS'tan once, APPLIED receipt CAS'tan sonra yazilir.
   Expiry/human yarisi first-writer-wins'dir; late, foreign, corrupt veya replay
   decision effect uretmez.
6. Syntax-aware authority ratchet duplicate identity/receipt/reducer/digest ve
   authority-binding tanimlarini; direct confirmation/debt bypass'ini;
   unindexed reconciler'i; prefix-only xverify trust'ini; broad suppression ve
   non-i18n surface literalini fail-closed engeller.
7. Real-binary smoke ilk kosumda production wiring bug'i buldu: API/serve
   reconciler `1000`, confirmation index `100` page-size kullaniyordu. Tek
   exported `ACCEPTANCE_CONFIRMATION_MAX_CANDIDATES=100` authority'si store,
   reconciler, API ve serve'e baglandi; ikinci build/smoke tick hatasizdir.

## Verification

- `npx tsc --noEmit`: exit 0.
- Authority ratchet: current tree clean.
- Acceptance/confirmation family: 33 files, 226 tests, all passed.
- Degisen evaluator/routing komsulari: 17 files, 305 tests, all passed.
- Page-size production wiring regression: 4 files, 18 tests, all passed.
- 10,000 canonical row proof: first pass 4.786s; digest-stable replay 2.403s;
  strict per-pass limit 10s.
- `git diff --check`: exit 0.
- `npm run build:all`: exit 0; dashboard dahil taze dist build.
- Real binary: `confirmations list` exit 0; `approvals list` exit 0;
  `serve --port 31940 --no-terminal` readiness; `/health` status `ok`;
  authenticated `/api/approvals` response; lifecycle tick error yok.
- Bot: taze dist ile restart; PID `1320335`, kernel start-token
  `s28156556`, `kill -0` canli ve Telegram listener logu mevcut.
- Host policy: mevcut oturum `approval_policy=never`; host approval blocker yok.
  Repo `.codex/config.toml` gelecekteki sessionlar icin `on-request` olabilir,
  fakat bu oturumun effective policy'sini geriye donuk degistirmez.

## Independent verification disposition

Author provider Codex `gpt-5.6-sol`dur. Fable kapasitesi tukendigi icin fresh
Fable verification yoktur. Claude Opus 5 owner tarafindan advisor olarak
izinli olsa da effective capability floor author modelden dusuktur; onceki
reachability request'i de TTL ile kapanmistir. Same-provider fallback ve sahte
receipt uretilmedi. Formal XVerify sonucu `unavailable/HOLD`; seal DEGILDIR ve
owner/toplu verification'a kalir.

## Honest residual

- 9040 umbrella row OPEN kalir: formal different-provider seal yoktur ve
  global `acceptance_enforcement` default-ON owner karari alinmamistir.
- Sprint-619 finalizer'in fresh task results yerine stale gate/projection
  kullanmasi 7092 RECOVERY-TRUTH icin yeni canli vakadir; product wiring'i
  bloklamaz, dogfood settlement truth'ini bloklar.
