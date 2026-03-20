# DIRECTIVES — Sprint 027 (Teknik Bosluk Kapatma)

## Hedef: Deckent'i global lansmana hazirlamak icin kritik teknik bosluklar kapatilir. Provider abstraction, subprocess spawn, zero-config mode, coverage dogrulama, rollback, usage tracking, sandbox temeli, Worker IPC, pause/resume fix, global config tamamlama. 30 gorev — tumu opus model, effort high/max.

---

## Gorev 1: Provider Abstraction Interface
- Dosya: src/core/provider.ts (yeni), tests/core/provider.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
ProviderAdapter interface tanimla: spawn(opts), checkUsage(), isAvailable(), supportedModels, name. ProviderRegistry sinifi: registerProvider, getProvider, listProviders, getDefault. tmux.ts'deki buildClaudeCommand ve spawnWorker'in provider'a delege edilecek soyut yapiyi tanimla. Interface-only + registry + 20 test.

### Test
- ProviderAdapter interface tipleri dogru
- ProviderRegistry register/get/list/default calisiyor
- Olmayan provider icin hata firlatiliyor
- 20+ test

---

## Gorev 2: Claude Provider Adapter
- Dosya: src/providers/claude.ts (yeni), tests/providers/claude.test.ts (yeni)
- Kapsam: src/providers/, tests/providers/

### Aciklama
ClaudeAdapter implements ProviderAdapter. Mevcut tmux.ts'deki buildClaudeCommand, spawnWorker, killWorker, listWorkers, isSessionActive mantigi bu adapter'a tasiniyor (kopyalanmiyor, sarmalaniyor). checkUsage() mevcut brain.ts checkUsage'i kullanir. isAvailable() claude --version kontrol eder. supportedModels: ['opus', 'sonnet', 'haiku']. 15+ test.

### Test
- spawn dogru tmux komutu olusturuyor
- checkUsage usage metrics donduruyor
- isAvailable claude CLI kontrol ediyor
- supportedModels dogru
- 15+ test

---

## Gorev 3: Subprocess Spawn Backend
- Dosya: src/providers/subprocess.ts (yeni), tests/providers/subprocess.test.ts (yeni)
- Kapsam: src/providers/, tests/providers/

### Aciklama
SubprocessSpawnBackend: tmux KULLANMADAN child_process.spawn ile worker calistirma. Her worker ayri bir child_process. stdout/stderr log dosyasina yonlendirilir (.tasks/task-{id}.log). Process yonetimi: pid tracking, kill signal, timeout. Heartbeat dosyalari ayni formatta yazilir. Bu backend Windows (WSL2 olmadan) desteginin temelidir. 20+ test.

### Test
- Worker subprocess olarak spawn ediliyor
- stdout/stderr log dosyasina yaziliyor
- Kill signal ile process sonlandiriliyor
- Timeout ile otomatik kill
- Heartbeat dosyalari olusturuluyor
- 20+ test

---

