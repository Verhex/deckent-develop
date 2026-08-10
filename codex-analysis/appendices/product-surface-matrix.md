# Product Surface Matrix

## Capability ownership

| Surface | Intended role | Mutations | Common authority | i18n/a11y | Production proof | Verdict |
|---|---|---|---|---|---|---|
| Terminal/Ink REPL | Primary full-control, low-fatigue | Yes | Tool/RunFlow/approval wiring real; Goal closure missing | en/tr partial; PTY/a11y matrix incomplete | Source/unit/PTY assets, red CLI baseline | PARTIAL/P0 |
| CLI | Optional expert/automation adapter | Yes | Broad commands; registry/parity incomplete | Mature `getMessage`, lint gaps in subdirs | Some real-binary smokes conditional | PARTIAL/P0 |
| MCP | Host/tool adapter | Yes under lease | 49-tool catalog and writer lease strong | English literal descriptions | Packaged binary; failure baseline high | PARTIAL/P0 |
| HTTP API/SSE | Remote/Desktop/application adapter | Yes | Broad endpoints; write RPC/orchestration semantics uneven | Literal error/text debt | API suites; local state gaps | PARTIAL/P0 |
| Dashboard | Monitoring-only | Should be no | Generic mutations reduced; embedded terminal exception | en/tr + literals; no full axe | Dashboard tests, live server gaps | CONTRADICTED/P0 |
| Desktop | Primary native operator surface | Yes | API/daemon bridges, parity unproven | react-aria/tokens promising | 19 unit files; no Electron E2E/CI/package | UNPROVEN/P0 |
| VS Code | Optional IDE adapter | Declared read-only now | Approximate session→task mapping | English literal panel | Mock/source only, no extension package | HONEST-UNSUPPORTED/UNWIRED |
| Telegram | Remote/chat adapter | Park/decide/execute paths | Identity/capability pieces; direct CLI dispatch remains | Mixed | Tests/source; full shared-service cutover missing | PARTIAL |
| Discord | Remote/chat adapter | Partial | Bootstrap exists; gateway asymmetry | Mixed | Static/tests | PARTIAL |
| WhatsApp | Intended remote adapter | No real support | Scaffold throws/health false | N/A | None | UNSUPPORTED |
| Slack/Teams approvals | Approval channels | Decisions via injected transport | Wire factories exist, transport ownership partial | Mixed | Orphan/static | UNWIRED/PARTIAL |
| Installer/Release | Global acquisition/update | Install/init/publish | npm train only | CLI en/tr | Three-OS pack smoke | PARTIAL |

## Canonical action parity

| Action | Terminal | CLI | MCP | API | Desktop | Dashboard | Connectors |
|---|---|---|---|---|---|---|---|
| Goal create | indirect/CLI bridge | yes, mission group | no canonical Goal tool | no unified Goal endpoint | unproven | observe only | unproven |
| Propose/preview Flow | yes | flow surfaces | partial | yes | intended | observe | no |
| Approve | yes | checkpoint/approval variants | yes variants | yes variants | intended | no | partial |
| Start | yes | yes | yes | yes RunFlow/start | intended | no | parked/direct paths |
| Cancel/kill | mixed | yes | yes | cancel record only | intended | terminal panel can kill | partial |
| Status | yes | yes | yes | yes | yes via API | yes | partial |
| Review/finalize | partial | yes | review; finalize gap | uneven | unproven | observe | no |
| Resume/recover | partial | yes | recover | uneven | unproven | observe | no |

Bu tablo intentional negative space ile versioned application-service contractına dönüştürülmelidir. “Yüzeyde command var” aynı semantics/evidence anlamına gelmez.

## Required journey matrix

Her primary adapter için:

- Goal authoring and edit
- Plan preview/diff/risk
- Approval/question interruption
- Background progress and drilldown
- Cancel/resume/recovery
- Evidence/result/delivery receipt
- Session/device restart
- Solo and enterprise tenant
- Keyboard/screen-reader/locales/platform

Dashboard yalnız progress/evidence/result'i okur.
