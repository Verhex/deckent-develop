# DIRECTIVES — SPRINT-406: PUBLISH-YOLU (502-D1 builtins-drift · 523 approval-QoL · 641-kalan manifest-lint)

## Goal
Faz-4 PUBLISH-GATE'in (535) ön-şart temizliği: builtins↔.deckent drift-gerçeği görünür+gate'li olsun
(502-D1), approval deny-yorgunluğu bitsin (523), manifest şema-deliği sınıf-olarak kapansın (641-kalan).

## 🔒 BAĞLAYICI (her task)
- Yalnız kendi Files/Scope'una yaz · git stash/reset YASAK · **build YASAK (npm run build dahil — dist'e ASLA dokunma)** · notes TEK STRING · Self DÜRÜST.
- REPRODUCE-first: önce mevcut davranışı kanıtlayan RED/ölçüm, sonra fix; kanıtı notes'a yaz.
- Değişen modülü import eden TÜM testleri koş (`VITEST_MAX_FORKS=2 npx vitest run <ilgili dizinler>`).

## Task 1: BUILTINS-DRIFT-GATE — 502 dilim-1: drift-envanteri + mekanik drift-check gate
- Model: sonnet
- Files: scripts/builtins-drift-check.mjs, tests/scripts/builtins-drift-check.test.ts, docs/analysis/builtins-drift-inventory-2026-07-11.md
- Scope: scripts/, tests/scripts/, docs/analysis/
- Dependencies: none
### Description
SORUN (MASTER-PLAN 502, publish-ÖNCESİ P0): `src/core/builtins/{agents,skills}` ↔ `.deckent/{agents,skills}`
ÇİFT-YÖNLÜ gerçek-drift (bilinen: 11 agent-dosyasında içerik farkı; iki tarafta da diğerinde olmayan
öğeler; bundle-builtins.mjs'in ".deckent kanonik" öncülü ÖLÜ). Bugün her build'in paketlediği builtins
hangi tarafın doğrusu BELİRSİZ. DİLİM-1 = KARAR-HAZIRLIĞI + GATE (merge YAPMA — kanoniklik kararı
Alperen'in): (1) YENİ `scripts/builtins-drift-check.mjs`: iki ağacı dosya-dosya karşılaştırır
(yalnız-A / yalnız-B / içerik-farklı; JSON derin-eşitlik manifest'lerde, metin-diff PROMPT.md/SKILL.md'de);
`--json` makine-çıktısı + insan-okur tablo; `--check` modu: pinned-baseline
(`.deckent/builtins-drift-baseline.json`) ile karşılaştırıp YENİ-drift'te exit 1 (truth/orphan-ratchet
emsali; baseline-yok → exit 2 + `--write` önerisi). (2) Envanter-raporu
`docs/analysis/builtins-drift-inventory-2026-07-11.md`: her drift-öğesi için hangi taraf hangi
sprint/commit'te değişmiş (git log -1 --format='%h %ad %s' <dosya> her iki yol için), dosya-başı
KANONİKLİK-ÖNERİSİ (+gerekçe tek-cümle) — karar-tablosu Alperen'e hazır. (3) Stats-alanları (605
sidecar'a taşındı) diff'te GÜRÜLTÜ olabilir — manifest-karşılaştırmasında `stats` alanını normalize-et
(diff-dışı bırak + raporda not). RED-önce: bilinen-drift örneğinin (secure-coding iki-ağaç TAM-onarımı
sonrası eşit olmalı; api-design manifest'i builtins'te eksik idi — güncel gerçeği ölç) script'le
yakalandığının kanıtı.
### goNogo
- goCriteria: script canlı (iki-ağaç gerçek-koşusu notes'ta özet-sayılarla); --check ratchet exit-davranışı testli (hermetik tmpdir-fixture); envanter-raporu dosya-başı öneri+git-iz ile tam; stats-normalizasyonu testli.
- nogo: MERGE/kanoniklik-uygulaması yapılırsa (karar Alperen'in) NO_GO; drift-listesi örneklem/truncate edilirse NO_GO (tam-liste).

## Task 2: APPROVAL-QOL — born-630: allowStore-wire + deny-spam kesici + bekleme-heartbeat
- Model: sonnet | Agent: bug-fixer
- Files: src/agent/permission-store.ts, src/agents/worker-approval-env.ts, tests/agent/approval-qol.test.ts
- Scope: src/agent/, src/agents/, tests/agent/
- Dependencies: none
### Description
Advisor S5/S6 kalanları — 3 kalem: (1) `createWorkerApprovalGate` allowStore GEÇİRMİYOR
(permission-store.ts:192-199 civarı) → "always-allow" grant'ları worker-gate'te yapısal-ölü; aynı komut
her seferinde onay istiyor (deny-yorgunluğu). FIX: allowStore'u gate-kurulumuna geçir + karar-önü
matchesAllow kompozisyonu (358-008 guard-önü deseninin worker-tarafı simetriği; audit-korumalı:
submit+decide yine kaydedilir). (2) [approval-denied] normal tool-result olarak dönünce model aynı
komutu yeniden deniyor → her deneme YENİ request = bildirim-yağmuru. FIX: (scopeId, scope, cmd)
anahtarlı process-içi deny-cache — aynı komutun N'inci denemesi broker'a GİTMEDEN cached-deny döner
(N=1 sonrası; cache gate-dispose'da temizlenir) + tool-result metnine "bu komut bu run'da reddedildi,
yeniden deneme" yönergesi. (3) Onay beklerken worker hb-refresh yok → Auditor >2dk stale-alarmı +
timeout riski. FIX: guard bekleme-döngüsünde task-hb dosyasını periyodik tazele (mevcut hb-yazım
yardımcıını reuse; unref'd). Üçü de RED-önce (bugünkü davranış fixture-kanıtlı) + composition-pin
(kurulum-sitesi allowStore'u gerçekten geçiriyor).
### goNogo
- goCriteria: 3 kalem RED→GREEN; allow-grant ikinci istekte onaysız-geçer (testli); deny-cache N-denial sonrası broker'a gitmez + dispose-temiz; bekleme-hb tazeleniyor (fake-timer); permission-store/worker-approval importer testleri yeşil.
- nogo: allowStore geçirilip matchesAllow karar-önünde ÇAĞRILMAZSA (yarım-wire) NO_GO; audit-kaydı atlanırsa NO_GO.

## Task 3: MANIFEST-SCHEMA-LINT — 641-kalan: skill/agent manifest zorunlu-alan validasyonu + pool-load normalizasyonu
- Model: sonnet
- Files: src/core/skill-pool.ts, src/core/agent-pool.ts, scripts/lint-manifests.mjs, tests/core/manifest-schema-lint.test.ts
- Scope: src/core/, scripts/, tests/core/
- Dependencies: none
### Description
born-641'in kalıcı-kapanışı — secure-coding sınıfı (eksik-alanlı manifest) İKİ kez routing'i düşürdü
(stackDetection → sonra composableWith); nokta-guard'lar semptom, sınıf-çözüm iki katman: (1)
POOL-LOAD NORMALİZASYONU: skill-pool/agent-pool manifest'i yüklerken eksik opsiyonel-alanları güvenli
default'larla doldurur (skill: triggers[] · composableWith[] · stackDetection{files[],dependencies[],commands[]}
· category?; agent: deniedTools[] · expertise[] — mevcut tip-tanımlarındaki alanlarla sınırlı, YENİ alan
icat etme) → tüm motorlar (routing/selector/gate) undefined görmez; normalizasyon FAIL-SOFT
(bozuk-JSON = skip + loud-warn, mevcut davranış). (2) `scripts/lint-manifests.mjs`: iki ağaçtaki tüm
manifest'leri şema-kontrol eder (zorunlu-alan eksik = liste + exit 1; --fix YOK — rapor-only);
CI'ya eklenebilir yapıda (package.json script'i `lint:manifests` ekle — package.json Files'da değil,
notes'a satır-önerisi yaz, Brain ekler). RED-önce: composableWith'siz sentetik-manifest'in bugün
pool-load'dan normalize EDİLMEDEN geçtiğini kanıtla.
### goNogo
- goCriteria: RED-kanıt; pool-load normalizasyonu (iki pool) testli — eksik-alanlı manifest yüklendiğinde tüm alanlar güvenli-default; lint-script iki-ağaç gerçek-koşusu temiz ya da dürüst-liste (notes'ta); routing 641-testleri + pool importer testleri yeşil.
- nogo: normalizasyon tip-dışı alan uydurursa NO_GO; lint --fix yaparsa NO_GO.
