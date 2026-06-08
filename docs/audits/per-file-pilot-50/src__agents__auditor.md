# Audit — `src/agents/auditor.ts`

> Per-file audit (Sprint 187 / 50-task pilot — actually executing as Sprint 186 task 186-004).
> Source line count: **13 LoC** (re-export stub only — no runtime logic).

---

## 1. Inventory

| Field | Value |
|-------|-------|
| Path | `src/agents/auditor.ts` |
| LoC (raw) | 13 |
| Effective LoC (non-comment, non-blank) | 6 (single `export { ... } from '...'` block) |
| File kind | Re-export shim / thin integration layer |
| Created | Sprint 143 (Layer 4 Runtime Wire — ADR-006/008/010 enforcement integration) |
| Last semantic change | Sprint 143 (no edits since) |

### Exports

Re-exports three symbols from `../orchestra/authority-enforcer.js`:

| Symbol | Kind | Source |
|--------|------|--------|
| `enforceAdrCompliance` | function | `src/orchestra/authority-enforcer.ts:573` |
| `AdrViolation` | type | `src/orchestra/authority-enforcer.ts` |
| `AdrComplianceResult` | type | `src/orchestra/authority-enforcer.ts` |

### Imports

| Specifier | Kind | Purpose |
|-----------|------|---------|
| `../orchestra/authority-enforcer.js` | runtime + types | Source of all re-exports |

No other imports. Zero side effects on module load.

### Reverse dependencies

`grep -r "from ['\"].*agents/auditor"` across `src/` and `tests/` → **0 matches**.

Direct consumers of the re-exported symbols (all bypass this stub):

| Consumer | Imports from | Notes |
|----------|--------------|-------|
| `src/monitor/auditor.ts:31` | `../orchestra/authority-enforcer.js` | uses `checkAuthority`, `emitAuthorityViolation` (not `enforceAdrCompliance`) |
| `tests/orchestra/layer4-runtime.test.ts:10` | `../../src/orchestra/authority-enforcer.js` | tests `enforceAdrCompliance` directly |
| `src/orchestra/authority-enforcer.ts` | (self) | symbol defined here |

`src/agents/worker.ts` does **not** import `enforceAdrCompliance` (the previous grep hit was a false positive on substring match in unrelated tokens — re-confirmed in this audit).

---

## 2. Bağlam (Architectural Context)

`src/agents/auditor.ts` Sprint 143 *Layer 4 Runtime Wire* sırasında **Brain'in EVALUATE fazından `enforceAdrCompliance` çağrısına bir köprü** olarak eklendi. Tasarım niyeti şuydu:

