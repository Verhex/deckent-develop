/**
 * Token-aware fetch wrapper — UNIFIED into lib/api.ts (Sprint 269 Task 269-002).
 *
 * lib/api.ts is the single canonical dashboard HTTP client: it reads
 * `window.__DECKENT_API_TOKEN__` (one token-read function), attaches
 * `Authorization: Bearer ...`, and dispatches the 'deckent:unauthorized'
 * CustomEvent on 401 (behavior that originally lived here, Sprint 216-007).
 *
 * This module remains as a compatibility re-export so existing imports keep
 * working without behavior drift.
 */

export { ApiError, getBootstrapApiToken, fetchJson, postJson } from './api.js';
