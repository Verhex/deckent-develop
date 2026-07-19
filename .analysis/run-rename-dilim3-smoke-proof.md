# RUN-RENAME Dilim-3 Kapanış — Entegrasyon Doğrulama (`450-006` Smoke-Proof)

**Sprint-450 Task 450-006.** Flip task'ının (450-004, atomik 3-key flip) `vitest` sweep +
real-binary `status` smoke + regression-grep + scope-audit kanıtı. Bu doküman **kod değiştirmez**
— yalnızca 450-004'ün sonucunu bağımsız bir worker olarak koşup kanıtlıyor.

## 0. Sonuç Özeti

| Kriter | Durum | Not |
|---|---|---|
| `npx tsc --noEmit` | ✅ PASS | Exit 0, sıfır hata |
| Touched test dosyaları (`vitest run`) | ✅ PASS | 10/10 dosya yeşil, 340 passed / 4 skipped (bilinçli self-skip), 0 failed |
| Real-binary `node dist/cli/entry.js status` → 'run (sprint)' metni | ⚠️ **BLOKE — dist stale** | Kod-seviyesi flip doğru; `dist/` henüz rebuild edilmedi (ESM-cache operating rule gereği bu worker rebuild YAPAMAZ) |
| Regression grep (3 key'in eski literal'i) | ✅ PASS | `tests/` ve `messages.ts` içinde sıfır occurrence |
| Scope audit (`git diff --stat`) | ✅ PASS | `src/desktop/out/*`, `status-follow.test.ts`, `format.test.ts` dokunulmamış; flip-dışı tek yazı `resource-log.jsonl` (host-side telemetry, ilgisiz) + `docs/MASTER-PLAN.md` (kardeş task 450-005, flip kapsamı dışı) |
| Proof-dosyası | ✅ bu doküman | `.analysis/run-rename-dilim3-smoke-proof.md` |

**Genel verdict:** 6/7 kriter tam kanıtlı yeşil. Kalan 1 kriter (real-binary smoke) task
talimatının kendisinin önceden öngördüğü bir durumla bloke: `dist/` flip'ten sonra rebuild
edilmedi ve bu worker'ın rebuild yapması operating-rule ile yasak (`npm run build` sprint
sırasında YASAK — ESM cache + worker auth-loss riski). Bu nedenle **selfAssessment =
GO_WITH_TECH_DEBT**, DONE değil — tam gerekçe §4'te.

---

## 1. `npx tsc --noEmit`

```
$ npx tsc --noEmit
(çıktı boş)
$ echo $?
0
```

Sıfır tip hatası. 450-004'ün `messages.ts` değişikliği (3 key'in `en`/`tr` string literal'lerinin
değeri) tip-şemasını bozmuyor — `MessageMap` değer-tipleri hâlâ `string`.

## 2. Touched Test Dosyaları — `vitest run` Sweep

10 dosya, tek komutta, `VITEST_MAX_FORKS=2` (async spawn-only — spawnSync yasak, ADR-D-002)
ile koşuldu:

```
$ VITEST_MAX_FORKS=2 npx vitest run \
    tests/cli/commands.test.ts \
    tests/cli/commands/i18n-integration.test.ts \
    tests/cli/commands/status-agents.test.ts \
    tests/cli/commands/status.test.ts \
    tests/cli/helpers/messages.test.ts \
    tests/cli/messages-pending-keys.test.ts \
    tests/cli/run-language-surface.test.ts \
    tests/cli/run-rename-smoke.test.ts \
    tests/cli/status-json-contract.test.ts \
    tests/e2e/cli-smoke.e2e.test.ts \
    --reporter=verbose

...
 Test Files  10 passed (10)
      Tests  340 passed | 4 skipped (344)
   Start at  07:37:16
   Duration  10.26s (transform 1.75s, setup 24ms, collect 3.39s, tests 15.42s, environment 1ms, prepare 364ms)

$ echo $?
0
```

**10/10 dosya PASS, sıfır FAIL.** Per-dosya döküm (grep `✓ tests/` ile teyit edildi):
`commands.test.ts`, `commands/i18n-integration.test.ts`, `commands/status-agents.test.ts`,
`commands/status.test.ts`, `helpers/messages.test.ts`, `messages-pending-keys.test.ts`,
`run-language-surface.test.ts`, `run-rename-smoke.test.ts`, `status-json-contract.test.ts`,
`e2e/cli-smoke.e2e.test.ts`.

### "12 touched test files" ibaresi — kapsam-düzeltme notu

