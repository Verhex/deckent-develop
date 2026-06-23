# DESIGN-SPRINT TASLAĞI — R4-DIVERGENT COLLAPSE (design-specified)

> ⚠️ **BU BİR TASLAK — DIRECTIVES.md DEĞİL.** Review et → onaylarsan içeriği `DIRECTIVES.md`'e
> promote ederiz (mevcut R5-A stale-içeriğin yerine) → sprint'i **sen CLI'dan** başlatırsın
> (`env -u ANTHROPIC_API_KEY deckent start`). Sprint başlatmayı/maliyeti sen kontrol edersin.
>
> **Bağlam:** Fix-kampanyasının opportunistic damarı tükendi (B11-wire ✅ / C-cleanup ✅ /
> R4-dedup ✅ — 2 güvenli ikiz yapıldı). Kalan R4 maddeleri **divergent** (kopyalar bilinçli
> farklı) → her biri canonical-yeri + semantik + ADR-008 layering KARARI gerektiriyordu.
> Aşağıdaki §A tasklarında bu kararları architect (CC) önceden verdi → worker tahmin etmeden
> cerrahi uygular + faithful regression yazar. SSOT: `DECKENT-TRIAGE-PLAN.md` §A·R4.

---

## Goal: R4-SSOT divergent-collapse · 4 task · her biri design-specified surgical + anti-false-DONE faithful regression. Hedef: 3-5× yeniden-yazılmış divergent kodu, **architect'in seçtiği canonical'a** indir — davranışı koru veya bilinçli-birleştir (her task'ta açık), ADR-008 layering'e uy.

## Ortak kurallar (BAĞLAYICI — kampanya standardı)
- **SURGICAL**: yalnız `scope.filesWrite`'a yaz, minimum-diff, mevcut-pattern. Var olan davranışı koru (task açıkça "birleştir" demiyorsa).
- **ZORUNLU faithful regression**: davranış-değişimi olan task'larda, yeni davranışı assert eden + **eski/divergent kodda FAIL eden** test ekle (pre-fix RED / post-fix GREEN, `git stash` ile kanıtla, notes'a yaz). Saf-rename task'ta (Task 3) faithful-RED uygulanmaz → kanıt = tsc=0 + tüm etkilenen test yeşil (davranış birebir).
- **ADR-008**: `core/` taban katman — core, orchestra/monitor/cli/agents/api/nervous/connectors/dashboard'tan import EDEMEZ. Canonical her zaman tüm tüketicilerin import edebileceği katmanda (genelde core/).
- **Verify**: `npx tsc --noEmit` EXIT=0 + yeni/etkilenen test yeşil. Sonuçları `.result`'a dürüst yaz (gerçek koşu çıktısı). False-DONE = NO_GO'dan kötü.
- **Kaynak-gerçeği**: divergent kopyaları gerçekten oku; "ikiz sandım" deme — diff'le. Canonical scope dışındaysa veya semantik karar belirsizse → NO_GO + açıkla (fabrike etme).
- **CC-verify**: Brain DONE dese de bu task'lar CC tarafından disk-verify edilecek (R4 riskli — canlı-kopya seçimi). Worker honest-assessment yapsın.

---

## Task 1: R4-ISNOCOLOR — isNoColor superset SSOT (3 imza → 1)
- Model: sonnet | Effort: low | Agent: refactorer | Skills: typescript-expert, testing-expert
- Files: src/cli/helpers/output.ts, src/cli/helpers/sprint-summary-rich.ts, src/cli/commands/dashboard.ts, tests/cli/helpers/output.test.ts (veya ilgili)
- Scope: src/cli/, tests/cli/
### Description
3 divergent `isNoColor`: `output.ts`(env + `--no-color` argv), `sprint-summary-rich.ts`(env-only), `dashboard.ts`(`flagValue` param + env). **ARCHITECT KARARI:** canonical = `cli/helpers/output.ts` (en-çok-kullanılan, zaten export). **Unified signature (SUPERSET — 3 davranışı da korur):**
```ts
export function isNoColor(flagValue?: boolean): boolean {
  return flagValue === true || process.env.NO_COLOR !== undefined || process.argv.includes('--no-color');
}
```
`sprint-summary-rich.ts` + `dashboard.ts` kendi kopyalarını SİL → `output.ts`'ten import et. Hepsi cli/ → ADR-008 engeli yok. NOT: sprint-summary-rich artık `--no-color` argv'yi de onurlandırır (bilinçli birleştirme — tutarlı no-color; davranış-genişlemesi, daralma değil).
**Kanit:** Faithful test — 3 tetikleyicinin (flagValue=true / NO_COLOR env / `--no-color` argv) her birinde `isNoColor()` true döner; eski sprint-summary-rich (env-only) `--no-color`-argv senaryosunda FAIL ederdi. tsc EXIT=0. Tüm cli-test yeşil + zero-dangling.
**Test:** `npx vitest run tests/cli/` ilgili dosyalar yeşil; notes'a pre-fix-red/post-fix-green.

