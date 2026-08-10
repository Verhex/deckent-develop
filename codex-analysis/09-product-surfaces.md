# 09 — Product Surfaces

## Surface doctrine

Hedef doğru: Terminal ana full-control kullanım yüzeyi, Desktop aynı authority'yi native UX ile tüketir, Dashboard yalnız gözlemdir; CLI/MCP/API/connectors optional adapters'dır. Bugün surface genişliği yüksek fakat common application-service/parity eksiktir.

## Matrix özeti

| Surface | Presence | Production closure | Verdict |
|---|---|---|---|
| Terminal/Ink REPL | Tool search/describe/call, RunFlow, approvals wired | Goal product lifecycle ve i18n/a11y/live matrix eksik | PARTIAL/P0 |
| CLI | 45+ top-level command contractı, geniş mutations | Semantics ve parity drift, current red tests | PARTIAL/P0 |
| MCP | 49 tools, catalog invariant, writer lease | Failure bundle yüksek; descriptions/i18n ve parity eksik | PARTIAL/P0 |
| API | Geniş HTTP/SSE/run-flow/terminal | Write RPC orphan, local state, cancel effect split | PARTIAL/P0 |
| Dashboard | Monitoring pages güçlü | Embedded terminal create/kill doctrine'i ihlal ediyor | CONTRADICTED/P0 |
| Desktop | Ciddi Electron/React source ve a11y foundation | CI, real Electron E2E, signed packages/update yok | UNPROVEN/P0 |
| VS Code | 4 read-only bridge/panel file | Manifest/host/package ve write parity yok | UNWIRED/HONEST-UNSUPPORTED |
| Connectors | Telegram/Discord parçaları, identity/capability | WhatsApp scaffold; gateway/approval transports kısmi | PARTIAL/UNWIRED |
| Installer/Release | CLI/MCP/dashboard npm, 3-OS packed smoke | Desktop/service/container/offline/WSL bütünlüğü yok | PARTIAL/P0 |

## Dashboard boundary contradiction

Dashboard Layout her sayfada embedded TerminalPanel mount eder; session create/kill ve shell/provider launch POST/DELETE çağrıları vardır. Bu doğrudan bir security vulnerability kanıtı değildir — bearer/allowlist/audit hardening bulunur — fakat monitoring-only doctrine ve negative-space contractıyla çelişir. Ya terminal Dashboard'dan çıkarılmalı/Terminal veya Desktop'a taşınmalı ya da product doctrine owner authority ile açıkça değişmelidir. Mevcut kurallara göre ikinci seçenek yoktur.

## Shared application service gap

Canonical command registry yüzey farklarını gösterir; bazı actions CLI-only, MCP-only veya REPL-only'dir. API RPC live map yalnız az sayıda read method taşır; write handlers source'ta mevcut ama live server ingress'e wired değildir. Surface adapters propose/approve/start/cancel/status/review/finalize/cleanup/resume semantiğini ortak use-case service'ten tüketmelidir.

## i18n ve accessibility

Core CLI message system en/tr için güçlüdür; ancak lint kapsamı CLI subdirs/REPL/TSX/Dashboard/MCP/VS Code/connectors'ın tamamını kapsamaz. Hardcoded Türkçe slash help ve İngilizce MCP/Dashboard/VS Code strings vardır. Desktop react-aria/token foundation iyi başlangıçtır; automated axe/pa11y, real Electron keyboard/screen-reader ve platform assistive-tech proof yoktur.

## Product journey eksikleri

Her surface için feature listesi yerine aynı canonical journeys sertifikalanmalıdır:

- Solo developer repository Goal'ı
- Enterprise tenant repository Goal'ı
- Daily-work Assistant Goal'ı
- Business system action Goal'ı
- Approval-required operation
- Crash/restart/cancel/resume
- Cross-device/session delivery receipt

Dashboard bu journeys'i çalıştırmaz; yalnız aynı truth projection'ını gösterir.