Task talimatı "ALL 12 touched test files" diyor, ancak `git diff --stat` **12 DEĞİŞEN DOSYA**
gösteriyor (10 test dosyası + `src/cli/helpers/messages.ts` + `.deckent/settings/resource-log.jsonl`
— ikincisi host-side otomatik telemetry append'i, test dosyası değil). 450-003'ün envanterinde de
"12 dosya" ibaresi geçiyor ama o da **taranan** dosya sayısı (10 flip-target + 2 DO-NOT-TOUCH:
`status-follow.test.ts`, `tests/mcp/tools/format.test.ts`), **değiştirilen** değil. Bu worker
gerçek touched test-dosyası sayısının **10** olduğunu `git status --short` + `git diff --stat` ile
doğruladı ve yukarıdaki sweep'i bu 10 dosya üzerinde eksiksiz koştu — DO-NOT-TOUCH 2 dosyanın
(§5) hâlâ dokunulmamış olduğu ayrıca teyit edildi.

### 4 skip — bilinçli self-skip, FAIL değil

`Tests 340 passed | 4 skipped` — bu 4 skip, `run-rename-smoke.test.ts` (2 adet) ve
`cli-smoke.e2e.test.ts` (2 adet) içindeki, dosyaların KENDİ mtime-karşılaştırma guard'ından geliyor:

```
↓ tests/e2e/cli-smoke.e2e.test.ts > ... > T1: `deckent status` on a fresh project prints the real "no active run (sprint)" message
↓ tests/e2e/cli-smoke.e2e.test.ts > ... > SKIP: dist/cli/helpers/messages.js predates src/cli/helpers/messages.ts (450-004 status.no_active_sprint "run (sprint)" bridge) — needs a host-side `npm run build` (workers may not run it mid-sprint; see WORKER-GUIDE.md)

↓ tests/cli/run-rename-smoke.test.ts > ... > fresh project (no active run): real text is "No active run (sprint). Run `deckent start` first." — bridged by 450-004 (RUN-RENAME dilim-3); tests/cli/commands/i18n-integration.test.ts was updated in the same atomic change
↓ tests/cli/run-rename-smoke.test.ts > ... > SKIP: dist/cli/helpers/messages.js predates src/cli/helpers/messages.ts (450-004 status.no_active_sprint "run (sprint)" bridge) — needs a host-side `npm run build` (workers may not run it mid-sprint; see WORKER-GUIDE.md)
```

Her iki dosya da `statSync(distPath).mtimeMs < statSync(srcPath).mtimeMs` kontrolü yapıyor
(`run-rename-smoke.test.ts:55-56`) ve stale ise real-binary assertion'ı FAIL yerine self-skip
ediyor — açık, isimli bir mesajla. Bu, tam olarak §3'teki dist-staleness bulgusuyla tutarlı ve
test-tasarımı zaten bu senaryoyu bekliyordu (450-004'ün notlarında da örtük olarak var).
`status-json-contract.test.ts` ise `dist/` değil `vite-node` üzerinden SOURCE'u koştuğu için
staleness'tan etkilenmiyor ve tam assertion'larıyla PASS oldu (bkz. §3).

## 3. Real-Binary Smoke — `node dist/cli/entry.js status`

### 3.1 `dist/` staleness — mtime kanıtı

```
$ stat -c '%Y %n' dist/cli/entry.js dist/cli/helpers/messages.js src/cli/helpers/messages.ts
1784444708 dist/cli/entry.js
1784444708 dist/cli/helpers/messages.js
1784446285 src/cli/helpers/messages.ts
```

`src/cli/helpers/messages.ts` (450-004'ün flip commit'i, `b686affd`, `2026-07-19T10:13:27+03:00`)
`dist/`'ten **~26 dakika sonra** değişmiş — yani `dist/` bu flip'i içermiyor.

### 3.2 `dist/cli/helpers/messages.js` içinde hâlâ eski literal var

```
$ grep -n "No active sprint\|Sprint {sprintId}" dist/cli/helpers/messages.js
29:        tr: 'Sprint {sprintId} aktif',
30:        en: 'Sprint {sprintId} active',
34:        en: 'No active sprint',
231:        en: 'No active sprint. Run `deckent start` first.',
```

`src/cli/helpers/messages.ts`'in flip-sonrası hâli (`git diff`, bkz. §6) bu satırların yeni
karşılıklarını (`'Run {sprintId} (sprint) active'`, `'No active run (sprint)'`,
`'No active run (sprint). Run \`deckent start\` first.'`) içeriyor — ama derlenmiş `dist/` hâlâ
eskisini taşıyor. Bu, kod-seviyesi flip'in yanlış olduğu anlamına GELMEZ; yalnızca `dist/`'in
rebuild edilmediği anlamına gelir.

### 3.3 Gerçek binary çalıştırma — no-active-run yolu (fresh dizin)

Bu workspace'in kökünde şu anda **canlı Sprint-450 çalışıyor** (bu görevin kendisi de o sprint'in
bir parçası) — yani `/workspace` içinde `deckent status` çalıştırmak "active sprint" dalına
düşüyor, `status.no_active_sprint`/`status.no_sprint`'i egzersiz etmiyor. Bu yüzden `status.no_active_sprint`
yolunu gerçekten tetiklemek için proje-dışı, temiz bir dizinden çalıştırıldı:

```
$ mkdir -p /tmp/deckent-smoke-test && cd /tmp/deckent-smoke-test && node /workspace/dist/cli/entry.js status
No active sprint. Run `deckent start` first.
```

**Bu çıktı hâlâ ESKİ metni gösteriyor** ("No active sprint...", "run (sprint)" bridge'i YOK) —
`dist/`'in stale olduğunun doğrudan, gerçek-binary kanıtı. Beklenen post-rebuild çıktı (kaynağa
göre, §3.2'nin `src/` karşılığı): `"No active run (sprint). Run \`deckent start\` first."`

### 3.4 `/workspace` içinde çalıştırma (canlı sprint, referans amaçlı)

```
$ node dist/cli/entry.js status
Sprint 450
Progress: 4/6 tasks done (67%)
...
```

Not: `"Sprint 450"` başlığı 3 kilitli key'e ait DEĞİL — `status.sprint_active` yalnızca
`src/cli/helpers/hints.ts:50`'de hint-metni üretiminde kullanılıyor, dashboard başlığı ayrı bir
kod-yolundan geliyor (450-003 envanterinin §3.10 satır 302-309'da "farklı rename-yüzeyi" olarak
zaten DO-NOT-TOUCH işaretlediği yer). Bu çıktı yalnız referans için kaydedildi, goCriteria'nın
kanıtı §3.3'tür.

### 3.5 Neden bu worker rebuild YAPMADI

Proje operating-rule'u açık: *"Sprint çalışırken `npm run build` ve `/login` YASAK (ESM cache +
worker auth-loss)"* (CLAUDE.md `<operating_rules>`) ve task talimatının kendisi de aynı şeyi
tekrarlıyor: *"do NOT run `npm run build` mid-sprint... report the staleness explicitly and rely
on the host-side post-sprint-smoke rerun."* Bu worker bu kurala uydu — `dist/` rebuild edilmedi,
staleness yukarıda kanıtla belgelendi, kapanış host-side post-sprint-smoke'a bırakıldı.

## 4. Neden `GO_WITH_TECH_DEBT` (DONE değil)

goCriteria'nın 7 maddesinden 6'sı tam kanıtlı: `tsc` temiz, 10/10 touched test dosyası yeşil,
regression-grep sıfır, scope-audit temiz, proof-dosyası bu doküman. Yalnızca **real-binary smoke**
maddesi güncel `dist/` ile doğrulanamıyor — ama bu, kodun yanlış olduğu anlamına gelmiyor: hem
mtime kanıtı (§3.1) hem `dist/` içeriği (§3.2) hem gerçek-binary çıktısı (§3.3) tutarlı biçimde
"`dist/` henüz 450-004'ün flip'ini içermiyor" diyor, ve worker'ın bunu düzeltmesi (build) proje
kuralınca yasak. Task talimatı bu senaryoyu zaten öngörmüş: *"a mock-only result here is
GO_WITH_TECH_DEBT, never DONE."* Açık kalan madde: **host-side `npm run build` + bu smoke'un
yeniden koşulması** (post-sprint-smoke) — kapanış için gereken tek adım budur.

## 5. Scope Audit — `git diff --stat`

```
$ git diff --stat
 .deckent/settings/resource-log.jsonl        | 283 ++++++++++++++++++++++++++++
 docs/MASTER-PLAN.md                         |   2 +-
 src/cli/helpers/messages.ts                 |  12 +-
 tests/cli/commands.test.ts                  |   2 +-
 tests/cli/commands/i18n-integration.test.ts |   8 +-
 tests/cli/commands/status-agents.test.ts    |   2 +-
 tests/cli/commands/status.test.ts           |   4 +-
 tests/cli/helpers/messages.test.ts          |  14 +-
 tests/cli/messages-pending-keys.test.ts     |   6 +-
 tests/cli/run-language-surface.test.ts      |  10 +-
 tests/cli/run-rename-smoke.test.ts          |  48 +++--
 tests/cli/status-json-contract.test.ts      |   4 +-
 tests/e2e/cli-smoke.e2e.test.ts             |  33 +++-
 13 files changed, 375 insertions(+), 53 deletions(-)
```

- `src/desktop/out/*` — **sıfır occurrence**, dokunulmamış (grep + diffstat ile teyit).
- `tests/cli/status-follow.test.ts`, `tests/mcp/tools/format.test.ts` — **sıfır occurrence**,
  450-003'ün DO-NOT-TOUCH sınıflamasına (§3.6, §3.11) uygun biçimde dokunulmamış.
- `.deckent/settings/resource-log.jsonl` — flip kapsamı dışı, host-side otomatik container-telemetry
  append log'u (sprint boyunca sürekli büyür, herhangi bir task'ın "scope" ihlali değil).
