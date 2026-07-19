# RUN-RENAME Dilim-3 Envanter — 3 Kilitli Key'in Pre-Flip Ground-Truth Taraması

**Sprint-450 Task 450-003.** Bu doküman **kod değiştirmez** — flip task'ından (dilim-3'ün asıl kod
task'ı) ÖNCE, üç kilitli key'in (`status.sprint_active`, `status.no_sprint`, `status.no_active_sprint`)
literal eski-metnini (sprint-wording) pinleyen HER test satırının grep-doğrulanmış ground-truth
envanteridir. Amaç: flip task'ı hangi satırların kırılacağını, hangilerinin GUARD (tersine-çevrilmesi
gereken) assertion olduğunu ve hangilerinin farklı bir key/kaynağa ait olduğu için DOKUNULMAMASI
gerektiğini önceden bilsin.

## 0. Kilitli 3 Key — Mevcut (flip-öncesi) Literal Değerler

`src/cli/helpers/messages.ts` grep ile doğrulandı:

| Key | EN (satır) | TR (satır) |
|---|---|---|
| `status.sprint_active` | `'Sprint {sprintId} active'` (33) | `'Sprint {sprintId} aktif'` (32) |
| `status.no_sprint` | `'No active sprint'` (37) | `'Aktif sprint yok'` (36) |
| `status.no_active_sprint` | `'No active sprint. Run \`deckent start\` first.'` (242) | `'Aktif sprint yok. Önce \`deckent start\` çalıştırın.'` (243) |

**Dikkat — substring çakışması:** `status.no_sprint`'in EN metni (`'No active sprint'`) `status.no_active_sprint`'in
EN metninin (`'No active sprint. Run...'`) TAM PREFIX'i. TR için de aynı: `'Aktif sprint yok'` ⊂
`'Aktif sprint yok. Önce...'`. Bu yüzden `.toContain('No active sprint')` / `.toContain('Aktif sprint yok')`
şeklindeki assertion'lar HANGİ key'i pinlediğini metinden ayırt ETTİRMEZ — attribution'ı doğru yapmak
için her occurrence'ın **mocked mı unmocked mı** olduğuna ve gerçek production call-site'ına bakmak
gerekti (bkz. §1).

## 1. Production Call-Site Haritası (attribution için kritik ön-bulgu)

`src/cli/**/*.ts` grep taraması, 3 key'in gerçek kullanım yerlerini gösteriyor:

| Key | Production call-site | Not |
|---|---|---|
| `status.no_active_sprint` | `src/cli/commands/status.ts:460`, `:541` | `deckent status` komutunun "dashboard yok / task yok" dallarında GERÇEKTEN çağrılan tek key. |
| `status.sprint_active` | `src/cli/helpers/hints.ts:50` | Hint-metni üretiminde kullanılıyor (status komutunun kendi çıktısında DEĞİL). |
| `status.no_sprint` | **YOK — hiçbir production call-site bulunamadı** | `src/cli/` içinde `getMessage('status.no_sprint', ...)` çağrısı yok. Yalnızca test dosyalarında (messages.test.ts, messages-pending-keys.test.ts) DOĞRUDAN `getMessage('status.no_sprint', ...)` ile egzersiz ediliyor. Prod'da ölü/kullanılmayan key — flip'i sıfır gerçek kullanıcı yüzeyini etkiler, yalnızca bu iki test dosyasını. |

**Sonuç:** Aşağıdaki tabloda "gerçek (unmocked) `deckent status` çalıştırması" yoluyla üretilen
`'No active sprint...'` metinleri HER ZAMAN `status.no_active_sprint`'e aittir (çünkü `status.no_sprint`
prod'da hiç çağrılmıyor) — `status.no_sprint`'e atıf yalnızca doğrudan `getMessage('status.no_sprint', ...)`
çağıran satırlarda geçerlidir.

## 2. Dilim-2 Envanteri ile Çapraz-Referans (HARİÇ listesi sürekliliği)

