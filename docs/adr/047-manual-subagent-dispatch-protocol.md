# ADR-047: Manuel Subagent Dispatch Protocol

**Status:** accepted

**Deciders:** Alperen Sartaçoğlu (product owner), Brain (orchestrator — post-repair)

**Date:** 2026-05-14

**Sprint:** Sprint 168 (Brain Repair Phase — hardened protocol formalization)

---

## Status

accepted (Sprint 168 — Sprint 164-168 manuel survival pattern proven across 23+ incidents; formal
protocol kontrat olarak dokümante edildi. Sprint 169+ Brain otonom orchestration hedefinin anchor ADR'ı.)

---

## Context

### Brain Self-Orchestration Chicken-and-Egg Paradox

Sprint 164-168 boyunca Brain'in orchestration pipeline'ı kısmen kırıktı. Kırık Brain'i tamir etmek
için Brain'in otonom orchestration'ını kullanmak mümkün değildi — bu klasik bir **chicken-and-egg
paradox**u oluşturuyordu:

- Brain kendi spawn pipeline'ını kırık bulduğunda, task dispatch edemedi
- Kırık Brain üzerinden plan yapılamadı (RC1 parser bare token, RC2 collision subscribe yoktu)
- Brain finalize hook chain'i kısmen çalışıyordu (ADR-046 — Step 2/4/5 partial implementation)
- Bu kısırlaşma döngüsünü kırmak için insan-güdümlü (Alperen-guided) manuel dispatch gerekti

### Sprint 164-168 Manuel Survival Pattern (23+ Incident)

| Sprint | Manuel Dispatch Kullanım Gerekçesi |
|--------|-------------------------------------|
| 164 | Brain spawn pipeline crash — workaround: manuel task assignment |
| 165 | Finalize hook eksik — manuel memory export + RETRO.md yaz |
| 166 | Bug M+N+S+Y2+... forensic — manuel Brain repair sprint (11/11 task done) |
| 167 | Audit + debug phase 1+2 — 10 bug x 5 cluster forensic investigation |
| 168 | Brain Repair Phase — 8 anchor task hardened manuel dispatch |

Bu pattern, otonom Brain orchestration'ın güvenilmez olduğu dönemlerde **projenin ilerlemesinin devam
etmesini sağladı**. 23+ incident boyunca zero sprint abandonment (hiçbir sprint yarım bırakılmadı).

### Phase 1+2 Audit Evidence (Sprint 167)

Sprint 167 T5 forensic audit (`.audit/sprint-167/T5-brain-debug-phase1.md` +
`T5-brain-debug-phase2.md`) 5 architectural cluster tespit etti:

- **Cluster A:** Brain Finalize Hook Chain Implementation Gap (4 bug: BUG-CC/DD/EE/GG)
- **Cluster B:** Locking Infrastructure Asymmetry — SpawnLock symmetric cleanup eksik
- **Cluster C:** Plan-Spawn Integration Disconnect — 3 baglanti kopuklugu
- **Cluster D:** Sprint Metrics Math — null/undefined guard eksik
- **Cluster E:** Worker Lifecycle Mismatch — non-selective prompt cleanup cascade

**Phase 4.5 trigger tetiklendi:** Her cluster için 3+ basarisiz önceki fix girisimi mevcut (Cluster A:
Sprint 166 T1/T2/T5/T11 — 4 wire fix, Sprint 167'de hala kismi; Cluster B: Sprint 156 T-10'dan beri 11
sprint asimetrik; Cluster C: Sprint 138 T4'ten beri 29 sprint disconnect).

### Sprint 168 Formalization Gerekçesi

Sprint 168'de "manuel subagent dispatch" ilk kez **hardened protocol** olarak biçimlendirildi:

- **v1 to v5 eval zinciri:** systematic-debugging (Agent A: 79 to 96/100) + devil's advocate (Agent B: 22 to 26/100)
- **Çift hedef basarili:** Agent A >=95 APPROVED, Agent B <30 SHIP_AS_IS
- **8 paralel + 1 sequential subagent** git worktree isolation ile dispatch edildi
- Bu ADR o protokolü kalici mimari kontrat olarak dokümante eder

---

## Decision

Brain repair veya Brain orchestration'ın güvenilmez oldugu sprint'lerde **Hardened Manuel Subagent
Dispatch Protocol** uygulanir. Bu protokol yedi zorunlu prensibe dayanir:

### 1. Worktree Isolation (Git Worktree Per Cluster)

Her cluster/subagent için ayri git worktree olusturulur:

```bash
git worktree add ../deckent-sprint-NNN-<CLUSTER_ID> main
```

**Zorunluluk:** Paralel subagent'lar ayni dosyalarda çakisma yapamaz. Subagent kendi worktree'sinde
çalisir, main branch'e dokunmaz. Sprint sonu rebase + merge cascade order ile yapilir.

**Örnek (Sprint 168):**

```
../deckent-sprint-168-C0e      (cascade endpoint — first merge)
../deckent-sprint-168-C0b      (locking)
../deckent-sprint-168-C0c      (plan-to-spawn integration)
../deckent-sprint-168-C0a-1    (hook chain step 2)
../deckent-sprint-168-C0a-2    (hook chain step 4, sequential)
../deckent-sprint-168-C0a-3    (hook chain step 5, sequential)
../deckent-sprint-168-C0a-4    (hook chain step 12, sequential)
../deckent-sprint-168-C0d      (metrics, isolated)
../deckent-sprint-168-ADR-047  (governance doc, paralel)
```

### 2. File Authority Matrix

Her subagent için STRICT `scope.filesWrite` tanimlanir. Subagent bu matrisin disina çikamaz:

| Subagent | scope.filesWrite (yazma yetkisi) |
|----------|----------------------------------|
| C0e | src/providers/claude.ts, src/orchestra/sprint-lifecycle.ts, src/orchestra/spawn-backend.ts, src/orchestra/tmux.ts, src/core/active-workers.ts (NEW), docs/adr/048-*.md, tests/providers/, tests/orchestra/ |
| C0b | src/core/file-lock.ts, src/monitor/auditor.ts (lock binding only), src/orchestra/spawn-backend-docker.ts:933 (on-exit hook only), tests/core/, tests/monitor/ |
| C0c | src/orchestra/planner.ts, src/orchestra/task-builder.ts, src/orchestra/decision-engine.ts, src/orchestra/sprint-controller.ts (TASK_ASSIGN re-read only), tests/orchestra/ |
| C0a-1 | src/core/identity-generator.ts, tests/core/identity-regen-default-skip.test.ts |
| C0a-2 | src/core/rule-generator.ts, src/orchestra/sprint-finalizer.ts (Step 4 only), tests/core/, tests/orchestra/ |
| C0a-3 | src/orchestra/sprint-retro-writer.ts, src/orchestra/sprint-finalizer.ts (Step 5 only), tests/orchestra/ |
| C0a-4 | src/orchestra/sprint-docs-updater.ts, docs/adr/046-*.md (amendment), src/orchestra/sprint-finalizer.ts (Step 12 only), tests/orchestra/ |
| C0d | src/orchestra/sprint-reporter.ts veya managed-doc-runner.ts, tests/orchestra/ |
| ADR-047 | docs/adr/047-*.md (sadece) |

**Alperen review gate:** Her subagent commit sonrasi `git diff --stat` ile file authority matrix
disina yazim yapilip yapilmadigi kontrol edilir. Ihlal: subagent retry.

### 3. Wave Structure (Cascade'in Tersine)

Task dispatch sirasi, **bagimlilik cascade'inin tersine** organize edilir. Cascade endpoint'i
(en çok bagimlilik alan modül) **önce** fix edilir — cascade upstream'leri düzeltmeden önce
temiz bir taban saglar:

```
Cascade graph (bagimlilik yönü):
  RC1 (parser) -> Brain TASK_ASSIGN payload
  RC3 (cache)  -> Brain TASK_ASSIGN payload
  RC2 (collision) -> Brain TASK_ASSIGN payload
                                     |
  RC4 (SpawnLock) -> spawn lock conflict
                                     |
  BUG-HH (claude.ts cleanup) -> ALL prompts deleted  <- ENDPOINT
                                     |
  Cluster A (Hook Chain Steps) -> finalize failures
```

**Dispatch wave order (cascade endpoint first):**

| Wave | Subagents | Kosul |
|------|-----------|-------|
| **Wave 1** (paralel) | C0e (cascade endpoint) + ADR-047 | Hemen baslar |
| **Wave 1.5** | Alperen CHECKPOINT | Wave 1 DONE sonrasi |
| **Wave 2** (paralel) | C0b + C0c + C0a-1 + C0d | Wave 1.5 geçti ise |
| **Wave 3** (sequential) | C0a-2 -> C0a-3 -> C0a-4 | Wave 2 DONE sonrasi |

**Merge order** (cascade endpoint first, bagimlilik sirasiyla):

1. C0e merge
2. C0b
3. C0c
4. C0a-1 / C0a-2 / C0a-3 / C0a-4 (sequential)
5. C0d
6. ADR-047

### 4. Wave 1.5 Serial Gate

**Wave 1.5 serial gate**, kritik kontrat dogrulama için insan-in-the-loop (Alperen) checkpoint'tir.
C0e gibi cascade endpoint fix'ler tamamlandiktan sonra, Wave 2 baslamadan önce asagidakiler
seri olarak dogrulanir:

```
Wave 1.5 Checklist:
  [ ] C0e DONE + commit hash verified
  [ ] ADR-048 MADR v3 format compliance check
  [ ] Cross-backend audit dogrula (Docker + Subprocess + Tmux uniformity)
  [ ] npx deckent memory rebuild veya backfill script -> ADR-048 DB insert verify
  [ ] .deckent/decisions/sprint-NNN-C0e-done.json write (audit trail)
  [ ] npx vitest run skip count delta kontrol (>0 ise retry)
  [ ] Wave 2 dispatch onay
```

**Gerekçe:** Sprint 166 T11 paterni. Cascade endpoint'in biraktigi kontrat (ADR-048) downstream
subagent'lar (Wave 2) tarafindan baz alinir. Kontrat hataliYsa Wave 2 hatAyi çogaltir. Serial gate
bu riski engeller.

### 5. TDD Enforcement Gate

Her subagent için zorunlu TDD disiplini:

1. **Failing test ÖNCE yaz** (TDD red phase) — Implementation öncesi
2. **Run test -> FAIL bekle** — Red dogruLandi
3. **Minimal implementation** — Sadece testi geçirecek kadar
4. **Run test -> PASS bekle** — Green dogruLandi
5. **Atomic commit per step** — Her TDD cycle ayri commit
6. **Skip ekleme YASAK** — Baseline skip count (Sprint 168: 41) korunur
7. **Test PASS olmadan commit YASAK**

**TDD enforcement gate kuralLari:**

- Subagent `.result` dosyasinda `tests_skipped_added: 0` field ZORUNLU
- Alperen review gate: subagent commit sonrasi `npx vitest run` + skip count delta kontrol
- Skip artisi tespit edilirse subagent retry veya manuel fix
- Vitest baseline tolerance: `pass>=16395 + fail<=2 + skip<=41`

**Gerekçe:** Sprint 164-167 skip drift (41 inherited skips). TDD enforcement gate yeni regression
ve technical debt birikmesini engeller. Phase 4.5 trigger kosullarindan biri de "çok sayida
basarisiz fix" — TDD bu döngüyü önler.

### 6. Lock Pattern

Shared file conflict'i önlemek için dispatch lock dosyasi kullanilir:

```json
{
  "version": "1.0",
  "sprint": "sprint-NNN",
  "subagents": {
    "C0a-1": {
      "worktree": "../deckent-sprint-NNN-C0a-1",
      "status": "pending|active|done|merged",
      "files_owned": [
        "src/core/identity-generator.ts",
        "tests/core/identity-regen-default-skip.test.ts"
      ],
      "started_at": null,
      "done_at": null,
      "commit_hash": null
    }
  }
}
```

**Lock file path:** `.deckent/sprint-NNN-dispatch-locks.json`

**Status transitions:** `pending -> active -> done -> merged`

**Sequential lock:** PaylasiLan dosyalar için (örn. `sprint-finalizer.ts`) önceki subagent
`done` olmadan sonraki `active` olamaz. C0a-2/3/4 bu kurala tabidir.

### 7. Manual Survival Fallback

Brain orchestration NO_GO veya güvenilmez ise Sprint N+0.5 replay paterni devreye girer:

| Sprint N Sonucu | Sprint N+0.5 Mod |
|-----------------|------------------|
| **GO** | Brain otonom (`deckent plan + start` normal flow) |
| **GO_WITH_TECH_DEBT** | Brain yari otonom (Brain spawn, Alperen monitoring) |
| **NO_GO** | Manuel subagent dispatch replay (Sprint N paterni, bu ADR) |

**NO_GO durumu protocol:**

- Sprint N'nin fail eden cluster Sprint N+0.5'in ilk task'i olur (gap closure)
- Yeni sprint DIRECTIVES.md Sprint N fail evidence ile baslar
- Worktree isolation Sprint N+0.5 için yeniden kurulur
- TDD enforcement gate ayni baseline kurallari ile devam eder

**Recursion kabul:** Brain repair sirasinda Brain bypass GEREKLI olabilir. Sprint N sonu Brain
otonom OLMAYABILIR — bu durumda Sprint N+0.5 hala manuel survival ile çalisir AMA Sprint N'nin
fix'leri persistent'tir (regression yok). Hedefler gerekirse Sprint N+2'ye kayabilir.

**Catch-22 önleme:** Sprint N NO_GO -> Sprint N+0.5 BLOCKED zinciri YASAK. Sprint N+0.5 her zaman
basLAYabilir — Brain kirik olsa dahi manuel dispatch ile.

---

## Architectural Principles

Bu protokolün alti temel mimari prensibi:

### 1. Worktree Isolation (Subagent Çakisma Protection)

Paralel subagent'lar ayri git worktree'lerde çalisir. Çakisma tespit edilirse resolve yerine
isolation güçlendirilir. Bir subagent'in hatasi digerini kirletmez.

### 2. File Authority Matrix (Scope Kontrolü)

Her subagent için STRICT yazma yetkisi tanimlanir ve Alperen review gate ile denetlenir.
ADR-037 RBAC prensiplerine uygun. Scope ihlali -> retry. Matrix genisletilemez (yeni subagent
için yeni satir eklenir, mevcut satir büyütülemez).

### 3. TDD Enforcement Gate (Regression Protection)

Failing test -> fix -> pass döngüsü zorunludur. Skip ekleme YASAK — bu kural "test geçti" ile
"test var" arasindaki boslugu kapatir. Alperen review gate skip count delta'yi dogrular.

### 4. Wave-Based Execution (Cascade Order)

Dispatch cascade'in tersine organize edilir. Endpoint fix edilmeden upstream fix yapilmaz.
Bu "fix birini bozdu" riskini minimize eder ve her wave'in stabil bir temel üzerine insa
edilmesini saglar.

### 5. Wave 1.5 Serial Gate (Kritik Kontrat Dogrulama)

Cascade endpoint fix + kritik ADR yazimi sonrasi insan onayLi serial checkpoint. Downstream
subagent'lar hatali bir kontrAti baz almadan önce dogrulama yapilir.

### 6. Manual Survival Fallback (Catch-22 Önleme)

Brain repair sirasinda Brain bypass gereklidir — bu paradoks kabul edilir ve explicit fallback
semantigi ile yönetilir. Hiçbir sprint yarim birakilmaz.

---

## Consequences

### Olumlu

- **Sprint 164-168 sprint abandonment = 0.** 23+ incident'ta zero sprint abandonment.
  Manuel dispatch protokolü bu basArIyi mümkün kildi.
- **Brain repair sprint'lerinde formal protocol.** Dokümante ve tekrarlanabilir — gelecek
  Brain kirik dönemlerinde Alperen ve Brain protokolü bilir, icat etmek zorunda kalmaz.
- **Worktree isolation paralel çalismAyi güvenli kilar.** 8 subagent paralel çalisti,
  conflict yasAnmadi (Sprint 168 dogfood kaniti).
- **TDD enforcement gate regression önledi.** Baseline 41 skip Sprint 168 sonu <=41 korundu.
- **Sprint 169+ Brain otonom hedefinin anchor'i.** Sprint 168 GO -> Brain otonom mümkün.
  Bu ADR o gecisin ön kosulunu belgeler.
- **ADR-047 + ADR-048 memory.db'ye insert edildi.** Brain ADR-bazli kararlar için güncel
  governance veriye erisebilir (ADR-046 M1 monitoring metrik).

### Olumsuz

- **Manuel dispatch human-intensive.** Alperen review gate her subagent için manuel onay
  gerektirir. Wave 1.5 serial gate ek zaman alir (30-60 dk tahmin). Brain otonom öncesi
  bu overhead devam eder.
- **Worktree yönetimi complexity.** 9 worktree + cleanup = sprint sonu ek adim. Unutulursa
  disk space birikMesi (her worktree full repo clone).
- **Sprint N+0.5 pattern manuel kalir.** Brain otonom saglanana kadar her repair sprint
  bu protokolü tekrar uygulAyacak. Recursion paradoksu çözülmeden bu overhead sürer.
- **Sprint 169 hedefi kayabilir.** Sprint 168 GO_WTD veya NO_GO durumunda Sprint 169 OSS GA
  Sprint 170+'a ertelenebilir (Manual Survival Fallback Section 7 semantigi).

---

## Compliance

### Sprint 168 Dogfood Evidence

Sprint 168 bu protokolün ilk **hardened** uygulamasidir:

| Kontrol | Beklenti | Gerçek |
|---------|----------|--------|
| Anchor task sayisi | 8 paralel + 1 sequential | 8 + ADR-047 = 9 subagent |
| Worktree isolation | 9 ayri worktree | Olusturuldu (git worktree list dogruladi) |
| File authority matrix | Her subagent STRICT scope | DIRECTIVES.md + plan Section file authority matrix |
| Wave structure | 4 wave (1, 1.5, 2, 3) | DIRECTIVES.md Wave Structure uygulandi |
| Wave 1.5 serial gate | ADR-048 + cross-backend audit | Wave 1 (C0e) DONE sonrasi Alperen CHECKPOINT |
| TDD enforcement gate | 0 yeni skip (baseline 41) | Subagent .result + Alperen review gate |
| Lock pattern | .deckent/sprint-168-dispatch-locks.json | Olusturuldu |
| Manual survival fallback | Sprint 168 NO_GO -> Sprint 168.5 replay | Explicit DIRECTIVES.md Sprint 168.5 section |
| ADR-047 yazili | Sprint 168 Wave 1 | Bu dokuman |

### Sprint 169+ Brain Otonom Hedefi

Sprint 168 GO -> Brain otonom `deckent plan + start` normal flow.

Bu ADR'in protokolü Sprint 169+ Brain otonom orchestration ile **protocol parity** saglamalidir:

| ADR-047 Protokol | Brain Otonom Esdeğeri |
|------------------|-----------------------|
| Worktree isolation | git worktree add -> Brain spawn-time isolation |
| File authority matrix | scope.filesWrite RBAC (ADR-037 V1.0 — compile-time lint + audit-trail; runtime advisory/soft, bloke etmez; hard-flip post-GA V2) |
| TDD enforcement gate | Brain GO/NO_GO evaluation (result evaluator) |
| Wave structure | dependency_pipeline_enabled — Wave scheduling (kod default true; deckent-dev'de bilinçle `false`, Wave geçişleri Brain-manuel — bkz. aşağıdaki not) |
| Wave 1.5 serial gate | Human checkpoint MCP tool (deckent_checkpoint) |
| Lock pattern | .locks/ infrastructure (ADR-037) |
| Manual survival fallback | deckent recover + deckent run chain |

Brain otonom Sprint 169'da bu 7 kontrol için parity saglandiysa manuel dispatch yerine `deckent plan`
+ `deckent start` kullanilir. Parity eksikse ADR-047 paterni devam eder.

### Sprint 168.5 Compliance

Sprint 168 sonucu ne olursa olsun Sprint 168.5 basLAYabilir:

- Sprint 168 GO -> Brain otonom Sprint 168.5
- Sprint 168 GO_WTD -> Yari otonom (Brain spawn, Alperen monitoring)
- Sprint 168 NO_GO -> Sprint 168.5 bu ADR ile manuel dispatch replay

Sprint 168.5 scope: C1 Memory Relations, C2 Bug Z3 Safety, H1-H5 OSS pre-flip hazirlik.

---

## Alternatives Considered

### (a) Brain Otonom ile Sprint 168 Yürütme

Brain'in kirik pipeline'ina ragmen `deckent plan + start` kullanmak.

**Neden reddedildi:** Phase 1+2 audit kanAtladi ki RC1 parser + RC4 SpawnLock + BUG-HH cascade
aktifken Brain spawn 7/7 task'ta basarisiz oldu (Sprint 167 canli kanit). Brain'i kirik Brain
ile tamir etmek — paradox çözümsüz. Manuel dispatch tek güvenilir yol.

### (b) Tek Büyük Subagent (Monolithic Fix)

Tüm 10 bug'i tek subagent ile fix etmek.

**Neden reddedildi:** 5 cluster x farkli modül -> scope collision riski. Tek subagent hata
yapinca rollback zorlasir. Paralel worktree ile 8 subagent her cluster'i bagmsiz fix eder
ve hata izolasyonu kolaydir.

### (c) Sequential (No Paralel) Dispatch

8 subagent sirayla, worktree olmadan.

**Neden reddedildi:** Tahmini süre ~35h sequential. Paralel + wave ile ~10-15h. Worktree
olmadan sequential conflict riski ayni kalir. Paralel + isolation daha hizli ve güvenli.

### (d) Human-Driven (No Subagent — Alperen Codes Directly)

Alperen tüm fix'leri kendisi yazar.

**Neden reddedildi:** 10 bug x 5 cluster ~35h kodlama. Subagent dispatch hem hiz hem expertise
saglar. Subagent dispatch bu projenin product vision'inin dogfood'udur (deckent ile deckent repair).

---

## Related ADRs

- **ADR-046:** Brain Self-Update Hook Architecture — Step Ordering Contract. Bu ADR'in
  hook chain (Cluster A) fix'leri ADR-046 kontratina uygun yazildi. Wave 3 subagent'lar
  (C0a-2/3/4) ADR-046 Step 4/5/12'yi fix ediyor.
- **ADR-037:** Brain-Auditor-Worker Authority Matrix — RBAC Protocol V1.0. File authority
  matrix bu ADR'in scope.filesWrite kontratini manuel dispatch için genisletir. Auditor
  boundary violation detection bu protokolde Alperen review gate olarak uygulanir.
- **ADR-035:** Brain-Worker-Auditor Verification Protocol Standard. TDD enforcement
  gate ve Alperen review gate bu ADR'in 15-channel verification protocol'ünün manuel
  uyarlamasidir. Subagent .result dosyasi V1.0 verification protocol'e uygun format kullanir.
- **ADR-040:** Nervous System Architecture — Proactive Meta-Orchestrator. Manuel dispatch
  sirasinda Nervous System pasif (observer) modda çalisir — Brain orchestration devredisi iken.
- **ADR-045:** Wave-Based Execution Semantics. Brain otonom wave scheduling (dependency_pipeline)
  ile ADR-047 wave structure paraleli: cascade endpoint'i önce fix etmek, dep_pipeline_enabled
  topological ordering ile esdeger.

---

## References

1. **Sprint 168 Spec (v5):** `docs/superpowers/specs/2026-05-14-sprint-168-design.md`
   — Section 3.2 Execution: Hardened Manuel Subagent Dispatch (dispatch mechanism, file
   authority matrix, lock pattern, TDD enforcement gate, manual survival fallback)
2. **Sprint 168 Plan:** `docs/superpowers/plans/2026-05-14-sprint-168-plan.md`
   — Section "Subagent Dispatch Runbook" (worktree setup, file authority matrix, dispatch
   sequence, cluster prompts)
3. **Sprint 167 T5 Phase 1 Audit:** `.audit/sprint-167/T5-brain-debug-phase1.md`
   — 10 bug x 5 cluster forensic, Phase 4.5 trigger evidence, 23+ incident history
4. **Sprint 167 T5 Phase 2 Audit:** `.audit/sprint-167/T5-brain-debug-phase2.md`
   — Pattern analysis, working vs broken reference compare, cross-cluster dependencies
5. **ADR-046 Sprint 168 Amendment:** `docs/adr/046-brain-self-update-hook-architecture.md`
   — Step 12 archiveDirectives default=false amendment (C0a-4)
6. **ADR-048 Prompt Lifecycle Contract:** `docs/adr/048-prompt-lifecycle-contract.md`
   — C0e subagent tarafindan yazilan cross-backend prompt persistence kontrAti

---

## Notes

Bu ADR, Sprint 164-168 boyunca organik olarak gelisen manuel survival pattern'inin **retrospektif
formalizasyonudur**. Pattern gerçek sprint'lerde test edildi, 23+ incident'ta zero abandonment
sagladi, ve Sprint 168'de hardened protocol olarak standartlastirildi.

Sprint 169+ için hedef: bu ADR'da belgelenen 7 protokol prensibinin Brain otonom orchestration
ile tam parity saglamasi. O noktada ADR-047 "deprecated in favor of Brain otonom" olacak —
bu basarinin belgesi olarak arsivde kalacak.

**Sprint 168 final eval zinciri:**
v1 (fc91fcd): brainstorming -> v5 (f63a8f6): Agent A 96/100 + Agent B 26/100 — cift hedef basarili.
Bu ADR Sprint 168 GO kararinin mimari anchor'idir.

---

> **Note (verified vs code + operating reality, Sprint 172):**
> - **Provenance ✓:** commit `fc91fcd` (Sprint 168 design v1) ve `f63a8f6` (v5 patch) repo git geçmişinde gerçek; `docs/superpowers/specs/2026-05-14-sprint-168-design.md` + `docs/superpowers/plans/2026-05-14-sprint-168-plan.md` mevcut.
> - **ADR-047 deprecated DEĞİL — hâlâ aktif işletim modu.** §Consequences/§"Sprint 169+ Brain Otonom Hedefi"/§Notes "Sprint 169+ Brain otonom → ADR-047 deprecated olacak" hedefi **gerçekleşmedi**. deckent-dev Sprint 172+ boyunca bu protokolle (manuel subagent dispatch) yürütülmeye devam ediyor — bu doküman turu dahil. Brain-otonom protocol parity sağlanmadı; ADR-047 bu projenin fiilî kanonik işletim modudur (CLAUDE.md/DECKENT.md ile hizalı).
> - **ADR-037 düzeltmesi (parity tablosu):** "runtime enforcement" iddiası ADR-037 V1.0 gerçeğine çekildi — compile-time lint + audit-trail aktif; runtime **advisory/soft, bloke ETMEZ** (Layer-2 0-caller `authority-enforcer.ts` always-soft + `worker.ts` violation→true; hard-flip post-GA V2). Manuel dispatch'te bu kontrol fiilen **Alperen review gate** (`git diff --stat`) ile uygulanır — kod-enforce değil.
> - **dependency_pipeline_enabled:** `.deckent/config.json` `false` (Brain-manuel Wave, ADR-045 + bu ADR). "Sprint 167 flip" deckent-dev'de gerçekleşmedi; öz-referans ironisi — flip'in olmama nedeni tam da bu ADR'ın tarif ettiği manuel mod. Kod default `true` kullanıcı-projesi yoludur.
> - **Dangling ref:** §Context/§References'taki `.audit/sprint-167/T5-brain-debug-phase1.md` + `phase2.md` belirtilen yolda **mevcut değil** (transient `.audit/` dizini — forensic artefaktlar arşivlendi/silindi; iddialar formalizasyona dayanır, dosya erişimine değil).
> - **Numaralandırma:** "Step 2/4/5 partial" (§Context) ve §"Related ADRs"daki "Step 4/5/12" — ADR-046'da netleştirildiği gibi `finalizeSprint` 13-adım CLEANUP zinciri numaralandırmasıdır, ADR-046 §5.1'in 4-hook `runPostFinalizeHooks` kontratı değil.
>
> Behavior unchanged; documentation alignment only.
