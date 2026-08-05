# Non-Linux Execution-Authority Adapter Paketi — Tasarım Önerisi (2026-08-05)

> Sahip satırlar: `PLATFORM-CLEAN-IDENTITY-ADAPTER-001` (3343) + `KERNEL-STATE-001` (3020,
> "native macOS/Windows adapters remain open"). Bu doküman karar-girdisidir, policy üretmez;
> uygulama Alperen'in D1–D3 kararlarıyla başlar.

## 1. Problem — tek cümle
deckent'in execution-authority güvenlik çekirdeği (identity-stable delete + secure-open +
mount-pinning + host/boot kimliği) `/proc`'a bağlı olduğu için **yalnız Linux/WSL'de** çalışır;
macOS ve Windows'ta hem `npm run clean` (rebuild) hem execution-lock yazma-yetkisi dürüst
fail-closed HOLD'dadır. 2026-08-05 observe-dilimi (PR #51) "silinecek şey yokken HOLD"
sınıfını kapattı; **dist'li rebuild ve lock-yazımı** hâlâ Linux-only.

## 2. Kapı envanteri (2026-08-05 ölçümü)
| Site | Mekanizma | Non-Linux davranışı |
|---|---|---|
| `src/core/file-lock.ts:1446` `executionLockPlatformAdapter` | `/proc/self/fd` + O_NOFOLLOW | throw `secure-open-unsupported` (üretim lock'ı) |
| `src/core/file-lock.ts:1467` `executionLockPinnedMountId` | `/proc/self/fdinfo mnt_id` | aynı throw |
| `src/core/file-lock.ts:1252` `detectExecutionLockRuntimeIdentity` | machine-id + boot_id + pid-ns | **zarif düşüş**: process-local identity (zaten portable) |
| `src/core/file-lock.ts:1325` liveness | `/proc/<pid>` | **portable fallback var**: `kill(0)` |
| `scripts/clean.mjs:4025` + `:7203` | file-lock'ın build-öncesi ikizi | HOLD (observe-dilimi sonrası yalnız mutasyonda) |
| `src/core/cross-verify-evidence-broker.ts` | `/proc/self` kullanımı | ayrıca taranmalı (W1 kapsamı) |

Not: `clean.mjs`, `dist/` silindiği İÇİN build-öncesi çalışır ve `src/`'den import edemez —
ikizlik yapısaldır; W1'de ikiz-parite kontrat testiyle sabitlenir.

## 3. Yetenek ayrıştırması — /proc'un Linux'ta verdiği 4 şey
1. **fd-stable traversal**: `/proc/self/fd/N` bir dizin handle'ını path-öneki yapar →
   TOCTOU'suz recursive silme (readdir/unlink/rmdir hep pinli handle üzerinden çözülür).
2. **mount-identity pin**: `fdinfo mnt_id` — bind-mount aliasing'e karşı (Linux'a özgü:
   bind mount'lar aynı `st_dev`'i paylaşır).
3. **host/boot kimliği**: machine-id + boot_id + pid-namespace → lock sahipliğinin
   boot/host sınırı.
4. **PID liveness**: `/proc/<pid>` (portable fallback zaten var).

## 4. Platform tasarımları

### 4.1 Darwin
- (1) için iki yol: **(a)** `/dev/fd/N/child` traversal — Darwin'de dizin-fd üzerinden path
  traversal semantiği belgesiz/varyantlı (kod-içi mevcut yorum da bunu söylüyor); gerçek
  Mac'te **capability-probe** olmadan güvenilemez. **(b)** Native N-API addon ile
  `openat/unlinkat/rmdirat/renameat/fstatat` — kesin, belgeli, POSIX.
- (2): macOS'ta bind-mount yok → mount sınırı `st_dev` karşılaştırması + addon üzerinden
  `fcntl(F_GETPATH)`/`statfs f_fsid` doğrulaması.
