# Sprint 171 — Task 171-007: `src/agents/` Modül Denetimi

**Audit-only** raporu — kaynak/test/yapılandırma değiştirilmedi, yalnızca bu dosya yazıldı.
Kapsam: `src/agents/` altındaki 20 modül (toplam **4367** satır).
Tarih: 2026-05-15. Worker: `w-171-007` (architect agent, opus, typescript-expert skill).

> Bu rapor, deckent'in iç işleyişini hiç bilmeyen bir mühendisin okuyup aksiyona geçebileceği detayda yazılmıştır. Tüm bulgular reprodüksiyon kanıtıyla (`dosya:satır`) verilmiştir.

---

## 1. Bulgular

`src/agents/` paketi, deckent'in **worker** (görev yürütücü) ve **prompt evrim** (agent learning) iki yarım kümesinden oluşur. Denetimde 3 ana eksen incelendi: **runtime kanıtı** (ADR-037 RBAC, verify loop, atomic write), **modül ölü-canlı haritası** (kim tarafından çağrılıyor), **tip ve süreç hijyeni** (any/cast/SIGTERM hooks). Bulgular önem derecesine göre listelenir.

### 1.1 Worker Yürütme Modülleri (Çekirdek)

**B-1 — ADR-037 RBAC runtime wire'ı KOPUK ve fonksiyon "soft mode"da.** `checkWorkerAuthority` (worker.ts:457-494) export edilmiş ve `tests/agents/worker-rbac.test.ts` 6 testle "scope dışına yazımı engelliyor" iddiasını doğruluyor, fakat üretim kodu `src/` içinde fonksiyon **hiçbir yerden çağrılmıyor** — yalnızca testler tarafından çağrılıyor. Bunun da ötesinde, fonksiyon gövdesi `result.allowed === false` durumunda bile `return true` yapıyor (worker.ts:475-493): `console.warn('[ADR-037 soft]')` logu basıyor + `emitAuthorityViolation` event'i atıyor ama yazma izni vermeye devam ediyor. Yani ADR-037'nin "Worker scope dışına yazamaz" iddiası kod düzeyinde **çift katmanlı** olarak yanlış: hem çağrı yok, hem çağrılsa bile bloklamıyor. Bu, DECKENT.md Gotchas bölümündeki "ADR-037 RBAC runtime enforcement" sözünün doğrudan ihlali ve Sprint 171 spec'inde altı çizilmiş primer findings adayı.

**B-2 — `enforceVerifyLoop` gate kodda var, üretim kullanımı yok.** `worker.ts:300` JSDoc'unda **"Callers MUST run enforceVerifyLoop() before calling this function"** yazıyor (writeResult önkoşulu). Fakat `rg "enforceVerifyLoop\("` araması src/ içinde sadece tanımı (worker-verify.ts:335) ve yorumda referansı (worker.ts:300) gösteriyor — **hiçbir yerden çağrılmıyor**. Yani sözleşmeyle vaadedilen "tsc + vitest doğrulaması zorunlu" gate'i runtime'da yok. Worker'lar `.tasks/task-{id}.verify-ran` marker dosyasını oluşturmadan `writeResult` çağırabilir.

**B-3 — `writeResult` üretimde dolaylı: agent kendi yazıyor.** `writeResult` (worker.ts:302) içinde değerli güvenlik mantığı var (honest-gate stub downgrade, atomic write, ADR-035 event emission). Fakat fonksiyon `src/` içinde **çağrılmıyor**: providers (subprocess/codex/gemini) kendi `writeHeartbeat`'lerini doğrudan `writeFileSync` ile yazıyor (subprocess.ts:275-291), AI agent'lar (Claude Code, vb.) prompt'a göre `.tasks/task-X.result` dosyasını **kendileri yazıyor**, Brain ise grace-kill yolunda sentetik NO_GO sonucunu `writeFile` ile yazıyor (sprint-controller.ts:637, 661). Bu durumda **honest-gate (stub downgrade) atlatılabilir** — agent doğrudan dosyaya yazdığı için ne stub kontrolü ne de event emission devreye girer.

