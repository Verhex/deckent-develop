# CLI Surface Truth Çalışması Sırasında Gözlenen Genel Bulgular

Bu dosya `codex/cli-surface-truth` worktree çalışmasının ana scope'u değildir.
Buradaki maddeler bu branch'te otomatik olarak düzeltilmemelidir. Main'e merge
öncesinde ana session bu dosyayı okuyup bulguları ayrı outcome/task olarak
sınıflandırmalıdır.

## Scope sınırı

- Bu worktree'nin işi CLI command path açıklamalarını, i18n help yüzeylerini,
  option/argument açıklamalarını, bunların executable contractını ve generated
  CLI reference doğruluğunu düzeltmektir. `status` ve memory-budget davranışları
  bu branch'te değiştirilmemiş; yalnız bulgu olarak kaydedilmiştir.
- Aşağıdaki dogfood/bootstrap bulguları `RELATED_BUT_NONBLOCKING` olarak tutulur;
  yalnız CLI işini gerçekten yürütmeyi engelleyen recovery adımları uygulanır.
- Worktree: `/tmp/deckent-cli-surface-truth`
- Branch: `codex/cli-surface-truth`
- Başlangıç base'i: `2b2895ba930aa5e874f31bb7d23eca61312766f4`

## 1. Detached exact-start sandbox PID namespace uyumsuzluğu

- İlk `deckent runs <flow> --start` sandbox içinde PID `15` kaydetti; command
  döndüğünde namespace kapandığı için child öldü.
- Host tarafında PID yokken Flow `STARTING`, attempt `PROCESS_SPAWNED` kaldı.
- `runs --close-stale` bunu bulmadı; çünkü operator sweep run-handle kaydını
  okuyor, pre-admission start-attempt kaydını sınıflandırmıyor.
- Canonical `sweepDeadDetachedRuns()` host namespace'inde çağrıldığında ölüm
  kanıtlandı ve attempt/Flow dürüstçe `FAILED` settle edildi.
- İncelenecek olası gap: detached birth sandbox/host PID identity sözleşmesi ve
  `runs --close-stale` ile exact start-attempt journal kapsam eşitliği.

## 2. `status` ile death-sweep görünürlüğü

- Host namespace'inde `status --json` çağrısı ilk denemede ölü attempt'i
  kapatmadı; exported canonical death-sweep doğrudan çağrıldığında kapattı.
- `status.ts` dynamic death-sweep çağrısının await/order/error-surface zinciri
  ayrıca doğrulanmalı. Read path'in state mutation yapması zaten tasarlanmış
  davranış; sorun gözlenen kapanışın gerçekleşmemesidir.

## 3. Planning catalog dry-run / gerçek-run farkı

- Aynı DIRECTIVES ile gerçek `plan --structured` provider bootstrap sonrasında
  14 eligible agent görüp task 6 için `doc-writer` seçti.
- `plan --structured --dry-run --adopt-existing` provider bootstrap yapmadığı
  için 21 agent görüp `architecture-planner` seçti; aynı config altında plan
  digest ve task projection değişti.
- Sonuç: dry-run, gerçek planning sonucunu preview etmiyor ve projection
  reconciliation yanlış conflict üretebiliyor.
- Routing decision journal bunu açıkça kanıtlıyor: aynı `sprint-001/task-001-006`
  için iki farklı catalog/decision.

## 4. Temp-agent planning yan etkisi

- Planning `.deckent/agents/temp-react-specialist` ve
  `.deckent/agents/temp-react-ts-specialist` üretiyor.
- Dry-run çağrısı da bu ignored runtime profillerini üretebildi. Pure preview
  beklentisi ile yan etki sözleşmesi ayrıca incelenmeli.
- Mevcut tracked archive kopyalarına dokunulmadı. Recovery sırasında yalnız
  ignored iki aktif profil `/tmp/deckent-cli-temp-agent-recovery-XAuzrC` altına
  taşınmış, sonraki planning tarafından yeniden üretilmiştir.