- (3): `gethostuuid()` (IOPlatformUUID) + `sysctl kern.boottime`.

### 4.2 Windows
- (1): dizin handle'ı (`FILE_FLAG_BACKUP_SEMANTICS`) + **relative `NtCreateFile`**
  (RootDirectory=handle) = openat eşdeğeri; silme `FILE_DISPOSITION_INFO_EX` +
  `FILE_DISPOSITION_POSIX_SEMANTICS` (Win10 1607+ / NTFS).
- (2): `BY_HANDLE_FILE_INFORMATION` → VolumeSerialNumber+FileIndex (dev+ino eşdeğeri) +
  `GetFinalPathNameByHandle` mount/path doğrulaması.
- (3): registry `MachineGuid` + boot-session (boot zamanı türevi).

### 4.3 Ortak mimari (Law 2 — platform adapter deseni)
Tek küçük **native capability modülü** (`@deckent/exec-authority-native`; N-API, prebuild'li,
optionalDependency; yokluğu = bugünkü typed fail-closed, ASLA sessiz downgrade):
`openDirPinned / statPinned / readdirPinned / unlinkAt / rmdirAt / renameAt / mountIdentity /
hostBootIdentity`. `file-lock.ts` ve `clean.mjs` tek `ExecutionAuthorityPlatformAdapter`
arayüzünden tüketir; Linux impl'i mevcut `/proc` yolunda kalır (davranış değişmez),
Darwin/Windows impl'leri addon'a düşer.

## 5. Faz planı
- **W1 — arayüz çıkarımı** (kod, davranış-değişimsiz): adapter arayüzü + Linux impl arkasına
  taşıma + clean.mjs ikiz-parite kontrat testi + cross-verify-evidence-broker taraması.
- **W2 — capability-probe CI job'ı** (macos+windows runner'da ölçüm: /dev/fd traversal
  semantiği, POSIX-delete uygunluğu, FileIndex kararlılığı) → tasarım kilidi KANITLA atılır.
- **W3 — Darwin adapter'ı** (addon + gerçek-Mac real-binary clean/lock kanıtı, CI'da).
- **W4 — Windows adapter'ı** (addon + real-binary kanıt).
- Her faz kendi receipt'i + MASTER satırıyla; W2 kanıtı W3/W4 tasarım detayını revize edebilir.

## 6. Alperen'in karar noktaları
- **D1 — native addon admission** (ADR-D-005 merit incelemesi): yeni prebuild'li N-API
  bağımlılığı kabul mü? (Emsal: better-sqlite3, @lydell/node-pty zaten native.)
  Alternatifi yok denecek kadar zayıf: /dev/fd Darwin semantiği belgesiz, Windows'ta hiç yok.
- **D2 — Windows OS tabanı**: POSIX-delete için Win10 1607+/NTFS tabanı kabul mü; altı
  typed-unsupported mu kalsın?
- **D3 — adapter gelene dek non-Linux yazma-yetkisi**: bugünkü fail-closed HOLD korunsun
  (önerim: EVET — sessiz downgrade yok) yoksa "process-local degraded" yazım açılsın mı?

## 7. Kapsam sınırı
Bu paket **çalışma-zamanı execution-authority** içindir. `lint-test-hermeticity` gibi
salt-CI script'leri kapsam dışıdır; Docker backend'i Linux-container olduğu için etkilenmez
(host-adapter katmanı hedeftir).

## 8. Karar kaydı + DONE-hazır bekleme listesi (2026-08-05)

**D1+D2+D3 ONAYLANDI (Alperen, 2026-08-05).** Uygulama satırları:
`PLATFORM-EXEC-AUTH-W1-INTERFACE-001` (3344) · `PLATFORM-EXEC-AUTH-W2-PROBE-001` (3346).

