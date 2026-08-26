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
  domain dizinini; `:103-109` üç ayrı 52-char scope hash'ini; `:171` bunları üç nested
  component olarak; `:205-206` 64-char receipt hash filename'ini kuruyor.
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

## CI-F003 — Ana CI snapshot'ı test fixture/runtime drift nedeniyle ayrıca kırmızı

**Disposition:** `BLOCKS_REPO_GREEN`, bu lane'in Faz-A write allowlist'i dışında.

`main@5fd085737` üzerinde 70 benzersiz test dosyası kırmızı. Baskın sınıflar:

- `tests/hermeticity/runtime-write-guard.ts:370` üzerinden sync API'ye `Promise`
  verilmesi ve `node:fs` partial mock'larında `rmSync` eksikliği;
- `ATTRIBUTION_BASELINE_INVALID` ile finalizer/attribution fixture zinciri;
- build job'dan önce `dist/cli/entry.js` bekleyen real-binary testler;
- `tests/scripts/audit-operation-ingress.test.ts` sayısal baseline drift'i;
- `tests/core/acceptance-confirmation-race-scale.integration.test.ts:329` 10 saniye
  performans eşiği.

Öneri: ana-şerit bu 70 dosyayı önce ortak kök bazında yeniden üretmeli; assertion
beklentilerini topluca güncellememeli. Runtime-write-guard üretici düzeltmesi → partial fs
mock contractı → attribution fixture → real-binary job ordering → scale threshold
istatistik kalibrasyonu sırasıyla ayrı commits/gates. Bu testler “CI yeşillensin” diye
emeklilik listesine alınamaz.

**Risk:** CRITICAL. Bu kırmızılar test-yükü azaltma ile maskelenirse production davranış
regresyonları ve test infrastructure drift'i birbirine karışır.

