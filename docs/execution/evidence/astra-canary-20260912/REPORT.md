# Start / Do canlı canary — 2026-09-12

Owner talimatı: sonraki manuel onarımdan önce mevcut kodu commit et, bir gerçek `start` ve bir gerçek `do` çalıştır, sonuçları izle. Terminal değişikliklerini de commit'e kat ve main'i temizle. Epoch7 / MASTER120 STATE-RETENTION-001; DOGFOOD ON, HEALTH DEGRADED. Önceki R0B no751 sınırının bu iki deneme için owner tarafından kaldırıldığı checkpoint manifestinde kayıtlıdır. Yeni manuel ürün onarımı yapılmadı; 751 kod etkisi gerçek Deckent worker'ından geldi.

## Sonuç

- Deneme öncesi checkpoint: `3eaa44da5` (279 dosya). Opus/Cursor/geçmiş/Astra katkıları korunmuştur; bunların tümünü Astra yazmış veya yeniden doğrulamış sayılmaz.
- `node dist/cli/entry.js start`: monotonic **416748 ms**, exit **1**. Maliyet ön planı ve gerçek PLAN aynı 751 numarasını gösterdi. `EXACT_DOCKER_TASK_PROJECTION_ADMISSION_REQUIRED`; task/skill/worker doğmadı. Source diff yoktu.
- `do <kayıtlı goal> --run --yes --write-allowlist <dört dosya>`: CLI **347347 ms**, exit **0**. Bu yalnız detached start isteğinin kabulüdür. Gerçek Flow daha sonra **RUN_FAILED** oldu.
- Flow `963bbc69-bfff-4b5f-b5ac-6ba130853feb`, revision1, plan digest `39eb2a92cd218fe9ed57779219ea30ca0461c307e2839dfbbd2dc69118c346be`.
- Child attempt `7942af91-42db-48ad-b0ad-e6f49d00c9ca`; settlement **FAILED / EXACT_CHILD_RUNTIME_FAILED**. Detached child'ın OS exit kodu doğrudan waitpid ile toplanmadı; CLI exit0 bu sonucun yerine geçmez.
- Worker `751-001`, attempt `9d2ee9c9-500c-82a2-8f44-8b668521df43`, generation1, dispatch `dreq-2c97eeee97075ce9b84b93893375b3dfaf91e219ab67bbfaa7b010c76757e83a`. Admission digest `sha256:3bb030b5d6b173803174421355671e34212502ad0768b2e5f84e5c1b69972192`.
- Worker selfAssessment **NO_GO**; host etkiyi main'e uyguladı, fakat **0/1 sonuç kabulü**, `EFFECT_RELEASE_HOLD`. Kalıcı debug nedeni `TASK_ATTEMPT_CUSTODY_HOLD:ARTIFACT_REPLAY_MISMATCH`; sonraki recovery `REHYDRATE_AUTHORITY_MISMATCH / TERMINAL_RECONCILIATION_REQUIRED` ile reddedildi. Tam uyuşmayan artifact/byte alanı henüz saptanmadı.
- Son canonical okuma: **751 ABORTED / FAILED / active=false / coordinator=dead**. Flow failure kaydı ve child FAILED settlement var; task/effect durable settlement ve sprint archive terminal seal tamamlanmış değildir. `.tasks` task+skill, checkpoint, PID snapshot ve native custody korunuyor. Bunlar elle silinmedi veya sonuçları değiştirilmedi. Yeni sprint başlatılmamalı.

## Ölçülen akış

| Olay | UTC / ölçüm |
|---|---|
| do çağrısı | 18:37:48.854Z |
| Gerçek planner dispatch | 18:41:29.175Z |
| Planner transport settled | 18:43:14.812Z; provider duration105616ms, exit0 |
| START_REQUESTED | 18:43:15.459Z |
| RUN_STARTED | 18:49:47.594Z |
| Worker container started | 18:50:47.686Z |
| Task + skill delivery | 18:50:52.4Z |
| Provider container finished | 18:54:32.541Z; container exit0, worker verdict NO_GO |
| Effect-release replay mismatch | 18:57:23.267Z |
| RUN_FAILED / child FAILED | 19:01:47.509Z / 19:01:47.491Z |
| Canonical post-lease ABORTED | 19:04:04.418Z |

