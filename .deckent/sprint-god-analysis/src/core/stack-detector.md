# Analysis: src/core/stack-detector.ts
**Task ID:** 142-006 | **Model:** opus | **LoC:** 737 | **Effort:** max

## 1. Amaç (detaylı)
Proje teknoloji stack tespiti modülü. 15+ dil (TypeScript, Python, Go, Rust, Java, C/C++, C#, Swift, Ruby, PHP, Dart/Flutter, Kotlin), framework (React, Next, Vue, Angular, Svelte, NestJS, Express, Fastify, Django, FastAPI, Flask, Spring), build tool ve test framework tespiti yapar. 4 katmanlı dil tespiti: (1) kullanıcı override, (2) exclusive framework config (Cargo.toml → Rust), (3) dosya sayısına göre ağırlıklı (mixed project), (4) fallback. Monorepo desteği (sub-project scanning). Sonuçlar `.deckent/project-stack.json` dosyasına cache'lenir. CI Guardian, task router ve planner tarafından kullanılır.

## 2. Public API
- `STACK_COMMANDS` const — 16 dil × {build, test, lint} komut eşlemesi. JSDoc yok
- `FullStackResult` interface — Tam stack sonucu
- `detectProjectStack(projectRoot): ProjectStack` — Cache'li stack tespiti. JSDoc ✅
- `isStackStale(projectRoot): boolean` — Cache freshness kontrolü. JSDoc ✅
- `refreshStack(projectRoot): ProjectStack` — Cache bypass. JSDoc ✅
- `detectFullStack(projectRoot): FullStackResult` — Komut eşlemeli tam tespit. JSDoc ✅

## 3. İç Bağımlılıklar
- `./skill-types.js` → `ProjectStack`
- `./utils.js` → `readJsonSafe`, `debugLog`
- **Döngüsel bağımlılık riski:** Yok.

## 4. Dış Bağımlılıklar
- `node:fs` — Yoğun sync I/O (existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync)
- `node:path`
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 4 public + 11 private = 15
- Max cyclomatic complexity: ~25 (`detectFresh` — massive conditional chain)
- En karmaşık fonksiyon: `detectFresh` (satır 250-469) — **219 satır**, 20+ if/else-if, 7 detection bölümü
- **BÜYÜKLÜK UYARISI (P1):** 737 satır, `detectFresh` tek başına 219 satır. Refactor candidate.

## 6. Type Safety
- `any` sayısı: **0** ✅
- `@ts-ignore`: **0** ✅
- Non-null `!`: **0** ✅
- `as Record<string, unknown>` (satır 188, 259): Config ve package.json okuma — readJsonSafe null check'inden sonra.
- `as Record<string, string>` (satır 262-263): package.json deps — runtime'da string value olduğu garanti değil ama pratikte sorun yaratmaz.
- `as string | undefined` (satır 189): Config language override — typeof check ardından.

## 7. ADR Compliance
- ADR-006: N/A — spawnSync kullanmıyor ✅
- ADR-008: ✅
- ADR-010: ✅
- ADR-033: ✅ — Lokal dosya tarama, ağ çağrısı yok
- ADR-034: ✅ — projectRoot ile izolasyon
- Memory V2: N/A

## 8. Test Coverage
- Test dosyası: `tests/core/stack-detector.test.ts` ✅
- Beklenen testler: Her dil tespiti, monorepo sub-project, cache stale/fresh, framework detection, mixed project
- Edge case: boş proje, node_modules'sız, birden fazla dil marker'ı

## 9. TODO/FIXME/HACK Inventory
- **Hiç yok.** ✅

## 10. Dead Code
- `LANG_EXTENSIONS` const: `countSourceFiles` tarafından kullanılıyor ✅
- `SUB_PROJECT_LANGUAGE_MARKERS`: `scanSubProjectLanguages` tarafından kullanılıyor ✅
- Tüm internal fonksiyonlar `detectFresh` tarafından çağrılıyor.

## 11. Security
- `readConfigLanguageOverride`: Config dosyasından language_override okuyor — STACK_COMMANDS key'i ile validate ediyor ✅
- `countSourceFiles` depth limiti (max 4): FS traversal bomba koruması ✅
- `scanSubProjectLanguages` depth limiti (max 2): FS traversal koruması ✅
- Symlink takip: `statSync` varsayılan olarak symlink'leri takip eder — `.git`, `node_modules` gibi dizinler skip listesinde. Ancak malicious symlink loop koruması yok. **P3.**

## 12. Memory V2 Uyumu
- N/A. Stack detector hafıza ile etkileşmiyor. ✅

## 13. i18n
- Hardcoded string: Yok — dil, framework, build tool isimleri İngilizce standart terimler (technical identifiers).

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✅
- 4-Layer Language Detection comment bloğu (satır 308-315): Katmanları doğru açıklıyor.
- `STACK_COMMANDS` her dil için {build, test, lint} üçlüsü — tutarlı.
- `dependencies.slice(0, 200)` (satır 462): Comment "Cap raised from 50 to 200" — versiyonlama notu, kabul edilebilir.

## 15. Performance
- Sync I/O: **Yoğun.** existsSync ~15, readFileSync ~5, readdirSync ~3, statSync ~N (walk derinliğine bağlı)
- `countSourceFiles` recursive walk: Max depth 4, skipDirs ile sınırlı. Büyük monorepo'larda yavaş olabilir ama cache mekanizması ile mitigated.
- `isStackStale`: CACHE_CHECK_FILES (13 dosya) × statSync — her çağrıda 14 statSync. Cache hit durumunda hızlı.
- Hot path: `detectProjectStack` cache mekanizması sayesinde genellikle tek statSync + JSON.parse.

## 16. Öneriler
- **P1 — detectFresh refactor:** 219 satırlık tek fonksiyon. Dil tespiti, framework tespiti, test framework tespiti, build tool tespiti ayrı fonksiyonlara bölünmeli. Halihazırda bazıları ayrı (detectPythonFramework, vb.) ama ana body hala dev.
- **P2 — kotlin_maven eksik:** `resolveCommandKey` satır 173'te `kotlin_maven` ve `kotlin_gradle` case'leri yok. Java case'leri var ama kotlin → "kotlin" dönüyor, STACK_COMMANDS'ta `kotlin` key'i yok. **Bug:** Kotlin projeler komut eşlemesiz kalır.
- **P2 — csharp STACK_COMMANDS key:** `language = 'csharp'` ama STACK_COMMANDS key'i de `'csharp'` — ok. Ancak `isJsTsPrimary` listesinde `'c#'` var (satır 381). **Bug:** `language = 'csharp'` set ediliyor ama check `'c#'` arıyor. **Framework detection C# projeler için her zaman çalışır (false negative).**
- **P3 — Meson fallback:** `resolveCommandKey` meson için `'c_make'` dönüyor (satır 174) — comment "meson uses make-like commands" ama aslında meson kendi build sistemi. `meson compile` / `meson test` olmalı.

## Verdict: ANALYZED