**B-4 — `claimTask`, `acquireLock`, `isWithinScope` üretimde çağrılmıyor.** Aynı kalıp: `claimTask` (worker.ts:215), `isWithinScope` (worker.ts:412), `acquireLock` wrapper (worker.ts:105-112) — `index.ts` üzerinden export edilen kamusal API. Fakat `rg` araması bunların **hiçbir yerden çağrılmadığını** gösteriyor. Worker process'leri AI ajan tarafından komut satırından koşturulduğu için TypeScript fonksiyon API'si üretimde bypass ediliyor. Bu, "yazılmış ama unutulmuş kontrat" tehlikesi — testler geçer, doc doğru görünür, ama runtime davranışı tamamen başka.

**B-5 — `writeFinishedHeartbeat` deprecated dead-export.** worker.ts:391'de `@deprecated` yorumlu, `finalizeHeartbeat` çağıran ince wrapper. Repo geneli aramada **bu fonksiyonun çağrıldığı tek yer kendisinin tanımı**. Geri uyumluluk için bırakılmış ama bağımlı bulunmadığı için silinmesi güvenli.

**B-6 — `registerSigtermHandler` global side-effect at module load.** worker-lifecycle.ts:168-182, modül import edilir edilmez `process.on('SIGTERM', ...)` ekliyor ve `DECKENT_TASK_ID` env varsa `process.exit(0)` ile çıkıyor. Bu, **worker süreci için doğru** ama worker-lifecycle.ts'i Brain'in herhangi bir başka modülü import ederse (re-export zinciri uzun: worker.ts → worker-lifecycle.ts) Brain'in kendi SIGTERM yönetimini bozar. ESM'de side-effect at load idempotent değil — birden fazla import (vitest hot reload, tip checking) çoklu listener ekleyebilir. Korumalı `if (!process.env['DECKENT_TASK_ID']) return;` yapısı kısmen koruyor ama env var değişirse veya test ortamında set edilirse riskli.

**B-7 — Honest-Gate stub downgrade yalnızca dahili `writeResult`'a uygulanıyor.** worker.ts:318-335 stub-shape downgrade ("DONE + linesAdded=0 + testsPassed=false → NO_GO") değerli bir 165 Task 1 düzenlemesi, ama bu mantık **AI agent doğrudan dosya yazdığında devre dışı**. Sprint 156-011 ve Sprint 164 hataları için yapılan koruma üretim akışında by-pass'lanıyor; honest-gate'in Brain'in EVALUATE fazında da uygulanması gerekir (orchestra/result-evaluator.ts).

### 1.2 Prompt Evolution Modülleri (Dead Subsystem)

**B-8 — Tüm prompt-evolution alt sistemi (5 modül, ~1300 LoC) `src/` içinde ölü.** `PromptVersionManager` (prompt-version.ts), `PromptAnalytics` / `PromptABTester` / `PromptMetrics` (prompt-analytics.ts + iki re-export stub), `PromptEvolutionLog` (prompt-evolution.ts), `PromptRollback` (prompt-rollback.ts) — hiçbiri `src/` dışından (testler hariç) çağrılmıyor. Sadece kendi aralarında bağlanıyorlar (prompt-rollback → prompt-version, prompt-analytics → prompt-version tipi). DECKENT.md'de "Agent/Skill Evolution Pipeline" feature olarak listeleniyor ama runtime entry-point yok — dolayısıyla **dokümantasyon vs. kod drift'i**. Silmek mi promote etmek mi — Sprint 172 OSS GA'da ADR ile karar verilmesi gerekir; OSS açıldığında "neden 1300 satır kullanılmıyor" sorusu kaçınılmaz.

**B-9 — `AdaptiveAgent` (adaptive-agent.ts, 213 LoC) dead.** Sınıf tanımlı, 5 weakness pattern + suggestPromptChange yöntemi var; **hiçbir yerden çağrılmıyor**. PROMPT.md/PROMPT.json mutasyon ipucu, "Never auto-applies" yorumuyla. Eski "self-learning agents" vizyonunun kalıntısı.