## 5. Default execution budget ile explicit subprocess backend çelişkisi

- Worktree init config'i `spawn_backend=subprocess` ve worker default budget
  `{maxTurns: 40, maxTokens: 4000000}` üretti.
- Spawn backend'in kendisi `liveUsageBudgetSupport=undefined`; finite token
  budget provider çağrısından önce fail-closed oldu:
  `Live execution budget requires measured streaming usage`.
- Claude subprocess provider adapterında measured-stream desteği koşullu
  bulunmasına rağmen orchestration `SubprocessBackend` capability projectionı
  bunu yansıtmıyor.
- Init/default backend seçimi ile default finite-budget policy birlikte
  admission-safe çözülmeli; kullanıcıya çalışmayacak kombinasyon yazılmamalı.

## 6. Spawn retry task mutation exact-plan drift'i

- İlk spawn attempt budget gate'te durmadan önce `buildWorkerPrompt()` approved
  in-memory task'a `estimatedTokens` ve `promptCompilePlanId` ekledi.
- İkinci attempt on-disk exact task ile mutated in-memory task'ı karşılaştırdı ve
  `EXACT_PLAN_TASK_ARTIFACT_DRIFT` verdi; gerçek ilk hata maskelenmese de recovery
  yolu ikinci bir yapay hata üretti.
- Source comment bu sınıfı zaten anlatıyor; mutasyonun retry öncesi rollback veya
  immutable task clone sınırı productionda kapanmamış görünüyor.

## 7. Failed Flow / resumable Sprint çift-gerçeği

- Exact child attempt ve Flow terminal `FAILED` olurken canonical sprint status
  aynı anda `ORPHANED/resumable`, phase `SPAWN`, status `PLANNING` gösterdi.
- `recover sprint-001 --resume` öneriliyor. Flow terminal state ile checkpoint
  resume/terminal publication ilişkisinin kullanıcı yüzeyinde açık ve tekil
  olması ayrıca doğrulanmalı.

## 8. Merge zamanı conflict riski

- Worktree eski base `2b2895ba...` üzerinden açıldı; main çalışma sırasında
  ilerledi.
- Main tarafında en az `src/cli/commands/cleanup.ts`,
  `src/cli/commands/provider-observations.ts` ve
  `src/cli/helpers/messages.ts` üzerinde eşzamanlı değişiklikler gözlenmişti.
- Merge öncesi `git branch -vv`, base/head drift ve bu üç dosyanın semantic
  conflict'i özellikle incelenmelidir; worktree diff'i körlemesine uygulanmamalı.

## 9. Planned execution budget / runtime breaker çelişkisi

- `task-001-001-fix.json` lineage worker policy üzerinden `maxTurns: 40`
  taşırken canlı Docker worker `turn budget exceeded (13 > 12)` gerekçesiyle
  runtime circuit breaker tarafından SIGKILL edildi.
- Worker sonuç üretemediği için host partial marker'ı `NO_GO`ya çevirdi ve ikinci
  FIX attempt'i açıldı.
- Approved/planned task budget, prompt/runtime budget fingerprint ve container
  enforcement limiti tek resolved authority'den gelmiyor veya projectionlardan
  biri yanlış görünüyor. Bu branch'teki CLI içerik işi olarak düzeltilmedi.

## 10. Top-level `status` ile nested authority projection çelişkisi

- Gözlenen canonical `status` çıktısında top-level lifecycle/read-model alanı
  `UNAVAILABLE` iken aynı çıktı içindeki daha alt authority projectionı Sprint'i
  `PAUSED` gösterdi.
- Kullanıcının gördüğü birincil durum ile durable/nested authority aynı cevabı
  vermiyor. Precedence ve unavailable gerekçesi açıkça modellenmeden tek
  `status` komutu çelişkili gerçekler yayımlıyor.
- Bu branch yalnız help açıklamasını dürüstleştirir; status projection
  birleştirme davranışına dokunmaz.

