# CI Repair Findings — 2026-08-26

Bu kayıt Faz-A dışında kalan üretim/governance değişikliklerini dondurur. Hiçbiri bu
lane'de uygulanmamıştır.

## CI-F001 — Darwin native authority mevcut, consumer wiring eksik

**Disposition:** `BLOCKS_NATIVE_MACOS_CLEAN` · ana-şerit `src/** + scripts/**` paketi.

**Exact evidence:**

- `src/core/file-lock.ts:1728-1858` Darwin native `ExecutionAuthorityOpsV2` ve
  `resolveExecutionAuthorityOpsV2()` implementasyonunu taşıyor.
- `src/core/file-lock.ts:1860-1915` consumer yine
  `linuxProcExecutionAuthorityAdapter` ve `linuxProcExecutionAuthorityOpsV2`yi doğrudan
  seçiyor; yorumdaki “consumer wiring slice-3” kapanmamış.
- `scripts/clean.mjs:4126-4235` build-time twin yalnız Linux `/proc` implementasyonu.
- `scripts/clean.mjs:7338-7347` delete adapterini non-Linux için `null` döndürüyor;
  `:7681-7687` observe-only yol bile Linux-only maintenance lock'ta HOLD oluyor.
- Canlı macOS native build/probe yeşilken build clean HOLD: native capability var,
  clean consumer'ına bağlanmamış.

**Önerilen diff (uygulanmadı):**

```diff
diff --git a/src/core/file-lock.ts b/src/core/file-lock.ts
@@ function pinExecutionLockDirectories(projectRoot: string)
-  const adapter = linuxProcExecutionAuthorityAdapter.classify();
+  const ops = resolveExecutionAuthorityOpsV2();
+  const adapter = ops.classify();
@@
-  parentFd = linuxProcExecutionAuthorityOpsV2.openDirAt(...)
-  rootFd = linuxProcExecutionAuthorityOpsV2.openDirAt(...)
-  const stableRootPath = linuxProcExecutionAuthorityAdapter.stableFdPath(rootFd)
+  parentFd = ops.openDirAt(...)
+  rootFd = ops.openDirAt(...)
+  const stableRootPath = ops.realPathOf(rootFd)
@@
-  locksFd = linuxProcExecutionAuthorityOpsV2.openDirAt(rootFd, LOCKS_DIR)
+  locksFd = ops.openDirAt(rootFd, LOCKS_DIR)
```

`validatePinnedExecutionLockDirectories` ve close/readdir/rename/unlink consumer'larının
tamamı aynı resolved `ops` instance'ını taşımalıdır; yalnız üç satırlık kısmi değişiklik
production wiring closure sağlamaz.

```diff
diff --git a/scripts/clean.mjs b/scripts/clean.mjs
@@
+import { loadExecAuthorityNative } from '../native/exec-authority/index.mjs';
@@ scripts/clean.mjs:4223
-export const cleanExecutionAuthorityOpsV2 = Object.freeze({ /* linux /proc */ });
+export const linuxCleanExecutionAuthorityOpsV2 = Object.freeze({ /* mevcut gövde */ });
+export function resolveCleanExecutionAuthorityOpsV2() {
+  if (process.platform === 'linux') return linuxCleanExecutionAuthorityOpsV2;
+  if (process.platform === 'darwin') return darwinCleanExecutionAuthorityOpsV2(loadExecAuthorityNative());
+  throw codedError('E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED', process.platform);
+}
@@ scripts/clean.mjs:7338
-  if (process.platform === 'linux') return '/proc/self/fd';
+  return resolveCleanExecutionAuthorityOpsV2();
```

