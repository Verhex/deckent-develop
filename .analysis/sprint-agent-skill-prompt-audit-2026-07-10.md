# Sprint Agent/Skill/Prompt Katalog Denetimi — 2026-07-10

> Kapsam: (A) canlı sprint-391 `.tasks/` task-JSON + worker-prompt + spawn-script + result zinciri ·
> (B) `.deckent/agents/` 20 agent tanımı · (C) `.deckent/skills/` 29+1 skill tanımı ·
> (D) kod↔disk kontratı (agent-pool/skill-pool/routing-engine/task-builder/sprint-finalizer).
> Yöntem: 4 paralel derin-okuma ajanı + elle cross-check; tüm iddialar dosya:satır kanıtlı.
> Not: sprint-391 analiz sırasında kendi CLEANUP'ını koştu; prompt/task dosyaları artık
> `.deckent/recently-works/sprint-391-pre-archive.tar.gz` içinde. Spawn script'ler diskte duruyor.

---

## 0. Yönetici özeti

**İçerik kalitesi yüksek, mekanizma hijyeni düşük.** Sprint-391'in task-JSON'ları (RCA-kanıtlı
description, spesifik goCriteria/nogo/Kanıt) ve worker'ların plan→result sadakati (9/9 DONE,
nogo'lara birebir uyum, disk-verify kanıtlı notes) örnek düzeyde. Buna karşılık **seçim/aktivasyon
katmanı büyük ölçüde çürümüş**: activation kurallarının çoğu kelime-uyuşmazlığı yüzünden hiç
ateşlenemiyor, manifest alanlarının yarıdan fazlası runtime'da okunmuyor (dekoy), istatistik
alanları bozuk veriyle dolu ve bu çöp öğrenme/rating döngüsüne geri besleniyor. Canlı sprintte
9/9 task'ın `overrideWarnings` taşıması bu çürümenin doğrudan semptomu.

**5 sistemik kök-neden:**
1. **Domain-vocabulary uyuşmazlığı** — `detectDomains` yol-segmenti üretir (`orchestra, core, cli,
   dashboard…`); agent/skill kuralları hayal-vocabulary kullanır (`orchestration, database,
   frontend, terminal-ui, accessibility…`). Tek kök-neden, en yüksek kaldıraç: 6 agent + ~17 skill
   kuralı ölü. En acı örnek: sh-portability `orchestration` ≠ dizin adı `orchestra`.
2. **Şema hijyeni yok** — tek gerçek skorlama girdisi olan `activation` HİÇ validate edilmiyor;
   bozuk JSON sessizce pool'dan düşüyor; ölü/dekoy alanlar (allowedTools, preferredModel,
   effortMultiplier, minScore, promptInjection.*, entrypoint…) el-düzenlemeyi etkisiz kılıyor.
3. **Intent taksonomisi eksik** — test-fix task'ları `implementation` sınıflanıyor (`testing`
   değil); test-writer'ın sprint-148 arşivinden beri `testing` intent'i SAHİPSİZ; evolved-rules
   ci-guardian/bug-fixer'ı implementation'dan dışlamış → forceAgent her seferinde kendi
   kurallarıyla çelişiyor → 9/9 warning.
4. **Öğrenme döngüsü kirli veri yiyor** — api-design "hayalet skill" (içerik yok, 12 kullanım/%100
   başarı); avgCoverage agent'larda phantom-zero-dilution bug'ıyla anlamsız (~3/100),
   skill'lerde hiç yazılmıyor (0); `filterSkillPromptsByDNA` seçilen skill'i prompt'tan sessiz
   düşürüp yine de stat kredisi yazıyor. Kapalı outcome→routing→promotion döngüsü (korunan moat)
   girişten zehirleniyor.
5. **Prompt ekonomisi** — prompt'un %90-94'ü boilerplate; 002-009'da 19.9KB birebir aynı prefix,
   worker-CLI cache paylaşımsız (ampirik) → 9× ödendi; sprint maliyeti $8.79 / ~76 net satır.

