# Doc Audit: Config / Contract / Rules — Audit Raporu (Sprint 171)

> **Kapsam:** `.claude/rules/**`, `.gemini/rules/**`, `.cursor/rules/**`, `.contracts/api-surface.md`, `CLAUDE.md`, `DECKENT.md`, `.deckent/workspace/IDENTITY.md`, `.deckent/workspace/BOOT.md`
>
> **Audit-only:** Hiçbir kaynak/test/config dosyası değiştirilmedi. Sadece bu rapor yazıldı. memory.db dahil hiçbir veri tabanına yazma yapılmadı.
>
> **Tarih:** 2026-05-15 · **Hedef okur:** deckent'i tanımayan mühendis. Bu raporu okuyup aksiyona geçebilmelidir.

---

## 1. Bulgular (Findings)

Bu audit'in en kritik amacı **kod gerçeği ile doküman doğruluğunu** çapraz doğrulamaktır. Bu dosyalar `@CLAUDE.md`, `@DECKENT.md` ve sprint başı `paths` frontmatter'ı üzerinden Brain/Auditor/Worker'ların prompt'larına otomatik enjekte edilir. Bir drift = sprint sırasında worker'ı yanıltır, spurious NO_GO veya yanlış mimari kararla sonuçlanır. Bulgular en yüksek riskten en düşüğe sıralandı.

### 1.1 CRITICAL — Mimari modül sayımı CLAUDE.md'de %25'e varan eksik bildirim

`CLAUDE.md` "Architecture" bölümündeki modül sayıları gerçek kaynak ağacına göre toplu olarak az bildirildi. Worker'a "küçük modül" algısı verir, refactor önerirken yanlış skaledan tasarım yapar.

- `CLAUDE.md:11` → `orchestra/ ... (76 modules)`; **gerçek** `find src/orchestra -type f` = **95** dosya. Sapma **+19** (%25).
- `CLAUDE.md:30` → `core/ ... (94 modules)`; **gerçek** `find src/core -type f` = **101** dosya. Sapma **+7**.
- `CLAUDE.md:50` → `agents/ ... (20 modules)`; **gerçek** = **20**. MATCH.
- `CLAUDE.md:57` → `api/ ... (3 modules)`; **gerçek** = **4**. Sapma **+1**.
- `CLAUDE.md:56` → `providers/ ... (5 modules)`; **gerçek** = **5**. MATCH.
- `CLAUDE.md:58` → `mcp/ ... 27 tools + 8 resources`; **gerçek** `server.registerTool` çağrı sayısı = **31 tool**, `server.registerResource` = **8 resource**. Tool sayımında **+4** drift.

### 1.2 CRITICAL — MCP Tool listesi DECKENT.md'de eski (22 vs gerçek 31)

`DECKENT.md:30` ve `DECKENT.md:173-194` tablosu **22 tool** sayıyor (`deckent_init` ... `deckent_memory_query`). Kod registry'sinde **31 registerTool() çağrısı** mevcut; 9 yeni tool listenin DIŞINDA:

- `deckent_audit` (`src/mcp/tools/audit.ts:9`)
- `deckent_watch` (`src/mcp/tools/watch.ts:23`)
- `deckent_recover` (`src/mcp/tools/recover.ts:15`)
- `deckent_feature_query` (`src/mcp/tools/feature-query.ts:43`)
- `deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_status`, `deckent_nervous_config` (`src/mcp/tools/nervous.ts:55, 85, 136, 180, 234` — ADR-040 Nervous System dispatch toolları)

Ayrıca aynı tools `src/mcp/tools/help.ts:49-70` içindeki **canonical liste** ile de eksik — `help.ts` 22 tool listeliyor. Yani `deckent_help` runtime'da kullanıcıya YANLIŞ kapasite raporu döndürüyor. CLI/MCP feature parity (ADR-022-v2) iddiası ile çelişir.

### 1.3 CRITICAL — Tool sayımı çoklu dosyada iç çelişki (22 ↔ 27 ↔ 31)

Aynı projede 3 farklı sayı dolaşıyor:

- `DECKENT.md:30` → **22 tools**
- `CLAUDE.md:58` → **27 tools + 8 resources, stdio transport**
- `IDENTITY.md:14` → `MCP: 27 tools, 8 resources` ve `IDENTITY.md:25` Project Status tablosu `MCP Tools | 27`
- **Kod gerçeği** (`server.registerTool` çağrıları, `src/mcp/tools/**`) → **31**

Bu üç değerin hiçbiri doğru değil. Her ortamda farklı bir yanıltma. Hangi sayıyı görürse worker o sayıyla planlama yapar.

### 1.4 CRITICAL — CLAUDE.md "Sprint Metrics" tablosu bozuk + stale

`CLAUDE.md:93-102`:

```
| Sprint        | sprint-167 |
| Total Tasks   | 10         |
| Completed     | 9          |
| Tech Debt     | 2          |
| No-Go         | 1          |
| Duration      | -1dk -1sn  |
| Coverage      | NaN%       |
```

Üç ayrı kusur:

1. **Sprint adı 4 sprint stale.** `DIRECTIVES.md:1` "Sprint 171: Self-Audit Mega-Sprint", `.deckent/config.json:6` → `"last_sprint_id": "sprint-171"`. CLAUDE.md "sprint-167" tablosu DIRECTIVES referansıyla çelişir.
2. **`Duration | -1dk -1sn`** — negatif süre formatlama hatası. `sprint-reporter.ts` veya managed-docs renderer'da hesaplamayan/min başlangıç-bitiş zamanları işliyor.
3. **`Coverage | NaN%`** — `Number` cast hatası. Coverage hesabı bölünme by zero veya null değer.

Hem display hatası hem stale data → bu tablo CLAUDE.md'nin auto-update edilmediği anlamına gelir. Sprint 167 sonrası managed-docs hook'u kırılmış olabilir. Ek olarak ADR-046 "Brain Self-Update Hook Architecture" iddiasıyla çelişir.

### 1.5 CRITICAL — IDENTITY.md çoklu metrik stale

`IDENTITY.md` Sprint 138-166 dönüşümlerinde donmuş kalmış; runtime gerçeği farklı:

- `IDENTITY.md:9` → `Tests: 12,485 pass + 16 skipped (505 files)`. Gerçek test dosyası sayısı `find tests src -name '*.test.ts'` = **808 dosya**. Plan dosyası (`docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md`) Test Integrity Audit baseline'ı **`pass ≥16475 + fail ≤2 + skip ≤41`** olarak belirtir. IDENTITY rakamı (12.485) ~Sprint 138 dönemi; **+303 dosya, +4000 pass eksik**.
- `IDENTITY.md:12` → `Sprints: 166+ (Sprint 166 ...)`. Gerçek Sprint 171.
- `IDENTITY.md:14` → `MCP: 27 tools, 8 resources` (gerçek 31/8 — bkz. §1.3).
- `IDENTITY.md:24` Project Status `| Sprint | sprint-167 |`. Gerçek sprint-171.