## Gorev 4: SpawnBackend Abstraction
- Dosya: src/core/spawn-backend.ts (yeni), tests/core/spawn-backend.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
SpawnBackend interface: spawn(taskId, model, prompt, opts), kill(taskId), list(), isAvailable(). TmuxBackend (mevcut tmux.ts'i sarar) ve SubprocessBackend (Gorev 3) bu interface'i implement eder. SpawnBackendFactory: config veya ortama gore backend secer (tmux varsa tmux, yoksa subprocess). brain.ts spawnWorkers bu factory'yi kullanacak. 15+ test.

### Test
- TmuxBackend mevcut islevsellik korunuyor
- SubprocessBackend ayni interface
- Factory tmux varsa tmux seciyor
- Factory tmux yoksa subprocess seciyor
- 15+ test

---

## Gorev 5: brain.ts Provider Entegrasyonu
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-provider.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
brain.ts'deki dogrudan tmux import'larini ProviderAdapter ve SpawnBackend uzerinden cagrilara donustur. spawnWorkers() artik SpawnBackendFactory.create() kullanir. checkUsage() artik ProviderAdapter.checkUsage() kullanir. Geriye uyumluluk: mevcut davranis degismemeli, sadece soyutlama katmani ekleniyor. 15+ test.

### Test
- Mevcut brain.test.ts'deki tum testler gecmeye devam ediyor (0 regresyon)
- Provider adapter uzerinden usage check calisiyor
- SpawnBackend uzerinden worker spawn calisiyor
- 15+ test

---

## Gorev 6: Coverage Dogrulama Mekanizmasi
- Dosya: src/orchestra/coverage-validator.ts (yeni), tests/orchestra/coverage-validator.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Worker result'taki self-reported coverage'i dogrulama mekanizmasi. parseCoverageFromVitest(jsonOutput): vitest --reporter=json ciktisini parse et. validateCoverage(reported, actual, threshold): reported vs actual farki >%5 ise uyari. Brain evaluateResult'a entegre: doc task degilse, coverage dogrulamasi yap. 15+ test.

### Test
- vitest JSON ciktisi dogru parse ediliyor
- Coverage eslesmesi dogrulaniyor
- Fark >%5 ise WARNING donuyor
- Doc task'lar icin dogrulama atlanir
- 15+ test

---

## Gorev 7: evaluateResult Coverage Entegrasyonu
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-coverage.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Brain evaluateResult fonksiyonuna coverage-validator entegrasyonu. Adimlar: 1) Worker result'tan coverage oku, 2) validateCoverage cagir, 3) Sonuca gore evaluation'i ayarla (coverage dogrulanmazsa GO_WITH_TECH_DEBT olarak isle). Mevcut evaluateResult mantigi bozulmamali. 10+ test.

### Test
- Coverage dogrulanan task DONE donuyor
- Coverage dogrulanmayan task GO_WITH_TECH_DEBT donuyor
- Doc task coverage dogrulamasiz DONE donuyor
- 10+ test

---

## Gorev 8: Usage Tracking — Temel Altyapi
- Dosya: src/core/usage-tracker.ts (yeni), tests/core/usage-tracker.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
UsageTracker sinifi: recordCall(model, tokenEstimate, taskId), getSprintUsage(sprintId), getTotalUsage(), getModelBreakdown(). Veri depolama: .deckent/usage/{sprintId}.json. Model bazli token/call sayimi. Sprint bazli ve kumulatif raporlama. 20+ test.

### Test
- recordCall dogru kaydediyor
- getSprintUsage sprint verisi donduruyor
- getModelBreakdown model bazli ayristirma
- Dosya I/O hatalarina dayanikli
- 20+ test

---

## Gorev 9: Usage Tracking — Brain Entegrasyonu
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-usage.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Brain sprint lifecycle'ina UsageTracker entegrasyonu. spawnWorkers'da her spawn icin recordCall. evaluateResult'da degerlendirme icin recordCall. writeRetrospective'de usage ozeti ekleme. runSprint sonunda sprint usage raporu. 10+ test.

### Test
- Sprint sirasinda usage kaydediliyor
- Sprint sonunda usage raporu dogru
- Model dagilimi dogru hesaplaniyor
- 10+ test

---

## Gorev 10: deckent usage Gercek Implementasyon
- Dosya: src/cli/commands/usage.ts, tests/cli/usage.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
Mevcut stub'i gercek implementasyonla degistir. UsageTracker'dan veri oku. Tablo formati: model bazli call/token sayisi, sprint bazli maliyet tahmini (API mode icin). --json flag. --sprint <id> filtresi. 10+ test.

### Test
- usage komutu tablo donduruyor
- --json JSON ciktisi
- --sprint filtresi calisiyor
- Veri yoksa bilgilendirici mesaj
- 10+ test

---