## Task 2: R4-SPRINTID — getCurrentSprintId core-canonical + active→state semantik (3 dosya → 1) 🔴
- Model: sonnet | Effort: high | Agent: refactorer | Skills: typescript-expert, testing-expert
- Files: src/core/event-stream.ts, src/monitor/sprint-state.ts, src/cli/commands/watch.ts, tests/core/event-stream*.test.ts, tests/monitor/*, tests/cli/commands/watch*.test.ts
- Scope: src/core/, src/monitor/, src/cli/, tests/
### Description
3 divergent `getCurrentSprintId` farklı DOSYA okuyor: `event-stream.ts`(core)→`sprint-state.json`/`sprintId`; `monitor/sprint-state.ts`→`sprint-active.json`(öncelik)→fallback `sprint-state.json`; `watch.ts`(cli)→`config.json`/`last_sprint_id` (**bambaşka dosya+alan**). 53 call-site. **ARCHITECT KARARI:**
1. **Canonical = `core/` katmanı** (event-stream.ts'teki mevcut fn'i UPGRADE et VEYA core'da küçük helper) — `monitor/sprint-state.ts`'in **active→state fallback semantiği** en-tam → bunu canonical yap. Dosya yollarını `core/constants.ts DECKENT_DIR`'den türet (`SPRINT_ACTIVE_FILE`/`SPRINT_STATE_FILE` lokal-tekrarlarını core/constants'a taşımayı da bu task içinde yapabilirsin — opsiyonel mini-SSOT).
2. `monitor/sprint-state.ts` → canonical'ı **re-export** et (monitor core'dan import edebilir).
3. `cli/commands/watch.ts` → canonical'a yönlendir. **SEMANTİK DEĞİŞİM (bilinçli):** `watch` artık `config.last_sprint_id` (son-sprint) yerine **aktif sprint**'i (active→state) gösterir — `deckent watch`'un doğru davranışı budur (koşan sprint'i izlersin). Bunu notes + test'te belgele.
4. `event-stream.ts` canonical'ı kullanır → artık `sprint-active.json` override'ını da onurlandırır (eski core versiyonu görmezden geliyordu = latent divergence-fix).
- ADR-008: canonical core'da → tüm tüketiciler (core/monitor/cli/orchestra) güvenle import eder.
**Kanit:** Faithful test 3 senaryo — (a) `sprint-active.json` mevcut → onun `sprintId`'si döner (eski core/event-stream versiyonu bunu IGNORE ederdi = pre-fix RED); (b) yalnız `sprint-state.json` → onunki; (c) watch.ts artık aktif-sprint yansıtır (yeni davranış belgeli). tsc EXIT=0, 53 call-site etkilenen test + monitor/cli/core test yeşil. **Belirsizlik varsa (örn. watch semantik-değişimi istenmiyor) → NO_GO + ADR-draft, fabrike etme.**
**Test:** `npx vitest run tests/core/ tests/monitor/ tests/cli/commands/watch*` yeşil; pre-fix-red/post-fix-green kanıtı.

## Task 3: R4-VITESTPARSE — parseVitestOutput disambiguation (sahte-SSOT → rename)
- Model: sonnet | Effort: low | Agent: refactorer | Skills: typescript-expert
- Files: src/agents/worker-verify.ts, src/core/plugin-hooks.ts, src/orchestra/baseline-tracker.ts + call-site/test dosyaları
- Scope: src/agents/, src/core/, src/orchestra/, tests/
### Description
3 `parseVitestOutput` **gerçekte farklı fonksiyon** (aynı isim): `worker-verify.ts`→`{failedTests[],summary}`; `plugin-hooks.ts`→`{testCount,passed,failed}`; `baseline-tracker.ts`→`TestBaseline` snapshot. Bu SSOT-ihlali DEĞİL, sahte-çakışma → collapse YANLIŞ olur. **ARCHITECT KARARI:** sahte-SSOT sinyalini kaldırmak için **RENAME** (davranış-sıfır): `worker-verify.ts`→`parseVitestFailedTests`, `plugin-hooks.ts`→`parseVitestCounts`, `baseline-tracker.ts`→`parseVitestBaseline`. Tüm call-site + test'leri güncelle. Davranış birebir korunur.
**Kanit:** Pure-rename → faithful-RED uygulanmaz. Kanıt = tsc EXIT=0 + 3 modülün TÜM mevcut testi yeşil (rename-only, davranış değişmedi) + zero-dangling (eski isim hiçbir yerde kalmadı). notes'a "rename-only, davranış birebir" yaz.
**Test:** `npx vitest run tests/agents/ tests/core/ tests/orchestra/` ilgili dosyalar yeşil.

## Task 4: R4-KEYWORDS — extractKeywords core-canonical superset (3 gövde → 1, param'lı)
- Model: sonnet | Effort: medium | Agent: refactorer | Skills: typescript-expert, testing-expert
- Files: src/core/memory-import.ts, src/core/agent-selector.ts, src/orchestra/task-analyzer.ts + test'leri
- Scope: src/core/, src/orchestra/, tests/
### Description
3 divergent `extractKeywords` (CC-diff doğruladı: stopword-list / regex / sonuç-cap farklı): `core/agent-selector.ts`(EN-only), `orchestra/task-analyzer.ts`(EN-only, farklı regex), `core/memory-import.ts`(EN+TR stopword, 15-cap). **ARCHITECT KARARI:** canonical = **core'da tek fn, param'lı** (superset, davranış-koruyucu):
```ts
export function extractKeywords(text: string, opts?: { maxResults?: number; extraStopwords?: Iterable<string> }): string[]
```
- Stopword = EN+TR birleşimi (superset — daralma yok). `maxResults` opsiyonel (default: sınırsız). `memory-import` tüketicisi `{maxResults:15}` ile çağırır (mevcut 15-cap korunur); `agent-selector`/`task-analyzer` cap'siz çağırır (mevcut davranış korunur — keyword düşmez). Regex = en-kapsayıcı punctuation-class.
- `agent-selector` + `task-analyzer` kendi kopyalarını SİL → core canonical'ı import et. ADR-008: core canonical, agent-selector(core)/task-analyzer(orchestra) güvenle import eder.
- **DİKKAT:** agent-selector/task-analyzer EN-only iken canonical EN+TR stopword kullanacak → bu kelimeler (TR stop) artık elenecek. Bunun routing/analiz çıktısını bozmadığını doğrula (TR-stopword İngilizce-task'larda nadiren keyword'dür); bozuyorsa per-consumer `extraStopwords` yerine stopword-set'i param yap. Belirsizse NO_GO + açıkla.
**Kanit:** Faithful test per-call-site — (a) memory-import 15-cap korunur; (b) agent-selector cap'siz tüm keyword'leri döner (eski-divergent regex/stopword'le farklı sonuç verirdi = pre-fix RED); (c) TR-stopword artık elenir. tsc EXIT=0, core/orchestra etkilenen test + adr-file-sync (memory-import tüketicisi) yeşil.
**Test:** `npx vitest run tests/core/ tests/orchestra/` ilgili dosyalar yeşil; pre-fix-red/post-fix-green.

---

## §B — BU SPRINT'E ALINMADI (daha büyük/riskli, ayrı ele alınacak)
- **NervousSystemConfig V1→V2 migration** — `core/nervous-types.ts`(V1 minimal) vs `core/config-types.ts`(V2 full-spec); V1'in **7 tüketicisi** (config/mcp-tools/proposer/dispatcher/bootstrap/decision-engine/cli-nervous). Migration büyük + V1≠V2 yapı → kendi task-batch'i (V2'ye taşı VEYA V1→`NervousSystemConfigV1` rename + deprecate).
- **evaluateResult** (sync `sprint-controller` vs async `result-evaluator`) — eval-path, sync→async migration call-site'larda await-ripple → riskli, careful-trace.
- **waitForResults dead-DI-variant** — 3+ tanım + brain.ts re-export dolaşık; "dead" iddiası doğrulanmadı → careful-trace gerek.
- **ROLE_CAPABILITY_MAP** (array vs Set + farklı rol-modeli) + **max_workers** (3 farklı algo) — enforcement/architecture kararı (B1 + system-capacity tasarımı).

## §C — ENFORCEMENT-VEIN: ÖNCE SENİN POLİTİKA KARARIN GEREK (sprint-spec'ten ÖNCE)
Bu maddeler kod-spec'inden ÖNCE senin ratifikasyonunu bekliyor (ADR-037 V1.0→V2 hard-flip = ürün-davranış kararı). Karar verince ayrı enforcement-design-sprint'e dökerim:
- **B1 RBAC hard-path:** product-default soft kalır; deckent-dev'de hard-mode aç + main-sprint authority-check için **actor/capability-model tasarımı** gerek (task'ta capability-modeli yok). Karar: V2-post-GA mı, yoksa şimdi dogfood-hard mı?
- **B2 worker-scope emit:** soft-block korunur; emit/audit-trail zaten `boundaryViolations` ile sayılıyor → ek-iş gerekmez (doğrulandı). Karar: kapat (no-op) mı?
- **B3 PanicGuard:** tek call-site'ta (graceKill) BLOCK zaten honor ediliyor (doğrulandı) → büyük ölçüde zaten-doğru. Karar: kapat mı?
- **B6 cost-warn:** `daily_max_usd`/`monthly_max_usd` enforce-yok; warn-wire önce **cumulative-spend aggregation** (yok) ister = veri-katmanı tasarımı. Karar: spend-aggregation'a yatırım mı, post-beta mı?
- **A9 enforceAdrCompliance:** unwired (zero prod-caller); wire-kararı + fail-open policy birlikte. Karar: auditor'a wire edilsin mi, edilirse fail-open mı fail-closed mı?

---
_Kaynak: DECKENT-TRIAGE-PLAN.md §A·R4 + R4-sweep verdict (06-23). Taslak — onayınla DIRECTIVES.md'e promote edilir._
