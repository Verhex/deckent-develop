# Routing V2→V3 Durum + Temizlik Analizi — 2026-07-21

> **Durum: ✅ Alperen onayı — "başarılı analiz" (2026-07-21).** Temizlik-analiz programının kayıt yeri
> bu klasördür (`docs/alperen-analysis/`); MASTER-PLAN'a satır açılmaz (Alperen kararı, 2026-07-21).
> Süreç soru-cevap olarak ilerler.

> **Amaç:** Repo-temizlik programının ilk adımı olarak routing alanının kanıt-temelli durum tespiti:
> (1) Routing V3 gerçekten wire edildi mi? (2) Routing V2 hâlâ geçerli mi? (3) V3'ün son
> sprintlerdeki başarısı ne durumda? Sonuç: hangi dosya/klasör silinebilir-aday, hangisi kesin tutulur.
> **Yalnız analiz — bu çalışmada hiçbir şey silinmedi/değiştirilmedi.**
>
> **Yöntem:** İki bağımsız keşif taraması (canlı çağrı-grafiği + git-tarihçe/journal-kanıtı), yük-taşıyan
> iddialar el-doğrulamalı (grep + dosya-satır teyidi). Tarih: 2026-07-21, HEAD: `105ebc67`.

---

## Yönetici Özeti (3 soruya 3 cevap)

| Soru | Cevap | Tek-cümle kanıt |
|---|---|---|
| **V3 wire edildi mi?** | ✅ **EVET — koşulsuz ve tek motor** (agent+skill seçimi için) | `plan/run/do/FIX` yollarının tümü `routeTaskV3`'e iniyor; flag kapısı yok |
| **V2 hâlâ geçerli mi?** | ❌ **HAYIR — 2026-07-15'te fiziksel silindi** (`2c63b777`) | Geriye yalnız kozmetik kalıntı kaldı: `routing_engine` config alanı + 3 kalıcı-true ölü guard |
| **V3 son-sprint başarısı?** | ✅ **Canlı ve ölçülü-başarılı** — journal sprint-455'e kadar karar üretiyor (son kayıt 2026-07-20) | Sprint-450: 6/6 DONE·0 NO_GO·22dk (449 baseline: 10/14·4 NO_GO·1sa49dk); B16 sonrası LLM-kolu da dirildi |

