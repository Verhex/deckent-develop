# ÇALIŞMA MANTIĞI — 7094 WORKER-PROMPT-COST (owner-onaylı süreç hafızası)

> Amaç: Alperen unuttukça buradan hatırlatır; Fable her oturumda buna göre hizalanır.
> SSOT iş-takibi: `docs/MASTER-PLAN.md` 7094 satırı. Bu dosya SÜREÇ hafızasıdır, iş listesi değil.
> Silinme-tetiği: 7094 DONE olduğunda bu dosya MASTER satır-kanıtına gömülüp SİLİNİR.

## Yürütme modeli (owner emri 2026-08-19)
- Bu işin düzeltmeleri **deckent dogfood sprint'iyle DEĞİL, Fable subprocess ile** yürür
  (sebep: tokenizasyon/prompt/maliyet/kalite deneyi, dogfood worker'ları değişimin ta
  kendisini kullanırken doğru analiz edilemez — ölçüm aracı deneyden ayrılır).
- Her tamamlanan parça **codex xverify** (gpt-5.6-sol) ile mühürlenir; HOLD ≠ kapanış;
  nokta-iddia + `--files/--diff/--target` disiplini; evrensel kelime yasak (Ders-18).
- Ölçüm koşuları (A/B) deckent'in KENDİSİYLE yapılır (567-tarzı sabit görev-seti:
  1 kapsamlı + özdeş-basitler + 1 denetim; opus+sonnet): debt'ler koşu öncesi
  deprioritize edilir, `--force-replan --force-scope`, sonra geri alınır.
- Metrik seti: ilk-çağrı cacheCreation/cacheRead · toplam read/write · turn · süre ·
  USD (CLI-raporlu, biz hesaplamayız) · GO-oranı + çıktı-denetimi (kalite-guard).
- Tek değişken kuralı: her A/B'de YALNIZ bir varyant değişir; **`adr_min_relevance`'a
  ŞİMDİ DOKUNULMAZ** (kazancın koddan mı parametreden mi geldiği ayırt edilemez olur;
  testler sonrası gerekirse owner kararıyla).

## Ölçülmüş taban (2026-08-19; kanıt: 563 logları + 567 deneyi + Explore haritası)
- Maliyetin %91-95'i cache-read; turn 10-50; task $0.34-4.81 (CLI-raporlu USD).
- Katman A: CLI-önek 18.264 tok (32 tool-şeması+34 slash+19 skill+8 agent) — bu katman
  worker'lar-arası ZATEN paylaşımlı (`--exclude-dynamic...` default-açık sayesinde).
