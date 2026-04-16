# Analysis: src/cli/commands/web.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 54 | **Effort:** max

## 1. Amaci
Web dashboard HTTP sunucusunu baslatan CLI komutunu saglar. `deckent web` ile API server + static file serving baslatilir (port 3100). `--dev` flag'i ile Vite dev server yonlendirmesi onerilir. En kucuk dosya (54 LoC). Is mantigi cogunlukla `api/server.js` ve `serve.ts`'ye delege ediliyor — web.ts aslinda serve.ts'nin basitlestirilmis bir versiyonu.

## 2. Public API
- `getMimeType(filePath: string): string` — Dosya uzantisina gore MIME type dondur
- `registerWeb(program: Command): void` — Commander'a web komutunu kayit et
- JSDoc: EKSIK. Hicbir fonksiyon icin JSDoc yok.

## 3. Ic Bagimliliklar
- `../../api/server.js` — createHttpServer
- `../helpers/process.js` — resolveProjectRoot
- `../helpers/output.js` — print
- Dongusel bagimllik riski: YOK.

## 4. Dis Bagimliliklar
- `node:path` — join, extname
- `commander` — type import
- ADR-010 uyumu: UYUMLU.

## 5. Complexity
- Fonksiyon sayisi: 2 (2 exported)
- En karmasik fonksiyon: `registerWeb` action handler — config parse + server start + signal handling
- Max cyclomatic complexity (rough): ~2
- Genel karmasiklik: COK DUSUK. Basit wrapper.

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: YOK.
- Genel: MUKEMMEL.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** N/A — spawnSync kullanilmiyor.
- **ADR-008 (brain import):** Uyumlu.
- **ADR-010 (deps):** Uyumlu.
- **ADR-022 (CLI/MCP parity):** N/A — web server baslama MCP kontekstinde anlamli degil.
- **ADR-033 (product vision):** Uyumlu — kullanici odakli dashboard sunumu.

## 8. Test Coverage
- Dogrudan `tests/cli/commands/web.test.ts` YOK.
- API server testleri `tests/api/` altinda olabilir ama web.ts icin dedicated CLI testi YOK.
- Test gap: MEVCUT — `getMimeType` ve `registerWeb` test edilmemis.

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- `getMimeType` (satir 21-23): POTANSIYEL DEAD CODE. Bu fonksiyon export ediliyor ama dosya icerisinde KULLANILMIYOR. `serve.ts` icindeki `EXTENDED_MIME_TYPES` daha kapsamli. `getMimeType`'i kim kullaniyor? Muhtemelen `api/server.ts` kendi MIME type logic'ine sahip. Bu export gereksiz olabilir.
- `MIME_TYPES` constant (satir 12-18): Yalnizca `getMimeType`'tan kullaniliyor — eger `getMimeType` dead ise bu da dead.

## 11. Security
- Port parse: `parseInt(opts.port ?? '3100', 10)` — NaN kontrolu YOK (serve.ts'de var ama web.ts'de yok). Gecersiz port degeri server hatasina neden olabilir.
- Signal handling (SIGINT/SIGTERM): `api.close().then(exit)` — graceful shutdown. UYGUN.
- Static file serving: `join(root, 'src', 'dashboard', 'dist')` — sabit path, traversal riski yok.

## 12. Memory V2 Uyumu
- N/A — Web server Memory V2 ile dogrudan etkilesmiyor.

## 13. i18n
- Mesajlar HARDCODED INGILIZCE: "Run 'cd src/dashboard...'" , "Deckent Web Dashboard on..."
- `getMessage()` KULLANILMIYOR.
- i18n gap: ORTA (az sayida mesaj).

## 14. Dokumantasyon Tutarliligi
- web.ts vs serve.ts: IKI AYRI KOMUT AYNI ISI YAPIYOR. `deckent web` ve `deckent serve` benzer islevlere sahip. serve.ts daha gelismis (port validation, dist check, dev proxy mode). web.ts basitlestirilmis versiyon.
- Bu duplikasyon DECKENT.md'de aciklanmis mi? HAYIR — CLI komut listesinde her ikisi de listelenmiyor.
- Potansiyel birlesme adayi: web.ts serve.ts'ye redirect/alias edilebilir.

## 15. Performance
- Sync I/O sayisi: 0 (dogrudan sync I/O yok — server baslama async)
- Hot path mi? HAYIR.
- Genel: Minimal overhead.

## 16. Oneriler
- **P1:** web.ts ve serve.ts arasindaki duplikasyon cozulsin — web.ts'yi serve.ts'nin alias'i yap veya birini kaldir.
- **P2:** Port validation ekle (serve.ts'deki gibi `isNaN(port) || port < 1 || port > 65535`).
- **P2:** `getMimeType` export'unun gercekten kullanilip kullanilmadigini dogrula — dead ise kaldir.
- **P3:** JSDoc ekle.
- **P3:** Mesajlari getMessage'a tasi.

## Verdict: ANALYZED