---

## A. Canlı sprint-391 (.tasks) — birincil kapsam

### A1. Task-JSON kalitesi: A− (içerik) / C (şema tutarlılığı)
**Güçlü:** DIRECTIVES→task birebir kayıpsız aktarım; her task'ta RCA-kanıtlı description (commit
SHA + dosya:satır), task-spesifik goCriteria, açık nogo listesi, çalıştırılabilir Kanıt komutu;
DISTINCT-FILE paralellik disiplini; task-1 TEK-YAZAR kuralı.

**Sorunlar:**
- **9/9 `overrideWarnings`** — ×8 "forceAgent 'ci-guardian' is excluded by its own activation
  rules (intent=implementation)", ×1 "bug-fixer activation score=0 < threshold 1.50". Uyarı
  üretiliyor ama hiçbir yerde yükseltilmiyor (plan-review'da görünmüyor).
- **goNogo merge artefaktları** — jenerik prefix + directive metni + Kanıt satırı `;` ile
  yapıştırılıyor → `".;"` çift-noktalama; "eylem-yasağı" (src'ye dokunma) ile "sonuç-kriteri"
  (build fails) tek string'de karışıyor; DoD rubrikte çifte sayım ("npx tsc succeeds" + "tsc
  temiz"; targeted-tests 2×) — worker 001 notes'ta "(dup)" diye işaretledi.
- **`priority` alanı ölü sinyal** — başlıklar P1/P2, alan 9/9 `NORMAL`.
- **`effort` alanı ölü** — JSON 9/9 `normal`, prompt "Effort: high" (001) / "low" (002):
  `resolveWorkerEffort` (task-builder.ts:1346) task.effort'u tamamen yok sayıp complexity-score
  türetiyor; tek-satır fix'e "high" çıkması mapping'in de şüpheli olduğunu gösteriyor.
- **Şema drift** — task-009 (PENDING yakalandı) `provider`/`estimatedTokens` alansız; alanlar
  spawn anında ekleniyor → task-JSON şeması lifecycle'a göre değişiyor.
- **taskDNA gürültüsü** — keyword-türevi false-positive'ler: 001'de secondary=security ("ADR"
  kelimesinden), subIntent=config; 002'de operations delete/rename (mock davranış tarifinden).

### A2. Worker-prompt anatomisi (9 × ~29KB)
Bölüm sırası (9/9 aynı): Skills → Agent → ADR → header → Your Task → DoD → What To Do →
CRITICAL VERIFY → Dependency-Advisory → Scope Rules → Heartbeat → Result → Karpathy.

- **Task-spesifik pay: %5-10.3.** 001: Skills 9.4KB (%32) + Agent 5.7KB (%19) + ADR 3.3KB (%11);
  002-009: 19.9KB prefix (skills 10.9K + agent 5.8K + ADR 3.1K) **MD5 ile birebir aynı**.
- **Full injection byte-exact KANITLI** (truncation yok — SKILL.md/PROMPT.md byte toplamları
  birebir tutuyor). `feedback_prompt_completeness_over_brevity` kuralına uyumlu. ✅
- **`agent.json systemPrompt` HİÇ enjekte edilmiyor** — spawn yolunda (task-builder/tmux/
  spawn-backend-docker/brain) sıfır referans; `.claude/rules/brain.md` "PROMPT.md + systemPrompt"
  kontratına aykırı. PROMPT.md'siz temp agent'larda systemPrompt fallback'i var
  (agent-pool.ts:919) ama normal yolda alan ölü.
- **ADR seçimi zayıf + çifte-statü** — adr-d-004 (Layer-1 import kontratı, 2.4KB full body)
  8 test-only task'a enjekte (scope'ta actionable değil); aynı ADR hem BINDING full-body hem
  `[background constraint …]` ADVISORY trailer taşıyor — ironik biçimde bu "ADVISORY CONTEXT"
  başlığı, 391-001'in fixlediği G5 X-count leak'in ta kendisi.
- **Tekrar** — Karpathy 3× (2 skill + ayrı bölüm); verify talimatı 4×; goCriteria 3×;
  ci-testing SKILL ↔ ci-guardian PROMPT.md near-verbatim tablo tekrarı (her 002-009 prompt'unda 2×).

### A3. Çelişki yönetimi: kısmen çözülmüş
- **Persona-vs-task**: bug-fixer "tüm testler geçsin/full-suite", ci-guardian "coverage düşmesin"
  derken task "yalnız hedefli test" diyor → **Verify-precedence paragrafı** bunu açıkça nötralize
  ediyor ve 9/9 worker uydu. ✅ İyi tasarım.
- **Nötralize EDİLMEYEN**: ci-guardian'ın dosya-çıktıları (`.deckent/ci-baseline.json`,
  `.brain/ci-report-*.json`, RETRO.md bölümü) scope dışı; Result-precedence yalnız rapor
  *formatını* iptal ediyor, dosya çıktılarını değil. Hiçbir worker yazmadı ama bu kontrata değil
  model sağduyusuna dayanıyor.
- **Dil**: TR task metni + EN boilerplate; sonuç/notes dili hiçbir yerde belirtilmemiş — 9/9
  worker EN yazdı (yazısız konvansiyon).

### A4. Output contract vs gerçek result'lar
- 9/9 result mevcut, 9/9 `selfAssessment: "DONE"`, brain rubric 100.
- **`testsPassed` drift 2/9** — 005/008 string ("12/12 … 0 fail"), diğer 7 boolean `true`.
  Prompt'un strict "Field shapes" listesi tam da bu alanı atlamış → canlı drift kanıtı.
  (project_worker_output_contract_wiring Step-3 strict TaskResultV1 ihtiyacını doğrular.)
- tokenUsage/cost pipeline'ı çalışıyor (`source: provider-adapter`, cost-config fiyatlama). ✅

### A5. Spawn script'ler (.worker-391-00N.sh)
- Model `claude-sonnet-5` canlı-ID (stale yok) ve forceModel'i doğru uyguluyor (bug-fixer'ın
  opus tercihini forceModel eziyor — preferredModel zaten ölü alan). ✅