## 11. `resume` ile stale coordinator lock çelişkisi

- Status Sprint'i `PAUSED` ve coordinator'ı yok gösterirken resume denemesi PID
  `15` taşıyan coordinator lock nedeniyle bloklandı.
- Lock sahibinin canlılığı, PID namespace'i ve paused/resumable state aynı
  authority zincirinden çözülmüyor. Resume admission öncesinde typed stale-lock
  reconciliation veya açık recovery yönlendirmesi gerekiyor.
- Bu branch lock/state davranışını değiştirmez.

## 12. Projection validator artifact sınıflandırma hatası

- Projection validation sırasında `*.prompt-delivery.json` dosyaları task
  artifactı gibi sınıflandırıldı.
- Dosya-adı pattern'i gerçek task projection şemasıyla daraltılmalı; delivery
  receipt'leri aynı namespace'te bulunsa bile task state olarak parse
  edilmemeli.
- Bu branch validator davranışını değiştirmez.

## 13. FIX retry/budget görünürlüğü tutarsızlığı

- Recovery sırasında dört `*-fix.json` artifactı `PENDING` görünürken effective
  `max_fix_retries=2` nedeniyle yeni FIX admissionı budget-exhausted oldu.
- Lineage attempt sayımı ile diskteki pending/terminal projectionların ilişkisi
  kullanıcıya açıklanmıyor; sayıların hangi attemptleri kapsadığı status/plan
  yüzeyinde görünür olmalı.
- Bu branch retry veya budget davranışını değiştirmez.

## 14. Forced finalize terminal seal HOLD

- `finalize --force --skip-decay --skip-hooks` denemesi
  `brain_adoption_failed` gerekçeli terminal-seal `HOLD` ile kapandı.
- Force/skip seçeneklerinin hangi closure gate'lerini atlayabildiği ve Brain
  adoption'ın neden atlanamaz olduğu help ve typed error yüzeyinde daha açık
  olmalı; `--force` terminal kapanışı garanti ediyor gibi okunmamalı.
- Bu branch finalize işlevini değiştirmez.

## 15. `status --mode` public identifier yazım hataları

- Handler'ın kabul ettiği public değerler `explainatory` ve `standart`; beklenen
  İngilizce yazımlar `explanatory` ve `standard` kabul edilmiyor.
- Bu branch açıklamayı çalışan identifier'ları söyleyecek biçimde dürüst tuttu;
  behavior değişikliği yapmadı. Ayrı outcome'da doğru yazımlar canonical,
  mevcut typo değerler backward-compatible deprecated alias yapılmalı.

## 16. CLI docs generator runner dependency'si

- `docs:generate-cli` script'i `npx tsx` kullanıyor fakat `tsx` project-local
  dependency olarak çözülmüyor (`npm ls tsx --depth=0` boş).
- Offline/hermetic ortamda `npx` network veya global cache'e bağımlı kalabilir.
  Generator için repo-owned, lockfile-pinned runner seçimi ayrı toolchain işi
  olarak değerlendirilmelidir; bu branch package dependency kapsamını
  genişletmez.

## 17. `npm run build` clean HOLD'u başarı gibi yayımlıyor

- Worktree'de `npm run build`, `clean.mjs` tarafından
  `E_CLEAN_ACTIVE_EXECUTION_HOLD` / execution-lock authority state missing
  cevabı aldı.
- Buna rağmen process exit code `0` oldu; shell zinciri `tsc` ve asset-copy
  aşamalarını çalıştırmadan tamamlandı. Dışarıdan bakıldığında build başarılı
  görünürken yeni binary üretilmedi.
- Typed HOLD build script'ine non-zero/typed failure olarak taşınmalı veya build
  orchestrator clean'in gerçekleşmediğini doğrulamalı. Bu branch clean/build
  işlevini değiştirmez; CLI çalışması için yalnız non-clean `tsc` + asset-copy
  adımları ayrıca doğrulanmıştır.
