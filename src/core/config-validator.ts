// ─── Config Validator ────────────────────────────────────────────────
// Re-exports timeout validation from config.ts for external consumers.
// All validation logic lives in validateConfig() within config.ts.

export { validateConfig, ConfigValidationError, validatePartialConfig } from './config.js';
export { DEFAULT_TIMEOUT_CONFIG } from './config.js';