**B-10 — `PermissionGuard` (permission-guard.ts, 219 LoC) tamamen dead, üstelik ADR-037 ile çelişiyor.** Sınıf, agent self-modification + tool escalation + auditor source write koruması iddia ediyor; üretim kodunda **hiç çağrılmıyor** (sadece kendi testi var). İki sorun: (1) ölü kod, (2) iddia ettiği koruma fonksiyonel olsa bile `worker.ts:checkWorkerAuthority` ile aynı boşluğu yaşar (callsite yok). PermissionGuard ve checkWorkerAuthority paralel iki ölü iskelet — birleşik bir runtime kontrol noktasında konsolide edilmesi gerekir.

**B-11 — `AgentGenealogy`, `AgentRetirement`, `CrossSprintAnalyzer`, `SpecializationDriftDetector` da dead.** 4 sınıf, ~740 LoC. Hiçbir orchestra modülünden çağrılmıyor. Aday silinmeler veya ADR-038 (Dead Code Disposition) ile promote/dispose etiketlenmesi gerekir.

**B-12 — `agent-retirement.ts:124` `sprintsParticipated: 0` hard-coded.** Retirement kararı `stats.sprintsParticipated >= cfg.minSprints` koşuluna dayanırken (line 72), kararı alındıktan sonra retired record'a yazılan stat **sıfırlanıyor**. `agentData.stats`'ten okumaya çalışmıyor, doğrudan `0` veriyor. Eğer modül canlandırılırsa audit trail bozuk olur ("hangi başarıyla emekli oldu?" sorusu cevapsız). Triv fix ama unutulmuş.

**B-13 — `SharedContext` (shared-context.ts) yarı-canlı.** `multi-agent.ts` (orchestra) tarafından import ediliyor; geri kalanı sadece error-registry referansları. Kullanım bağlamı dar — eğer multi-agent modu OSS'te aktif değilse SharedContext da pratikte ölü. Sprint 172 önceki olarak `multi-agent.ts` kullanımı netleştirilmeli.

### 1.3 Aktif & Sağlam Modüller

**B-14 — `worker-ipc.ts` (369 LoC) — gerçekten kullanılıyor, sağlam.** WorkerChannel + WorkerSideChannel + ChannelRegistry; orchestra/sprint-controller, sprint-lifecycle, result-collector, brain, ipc-registry tarafından import ediliyor. Type guard `isIPCMessage` (line 202) defensive. **Tek küçük not:** `_dispatch` (line 183) handler hatalarını yutuyor (line 193 `catch {}`) — observability açısından log atılması iyi olur ama channel stability için kabul edilebilir.

**B-15 — `worker-lifecycle.ts` (578 LoC) — atomic write + state machine sağlam.** `atomicWriteFileSync` (line 43) temp+fsync+rename pattern'i 5-sprintlik Docker exit-137 bug'ını tamamen kapatıyor (ADR-046/Sprint 139 P0 deploy). Verify-delta hesabı (computeVerifyDelta) honest assessment için sağlam — yine ne yazık ki üretimde çağrı sitesi az (Brain mid-sprint adapter dahil bir-iki yer). State machine `VALID_TRANSITIONS` ve InvalidStateTransitionError doğru tasarlanmış, fakat yine de production runtime'da statemachine'i besleyen kontrolcü `result-collector.ts` üzerinden — incelediğimiz src/agents kapsamı dışında.

**B-16 — `worker-verify.ts` (395 LoC) — verify primitifleri sağlam.** Stack-aware getVerifyCommands (line 32), DOC_SKIP heuristikleri (line 49-65), parseVitestOutput (line 76) tasarımı doğru. Sorun B-2'de açıklanan üst seviye gate'in çağrılmaması. Modülün kendisinde patoloji yok. **Küçük not:** `verifyTests` (line 106) timeout 120 saniye, `enforceVerifyLoop` (line 316) 300 saniye — büyük test suite (12 485 test) baseline'da bu sınırlar yetersiz kalabilir, parametrik yapılması iyi olur.