`IDENTITY.md` `IDENTITY:DECKENT.md:3`'ten ve `CLAUDE.md:79-80`'den @-reference olarak yüklenir → tüm agent prompt'larına bu stale değerler enjekte oluyor.

### 1.6 CRITICAL — api-surface.md "model" enum'u 5 model eksik

`.contracts/api-surface.md:13` Task şemasında:

```json
"model": "opus | sonnet | haiku | gpt-5 | gpt-4.1 | gpt-5-mini | gemini-2.5-pro | gemini-2.5-flash"
```

— **8 model** listeliyor. Ancak `src/core/model-registry.ts` `id:` alanları:

```
opus, sonnet, haiku, o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini,
gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash
```

— **13 model**. api-surface'te eksik 5 model: `o3`, `o4-mini`, `gpt-4.1-mini`, `gemini-3.1-pro-preview`, `gemini-2.0-flash`. Bu modeller DECKENT.md "Parameter Reference" tablosu (`DECKENT.md:248-261`) ile de DOĞRU listelenmiş ama api-surface bunlardan habersiz. Sözleşme dosyası şema validasyonu (Zod) ile gate ediliyorsa **valid bir model** "şemada yok" diye reddedilir.

### 1.7 CRITICAL — Sprint Phase enum'u ile api-surface listesi divergence

`.contracts/api-surface.md:78-89` Sprint Phases listesi:

```
1. PLAN
2. SPAWN
2a. WAVE_BUILD — when dependency_pipeline_enabled: true ...
3. EXECUTE
4. EVALUATE
5. FIX
6. RETRO
7. DECAY
8. CLEANUP
```

`src/core/sprint-types.ts:7-18` `SprintPhase` enum gerçeği:

```
DIRECTIVE, PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, TRANSITION, COMPLETE
```

Drift kalemleri:

- **`DIRECTIVE`** kod'da var, api-surface'te yok.
- **`TRANSITION`** kod'da var, api-surface'te yok.
- **`CLEANUP`** api-surface'te var (faz 8), kod'da yok — kod karşılığı `COMPLETE`. Ad uyumsuzluğu.
- **`WAVE_BUILD`** api-surface 2a olarak listelenmiş; ancak kaynakta `grep -rn 'WAVE_BUILD\|WaveBuild' src/` → **0 hit**. SprintPhase enum'unda yok. Kahn topoloji çağrısı `src/orchestra/sprint-spawner.ts:299, 327, 472` SPAWN içinde gerçekleşir; "WAVE_BUILD" sadece api-surface'in dokümantasyon kurgusu.

Bu durum Sprint State Observability Contract (ADR-044) açısından önemli: dashboard veya nervous detector'lar phase string'i WAVE_BUILD beklerse asla görmez; CLEANUP arar ama enum COMPLETE yayınlar.

### 1.8 CRITICAL — `dependency_pipeline_enabled` ile ilgili 3 farklı iddia

