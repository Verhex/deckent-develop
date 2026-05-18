# Analysis: src/orchestra/event-stream.ts
**Task ID:** 142-011 | **Model:** opus | **LoC:** 311 | **Effort:** max

## 1. Amacı
Append-only JSONL event log sistemi. Brain ↔ Worker ↔ Auditor arasında yapılandırılmış olay iletişimi sağlar. ADR-035 (Sprint 138) ile tanımlanan Protocol Version 1.0'ı uygular. Her sprint için ayrı `.deckent/sprint-NNN-events.jsonl` dosyası oluşturur. Sequence counter ile monotonic sıralama garantisi verir. Fail-safe tasarım: yazma hatası sprint'i çökertmez.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `DeckentEvent` | interface | ✅ Var — "Protocol Version 1.0 event structure" |
| `EventFilter` | interface | ✅ Var — "Filter criteria for readEvents()" |
| `ReconstructedState` | interface | ✅ Var — "Reconstructed sprint state" |
| `CHANNELS` | `as const` object (15 channels) | Inline comments per channel |
| `ChannelCode` | type alias | Yok — derived type, JSDoc gereksiz |
| `readSequence()` | `(projectRoot, sprintId) => number` | ✅ Var |
| `getCurrentSprintId()` | `(projectRoot) => string \| null` | ✅ Var |
| `writeEvent()` | `(projectRoot, sprintId, source, target, channel, payload) => DeckentEvent \| null` | ✅ Var — detaylı param docs |
| `readEvents()` | `(projectRoot, sprintId, filter?) => DeckentEvent[]` | ✅ Var |
| `reconstructState()` | `(projectRoot, sprintId) => ReconstructedState` | ✅ Var |

JSDoc coverage: **10/10 — %100 complete**.

## 3. İç Bağımlılıklar
- `../core/constants.js` → `DECKENT_DIR`
- `../core/utils.js` → `debugLog`
- **Döngüsel bağımlılık riski:** Yok. Sadece core/ modülleri import ediliyor.

## 4. Dış Bağımlılıklar
- `node:fs` → appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync
- `node:path` → join
- **ADR-010 uyumu:** ✅ Sadece Node.js built-in modülleri.

## 5. Complexity
- **Fonksiyon sayısı:** 7 (2 private, 5 export)
- **En karmaşık fonksiyon:** `reconstructState()` (satır 250-311) — switch/case ile 5 channel type handle ediyor
- **Max cyclomatic complexity (tahmini):** ~8 (reconstructState switch + payload null checks)
- Genel karmaşıklık: DÜŞÜK-ORTA. Her fonksiyon tek sorumluluklu.

## 6. Type Safety
- **any sayısı:** 0
- **@ts-ignore:** 0
- **@ts-expect-error:** 0
- **as unknown:** 0
- **Non-null `!`:** 1 — satır 259: `events[events.length - 1]!.sequence` — güvenli çünkü `events.length > 0` koşulu kontrol ediliyor
- **Unsafe cast:** `as { phase?: string }` vb. satır 269, 277, 284, 293, 301 — payload `unknown` olduğu için zorunlu, ama runtime validation eksik (sadece optional chaining ile kontrol)

**Risk:** Payload cast'leri Zod/type-guard ile validate edilmiyor. Malformed payload sessizce atlanıyor ki bu fail-safe tasarıma uygun ama debugging'i zorlaştırır.

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 (spawnSync) | N/A | spawnSync kullanmıyor |
| ADR-008 (brain import) | ✅ | Sadece core/ import ediyor |
| ADR-010 (tek dep) | ✅ | Sadece Node.js built-in |
| ADR-035 (event stream) | ✅ | **Bu dosya ADR-035'in implementasyonu** |
| ADR-037 (RBAC) | ✅ | Channel constants RBAC ile uyumlu |
| ADR-039 (self-modifying) | N/A | İlgili değil |
| Memory V2 DB-first | N/A | Memory ile ilgisi yok |

## 8. Test Coverage
- **Test dosyası:** `tests/orchestra/event-stream.test.ts` (286 satır)
- **Eşleşme:** ✅ Var
- **Mock kalitesi:** vi.mock ile fs modülleri mock'lanmış
- **Edge case coverage:** Malformed JSONL satırları, boş dosya, sequence counter hataları test ediliyor
- **Eksik testler:** `reconstructState()` fonksiyonu için CHANNELS.RESULT case'i test edilmiyor olabilir (doğrulanmalı)

## 9. TODO/FIXME/HACK Inventory
**Yok.** 0 adet — tamamen temiz.

## 10. Dead Code
- **Unused exports:** Yok. Tüm exports 5 farklı modülden import ediliyor (authority-enforcer, sprint-spawner, sprint-finalizer, auditor, worker).
- **Unreachable branch:** Yok.
- **@deprecated:** Yok.

## 11. Security
- **Input validation:** `readEvents()` malformed JSON satırlarını sessizce atlıyor (güvenli)
- **Injection riski:** Yok — dosya yolları `join()` ile oluşturuluyor, kullanıcı input'u yok
- **Secret exposure:** Yok
- **SQL injection:** N/A
- **OWASP:** Temiz

## 12. Memory V2 Uyumu
- **DB-first mi?** N/A — event stream'in memory V2 ile doğrudan ilişkisi yok
- **Eski .md parse kaldı mı?** Hayır — readFileSync sadece kendi JSONL/seq dosyaları için
- **Değerlendirme:** Uyumlu

## 13. i18n
- **Hardcoded string'ler:** Console.warn mesajları İngilizce (satır 189, 240) — internal logging, i18n gerektirmez
- **turkishNormalize:** N/A — kullanıcıya dönük metin yok
- **Değerlendirme:** Temiz

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✅ Tam uyumlu
- ADR-035 referansı: Dosya başındaki yorum doğru
- CHANNELS constant'ları sprint referanslarıyla tutarlı
- **Not:** `CHANNELS.NOTIFY` Sprint 139'da eklendi — ADR-035'te belgelenmemiş olabilir (ADR-035 Sprint 138'de yazıldı)

## 15. Performance
- **Sync I/O sayısı:** 6 — readFileSync(×3), writeFileSync(×1), appendFileSync(×1), existsSync(×3)
- **Hot path:** `readEvents()` tüm JSONL dosyasını belleğe okuyor — uzun sprint'lerde (1000+ event) bellek tüketimi artabilir
- **readSequence:** Her writeEvent çağrısında dosya oku + yaz — yoğun event yazımında potansiyel bottleneck
- **Gereksiz I/O:** `nextSequence` her çağrıda okuma + yazma yapıyor, in-memory counter ile optimize edilebilir

**P2 öneri:** Sequence counter'ı in-memory tutup periyodik olarak diske yazmak performansı artırır.

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | Sequence counter'ı in-memory cache'le, periyodik flush yap |
| P2 | `readEvents()` büyük dosyalar için streaming (readline) desteği ekle |
| P3 | Payload validation'ı Zod schema ile güçlendir (reconstructState) |
| P3 | `CHANNELS.NOTIFY` ADR-035 v1.1'de belgelensin |

## Verdict: ANALYZED