UTC farkıyla do→worker yaklaşık13 dakika, do→RUN_FAILED yaklaşık24 dakika; bunlar end-to-end monotonic benchmark değildir. Start wrapper'ın monotonic416748ms ile UTC farkı392899ms eşit değil; host clock farkının nedeni kanıtlanmadı. Monotonic ölçüm mevcut yerlerde onu kullanıyoruz, ayrı process saatlerini toplayarak hassas p95/latency iddiası üretmiyoruz.

## Gerçek kazanımlar ve kayıplar

1. **Do admission çalıştı:** scope/topology/policy pass, configured concurrency2 / effective1; task+skill+Docker kimliği bağlandı. Runtime ACTIVE/EXECUTE görüldü. Main'de üç worker dosyası gerçekten değişti: observability.ts, observability-rotation.ts, observability.test.ts (+24/-16). Bu, başarılı sonuç kabulü veya closure değildir.
2. **Start ingress kopuk:** `src/cli/commands/start.ts:1297` maliyet için dry-run planlar; `:1392` normal runSprint çağrısına exact hooks vermez. `src/orchestra/sprint-controller.ts:1022` authority yoksa materialization döndürmez; `:3186` exact Docker bunu zorunlu tutar ve reddeder. Aynı sözleşmeye bağlanmış structured giriş gereklidir; gate kaldırılmamalı.
3. **Host gecikmesi ağır:** `src/orchestra/run-proposal-compiler.ts:230` gerçek provider çağrısından önce senkron planning authority kontrolü yapar. `src/orchestra/sprint-controller.ts:2789` child başlangıcında; `:3582` sonuç toplama sonrasında tekrar uzlaştırır. İlk do heartbeat212s'de görüldü. Process örnekleri yüksek CPU ve GB ölçeğinde mantıksal read gösteriyor; read_bytes fiziksel I/O ile rchar aynı metrik değildir. Bu süreleri model düşünme süresi saymak yanlıştır.
4. **Etki/sonuç kapanışı kopuk:** `src/orchestra/spawn-backend-docker.ts:20522` commit-effect sonrasında host attribution ve release çalışır; `:20581` release başarısızsa EFFECT_RELEASE_HOLD döner. `:17208` çevresindeki catch debug'a düşük seviyeli mismatch yazar. Release publication/replay/rehydration sözleşmesi aynı artifact bytes ve kimlikle tekrar kullanılabilir olmalıdır; sahte receipt, yeni timestamp ile overwrite veya elle settlement yok.
5. **Dependency parity yok:** main ve worker app.tsx aynı SHA256 `9216f53471c34f993af0d18121065753086b038029590f7a9870a561a9228092`. Host Ink7.1.1 suspendTerminal tipini içeriyor; worker Ink7.0.5 içermiyor. package.json aralığı ^7.0.5, root lockfile yok. Worker tsc exit2'nin somut sebebi bu API uyumsuzluğu; kaynak eski değil. Dependency volume doğrulaması, host doğrulama ortamıyla uyumluluğu tek başına ispatlamıyor.
6. **Doğrulama komutu izlenmedi:** exact task JSON verilen `--configLoader runner --no-cache` komutunu içerdiği halde worker `npm run test ...` seçti; Vite `.vite-temp` başlangıç hatası exit1. Kanıtsız dependency mutasyonu yapmadı, ancak uygulanabilir verilmiş komutu denemeden NO_GO oldu. Kabul edilmiş verification recipe host'un yapılandırılmış execution contract'ında korunup doğrulanmalıdır.
7. **Durum semantiği:** ilk çıplak start başarısızlığı sonrasında 751 IDLE / global748 görüldü. Do child öldükten sonra da reader kısa süre ACTIVE/alive verdi. `src/core/run-status-authority.ts:157` PID false sonrası, `:194` civarı güncel lease'i alive sayar; 120s sınırı bitince FAILED/ABORTED görüldü. Cross-namespace lease korunmalı ama kernel liveness, lease freshness ve durable terminal Flow ayrı gösterilmelidir.
8. **Rol/usage:** brain gerçek codex/gpt-6-astra; planner receipt transport succeeded / consumer accepted, fakat output usage artifact yok. Worker gerçek codex çıktısında input612096, cached_input533248, output9774, reasoning_output2992; bunlar raw provider raporudur, ayrıca toplanarak yeni total üretilmedi. Worker implementer; ci-testing/typescript-expert yanında rpc-protocol/react-specialist teslim edildi — teslim var, tam semantik uygunluk iddiası yok. Docker healthcheck Claude sürümü sorguluyor; bu selected Codex readiness kanıtı sayılmamalı.