- `src/core/config.ts:600`, `882-883`, `1399-1400` → **default `true`** (ADR-045).
- `git log -S "dependency_pipeline_enabled: true" -- src/core/config.ts` → ilk commit **`4d15196 feat(sprint-156)`** (api-surface'te "default since Sprint 156" iddiası DOĞRU).
- `DECKENT.md:51` → `Sprint 167 flip: dependency_pipeline_enabled: true — Wave scheduling goes live (anchor for Sprint 167 DIRECTIVES)`. **YANLIŞ** — gerçekte Sprint 156'da flip oldu, 11 sprint sapma.
- `.deckent/config.json:198` → projenin runtime override'ı **`"dependency_pipeline_enabled": false`** (DIRECTIVES.md "Sprint 167 flip" iddiasıyla ÇELİŞKİ; plan da bunu doğruluyor: "Wave geçişleri Brain manuel ADR-047" çünkü config FALSE).

Worker bu üç kaynaktan birini okur ve kendi behavior beklentisini yanlış kurar (paralel wave var sanır, oysa serial; veya tersine).

### 1.9 CRITICAL — BOOT.md kod bloğu bozuk + tüm dosya verbatim duplike

`.deckent/workspace/BOOT.md`'nin iki ayrı, ciddi format kusuru var:

1. **Yarım kod bloğu (lines 10-24).** Satır 10'dan başlayan `# Step 1: Kill active workers ...` bash komutları **açılan ` ```bash ` fence olmadan** başlar; satır 24'te bir **kapanış ` ``` `** belirir. Sonuç: GitHub/IDE render'da lines 10-23 düz markdown olarak görünür (komutlar yorum gibi); satır 24'teki yetim kapanış fence ardındaki satırları (lines 25+) belirsiz hale getirir.
2. **Tüm dosya verbatim ikileme.** `BOOT.md:36-67` ("## Manual Recovery Chain" + "## Sprint Stuck / Manual Recovery") tam olarak `BOOT.md:1-34`'ün kopyasıdır (5 step + MCP equivalent + Sprint 165 trailer). Aynı içerik iki kez prompt'a girer, kullanıcıya iki ayrı bölüm gibi görünür, yanıltıcı + token israfı.

### 1.10 CRITICAL — BOOT.md `deckent spawn --auto-approve` komutu invalid

`BOOT.md:23` (ve duplike `:55`) `# Step 5: Spawn remaining tasks (auto-approve)` altında `deckent spawn --auto-approve` örneği var. `src/cli/commands/spawn.ts:85` gerçek signature:

```ts
.command('spawn <taskId>')   // positional taskId ZORUNLU
.option('--auto-approve', ...)
```

Yani `deckent spawn --auto-approve` (taskId verilmeden) **commander.js tarafından "missing required argument 'taskId'" hatasıyla reddedilir**. Recovery rehberinin son adımı verbatim kullanıldığında BAŞARISIZ olur. Recovery chain pratik olarak yıkılmış.

Ek olarak `BOOT.md:31, 63` `deckent_run → { taskId: "166-NNN" }` örneği Sprint 166'ya işaret ediyor; gerçek Sprint 171. Stale örnek.

### 1.11 HIGH — `.cursor/rules/*` CUSTOM-START blokları BOŞ

3-ortam rule dosyalarının AUTO blokları içerik olarak fonksiyonel eş; AMA `.cursor` ortamı CUSTOM bloğu kaybetmiş:

- `.claude/rules/brain.md` 134 satır, `.gemini/rules/brain.md` 131 satır, `.cursor/rules/brain.md` **91 satır** (`wc -l`).
- `.cursor/rules/brain.md:90-91` → `<!-- CUSTOM-START -->\n<!-- CUSTOM-END -->` — **boş** custom block.
- Aynı şekilde `.cursor/rules/auditor.md:83-84` ve `.cursor/rules/worker-default.md:86-87` boş.
- `.claude/rules/brain.md:93-134` ve `.gemini/rules/brain.md:90-131` "CUSTOM" bloklarında AUTO içeriğinin verbatim kopyası mevcut (kasıtlı veya geçmiş regenerasyon artefaktı).

Sonuç: Cursor ortamında çalışan agent, custom rule overlay (örn. proje-spesifik kural genişletmesi) hiç görmez. Aynı kullanıcı 3 ortamda davranış parity beklerse Cursor'da farklı davranış alır.

`src/core/rule-generator.ts:110-121` `cursorAdapter` koduna göre cursor adapter intentionally `claude/gemini/codex` ile aynı ekosistem davranışına geçirilmiş (Sprint 168 C0a-2 yorumu), ama mevcut diskte sync ya hiç yapılmamış ya da temizlenmiş. Mevcut state OSS GA öncesi adapter parity iddiasını boşa çıkarır.

### 1.12 HIGH — Rule dosyalarında AUTO/CUSTOM verbatim duplikasyon (token israfı + drift riski)

`.claude/rules/brain.md` ve `.gemini/rules/brain.md` AUTO bloğu (lines 1-91) + CUSTOM bloğu (lines 93-134) **birebir aynı içeriği iki kez** taşıyor. Bu, rule-generator'ın "ilk yazımda existing-as-custom" davranışından (`src/core/rule-generator.ts:368-378`) doğmuş bir artefakt: ilk regenerasyonda mevcut tam dosya CUSTOM bloğuna alınmış, AUTO yeniden yazılmış → her iki blok aynı.

Etki:

- Prompt context payload 2× — `paths` frontmatter ile yüklendiğinde Worker'ın bağlam bütçesini ikiye katlıyor.
- AUTO bloğu yeni ADR ile güncellenirse CUSTOM bloğu stale olur (görünürde "iki versiyon" çelişiyormuş gibi). Worker'ın hangisini referans alacağı belirsiz.

### 1.13 HIGH — 3-ortam frontmatter asimetrisi (Claude `paths:`, Gemini/Cursor yok)

`src/core/rule-generator.ts:67-121` adapter kodu kasıtlı bir asimetri kuruyor:

- `claudeAdapter` her dosyaya `paths: [...]` YAML frontmatter ekler (`src/core/rule-generator.ts:77`).
- `geminiAdapter` ve `cursorAdapter` frontmatter eklemez (`src/core/rule-generator.ts:101`, `113`).

Bu adapter formatlarının ait olduğu provider semantiği nedeniyle KASITLI (Claude Code `paths` directive'i tanır, Gemini/Cursor `paths` parse etmez). Ama doğal bir sonucu var: aynı kuralın `paths` scope-restriction'ı **sadece Claude'da etkili**. Gemini/Cursor'da kurallar her dosya için global yüklenir → Brain dosyası `paths:[".tasks/*", ".brain/*", ".contracts/*"]` Claude'da sadece bu pattern'lerde aktifken Gemini/Cursor'da `src/` dosyalarına da brain rule'u uygulanabilir.

Provider semantik farkı dokümante edilmemiş; OSS kullanıcısı için sürpriz olabilir.

### 1.14 HIGH — Brain/Auditor/Worker rules: kod gerçeği uyumu — minör drift'ler

`@brain.md` kuralları büyük ölçüde kodla tutarlı; ufak gözden kaçanlar:

- `brain.md` "Provider Routing — Use provider fallback chain on failure (single retry, no infinite loops)" — `src/core/provider.ts` ProviderError chain birden fazla retry policy'sini destekliyor, "single retry" iddiası kod davranışıyla şarta bağlı (network vs format). Detaylı doğrulama Task 171-010 providers-api kapsamında.
- `worker-default.md` "Run `tsc --noEmit` and `vitest run` before marking done" — bu ÇOK GENEL bir kontrat. Sprint 171 audit-only task'larda `tsc/vitest` koşturulması anlamsız (no code change). Worker prompt'unda task tipine göre koşullu ifade yok → Worker yine de koşmaya kalkar. `rubric-registry` "audit task → coverage:null" diyor ama `worker-default.md` bu ayrımı söylemiyor. Mini drift.
- `auditor.md` "Scan every 30 seconds" — `src/monitor/auditor.ts` aktif scan loop interval'ini config'ten okuyor (default 30s ama parametrik). Kuralın hardcoded 30s iddiası eksik. Detaylı doğrulama Task 171-009 monitor-connectors kapsamında.

### 1.15 HIGH — DECKENT.md "Default: Claude (docker backend)" ile dokümantasyon iç çelişkisi

- `DECKENT.md:14` → `Default: Claude (docker backend, session auth)`.
- `DECKENT.md:83` `deckent_start` açıklaması → `Worker'lari tmux veya subprocess olarak spawn eder` (docker geçmiyor).
- `DECKENT.md:155` Sprint Lifecycle tablosu → `SPAWN | Worker'lar tmux veya subprocess ile baslatilir` (docker yok).
- `.deckent/config.json:6` → `"spawn_backend": "docker"`.
- `src/orchestra/spawn-backend-docker.ts` mevcut + `ADR-027 Hybrid Spawn Backend` accepted.

Üst-bölümler "docker varsayılan" derken iç kullanım dokümantasyonu sadece tmux/subprocess'ten bahsediyor. OSS GA için kullanıcı `deckent_start` açıklamasını okuyup docker backend'in EXISTS olduğunu anlamayabilir.

### 1.16 HIGH — DECKENT.md "Memory budget: 900 lines max in .brain/" — Memory V2 sonrası geçersiz

`DECKENT.md:11` →

> Memory budget: 900 lines max in .brain/ (MEMORY 300, RETRO 120, PATTERNS 150, sprint log 100 per file)

Memory V2 (DB-First, Sprint 138+) sonrası `.brain/memory.db` single source of truth (`DECKENT.md:34-43` aynı belge içinde söylüyor); `.md` dosyaları auto-generated exports. Lines budget claim'i pre-v2 sözleşmesi. Aynı dokümanın iki bölümü çelişiyor.

### 1.17 MEDIUM — `.codex/rules/` dizini scope dışı kalmış (4. ortam ihmal)

`src/core/rule-generator.ts:35` PROVIDERS sabiti `['claude', 'codex', 'gemini', 'cursor']` — kod 4 ortam yönetir, **DIRECTIVES Task 25 / plan dosyası ise sadece 3-ortam (claude/gemini/cursor)** denetlendi. `.codex/rules/brain.md` (md5 = `89f51bb6...`) `.gemini/rules/brain.md` ile **byte-identical** (`md5sum` doğrulandı), yani fonksiyonel olarak gemini ile aynı durumda, ama scope tanımında ihmal edilmiş.

Plan dosyası bir 4. ortamı kaçırmış; Task 171-025 audit'i scope tanımı eksik. OSS GA için bu Codex agent'ı kullanan kullanıcılar var (DECKENT.md:15 "Optional: Codex (set OPENAI_API_KEY)"). Codex rule durumunu da sentez raporu (Task 171-029) ele almalı.

### 1.18 MEDIUM — `api-surface.md` `provider` enum'unun değer kümesi minimum tutarlı

`.contracts/api-surface.md:33` Task şeması:

```
"provider": "claude | codex | gemini"
```

— 3 değer. `src/core/provider.ts` `ProviderAdapter` registry runtime'da bu 3'le sınırlı. MATCH. Sadece dikkat: tier listesi DECKENT.md'de "premium_plus" (alt çizgi) ama bazı belge yerlerinde "premium+" (artı işareti) varyantı görünür — internal tutarlılık `DECKENT.md:267` `premium_plus` doğru, `DECKENT.md:258` "Premium+" (etiket olarak) → biraz karışık ama yanıltıcı değil.

### 1.19 MEDIUM — CLAUDE.md "Agent Performance" tablosu Sprint-167 verisi (donmuş)

`CLAUDE.md:107-116` Agent Performance tablosu son sprint snapshot'ı; metric `bug-fixer (**FORENSIC MODE — no fix, root cause only**)` gibi etiket-içi-formül ifadeler taşıyor. Sprint 168-171 verisi yok, tablo Sprint 167 sonrası managed-docs render hook'unun düştüğünü gösteriyor (§1.4 ile tutarlı semptom).

### 1.20 LOW — IDENTITY.md "Agents: 15 built-in + 2 custom" — 2 custom referansı

`IDENTITY.md:29` → `| Agents | 15 built-in + 2 custom |`. `.deckent/agents/` altında mevcut custom agent'lara bakıldığında `temp-react-specialist` ve `temp-react-ts-specialist` (gitStatus'tan görünür, modified) — "2 custom" iddiası iyi ki proje state'iyle eşleşiyor. Match, ama LRU eviction (max 50 temp) sınırı belge bakımlı kalmalı.

---

## 2. Severity

| # | Bulgu | Severity | Gerekçe |
|---|---|---|---|
| 1.1 | CLAUDE.md modül sayısı drift (orchestra 76→95, core 94→101, api 3→4, mcp 27→31) | **CRITICAL** | Worker'ın codebase scale algısını saptırır; refactor/audit kararları yanlış skaledan kurulur. OSS GA okuyucusu için ilk izlenim yanlış. |
| 1.2 | DECKENT.md MCP Tools listesi 22 (gerçek 31) | **CRITICAL** | Kullanıcının/agent'ın 9 tool'dan habersiz kalması ürün özelliği "görünmez" yapar; `deckent_help` runtime'da yanlış kapasite raporlar. |
| 1.3 | Tool sayımı 22 vs 27 vs 31 üçlü çelişki | **CRITICAL** | Hiçbir kaynak doğru değil; tek hakikat referansı kaybolmuş — agent prompt enjeksiyonu nereden gelirse o yanlış sayıyı taşır. |
| 1.4 | CLAUDE.md "Sprint Metrics" stale + bozuk (`NaN%`, `-1dk -1sn`, sprint-167) | **CRITICAL** | Managed-docs hook'u kırılmış göstergesi; ADR-046 Brain Self-Update Hook iddiasını çürütür. OSS GA pazarlama dosyası olarak görmez halde. |
| 1.5 | IDENTITY.md multi-stale (Sprint 166+, 27 tools, 12.485 test, sprint-167) | **CRITICAL** | DECKENT.md@-loaded → tüm agent prompt'larına stale metrik enjekte; IDENTITY OSS okuyucu için "ürün karnesi". |
| 1.6 | api-surface.md `model` enum 5 model eksik | **CRITICAL** | Şema validatörü kullanılan valid modeli ("o3", "o4-mini" vb.) reddedebilir; brain plan başarısız. |
| 1.7 | Sprint Phases ile SprintPhase enum drift (CLEANUP↔COMPLETE, WAVE_BUILD undefined, DIRECTIVE/TRANSITION eksik) | **CRITICAL** | Dashboard/nervous detector'ları phase string yanlış beklerse hiç tetiklenmez (ADR-044 observability contract ihlali). |
| 1.8 | `dependency_pipeline_enabled` üç farklı iddia (Sprint 156 vs 167 vs config-FALSE) | **CRITICAL** | Worker mode beklentisini yanlış kurar; ADR-045 wave semantics anchor sapması. |
| 1.9 | BOOT.md kod bloğu bozuk + tam ikileme (lines 36-67 = 1-34) | **CRITICAL** | Recovery rehberi okunduğunda komutlar düz metin görünür + iki kez aynı bölüm; emergency'de zaman kaybı. |
| 1.10 | BOOT.md `deckent spawn --auto-approve` invalid command | **CRITICAL** | Recovery son adımı VERBATİM kullanıldığında commander.js missing-arg ile FAIL eder; takılmış sprint kurtulmaz. |
| 1.11 | `.cursor/rules/*` boş CUSTOM bloğu | **HIGH** | Cursor kullanıcısı custom rule overlay'i kaybeder; 3-ortam davranış parity'si bozulur. |
| 1.12 | AUTO/CUSTOM verbatim ikileme | **HIGH** | Worker prompt context payload 2×; ADR güncellendiğinde CUSTOM bloğu stale olur, çelişki riski. |
| 1.13 | 3-ortam frontmatter asimetrisi (Claude `paths:`, Gemini/Cursor yok) | **HIGH** | Kasıtlı ama dokümante değil; OSS kullanıcı için sürpriz. |
| 1.14 | brain/auditor/worker kuralları ufak drift (single retry iddiası, audit task ayrımı yok, hardcoded 30s) | **HIGH** | Worker audit task'ta `tsc/vitest` koşturup hata raporlar; runtime davranış vs kural belge nüans yok. |
| 1.15 | DECKENT.md "docker default" ile dokümantasyon iç çelişki (lines 14 vs 83 vs 155) | **HIGH** | Yeni kullanıcı docker backend varlığını CLI rehberinden anlayamayabilir. |
| 1.16 | DECKENT.md "Memory budget 900 lines" — Memory V2 sonrası geçersiz | **HIGH** | Aynı dokümanın iki bölümü çelişiyor (line 11 vs 34-43). |
| 1.17 | `.codex/rules/` ihmal — plan 4. ortamı atlamış | **MEDIUM** | Codex rule durumu denetlenmedi; Codex kullanıcısı parity dışında. |
| 1.18 | api-surface `provider` enum MATCH (uyarı: "premium+" vs "premium_plus" küçük tutarsızlık) | **MEDIUM** | Etiket karışıklığı; teknik etki düşük. |
| 1.19 | CLAUDE.md Agent Performance tablosu Sprint 167'de donmuş | **MEDIUM** | §1.4 ile aynı RC (managed-docs hook). |
| 1.20 | IDENTITY.md "+2 custom" agent uyumlu | **LOW** | Şu anda eşleşiyor; bakım gerektirir ama bulgu değil. |

**CRITICAL toplam:** 10 (§1.1–1.10). **HIGH:** 6 (§1.11–1.16). **MEDIUM:** 3 (§1.17–1.19). **LOW:** 1 (§1.20).

OSS GA blocker olarak işaretlenenler (Sprint 172 public flip'i bloke eder):
**§1.1, §1.2, §1.3, §1.4, §1.5, §1.10** — okuyucuyu doğrudan yanıltır veya pratik kullanımı bozar. Sentez raporu (171-029) bu altıyı "OSS-GA blocker" bölümüne aktarmalı.

---

## 3. Kanıt (Evidence)

Her bulgu için file:line kanıtı + komut/kod alıntısı:

### §1.1 Modül sayım drift

`find` komutu (read-only):
```
$ find src/orchestra -type f -name '*.ts' | wc -l      → 95
$ find src/core -type f -name '*.ts' | wc -l           → 101
$ find src/agents -type f -name '*.ts' | wc -l         → 20
$ find src/api -type f -name '*.ts' | wc -l            → 4
$ find src/providers -type f -name '*.ts' | wc -l      → 5
```
İddialar: `CLAUDE.md:11` (`76 modules`), `CLAUDE.md:30` (`94 modules`), `CLAUDE.md:50` (`20 modules` MATCH), `CLAUDE.md:57` (`3 modules`), `CLAUDE.md:56` (`5 modules` MATCH), `CLAUDE.md:58` (`27 tools + 8 resources`).

### §1.2 MCP Tool eksik tool kanıtı

```
$ grep -rn "server\.registerTool" src/mcp/tools/ | wc -l   → 31
```
Eksik tool dosyaları + line:
- `src/mcp/tools/audit.ts:9` → `server.registerTool('deckent_audit', ...)`
- `src/mcp/tools/watch.ts:23` → `'deckent_watch'`
- `src/mcp/tools/recover.ts:15` → `'deckent_recover'`
- `src/mcp/tools/feature-query.ts:43` → `'deckent_feature_query'`
- `src/mcp/tools/nervous.ts:55, 85, 136, 180, 234` → `'deckent_nervous_{subscribe,accept,reject,status,config}'`

DECKENT.md tablosu: `DECKENT.md:173-194` (22 satır).
Canonical help.ts liste: `src/mcp/tools/help.ts:49-70` (22 entry).

### §1.3 Tool sayımı çelişki

- `DECKENT.md:30` → `22 tools`
- `CLAUDE.md:58` → `27 tools + 8 resources`
- `IDENTITY.md:14` → `MCP: 27 tools, 8 resources`
- `IDENTITY.md:25` → `| MCP Tools | 27 |`
- Kod gerçeği: 31 (kanıt §1.2)

### §1.4 CLAUDE.md Sprint Metrics

```
| Sprint        | sprint-167 |   ← CLAUDE.md:96
| Duration      | -1dk -1sn  |   ← CLAUDE.md:101
| Coverage      | NaN%       |   ← CLAUDE.md:102
```
`.deckent/config.json:6` `"last_sprint_id": "sprint-171"` ve `DIRECTIVES.md:1` `# DIRECTIVES — Sprint 171:`.

### §1.5 IDENTITY.md stale metrikler

- `IDENTITY.md:9` `Tests: 12,485 pass + 16 skipped (505 files)`. Gerçek dosya: `find tests src -name '*.test.ts' | wc -l → 808`. Plan baseline `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md:` Task 171-021 → `vitest baseline (pass ≥16475 + fail ≤2 + skip ≤41)`.
- `IDENTITY.md:12` `Sprints: 166+ (Sprint 166 ...)`; gerçek 171.
- `IDENTITY.md:24` `| Sprint | sprint-167 |`.

### §1.6 api-surface model enum eksik

`.contracts/api-surface.md:13` → 8 model.  
`src/core/model-registry.ts` `id:` çağrıları (13 satır):
```
id: 'opus',  id: 'sonnet',  id: 'haiku',  id: 'o3',  id: 'gpt-5',
id: 'gpt-4.1',  id: 'o4-mini',  id: 'gpt-5-mini',  id: 'gpt-4.1-mini',
id: 'gemini-3.1-pro-preview',  id: 'gemini-2.5-pro',  id: 'gemini-2.5-flash',
id: 'gemini-2.0-flash'
```
Eksik: `o3, o4-mini, gpt-4.1-mini, gemini-3.1-pro-preview, gemini-2.0-flash`.

### §1.7 SprintPhase enum drift

`src/core/sprint-types.ts:7-18`:
```ts
export enum SprintPhase {
  DIRECTIVE = 'DIRECTIVE',
  PLAN = 'PLAN',
  SPAWN = 'SPAWN',
  EXECUTE = 'EXECUTE',
  EVALUATE = 'EVALUATE',
  FIX = 'FIX',
  RETRO = 'RETRO',
  DECAY = 'DECAY',
  TRANSITION = 'TRANSITION',
  COMPLETE = 'COMPLETE',
}
```
`.contracts/api-surface.md:80-89` 8 faz (CLEANUP, WAVE_BUILD geçen).  
Grep doğrulaması: `grep -rn "WAVE_BUILD\|WaveBuild" src/` → 0 hit.

### §1.8 `dependency_pipeline_enabled` üç iddia

- `src/core/config.ts:600`:
  ```ts
  dependency_pipeline_enabled: true,
  ```
- `src/core/config.ts:882-883`: 
  ```ts
  dependency_pipeline_enabled:
    (config as DeckentConfigWithPipeline).dependency_pipeline_enabled ?? true,
  ```
- `git log -S "dependency_pipeline_enabled: true" -- src/core/config.ts`:
  ```
  4d15196 feat(sprint-156): Pipeline hardening + Reversibility tohumu (T4 god-level)
  ```
- `DECKENT.md:51` → `Sprint 167 flip: dependency_pipeline_enabled: true`.
- `.deckent/config.json:198` → `"dependency_pipeline_enabled": false`.
- `DIRECTIVES.md` (Sprint 171) → "`dependency_pipeline_enabled: false` olduğundan Wave geçişleri Brain manuel".

### §1.9 BOOT.md format

`.deckent/workspace/BOOT.md:10` ile başlayan satırlar:
```
# Step 1: Kill active workers
deckent kill --all
...
deckent spawn --auto-approve
```
Önce açılan ` ```bash ` fence **yok**; `:24` yetim kapanış ` ``` `.

`BOOT.md:1-34` ile `BOOT.md:36-67` byte düzeyinde aynı içerik (header `## Manual Recovery Chain` + `## Sprint Stuck / Manual Recovery` dahil).

### §1.10 BOOT.md spawn signature

`.deckent/workspace/BOOT.md:23` → `deckent spawn --auto-approve`.  
`src/cli/commands/spawn.ts:85`:
```ts
.command('spawn <taskId>')
```
commander.js angular bracket `<>` = required positional. taskId verilmeden çalıştırılırsa "missing required argument 'taskId'" hatası.

### §1.11 Cursor empty CUSTOM

```
$ wc -l .claude/rules/brain.md .gemini/rules/brain.md .cursor/rules/brain.md
  134 .claude/rules/brain.md
  131 .gemini/rules/brain.md
   91 .cursor/rules/brain.md
```
`.cursor/rules/brain.md:90-91`:
```html
<!-- CUSTOM-START -->
<!-- CUSTOM-END -->
```
Aynı pattern: `.cursor/rules/auditor.md:83-84`, `.cursor/rules/worker-default.md:86-87`.

### §1.12 AUTO/CUSTOM duplication

`.claude/rules/brain.md:1-91` AUTO bloğu; `.claude/rules/brain.md:93-134` CUSTOM bloğu. Block-2 (lines 97-132) ile block-1 (lines 5-40) içerik karşılaştırıldığında "Brain Rules" başlığı + 35+ satır verbatim eş.

### §1.13 Frontmatter asimetrisi (kod)

`src/core/rule-generator.ts:67-83`:
```ts
function claudeAdapter(): ProviderAdapter {
  return {
    format(role, content) {
      const paths = pathsMap[role] ?? [];
      const frontmatter = `---\npaths: ${JSON.stringify(paths)}\n---\n`;
      return frontmatter + content;
    },
    ...
  };
}
```
`src/core/rule-generator.ts:98-108` (geminiAdapter) ve `:110-121` (cursorAdapter) → frontmatter eklemez.

### §1.14 Worker rule audit task ayrımı yok

`.claude/rules/worker-default.md:13-14` → `Run tsc --noEmit and vitest run before marking done`.  
`src/orchestra/rubric-registry.ts` (ilgili dosya, tam doğrulama Task 171-002) audit task'lar için coverage:null + tsc/vitest gate'siz işliyor; rule belgesi bu nüansı söylemiyor.

### §1.15 Docker default vs CLI rehberi

- `DECKENT.md:14` `Default: Claude (docker backend, session auth)`
- `DECKENT.md:83` `deckent_start` → `Worker'lari tmux veya subprocess olarak spawn eder.`
- `DECKENT.md:155` SPAWN row → `tmux veya subprocess ile baslatilir`
- `.deckent/config.json:6` `"spawn_backend": "docker"`

### §1.16 Memory budget iç çelişki

- `DECKENT.md:11` `Memory budget: 900 lines max in .brain/ (MEMORY 300, RETRO 120, PATTERNS 150, sprint log 100 per file)`
- `DECKENT.md:34-43` `## Memory V2 — DB-First Architecture` (DB single source of truth)

### §1.17 .codex/rules durumu

```
$ ls .codex/rules/
auditor.md  brain.md  worker-default.md
$ md5sum .codex/rules/brain.md .gemini/rules/brain.md
89f51bb6122ddffa168c2f62a1a43408  .codex/rules/brain.md
89f51bb6122ddffa168c2f62a1a43408  .gemini/rules/brain.md
```
`src/core/rule-generator.ts:35` `const PROVIDERS = ['claude', 'codex', 'gemini', 'cursor'] as const;`  
Plan dosyası `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md:103` (Task 25 satırı) → sadece `.claude/rules/**, .gemini/rules/**, .cursor/rules/**` (codex yok).

### §1.18 Provider enum match

`.contracts/api-surface.md:33` `"provider": "claude | codex | gemini"`. `src/core/provider.ts:` ProviderRegistry'de 3 adapter (claude, codex, gemini).

---

## 4. Öneriler (Recommendations)

Aksiyonlar Sprint 172 OSS GA öncesi backlog'a alınmalı. "Sil / Birleştir / Tamamla / Düzelt / Koru" net olarak işaretlendi.

### 4.1 Single Source of Truth pattern: dokümantasyondaki tüm metrik run-time üretilmeli

**Düzelt:** CLAUDE.md modül sayıları, DECKENT.md tool sayıları, IDENTITY.md sprint/test/MCP rakamları **manuel hardcoded** olarak yazılmamalı. Tek geçerli kaynak: kod taraması (`find src/<dir> -name '*.ts' | wc -l`, `grep -rn "server.registerTool" src/mcp/ | wc -l`) + memory.db son sprint kaydı. `sprint-reporter.ts` veya `managed-docs/identity-generator.ts` runtime hesaplayıp doc'lara enjekte etmeli. Önerilen template token'lar: `{{ORCHESTRA_MODULES}}`, `{{CORE_MODULES}}`, `{{MCP_TOOLS}}`, `{{CURRENT_SPRINT}}`, `{{TEST_COUNT}}`. Sprint sonu hook'u (ADR-046) bu token'ları DB'den + filesystem'den doldurmalı.

### 4.2 MCP Tool canonical list senkronu kuralı

**Düzelt:** `src/mcp/tools/help.ts:49-70` canonical liste **build time'da** `src/mcp/tools/*.ts` içindeki `server.registerTool('NAME', ...)` çağrılarıyla `tsc` sırasında eşitlenmeli (lint check). Bu liste DECKENT.md "MCP Tool Reference" tablosunun da kaynağı olmalı (managed-doc generator çağırır). Test eklenmeli: `tests/unit/mcp-tools-canonical-sync.test.ts` → registry vs help.ts count match.

### 4.3 api-surface.md kontratı kod-türevli olsun

**Düzelt:** `.contracts/api-surface.md` içindeki:
- `model` enum: `ALL_MODELS` (src/core/types.ts) `.join(' | ')`
- `provider` enum: ProviderRegistry'den
- Sprint Phases: `SprintPhase` enum string union
- Task / Result şemaları: Zod schema'dan generate edilen .d.ts kontrat dökümü

ile build sırasında üretilmeli. `scripts/generate-api-surface.mjs` runner eklenir; pre-commit veya CI'da geçerlilik check'i. `WAVE_BUILD` kaldırılmalı veya SprintPhase enum'una resmi olarak eklenmeli (ADR amendment). `CLEANUP` → `COMPLETE` rename.

### 4.4 BOOT.md: ya sil ya yeniden yaz

**Düzelt:**
1. Duplikasyon (lines 36-67 = 1-34) **sil**.
2. Kod bloğunu ` ```bash ` fence ile DÜZGÜN aç-kapat.
3. `deckent spawn --auto-approve` invalid signature → düzeltilmiş örnek:
   ```bash
   # Spawn remaining pending tasks (kullanıcı her birini onaylar)
   deckent spawn <task-id> --auto-approve     # ÖRN: deckent spawn 171-001 --auto-approve
   ```
4. `taskId: "166-NNN"` örneğini `taskId: "<sprint>-NNN"` formatına çevir; sprint-specific örnek vermek yerine generic placeholder kullan.

Alternatif: BOOT.md tamamen kaldırılıp recovery rehberi `docs/guide/recovery.md`'ye taşınabilir; `.deckent/workspace/` minimum kalır (identity + tools).

### 4.5 `.cursor/rules/*` CUSTOM bloğu doldurulsun veya .claude/.gemini'deki CUSTOM kaldırılsın

**Düzelt:** Üç ortam parity'si için iki yol:
- (a) `deckent sync --rules` cursor için de CUSTOM bloğunu eşitlesin (`src/core/rule-generator.ts` mevcut adapter parity zaten kodda var, ama disk state stale — sync re-run gerekiyor).
- (b) AUTO/CUSTOM duplikasyonu zaten her dosyada anlamsızsa, **CUSTOM bloğunu tüm ortamlarda kaldır**; sadece AUTO blok kalsın. Bu prompt payload'ı yarıya indirir.

Öneri: (b) — context payload tasarrufu + drift riski sıfırlanır. CUSTOM ihtiyacı yok çünkü kullanıcı `.brain/memory.db` üzerinden custom ADR/memory ekleyebiliyor (rule customization yerine).

### 4.6 Frontmatter `paths:` adapter farkı dokümante edilsin

**Tamamla:** `docs/architecture/agent-rules-format.md` (yeni) — adapter format farkı açıklanmalı:
> Claude Code `paths:` frontmatter'ı tanır → kural sadece eşleşen dosyalar açıldığında prompt'a girer. Gemini/Cursor/Codex `paths:` parse etmez → kural global yüklenir.

OSS kullanıcı bunu okumadan provider seçerse davranış farkını anlayamaz.

### 4.7 `dependency_pipeline_enabled` anchor sprint'i kanonikleştir

**Düzelt:**
- DECKENT.md:51 `Sprint 167 flip` → `Sprint 156 flip` (git log doğrulamasından).
- api-surface.md:83 "default since Sprint 156" DOĞRU, **koru**.
- `.deckent/config.json:198` `false` override'ının REASON'ı bir yere yazılmalı (`.brain/exports/decisions.md` veya `.deckent/decisions/decision-171-NNN.json` SDL kaydı — sprint manuel-dispatch gerekçesi).

### 4.8 CLAUDE.md "Sprint Metrics" / "Agent Performance" tablolarını runtime üret veya kaldır

**Sil veya düzelt:** Bu tablolar managed-docs hook'unun Sprint 167 sonrası kırıldığının semptomu. Ya:
- (a) Hook'u onar (ADR-046 Brain Self-Update Hook → Sprint 167-171 sprint sonu run sırası audit edilmeli, Task 171-001 lifecycle audit kapsamında),
- (b) İki tabloyu **sil** ve canlı veri için `deckent status` / `deckent retro` CLI komutlarına yönlendir (CLAUDE.md zaten line 91'de bunu söylüyor).

(b) öneri olarak daha temiz: belgeden DİNAMİK veri çıkar, comman yönlendirme bırak.

### 4.9 DECKENT.md "docker default" claim'i CLI rehberlerine yansıt

**Tamamla:** `DECKENT.md:83, 155` SPAWN açıklamalarına docker eklenmeli:
> Worker'lari **tmux, subprocess veya docker** olarak spawn eder (`spawn_backend` config'ten).

Ayrıca `DECKENT.md:11` `Memory budget: 900 lines` cümlesi **silinmeli** — Memory V2 sonrası geçersiz. Yerine: `Memory: SQLite single source of truth + .md exports (auto-generated)`.

### 4.10 `.codex/rules/` Task 25 scope'una eklenmeli

**Tamamla:** Sentez raporu (171-029) `.codex/rules/{brain,auditor,worker-default}.md` durumunu codex-byte-identical-with-gemini olduğu için risk düşük olarak işaretleyebilir, ama backlog'a `Sprint 172: codex rule sync verify` eklenmeli (rule-generator.ts 4 provider yönetir; codex disk-state OK olduğu mevcut sprint için doğrulandı).

### 4.11 Worker rule'unda audit task ayrımı eklenmeli

**Tamamla:** `.claude/rules/worker-default.md` (template `src/core/rule-templates/worker-default.template.md`) → "Verify Loop" bölümüne:

> **Audit-only task:** Eğer task description "audit-only" veya `scope.filesWrite` sadece `docs/audits/**` ise `tsc --noEmit` / `vitest run` ÇALIŞTIRILMAZ. coverage:null doğru sonuç.

Aksi takdirde her audit task ya unnecessary çalıştırma yapar ya da Sprint 170 P0-3 benzeri "Code physically verified despite missing .result" tech debt'i tetikler.

### 4.12 8-Badge atamaları (Sprint 172 doc-reorg girdisi)

| Dosya | Badge | Gerekçe | Sprint 172 Aksiyon |
|---|---|---|---|
| `.claude/rules/brain.md` | **core** | Brain prompt enjeksiyonu zorunlu | Koru; CUSTOM bloğu kaldırma önerisi (§4.5). |
| `.claude/rules/auditor.md` | **core** | Auditor prompt | Aynı. |
| `.claude/rules/worker-default.md` | **core** | Her worker prompt'una enjekte | §4.11 audit-task ayrımı ekle. |
| `.gemini/rules/{brain,auditor,worker-default}.md` | **core** | Gemini provider için zorunlu | Adapter format farkını koru, CUSTOM eşle/kaldır. |
| `.cursor/rules/{brain,auditor,worker-default}.md` | **core (degraded)** | CUSTOM boş → cursor parity bozuk | §4.5 fix. |
| `.codex/rules/*` | **core** | Codex provider için zorunlu | Scope'a alın; mevcut byte-identical-with-gemini durumu OK. |
| `.contracts/api-surface.md` | **core** | Inter-agent JSON kontrat | §4.3 build-time generate. |
| `CLAUDE.md` | **core** | Proje root entry, @-load chain | §4.1, §4.8 fix. |
| `DECKENT.md` | **core** | DECKENT.md adapter pattern (ADR-013) — tüm agent'lar zorunlu okur | §4.2 MCP table generate, §4.7 anchor fix, §4.9 docker/memory düzelt. |
| `.deckent/workspace/IDENTITY.md` | **core** | DECKENT.md@-load → tüm prompt'lara | §4.1 runtime gen. |
| `.deckent/workspace/BOOT.md` | **necessary (broken)** | Recovery rehberi — kullanım anında kritik ama format bozuk | §4.4 yeniden yaz veya sil. |

### 4.13 Sprint 172 OSS GA blocker önceliği (sentez 171-029 için)

OSS public flip ÖNCESİ tamamlanmalı:
1. **§4.1** Hardcoded metrik → runtime generate (CRITICAL §1.1, §1.4, §1.5)
2. **§4.2** MCP canonical liste sync + lint test (CRITICAL §1.2, §1.3)
3. **§4.4** BOOT.md yeniden yaz veya sil (CRITICAL §1.9, §1.10 — recovery practical-broken)
4. **§4.3** api-surface kontrat-kod sync (CRITICAL §1.6, §1.7)
5. **§4.7** dependency_pipeline_enabled anchor düzeltme (CRITICAL §1.8)

Düşük öncelik (post-flip mikro-sprint):
6. **§4.5** cursor CUSTOM sync (HIGH §1.11)
7. **§4.6** adapter format dokümantasyonu (HIGH §1.13)
8. **§4.9** DECKENT.md docker/memory düzelt (HIGH §1.15, §1.16)

---

## 5. Kapsam Haritası

Plan dosyası bu task'ı **cross-cut** kabul etmiyor — modül-derin değil, çoklu dosya doc audit (Task 171-025 Worker Contract: "**Steps:** Worker Contract S1-S6. (Kapsam Haritası YOK.)" — `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md:477`). Bu nedenle "her dosya tam LoC" tablo zorunlu değil. Yine de denetlenen dosyaların tam envanteri okunmuş olduğunu kanıtlamak amacıyla aşağıdaki listeyi ekliyorum:

| Dosya | Yaklaşık LoC | Okundu | Not |
|---|---|---|---|
| `.claude/rules/brain.md` | 134 | ✓ tam | AUTO+CUSTOM duplikasyon, frontmatter dolu |
| `.claude/rules/auditor.md` | 120 | ✓ tam | Aynı pattern |
| `.claude/rules/worker-default.md` | 126 | ✓ tam | Aynı pattern |
| `.gemini/rules/brain.md` | 131 | ✓ tam | Frontmatter yok, CUSTOM dolu |
| `.gemini/rules/auditor.md` | 117 | ✓ tam | Aynı |
| `.gemini/rules/worker-default.md` | 123 | ✓ tam | Aynı |
| `.cursor/rules/brain.md` | 91 | ✓ tam | CUSTOM boş — divergence |
| `.cursor/rules/auditor.md` | 84 | ✓ tam | Aynı |
| `.cursor/rules/worker-default.md` | 87 | ✓ tam | Aynı |
| `.codex/rules/brain.md` | 131 | ✓ md5 doğrulandı | Plan scope'u dışı (§1.17); byte-identical gemini ile |
| `.codex/rules/auditor.md` | 117 | ✓ md5 | Aynı |
| `.codex/rules/worker-default.md` | 123 | ✓ md5 | Aynı |
| `.contracts/api-surface.md` | 159 | ✓ tam | §1.6, §1.7 |
| `CLAUDE.md` | 117 | ✓ tam | §1.1, §1.4 |
| `DECKENT.md` | ~390 | ✓ kapsamlı (1-279 sample) | §1.2, §1.15, §1.16, §1.18 |
| `.deckent/workspace/IDENTITY.md` | 32 | ✓ tam | §1.5 |
| `.deckent/workspace/BOOT.md` | 67 | ✓ tam | §1.9, §1.10 |

Kaynak kod doğrulamasında okunan ek dosyalar (audit-only — değiştirilmedi):
- `src/core/config.ts` (line 31-44, 593-600, 880-885, 1395-1402) — `dependency_pipeline_enabled` default
- `src/core/sprint-types.ts` (line 1-40) — SprintPhase enum
- `src/core/task-types.ts` (line 124-140) — TaskStatus / TaskEvaluation
- `src/core/model-registry.ts` (model id grep) — 13 model
- `src/core/file-lock.ts` (line 1-100) — Lock format
- `src/core/rule-generator.ts` (line 1-417 tam) — 4-provider adapter logic
- `src/orchestra/sprint-spawner.ts` (line 299-660 ilgili kısımlar) — dep pipeline runtime
- `src/orchestra/planner.ts` (line 1-15 import) — ADR-008 single-direction kanıt
- `src/agents/worker.ts` (line 1-30 import) — ADR-008
- `src/cli/commands/spawn.ts` (line 80-110) — spawn command signature
- `src/mcp/tools/*.ts` 29 dosya — `server.registerTool` çağrı sayımı
- `src/mcp/resources/*.ts` 9 dosya — `server.registerResource` çağrı sayımı
- `.deckent/config.json` — runtime override gerçeği
- `DIRECTIVES.md` — Sprint 171 hedefler
- `docs/superpowers/plans/2026-05-15-sprint-171-self-audit-plan.md` — bağlayıcı runbook

---

**Audit sonucu:** Bu task'ın temel hipotezi — "doküman ile kod arasında ciddi drift var" — kanıtlandı. 10 CRITICAL bulgu, 6 HIGH, 3 MEDIUM, 1 LOW. CRITICAL'lerin 6'sı OSS GA blocker. Sentez raporu (171-029) bu raporun §4 öneri listesini, özellikle §4.1 ve §4.2'yi, "managed-docs hook restorasyon" backlog kalemine bağlamalı (Task 171-001 lifecycle audit + Task 171-016 ADR compliance ile çapraz referans önerilir).

_Rapor tamamlandı. Türkçe + 4+1 bölüm + her bulgu file:line kanıtlı. memory.db ve src/ kaynak dosyaları yazılmadı; sadece bu rapor dosyası yazıldı._