Darwin twin'i native `openDirAt/readdirFd/unlinkAt/renameAt/fstatIdentity/mountIdentity/
fdPath` primitive'lerinin tamamını fail-closed sarmalamalıdır. Acceptance: gerçek macOS
binary üzerinde absent/present `dist`, symlink swap, mount identity, active execution HOLD,
crash/replay ve Linux byte-parity. Windows için sessiz fallback eklenmez.

**Risk:** CRITICAL. Kısmi wiring TOCTOU/delete-authority downgrade yaratabilir. Native
binding yoksa typed `secure-open-unsupported` korunmalıdır.

## CI-F002 — v1 receipt yolu Windows portable-path bütçesini aşıyor

**Disposition:** `RELATED_BUT_NONBLOCKING_WORKFLOW_FIX` · governance/store v2 kararı.

**Exact evidence:**

- Tracked path maksimumu 295 karakter; 259 üstünde tam 1 dosya var.
- `src/core/provider-execution-observation-reconciliation-receipt-store.ts:35` uzun
  domain dizinini; aynı dosya `:103-109` üç ayrı 52-char scope hash'ini, `:171` bunları
  üç nested component olarak ve
  `src/core/provider-execution-observation-reconciliation-receipt-store.ts:205-206`
  64-char receipt hash filename'ini kuruyor.
- Windows checkout bu yolu materialize etmeden exit 128 oluyor. Workflow longpaths
  onarımı taşıma katmanını düzeltir, portable path bütçesini düzeltmez.

**Önerilen v2 şema diff'i (uygulanmadı):**

```diff
diff --git a/src/core/provider-execution-observation-reconciliation-receipt-store.ts b/src/core/provider-execution-observation-reconciliation-receipt-store.ts
@@
-const COMPONENTS = ['.deckent', 'provider-execution-observation-reconciliation', 'receipts', 'v1'] as const;
+const COMPONENTS_V2 = ['.deckent', 'porr', 'r', 'v2'] as const;
+const SCOPE_KEY_DOMAIN = 'deckent:provider-observation-reconciliation-scope-key:v2\0';
+function scopeKey(scope: ProviderExecutionObservationReconciliationReceiptScope): string {
+  return base32(createHash('sha256').update(`${SCOPE_KEY_DOMAIN}${canonical(scope as unknown as Json)}`).digest());
+}
@@ function directory(...)
-  for (const part of [...COMPONENTS.slice(1), scope.projectKey, scope.tenantKey, scope.environmentKey])
+  for (const part of [...COMPONENTS_V2.slice(1), scopeKey(scope)])
```

Yeni yazımlar v2'ye gider; reader/discovery v2'yi önce, v1'i read-only compatibility
olarak sonra tarar. Receipt gövdesindeki üçlü `scope` aynen kalır ve read sırasında
yeniden doğrulanır. V1 veri silinmez; açık migration receipt'i olmadan taşınmaz. Önerilen
yol yaklaşık 142 karakterdir ve validator portable ceiling'i `<=240` olarak pinlemelidir.

**Risk:** HIGH. Scope digest domain separation, discovery bound, collision handling,
multi-tenant isolation, replay ve v1/v2 duplicate receipt determinism'i test edilmeden
şema değiştirilemez.

## CI-F003 — Eski 70-file remote snapshot'ı ana-şeritte kapandı

**Disposition:** `CLOSED_BY_MAIN_REBASE`.

`main@5fd085737` üzerinde 70 benzersiz test dosyası kırmızı. Baskın sınıflar:

- `tests/hermeticity/runtime-write-guard.ts:370` üzerinden sync API'ye `Promise`
  verilmesi ve `node:fs` partial mock'larında `rmSync` eksikliği;
- `ATTRIBUTION_BASELINE_INVALID` ile finalizer/attribution fixture zinciri;
- build job'dan önce `dist/cli/entry.js` bekleyen real-binary testler;
- `tests/scripts/audit-operation-ingress.test.ts` sayısal baseline drift'i;
- `tests/core/acceptance-confirmation-race-scale.integration.test.ts:329` 10 saniye
  performans eşiği.

Ana-şerit bu snapshot'taki beş kök-sınıfı `13bd3920d` ve önceki repair commitleriyle
kapattı; `fa05abbed` ağacında lokal `2.830 dosya / 38.842 test / 0 fail` sertifikası
verildi. Faz-B bu eski kırmızıları test emekliliğiyle maskelemedi. Daha sonraki F1–F5
remote bulguları ayrı olarak CI Root Register'da işlendi.

**Risk:** Kapalı historical snapshot. Yeni full-suite bulguları aşağıdaki CI-F004+
kayıtlarıdır ve CI-F003'ün yeniden açıldığı anlamına gelmez.

## CI-F004 — Lokal runtime-write-guard read-only `open` çağrılarını write kabul ediyor

**Disposition:** `BLOCKS_LOCAL_FULL_SUITE` · approved F1–F5 dışında kaldığı için bu lane'de
uygulanmadı.

**Exact evidence:**

- `tests/hermeticity/runtime-write-guard.ts:523-529` `open`, `openSync` ve
  `fs.promises.open` çağrılarının flag'ine bakmadan `policy.assertWritable(...)` çağırıyor.
- Bu interposition secure-open/pinning için `/tmp` altında yapılan read-only/directory
  descriptor açılışlarını da yazma sayıyor. `src/core/file-lock.ts:1478-1578` fail-closed
  sınıflandırması hatayı `secure-open-unsupported` olarak yüzeye çıkarıyor.
- Exact Phase-B full-suite'te ortak kök `task-execution-admission` (25),
  `clean-active-execution-guard` (13), task fence/file-lock/spawn/limits/settlement
  ailelerinde downstream kırmızılara ve üç unhandled rejection'a yayıldı.
- Aynı production ağacı remote Node 26 Core shard'ında
  `task-execution-admission 26/26 PASS` verdi. Bu nedenle bulgu production secure-open
  downgrade önerisi değil, lokal Node 24 test interposition semantiği bulgusudur.

**Önerilen diff (uygulanmadı):** Node `open` flag'lerini canonical biçimde sınıflandıran
tek helper ekle; yalnız `O_WRONLY`, `O_RDWR`, `O_CREAT`, `O_TRUNC`, `O_APPEND` veya bunların
string eşdeğerleri için writable-policy uygula. `r`, numeric read-only ve directory pin
open'ları pass-through kalırken writable/symlink escape vakaları fail-closed kalmalı.
Acceptance aynı test dosyasında string/numeric flag matrisi + full-suite Node 24/26.

**Risk:** CRITICAL. Bütün `open`ları serbest bırakmak hermeticity guard'ı zayıflatır;
production `file-lock.ts`te fallback eklemek ise security downgrade olur.

## CI-F005 — Canonical lint ratchet'ları onaylı test merge'lerinden sonra stale

**Disposition:** `BLOCKS_20_GATE_LINT` · canonical scripts Phase-B write allowlist'i
dışında; bu lane'de uygulanmadı.

**Exact evidence:**

- `scripts/lint-test-hermeticity.mjs:672,716` inventory count'i hâlâ `16511`, fakat
  canonical digest `118d74c8e54f18c19d071fca97453f7dca2310eee51b3f86269c0fa5f6a918f0`;
  Faz-B ağacı aynı count için
  `127705b801c1a43af815ef49b656eafc3218ce2edefea3b6782c91a7aa3b0b0e` üretiyor.
  `npm run lint` root ve Dashboard tsc katmanlarını geçtikten sonra bu gate'te durdu.
- `scripts/lint-mock-factories.mjs:98,160,254,262` owner-onaylı merge ile kaldırılan dört
  source path'i hâlâ canonical full-factory inventory'sinde tutuyor:
  `tests/cli/commands/output.test.ts`, `tests/cli/onboard.test.ts`,
  `tests/mcp/job-runner.test.ts`, `tests/mcp/resources/resources.test.ts`.
- Canlı karşılıklar sırasıyla `tests/cli/output.test.ts`,
  `tests/cli/commands/onboard.test.ts`, `tests/mcp/tools/job-runner.test.ts`,
  `tests/mcp/resources.test.ts`; equality manifest import/mock yüzeyini korudu.

**Önerilen diff (uygulanmadı):** ana-şerit canonical baseline update'i ayrı committe,
tam `npm run lint` kanıtıyla yapmalı. Hermeticity count değişmemeli, yalnız reviewed
digest güncellenmeli. Mock inventory'de dört eski path canonical hedefleriyle birebir
değiştirilmeli; entry silerek gate'i gevşetmek yasak.

**Risk:** HIGH. Baseline'ı körlemesine regenerate etmek gerçek yeni effect/mock drift'ini
aklayabilir; exact reviewed delta gerekir.

## CI-F006 — Generated README/IDENTITY truth Faz-B test sayımıyla uyumsuz

**Disposition:** `RELATED_BUT_NONBLOCKING_DELIVERY` · generated targets allowlist dışı.

Stats/readme doğrulaması current `2.859` fiziksel test dosyasıyla çalıştırıldığında
`README.md`, `README.tr.md` ve `.deckent/workspace/IDENTITY.md` için generated delta
bildiriyor. F2 testi bu dosyaların repo-root'ta mutate edilmediğini ayrıca kanıtlıyor.

**Öneri:** Faz-B admission'ından sonra ana-şerit supported stats generator'ı bir kez
çalıştırıp üç projection'ı aynı committe almalı; `.deckent/workspace/stats-snapshot.json`
refresh'i ancak owner'ın deliberate snapshot authority'siyle yapılmalı.

**Risk:** Orta. Sayıları elle düzenlemek producer/projection zincirini kırar; bu nedenle
lane allowlist'ini aşarak “düzeltme” yapılmadı.