### DONE-hazır bekleme listesi (dependency kapanınca anında flip)
| Bekleyen satır | Bloklayan dependency'ler |
|---|---|
| STATUS-SURFACE-PARITY-001 (6121) | RUN-STATUS-AUTHORITY-001 |
| RECOVERY-BORN-486-FINALIZE-CONTAINMENT-001 | RECOVERY-COMMAND-SERVICE-001, RUN-STATUS-AUTHORITY-001, RESULT-RECONCILIATION-001 |
| RECOVERY-BORN-488-DEPENDENCY-AUTHORITY-001 | RECOVERY-BORN-488-LINEAGE-SETTLEMENT-001, SCHEDULER-001, PROMPT-001 |
| RECOVERY-BORN-488-RECOVERY-TERMINAL-001 | PAUSED-FINALIZE-001, RECOVERY-BORN-487-FINALIZER-RECEIPT-HOLD-001, RUN-STATUS-AUTHORITY-001, RECOVERY-BORN-488-LINEAGE-SETTLEMENT-001 |
| RECOVERY-BORN-488-STATUS-PROJECTION-001 | RUN-STATUS-AUTHORITY-001, LINEAGE-SETTLEMENT, RECOVERY-TERMINAL, POST-SETTLEMENT-BINARY + açık 490-çocukları |
| PROVIDER-HOLD-001 | LIMIT-001 |

Bu satırların proof-tokenları ve residual-çıkarmaları 2026-08-05 turunda tamamlandı; tek
eksikleri dependency-DAG kapanışıdır. Her dependency-kapanış merge'ünden sonra bu liste
kontrol edilir (rapor sorumluluğu: aktif oturum).

## 9. ADR-D-005 merit kaydı — @deckent/exec-authority-native (W3-PR-A, 2026-08-05)

- **Yetenek**: openat-ailesi (openDirAt/unlinkAt/renameAt/fstatIdentity/readdirFd) +
  Darwin kimlik kaynakları (fstatfs f_fsid, gethostuuid, kern.boottime). W2 ölçümü
  Darwin'de `/dev/fd` traversal'ının çalışmadığını kanıtladı — native, alternatifi
  olmayan gerçek yetenektir (D1 onayı, Alperen 2026-08-05).
- **Biçim**: in-repo, private N-API modülü (`native/exec-authority/`); npm'e yayın ve
  prebuild'ler W3 kapanış diliminin işidir. Yokluk her tüketicide typed fail-closed
  (D3) — sessiz path-fallback yasak, loader kontratı `index.mjs`'te.
- **Denetim**: tek C dosyası (~330 satır), yalnız POSIX syscall'ları + Darwin-guarded
  kimlik; -Wall -Wextra -Werror; N-API 8. Linux'ta da derlenip test edilir
  (CI: exec-auth-native-build, ubuntu+macos) — Darwin adapter'ı iki platformda
  egzersiz görmüş kod tüketir.
- **Sürüm pinleme**: in-repo olduğundan sürüm = repo commit'i; dış registry riski yok.
- **Not**: ADR-D-005'in işaret ettiği `docs/reference/dependencies.md` docs-reset'te
  arşive gitti; kalıcı bağımlılık-kataloğu evi ayrı açık iştir (DOCS-DEPS-HOME) —
  o eve taşınana dek merit kaydı burada yaşar.

## 10. W3-PR-B tasarımı — op-tabanlı arayüz v2 (2026-08-05, PR-A sonrası)

PR-A'nın macOS kanıtı (PR #58: addon gerçek Darwin'de derlendi, primitive suite 6/6)
sonrası kritik tasarım gerçeği: W1 arayüzünün `stableFdPath` yeteneği **Linux-şekillidir**
— Darwin'de bir dizin-fd'sinin sabit path'i yoktur; tüm işlemler handle-üzerinden
(at-ailesi) gitmek zorundadır. Dolayısıyla PR-B bir adapter-takması değil, tüketici
akışlarının kademeli migrasyonudur:

