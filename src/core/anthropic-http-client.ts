/**
 * Anthropic Native HTTP Client — Zero dependency, Node 18+ fetch.
 *
 * Wraps Anthropic Claude API calls we need for the User Safety Shield:
 * - POST /v1/messages/count_tokens (pre-sprint token estimation, free)
 * - GET  /v1/organizations/usage_report/messages (Admin API, Team/Enterprise only)
 * - GET  /v1/organizations/cost_report (Admin API, Team/Enterprise only)
 * - Rate limit header extraction (13 headers from any response)
 *
 * ADR-010 compliant: uses Node 18+ built-in fetch, zero runtime dependency.
 *
 * Sprint 141 Task 141-SAFE-05
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitState {
  /** Retry-After header (seconds) — only set on 429 */
  retryAfter: number | null;

  /** Per-response-type limits */
  requestsLimit: number | null;
  requestsRemaining: number | null;
  requestsReset: string | null;

  inputTokensLimit: number | null;
  inputTokensRemaining: number | null;
  inputTokensReset: string | null;

  outputTokensLimit: number | null;
  outputTokensRemaining: number | null;
  outputTokensReset: string | null;

  /** Aggregate (most restrictive) */
  tokensLimit: number | null;
  tokensRemaining: number | null;
  tokensReset: string | null;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }>;
}

export interface CountTokensParams {
  model: string;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  tools?: unknown[];
}

export interface CountTokensResult {
  input_tokens: number;
  rateLimits: RateLimitState;
}

export interface UsageReportOptions {
  starting_at: string; // RFC 3339
  ending_at?: string;
  bucket_width?: '1d' | '1h' | '1m';
  models?: string[];
  group_by?: Array<'api_key_id' | 'workspace_id' | 'model' | 'service_tier' | 'context_window' | 'inference_geo' | 'speed'>;
  limit?: number;
  page?: string;
}

export interface UsageReportBucket {
  starting_at: string;
  ending_at: string;
  results: Array<{
    model: string;
    uncached_input_tokens?: number;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
    cache_read_input_tokens?: number;
    output_tokens?: number;
    service_tier?: string;
    context_window?: string;
  }>;
}

export interface UsageReportResponse {
  data: UsageReportBucket[];
  has_more: boolean;
  next_page: string | null;
}

// ─── Error ─────────────────────────────────────────────────────────────────