## Aynı komutla yerel karşılaştırma

- Worker ortamı: tsc exit2; yanlış test recipe startup exit1, hiçbir test koşulmadı.
- Host, landed candidate: `VITEST_MAX_FORKS=2 npx vitest run --configLoader runner --no-cache tests/core/observability.test.ts tests/core/observability-rotation.test.ts` → **69/71**, exit1.
- Aynı test komutu, 3eaa44da5 git archive izolasyonu + aynı host dependency bağlantısı → **70/71**, exit1.
- Baseline'da transient-recovery testi (45<20 beklentisi) kırmızıydı. Candidate bunu geçirdi; stat ölçümü ve before-record ceiling testleri yeni kırmızı oldu. Test başarısızlıkları doğrulanmıştır; ikisinin gerçek ürün regresyonu mu yoksa eski scheduling'e bağlı assertion mı olduğu ayrıca incelenmeli, assertion gevşeterek kapatılmamalı.
- Candidate host `npx tsc --noEmit` exit0; scoped `git diff --check` exit0. Yeni manuel kod/test düzeltmesi yok.
- Başlangıç build/source MATCH; worker etkisi sonrası source değiştiği için build/source MISMATCH beklenir. Sprint çalışırken build yapılmadı; bu turda yeni build yok. Eski dist yeni candidate'ın doğrulaması değildir.
- Formal different-provider XVerify yapılmadı. LOCAL ölçüm ≠ XVerify ≠ ürün DONE.

## Sonraki bounded onarım sırası — uygulama başlamadı

1. **Önce mevcut751 release/rehydration kilidi:** exact immutable progress/artifact/receipt zincirinde ilk farklı byte/field'i bul; replay aynı identity ve bytes ile idempotent olsun, native reread+durable negative/positive settlement kanıtı üret. Main postimage, task/provider/result/artifact kanıtı korunur. Owner kill/cleanup/force-finalize gate'i kullanılmaz.
2. **Start ortak admission:** structured/directives planını deterministik biçimde aynı approved snapshot/materializer/RunFlow yoluna bağla. Yeni LLM çağrısı veya gate bypass ekleme. Normal start ve do gerçek worker/terminal negatif sonucu ile aynı kabul sınırına ulaşmalı.
3. **Başlangıç gecikmesi ve görünürlük:** R0B default-OFF snapshot candidate'ının memory/latency proof'u kapatılmadan açma. Proof-equivalent bytes/parsed facts tekrarını bounded operation içinde azalt; mutation/identity/platform/policy sınırlarında fresh revalidation koru. PLAN/admission/dispatch/result-release aşamaları en baştan canonical event ve canlı heartbeat ile görünür olmalı. Global timeout tek başına bu işi çözmez.
4. **Worker ortamı ve verification recipe:** package/toolchain/dependency capability identity'yi host+image+volume arasında dispatch öncesi doğrula; test recipe'yi modelin başka komutla değiştirmesini görünür biçimde reddet veya configured runner'a bağla. Ortam uyumluluğu proof olmadan provider başlatma.
5. **Retention candidate kabulü:** yeni iki testin semantiğini çöz, gerçek byte preservation/policy change/failure recovery kanıtını tamamla; sonra dogfood tekrar. Mevcut test kırmızısı ve effect HOLD varken yeni sprintle üstünü örtme.

Her onarımın ardından kontrol matrisi: admission→task→skill/persona→provider call+usage→heartbeat→main effect→test/host proof→result acceptance→terminal settlement. Süreyi host/model/worker/finalizer olarak ayır; başlangıç CLI exit0 veya yalnız unit-green ile kapanış iddia etme. Dashboard/Terminal/Desktop aynı canonical durum anlamını paylaşmalı; bu canary GUI/PTY veya tüm-platform proof değildir.