**B-17 — `worker-log.ts` (194 LoC) — log formatlama temiz.** Emoji + plain mode (a11y/CI uyumu için). `redactSensitive` (line 11 import) entegrasyonu güvenlik açısından doğru — log dosyalarına secret sızması azaltılıyor.

**B-18 — `auditor.ts` 12-satırlık ince integration shim.** Sadece `authority-enforcer` re-export'u. Mimari niyet net (Sprint 143 Layer 4 wire) ama agents/ klasöründe olması semantik olarak yanıltıcı — gerçek implementasyon `src/orchestra/authority-enforcer.ts`. İsim çakışması: `src/monitor/auditor.ts` de var, klasörler arası tek isim iki dosya kafa karıştırıcı.

**B-19 — `index.ts` (18 LoC) küçük public façade.** Sadece worker.ts'ten 14 isim re-export ediyor. Public surface'i kontrol için doğru pattern, fakat dead-export'ları (claimTask, writeResult, vb.) dışarıya açık tutuyor — B-3/B-4 ile birlikte değerlendirilmeli.

### 1.4 Cross-Cutting Endişeler

**B-20 — Type assertion (`as`) yoğunluğu — kontrolsüz JSON parsing.** 15 farklı yerde `JSON.parse(...) as Foo` (örnek: prompt-version.ts:70, agent-retirement.ts:101). Zod/io-ts gibi runtime şema doğrulama yok. JSON dosyası bozulursa (manuel düzenleme, kısmi yazım, eski sürüm) çağıran taraf tip-güvenli sanıyor ama runtime'da `undefined` davranışı görüyor. **OSS GA öncesi öneri:** memory.db dışındaki disk-state JSON'larına (genealogy, evolution, experiments) hafif şema kontrolü gerekir.

**B-21 — `process as unknown as ChildProcess` double-cast.** worker-ipc.ts:60 (JSDoc örnek) ve worker-ipc.ts:231 (`emitter` default). TypeScript'in `process`'i `ChildProcess` saymaması doğal — bu cast pragmatik ama uygunsuz; gerçek üretim emitter'ını test-injection ile ayırmak (constructor parametresi) zaten yapılmış (line 229), JSDoc örneği kafa karıştırıyor.

**B-22 — ESM `.js` uzantısı disiplini tam.** Tüm import'larda `.js` uzantısı kullanılmış (örnek: worker.ts:13-27). ADR-002 (Node16 module resolution) ihlali yok. **Pozitif bulgu.**

**B-23 — Catch-yutma kalıbı yaygın.** Pattern: `try { ... } catch { return null/return; }` (örnek: prompt-version.ts:104, prompt-evolution.ts:118, agent-genealogy.ts:173, agent-retirement.ts:160). Hata logu yok. Test ortamında "neden boş çıkıyor?" diagnostiği için bir `console.debug` veya event-stream emission iyi olur. Üretimde silinmesi de düşünülmeli — bozuk JSON file = sessiz boş döngü senaryosu, observability'ye zarar verir.

**B-24 — Sprint 144 God Object Split'ten kalan re-export hayaleti.** worker.ts hâlâ 512 LoC, çünkü 4 alt modülün tüm public API'sini re-export ediyor (worker.ts:30-93). Bu, geriye uyumluluk için yararlı ama her import edenin gereksiz büyük modül grafiği yüklemesine yol açıyor (TypeScript compile + runtime cold-start için minik etki). OSS GA sonrası 1-2 minor sürümde re-export'lar dispose edilebilir (ADR-038 disposal pattern).

---

## 2. Severity