1. **Arayüz v2 (op-tabanlı)**: `openDirAt(parentHandle, name)`, `readdirOf(handle)`,
   `unlinkAt(handle, name, removeDir)`, `renameAt(...)`, `identityOf(handle)`,
   `mountIdentityOf(handle)`, `realPathOf(handle)` (Darwin: F_GETPATH — native'e
   eklenecek tek yeni primitif). Linux impl'i mevcut /proc-path mekaniğini bu op'ların
   arkasına koyar (davranış-değişimsiz); Darwin impl'i PR-A binding'ini kullanır.
2. **Tüketici migrasyonu**: `pinExecutionLockDirectories` + clean'in pinli traversal'ı
   path-kompozisyonundan op-çağrılarına geçer. Linux'ta bayt-eşdeğerlik mevcut
   suite'lerle kanıtlanır (W1 deseni).
3. **SQLite secure-open (Darwin)**: pinli locks-fd'den `realPathOf` → DB o path'te
   açılır → açılış sonrası fd-identity yeniden doğrulanır (path-swap penceresi
   fd-doğrulamasıyla kapanır); Linux'ta mevcut /proc yolu aynen.
4. **Kapanış kanıtı**: macos CI'da real-binary `npm run clean` (dist'li rebuild) +
   execution-lock yaşam-döngüsü yeşili; Linux regresyon: lock+clean+fence suite'leri.
5. **Tahmin**: 2-3 PR (v2-arayüz+Linux-migrasyon → Darwin-impl+kanıt → temizlik);
   her biri kendi receipt'iyle. Windows (W4) aynı v2 arayüzünü handle-tabanlı
   NT-primitifleriyle doldurur — v2 tasarımı W4'ü de öndeler.

### §10.1 Dilim-2 kaydı (2026-08-06, `GR-2026-08-05-EXEC-AUTH-W3B2-01`)

Uygulanan kapsam — adım-1'in Darwin yarısı:

- **Native**: tek yeni primitif `fdPath(fd)` — Darwin `fcntl(F_GETPATH)`, diğer
  POSIX `/proc/self/fd` readlink (POSIX-portable: Linux CI aynı op yüzeyini
  gerçek-koşuyla test eder). Dönen path handle'ın **CURRENT** path'idir (rename
  sonrası bir sonraki çağrı yeni path'i verir — testle pinli).
- **file-lock**: `darwinNativeExecutionAuthorityOpsV2` — ops-v2 yüzeyinin
  addon-tabanlı Darwin impl'i. Binding lazy+memoized yüklenir (module-eval
  side-effect-free kontratı korunur); yokluk typed `secure-open-unsupported`
  (D3), asla path-fallback yok. `identityOf` mountId'yi `f_fsid` çiftinden
  alır; Linux'ta f_fsid typed-absent olduğundan identityOf Linux'ta fail-closed
  (negatif pin testli). `resolveExecutionAuthorityOpsV2()` platform-çözümlü tek
  giriş: linux→/proc twin (bayt-eşdeğer), darwin→native, diğerleri typed throw.
- **Kanıt**: ubuntu native CI job'ında binding-backed ops'un /proc twin'iyle
  davranış paritesi; macos native job'ında gerçek-Darwin pinli-handle yaşam
  döngüsü (classify/identity-fsid/realPathOf/readdir/rename/unlink).

**Bilinçli dilim-3'e bırakılanlar**: `pinExecutionLockDirectories` + clean.mjs
twin'inin resolver'a bağlanması (konsumer migrasyonu — Darwin'de mkdirAt/
openFileAt/fsyncFd ek primitiflerini de ister), SQLite secure-open Darwin yolu
(realPathOf + post-open fd-identity re-verify), addon'un ürün-kurulum yolunda
derlenme stratejisi (macos E2E'nin gerçek-binary clean/lock yeşili buna bağlı)
ve gerçek-Mac kapanış kanıtı.