`.analysis/run-rename-dilim2-inventory.md` okundu:
- **HARİÇ listesi** (dilim-2 §"HARİÇ Listesi", satır 7-23) bu envanterde de geçerli: `sprintId`,
  `sprint-controller`/iç modül adları, dosya/dizin adları, DB-şema alanları, type/interface adları,
  test fixture iç-adları, `deckent_style:"sprint"` config-enum, `kind:"sprint"` enum, `sprint:read`/
  `sprint:write`/`Permission.SPRINT_WRITE` RBAC sabitleri, `GET /api/sprint` route, `KILL_LIVE_SPRINT`,
  `--sprint*` CLI flag ADLARI. Bu 3 kilitli key'in taramasında bunlardan HİÇBİRİ occurrence olarak
  çıkmadı (konu farklı bir yüzey), ama slice-3 flip task'ı için de bağlayıcı kalıyor.
- Dilim-2, satır 33 ve 404'te `status.sprint_active`/`status.no_sprint`'i "dilim-1 34-key listesinde
  YOK, migrasyon GEREKTİRİYOR" olarak doğru işaretlemiş — bu doküman ile tutarlı.
- **Tutarsızlık bulundu (flip task'ına not):** Dilim-2 satır 341 ve 724, `status.no_active_sprint`'i
  `"already-migrated per dilim-1 34-key list"` olarak işaretlemiş. Bu YANLIŞ — dilim-1'in 34-key
  listesinde (dilim-2 satır 29) `status.no_active_sprint` YOK, ve `messages.ts:241-243`'ün mevcut
  içeriği hâlâ literal "sprint" kelimesini taşıyor (bkz. §0). Bu doküman (450-003 task talimatı) da
  `status.no_active_sprint`'i açıkça "kilitli/flip-bekleyen" 3 key'den biri sayıyor — yani mevcut
  kaynak-kodu bu task talimatıyla örtüşüyor, dilim-2'nin o iki satırı hatalı. Flip task'ı bu notu
  dikkate almalı: `status.no_active_sprint` DE flip-target'tır, "zaten yapıldı" diye atlanmamalı.

## 3. Dosya-Bazlı Envanter (12/12 grep-doğrulanmış dosya)

Sütunlar: `satır · mevcut string/ifade · hangi key · sınıflama · not`.
Sınıflama: **FLIP-TARGET** (flip sonrası bu satır kırılır, güncellenmeli) ·
**GUARD** (FLIP-TARGET'ın alt-kümesi — açıkça "eski metin hâlâ böyle kalmalı" diye pinleyen,
tersine-çevrilmesi/silinmesi gereken assertion) · **DO-NOT-TOUCH** (farklı key / yorum / farklı
kaynak dosya / flip'e dayanıklı soft-check).

### 3.1 `tests/cli/commands/status.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 89, 92 | `expect(print).toHaveBeenCalledWith(expect.stringContaining('No active sprint'))` | `status.no_active_sprint` | FLIP-TARGET | `messages.js` bu dosyada mock'lanmamış → gerçek `getMessage` çağrılıyor, status.ts:460/541 üzerinden. |
| 144 | aynı assertion, `isDashboardOrphaned=true` dalı | `status.no_active_sprint` | FLIP-TARGET | Aynı gerekçe. |
| 316 | `// Default for graph tests: active sprint` (yorum) | — | DO-NOT-TOUCH | Kod yorumu, hiçbir key'in literal metnini pinlemiyor; `getCurrentSprintId` mock'unu açıklıyor. |

### 3.2 `tests/cli/commands/status-agents.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 36-37 | `vi.mock(...messages.js...) → if (key === 'status.no_active_sprint') return 'No active sprint.';` | `status.no_active_sprint` | FLIP-TARGET | Key-bazlı mock — eski kısaltılmış metni ("first." son-eki YOK) döndürüyor. Flip'te bu mock'un dönüş değeri de güncellenmeli (gerçek key değişmese dahi test tutarlılığı için). |

### 3.3 `tests/cli/commands/i18n-integration.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 138-142 | `getMessage('status.no_active_sprint','en')` → `.toContain('No active sprint')` + `.toContain('deckent start')` | `status.no_active_sprint` | FLIP-TARGET | Doğrudan gerçek (unmocked) `getMessage` çağrısı — dosya başında `import { getMessage }` gerçek modülden. |
| 144-147 | `getMessage('status.no_active_sprint','tr')` → yalnız `en`'den farklı olduğunu + `'deckent start'` içerdiğini kontrol ediyor | `status.no_active_sprint` | DO-NOT-TOUCH (flip'e dayanıklı) | TR literal metnini pinlemiyor, yalnız en≠tr + ortak alt-string kontrolü — flip sonrası da geçerliliğini korur. |
| 431-434 | gerçek `deckent status` komut çalıştırması, `print` çağrısı `'No active sprint'` içeriyor mu | `status.no_active_sprint` | FLIP-TARGET | `messages.js` bu describe bloğunda da mock'lanmamış. |
| 437-450 | TR config ile aynı komut, `'Aktif sprint yok'` substring kontrolü | `status.no_active_sprint` | FLIP-TARGET | TR literal substring pin. |

### 3.4 `tests/cli/commands.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 494-497 | `runCommand(registerStatus, ['status'])` → `stdout()).toContain('No active sprint')` | `status.no_active_sprint` | FLIP-TARGET | `messages.js` bu dosyada mock'lanmıyor (grep doğrulandı) → gerçek key. |

### 3.5 `tests/cli/status-json-contract.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 176 | `result.stdout).toContain('No active sprint. Run \`deckent start\` first.')` | `status.no_active_sprint` | FLIP-TARGET | Gerçek subprocess (vite-node üzerinden gerçek `status.ts`), mock yok — TAM metni (EN, tam cümle) pinliyor. |
| 187 | aynı assertion, pending-approval senaryosu | `status.no_active_sprint` | FLIP-TARGET | Aynı gerekçe. |

### 3.6 `tests/cli/status-follow.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 33-34 | `vi.mock(...messages.js...) → getMessage: vi.fn().mockReturnValue('No active sprint.')` | key-agnostic (blanket mock) | DO-NOT-TOUCH (flip'e dayanıklı, egzersiz edilmiyor) | Dosya genelinde HERHANGİ bir key için aynı sabit string dönüyor. Dosyada bu mock değerini doğrudan assert eden bir satır YOK (grep + tam-dosya tarama doğrulandı) — yani flip mevcut hiçbir assertion'ı kırmaz. Kozmetik-tutarlılık için güncellenebilir ama zorunlu değil. |

### 3.7 `tests/cli/messages-pending-keys.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 88-91 | `getMessage('status.no_sprint','en')).toBe('No active sprint')` + `('status.no_sprint','tr')).toBe('Aktif sprint yok')` | `status.no_sprint` | **GUARD** | Bkz. §4 — bu satırlar amaçlı olarak "ilgisiz bir key'in davranışı bozulmadı" kanıtı için status.no_sprint'in **mevcut (eski)** metnini sabit-nokta (`.toBe`, tam eşleşme) olarak kullanıyor. |

### 3.8 `tests/cli/helpers/messages.test.ts`

Bu dosya 3 key'i de DOĞRUDAN (mock'suz) `getMessage` ile çağıran, EN/TR literal metni en katı biçimde
(`.toBe` tam eşleşme dahil) pinleyen ANA dosya:

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 15-17 | `KNOWN_KEYS` dizisine 3 key'in adı ekleniyor | 3 key (isim olarak) | DO-NOT-TOUCH (flip'e dayanıklı) | Kullanım yeri (237-250) yalnız `result !== key` (echo-fallback) kontrolü — literal metni pinlemiyor, flip sonrası da geçer. |
| 76-78 | `getMessage('status.no_sprint','en')).toBe('No active sprint')` | `status.no_sprint` | **GUARD** | Tam eşleşme, eski metin. |
| 80-81 | `getMessage('status.no_sprint','tr')).toBe('Aktif sprint yok')` | `status.no_sprint` | **GUARD** | Tam eşleşme, eski metin. |
| 114-116 | `getMessage('status.sprint_active','en',{sprintId:'sprint-042'})).toBe('Sprint sprint-042 active')` | `status.sprint_active` | **GUARD** | Interpolasyonlu tam eşleşme. |
| 149-150 | `getMessage('status.no_sprint','en',{extra:'ignored'})).toBe('No active sprint')` | `status.no_sprint` | **GUARD** | Tam eşleşme (extra-var davranışını test ederken eski metni sabit kullanıyor). |
| 264-269 | `statusKeys = ['status.tasks_running','status.sprint_active','status.no_sprint']` → yalnız `!== key` kontrolü | 2 key (isim olarak) | DO-NOT-TOUCH (flip'e dayanıklı) | Soft-check, literal metin pinlemiyor. |
| 427-428 | `getMessage('status.no_active_sprint','en')).toContain('No active sprint')` | `status.no_active_sprint` | **GUARD** | Substring pin ama açıkça eski-metin varlığını doğruluyor — flip'te kırılır. |
| 431-432 | `getMessage('status.no_active_sprint','tr')).toContain('Aktif sprint yok')` | `status.no_active_sprint` | **GUARD** | TR substring pin. |
| 490-492 | `desktop.shell.bridge.no_sprint` → `.toContain('No live run')`/`'Canlı run yok'` | **FARKLI KEY** (`desktop.shell.bridge.no_sprint`) | DO-NOT-TOUCH | 3 kilitli key'in DIŞINDA, zaten "run" diline migrate edilmiş ayrı bir key — flip kapsamı dışı. |
| 448-451 | `status.graph_no_active_run` → `.toContain('No active run')`/`'Aktif run'` | **FARKLI KEY** (`status.graph_no_active_run`) | DO-NOT-TOUCH | 3 kilitli key'in DIŞINDA, zaten "run" diline migrate edilmiş ayrı bir key. |
| 589-590 | `getMessage('status.sprint_active','en',{})).toBe('Sprint {sprintId} active')` | `status.sprint_active` | **GUARD** | Raw-template (interpolasyonsuz) tam eşleşme. |

### 3.9 `tests/cli/run-language-surface.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 147-150 | `it('status.sprint_active stays "Sprint {sprintId} active" verbatim — ...messages.test.ts hard-asserts..., out of write scope')` → iki `.toBe()` (interpolasyonlu + raw-template) | `status.sprint_active` | **GUARD** | Kendi yorumunda AÇIKÇA "bu satır §3.8'i (messages.test.ts) kırmamak için bilerek dondurulmuş" diyor — 378-002 task'ının kendi kendine belgelediği bir "curated scope-note" guard'ı. |
| 152-154 | `it('status.no_active_sprint stays "No active sprint" verbatim — ...i18n-integration.test.ts hard-asserts..., out of write scope')` → `.toContain('No active sprint')` | `status.no_active_sprint` | **GUARD** | Aynı desen — §3.3'ü (i18n-integration.test.ts) kırmamak için dondurulmuş, kendi kendine belgelenmiş guard. |

### 3.10 `tests/cli/run-rename-smoke.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 22-33 (yorum) | Dosya-başı yorum blok, `status`'un "iki önceden-var, kasıtlı-köprülenmemiş bare 'sprint' yüzeyi" olduğunu, bunlardan birinin `i18n-integration.test.ts:139-140`'ı kırmamak için böyle bırakıldığını açıklıyor | `status.no_active_sprint` (dolaylı) | DO-NOT-TOUCH (yorum) | Kod değil, dokümantasyon — ama flip task'ı bu yorumu da güncellemeli (docImpact, bkz. sonuç). |
| 287-297 | `it('fresh project (no active run): real text is "No active sprint. Run \`deckent start\` first." — documented pre-existing exception (...i18n-integration.test.ts hard-asserts "No active sprint" verbatim; not a 449-008 regression)')` → gerçek binary çalıştırması, `.toContain('No active sprint')` + `.toContain('Run \`deckent start\`')` | `status.no_active_sprint` | **GUARD** | Gerçek `dist/cli/entry.js` spawn'ı (mock yok) — kendi adını "documented pre-existing exception" koyarak flip'in bunu kıracağını ÖNCEDEN kabul ediyor. |
| 302-309 | `it('a live ACTIVE run header is real, current, bare "Sprint 999" ...')` | **FARKLI YÜZEY** (bare `"Sprint <N>"` dashboard header, `human-status.test.ts` sahipliğinde) | DO-NOT-TOUCH | Bu 3 kilitli key'in HİÇBİRİNİN literal metnini içermiyor (`"Sprint {sprintId} active"` değil, yalın `"Sprint 999"`) — farklı bir rename-yüzeyi, dilim-3 kapsamı dışı. |

### 3.11 `tests/mcp/tools/format.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 18-22 | `formatStatusResponse({active:false})).toBe('No active sprint.')` | **YOK — messages.ts'e bağlı değil** | DO-NOT-TOUCH | `src/mcp/helpers/format.ts:84`'teki `return data.message ?? 'No active sprint.';` TAMAMEN hardcoded, `getMessage`/`messages.ts` import'u YOK (grep ile doğrulandı — dosyada hiçbir import satırı yok). Metin tesadüfen örtüşüyor ama farklı bir kaynağa ait; 3 kilitli key flip'i bu dosyayı etkilemez. |
| 94-96 | `formatStatusResponse({})).toBe('No active sprint.')` | aynı | DO-NOT-TOUCH | Aynı gerekçe. |

### 3.12 `tests/e2e/cli-smoke.e2e.test.ts`

| Satır | İfade | Key | Sınıflama | Not |
|---|---|---|---|---|
| 8-9 (yorum) | `// T1: \`deckent status\` (fresh project, no active sprint) → real "No active sprint" text...` | — | DO-NOT-TOUCH (yorum) | Dokümantasyon; docImpact olarak flip task'ına bırakılmalı. |
| 132-133 | gerçek binary (`dist/cli/entry.js`) spawn, `result.stdout).toContain('No active sprint')` + `.toContain('deckent start')` | `status.no_active_sprint` | FLIP-TARGET | Gerçek e2e run, mock yok. |

## 4. GUARD-Assertion Durumu — Açık Cevap (task'ın özel istediği)

**Her iki dosya da EVET, ters-çevrilmesi/kaldırılması gereken locked-key GUARD assertion içeriyor:**

- **`tests/cli/messages-pending-keys.test.ts`** — satır 88-91, `describe('getMessage fallback
  behavior: unaffected by the new health.* keys (no collision)')` bloğu içinde, `status.no_sprint`'in
  **mevcut (eski)** EN/TR metnini `.toBe()` ile tam-eşleşme sabitliyor. Bu assertion'ın orijinal amacı
  "ilgisiz bir key'in davranışı yeni health.* key eklemesinden etkilenmedi" kanıtlamaktı — `status.no_sprint`
  yalnızca "stabil bir referans key" olarak seçilmiş, testin KONUSU rename değil. Flip task'ı bu iki
  satırı ya (a) yeni metne güncellemeli, ya da (b) `status.no_sprint` yerine flip kapsamı dışında kalan
  başka bir stabil key'e (örn. `kill.worker_killed`) referansı değiştirmeli — ikinci seçenek testin asıl
  amacına (collision-yokluğu kanıtı) daha sadık kalır ve gelecekte tekrar aynı çakışmayı önler.

- **`tests/cli/run-rename-smoke.test.ts`** — satır 287-297, kendi adı içinde AÇIKÇA "documented
  pre-existing exception ... not a 449-008 regression" diyerek bu satırın flip'ten SONRA güncellenmesi
  gerektiğini önceden itiraf ediyor. Bu, dosyanın kendi tasarım felsefesiyle (dosya-başı yorum, satır
  10-33: "gerçek metni assert et, sahiplenen suite'i adlandır") tutarlı — flip task'ı bu test'i (ve
  adında geçen `i18n-integration.test.ts:139-140`'ı, bkz. §3.3 satır 138-142) BİRLİKTE güncellemeli;
  biri güncellenip diğeri unutulursa CI kırılır.

**Ek GUARD zinciri (task'ın sormadığı ama flip task'ı için hayati):** `tests/cli/run-language-surface.test.ts`
(§3.9) da kendi kendine belgelenmiş GUARD'lar içeriyor ve bunlar da AYNI ANDA §3.3 ve §3.8'i işaret
ediyor. Yani gerçek bağımlılık zinciri:

```
run-language-surface.test.ts:147-150  ──points-at──>  messages.test.ts (§3.8, status.sprint_active satırları)
run-language-surface.test.ts:152-154  ──points-at──>  i18n-integration.test.ts:138-142 (§3.3)
run-rename-smoke.test.ts:287-297      ──points-at──>  i18n-integration.test.ts:139-140 (§3.3)
```

Flip task'ı bu 4 dosyayı (messages.test.ts, i18n-integration.test.ts, run-language-surface.test.ts,
run-rename-smoke.test.ts) + messages-pending-keys.test.ts'i **TEK ATOMIK COMMIT'TE** güncellemezse,
zincirin ortasındaki bir dosya güncellenip diğeri unutulduğunda CI kırılır (bu 5 dosya birbirinin
"eski metin hâlâ böyle" iddiasına tanıklık ediyor).

## 5. DO-NOT-TOUCH Özet Listesi (dilim-3 kapsamında bulunanlar)

Slice-2'nin HARİÇ listesi sürekliliği + bu taramada ek olarak bulunanlar://

1. **Slice-2 HARİÇ listesi (aynen geçerli, bkz. §2)** — `sprintId`, iç modül adları, dosya/dizin adları,
   DB-şema alanları, type/interface adları, test fixture iç-adları, `deckent_style`/`kind:"sprint"`
   config-enum'ları, RBAC sabitleri, `GET /api/sprint` route, `KILL_LIVE_SPRINT`, `--sprint*` flag adları.
   Bu taramada bunlardan hiçbiri 12 dosyada occurrence olarak çıkmadı.
2. **`src/desktop/out/*`** — build-artifact/derlenmiş-çıktı dizini (bundlenmiş/minified kaynak
   kopyaları). Bu task'ın READ scope'u (`src/cli/helpers/`, `tests/`, `.analysis/`) bu dizini
   kapsamıyor ve 12 grep-doğrulanmış test dosyasının HİÇBİRİ `src/desktop/out/` altında değil — yani
   bu tarama için sıfır occurrence. Yine de kalıcı bir kural olarak burada tekrar kayda geçiriliyor:
   `src/desktop/out/*` altındaki HERHANGİ bir eşleşme asla elle düzenlenmez (derlenmiş çıktı — gerçek
   kaynak `src/desktop/src/renderer/...`'da, dilim-2 §"HARİÇ Listesi" satır 58 ile teyitli).
3. **`desktop.shell.bridge.no_sprint`** (messages.test.ts §3.8 satır 490-492) — 3 kilitli key'in
   dışında, zaten migrate olmuş farklı bir key.
4. **`status.graph_no_active_run`** (messages.test.ts §3.8 satır 448-451) — 3 kilitli key'in dışında,
   zaten migrate olmuş farklı bir key.
5. **`tests/mcp/tools/format.test.ts`** (§3.11, tüm occurrence'lar) — `src/mcp/helpers/format.ts`'teki
   bağımsız hardcoded string, messages.ts'e hiç bağlı değil.
6. **`run-rename-smoke.test.ts:302-309`** (§3.10) — bare `"Sprint <N>"` dashboard header, farklı bir
   rename-yüzeyi (human-status.test.ts sahipliğinde), 3 kilitli key'in literal metnini içermiyor.
7. **Yorum satırları** (`status.test.ts:316`, `run-rename-smoke.test.ts:22-33`, `cli-smoke.e2e.test.ts:8-9`)
   — kod değil, doğrudan test sonucunu etkilemiyor; flip task'ı docImpact olarak not düşebilir ama
   NO-GO nedeni değildir.
8. **Soft-check satırları** (`messages.test.ts:15-17,264-269`) — key-adını `!== key` biçiminde
   kontrol ediyor, literal metne bağlı değil, flip'e dayanıklı.

## 6. Kapsam Doğrulaması

12/12 task-talimatındaki dosya grep + Read ile tek-tek doğrulandı: `tests/cli/commands/status.test.ts`,
`tests/cli/commands/status-agents.test.ts`, `tests/cli/commands/i18n-integration.test.ts`,
`tests/cli/commands.test.ts`, `tests/cli/status-json-contract.test.ts`, `tests/cli/status-follow.test.ts`,
`tests/cli/messages-pending-keys.test.ts`, `tests/cli/helpers/messages.test.ts`,
`tests/cli/run-language-surface.test.ts`, `tests/cli/run-rename-smoke.test.ts`,
`tests/mcp/tools/format.test.ts`, `tests/e2e/cli-smoke.e2e.test.ts`. Hiçbiri atlanmadı, hiçbiri bu
task tarafından DÜZENLENMEDİ (yalnız bu envanter dosyası yazıldı).
