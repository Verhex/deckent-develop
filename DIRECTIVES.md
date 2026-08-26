# G0-A CONFIG CONTAINMENT DALGASI — preimage-identity heal + tek transactional write-authority

## Goal

Config-audit admission'ının (docs/archive/evidence-2026-08/config-completion-audit-2026-08-26.md)
G0 incident-containment şeridi kapanır (MASTER 471 CONFIG-AUTHORITY-001 dilimi; owner onayı
"öneri kabul edildi" 2026-08-26): (1) CFG-001 CRITICAL — self-heal artık parse-fail gördüğü
EXACT preimage'i inode+content-digest ile doğrulamadan hiçbir rename/quarantine yapmaz;
preimage değiştiyse typed CONCURRENT_REVISION_HOLD ile dosyaya DOKUNMAZ. (2) CFG-007 —
`.deckent/config.json` (+global config) yazan 10+ dağınık writer tek transactional
write-authority modülüne kablolanır (same-dir unique tmp + 0600 restrictive mode + fsync
file/dir + rename + inter-process lock; approval-broker atomicWriteJson idiomunun
sertleştirilmiş hali). (3) Mekanik kapı: authority dışı direct config-write'ı fail-closed
yakalayan lint gate. (4) Adversarial interleaving kanıtı: hiçbir yarışta valid revision
kaybolmaz. Strike-5 io/parse ayrımı ve strike-4 stage-then-swap davranışı AYNEN korunur —
bu dalga onların ÜSTÜNE preimage-identity katmanını ekler.

## Execution contract

- Otorite: main'deki kontratlar; assertion zayıflatılmaz. Yalnız kendi Files listendeki
  dosyalara yaz; Reads listendekileri OKU. Scope dışına çıkma.