| Bulgu | Severity | Gerekçe |
|-------|----------|---------|
| **B-1** ADR-037 RBAC wire kopuk + soft mode | **CRITICAL** | Doc-vs-code drift. DECKENT.md "scope dışına yazamaz" iddiası temelsiz. OSS public öncesi worker güvenlik garantisi yok. |
| **B-2** `enforceVerifyLoop` gate çağrılmıyor | **CRITICAL** | Sözleşme yutuk: writeResult öncesi tsc+vitest gate vaadi runtime'da yok. Sprint 156-164 stub bug'larının kök nedenlerinden biri. |
| **B-3** writeResult honest-gate üretimde bypass'lanıyor | **HIGH** | AI agent doğrudan dosya yazıyor; stub-downgrade koruması atlatılır. Brain EVALUATE fazında ikinci katman gerekli. |
| **B-4** claimTask/acquireLock/isWithinScope dead in src | **HIGH** | Public API kontrat olarak tasarlanmış ama runtime'da bypass. Test başarısı yanıltıcı kanıt. |
| **B-7** Honest-gate dahili yola hapsedilmiş | **HIGH** | B-3'ün özel hali. Brain'e taşınması orchestrasyonu sağlamlaştırır. |
| **B-8** Prompt-evolution alt sistemi 1300 LoC dead | **HIGH** | OSS açıldığında "neden var?" sorusu. ADR-038 ile dispose veya promote kararı. |
| **B-10** PermissionGuard dead ve B-1 ile çelişen ikinci iskelet | **HIGH** | Mimari kafa karışıklığı yaratıyor; iki ölü RBAC iskeletinden biri tutulup tek noktada birleştirilmeli. |
| **B-12** `sprintsParticipated: 0` hard-coded | **MEDIUM** | Modül dead olduğu için canlı etki yok; canlandırılırsa audit trail bozuk. |
| **B-6** SIGTERM handler global side-effect | **MEDIUM** | Worker dışında import edildiğinde Brain SIGTERM davranışını kirletir; env-guard koruyor ama frajil. |
| **B-9** AdaptiveAgent dead | **MEDIUM** | B-8 ile aynı dispose/promote tartışması. |
| **B-11** Genealogy/Retirement/CrossSprint/Drift dead | **MEDIUM** | Aynı tartışma. |
| **B-13** SharedContext yarı-canlı | **MEDIUM** | multi-agent.ts canlılığına bağlı. |
| **B-5** writeFinishedHeartbeat dead deprecated | **LOW** | Silmesi güvenli, blok değil. |
| **B-20** JSON.parse `as Foo` şema yokluğu | **LOW** | OSS GA backlog. |
| **B-23** Catch-yutma kalıbı | **LOW** | Observability iyileştirmesi, blok değil. |
| **B-24** Sprint 144 re-export hayaleti | **LOW** | Performans/temizlik. |
| **B-18** auditor.ts isim çakışması | **LOW** | Yeniden adlandırma (örn. `adr-shim.ts`) öneri. |
| **B-19** index.ts public surface kontrol | **LOW** | Dead export'ları tutuyor. |
| **B-14/15/16/17** Sağlam modüller (positif bulgular) | — | Bilgi amaçlı. |
| **B-21** double-cast | **LOW** | Pragmatik kabul edilebilir. |
| **B-22** ESM `.js` uzantısı disiplini tam | — | Pozitif bulgu. |

---

## 3. Kanıt

Tüm kanıtlar `dosya:satır` biçiminde, doğrudan koddan alınmıştır.

### B-1 — ADR-037 RBAC çift-katman boşluk

`src/agents/worker.ts:475-493`:
```
if (!result.allowed) {
    console.warn(`[deckent] [ADR-037 soft] Worker ${taskId}: authority violation writing ${filePath} — ${result.reason}`);
    if (sprintId) { emitAuthorityViolation(...); }
    return true;     // ← İHLAL'de bile TRUE döner
}
return true;         // ← Allowed yolu da TRUE
```

Çağrı taraması: `rg "checkWorkerAuthority" src/` → tek sonuç `src/agents/worker.ts:457` (tanım). Üretim kodu çağrısı yok.

