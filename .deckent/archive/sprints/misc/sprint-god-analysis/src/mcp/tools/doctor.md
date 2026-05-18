# Analysis: src/mcp/tools/doctor.ts
**Task ID:** 142-024 | **Model:** opus | **LoC:** 90 | **Effort:** max

## 1. Amacı
Sistem sağlık kontrolü yapan MCP tool. `deckent_doctor` olarak kayıtlı. Node.js versiyonu, git, tmux, Claude CLI auth, workspace dizinleri, brain memory budget, tech debt, stale lock kontrollerini çalıştırır. healthScore (0-100) ve per-check pass/fail durumu döndürür. Sprint başlamadan önce veya hata sonrası çağrılır.

## 2. Public API
- `registerDoctorTool(server: McpServer): void` — tek export
- JSDoc: **YOK**

## 3. İç Bağımlılıklar
- `../../cli/commands/doctor.js` → runDoctorChecks() — ⚠️ **CLI katmanından import**
- `../../core/system-profile.js` → getSystemProfile()
- `../../core/subscription.js` → detectSubscription()
- `../helpers/enrich.js` → enrichResponse()
- `../helpers/format.js` → formatDoctorResponse, wrapResponse, DoctorData type
- `../../core/config.js` → loadConfig()
- Döngüsel bağımlılık riski: **YÜKSEK** — `../../cli/commands/doctor.js` import. MCP tool → CLI command import zinciri, ADR-008 ruhuyla uyumsuz.

## 4. Dış Bağımlılıklar
- `zod/v4`, `@modelcontextprotocol/sdk` — standart
- ADR-010: ✅

## 5. Complexity
- Fonksiyon sayısı: 1 (registerDoctorTool)
- Max cyclomatic: ~6 (profile check, checks iteration)
- Basit — çoğu iş runDoctorChecks'e delege ediliyor

## 6. Type Safety
- `any`: 0
- `as unknown`: 0
- `as Array<{ passed: boolean; name?: string; message?: string }>` satır 52: ⚠️ Runtime type guard yok, DoctorCheck tipinden cast
- `as DoctorData` satır 72: ⚠️ response Record → DoctorData cast — tip güvenliği zayıf
- Non-null `!`: 0

## 7. ADR Compliance
- **ADR-008 brain import**: ❌ **İHLAL** — `../../cli/commands/doctor.js` import ediyor. MCP tool CLI katmanından import ediyor. ADR-008 kuralı brain/worker/auditor odaklı olsa da, MCP → CLI reverse dependency mimari olarak yanlış. Start.ts'teki yorum da bunu teyit ediyor (satır 43: "doctor imports are in cli/ layer and cannot be imported from mcp/").
- **P1**: runDoctorChecks() core/ veya shared/ katmanına taşınmalı
- **ADR-022 CLI/MCP parity**: ✅ CLI `deckent doctor` ile paralel. Ek olarak profile/json parametreleri.
- **ADR-033**: ✅

## 8. Test Coverage
- tests/mcp/tools/doctor.test.ts: **MEVCUT** ✅

## 9. TODO/FIXME/HACK Inventory
- **YOK**

## 10. Dead Code
- `profile` parametresi: `includeProfile` için alias — kullanılıyor ✅
- `json` parametresi: kullanılıyor ✅

## 11. Security
- ✅ Read-only tool — güvenlik riski minimal
- System profile bilgisi: CPU, RAM — hassas değil MCP bağlamında

## 12. Memory V2 Uyumu
- ✅ runDoctorChecks() üzerinden — doctor checks DB-first brain budget kontrolü yapıyor (Sprint 141 fix)

## 13. i18n
- Hardcoded İngilizce: "Health check failed:", "Fix: {check.name}" — kabul edilebilir

## 14. Dokümantasyon Tutarlılığı
- Tool description: ✅ Çok detaylı
- annotations: readOnlyHint=true, destructiveHint=false, idempotentHint=true — ✅ DOĞRU
- `includeProfile` ve `profile` alias — description'da belirtilmiş ✅

## 15. Performance
- Sync I/O: runDoctorChecks içinde (delegated) — burada 0
- ✅ Performans sorunu yok

## 16. Öneriler
- **P1**: `../../cli/commands/doctor.js` import'u mimari ihlal — runDoctorChecks() core/ katmanına refactor edilmeli (yeni modül: `src/core/doctor-checks.ts` veya `src/core/health-check.ts`)
- **P2**: Response casting (`as DoctorData`) yerine proper type transformation
- **P3**: `includeProfile`/`profile` alias karmaşıklığı — tek parametre yeterli

## Verdict: ANALYZED