## Gorev 11: Zero-Config Mode — Temel
- Dosya: src/cli/commands/quick-start.ts (yeni), tests/cli/quick-start.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
`deckent start "Add login page with Google OAuth"` — DIRECTIVES.md yazmadan tek satirlik dogal dil ile sprint baslat. Adimlar: 1) Arguman olarak description al, 2) Gecici DIRECTIVES.md olustur (## Gorev 1: {description}), 3) Normal planSprint akisina sok, 4) Sprint bitince gecici DIRECTIVES'i temizle. Mevcut `start` komutuna opsiyonel positional argument olarak ekle. 15+ test.

### Test
- String arguman ile sprint basliyor
- Gecici DIRECTIVES.md dogru formatta olusturuluyor
- DIRECTIVES.md zaten varsa uyari
- Sprint sonrasi temizlik yapiliyor
- 15+ test

---

## Gorev 12: Zero-Config Mode — AI Planner Entegrasyonu
- Dosya: src/orchestra/planner.ts, tests/orchestra/planner-zeroconfig.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Tek satirlik dogal dil girdisini AI planner ile coklu goreve parcalama. Kullanici "Add login page with Google OAuth" dediginde, AI planner bunu: 1) Auth API endpoint'leri, 2) Google OAuth entegrasyonu, 3) Login sayfasi UI, 4) Test'ler seklinde 3-5 goreve bolsun. buildPlanPrompt'a zero-config context eklenmesi. 10+ test.

### Test
- Tek satirlik girdi coklu goreve parcalaniyor
- AI planner dogru scope atamalari yapiyor
- Fallback structured mode calisiyor
- 10+ test

---

## Gorev 13: Rollback Mekanizmasi — Git Safety
- Dosya: src/orchestra/rollback.ts (yeni), tests/orchestra/rollback.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Sprint baslamadan once otomatik git safety point. createSafetyPoint(projectRoot): git stash veya yeni branch (deckent-backup-{sprintId}). rollback(projectRoot, safetyPointId): basarisiz sprint sonrasi geri alma. isCleanWorkingTree(projectRoot): uncommitted degisiklik kontrolu. Rollback politikasi: tum task'lar NO_GO ise otomatik teklif, kismi basari ise kullaniciya sor. 15+ test.

### Test
- createSafetyPoint git branch olusturuyor
- rollback branch'e geri donuyor
- Dirty working tree uyarisi
- isCleanWorkingTree dogru calisyor
- 15+ test

---

## Gorev 14: Rollback — Brain Entegrasyonu
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-rollback.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
runSprint'e rollback entegrasyonu. PLAN fazindan once createSafetyPoint cagir. EVALUATE fazinda tum NO_GO ise rollback teklif et (auto-approve degilse kullaniciya sor). Rollback sonrasi DEBT.md'ye kayit. runSprint options'a rollback: boolean ekle. 10+ test.

### Test
- Sprint oncesi safety point olusturuluyor
- Tum NO_GO durumunda rollback calisiyor
- Kismi basaride rollback yapilmiyor
- rollback: false ile atlanabiliyor
- 10+ test

---

## Gorev 15: Pause/Resume Gercek Ortam Fix
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-pause-resume.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Mevcut pauseSprint ve resumeSprint fonksiyonlarinin gercek ortam testi ve fix'leri. Kontrol listesi: 1) pauseSprint tum aktif worker'lari durduruyor mu? 2) .paused dosyalari dogru yaziliyor mu? 3) resumeSprint PAUSED → PENDING gecisi calisiyor mu? 4) Resume sonrasi worker'lar yeniden spawn ediliyor mu? 5) Dashboard pause durumunu gosteriyor mu? Bulunan bug'lari fix et. 15+ test.

### Test
- pauseSprint worker'lari durduruyor
- .paused dosyalari dogru formatta
- resumeSprint task durumlarini geri aliyor
- Dashboard PAUSED fazini gosteriyor
- 15+ test

---

## Gorev 16: checkAndAutoPause Gercek Ortam Fix
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-autopause.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
checkAndAutoPause fonksiyonunun gercek senaryo testi. Kontrol: 1) 5hr threshold asildiysa pause tetikleniyor mu? 2) weekly threshold asildiysa pause tetikleniyor mu? 3) Pause sonrasi usage dusuyor mu? 4) Auto-resume mantigi var mi? (yoksa ekle: usage dusunce otomatik devam). 10+ test.