- Testler hermetik (tmpdir; gerçek `.deckent/config.json`'a ASLA yazılmaz). VITEST_MAX_FORKS=2.
- Değiştirdiğin dosyalar için `npx tsc --noEmit` SIFIR hata; çıktıyı result notes'a yaz.
- Aktif run sırasında build/provider-auth/bot mutation YASAK.
- Mevcut strike-4/strike-5 heal pinleri (io-hold, stage-then-swap, parse-proof) YEŞİL kalır;
  davranış değişikliği yalnız yeni preimage-guard ve 0600/fsync/lock katmanıdır.
- Windows/WSL dürüstlüğü (LAW 2): chmod/fsync-dir POSIX-dışında best-effort try/catch ile
  sarılır ve typed olarak loglanır; sessiz varsayım yok.

## Task 1: Core config-write-authority modülü (tmp+0600+fsync+lock+rename)
- Files: src/core/config-write-authority.ts, tests/core/config-write-authority.test.ts
- Reads: src/core/config.ts, src/cli/commands/config.ts, src/core/approval-broker.ts, src/core/constants.ts
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/config-write-authority.test.ts
### Description
YENİ modül `src/core/config-write-authority.ts` — repo'nun yerleşik atomic-write idiomunun
(approval-broker.ts atomicWriteJson: tmp(randomUUID)+write+rename+unlink-on-failure)
config'e özel sertleştirilmiş tek kaynağı. Export'lar: (a)
`writeConfigJsonAtomic(targetPath: string, payload: unknown): void` — same-directory unique
tmp (`.${basename}.${pid}.${randomUUID-kısa}.tmp`), `writeFileSync(tmp, JSON.stringify(payload, null, 2)+'\n', {mode: 0o600})`,
`fsyncSync` dosya (openSync/fsyncSync/closeSync), `renameSync(tmp, target)`, sonra dizin
fsync (POSIX'te `openSync(dir, 'r')`+fsync; hata → try/catch + tek console.error typed not
`CONFIG_DIR_FSYNC_SKIPPED`), başarısızlıkta tmp best-effort unlink + hata fırlatılır
(sessiz yutma YOK); (b) `withConfigWriteLock<T>(targetPath: string, fn: () => T): T` —
`${targetPath}.lock` dizini `mkdirSync` atomik primitifiyle alınır (EEXIST → stale kontrol:
lock içindeki `owner.json` pid'i `process.kill(pid, 0)` ile ölü VE mtime>15sn ise devral,
değilse bounded bekleme ~50ms×40 sonra typed `ConfigWriteLockTimeoutError` fırlat), finally
ile serbest bırakılır; owner.json pid+startedAt taşır; (c) typed hata sınıfları
`ConfigWriteLockTimeoutError` (name alanı sabit). 0-hardcode: config dosya adları caller'dan
gelir, modül path-agnostiktir. Testler (hermetik tmpdir): atomicity (yarım yazım asla
görünmez — büyük payload'da paralel okuyucu ya eskiyi ya yeniyi okur), mode 0600
(process.platform POSIX ise assert, değilse skip-notu), tmp artığı kalmaz (başarı+hata
yolları), lock contention (iki ardışık withConfigWriteLock serileşir; ölü-pid stale lock
devralınır; canlı lock'ta timeout hatası), rename-sonrası içerik birebir. tsc sıfır.

## Task 2: CFG-001 heal preimage-identity + CONCURRENT_REVISION_HOLD
- Files: src/core/config.ts, tests/core/config-heal-preimage.test.ts
- Reads: src/core/config-write-authority.ts, tests/core/config.test.ts, docs/archive/evidence-2026-08/config-completion-audit-2026-08-26.md
- Priority: CRITICAL
- Model: gpt-5.6-sol
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/config-heal-preimage.test.ts
### Description
config.ts:2202-2244 heal bloğu şu sözleşmeye yükseltilir (strike-4/5 davranışı korunarak):
(1) parse-fail anındaki EXACT preimage kayda alınır — `rawText`'in sha256 digest'i +
`statSync` identity (dev, ino, size, mtimeMs); (2) quarantine/rename işlemi Task-1'in
`withConfigWriteLock` kilidi ALTINDA yapılır; (3) rename'den HEMEN önce canonical path
yeniden okunur (readFileSync) ve sha256'sı preimage digest'iyle karşılaştırılır — FARKLIYSA
hiçbir dosyaya dokunulmaz, staged tmp unlink edilir ve tek typed mesaj basılır:
`console.error('[deckent] CONFIG_CONCURRENT_REVISION_HOLD: heal sırasında config başka bir
writer tarafından yenilendi — dosyaya dokunulmadı; yeni revizyon geçerli sayılır')`; okunan
YENİ içerik parse edilir ve parse oluyorsa projectConfig olarak KULLANILIR (sağlıklı yeni
revizyon kabul); parse olmuyorsa bu turda healsiz devam edilir (defaults ile; bir sonraki
yükleme yeniden dener — recovery cold-lane ilkesi, sprint-348 ADR); (4) AYNIYSA mevcut
stage-then-swap sırası aynen yürür, fresh-default staged yazımı Task-1
`writeConfigJsonAtomic` ile yapılır (0600+fsync kazanımı), backup rename'i korunur; io-error
kolu (strike-5 CONFIG_READ_IO_HOLD) bit-değişmez kalır. AYRICA (dosya-kilidi tek sahipte
kalsın diye bu task'ta): config.ts içindeki DİĞER config yazım yolları da authority'ye
delege edilir — config.ts:2710 (await writeFile), config.ts:2782 ve :2798 (merged write);
davranış birebir, yalnız yazım mekaniği değişir. Heal çekirdeği test-sürülebilirlik
için exported saf fonksiyona çıkarılır: `healCorruptProjectConfig(projectConfigPath, rawPreimageText)`
— dönüş typed union {healed, heldConcurrentRevision+adoptedConfig?, failed}. Mevcut çağıran
blok bu fonksiyonu kullanır. YENİ test dosyası deterministik interleaving'leri fonksiyon
seviyesinde sürer: (a) preimage aynı → heal + backup + fresh default + 0600; (b) preimage
farklı + yeni içerik valid → HOLD + dosya bit-değişmez + yeni config adopt; (c) preimage
farklı + yeni içerik de corrupt → HOLD + dosyaya dokunulmaz; (d) mevcut heal pinleri yeşil kalır — Test komutuna EK olarak
`VITEST_MAX_FORKS=2 npx vitest run tests/core/config.test.ts` de koşulur ve sonucu result
notes'a yazılır. tsc sıfır.

## Task 3: Writer-kablolama A — core yardımcıları + CLI authority'ye geçer
- Files: src/core/config-migration.ts, src/core/subscription.ts, src/core/global-config.ts, src/cli/commands/config.ts, tests/core/config-migration.test.ts, tests/core/subscription.test.ts
- Reads: src/core/config-write-authority.ts, src/core/utils.ts, src/core/config.ts
- Priority: HIGH
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/config-migration.test.ts tests/core/subscription.test.ts tests/cli/config-command.test.ts
### Description
(Gerçek-binary proof bilinçli olarak landing-host işidir — sprint build almaz; landing'de
CLI config resolved-JSON smoke'u host tarafından koşulur.)
Core yardımcı katmanındaki project/global config yazarları Task-1 authority'sine delege
edilir — davranış birebir korunur, yalnız yazım mekaniği değişir: config-migration.ts:331,
subscription.ts:158, global-config.ts:45 (global path — aynı authority, 0600).
(config.ts'in KENDİ yazım yolları Task-2'nin işidir — bu task config.ts'e YAZMAZ, yalnız
okur.) src/cli/commands/config.ts içindeki
mevcut `writeConfigFileAtomic` yerel helper'ı SİLİNİR ve çağrıları core authority'ye
yönlendirilir (tek kaynak; ikinci mekanizma bırakılmaz — KANUN 10 absorbe ilkesi).
src/core/utils.ts:237'deki tmp+write deseninin HEDEFİNİ Reads ile doğrula: config-ailesi
dosyası yazıyorsa delege et; değilse DOKUNMA ve result notes'a tek satır tespit yaz.
Her dokunulan yazım yolunun mevcut testi yeşil kalır; mock'lanan fs çağrıları değiştiyse
testlerdeki mock beklentileri gerçek yeni zincire (authority çağrısı) göre güncellenir —
assertion zayıflatma YOK, çağrı-zinciri değişimi dürüstçe pinlenir. tsc sıfır.

## Task 4: Writer-kablolama B — MCP/orchestra yüzeyleri authority'ye geçer
- Files: src/mcp/tools/config.ts, src/mcp/tools/init.ts, src/mcp/tools/nervous.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/managed-docs/docs-config.ts
- Reads: src/core/config-write-authority.ts, src/core/constants.ts
- Priority: HIGH
- Dependencies: Task 1
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/mcp/config-tool.test.ts tests/orchestra/managed-docs.test.ts
### Description
Yüzey katmanındaki config yazarları aynı authority'ye delege edilir:
src/mcp/tools/config.ts:73, src/mcp/tools/init.ts:97-102 (üç yazım),
src/mcp/tools/nervous.ts:63, src/orchestra/sprint-finalizer.ts:1344.
src/orchestra/managed-docs/docs-config.ts:53 için önce hedef dosyayı doğrula: `.deckent/config.json`
ailesi DEĞİLSE (ör. ayrı docs-config dosyası) davranışı koru ama AYNI atomic idiom'a geçir
(writeConfigJsonAtomic path-agnostiktir) ve result notes'a hedef-dosya tespitini yaz.
MCP karar-yüzeyi semantiği DEĞİŞMEZ (read-only sınırlar aynen); yalnız yazım mekaniği
atomikleşir. İlgili mevcut testler yeşil kalır; fs-mock beklentileri gerekiyorsa yeni
zincire göre dürüstçe güncellenir. Test dosyası adları Reads sırasında diskte doğrulanır —
listelenen test yoksa en yakın kapsayan mevcut suite koşulur ve result notes'a yazılır.
tsc sıfır.

## Task 5: Mekanik kapı — lint-config-writers fail-closed gate
- Files: scripts/lint-config-writers.mjs, scripts/script-registry.json, package.json, tests/scripts/lint-config-writers.test.ts
- Reads: scripts/lint-test-hermeticity.mjs, src/core/config-write-authority.ts
- Priority: HIGH
- Agent: ci-guardian
- Dependencies: Task 3, Task 4
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/scripts/lint-config-writers.test.ts
### Description
YENİ gate `scripts/lint-config-writers.mjs`: src/** içinde `writeFileSync|writeFile(`
çağrısı yapan ve hedef ifadesi config-ailesi deseni taşıyan (`config.json` literal'i,
`PROJECT_CONFIG_PATH`, `GLOBAL_CONFIG_PATH` tanımlayıcıları) satırları tarar; authority
modül dosyasının kendi içi (Reads'teki modül) hariç her isabet ihlaldir. Mevcut meşru kalıntılar
için hermeticity-gate'in yerleşik deseni kullanılır: dosya-içi ledger-yorumlu baseline
(sayı+digest; UNRESOLVED_BASELINE emsali scripts/lint-test-hermeticity.mjs) — YENİ ihlal
fail-closed (exit 1), baseline azalması serbest, artışı bloklu. Kapı `scripts/script-registry.json`'a
kayıt edilir ve package.json `lint` zincirine eklenir (mevcut 20-gate zincirinin sonuna;
zincir sözdizimini package.json'dan birebir kopyala). Hermetik test: sahte mini-ağaçta
(tmpdir) ihlalli/ihlalsiz iki fixture ile exit-code + mesaj pinlenir; gerçek repo koşusunda
gate'in YEŞİL olduğu (Task 3+4 sonrası baseline=0 hedefi; kalan meşru istisna varsa
ledger-yorumla gerekçeli) result notes'a yazılır. tsc etkilenmez (mjs); test tsc'ye girmez.

## Task 6: Adversarial interleaving + custody kanıt bataryası
- Files: tests/core/config-heal-race.test.ts
- Reads: src/core/config.ts, src/core/config-write-authority.ts, tests/core/config-heal-preimage.test.ts
- Priority: HIGH
- Dependencies: Task 2, Task 3
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/config-heal-race.test.ts
### Description
YENİ hermetik batarya (tmpdir sahte-proje; gerçek config'e dokunmaz) — G0 exit-gate
kanıtının test tarafı: (1) YARIŞ: corrupt dosya + heal başlarken araya giren writer'ın
yazdığı valid yeni revizyon HİÇBİR interleaving'de kaybolmaz (Task-2 seam'i üzerinden
deterministik: parse-fail→re-read arası dosya değiştirilir → HOLD + adopt); (2)
CRASH-NOKTALARI: staged tmp yazıldıktan sonra rename yapılmadan süreç ölürse canonical
path'te DAİMA valid bir config vardır ve artık tmp bir sonraki heal'de yetim kalmaz
(unlink-yolu); (3) CUSTODY: authority ile yazılan her dosya POSIX'te 0600'dür (backup dahil
DEĞİL — backup rename ile taşınır, mevcut mode'unu korur; bu dürüstçe pinlenir ve G0-B'ye
not düşülür); (4) LOCK: heal ile eşzamanlı ikinci heal serileşir (iki ardışık çağrı tek
kazanan); (5) STRIKE-REGRESYON: io-error kolu (EMFILE simülasyonu — readFileSync throw
mock'u) dosyaya dokunmaz, CONFIG_READ_IO_HOLD basar (strike-5 pini bu bataryada da yaşar).
Her senaryo tek `it` bloğu, betimleyici ad, deterministik (sleep-yarışı YOK — seam-sürümlü).
tsc sıfır.