**Temizlik hükmü (özet):** `src/core/routing/` altındaki **24 modülün 24'ü de WIRED — hiçbiri silinemez.**
Silinebilir-aday olan şeyler kod-kalıntıları (ölü v2-guard'ları + `routing_engine` config alanı),
dondurulmuş yerel journal dizini (`.deckent/routing/decisions-v3/`) ve göç-günü karar gerektiren
7 tarihî `.analysis/routing-v3-*` dokümanı. Ayrıntı Adım 5'te.

---

## Adım 1 — Envanter: "Routing" tek şey değil, 3 ortogonal karar

Deckent'te "routing" konuşurken üç ayrı karar kastediliyor olabilir; temizlik kararları için bunları
ayırmak şart (aksi hâlde "task-router.ts eski, silelim" gibi yanlış bir sonuç çıkar):

1. **Model seçimi** → `resolveTaskModel` (`src/core/model-selector.ts`) — **V3'ün DIŞINDA**, plan'dan
   önce ayrı adım (`sprint-planner.ts:412,612`).
2. **Agent + skill seçimi** → `routeTaskV3` (`src/core/routing/route-task-v3.ts:112`) — **V3'ün alanı, tek motor.**
3. **Provider/backend çözümü** (hangi CLI/adapter'a spawn edilecek) → `routeTask`
   (`src/orchestra/task-router.ts:216`) — spawn-time, **agent seçmez** (`agent = task.assignedAgent ?? 'generic'`,
   `task-router.ts:224` saf geçiş). Artık "routing engine" değil, provider-resolver + fallback katmanı.

**Dosya ailesi:** `src/core/routing/` = 24 modül (motor + 3 eksen + aşamalar + governance + kelime-dağarcığı
+ journal). Köprüler: `src/orchestra/routing-plan-adapter.ts` (planner↔V3), `src/orchestra/mid-sprint-adapter.ts`
(FIX/reroute + 429-failover). Tip-SSOT: `src/core/routing-types.ts` (V2-çağından kalan ama **canlı** —
aşağıda Adım 3).

## Adım 2 — V3 wire kanıtı: canlı zincirler + flag durumu

### 2a. Canlı çağrı zincirleri (uçtan uca, dosya:satır)

**PLAN yolu (sprint planlama — ana yol):**
```
deckent plan (cli/commands/plan.ts:197)
  → planSprint()          sprint-planner.ts:816 (dynamic import) → :866 routeTasksV3ForPlan(...)
  → routeTasksV3ForPlan() routing-plan-adapter.ts:66 → :137 await routeTaskV3(task, catalog, ...)
```
Aynı `planSprint` MCP/API/start yüzeylerinde de kullanılıyor (`mcp/tools/start.ts:318,373` ·
`api/server.ts:1421` · `cli/commands/start.ts:571`).

**Tek-görev yolu (`deckent run` / `do` / `process`):**
```
cli/commands/run.ts:380 | mcp/tools/run.ts:113 | task-mode-runner.ts:225
  → routeSingleTaskV3()  routing-plan-adapter.ts:240 → routeTasksV3ForPlan({journal:false}) → routeTaskV3
```

**FIX / sprint-ortası yeniden-yönlendirme:**
```
sprint-phases.ts:2679 → MidSprintAdapter (mid-sprint-adapter.ts:210/218) → routeTasksV3ForPlan → routeTaskV3
```

### 2b. Flag durumu — "kapatma anahtarı" fiilen yok

- `routing_v3.enabled` → **vestigial** (körelmiş kalıntı): şemada optional (`routing/config.ts:39`),
  kodda hiçbir `if (enabled)` okuması yok. **V3 koşulsuz çalışıyor.**
- Gerçek davranış anahtarı: `routing_v3.governanceMode` (default `'ai'`, `routing/config.ts:67`) —
  routing'i KAPATMAZ; yalnız LLM-zenginleştirme kollarını (content-batch + tie-judge) açar/kapar.
  `'ai'` değilse eşleştirme yine V3, yalnız yapısal (structural) skorlarla.
- Kapatılsaydı ne olurdu? V2 yok, yerine hiçbir şey yok → agent `'generic'` kalırdı. Yani "flag-off"
  = V2'ye dönüş değil, agent-routing'siz kalma. Bu da "V2 hâlâ yedek mi?" sorusunun cevabını kesinleştiriyor: **değil.**

## Adım 3 — V2'nin durumu: zaman çizgisi + kalıntı envanteri

### 3a. Zaman çizgisi

| Aşama | Commit | Tarih |
|---|---|---|
| V2 doğumu ("routing engine v2 — intent-based agent/skill selection with learning") | `ca4a1f04` | 2026-03-26 |
| V3 slice-0 foundation (`src/core/routing3/` doğdu) | `1e813664` | 2026-07-14 |
| V3 slice-1 (deterministik motor el-kodlandı) | `c134c9b4` | 2026-07-15 |
| **V2 ölümü — 8 modül + 61 test dosyası fiziksel silindi; ADR-G-006 amendment merge** | `2c63b777` | 2026-07-15 |
| V3 governance K3 tie-judge | `0fde838a` | 2026-07-19 |
| B16 envelope-unwrap fix (LLM kolu dirildi) | `b05e11f2` | 2026-07-19 |

V2 ~3.5 ay yaşadı; kesim **doğrudan** oldu (shadow-mode yok) — gerekçe `.analysis/routing-v3-system-debug-2026-07-14.md`:
~22 yama-kampanyası/3.5 ay, 8 hata-sınıfının 7'si nüksetti. ADR-G-006 bugünü "RoutingEngineV3 tek-otorite"
olarak belgeliyor (`docs/adr/adr-g-006-routing-selection.md`; amendment arşivde).

### 3b. Kalıntı envanteri (temizlik-adayları buradan çıkıyor)

| Kalıntı | Yer | Durum |
|---|---|---|
| `routing_engine` config alanı (yalnız `'v2'` geçerli; `'v1'→'v2'` coerce) | `config-types.ts:1009,1571` · `config.ts:1150,1495,1776,2125,2693` · `config-migration.ts:279-285` | **Ölü ayar** — değeri hiçbir davranışı değiştirmiyor |
| Kalıcı-true ölü guard'lar: `if (routingVersion === 'v2')` → gövde V3 çağırıyor | `task-mode-runner.ts:208-209` · `cli/commands/run.ts:364-365` · `mcp/tools/run.ts:97-98` (el-doğrulandı) | **Ölü dal** — okunabilirlik borcu |
| `routingVersionForFix` etiketi | `sprint-controller.ts:1202` → `runFixPhase` `:1939` | Yalnız etiket; guard ailesiyle birlikte ele alınmalı |
| `src/core/routing-types.ts` | activation-engine, agent-pool, skill-pool, outcome-tracker, task-router, policy-engine kullanıyor | ⚠️ **CANLI — SİLİNMEZ.** V2-çağı adlandırması yanıltıcı; motor değil tip-SSOT |
| `routing/language.ts` | Başlığı "V2'den verbatim taşındı" diyor | **CANLI** — taşınmış kod, kalıntı değil |
| CLAUDE.md architecture bloğu "`routing-engine.ts` (routeTaskV2)" diyor | CLAUDE.md | **Bayat referans** (blok zaten "drift-açık" işaretli) — göç-sonrası doc-yeniden-yazımında düzelir |

## Adım 4 — V3'ün son-sprint başarısı: canlı kanıt

**Karar üretimi (en güçlü kanıt):** `.deckent/routing/decisions/` altında 44 journal (jsonl) —
sprint-447→455. En yeni `sprint-455.jsonl` son kaydı **2026-07-20T07:57Z** (dün). Sonuç dosyaları
`.deckent/routing/outcomes/` sprint-450…455. Yani V3 kağıt-üstü değil; dün karar üretiyordu.

**Provenance karışımı** (sprint-453/454/455, karar başına hangi kol skorladı): 120 `deterministic` ·
32 `structural` · 28 `llm` → hibrit motor (deterministik ana + LLM içerik/tie-judge kolu) gerçekten ateşliyor.

**Dogfood ölçümleri (MASTER-PLAN row-581 + row-591):**
- Sprint-450 (V3 canlı-doğrulama): **6/6 DONE · 0 NO_GO · 22dk** — 449 baseline: 10/14 · 4 NO_GO · 1sa49dk.
- Sprint-452 (TERM dogfood): **5/5 · 0 NO_GO · 49dk**, ajan-dağılımı sağlıklı.
- Misroute'lar dürüstçe kayıtlı: B11 (doğrulama-task'ı doc sanıldı → ci-guardian'a düzeltildi),
  B12 (i18n işine 'frontend' yüzeyi sızdı → terminal-ux-engineer). B13 (low-confidence kümesi) → 581'e devredildi.

**B16 hikâyesi — "başarı"nın dürüst dip notu:** content-batch ve K3 tie-judge bir gün "✅ shipped"
raporlanmışken ikisi de **prod'da ölüydü**. Kök-neden: `completeFn` provider CLI çıktısındaki zarfı
(`{"type":"result","result":"<escaped JSON>"}`) açmıyordu → content-batch %100 structural-fallback'e
düşüyordu (sessiz), tie-judge `.agentId=undefined` → fail-open hiç ateşlemiyordu. Fix `b05e11f2`
(tek-nokta unwrap, `sprint-planner.ts` +23 satır + gerçek-zarf regression-pin testi). Ders: unit-testler
sahte-completer enjekte ettiği için gerçek yolu hiç sınamamıştı; "%49 low-confidence" diye tartışılan
şey scorer zayıflığı değil **sessiz-fallback**'ti. Fix sonrası 12 gerçek task'ta content-batch 12/12
sınıflandırıyor. (Kanun-3 gereği K3 durumu ✅→⚠️→✅ olarak düzeltilip `640025d3`'te belgelendi.)

**581'de hâlâ açık:** default-on kararı (satırda "Alperen'de, push beklemede" notuyla) · Parça-B
`contentFit` unwired (bilinçli — replay-determinism riski) · B4 planner scope-türetimi.

## Adım 5 — Temizlik karar tablosu (bu analizin çıktısı)

> Kolonlar: **HÜKÜM** = TUT (dokunma) / SİL-ADAYI (Alperen onayıyla silinebilir) / ARŞİV-ADAYI
> (göçte yeni repoya taşınmaz, arşivde kalır) / GÖÇ-KARARI (göç günü karar).

| # | Öğe | Tracked? | HÜKÜM | Gerekçe |
|---|---|---|---|---|
| 1 | `src/core/routing/` (24 modül) | ✓ | **TUT** | 24/24 WIRED — motor + eksenler + governance + CLI tüketicileri (`doctor`, `agent lint`, `analyze`); ORPHAN yok |
| 2 | `src/core/routing-types.ts` | ✓ | **TUT** | Adı V2-çağı ama canlı tip-SSOT (6 çekirdek modül kullanıyor); en fazla göç-sonrası yeniden-adlandırma |
| 3 | `src/orchestra/task-router.ts` | ✓ | **TUT** | Provider-resolver + fallback katmanı olarak canlı (spawn-yolu `sprint-spawner.ts:1294`) |
| 4 | `routing_engine` config alanı + coerce + 3 ölü `=== 'v2'` guard + `routingVersionForFix` | ✓ | **SİL-ADAYI (kod-temizlik)** | Davranışsız ölü ayar/dallar; kaldırılması config-şemasını sadeleştirir. Ayrı küçük iş-kalemi olarak yapılmalı (test + config-migration etkisi var) |
| 5 | `.deckent/routing/decisions-v3/` (yalnız donmuş `sprint-447.jsonl`) | ✗ (yerel) | **SİL-ADAYI (yerel-state)** | Faz-1 rename artığı; canlı dizin `decisions/`. Repo'ya etkisi yok, disk-hijyeni |
| 6 | `.deckent/routing/decisions/sprint-sprint-404.jsonl` | ✗ (yerel) | **SİL-ADAYI (yerel-state)** | Çift-önek adlandırma artığı (tek dosya) |
| 7 | `.analysis/routing-v3-*` (7 dosya, 2026-07-14) | ✓ | **GÖÇ-KARARI / ARŞİV-ADAYI** | Tarihî tasarım+debug kayıtları; V2'yi öldürme gerekçesinin kanıtı. Bu repo READ-ONLY-arşiv olacağı için burada kalmaları doğal; yeni repoya taşınmazlar |
| 8 | `docs/adr/archive/adr-g-006-amendment-v3-2026-07-14.md` | ✓ | **TUT (arşivde)** | Zaten arşiv konumunda; ana ADR'ye merge edilmiş |
| 9 | CLAUDE.md'deki bayat "`routing-engine.ts` (routeTaskV2)" referansı | ✓ | **GÖÇ-KARARI** | Doc-yeniden-yazım dalgasında düzelir; şimdi dokunmaya değmez |

**Silinebilir olmayan net sınır:** `src/core/routing/` ve köprü adapter'ları (routing-plan-adapter,
mid-sprint-adapter) — V3'ün tamamı canlı üretim kodu.

## Adım 6 — Sonraki adımlar (öneri; hiçbiri bu analizde yapılmadı)

1. **Kod-temizlik dilimi** (tablo #4): `routing_engine` alanı + ölü guard'ların kaldırılması —
   küçük, testli, tek-PR'lık iş; MASTER-PLAN'a satır olarak açılabilir.
2. **Yerel-state hijyeni** (tablo #5-6): `.deckent/routing/decisions-v3/` + çift-önek dosya —
   Alperen onayıyla tek `rm`; repo'yu etkilemez.
3. **Göç-listesi girdisi**: Bu tablo, 2026-07-26 göçünün "routing bölgesi" ön-incelemesi olarak
   kullanılabilir (göç-planlaması DEĞİL — yalnız alan-envanteri; plan Alperen emriyle başlar).
4. **581 açıkları** (default-on kararı · Parça-B · B4) temizlikten bağımsız; kendi satırında yürür.

---

### Kanıt kaynakları
- Canlı zincir + modül-durum taraması: bu analiz oturumu, 2 bağımsız keşif + el-teyidi (2026-07-21).
- `docs/MASTER-PLAN.md` row-581 (ROUTING-V3), row-591 (DOGFOOD-449), row-610 (MODEL-ROLE-POLICY).
- `git`: `ca4a1f04` · `1e813664` · `c134c9b4` · `2c63b777` · `0fde838a` · `b05e11f2` · `640025d3`.
- `.deckent/routing/decisions/` + `outcomes/` journal'ları (yerel, untracked).
- `docs/adr/adr-g-006-routing-selection.md` + arşiv amendment.