### Test
- 5hr threshold asildiginda pause calisiyor
- weekly threshold asildiginda pause calisiyor
- Usage dusunce resume tetikleniyor (yeni ozellik)
- 10+ test

---

## Gorev 17: Worker IPC Temeli — MessageChannel
- Dosya: src/agents/worker-ipc.ts (yeni), tests/agents/worker-ipc.test.ts (yeni)
- Kapsam: src/agents/, tests/agents/

### Aciklama
Dosya bazli iletisim yerine process.send/message temelli Worker IPC. WorkerChannel sinifi: send(type, payload), onMessage(type, handler), close(). Mesaj tipleri: HEARTBEAT, STATUS_REQUEST, STATUS_RESPONSE, PAUSE, RESUME, KILL. Subprocess backend ile entegre (tmux ile degil — subprocess spawn'da child_process.fork kullan). Dosya bazli heartbeat geriye uyumlu kalir (fallback). 15+ test.

### Test
- send/onMessage calisiyor
- HEARTBEAT mesaji iletiyor
- PAUSE/RESUME worker'a ulasyor
- close() temizlik yapiyor
- 15+ test

---

## Gorev 18: Worker IPC — Brain Entegrasyonu
- Dosya: src/orchestra/brain.ts, tests/orchestra/brain-ipc.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Brain'in WorkerChannel uzerinden worker'larla iletisimi. waitForResults'da IPC mesajlarini dinle (dosya polling'e ek olarak). pauseSprint'de PAUSE mesaji gonder. Heartbeat kontrolunde IPC + dosya bazli dual kontrol. Fallback: IPC yoksa (tmux backend) dosya bazli devam et. 10+ test.

### Test
- IPC uzerinden heartbeat aliniyor
- IPC uzerinden pause komutu gonderiliyor
- IPC yoksa dosya bazli fallback calisiyor
- 10+ test

---

## Gorev 19: Sandbox Mode — Subprocess Izolasyonu
- Dosya: src/providers/sandbox.ts (yeni), tests/providers/sandbox.test.ts (yeni)
- Kapsam: src/providers/, tests/providers/

### Aciklama
Sandbox mode temel implementasyonu. SandboxSpawnBackend extends SubprocessSpawnBackend. Ek guvenlik katmanlari: 1) Worker process'e NODE_OPTIONS ile bellek limiti, 2) Scope enforcement runtime kontrolu (chroot benzeri dizin kisitlamasi), 3) Network erisimi kisitlama (opsiyonel), 4) Dosya sistemi izinleri (read-only alanlar). --sandbox flag'i baslatir. 15+ test.

### Test
- Bellek limiti uygulandigi dogrulaniyor
- Scope disinda dosya erisimi engelleniyor
- Network kisitlamasi calisiyor (opsiyonel)
- Normal subprocess'e fallback
- 15+ test

---

## Gorev 20: start --sandbox-mode Gercek Implementasyon
- Dosya: src/cli/commands/start.ts, tests/cli/start-sandbox.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
Mevcut stub'i gercek implementasyonla degistir. --sandbox-mode flag'i SandboxSpawnBackend'i aktive eder. Doctor check'e sandbox gereksinimleri ekle. Sandbox mode'da haiku_allowed otomatik false (guvenlik). 10+ test.

### Test
- --sandbox-mode SandboxSpawnBackend seciyor
- Sandbox'siz mevcut davranis korunuyor
- Doctor sandbox kontrolu calisiyor
- 10+ test

---

## Gorev 21: Global Config Tam Implementasyon
- Dosya: src/core/global-config.ts (yeni), tests/core/global-config.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
~/.deckent/ dizini tam implementasyon. GlobalConfig: mode, language, defaultModel, credentials path. readGlobalConfig(): ~/.deckent/config.json oku. writeGlobalConfig(): yaz. mergeWithProjectConfig(): global + proje config birlestir (proje oncelikli). ensureGlobalDir(): ilk kullaninda dizin olustur. 15+ test.

