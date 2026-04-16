# Providers Module — Cross-Cutting Summary
**Task ID:** 142-027-fix | **Model:** opus | **Sprint:** God Analysis

## Modul Genel Bakisi

| Dosya | LoC | Tests | any | @ts-ignore | P0 | P1 | P2 |
|-------|-----|-------|-----|------------|----|----|-----|
| claude.ts | 230 | ~70 | 0 | 0 | 0 | 0 | 2 |
| subprocess.ts | 328 | ~60 | 0 | 0 | 0 | 0 | 1 |
| sandbox.ts | 162 | ~40 | 0 | 0 | 0 | 1 | 2 |
| gemini.ts | 566 | ~90 | 0 | 0 | 0 | 0 | 5 |
| codex.ts | 372 | ~70 | 0 | 0 | 0 | 0 | 4 |
| **TOPLAM** | **1,658** | **~330** | **0** | **0** | **0** | **1** | **14** |

---

## P1: Backend Parity Gap — KRITIK

subprocess.ts, Sprint 139'da BUG-19/23/24/26 duzeltmelerini alirken gemini.ts ve codex.ts bu duzeltmelerden mahrum kalmistir. Bu uclu divergence, provider'lar arasi davranis tutarsizligina neden olmaktadir:

| Bug Fix | subprocess.ts | claude.ts | gemini.ts | codex.ts |
|---------|--------------|-----------|-----------|---------|
| BUG-19 UTF-8 chunk accumulation | EVET | N/A (tmux) | HAYIR | HAYIR |
| BUG-23 Periodic heartbeat | EVET | N/A (tmux) | HAYIR | HAYIR |
| BUG-24 Fallback result on silent exit | EVET | N/A (tmux) | HAYIR | HAYIR |
| BUG-26 Deferred FD close | EVET | N/A (tmux) | HAYIR | HAYIR |

**Etki:** Gemini ve Codex provider kullanildiktan sonra worker'lar heartbeat yazmiyor (false NO_GO riski), sessiz exit'te result dosyasi olusturulmuyor (false NO_GO kesin), log FD erken kapaniyor (log data kaybi).

**Oneri:** subprocess.ts bug fix pattern'larini gemini.ts ve codex.ts'e uygula. Bu bir Sprint 142 P1 gorevidir.

---

## P1: Sandbox Security Gap — KRITIK

sandbox.ts icinde `spawn()` override'i `buildSandboxEnv()` cagrisi YAPMADAN `super.spawn()` devrediyyor. Sonuc:
- Memory limitleri WORKER PROCESS'INE GECMEMEKTEDIR
- Network blocking environment variable'lari GECMEMEKTEDIR
- `buildSandboxEnv()` fonksiyonu YAZILMIS ANCAK ETKISIZ

Bu, sandbox'in temel guvenlik vaadini ihlal ediyor. Duzeltme tek satirlik: `super.spawn(task, workerCmd, { ...env, ...this.buildSandboxEnv(task) })`.

---

## Genel Guclu Noktalar

1. **Type Safety Mukemmel:** 1,658 LoC'da 0 `any`, 0 `@ts-ignore`. Butun provider'lar icin EXCELLENT.
2. **ADR-010 Uyumu:** Hicbir npm dependency. Tum built-in Node.js modullerine bagimli.
3. **Test Coverage Saglikli:** ~330 test toplam, provider'lar iyi test edilmis.
4. **Provider Agnostic Config:** ProviderAdapter interface ile birlesik API — yeni provider eklemek kolaydir.

---

## Genel Zayif Noktalar

1. **Parity Gap:** 4 bug fix sadece subprocess'te — diger provider'lar Sprint 139 oncesi davranisinda
2. **Sandbox bug:** P1 guvenlik garanti ihlali
3. **API key security:** gemini.ts curl komutunda API key gorunuyor (P2)
4. **Dead code:** claude.ts MCP stub (Sprint 048), gemini.ts deprecated buildApiScript/buildStreamingApiScript
5. **Windows support:** codex.ts shell:true eksikligi belgelenmemis

---

## Sprint 142 Oncelikleri

| Priority | Task | Dosya(lar) |
|----------|------|-----------|
| P1 | Sandbox buildEnv bug fix (tek satir) | sandbox.ts |
| P1 | BUG-23/24/26 uygula | gemini.ts, codex.ts |
| P2 | API key security — env var | gemini.ts |
| P2 | Deprecated fonksiyon kaldir | gemini.ts |
| P2 | Windows shell support | codex.ts |
| P3 | MCP stub kaldir | claude.ts |
| P3 | Binary detection cache | codex.ts |

---

## ADR Compliance Ozeti

- ADR-006: subprocess.ts async spawn kullanıyor (UYUMLU). gemini.ts/codex.ts availability check icin execSync (P3 risk dusuk)
- ADR-008: claude.ts borderline (tmux import). Diger provider'lar temiz.
- ADR-010: 5/5 dosya 0 npm dep ile UYUMLU
- ADR-027: Hybrid backend destekleniyor, parity gap var

Modul genel sagligi: **7/10** (sandbox bug ve parity gap nedeniyle dusuk)
