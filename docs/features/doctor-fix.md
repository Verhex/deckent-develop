# Doctor Fix — `deckent doctor --fix` Kapalı-Whitelist Onarım

> **Komut:** `deckent doctor --fix` (+ `--yes`/`-y` uygula, `--dry-run` önizlemeyi zorla)
> · **Default davranış:** dry-run (yalnız liste, hiçbir şey yazılmaz)
> **Kaynak:** `src/cli/commands/doctor.ts` — `DOCTOR_FIX_ACTION_KINDS` (L1561),
> `planDoctorFixes` (L1600), `applyDoctorFixes` (L1718), `formatDoctorFixLines` (L1761),
> CLI seçenekleri + action branch (L1837-1884)
> **Doğuş:** sprint-356 Task 356-006 → zenginleştirme sprint-367 Task 367-006

## Ne yapar

`deckent doctor --fix`, `deckent doctor`'ın zaten raporladığı bir grup **güvenli, yıkıcı-olmayan**
sorunu tespit edip (isteğe bağlı olarak) onarır. Onarım kapsamı **kapalı bir whitelist** —
`DOCTOR_FIX_ACTION_KINDS` (`src/cli/commands/doctor.ts:1561`) dışında hiçbir eylem türü asla
planlanamaz veya uygulanamaz:

| Fix tipi | Ne yapar | Tetikleyici |
|----------|----------|-------------|
| `mkdir` | Eksik `.deckent/` veya `.tasks/` dizinini oluşturur | Dizin yok |
| `chmod` | `.tasks/.deck-shadow`'un izinlerini `0o600`'e sıfırlar | Mod `0o600` değil (ör. docker mount izin kayması) |
| `config-migrate` | `migrateConfig()` üzerinden eksik config default'larını ekler | `config.json` parse oluyor ama eksik alan(lar) var |
| `config-recreate` | Bozuk `config.json`'ı `.corrupt.<timestamp>` olarak yedekler, defaults ile yeniden yazar | `config.json` parse OLMUYOR (corrupt JSON) |
| `unlock` | Süresi geçmiş (`STALE_LOCK_THRESHOLD_MS` = 300 000 ms) `.locks/*.lock` dosyasını siler | Kilit `acquiredAt`'tan bu yana >5 dk boşta — `checkStaleLocks()`'un kendi eşiğiyle senkron |

`planDoctorFixes(root)` (L1600) **salt-okunur** çalışır (yalnız `existsSync`/`statSync`/
`migrateConfig(..., {dryRun:true})`) ve bir `DoctorFixAction[]` üretir; hiçbir şeye dokunmaz.
`applyDoctorFixes(actions)` (L1718) bu listeyi ayrı ayrı uygular — bir eylemin hatası diğerlerini
durdurmaz (`DoctorFixApplyResult[]`, her biri kendi `applied`/`error` alanıyla).

`.deck` / docker / login gibi **riskli** hiçbir eylem bu whitelist'te yer almaz ve asla
eklenmeyecektir — bu, özelliğin tasarım garantisidir (bkz. dosya başı yorumu, L1540-1558).

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `--fix` | flag | off | Whitelist'i çalıştırır (`planDoctorFixes`); tek başına yalnız dry-run önizleme basar. |
| `-y`, `--yes` | flag | off | `--fix` ile birlikte: planlanan eylemleri gerçekten uygular (`applyDoctorFixes`). `--fix` olmadan etkisizdir. |
| `--dry-run` | flag | off | `--fix --yes` birlikte verilse dahi önizlemeyi zorlar — açık `--dry-run` her zaman kazanır (`applying = opts.yes === true && opts.dryRun !== true`, L1856). |
| `--json` | flag | off | `--fix` ile birlikte: `{dryRun, actions, results, manual}` JSON çıktısı. |

## Açınca ne değişir

- **Dry-run (default, `--fix` tek başına):** `formatDoctorFixLines(actions, undefined, manual, lang)`
  (L1761) her eylem için bir "would fix" satırı + varsa `previousValue` ("öncesi" özeti) basar,
  sonuna `fix_apply_hint` (nasıl uygulanacağını söyleyen ipucu) ekler. Disk'e hiçbir yazma olmaz.
- **Uygula (`--fix --yes`, `--dry-run` yokken):** `applyDoctorFixes` her eylemi gerçekten çalıştırır
  (`mkdirSync`/`chmodSync`/`migrateConfig(dryRun:false)`/backup+rewrite/`unlinkSync`) ve
  `formatDoctorFixLines` bu kez "fixed" veya "failed" satırları + `previousValue` basar.
- **Manuel liste:** Whitelist dışı kalan başarısız doctor check'leri (`DOCTOR_FIX_CHECK_NAMES` —
  yalnızca `Workspace` ve `Locks` whitelist'e 1:1 eşlenir, L893'teki tanıma bkz.) dürüstçe
  "manual" olarak etiketlenir — `--fix` bunları asla otomatik onarmaz, yalnız isimlerini listeler.
- Sonuç exit code: herhangi bir eylem başarısız olursa (uygulama modunda) veya dry-run'da
  onarılabilir eylem varsa `process.exitCode = 1` (L1879-1882) — CI'da "onarım bekliyor" sinyali.

## Kapalıyken garanti

`--fix` verilmediği sürece `deckent doctor` davranışı **tamamen değişmez** — bu ayrı, erken-dönüş
bir dal (`if (opts.fix) { ...; return; }`, L1855-1884), normal doctor akışına hiç girmez ve hiçbir
yan etkisi yoktur. `--fix` verilse bile `--yes` olmadan (veya `--dry-run` ile) disk'e tek bayt
yazılmaz.

## Riskler

- **`config-recreate` yalnız `.corrupt.<timestamp>` yedeği bırakır, geri-yükleme otomatik değil** —
  bozuk dosya silinmez (yeniden adlandırılmaz, yanına yedek yazılır) ama kullanıcı yanlışlıkla
  defaults'un üstüne yazıldığını fark etmezse eski değerlerini elle o yedek dosyadan geri almalı.
- **`unlock` tek "silme" eylemidir** — ama yalnız `deckent doctor`'ın kendi "Locks" check'inin zaten
  uyardığı aynı 300 sn eşiğini geçmiş bir kilide uygulanır; hiçbir zaman aktif/taze bir kilit
  silinmez (`STALE_LOCK_THRESHOLD_MS`, doctor.ts:1594).
- **`DOCTOR_FIX_CHECK_NAMES` bilinçli olarak dar** (yalnızca `Workspace`+`Locks`) — yeni bir doctor
  check eklenirse ve onarılabilir olsa dahi, bu allowlist'e elle eklenmeden "manual" olarak
  raporlanmaya devam eder; bu kasıtlı bir tasarım kararı (mesaj metninden tahmin yerine açık
  eşleme — "dürüst kalmak özelliğin bütün amacı", L890-891 yorumu).

## Kanıt

- Testler: `planDoctorFixes`/`applyDoctorFixes`/`formatDoctorFixLines` için doctor.ts test ailesi
  (Sprint 356 T-006 + Sprint 367 T-006 zenginleştirme — `previousValue` alanı, geriye-dönük
  uyumlu bare-fixture testleri dahil, bkz. `tests/cli/messages-round9-keys.test.ts`).
- Whitelist kapalılığı: `DOCTOR_FIX_ACTION_KINDS` sabit dizisi + switch-case (`applyDoctorFixes`,
  L1722-1742) — derleme zamanında yeni bir `kind` eklenmeden whitelist genişleyemez.