### Test
- ~/.deckent/ dizini olusturuluyor
- Global config okunuyor/yaziliyor
- Proje config global'i override ediyor
- Config yoksa default'lar kullaniliyor
- 15+ test

---

## Gorev 22: Global Config — CLI Entegrasyonu
- Dosya: src/cli/commands/config.ts, tests/cli/config-global.test.ts (yeni)
- Kapsam: src/cli/, tests/cli/

### Aciklama
`deckent config` komutuna global config destegi. `deckent config --global` global config goster. `deckent config set --global <key> <value>` global ayar yaz. `deckent config export --global` global config disari aktar. resolveConfig'e global config katmani ekle. 10+ test.

### Test
- --global flag global config gosteriyor
- set --global dogru yaziliyor
- Global + proje birlestirmesi dogru
- 10+ test

---

## Gorev 23: Credentials Yonetimi
- Dosya: src/core/credentials.ts (yeni), tests/core/credentials.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
~/.deckent/credentials/ dizininde guvenli anahtar yonetimi. storeCredential(provider, key): sifrelenmis (veya dosya izinli) kayit. getCredential(provider): oku. listCredentials(): provider listesi. API mode icin ANTHROPIC_API_KEY burada saklanir. Dosya izinleri 0600. 15+ test.

### Test
- Credential kaydediliyor
- Credential okunuyor
- Dosya izinleri dogru (0600)
- Olmayan credential icin null donuyor
- 15+ test

---

## Gorev 24: Task Retry Gercek Ortam Dogrulama
- Dosya: src/orchestra/task-retry.ts, tests/orchestra/task-retry-e2e.test.ts (yeni)
- Kapsam: src/orchestra/, tests/orchestra/

### Aciklama
Mevcut task-retry.ts'in gercek senaryo dogrulamasi. Kontrol: 1) shouldRetry NO_GO sonrasi true donuyor mu? 2) createRetryTask dogru id suffix ekliyor mu? 3) retryDelay backoff calisiyor mu? 4) Max 2 retry sonrasi durma. 5) brain.ts FIX fazinda retry entegrasyonu dogru mu? 10+ test.

### Test
- NO_GO sonrasi retry tetikleniyor
- Retry task id'si -r1, -r2 suffix aliyor
- 3. denemede retry durduruluyor
- Backoff suresi dogru (0, 30s)
- 10+ test

---

## Gorev 25: Deadlock Detection Gercek Ortam Dogrulama
- Dosya: src/monitor/auditor.ts, tests/monitor/auditor-deadlock-e2e.test.ts (yeni)
- Kapsam: src/monitor/, tests/monitor/

### Aciklama
Kahn's algorithm ile deadlock detection'in gercek senaryo dogrulamasi. Kontrol: 1) A→B→C→A dongusu tespit ediliyor mu? 2) Self-dependency tespit ediliyor mu? 3) Bagimsiz task'lar false positive vermiyor mu? 4) 10+ task'li senaryoda performans. 5) Deadlock alert'i dashboard'a yaziliyor mu? 10+ test.

### Test
- Dongusel bagimllik tespit ediliyor
- Self-dependency tespit ediliyor
- Bagimsiz task'lar false positive yok
- 10+ task performans testi
- 10+ test

---

## Gorev 26: Pattern Learning Gelistirme
- Dosya: src/monitor/auditor.ts, tests/monitor/auditor-patterns.test.ts (yeni)
- Kapsam: src/monitor/, tests/monitor/

### Aciklama
Auditor pattern detection'in iyilestirilmesi. Mevcut: sinir ihlali pattern'lari. Yeni: 1) Tekrarlanan NO_GO pattern'lari (ayni dosya/dizin 3+ kez NO_GO), 2) Model basarisizlik pattern'lari (haiku ile yapilan gorev surekli NO_GO), 3) Sure pattern'lari (belirli tip gorevler surekli timeout). Brain planlama sirasinda bu pattern'lari okuyor ve model/effort ayarliyor. 10+ test.