- `docs/MASTER-PLAN.md` — kardeş task 450-005'in yazısı (MASTER-PLAN 510-D3 satır güncellemesi),
  450-004'ün (flip task) `filesWrite` kapsamının dışında ama bu SPRINT'in başka bir görevine ait,
  scope-violation değil.
- Bu worker'ın (450-006) kendi yazısı yalnız bu proof-dosyası: `.analysis/run-rename-dilim3-smoke-proof.md`.

**Sonuç: scope-violation YOK.**

## 6. Regression Grep — 3 Key'in Eski Literal'i

```
$ grep -rn "'Sprint {sprintId} active'\|'Sprint {sprintId} aktif'\|\.toBe('No active sprint')\|\.toBe('Aktif sprint yok')" tests/
(sıfır sonuç, grep exit=1)

$ grep -n "'Sprint {sprintId} active'\|'Sprint {sprintId} aktif'\|: 'No active sprint'\|: 'Aktif sprint yok'\|'No active sprint\. Run\|'Aktif sprint yok\. Önce" src/cli/helpers/messages.ts
(sıfır sonuç, grep exit=1)
```

Hem `tests/` hem `src/cli/helpers/messages.ts` içinde 3 kilitli key'in eski (pre-flip) literal
metninden **sıfır occurrence** kaldı. 450-003 envanterinin §4'te "ters-çevrilmesi gereken" olarak
işaretlediği GUARD satırları (bkz. §7) doğru biçimde yeni metne flip edilmiş, `.toBe`/`.toContain`
tam-eşleşmeleri artık `'No active run (sprint)'` / `'Run {sprintId} (sprint) active'` /
`'Aktif run (sprint) yok'` bekliyor.