export class AnthropicApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public responseBody?: unknown,
    public rateLimits?: RateLimitState,
  ) {
    super(message);
    this.name = 'AnthropicApiError';
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

// ─── Rate Limit Header Parser ──────────────────────────────────────────────

function parseIntOrNull(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract all 13 rate limit headers from an Anthropic API response.
 * Every Anthropic API call returns these, even successful ones.
 * The `retry-after` header is only set on 429 responses.
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitState {
  return {
    retryAfter: parseIntOrNull(headers.get('retry-after')),
    requestsLimit: parseIntOrNull(headers.get('anthropic-ratelimit-requests-limit')),
    requestsRemaining: parseIntOrNull(headers.get('anthropic-ratelimit-requests-remaining')),
    requestsReset: headers.get('anthropic-ratelimit-requests-reset'),
    inputTokensLimit: parseIntOrNull(headers.get('anthropic-ratelimit-input-tokens-limit')),
    inputTokensRemaining: parseIntOrNull(headers.get('anthropic-ratelimit-input-tokens-remaining')),
    inputTokensReset: headers.get('anthropic-ratelimit-input-tokens-reset'),
    outputTokensLimit: parseIntOrNull(headers.get('anthropic-ratelimit-output-tokens-limit')),
    outputTokensRemaining: parseIntOrNull(headers.get('anthropic-ratelimit-output-tokens-remaining')),
    outputTokensReset: headers.get('anthropic-ratelimit-output-tokens-reset'),
    tokensLimit: parseIntOrNull(headers.get('anthropic-ratelimit-tokens-limit')),
    tokensRemaining: parseIntOrNull(headers.get('anthropic-ratelimit-tokens-remaining')),
    tokensReset: headers.get('anthropic-ratelimit-tokens-reset'),
  };
}

// ─── Core HTTP Call ────────────────────────────────────────────────────────

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';
const API_VERSION = '2023-06-01';

async function anthropicFetch<T>(
  path: string,
  options: {
    method: 'GET' | 'POST';
    apiKey: string;
    body?: unknown;
    queryParams?: Record<string, string | string[] | undefined>;
  },
): Promise<{ data: T; rateLimits: RateLimitState; status: number }> {
  const url = new URL(path, ANTHROPIC_API_BASE);

  if (options.queryParams) {
    for (const [key, value] of Object.entries(options.queryParams)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v);
      } else {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers: Record<string, string> = {
    'x-api-key': options.apiKey,
    'anthropic-version': API_VERSION,
  };
  if (options.body) headers['content-type'] = 'application/json';

  const response = await fetch(url.toString(), {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const rateLimits = parseRateLimitHeaders(response.headers);

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      // Ignore parse errors for error bodies
    }
    throw new AnthropicApiError(
      `Anthropic API ${options.method} ${path} failed: ${response.status} ${response.statusText}`,
      response.status,
      errorBody,
      rateLimits,
    );
  }

  const data = (await response.json()) as T;
  return { data, rateLimits, status: response.status };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Count tokens for a prompt without incurring generation costs.
 * This endpoint is part of the Messages API — uses a regular API key.
 * Free (no billing charged), but subject to rate limits.
 *
 * @param apiKey - Regular Anthropic API key (sk-ant-...)
 * @param params - Message parameters (same as /v1/messages schema)
 */
export async function countTokens(
  apiKey: string,
  params: CountTokensParams,
): Promise<CountTokensResult> {
  const { data, rateLimits } = await anthropicFetch<{ input_tokens: number }>(
    '/v1/messages/count_tokens',
    {
      method: 'POST',
      apiKey,
      body: params,
    },
  );
  return { input_tokens: data.input_tokens, rateLimits };
}

/**
 * Fetch usage report (Admin API — requires Admin API key from Team/Enterprise org).
 * Returns token usage broken down by model, workspace, service tier, etc.
 *
 * NOTE: Individual Pro/Max subscription users CANNOT use this endpoint.
 * It requires an Organization with Admin API access. This is an Anthropic
 * architectural limit, not a Deckent limitation.
 *
 * @param adminApiKey - Admin API key (sk-ant-admin-...)
 * @param options - Query options (time range, grouping, filters)
 */
export async function getUsageReport(
  adminApiKey: string,
  options: UsageReportOptions,
): Promise<UsageReportResponse> {
  const queryParams: Record<string, string | string[]> = {
    starting_at: options.starting_at,
  };
  if (options.ending_at) queryParams.ending_at = options.ending_at;
  if (options.bucket_width) queryParams.bucket_width = options.bucket_width;
  if (options.models?.length) queryParams['models[]'] = options.models;
  if (options.group_by?.length) queryParams['group_by[]'] = options.group_by;
  if (options.limit != null) queryParams.limit = String(options.limit);
  if (options.page) queryParams.page = options.page;

  const { data } = await anthropicFetch<UsageReportResponse>(
    '/v1/organizations/usage_report/messages',
    {
      method: 'GET',
      apiKey: adminApiKey,
      queryParams,
    },
  );
  return data;
}

/**
 * Fetch cost report (USD) — Admin API only.
 * Returns spend in USD cents, daily granularity only.
 */
export async function getCostReport(
  adminApiKey: string,
  options: Pick<UsageReportOptions, 'starting_at' | 'ending_at'>,
): Promise<unknown> {
  const queryParams: Record<string, string> = {
    starting_at: options.starting_at,
  };
  if (options.ending_at) queryParams.ending_at = options.ending_at;

  const { data } = await anthropicFetch<unknown>(
    '/v1/organizations/cost_report',
    {
      method: 'GET',
      apiKey: adminApiKey,
      queryParams,
    },
  );
  return data;
}

// ─── Rate Limit Analysis Helpers ───────────────────────────────────────────

/**
 * Check if a response suggests we should back off based on headers.
 * Returns number of seconds to wait, or 0 if no backoff needed.
 */
export function computeBackoff(rateLimits: RateLimitState, estimatedTokens: number): number {
  // 429 explicit retry-after
  if (rateLimits.retryAfter != null && rateLimits.retryAfter > 0) {
    return rateLimits.retryAfter;
  }

  // RPM exhausted
  if (rateLimits.requestsRemaining != null && rateLimits.requestsRemaining < 2) {
    if (rateLimits.requestsReset) {
      return Math.max(1, timeUntilReset(rateLimits.requestsReset));
    }
    return 30; // Default wait
  }

  // Input tokens exhausted (considering estimated task size)
  if (
    rateLimits.inputTokensRemaining != null &&
    rateLimits.inputTokensRemaining < estimatedTokens * 1.2
  ) {
    if (rateLimits.inputTokensReset) {
      return Math.max(1, timeUntilReset(rateLimits.inputTokensReset));
    }
    return 30;
  }

  return 0;
}

/**
 * Compute seconds until an RFC 3339 reset time.
 * Returns 0 if reset time is in the past or invalid.
 */
export function timeUntilReset(rfcTime: string): number {
  const resetTs = new Date(rfcTime).getTime();
  if (!Number.isFinite(resetTs)) return 0;
  const delta = Math.floor((resetTs - Date.now()) / 1000);
  return Math.max(0, delta);
}

/**
 * Exponential backoff schedule: 5s, 20s, 80s, 320s (max 10min).
 * Used when rate limit headers don't give us an explicit retry time.
 */
export function exponentialBackoff(attempt: number, baseSeconds = 5): number {
  const backoff = baseSeconds * Math.pow(4, attempt);
  return Math.min(600, backoff); // cap at 10 minutes
}