### Test
- Tekrarlanan NO_GO pattern tespit ediliyor
- Model basarisizlik pattern tespit ediliyor
- Brain pattern'lari planlamada kullaniyor
- 10+ test

---

## Gorev 27: Doc Updater — Sprint Metrikleri
- Dosya: src/orchestra/doc-updaters/metrics-updater.ts (yeni), tests/orchestra/doc-updaters/metrics-updater.test.ts (yeni)
- Kapsam: src/orchestra/doc-updaters/, tests/orchestra/doc-updaters/

### Aciklama
README.md'deki metrikleri otomatik guncelleyen updater. Sprint sonrasi: test sayisi, coverage, sprint sayisi, toplam gorev, basari orani. Mevcut readmeMetricsUpdater'i genislet: usage tracking verileri de eklensin. 10+ test.

### Test
- README.md metrikleri guncelleniyor
- Usage verileri ekleniyor
- README yoksa atlanir
- 10+ test

---

## Gorev 28: Config Validation Guclendir
- Dosya: src/core/config.ts, tests/core/config-validation.test.ts (yeni)
- Kapsam: src/core/, tests/core/

### Aciklama
validateConfig fonksiyonunu guclendirme. Ek dogrulamalar: 1) Provider gecerliligi (kayitli provider mi?), 2) spawn_backend gecerliligi (tmux/subprocess/sandbox), 3) usage_tracker ayarlari, 4) Credential path gecerliligi (API mode'da). Hata mesajlari kullanici dostu ve cozum onerili. 10+ test.

### Test
- Gecersiz provider hatasi aciklayici
- Gecersiz backend hatasi cozum onerili
- API mode'da credential kontrol
- 10+ test

---

## Gorev 29: Integration Test — Provider Flow
- Dosya: tests/integration/provider-flow.test.ts (yeni)
- Kapsam: tests/integration/

### Aciklama
Provider abstraction uctan uca entegrasyon testi. Senaryo: 1) ClaudeAdapter kaydet, 2) SpawnBackendFactory ile backend olustur, 3) Mock sprint plan, 4) Worker spawn (mock), 5) Result yaz, 6) Evaluate. Tum katmanlar birlikte calisiyor mu? 15+ test.

### Test
- Provider → SpawnBackend → Brain akisi calisiyor
- Claude adapter dogru komut olusturuyor
- Subprocess backend dogru process baslatiyor
- Fallback dogru calisiyor
- 15+ test

---

## Gorev 30: Integration Test — Zero-Config → Sprint → Rollback
- Dosya: tests/integration/zero-config-flow.test.ts (yeni)
- Kapsam: tests/integration/

### Aciklama
Zero-config modundan sprint'e, sprint'ten rollback'e uctan uca test. Senaryo: 1) `deckent start "Fix all TypeScript errors"` cagir, 2) Gecici DIRECTIVES olusturuluyor, 3) Plan yapiliyor, 4) Safety point olusturuluyor, 5) Worker mock calisiyor, 6) Tum NO_GO → rollback tetikleniyor, 7) Git durumu geri donuyor. 15+ test.

### Test
- Tek satirlik girdi → DIRECTIVES → plan → spawn akisi
- Safety point dogru olusturuluyor
- Tum NO_GO durumunda rollback calisiyor
- Temizlik dogru yapiliyor
- 15+ test

---

## Kalite Kurallari
- tsc --noEmit MUST pass
- npx vitest run MUST pass — mevcut 3442 test 0 regresyon
- Tum gorevler opus model, effort high
- Her gorev bagimsiz, paralel calisabilir (max 8 worker)
- Provider abstraction geriye uyumlu — mevcut tmux akisi bozulmamali
- Yeni dosyalar src/ ve tests/ altinda olmali
