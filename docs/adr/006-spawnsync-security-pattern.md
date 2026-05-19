# ADR-006: spawnSync Security Pattern

**Status:** accepted

**Date:** 2026-04-16

---

**Decision:** Tüm shell komutları `spawnSync(binary, [...args])` ile çalıştırılır, shell interpretation yok.
**Context:** Command injection riski sıfıra indirilmeli. Prompt ve diğer kullanıcı girdileri argument array olarak geçer.
**Consequence:** Template literal veya string concat ile komut oluşturmak yasak. Varsayılan kural: `{ shell: true }` kullanılmaz.

**Note (documented exceptions):** The `spawnSync(binary, [...args])` array-args rule is the default and is the security baseline. There are **deliberate, narrowly-scoped exceptions** where `shell: true` is used:
- `src/core/plugin-hooks.ts` — sandboxed plugin hook execution.
- `src/core/provider.ts` — Windows only, to resolve `.cmd`/`.ps1` wrapper binaries on `PATH`.

These exceptions never interpolate untrusted input into a command string (args remain arrays / fixed). Compliance is tracked by the ADR-006 check in `src/orchestra/authority-enforcer.ts` (compile-time scan; per ADR-037 V1.0 this is **advisory/soft** — it warns + emits, does not hard-block). Behavior unchanged; documentation alignment only.