Test çağrıları: `tests/agents/worker-rbac.test.ts:84, 103, 123, 143, 174, 193` — testler "scope dışına yazımı engelliyor" iddiasını çalıştırıyor; gerçek üretim akışı bu kontrolden geçmiyor.

### B-2 — `enforceVerifyLoop` çağrılmıyor

`src/agents/worker.ts:300`: JSDoc kontrat metni `"**Verify Loop Gate:** Callers MUST run enforceVerifyLoop() before calling this function."`

Çağrı taraması: `rg "enforceVerifyLoop\(" src/ tests/` → sadece `src/agents/worker-verify.ts:335` (tanım) + `src/agents/worker.ts:300` (JSDoc yorumu) + `src/agents/worker.ts:42` (re-export). Hiç çağrı yok.

`src/agents/worker-verify.ts:379-390` marker yazımı: `task-${taskId}.verify-ran` dosyası — bu dosya hiçbir yerden okunup gate olarak kullanılmıyor.

### B-3, B-4, B-5 — `writeResult` / `claimTask` / `acquireLock` / `isWithinScope` / `writeFinishedHeartbeat` üretimde dead

`rg "writeResult\(" src/` → sadece `src/agents/worker.ts:302` (tanım) + `src/orchestra/sprint-controller.ts:638,662` (debugLog string'inde, gerçek çağrı değil; gerçek yazım `writeFile`).

`rg "claimTask\(" src/` → tanım dışında çağrı yok.

`rg "isWithinScope\(" src/` → tanım dışında çağrı yok.

Provider'lar kendi heartbeat'ini yazıyor: `src/providers/subprocess.ts:275-291` `protected writeHeartbeat(...)` — `worker.ts:writeHeartbeat`'i değil, doğrudan `writeFileSync(hbPath, ...)` kullanıyor.

### B-6 — Global SIGTERM side-effect

`src/agents/worker-lifecycle.ts:168-182`:
```
function registerSigtermHandler(): void {
  const taskId = process.env['DECKENT_TASK_ID'];
  const projectRoot = process.env['DECKENT_PROJECT_ROOT'];
  if (!taskId || !projectRoot) return;
  process.on('SIGTERM', () => { ...; process.exit(0); });
}
registerSigtermHandler();   // ← Modül load anında çalışıyor
```

### B-8, B-9, B-10, B-11 — Dead modül taraması

| Modül | LoC | `rg <Class> src/` üretim çağrı sayısı |
|-------|-----|-----------------------------------------|
| `PromptVersionManager` | 226 | 0 üretim (sadece prompt-rollback içinde) |
| `PromptAnalytics` (+ stub'lar) | 473+9+5 | 0 üretim |
| `PromptEvolutionLog` | 132 | 0 üretim |
| `PromptRollback` | 150 | 0 üretim |
| `AdaptiveAgent` | 213 | 0 üretim |
| `PermissionGuard` | 219 | 0 üretim (sadece kendi testi) |
| `AgentGenealogy` | 187 | 0 üretim |
| `AgentRetirement` | 206 | 0 üretim |
| `CrossSprintAnalyzer` | 242 | 0 üretim |
| `SpecializationDriftDetector` | 107 | 0 üretim |

### B-12 — `sprintsParticipated: 0` hard-coded

`src/agents/agent-retirement.ts:124`:
```
stats: {
  successRate: ...as number ?? 0,
  totalUses: ...as number ?? 0,
  sprintsParticipated: 0,    // ← Hardcoded, agentData'dan okumuyor
},
```

### B-20 — `as Foo` cast yoğunluğu

`src/agents/prompt-version.ts:70` `JSON.parse(content) as PromptVersion`, `src/agents/agent-retirement.ts:198` `raw as RetiredAgentRecord`, `src/agents/prompt-rollback.ts:144` `parsed as RollbackLogEntry[]`, `src/agents/cross-sprint-analyzer.ts:96` JSON.parse (cast yok ama runtime şema doğrulaması da yok). Toplam **15 yer**.

### B-22 — ESM `.js` disiplini

`src/agents/worker.ts:13-28` örnek: `from 'node:fs'`, `from '../core/types.js'`, `from '../core/constants.js'`, `from '../orchestra/event-stream.js'`. Hepsi `.js` uzantılı. ADR-002 uyumu tam.

---

## 4. Öneriler

Sprint 172 OSS GA öncesi önceliklendirme:

1. **Önce CRITICAL'leri kapatın (Sprint 172 P0 backlog adayı).**
   - **R-1 (B-1):** ADR-037 RBAC'ı runtime'da gerçekten enforce edin. Seçenek A: `checkWorkerAuthority`'yi `writeFileSync`/`appendFileSync` çağrılarının önüne entegre eden bir wrapper (file-lock.ts'in `acquireLock`'una sokun, lock alındığı an scope kontrolü yapılır). Seçenek B: ADR-037'yi "soft enforce" olarak güncelleyip auditor'ün post-hoc `git diff --stat` ile boundary tespitini tek koruma katmanı kabul edin. Ne yaparsanız yapın, **dokümantasyon ile kod arasındaki uçurumu** kapatın — şu anki durum kullanıcıyı yanıltıyor.
   - **R-2 (B-2, B-3, B-7):** `enforceVerifyLoop` gate'ini Brain'in EVALUATE fazına taşıyın. Worker `.tasks/task-X.verify-ran` marker'ını yazsın, Brain `result-evaluator.ts`'de marker yoksa otomatik NO_GO downgrade yapsın. Stub-shape downgrade (honest-gate) da Brain tarafında, agent'in dosyayı nasıl yazdığından bağımsız çalışsın.

2. **HIGH dead-code dispozisyonu (Sprint 172 P1).**
   - **R-3 (B-8 + B-10 + B-11):** ADR-038 disposal pattern'i ile prompt-evolution + permission-guard + genealogy/retirement/cross-sprint/drift için tek bir karar verin. İki seçenek: (a) "Future Feature Branch" ayrı bir paket dizininde tutup `src/agents/` dışına çıkarın; (b) tamamen silin, Sprint 134'teki "Self-Learning Agents" ADR'sini deprecated işaretleyin. Şu anki "ortada bekliyor" hali OSS public için en zararlı durum.
   - **R-4 (B-4):** `claimTask`, `acquireLock`, `isWithinScope`, `writeResult`'i ya gerçekten runtime'a wire'layın (worker prompt'undan import edilen helper olarak), ya `internal/` adlı saklı dizine taşıyın ya da `_legacy_` prefix verip silmeye yönlendirin. Public API olarak görünmesi yanıltıcı.

3. **MEDIUM/LOW iyileştirmeler (Sprint 173+).**
   - **R-5 (B-6):** `registerSigtermHandler` çağrısını modül yüklenirken değil, açık bir `worker-bootstrap.ts` entry'sinden çağırın. Brain veya test ortamı yan etki yaşamaz.
   - **R-6 (B-20):** Disk-state JSON'larına Zod veya minimal manuel `isFoo()` type guard ekleyin (öncelik: shared-context.ts, agent-retirement.ts). Tip-güvenli sanılan path'lerde bozuk JSON yutması bitsin.
   - **R-7 (B-23):** `catch {}` yutmalarına ya kısa `appendWorkerLog` çağrısı ya `event-stream` warning event'i ekleyin. Sessiz fail observability'ye zarar veriyor.
   - **R-8 (B-12):** `sprintsParticipated` retired record'a `agentData.stats?.sprintsParticipated ?? 0` ile yazılsın.
   - **R-9 (B-18):** `src/agents/auditor.ts` adını `src/agents/adr-compliance-shim.ts` veya benzerine değiştirin — `src/monitor/auditor.ts` ile semantik karışıklığı bitir.
   - **R-10 (B-24):** Sprint 173'te `worker.ts` re-export'larını dispose edip 4 alt modülü doğrudan import etmeye geçin. Tek minor sürüm migration notu yeterli.

---

## 5. Kapsam Haritası

Bu task **modül-derin** denetimdir. `src/agents/` altındaki **20 dosya tam okundu** (her satır `Read` aracıyla görüldü) ve davranış çağrı izleri (`Grep`) ile çapraz doğrulandı.

| # | Dosya | LoC | Audit Durumu | Bulgu Atıfları |
|---|-------|-----|--------------|----------------|
| 1 | `src/agents/worker.ts` | 512 | TAM OKUNDU | B-1, B-2, B-3, B-4, B-5, B-24 |
| 2 | `src/agents/worker-lifecycle.ts` | 578 | TAM OKUNDU | B-6, B-15 |
| 3 | `src/agents/worker-verify.ts` | 395 | TAM OKUNDU | B-2, B-16 |
| 4 | `src/agents/worker-log.ts` | 194 | TAM OKUNDU | B-17 |
| 5 | `src/agents/worker-ipc.ts` | 369 | TAM OKUNDU | B-14, B-21 |
| 6 | `src/agents/adaptive-agent.ts` | 213 | TAM OKUNDU | B-9 |
| 7 | `src/agents/auditor.ts` | 12 | TAM OKUNDU | B-18 |
| 8 | `src/agents/permission-guard.ts` | 219 | TAM OKUNDU | B-10 |
| 9 | `src/agents/index.ts` | 18 | TAM OKUNDU | B-19 |
| 10 | `src/agents/prompt-version.ts` | 226 | TAM OKUNDU | B-8, B-20 |
| 11 | `src/agents/prompt-analytics.ts` | 473 | TAM OKUNDU | B-8 |
| 12 | `src/agents/prompt-metrics.ts` | 5 | TAM OKUNDU (re-export stub) | B-8 |
| 13 | `src/agents/prompt-ab-test.ts` | 9 | TAM OKUNDU (re-export stub) | B-8 |
| 14 | `src/agents/prompt-evolution.ts` | 132 | TAM OKUNDU | B-8 |
| 15 | `src/agents/prompt-rollback.ts` | 150 | TAM OKUNDU | B-8 |
| 16 | `src/agents/agent-genealogy.ts` | 187 | TAM OKUNDU | B-11 |
| 17 | `src/agents/agent-retirement.ts` | 206 | TAM OKUNDU | B-11, B-12 |
| 18 | `src/agents/cross-sprint-analyzer.ts` | 242 | TAM OKUNDU | B-11 |
| 19 | `src/agents/shared-context.ts` | 120 | TAM OKUNDU | B-13 |
| 20 | `src/agents/specialization-drift.ts` | 107 | TAM OKUNDU | B-11 |
| **Toplam** | **20 dosya** | **4 367 LoC** | **100% (her dosya okundu)** | — |

**Cross-doğrulama:** `wc -l src/agents/*.ts` çıktısı 4367 toplam satır verdi; her dosya `Read` aracıyla offset 0'dan eksiksiz okundu. Çağrı kullanım taraması `Grep` ile yapıldı (sembol bazlı: sınıf adı + dosya yolu). Tests dizini bilinçli olarak audit kapsamı dışında tutuldu (Task 21 — Test Integrity bunu denetleyecek), fakat dead-code kararlarında "sadece test çağırıyor" bilgisi `tests/` aramasıyla doğrulandı.

**Coverage Doğrulama:** `src/agents/` dizininin tüm `.ts` dosyaları (genişletme yok, alt dizin yok — `ls /workspace/src/agents/` ile teyit) bu tabloda. Boşta dosya **0**.

---

_Rapor sonu. Audit-only çıktı; hiçbir kaynak/test/config/db dosyası bu task ile değiştirilmedi. Bulgu sayısı: **24** (1 CRITICAL × 2 + HIGH × 5 + MEDIUM × 6 + LOW × 9 + pozitif/bilgi × 2 — duplikasyon dahil). Sprint 172 OSS GA backlog'una **R-1, R-2, R-3** kritik P0 olarak girmeli._