- Katman B: CLAUDE.md 17.719 B cwd-auto-load (kapatma anahtarı: `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`).
- Katman C: `.prompt` 9.5-16.8k tok — %36 TAM-ADR (operative-marker'lar ADR'lerde yok →
  kesim çalışmıyor) + %21 göreve-duyarsız alfabetik-ilk-3 skill + bayt-209'da attempt-nonce'lu
  landing-önsözü (arkasındaki 15.211 B bayt-aynı bloğun cache-hit'ini tek başına öldürüyor).
- Turn üreticileri: host'un gerçekten doğruladığı yalnız `.result` + landing-proposal;
  `.plan` sıfır-kontrol, `.hb` yalnız existsSync.

## Fazlar ve durum
- **F0 mühürler:** P1 CONFIRMED `…f4e859` (landing-önsöz + xverify-v2 istisnası);
  P2-P4 dürüst-HOLD → bölünmüş mühür F1 doğrulamasıyla birlikte.
- **F1 (Fable-subprocess, sırada):** (a) landing-önsözünü SONA taşı (coordinator
  template sırası) · (c) skill-seçimini göreve-duyarlı düzelt · (d) `.plan` kaldır +
  `.hb` tek-yazım. — F1b ADR-marker owner-karar bekliyor (KANUN 2: ADR gövdesine
  render-işareti ekleme onayı); `adr_min_rev` ERTELENDİ (yukarıdaki kural).
- **F2:** `--tools` daraltma + `--disable-slash-commands` + `.claude/{skills,agents}`
  mount-dışı + `reorderLeadingT0` ON.
- **F3:** `--bare -p --system-prompt-file <stabil-çekirdek>` + CLAUDE.md-worker-enjeksiyonu=0
  A/B'si; codex: `AGENTS.override.md`/`-c` project-doc + `--ephemeral`.
- **F4:** tier-routing (basit→haiku) + model-bazlı turn-disiplini.
- **F5:** görev-sınıfı prompt-profilleri — ürün özelliği, config-resolved
  (isInspectionOnly/isDocOnly deseni genelleştirme).
- **F6 (kapsam genişlemesi, owner 2026-08-19): dağıtım-matrisi çözümü** — aynı
  optimizasyonların HER ortamda doğru karşılığı: Anthropic API (cache_control
  breakpoint'leri — SDK/native adapter), **Bedrock / Vertex** (kendi prompt-cache
  semantikleri), **OpenRouter** (cache passthrough), Cursor/Claude/Codex CLI core'ları,
  **local-llm** (cache yok — prompt-yükü bağlamı ŞİŞİRİR; minimal-profil zorunlu).
  Herkese-özel çözüm: solo → team → enterprise (LAW 1-2); tek global ayar YASAK,
  provider/ortam-başına config-resolved profil.

## Ara-madde kuralı (owner 2026-08-19): wire/landing tüketici-taraması
- Her F-değişikliği landing'e girmeden önce deckent'in TÜM bağımlılıkları —
  listener / client / server pozisyonundaki özellikler — yeni yapıya uygunluk
  için taranır (örn. F1d: .plan/.hb tüketicileri — heartbeat-monitor, dashboard
  currentAction, nervous stale-worker, xverify .plan okumaları, api/SSE).
  KIRILIR-sınıfı bulgular aynı pakette düzeltilir; tarama raporu kanıta girer.

## Kanıt yerleri
- MASTER 7094 satırı (admission + F0 receipts) · sprint-567 receipt'leri
  (`~/.deckent/runtime/task-result-settlements/...`) · Explore haritası + doc-kanıtları
  bu oturumların MASTER bloklarında · resmi doc: code.claude.com (bare/system-prompt-file/
  exclude-dynamic/CLAUDE_CODE_DISABLE_CLAUDE_MDS) + openai/codex (ignore-user-config/
  ephemeral/AGENTS.override.md).

## F6 araştırma sonucu (2026-08-19 — dağıtım-matrisi; tam rapor MASTER 7094 oturum kaydında)
- **Kritik:** 5-arketip cache mimarisi (src/providers/cache-adapter.ts + cache-adapter-resource.ts
  + core/catalog/cache-archetype.ts) inşa edilmiş, test edilmiş, **production'a BAĞLANMAMIŞ**
  (tests/governance/orphan-deliverables.test.ts:545-546 açıkça orphan kaydetmiş). Native
  Anthropic transport (agent/provider-tooluse/anthropic.ts) cache_control EMİT ETMİYOR;
  claude.ts:863 attachCacheControlToMessages hazır-çağrısız.
- Ortam profilleri (özet): Anthropic-API → Arketip-B (T0+T1'e ≤2 breakpoint; min-token
  MODEL-BAZLI 512-4096 registry'den; 5m=1.25×/1h=2× write, ~0.1× read) · Bedrock → aynı
  cache_control InvokeModel'de çalışır (auto-cache YOK; model haritası bayat) · Vertex-Claude →
  adapter yok · Gemini → implicit default + yalnız büyük-korpusta explicit cachedContents
  (SAATLİK depolama ücreti — delete garantisi şart, C-adapter bunu yapısal veriyor) ·
  OpenRouter → cache_control passthrough DESTEKLİ ama bizim adapter content-blok iletmiyor;
  ölçüm cached_tokens + /generation.cache_discount · OpenAI/Codex → otomatik ≥1024;
  API-direkt'te tenant-scoped prompt_cache_key · local-llm → para-cache yok: MINIMAL-T0 +
  byte-exact prefix + cache_salt=tenant; ölçüm süreyle · Cursor → usage/cache alanları
  DOKÜMANTE DEĞİL; ölç-ve-öğren, çarpan varsayma.
- İlke: tek global ayar yok — provider×ortam profili config-resolved (F5 ürün özelliğiyle birleşir).

## 3-tur stabilite + 7094-R onarım paketi (2026-08-19)
- **Stabilite (571 ref vs R1/572·R2/573·R3/574):** mimarinin kontrol ettiği metrikler
  ±%4 stabil (taze-input 3.38-3.52k; basit-cW 11-13k); kapsamlı-görev $0.78-1.18
  salınımı davranışsal (tur-sayısı×cRead korele; F4-tier/turn işi). Kalite yapılı
  (rehber 283-603 satır / 34-86 H2). R2/R3 debt-istilasıyla yarıda durdu → temiz
  6/6 tur yalnız R1; owner kararı: F3 ürün-default'u 3 TAM temiz tur + kusursuz
  analiz olmadan AÇILMAZ.
- **NO_GO kök-neden (maliyet-değişikliği DEĞİL, kanıtlı):** DOC_WRITE correctness
  `testsPassed`e bağlıydı → dürüst `false` yazan doc-worker NO_GO, "tests passed"
  uyduran DONE (571/573 kanıtı; 573-006 attempt+3 fix aynı cezayla düştü ~$0.93).
- **Debt+dependency 5-halka zinciri (owner endişesi doğrulandı):** (1) başarı-raporu
  notlu debt doğumu → (2) escalateDebt her kapanışta critical'e geri yükseltir
  (deprioritize workaround tek-tur ömürlü) → (3) plana debt-prepend slot kaydırır →
  (4) "Task N"/integer ref debt-DAHİL listeye indexlenirdi → görevler debt'e bağlanır
  (573-004←573-001 disk-kanıt scheduler-shadow) → (5) debt-fix NO_GO → FIX-bütçe
  biter → breaker zinciri parked (4/8 görev hiç koşmadı, R2+R3 aynı).
- **7094-R düzeltmeleri (owner onayı; tek MASTER satırı):** D1 resolveDependencyRef
  index-formları directive-only alt-liste (task-builder) · D2-minimal doc/audit
  sınıfında testsPassed nötr + self-NO_GO tavanı + legacy doc fast-path öne
  (result-evaluator; kapsamlısı ayrı EVALUATOR-HONESTY maddesi) · D3 success-echo
  DebtClass (üretim stamp + injector skip + başlık-önek soyma + fix-description
  çerçevesi) · D4 = kod değişikliği GEREKMEDİ kanıtı (breaker/redispatch/unblock
  zinciri sağlam; blokaj D1-remap belirtisiydi) + blockedDependencyEdges teşhisi.
- **Ders:** ölçüm-sprintleri arasında finalize→escalateDebt yan-etkisi var; ardışık
  deney turlarında debt-yönetimi tur-BAŞINA yapılmalı (tek seferlik yetmez).

## F4a Turn-Economy v2 + F1b ADR-marker (2026-08-19 gece)
- **F4a (LANDED-aday):** TURN_ECONOMY_BLOCK'a madde 5-6 (tek-Write üretimi;
  yazılanı geri-okumama; basit görevde 2-tur ideali). 3-koşu kanıtı (575/576/577):
  kapsamlı cR 264-428k → 150-240k (bandın TÜMÜ aşağı; en kötü F4a-cR < en iyi
  F3-cR), out 18-25.6k → 13.7-17.4k, USD $0.72-0.97 (F3-ort ~$0.96'ya karşı
  ort $0.83, -%14; kümülatif 567→ -%57..-%68). Kalite 378-415 satır/44-87 H2
  bandında. cW artışı (tek-Write büyük blok) net-USD'yi bozmuyor. Kalan varyans
  ±%16 davranışsal. Kronikler F4a'dan bağımsız sürüyor: 004-soğuk-fix (S1,S2),
  005-denetim rubrik-DIŞI NO_GO (575 attempt-1 92.5/5-passed'a rağmen; 577'de
  fix-bütçe→006 bloke — pause mesajı D4 kenarıyla '577-006←577-005' İLK ÜRETİM
  görünümü). 005-sınıfı → 7097/7092 finding; audit-rationale gate-kaynağını
  taşımıyor (teşhis eksiği) → 7092 finding.
- **F1b (LANDED-aday):** governing-tier artık yazar-pinli worker-operative
  marker'a saygılı (marker-slice + amendment-history pointer'ı); markersız ADR
  tam-gövde (zero-loss varsayılan). 48/50 ADR'ye mekanik marker (## Decision
  bölgesi; adr-d-013 + adr-g-039 Decision'sız → tam-gövde; yedek:
  scratchpad/adr-backup-20260819). Uçtan-uca kanıt sprint-578 gerçek .prompt:
  iki governing-ADR slice+pointer ile girdi; ADR bölümü 37.9KB→17.3KB (-%54).
- Onay-devri notu: owner 'onay yetkisi devredildi' (2026-08-19 gece);
  approvals decide pseudo-TTY (script -qec) + --reason owner-delegated iziyle
  veriliyor; bir istekte 'canlı yeniden-doğrulama yok' fail-closed'u görüldü
  (tutarsız) → xverify-ux finding.