- `--allowedTools "Read,Write(.tasks/,<files>),Edit(...),Bash,Glob,Grep" --dangerously-skip-permissions`
  — Write/Edit tool-level scope task-JSON'la birebir ✅; ama **Bash sınırsız** → scope aşılabilir
  (ADR-037 advisory-soft ile tutarlı, fakat Scope Rules bunu açıkça söylemiyor).
- agent.json allowedTools/deniedTools spawn'da hiç okunmuyor (superset veriliyor).
- **Heartbeat çifte-yazar** — wrapper `docker-391-00N` / prompt `w-391-00N` + currentAction;
  wrapper 15sn'de bir ezip currentAction'ı siliyor.
- Timeout default 23.9h (trivial task'a bile); `#!/bin/sh` içinde `local` (POSIX değil, Yasa #2 nit).
- Failure-synthesis (EXIT_WITHOUT_RESULT + git-diff workPresent, TIMEOUT_WITH_WORK, fsync) sağlam. ✅

### A6. Maliyet
$8.79 / 9 task / ~76 net satır değişiklik. cacheRead 0.7M-4.1M token/worker; 19.9KB özdeş prefix
9× cache-creation olarak ödendi (worker-CLI'lar arası prompt-cache paylaşımı YOK — ampirik bulgu,
`project_worker_prompt_cache_finding`). Bloat her agentic turn'de yeniden okunuyor.

---

## B. Agent tanımları (.deckent/agents/ — 19 canlı + 3 arşiv)

- **Şema**: manifestVersion 2 tutarlı ✅; ci-guardian'da tekil `"type"`, integration/terminal-ux'ta
  `role`/`domain` (dokümante-değil ama routing'de CANLI alan!), promotion-pipeline'ın `_demotedAt/
  _promotedAt` kirliliği.
- **Ölü activation kuralları (6 agent)**: accessibility-auditor (tek kuralı `accessibility` —
  agent tamamen erişilemez, 0 kullanım), data-engineer (tek kuralı `database` — ölü; prompt'u da
  Prisma/Postgres odaklı, ADR-G-035 better-sqlite yönüne kör), architecture-planner
  (`architecture`), frontend-designer (`frontend` — gerçek emisyon `dashboard` ve onu KİMSE
  claim etmiyor), devops-engineer (`infrastructure`), integration-engineer (`messaging`,
  `integrations` ölü; yalnız `connectors` canlı).
- **architect canlı-drift**: seed'de olmayan `implementation→6` kuralı diskte — Write-yasaklı
  danışman agent her kod task'ına opus×1.5 ile talip (350 kullanım, 4. en-çok-kullanılan!).
  Kaynak: finalizer'ın in-memory `applyBuiltinImplementationRules` enjeksiyonunu `saveAgent` ile
  diske sızdırması (agent-pool.ts:151-172 → sprint-finalizer 8d2).
- **Zombi temp'ler**: temp-react-specialist + temp-react-ts-specialist canlıda enabled, arşivde
  birebir kopyaları var; PROMPT.md yok, 0 kullanım, `implementation→6` ile her impl task'ına bid.
- **Sahipsiz `testing` intent** — test-writer sprint-148'de arşivlendi; 3 agent testing'i
  explicit exclude ediyor; rubricScores kontrat-metni de arşivle kayboldu.
- **devops 10↔10 tie**: ci-guardian ↔ devops-engineer aynı intent'e aynı skor.
- **Secondary-intent asimetrisi**: `floor(8×0.5)=4 < minScore 5` → tek-kural-8 agent'lar
  (api-builder, code-reviewer, architect-design) secondary intent'ten ASLA ateşlenemez, 10'lar
  ateşlenir.
- **Nonexistent scope/pattern'ler** (12+): `src/components/`, `src/routes/`, `prisma/`,
  `docker/`… — gerçek modüller (`src/orchestra/`, `src/mcp/`, `src/providers/`) çoğunlukla
  sahipsiz. `src/` scope'unu 8 agent claim ediyor (sıfır ayırt-edicilik).
- **Builtin sync gap**: `src/core/builtins/agents/` içindeki `i18n-specialist` (!), `api-designer`,
  `observability-engineer` hiç canlıya inmemiş — i18n-FIRST yasa-düzeyi kuralken.
- **avgCoverage bozuk**: api-builder 2.9956/100 (375 kullanım) — phantom-zero-dilution;
  marketplace rating-system bu çöpü 0.3 ağırlıkla tüketiyor.
- **PROMPT.md kalitesi**: terminal-ux-engineer/integration-engineer A (proje-spesifik, doğrulanmış
  path'ler) ↔ architecture-planner C (24 satır) ↔ temp'ler F (yok). frontend-designer bağlayıcı
  "dashboard emoji YASAK / lucide-react" kuralını bilmiyor. doc-writer (595 kullanım, en yoğun)
  sonnet'te — haiku-yalnız-doc politikasının meşru tek adayı, maliyet fırsatı.

---

## C. Skill tanımları (.deckent/skills/ — 29 manifest + 1 çöp dizin)

- **api-design = hayalet skill**: manifest sentetik-stub (boş rules/triggers/description),
  SKILL.md YOK → içerik hiç enjekte edilmedi; buna rağmen stats 12 kullanım/%100 başarı —
  öğrenme döngüsüne sahte sinyal. Builtins'te tam tersi: SKILL.md var, manifest yok (split-brain).
- **i18n-quality + observability erişilemez**: builtin-only SKILL.md → sentetik inert activation
  + skill-cache yalnız `.deckent/skills/` okur → içerik ulaşılamaz. i18n-FIRST yasası ihlal
  görünümü.
- **secure-coding malformed**: 7 alan eksik (entrypoint/category/triggers/stackDetection/…);
  skill-pool.ts:230 yorumu bunun routing-engine crash'i olduğunu ZATEN biliyor.
- **Domain kuralları ölü (~17 skill)** — §0 kök-neden 1. En acı: sh-portability `orchestration`
  ≠ `orchestra` (tek kelime, tek kural, ölü).
- **İki-katman kalite ayrışması**: 7 proje-doğumlu A-tier skill (ink-tui, file-watch-hygiene,
  sh-portability, provider-cli-matrix, rpc-protocol, onboarding-ux, secure-coding) en iyi içerik
  ama 0-5 kullanım (priority 6-7, composition-orphan, ölü kurallar) ↔ 21 jenerik B-tier skill
  trafiği alıyor (typescript-expert tek başına ~%48).
- **Near-name agent↔skill çiftleri dedup'tan kaçıyor**: doc-writer↔documentation-writer,
  frontend-designer↔frontend-design, security-auditor↔security-specialist,
  ci-guardian↔ci-testing — god-template yalnız BİREBİR isim eşleşmesini dedup ediyor → ~%40
  örtüşen içerik çift enjekte (sprint-391'de canlı gözlendi: ci-guardian + ci-testing).
- **stats**: avgCoverage 29/29'da 0 (finalizer skill döngüsü alanı hiç yazmıyor); ci-testing +
  system-architect'te `avgScore` key-drift (NaN riski, skill-pool.ts:356).
- **stackDetection false-negative**: anthropic-sdk (dep'ler package.json'da yok), frontend-design
  (Tailwind v4 config-less), api-builder (framework dep yok), database-migration (better-sqlite3'ü
  HİÇBİR skill bilmiyor — ADR-G-035'e kör).
- **`.deckent/skills/docs/` = yanlış-yer veri**: 52 dosyalık ÖZEL memory snapshot'ı, git-tracked —
  skills namespace'inde işi yok + temiz-repo/training-data kontaminasyon riski
  (project_clean_repo_migration_and_training_data).
- **Eksik skill'ler (dogfood lens)**: better-sqlite3/FTS5/WAL, MCP-protocol, grammY/Telegram,
  vitest-hermeticity (16GB cap / VITEST_MAX_FORKS=2 hiçbir skill'de yok).

---

## D. Kod↔disk kontratı

**Ölü/dekoy alanlar (el-düzenleme ETKİSİZ):**
| Alan | Durum |
|---|---|
| agent `allowedTools` | ölü — spawn allowlist scope-türevi |
| agent `deniedTools` | yalnız plan-time prompt-gate Write-lint (runtime enforce yok) |
| agent `preferredModel`, `effortMultiplier` | ölü — model=planner/forceModel, effort=complexity-türevi |
| agent `expertise`, `persistent` | ölü / yanlış-kullanım (persistent≠builtin, agent-list.ts:29) |
| agent+skill `activation.minScore` | ölü — global agent_min_score=5 / skillMinScore=3 |
| skill `promptInjection.position/maxTokens` | ölü (Sprint 182 PQ-2 truncation kaldırıldı — DOĞRU; alan dekoy ve truncation'ı geri davet ediyor) |
| skill `entrypoint` | ölü — SKILL.md hardcoded ×2 |
| skill `stackDetection.commands`, `autoActivate`, `model` | ölü |
| `manifestVersion` | anlamsız — V1/V2'yi `activation` varlığı belirliyor |
| triggerKeywords/Scopes/FilePatterns | dormant — yalnız activation'sız manifest'te V1-migrate fallback |

**Kontrat bug'ları:**
- `activation` hiç validate edilmiyor; malformed JSON/manifest **sessiz** pool-drop (kullanıcıya
  sinyal yok); `.deckent/` yolunda stackDetection-eksik manifest routing'i crash'ler.
- `filterSkillPromptsByDNA` (task-builder.ts:1578) route-edilmiş skill'i prompt'tan sessiz
  düşürebiliyor, stat kredisi yine yazılıyor → phantom credit + full-injection ruhuna aykırı.
- avgCoverage: agent'larda phantom-zero-dilution blend bug'ı (sprint-finalizer.ts:1293-1298),
  skill'lerde hiç yazılmıyor; tasarlanan `updateAgentStats/updateSkillStats` API'lerinin sıfır
  production çağrısı var.
- MCP `deckent_sync` açıklaması "agent/skill manifest sync" vaat ediyor; kod yalnız CLAUDE.md
  import-satırı bakımı yapıyor (mcp/server.ts:38 ↔ mcp/tools/sync.ts) — kontrat yalanı.
- Finalizer, in-memory rule enjeksiyonlarını `saveAgent` round-trip'iyle diske sızdırıyor
  (architect drift'inin kaynağı).
- Legacy `selectAgent`/`selectSkills`/`suggestNewAgent` production-ölü; skill-selector'ın
  stackDetection.files karşılaştırması zaten anlamsız (`'tsconfig.json'==='typescript'`).
- ADR-075 affinity: mekanizma wired ama default-off + observability sink'i in-memory/debugLog-only
  → "balance gate" kanıt biriktiremiyor (memory'deki "dead-code" şüphesi pratikte doğru).
- haiku-yalnız-doc politikası yalnız planner prose'unda — kodda guard yok.
- agent `domain`/`role` alanları routing'de CANLI ama dokümante şemada yok; skill `source` TS
  tipinde bile yok.

---

## E. Önceliklendirilmiş iyileştirme planı

### P0 — veri bütünlüğü + sessiz bozulmalar (önce bunlar; çoğu küçük, kaldıracı büyük)
1. **Domain-alias katmanı + lint**: `detectDomains` emisyon-vocabulary'siyle kural-vocabulary'sini
   buluşturan alias map (db→database, dashboard→frontend, orchestra→orchestration, …) VEYA tüm
   kuralları gerçek segment-vocabulary'ye çevir; her kuralın domain'ini gözlenen segment-setine
   karşı doğrulayan lint (doctor'a ekle). — B+C'deki ~23 ölü kuralı tek hamlede diriltir.
2. **Activation validation + loud-skip**: validateAgent/SkillDefinition'a activation şeması;
   malformed JSON/manifest'te sessiz drop yerine görünür uyarı (doctor + plan-log).
3. **avgCoverage onarımı**: finalizer blend bug'ı fix + skill döngüsüne yazım + `avgScore`→
   `avgCoverage` migrasyonu (NaN guard); rating-system girdisini temizle; mevcut değerleri resetle.
4. **api-design hayaletini kapat**: builtins SKILL.md'yi materialize et + gerçek manifest yaz
   (veya api-builder'a birleştir); stats'ı sıfırla. i18n-quality + observability'yi de
   `.deckent/skills/`e indir (i18n-FIRST!). secure-coding manifest'ini tamamla.
5. **`filterSkillPromptsByDNA`yı kaldır veya logla**: seçim-sonrası sessiz drop yok — ya seçimde
   düşür (stat de yazma) ya enjekte et.
6. **`testsPassed` strict şeması**: prompt Field-shapes listesine `boolean` olarak ekle + parser
   normalize (TaskResultV1 Step-3 ile birlikte).
7. **`.deckent/skills/docs/` taşı/sil**: 52 özel memory dosyası git'ten ve skills namespace'inden
   çıkar (temiz-repo flip öncesi kontaminasyon riski).

### P1 — routing kalitesi (sprint-391 semptomlarının kökleri)
8. **`testing` intent'ine sahip çıkın**: intent-classifier'a test-fix sınıfı (testWriteRatio=1 →
   testing) + ci-guardian'a `testing→10` kuralı (veya test-writer'ı geri getir) + rubricScores
   kontrat-metnini geri taşı. 9/9 overrideWarning gürültüsü kökten kesilir.
9. **Override-warning'leri yükselt**: plan-review'da high-severity uyarı görünür olsun (Brain
   değerlendirmesine girsin) — "router kendi seçimini reddediyor" durumu sessiz kalmasın.
10. **architect drift'ini sil + finalizer sızıntısını kapat**: canlı agent.json'dan
    `implementation→6` kuralını kaldır; saveAgent'ın in-memory enjeksiyonları persist etmesini
    engelle (yalnız stats yaz).
11. **Zombi temp'leri disable/sil** (arşiv kopyaları zaten var); devops 10↔10 tie'ını ayrıştır;
    secondary-intent floor asimetrisini (8-vs-10) belgele veya normalize et.
12. **A-tier proje-doğumlu skill'leri yönlendirmeye bağla**: priority ≥8 + curated map girişleri
    (cli→ink-tui, providers→provider-cli-matrix, mcp/api→rpc-protocol, core→file-watch-hygiene) +
    hub'lardan composableWith kenarları.
13. **Near-name dedup alias tablosu** (prompt-god-template collision check'ine):
    doc-writer↔documentation-writer, frontend-designer↔frontend-design,
    security-auditor↔security-specialist, ci-guardian↔ci-testing.

### P2 — ekonomi + şema hijyeni
14. **ADR seçimini scope'a filtrele**: tests-only yazım scope'u → full-body yerine stub; çifte-statü
    render'ını (full body + background trailer aynı anda) XOR yap.
15. **Task-type prompt profilleri** — truncation DEĞİL, *seçim* iyileştirme: test-only profilde
    ci-guardian sprint-persona yerine dar test-fix persona; alakasız skill seçilmesin (full-inject
    kuralı korunur, seçilen az-ama-isabetli olur). Kazanç ~8-10KB/prompt × 9.
16. **systemPrompt kararı**: ya agent-bloğu preamble'ı olarak enjekte et (brain.md kontratı) ya
    alanı manifest'lerden kaldır — dekoy bırakma. Aynı karar tüm ölü alanlar için: kaldır veya
    "inert/advisory" diye şemada işaretle (özellikle promptInjection.maxTokens — truncation'ı
    geri davet ediyor).
17. **doc-writer'ı haiku'ya indir** (595 kullanım, doc-only — politikanın meşru adayı).
18. **Heartbeat tek-yazar**: kanonik workerId + wrapper merge-preserve (currentAction ezilmesin).
19. **Timeout sizing**: estimatedSize→TASK_TIMEOUT eşlemesi (trivial'a 23.9h değil).
20. **deckent_sync açıklamasını düzelt** (veya gerçek manifest-sync yaz); goNogo merge'üne
    noktalama-normalize + kriter-dedupe; result/notes diline açık direktif (EN standardize).

---

## F. Korunacak güçlü yanlar (bozma)
- Byte-exact full injection (Sprint 182 PQ-2) — 391-001'in test-ettiği özelliğin ta kendisi.
- Verify-precedence / Result-precedence paragrafları — persona-çelişkilerini 9/9 çözdü.
- Boilerplate sıfır-drift (9 prompt MD5-özdeş prefix) + cache-optimal bölüm sırası.
- Spawn wrapper failure-synthesis (EXIT_WITHOUT_RESULT/TIMEOUT_WITH_WORK + workPresent).
- Task-JSON içerik standardı (RCA + goCriteria + nogo + Kanıt) ve 9/9 plan→result sadakati.
- tokenUsage/cost provider-adapter zinciri.

---
*Kaynak: 4 paralel denetim ajanı (agents/skills/kontrat/canlı-prompt) + elle doğrulama.
Sprint-391 arşivi: `.deckent/recently-works/sprint-391-pre-archive.tar.gz`.*
