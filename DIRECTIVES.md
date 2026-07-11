# DIRECTIVES — SPRINT-404: RUNTIME-TRUTH-COMPILER + PLAN-YÜZEYİ + EXPIRY-DRIVER + TRACE-TAIL (640 · 522 · 524 · 639)

## Goal
Faz-2'nin son halkası: "wiring% ≠ çalışıyor" hastalığının mekanik kök-kesimi (`deckent truth`) +
plan-yüzeyi gerçeği + onay-expiry prod-sürücüsü + trace her-ortam-tamamlığı.

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · **build YASAK (npm run build dahil — dist'e ASLA dokunma)** · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (`VITEST_MAX_FORKS=2 npx vitest run <ilgili dizinler>`).

## Task 1: TRUTH-CORE — born-640a: feature-truth zincir-derleyici çekirdeği
- Model: sonnet | Agent: architect-değil-implementer; refactorer
- Files: src/core/feature-truth.ts, tests/core/feature-truth.test.ts
- Scope: src/core/, tests/core/
- Dependencies: none
### Description
YENİ modül `src/core/feature-truth.ts`: her özellik için 4-seviyeli truth-zinciri derleyen SAF motor
(yan-etkisiz; CLI/MCP yüzeyi Task-2'de). Seviyeler: **L1-CODE** (entryModule dosyası var + named-export
mevcut — kaynak-metin taraması, require etmeden); **L2-WIRED** (prodCallsitePattern regex'i src/ altında
en az 1 non-test dosyada eşleşiyor — tests/ hariç; eşleşen dosya:satır listesi kanıt olarak döner);
**L3-ENABLED** (flagPath'in verilen resolved-config objesinde çözülen değeri — config OKUMA çağıranın işi,
motor pure kalır: `resolveTruth(defs, {config, projectRoot, now})`); **L4-LIVE-PROOF**
(proof.kind='artifact-file' → dosya var+boş-değil; 'journal-recent' → jsonl son-satır ts'i
maxAgeDays içinde; 'smoke-cmd' → BU dilimde KOŞULMAZ, 'declared' olarak raporlanır — koşum Task-2 CLI'ında
opsiyonel). Veri-modeli: `FeatureTruthDef {id, title, entryModule, exportName?, prodCallsitePattern?,
flagPath?, proof?}` + `FeatureTruthResult {id, code:'ok'|'missing', wired:'ok'|'none'|'undefined',
enabled:'on'|'off'|'no-flag', proof:'ok'|'stale'|'missing'|'declared'|'undefined', evidence:{...}}` +
`classifyHalfWire(result)` → code-ok+wired-none = YARIM-WİRE adayı. Truth-tanımı OLMAYAN alanlar
'undefined' diye DÜRÜST raporlanır (sessiz-geçme yok). Cross-platform path (join/sep), fail-soft
(tek-def hatası diğerlerini düşürmez — sonuçta error alanıyla raporlanır; born-641 dersi: throw YOK,
yutma da YOK). RED-önce: tarihsel yarım-wire vakası fixture'ı (örn. export-var + çağrı-sitesi-yok modül)
→ classifyHalfWire yakalar; ayrıca 6-vaka mini-vault: tool_surface-a778151a / recordSprintWorkerTrace /
runEvaluatePhase-config / registerCodexParityModels / docker-envelope / gate-BLOCK-CLI-only şekillerini
temsil eden sentetik fixture'lar (adlarıyla) testte belgelenir.
### goNogo
- goCriteria: motor pure+hermetik (tmpdir fixture); 4-seviye + undefined-dürüstlüğü testli; classifyHalfWire 6-vaka-vault fixture'larını yakalar; fail-soft (bozuk-def → error-alanı, throw yok) testli; tsc temiz.
- nogo: motor config/disk'i kendisi global-okursa (pure-ihlal) NO_GO; sessiz-geçme varsa NO_GO.

## Task 2: TRUTH-SURFACE — born-640b: `deckent truth` CLI + MCP + --check ratchet
- Model: sonnet | Agent: api-builder
- Files: src/cli/commands/truth.ts, src/mcp/tools/truth.ts, src/cli/index.ts, src/mcp/server.ts, .deckent/settings/features-manifest.json, tests/cli/truth-command.test.ts
- Scope: src/cli/, src/mcp/, .deckent/settings/, tests/cli/
- Dependencies: Task 1
### Description
Task-1 motorunun yüzeyleri. (1) `deckent truth` CLI: features-manifest'ten (
`.deckent/settings/features-manifest.json`) truth-bloğu taşıyan feature'ları okur + resolved-config'i
loadConfig'den alır + motoru koşar + tablo basar (kolonlar: feature | code | wired | enabled | proof;
NO_COLOR-uyumlu; i18n: kullanıcı-metinleri getMessage en+tr — YENİ anahtarlar ekle); sonda "YARIM-WİRE
adayları" bölümü (classifyHalfWire). `--json` ham-çıktı; `--check`: `.deckent/truth-baseline.json`
pinned-baseline'ıyla karşılaştır — YENİ yarım-wire adayı = exit 1 + isim listesi (orphan-ratchet emsali;
baseline yoksa oluşturmayı öner, exit 2). (2) MCP `deckent_truth` tool paritesi (src/mcp/server.ts'e
register + katalog-sayaç senkronu — mevcut tool-count testleri varsa güncelle). (3) Manifest'e truth-bloğu
İLK 5 gerçek-örnek: training_trace (entryModule src/orchestra/output-collector.ts export
recordSprintWorkerTrace; callsite-pattern 'recordSprintWorkerTrace\\(' ; flagPath training_trace.enabled;
proof journal-recent .deckent/traces/sprint-worker.jsonl 7-gün) + tool_surface + approval-gate +
routing-decision-journal + affected-tests-gate — beşi de BUGÜN yeşil olmalı (canlı-kanıt!).
Gerçek-binary smoke-koşumunu build-sonrası Brain host-side yapar; sen yalnız komut-iskeletini ve
hermetik testleri teslim et.
### goNogo
- goCriteria: CLI tablo+--json+--check testli (hermetik tmpdir-manifest); MCP parite + register; 5 gerçek truth-bloğu manifest'te; i18n en+tr yeni-anahtarlar; ratchet exit-davranışı testli.
- nogo: motor yeniden-implement edilirse (Task-1'i import etmek yerine) NO_GO; tool-register yarım-wire kalırsa (register edilmeden "eklendi" denirse) NO_GO.

## Task 3: PLAN-SURFACE-TRUTH — born-629: start-replan ezmesi + Model/Agent-hint drop + post-adoption gösterim
- Model: sonnet | Agent: bug-fixer
- Files: src/orchestra/task-builder.ts, src/orchestra/sprint-planner.ts, tests/orchestra/plan-surface-truth.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
Üç kanıtlı-vaka tek-kök: DIRECTIVES'teki `- Model: haiku | Agent: doc-writer` hint'leri parse'da
DÜŞÜYOR (task JSON'a inmiyor) → hand-fix de işe yaramıyor çünkü `deckent start` RE-PLAN yapıp ezer
(kanıt: sprint-401 haiku→sonnet; sprint-403 Agent-hint'leri de düştü). FIX: (1) task-builder parse'ında
`Model:` → task.forceModel + `Agent:` → task.forceAgent güvenilir-yakalama — mevcut satır-formatı
`- Model: X | Agent: Y` VE ayrı-satır varyantlarını destekle; yakalanamayan hint = stderr-WARN
(sessiz-düşme YASAK — born-458 dep-ref emsali); (2) forceModel/forceAgent zaten task-JSON'a inen alanlar —
routeTaskV2 override-yolu bunları sayğılıyor (sprint-planner :676-685 overrides bloğu) → uçtan-uca test:
DIRECTIVES-metni fixture'ından parse→plan→task.forceAgent='doc-writer' + routing kararı ona uyar;
(3) RED-önce: bugünkü parser'ın hint'i düşürdüğünü kanıtlayan test (mevcut davranış), sonra fix.
NOT: scope-gate yeni-dizin false-positive'i ve pre-adoption gösterimi AYRI dilim — bu task yalnız
hint-zinciri; kalan kalemleri notes'a envanterle.
### goNogo
- goCriteria: RED-kanıt (hint-drop bugün gerçek); `- Model: X | Agent: Y` satırı parse→task.forceModel/forceAgent'a iner (uçtan-uca test); yakalanamayan-hint stderr-WARN; parser/task-builder/planner importer testleri yeşil.
- nogo: yalnız yeni-format eklenip mevcut DIRECTIVES-formatı (marathon'un kullandığı) desteklenmezse NO_GO.

## Task 4: APPROVAL-EXPIRY-DRIVER — born-631: prod-sürücü bağla
- Model: sonnet | Agent: api-builder
- Files: src/api/server.ts, tests/api/approval-expiry-wire.test.ts
- Scope: src/api/, tests/api/
- Dependencies: none
### Description
`src/core/approval-expiry-driver.ts` motoru VAR ama hiçbir prod-süreç çalıştırmıyor (0-caller,
yarım-wire ailesi) → expiresAt'i geçen pending'ler süresiz görünür-kalır (liste kirlenir; POST 409 döner
ama görsel-pending kalır). FIX: serve/API sürecine (src/api/server.ts) driver'ı bağla — server-start'ta
oluştur, interval unref'd (MOAT-2 dersi: event-loop'u pinleme), server-close'da dispose; aralık config'ten
(`approval.expiry_sweep_ms` gibi mevcut-şemaya uygun opsiyonel alan — resolver-passthrough ÜÇLÜSÜNÜ
unutma: tip + iki-resolver + canlı-roundtrip testi; born-464 dersi). RED-önce: bugün server'da driver
referansı 0 (grep-kanıt) + expired-pending'in temizlenmediği fixture-testi; fix-sonrası: expired pending
sweep'te expired'a geçer + composition-pin (server source'unda driver-kurulum satırı asserte).
### goNogo
- goCriteria: RED-kanıt; server-start→driver canlı (composition-pin) + unref'd + dispose testli; config-üçlüsü tam (tip+resolver×2+roundtrip); api importer testleri yeşil.
- nogo: driver kurulup interval ref'li kalırsa (linger) NO_GO; config-alanı resolver-passthrough'suz kalırsa NO_GO.

## Task 5: TRACE-TAIL — born-639: codex/gemini docker stream + token-counter tier-2 LogEvent-farkındalığı
- Model: sonnet | Agent: refactorer
- Files: src/orchestra/spawn-backend-docker.ts, src/orchestra/token-counter.ts, tests/orchestra/trace-tail-parity.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
402-002'nin dürüst-kalanları. (1) docker stream-port yalnız claude'a yapıldı — codex/gemini docker
`.log`'ları hâlâ RAW dump → onların trace-içeriği boş (HER-ORTAM yasası). writeNormalizedDockerLog'u
provider-agnostik genişlet: codex (thread.started/JSON-event formatı — 366-001 kanıtındaki gerçek-format)
ve gemini çıktılarını normalizeStreamEvent'in tanıdığı forma köprüle; tanınmayan-satır=passthrough-raw
LogEvent (content=ham-satır, type='text') — veri-kaybı YOK. ⚠️ usage-patch kontratı: her-provider'ın
mevcut usage-extraction'ı BİREBİR korunur (fixture-pin; resolveTokenUsage dersi). (2) token-counter.ts
tier-2 fallback (`tryLoadCliLogTokens`) top-level 'usage' bekliyor; LogEvent-JSONL'de usage `.content`
içinde nested → tier-2'yi LogEvent-farkında yap (her satırı parse et, content-nested usage'ı da tara);
güvenlik-ağı (mergeWithWorkerClaim) davranışı DEĞİŞMEZ — nihai-sayı regresyon-pin fixture'la. RED-önce:
codex-format fixture'ında bugün readLogEvents=0 + tier-2 miss kanıtı.
### goNogo
- goCriteria: RED-kanıt; codex+gemini fixture'ları LogEvent üretir (passthrough dahil); usage-sayıları üç-provider fixture'ında BİREBİR korunur; tier-2 nested-usage bulur + nihai-sayı pin; trace/token importer testleri yeşil.
- nogo: usage sayısı değişirse NO_GO; yalnız codex yapılıp gemini sessiz-atlanırsa NO_GO (dürüst-DEBT kabul).
