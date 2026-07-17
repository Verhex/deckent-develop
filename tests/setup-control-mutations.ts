// ═══ SURF-7 suite-wide ratchet override ══════════════════════════════════════
//
// The orchestration-control mutation endpoints (`/api/start`, `/api/kill/*`,
// `/api/cleanup`, config/directives/chat/nervous/autonomous writes) ship
// behind the default-OFF `api.control_mutations` flag (ADR-G-033 authority-
// cutover). Endpoint-BEHAVIOR specs across the suite predate that gate and
// test the handlers themselves, so the whole suite runs with the documented
// env twin open — the same testing posture `DECKENT_API_AUTH_DISABLED` uses
// for auth. The gate's real default-OFF contract is pinned explicitly by
// tests/api/control-mutation-ratchet.test.ts, which deletes this env var.

process.env['DECKENT_CONTROL_MUTATIONS'] = '1';