- Brain ↔ ADR enforcement integration noktasını **agents/** katmanında belirginleştirmek (anlamsal organizasyon).
- Worker raporları okunduğunda ADR-006 (spawnSync), ADR-008 (Brain merkezi import / core→orchestra yasağı) ve ADR-010 (dep whitelist) ihlalleri için tek bir agent-katmanı facade vermek.
- `monitor/auditor.ts` (background scan loop) ile `agents/auditor.ts` (ADR compliance facade) ikilisi, ADR-035 Verification Protocol'ünün auditor authority extension boyutunu temsil ediyor.

Pratikte ise: **Brain doğrudan `orchestra/authority-enforcer.js`'i çağırıyor** ve Sprint 145 spec'lerinde belirtildiği gibi (`.brain/exports/sprint-145-adaptive-timeout-spec.md:311`) dosya halen "13 satırlık re-export shim" durumunda; ek runtime davranışı yok.

İsim çakışması: `src/monitor/auditor.ts` (300+ LoC, gerçek scan-loop) ile aynı kısa adı paylaşıyor. Sprint 171 audit (R-9 / B-18) ve `docs/audits/dynamic-split/agents-nervous-monitor-audit.md` rename önerisi yaptı: **`src/agents/adr-compliance-shim.ts`** veya re-export'u doğrudan kaller'lara inline et.

ADR-037 ile ilişki: Stub'ın re-export ettiği `enforceAdrCompliance` ADR-037 Authority Matrix'in **soft enforcement** kolunu (warn-only, V1.0) implemente ediyor. Stub yalnızca symbol erişim katmanıdır; politika kodu burada değildir.

ADR-038 ile ilişki: Sprint 145'te bu dosya `refactorer` agent tarafından yanlışlıkla dead code olarak silinme tehlikesi geçirdi → "korumalı dosya listesi" önerisi yapıldı. Bu durum **self-modifying task detection** için canlı bir vakadır.

---

## 3. Debt Risk

| ID | Risk | Severity | Likelihood | Impact |
|----|------|----------|------------|--------|
| D-1 | Re-export stub'ı **hiçbir src/ dosyası tüketmiyor** → klasik dead code | 🟡 MEDIUM | HIGH (kanıtlandı) | Az LoC, ama yanlış semantik sinyal yayıyor |
| D-2 | İsim çakışması (`agents/auditor.ts` vs `monitor/auditor.ts`) → IDE jump-to-definition ve grep yanıltıcı | 🟡 MEDIUM | HIGH | Onboarding sürtünmesi, code review hatası riski |
| D-3 | Yorum bloğunda "Sprint 143" demir-yumruklu referans; ileride Sprint 143 anlamını yitirirse stale comment olur | 🟢 LOW | MEDIUM | Düşük; ama ADR-036 governance temizliği için aday |
| D-4 | `refactorer` agent benzer "ölü görünen" 13-LoC dosyaları otomatik silebilir — Sprint 145'te zaten bir kez denedi (T-144-007) | 🟠 HIGH | MEDIUM | Eğer korumalı liste runtime-enforce edilmezse silme → tip hatası → sprint regresyonu |
| D-5 | Re-export stub için **dedicated test yok** (`tests/agents/auditor.test.ts` bulunamadı) — şu an riski düşük çünkü davranış yok, ama yeniden behavior eklenirse test boşluğu | 🟢 LOW | LOW | Stub bazlı; kaynak modüldeki testler `tests/orchestra/layer4-runtime.test.ts` ile karşılanıyor |

Toplam: 5 risk maddesi (2 MEDIUM, 1 HIGH likelihood, 2 LOW).

---

## 4. Dead Code Candidates

**Tüm dosya dead code adayıdır.** Kanıt:

```bash
# Hiçbir source ya da test dosyası agents/auditor'dan import etmiyor
$ grep -rE "from ['\"].*agents/auditor" src/ tests/
# (0 matches)

# Re-export edilen üç sembol için doğrudan kullanım, hep authority-enforcer'dan:
$ grep -rn "enforceAdrCompliance" src/ tests/
src/orchestra/authority-enforcer.ts:573:export function enforceAdrCompliance(
src/agents/auditor.ts:9:  enforceAdrCompliance,
tests/orchestra/layer4-runtime.test.ts:10:  enforceAdrCompliance,
tests/orchestra/layer4-runtime.test.ts:185:      const result = enforceAdrCompliance(...)
# Hiçbiri 'agents/auditor.js' specifier'ından gelmiyor — direkt orchestra'dan.

# AdrViolation / AdrComplianceResult sadece tanım yerlerinde
$ grep -rn "AdrViolation\|AdrComplianceResult" src/ tests/
# (yalnızca authority-enforcer.ts ve agents/auditor.ts'de — başka caller yok)
```

Eğer Sprint 188'de inline-and-delete uygulanırsa, **build hatası beklenmez** (kimse import etmiyor).

Sprint 145 spec'inde (`sprint-145-adaptive-timeout-spec.md:333`) T-144-006 worker notu zaten şunu söyledi: *"src/agents/auditor.ts is only 13 lines (re-export), no sync I/O to convert"* — yani sprint 144 async I/O refactor'una konu olmadı çünkü içinde I/O yoktu.

---

## 5. Documentation Gaps

| Gap | Açıklama | Önerilen Aksiyon |
|-----|---------|------------------|
| G-1 | Dosya header yorumu (`Auditor ADR Compliance Integration`) **callerların gerçekte buradan çağırmadığını** belirtmiyor | "Note: not currently consumed — callers import from `orchestra/authority-enforcer.js` directly. Slated for inline removal in Sprint 188+." satırı ekle |
| G-2 | `src/monitor/auditor.ts` ile isim karışıklığı için dosya başında uyarı yok | "Note: distinct from `src/monitor/auditor.ts` (scan loop). This file is the ADR-compliance facade." |
| G-3 | ADR-037 V1.0 soft-enforcement uyarısı stub'da yok — caller hayal edebilir ki burası policy gate'i | Header'a "Soft enforcement only — see ADR-037 V1.0; runtime warn, no block." ekle |
| G-4 | `enforceAdrCompliance`'in fail-safe davranışı (enforcer fail → task devam) burada belirtilmemiş | Belirtmek yerine kalıcı çözüm: dosyayı sil ve kaller'ları orchestra/'ya bağla (bkz. §7 önerileri) |
| G-5 | İlgili ADR'lere link yok (ADR-006, ADR-008, ADR-010, ADR-037, ADR-038) | TSDoc `@see` blokları ile referans ekle (gerçek silme yoluna gidilmeyecekse) |

---

## 6. ADR Compliance Check

| ADR | Maddesi | Compliance | Not |
|-----|---------|-----------|-----|
| ADR-001 (TypeScript + ESM) | `.ts`, ESM `export ... from` | ✅ PASS | Standart syntax |
| ADR-002 (Node16 module resolution) | `.js` uzantısı kullanılmış (`authority-enforcer.js`) | ✅ PASS | ESM import-extension kuralına uygun |
| ADR-006 (spawnSync security) | N/A (kod yok) | ➖ N/A | Stub; ihlali olamaz |
| ADR-008 (Brain merkezi import — tek yönlü) | `agents/` katmanı `orchestra/`'ya import ediyor | ✅ PASS | ADR-008 `agents` → `orchestra` yönünü yasaklamıyor; sadece `core/` ↔ `orchestra/` ve circular'ları yasaklar |
| ADR-010 (Tek runtime dep — commander) | Hiç dep import yok | ✅ PASS | Pure re-export |
| ADR-035 (Verification Protocol Standard) | Auditor pipeline'a entegrasyon noktası — kavramsal olarak destekliyor | ⚠️ PARTIAL | İsim "auditor" iddiası taşıyor; gerçek auditor `monitor/auditor.ts`. Naming compliance düşük. |
| ADR-036 (ADR Governance Integration) | Worker prompt injection / mandatory ADR read | ➖ N/A | Stub re-export; doğrudan governance'a katılmıyor |
| ADR-037 (RBAC V1.0 — soft) | Re-export `enforceAdrCompliance` → soft warn semantiği | ✅ PASS | ADR-037 V1.0 ile uyumlu (warn-only) |
| ADR-038 (Self-Modifying Task Detection) | Bu dosya bizzat self-modifying-risk vakası (refactorer silme denemesi, Sprint 145) | ⚠️ ATTENTION | Korumalı dosya listesine alınması gerekiyor (runtime-enforce eksik) |

Net: aktif ADR ihlali **yok**, ancak ADR-035 isim semantiği ve ADR-038 koruma alanı için **dikkat gerekiyor**.

---

## 7. Refactor Recommendations

Öncelik sırasına göre üç seçenek:

### R-1 (önerilen) — Inline & Delete
- Caller listesi: **0 src/, 0 test** → silme güvenli.
- `git rm src/agents/auditor.ts`.
- Sprint 145 koruma listesinden de bu satırı kaldır.
- Etki: −13 LoC, isim çakışması ortadan kalkar, dead-code uyarısı kapanır.
- Risk: hiçbir build/test hatası beklenmez; doğrulama için `tsc --noEmit` + `vitest run` yeterli.

### R-2 (orta) — Rename to `adr-compliance-shim.ts`
- Sprint 171 R-9 / B-18 ve `dynamic-split/agents-nervous-monitor-audit.md` §148 önerisi.
- Bu kullanım olmadığı için fiili kazanç düşük — yalnızca dosya silmek istenmiyorsa gerekli.
- Etki: `monitor/auditor.ts` ile karışıklık biter; ama dead code statüsü değişmez.

### R-3 (savunmacı) — Stub'ı Korumalı Liste'ye Ekle + Belgele
- Eğer Brain ileride EVALUATE fazından bu facade üzerinden çağırmaya geçecekse stub'ı sakla.
- Header yorumlarına ADR-037 soft-warn ve ADR-038 self-modifying notlarını ekle.
- Tehlike: facade'ı tekrar kullanmadıkça bu **niyet** olarak kalır, kod olarak değil.

Net tavsiye: **R-1**. Diğer 50-task pilot bulguları ile birleştirilip Sprint 188'de toplu cleanup wave'i içinde silinmeli (tek başına PR açmaya değmez).

---

## 8. Sprint 188 Follow-up Items

| ID | Item | Tip | Tahmini Effort |
|----|------|-----|----------------|
| FU-1 | `src/agents/auditor.ts`'i sil; tsc + vitest doğrula | refactor | low (≤15 dk) |
| FU-2 | (R-1 yerine R-2 seçilirse) Rename `agents/auditor.ts` → `agents/adr-compliance-shim.ts` ve dosya header yorumunu güncelle | refactor | low (≤30 dk) |
| FU-3 | `refactorer` agent için korumalı dosya listesini runtime'da enforce et (Sprint 145 önerisi henüz uygulanmamış) — `agents/auditor.ts` listede tutuluyorsa silinmemeli; silinmiş olarak işaretlenmişse listeden çıkar | guard / safety | normal (1-2 saat) |
| FU-4 | `monitor/auditor.ts` ile karışıklığı dokümante et: `docs/reference/api-surface.md` veya `.claude/rules/auditor.md` içine "agents/auditor.ts = ADR-compliance shim, monitor/auditor.ts = scan loop" notu | doc | low (10 dk) |
| FU-5 | ADR-038 self-modifying detection: agents/auditor.ts silinmesi Sprint 145'te yaşandı → detector'a "13 LoC re-export shim" pattern'i için özel kural / log ekle | guard | normal |
| FU-6 | `tests/orchestra/layer4-runtime.test.ts`'in re-export path'ini de test eden bir 3-liner test ekle (R-1 uygulanmazsa) — aksi halde stub regresyona açık | test | low |

---

## 9. Summary

`src/agents/auditor.ts` Sprint 143'ten kalma **13 satırlık re-export shim**'dir. `enforceAdrCompliance`, `AdrViolation`, `AdrComplianceResult` sembollerini `orchestra/authority-enforcer.js`'den yeniden ihraç eder. Tüm runtime caller'lar (worker.ts dolaylı yoldan, monitor/auditor.ts ve testler doğrudan) `orchestra/authority-enforcer.js`'den import etmektedir; **bu shim'i hiçbir src/ veya test/ dosyası tüketmiyor**. Sprint 145'te `refactorer` agent dosyayı yanlışlıkla silmeye çalışmış; geri yüklendi ve "korumalı dosya listesi" önerisi yapıldı. ADR-001/002/008/010/037 ile uyumlu (no-op ya da passive); ADR-035 ile semantik karışıklık (monitor/auditor.ts ile isim çakışması) ve ADR-038 ile koruma alanı dikkati gerektirir. **Önerilen aksiyon: Sprint 188 cleanup wave'i içinde inline-and-delete (R-1).** Risk düşük: build/test regresyonu beklenmez, isim çakışması ve dead-code sinyali ortadan kalkar. Toplam debt etkisi: −13 LoC, −1 onboarding hatası kaynağı, −1 self-modifying-task ihlal vakası.
