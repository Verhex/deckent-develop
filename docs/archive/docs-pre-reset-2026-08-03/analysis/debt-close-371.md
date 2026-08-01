# DEBT-371-CLOSE — sprint-371 debt kalanı (372-005)

Sprint 372, Task 372-005. Sprint-371'in 2 `GO_WITH_TECH_DEBT` sonucunun (371-001
CATALOG-MATERIALIZE, 371-002 SERVER-WIRE-ENDPOINTS) debt-gerekçesini disk-üzerinde
doğrulayıp, kapatılabilir olanı kapatan, kapatılamayanı gerekçesiyle dokümante eden
kapanış notu. Kaynak: `.brain/archive/sprint-371-tasks/task-371-001.{json,result}` +
`task-371-002.{json,result}`, commit `669b2904` (CC yeşil-süpürme), mevcut
`src/api/limits-endpoint.ts` / `evaluate-health-endpoint.ts` / `server.ts`.

## 371-001 (CATALOG-MATERIALIZE) — debt-gerekçesi: **KAPANDI** (CC-süpürmesiyle, commit 669b2904)

**Açık kalan gerekçe (371-001.result, GO_WITH_TECH_DEBT'in sebebi, 2 kalem):**

1. `tests/core/builtins/catalog-sync-parity.test.ts` — 6 test, "pool membership pool'daki
   varlık `.deckent` manifest.json/agent.json varlığıyla tam açıklanır" invariantını assert
   ediyordu. 371-001'in getirdiği iki-katman fallback (`.deckent` override > builtin default)
   bu invariantı **kasten** çürütüyor — 6 önceden-skip'li goCriteria testi yeşile döner ama
   aynı dosyanın "pool membership == manifest var" testleri artık fail eder (sprint-371'de
   8/15 pass).
2. `tests/core/agent-pool.test.ts` — "`readdirSync` tam 2 kez çağrılır (O(N+1))" testi,
   builtin-tree için eklenen 3. dizin taramasıyla yapısal olarak fail eder (85/86 pass).

Her iki dosya da 371-001'in kendi `scope.filesWrite`'ı dışındaydı (yalnız
`src/core/skill-pool.ts`, `src/core/agent-pool.ts`,
`tests/core/builtins/catalog-materialize.test.ts`) — worker bunu doğru şekilde
GO_WITH_TECH_DEBT olarak bıraktı, düzeltmedi.

**Kapatma kanıtı (commit `669b2904`, "CC yeşil-süpürme" — "parity-testi iki-katman
kontrata taşındı + agent-pool syscall-pin 2→3"):**

- `tests/core/builtins/catalog-sync-parity.test.ts` diff'i: her iki eski
  "pool membership manifest.json/agent.json presence'ıyla tam açıklanır" testi,
  "pool membership iki-katman kontratı izler: `.deckent` manifest VEYA builtin-tree
  varlığı (371-001 D-004 fallback — manifest-only invariantın yerini alır)" olarak
  yeniden yazıldı; assertion artık `expect(inPool).toBe(true)` (builtin-tree'de varsa
  pool'da olmalı) — 371-001'in gerçek davranışıyla eşleşiyor.
- `tests/core/agent-pool.test.ts` diff'i: `expect(fs.readdirSync).toHaveBeenCalledTimes(2)`
  → `toHaveBeenCalledTimes(3)`, yorum güncellenmiş ("persistent + temp + builtin = 3
  calls total — still O(N+1), one readdir per layer").

**Bugün yeniden-doğrulama (disk-verify, bu görev):**

```
npx tsc --noEmit                                                    → temiz (0 hata)
npx vitest run tests/core/builtins/catalog-sync-parity.test.ts \
                tests/core/builtins/catalog-materialize.test.ts \
                tests/core/agent-pool.test.ts \
                tests/api/server-endpoint-wire.test.ts
  → 4 dosya, 120 test, 120 passed (0 failed)
  - catalog-sync-parity.test.ts:  15/15 (sprint-371'de 8/15 idi)
  - agent-pool.test.ts:           86/86 (sprint-371'de 85/86 idi)
  - catalog-materialize.test.ts:  16/16 (değişmedi, zaten yeşildi)
  - server-endpoint-wire.test.ts:  3/3 (değişmedi, zaten yeşildi)
```

**Sonuç: 371-001'in debt-gerekçesindeki 2 kalemin ikisi de gerçekten kapanmış.** Hiçbir
açık kalem yok.

## 371-002 (SERVER-WIRE-ENDPOINTS) — debt-gerekçesi: 1 kalem **KAPANDI** (smoke, bugün), 1 kalem **HÂLÂ AÇIK** (scope-dışı)

**Açık kalan gerekçe (371-002.result, GO_WITH_TECH_DEBT'in sebebi, 2 kalem):**

1. `docImpact`: `src/api/limits-endpoint.ts` ve `src/api/evaluate-health-endpoint.ts`
   dosyalarının kendi header/footer yorumları hâlâ "NOT YET WIRED into server.ts" diyor —
   371-002 bu iki route'u fiilen wire etti ama endpoint-modüllerine yazamadı (nogo:
   "endpoint-modüllerine dokunma"), bu yüzden yorumlar artık bayat.
2. `Smoke`: task'ın kendi `smoke` alanı — `node dist/cli/entry.js serve --port 3219` →
   `GET /api/evaluate-health = 200 && GET /api/limits = 200` — Brain'in host-side
   post-sprint-smoke gate'i; sandbox içinde worker tarafından çalıştırılmamıştı
   (Tier-1 Proof-of-Function, "mock-only test alone = GO_WITH_TECH_DEBT" kuralı gereği).

### Kalem 1 — stale "NOT YET WIRED" yorumları (hâlâ açık, scope-dışı)

Bugün yeniden doğrulandı — yorumlar hâlâ orada, wiring ise fiilen mevcut:

- `src/api/limits-endpoint.ts:20-22`: `// NOT YET WIRED into server.ts — see this
  task's .result notes for the / one-line 'registerLimitsRoute' call site + import to
  add. / Sprint 365 Task 365-006.`
- `src/api/evaluate-health-endpoint.ts:5-6` (özet-yorum) ve `:160-166` (ayrıntılı
  "wiring not applied" bloğu, import + guard satırını elle-eklemek için talimat içeriyor).

Gerçek durum (`src/api/server.ts`, bugün):

- `server.ts:66-67`: `import { registerLimitsRoute } from './limits-endpoint.js';` /
  `import { registerEvaluateHealthRoute } from './evaluate-health-endpoint.js';`
- `server.ts:1044`: `if (await registerLimitsRoute(url, res)) return;`
- `server.ts:1046`: `if (registerEvaluateHealthRoute(url, res, projectRoot)) return;`

Her iki route da 371-002'de (commit `669b2904`) fiilen wired edildi — yorumlar
tam-tersini iddia ediyor.

Bu görevin (372-005) kendi `scope.filesWrite`'ı da `docs/analysis/debt-close-371.md`
ile sınırlı (nogo: "src-değişikliği") — `src/api/*.ts` bu görevin de yazma-yetkisi
dışında. **Kapatılamadı, dürüstçe açık bırakılıyor.** docImpact: ayrı, mekanik bir
takip-görevi (write scope: `src/api/limits-endpoint.ts`,
`src/api/evaluate-health-endpoint.ts`) her iki dosyadaki "NOT YET WIRED" / "not applied
— out of this task's write scope" bloklarını, gerçek wiring'i (server.ts satır
referanslarıyla) yansıtacak şekilde güncellemeli veya tamamen silmeli — kod-tarafında
hiçbir davranış değişikliği gerekmiyor, salt yorum-düzeltmesi.

### Kalem 2 — Smoke doğrulaması: **KAPANDI (bugün)**

`dist/` zaten bugünkü `src/api/server.ts`'ten (ve `limits-endpoint.ts` /
`evaluate-health-endpoint.ts`'ten) SONRAKİ bir mtime'la build edilmişti (`npm run build`
tekrar ÇALIŞTIRILMADI — sprint-kısıtı; mevcut `dist/api/server.js` zaten
`registerLimitsRoute`/`registerEvaluateHealthRoute` import+guard'larını içeriyor,
grep ile doğrulandı). Task'ın kendi `smoke` komutu, mevcut binary üzerinde bugün
gerçek-binary olarak çalıştırıldı:

```
node dist/cli/entry.js serve --port 3219
  → "Deckent is ready — http://127.0.0.1:3219" + auto-mint edilen localhost API token

curl -H "Authorization: Bearer <auto-mint token>" http://localhost:3219/api/limits
  → HTTP 200, body: {"unavailable":false,"reason":null,"windows":[...]}

curl -H "Authorization: Bearer <auto-mint token>" http://localhost:3219/api/evaluate-health
  → HTTP 200, body: {"counts":{...},"lastEventAt":null,"sprintsScanned":11,"clean":true,...}
```

Süreç sonra düzgünce durduruldu (`kill`, ardından `curl` → connection refused ile
teyit edildi). Task'ın `smoke.expect` alanı ("GET /api/evaluate-health = 200 &&
GET /api/limits = 200") birebir doğrulandı — mock değil, gerçek binary + gerçek HTTP
round-trip.

**Sonuç: Smoke-kalemi artık kanıtlı kapalı.**

## Özet Tablo

| Debt | Durum | Kanıt |
|---|---|---|
| 371-001 catalog-sync-parity.test.ts (6 stale assertion) | **KAPANDI** | commit 669b2904 diff (iki-katman kontrata taşındı); bugün 15/15 pass |
| 371-001 agent-pool.test.ts (readdirSync 2→3 syscall-pin) | **KAPANDI** | commit 669b2904 diff (`toHaveBeenCalledTimes(3)`); bugün 86/86 pass |
| 371-002 smoke doğrulaması (evaluate-health + limits = 200) | **KAPANDI (bugün)** | gerçek `dist/cli/entry.js serve` + curl, iki endpoint de HTTP 200 |
| 371-002 stale "NOT YET WIRED" yorumları (limits-endpoint.ts:20-22, evaluate-health-endpoint.ts:5-6+160-166) | **Hâlâ açık** (scope-dışı — bu görev de `src/api/` yazamaz) | server.ts:66-67,1044,1046 fiili wiring vs. endpoint dosyalarının bayat yorumları |

## Ek — 373-005 bağımsız yeniden-doğrulama (2026-07-06)

Bu dosya sprint-372'nin 372-005 görevi tarafından yazılmış (`.brain/archive/sprint-372-tasks/task-372-005.{json,result}`,
`selfAssessment`/`brainEvaluation`: DONE) — ama **sprint-372 hiç commit'lenmemiş**: `git log` sprint-372 için hiçbir
commit göstermiyor (son commit `669b2904`, sprint-371). `git status` bu dosyayı hâlâ `??` (untracked) olarak
gösteriyor. Sonuç: kapanış işi diskte fiilen var ve doğru, ama commit-tabanlı sprint geçmişine göre "görünmez" —
bu yüzden sprint-373 aynı kapanışı 373-005 olarak neredeyse birebir yeniden planladı (kasıtlı tekrar değil, bir
görünürlük boşluğu).

373-005, 372-005'in hiçbir iddiasına güvenmeden, sıfırdan bağımsız doğrulama yaptı:

- `.brain/archive/sprint-371-tasks/task-371-001.result` + `task-371-002.result` yeniden okundu, `git show 669b2904`
  ile commit diff'i taze gözle incelendi (Brain'in "resolved" DB-durumuna güvenilmedi — bkz. proje kuralı
  "Disk-verify ground truth"; ayrıca not: `debt-manager.ts`'teki `resolveDebt(debt-${task.id}, ...)` çağrısı her
  `DONE`/`GO_WITH_TECH_DEBT` sonucunda otomatik tetikleniyor, yani `.brain/exports/debt.md`'deki "resolved" etiketi
  tek başına gerçek bir kapanışın kanıtı SAYILAMAZ — her zaman disk/test/commit ile çapraz-doğrulanmalı).
- `npx vitest run tests/core/builtins/catalog-sync-parity.test.ts tests/core/agent-pool.test.ts` bugün tekrar
  çalıştırıldı → **101/101 pass** (15/15 + 86/86) — 372-005'in raporladığı sayılarla birebir eşleşiyor.
- `grep "NOT YET WIRED"` bugün tekrar çalıştırıldı → yorumlar hâlâ `limits-endpoint.ts:20-22` ve
  `evaluate-health-endpoint.ts:5-6,160-166`'da duruyor; `server.ts:66-67,1044,1046`'daki fiili wiring değişmemiş.
- Smoke testi bugün tekrar, sıfırdan çalıştırıldı (372-005'in sonucuna güvenilmeden): port 3219 boş olduğu
  doğrulandı, `dist/api/server.js` grep'lenerek `registerLimitsRoute`/`registerEvaluateHealthRoute`'un derlenmiş
  binary'de mevcut olduğu teyit edildi (mtime kontrolü: `dist/` sprint-371'in src-değişikliğinden SONRA build
  edilmiş; `npm run build` bugün ÇALIŞTIRILMADI), `node dist/cli/entry.js serve --port 3219 --host 127.0.0.1`
  arka planda başlatıldı, auto-mint edilen localhost token'la her iki endpoint curl'lendi:
  - `GET /api/limits` → HTTP 200, `{"unavailable":false,"reason":null,"windows":[...]}`
  - `GET /api/evaluate-health` → HTTP 200, `{"counts":{...},"lastEventAt":null,"sprintsScanned":11,"clean":true,...}`
  Süreç ardından `kill` edildi, `kill -0` ile ENOENT (süreç yok) teyit edildi.

**Sonuç: 372-005'in tüm iddiaları bugün, bağımsız ve disk-üzerinde yeniden doğrulandı — hiçbir sapma yok.**
371-001 debt-gerekçesi tam kapalı, 371-002'nin smoke-kalemi kapalı, stale-yorum kalemi hâlâ açık (aynı scope
kısıtı: `src/api/*.ts` bu görevin de yazma-yetkisi dışında).

**Yeni docImpact (373-005'e özgü):** bu dosyanın hâlâ commit'lenmemiş olması, sprint-372'nin TÜMÜNÜN commit
dışı kaldığı anlamına gelebilir (yalnız bu dosya değil) — Alperen'in `git status`/`git log` ile sprint-372'nin
diğer 6 görevinin de commit'e ihtiyacı olup olmadığını kontrol etmesi, aksi halde sprint-373 planlamasının
sprint-372'nin GERÇEKTE bitmiş işini tekrar tekrar yeniden-keşfetmeye devam edeceği önerilir.