### GUARD-satır kapanışı — 450-003 §4'ün doğrulanması

`git diff` ile teyit edildi, iki GUARD dosyası da **seçenek (a)**'yı (yeni metne güncelle) seçmiş,
`status.no_sprint`'i başka bir stabil key'e taşımamış:

- `tests/cli/messages-pending-keys.test.ts:88-91` → `.toBe('No active run (sprint)')` /
  `.toBe('Aktif run (sprint) yok')`, yorum satırıyla ("Literal updated by 450-004...") gerekçelendirilmiş.
- `tests/cli/helpers/messages.test.ts` (6 GUARD satırı: 76-78, 80-81, 114-116, 149-150, 427-428,
  431-432, 589-590 civarı) → tümü yeni metne güncellenmiş, `.toBe`/`.toContain` tam-eşleşmeler
  tutarlı.
- `tests/cli/run-language-surface.test.ts:147-154` ve `tests/cli/run-rename-smoke.test.ts:287-297`
  — bu ikisi de kendi kendini belgeleyen GUARD zinciriydi (450-003 §4 "Ek GUARD zinciri");
  `git diff --stat` (§5) her ikisinin de bu sprint'te değiştiğini gösteriyor (10 ve 48 satır diff),
  ve §2'nin sweep sonucunda ikisi de PASS (run-rename-smoke.test.ts'in real-binary kısmı ise
  §3'teki stale-dist nedeniyle bilinçli self-skip, FAIL değil).

## 7. Dependency Girdisi (450-004 sonuç özeti — referans)

450-004 (DONE): `src/cli/helpers/messages.ts` + 10 test dosyası, +91/-52. Bu worker o sonucu
bağımsız olarak yeniden-koştu ve yukarıdaki kanıtlarla teyit etti — 450-004'ün kendi raporuna
güvenmedi, her satırı kendi commutu ile doğruladı.

## 8. docImpact

450-003 envanterinin §5 madde-7'sinde işaretlediği yorum-satırları (`status.test.ts:316`,
`run-rename-smoke.test.ts:22-33`, `cli-smoke.e2e.test.ts:8-9`) hâlâ eski "sprint" diliyle yazılmış
olabilir — bu worker'ın write-scope'u yalnız `.analysis/run-rename-dilim3-smoke-proof.md` olduğu
için bu yorumları düzenleyemez; gerekiyorsa ayrı bir docImpact-task olarak takip edilmeli
(kod-davranışını etkilemiyor, yalnız kozmetik/dokümantasyon tutarlılığı).
