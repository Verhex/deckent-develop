# ADR-006: spawnSync Security Pattern

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Tüm subprocess çağrıları **array-args** ile çalıştırılır — `spawn(binary, [...args])` / `spawnSync(binary, [...args])` — **`shell: true` YOK**, shell-interpretation yok. Bu bir **GÜVENLİK invariant'ıdır** (command-injection sıfır) ve **`spawn` ile `spawnSync` ikisi için de** geçerlidir. **Sync-vs-async AYRI bir eksendir** ve [ADR-087](087-async-io-hermeticity-standard.md) tarafından yönetilir (async `spawn` default; `spawnSync` yalnız ADR-087'nin dar istisnaları için).
**Context:** Command injection riski sıfıra indirilmeli. Prompt ve diğer kullanıcı girdileri argument array olarak geçer. Bu güvenlik kuralı, sync-vs-async tercihinden bağımsızdır.
**Consequence:** Template literal veya string concat ile komut oluşturmak yasak. Varsayılan kural: `{ shell: true }` kullanılmaz. Array-args invariant'ı async `spawn`'a da uygulanır (ADR-087 async'i mandatory kılar; güvenlik deseni değişmez).

**Note (documented exceptions):** The `spawnSync(binary, [...args])` array-args rule is the default and is the security baseline. There are **deliberate, narrowly-scoped exceptions** where `shell: true` is used:
- `src/core/plugin-hooks.ts` — sandboxed plugin hook execution.
- `src/core/provider.ts` — Windows only, to resolve `.cmd`/`.ps1` wrapper binaries on `PATH`.

These exceptions never interpolate untrusted input into a command string (args remain arrays / fixed). Compliance is tracked by the ADR-006 check in `src/orchestra/authority-enforcer.ts` (compile-time scan; per ADR-037 V1.0 this is **advisory/soft** — it warns + emits, does not hard-block). Behavior unchanged; documentation alignment only.

---

**Amendment log:** 2026-06-11 — Lafız ADR-087 ile uzlaştırıldı (Alperen ADR-review). ADR-006 artık **güvenlik invariant'ı** (array-args + `shell:true`-yok, `spawn`+`spawnSync` ikisi için); **sync-vs-async** ekseni ADR-087'ye devredildi (async `spawn` default, spawnSync = ADR-087 istisnası). Davranış değişmedi; çelişki giderildi.
