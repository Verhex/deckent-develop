# REPL/Ink + Dashboard + MCP-CLI Akış Denetimi — 2026-06-10 (Faz 0)

> Alperen direktifi: REPL/Ink zinciri (nervous/auth/autonomous/telegram…) kusursuz aksın,
> dashboard'daki bağlantısız/işlevsiz özellikler kullanılır olsun, MCP-CLI eşgüdümü yakalansın,
> publish'te kolay kurulup kullanılsın. Bu doküman Faz 0 envanteri: 3 paralel kod-denetimi +
> CC canlı doğrulama (PTY harness + `deckent serve` + playwright). Sprint 269+ buradan beslenir.

## A. CANLI-DOĞRULANMIŞ P0 BULGULAR (CC, gerçek binary)

| # | Bulgu | Kanıt | Etki |
|---|-------|-------|------|
| A1 | **SPA-fallback token-inject YOK** — inject yalnız `/` (`server.ts:1283`); `/enterprise`, `/status`… doğrudan giriş/refresh'te index.html inject'siz servis ediliyor (`server.ts:647`) → `window.__DECKENT_API_TOKEN__` undefined → TÜM api çağrıları 401 | curl `/`=1, `/enterprise`=0 inject; playwright: tokenSet=undefined, bare/header fetch 401 | Dashboard günlük kullanımda her alt-sayfa refresh'i oturumu öldürüyor — **kullanışsızlığın ana kökü** |
| A2 | Ana sayfa başlığında ham `{n}` placeholder ("Live sprint orchestration · {n} workers") | playwright snapshot | i18n interpolasyon çağrısı eksik |
| A3 | REPL `/mcp` → "isn't available in this environment" (İngilizce hardcode) | PTY probe | F9 MCP-client REPL'e bağlı değil (bilinen G1) + i18n ihlali |
| A4 | Çift token üretimi kafa karıştırıyor: log'da "Auto-generated API token" (UUID, terminale gidiyor) + HTML'de ayrı auto-mint API token (64-hex) — env `DECKENT_API_TOKEN` set'ken bile auto-gen log'lanıyor | serve log + HTML inject karşılaştırma | Auth-UX: kullanıcı log'daki token'la API'ye 403 alır |
| A5 | REPL canlı sağlıklı: açılış + slash menü + `/help` (TR) + `/nervous` + temiz çıkış ✓ | PTY probe | Çekirdek REPL render/akış çalışıyor |

## B. DASHBOARD ENVANTERİ (kod-denetimi, file:line)

**Hollow/eksik:**
- Enterprise sayfası: 4 endpoint hiç mount edilmemiş (`/api/enterprise/{tenants,rbac,audit,rate}`; `EnterprisePage.tsx:60-63` çağırıyor, `server.ts:661-670` register yok) → sayfa tamamen boş.
- Workers + Directives: sidebar linki var, route YOK (`App.tsx` — 404).
- Chat: `/api/chat/stream` adapter'ı null başlıyor (`server.ts:600-605`) → streaming yok, POST fallback (Sprint 219 T-007 borcu).
- Nervous sayfası: SSE yok, one-shot fetch (`NervousPage.tsx:33-36`) — approve/reject sonrası manuel refresh.
- `/api/output-stream` lazy-init yaşam-döngüsü şüphesi (`server.ts:1084-1089`).
- `POST /api/kill/all` special-case doğrulanmamış (`server.ts:766-778`).
- Frontend API client FRAGMENTASYONU: `lib/api.ts` + `lib/api-client.ts` + `lib/useApi.ts` + `hooks/useApi.ts` — 4 ayrı token-attach yolu (A1 ile birleşince hata yüzeyi).

**Çalışan:** Dashboard/Status/Config/History/Memory/MemoryExplorer/Debt/Evolution sayfaları + kontrol-düzlemi aksiyonları (New Sprint/plan/kill/cleanup/nervous accept-reject) kod-düzeyinde tam.

## C. REPL/CLI/MCP PARİTE (kod-denetimi)

- REPL slash kataloğu 31 komut; **eksik slash'ler: `/autonomous`, `/audit`, `/directives`** (`chat-slash-registry.ts`).
- MCP `deckent_run`: `modelEffort`/`timeout`/`keep` parametreleri YOK (CLI'da var — 268-003; `mcp/tools/run.ts:34`).
- MCP `deckent_audit`: minimal (yalnız gate) — CLI'nın query/compliance/forward/retention alt-komutları MCP'de yok (`mcp/tools/audit.ts:8-57` vs `cli/commands/audit.ts`).
- REPL hardcode İngilizce string'ler: `chat-native.ts:593/654/688`, `dispatch.ts:131`, `app.tsx:61` (+ /mcp mesajı).
- Doc drift: `docs/reference/mcp-tools.md` "33 tool" / gerçek 34; `tests/docs/reference-drift.test.ts:15` "32" bekliyor.
- Codex/Gemini REPL'de per-turn spawn (persistent session yok) — F11-014 kalan, L-boyut.
- OIDC interactive browser-login REPL akışı yok — M-L, sonraki faz.

## D. FAZ PLANI

- **Sprint 269 (dogfood):** A1+A2+A4 (serve/dashboard auth-UX) · Enterprise endpoint'leri · Workers/Directives route · Chat-stream adapter · Nervous SSE · REPL slash'ler + i18n · MCP run/audit parite · docs-ref regen. (DIRECTIVES'te.)
- **Sprint 270+ (publish-readiness):** onboarding akışı (init→doctor→serve ilk-koşu), npx zero-prereq, F1-IMG consent-image, PSL-6 provider login probe.
- **Sonra:** F9 MCP-client REPL Faz 2 (gerçek /mcp), F11-014 persistent codex/gemini, OIDC interactive login, PLAN-INT-1 + XVER-1.
- **EN SON:** MOD-SPLIT (community/pro) — §8 MASTER-PLAN.

> Ajan raporlarının tam metni session transcript'inde; bu doküman aksiyon-odaklı süzme.

## E. Referans-proje dersleri (Alperen isteği, 2026-06-10)

**Odysseus** (`pewdiepie-archdaemon/odysseus`, 65.9K ⭐, AGPL): self-hosted AI workspace, web-first.
Alınacak dersler: (1) **kurulum çıtası 3 komut / tek script** (gstack 30-sn dersiyle aynı — deckent 270 onboarding hedefi);
(2) **kutudan-çıktığı-gibi çalışan default'lar** (admin şifresi auto-mint + ilk açılışta her şey 200 — bizim A1/A4 tam bu çıtayı blokluyor);
(3) PWA/responsive → ileride mobil ucuz; (4) README'de GIF'li akış demoları; (5) yetenekleri UX-modülü olarak paketleme
(mail/takvim/notlar — deckent'in capability-handler'larının yüzeyi yok); (6) derin troubleshooting dokümantasyonu.
**Fark fırsatı:** Odysseus'ta TUI YOK — deckent'in Ink REPL'i + orchestration çekirdeği (paralel fleet, GO/NO-GO, RBAC/audit) kategori farkı.
OpenClaw/Hermes/AWS-CAO kıyası için bkz. `docs/alperen-analysis/2026-06-08-birlesik-rekabet-analizi.md` (en yakın rakipler; wedge: local-first egemen orkestrasyon + evrimsel memory).
**Alperen vizyon notu:** user+enterprise deneyim kolaylığı, TÜM işlevlerin arayüzden sorunsuz çalışması (terminal + dashboard, ileride masaüstü + mobil app) birincil kalite ölçütü.
