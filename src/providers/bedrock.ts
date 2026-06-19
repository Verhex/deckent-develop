// ─── BedrockAdapter ────────────────────────────────────────────────────────
// HTTP ProviderAdapter for Amazon Bedrock (InvokeModel API).
// Hand-rolled SigV4 using Node `crypto` only — no AWS SDK (ADR-010).
// HTTP-only like OpenAICompatibleAdapter: spawn() is not supported.
// Wiring to bootstrapProviders() lives in src/core/provider.ts.

import { createHmac, createHash } from 'node:crypto';
import type { ModelType } from '../core/types.js';
import type {
  ProviderAdapter,
  ProviderSpawnOptions,
  ProviderAvailabilityDetail,
} from '../core/provider.js';
import { ProviderError } from '../core/provider.js';

// ─── Model map ─────────────────────────────────────────────────────────────
// internal-id → { bedrockId, tier }
// "anthropic.claude-*" Bedrock IDs map to "bedrock-claude-*" internal IDs.

export interface BedrockModelEntry {
  /** Amazon Bedrock model identifier (used in InvokeModel URL path) */
  bedrockId: string;
  /** Anthropic "anthropic_version" value expected by Bedrock */
  anthropicVersion: string;
  /** Default max_tokens ceiling for this model */
  defaultMaxTokens: number;
}

export const BEDROCK_MODEL_MAP: Record<string, BedrockModelEntry> = {
  'bedrock-claude-opus-4': {
    bedrockId: 'anthropic.claude-opus-4-5',
    anthropicVersion: 'bedrock-2023-05-31',
    defaultMaxTokens: 8192,
  },
  'bedrock-claude-sonnet-4': {
    bedrockId: 'anthropic.claude-sonnet-4-5',
    anthropicVersion: 'bedrock-2023-05-31',
    defaultMaxTokens: 8192,
  },
  'bedrock-claude-haiku-4': {
    bedrockId: 'anthropic.claude-haiku-4-5',
    anthropicVersion: 'bedrock-2023-05-31',
    defaultMaxTokens: 8192,
  },
  'bedrock-claude-3-5-sonnet': {
    bedrockId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    anthropicVersion: 'bedrock-2023-05-31',
    defaultMaxTokens: 8192,
  },
  'bedrock-claude-3-5-haiku': {
    bedrockId: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    anthropicVersion: 'bedrock-2023-05-31',
    defaultMaxTokens: 8192,
  },
};

// ─── Wire types ─────────────────────────────────────────────────────────────

export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockSendOptions {
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface BedrockSendResult {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  model?: string;
}

// ─── SigV4 ─────────────────────────────────────────────────────────────────

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/**
 * SigV4 signing options — all fields required so tests can inject fixed values.
 */
export interface SigV4Options {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** ISO 8601 datetime string e.g. "20150830T123600Z" */
  datetime: string;
  method: string;
  /** URL path only, e.g. "/model/anthropic.claude-3-5-sonnet.../invoke" */
  path: string;
  /** Request body as UTF-8 string */
  body: string;
  /** Additional headers to include in signing (lowercased). host is derived from endpoint. */
  host: string;
  /** Extra headers to sign beyond content-type, host, x-amz-date (lowercase key → value). */
  extraHeaders?: Record<string, string>;
}

/**
 * Build the SigV4 Authorization header for an Amazon service HTTP request.
 * Returns the full `Authorization` header value string.
 *
 * Reference: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html
 */
export function sigv4Sign(opts: SigV4Options): {
  authorization: string;
  amzDate: string;
  amzContentSha256: string;
} {
  const date = opts.datetime.slice(0, 8); // YYYYMMDD
  const amzDate = opts.datetime;

  // ── Step 1: Canonical request ─────────────────────────────────────────────
  const payloadHash = sha256Hex(opts.body);

  // Canonical headers must be sorted, lowercased, trimmed
  const headersToSign: Record<string, string> = {
    'content-type': 'application/json',
    host: opts.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...(opts.extraHeaders ?? {}),
  };

  const signedHeaderNames = Object.keys(headersToSign).sort();
  const canonicalHeaders = signedHeaderNames
    .map(k => `${k}:${headersToSign[k]!.trim()}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [
    opts.method.toUpperCase(),
    opts.path,
    '', // canonical query string (empty — InvokeModel has none)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // ── Step 2: String to sign ────────────────────────────────────────────────
  const credentialScope = `${date}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // ── Step 3: Signing key ───────────────────────────────────────────────────
  const kDate = hmacSha256(`AWS4${opts.secretAccessKey}`, date);
  const kRegion = hmacSha256(kDate, opts.region);
  const kService = hmacSha256(kRegion, opts.service);
  const kSigning = hmacSha256(kService, 'aws4_request');

  // ── Step 4: Signature ─────────────────────────────────────────────────────
  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  // ── Step 5: Authorization header ──────────────────────────────────────────
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  return { authorization, amzDate, amzContentSha256: payloadHash };
}

// ─── Response parser ────────────────────────────────────────────────────────

/**
 * Parse an Anthropic-on-Bedrock InvokeModel JSON response body.
 * Bedrock wraps the Anthropic response directly (no extra envelope).
 */
export function parseBedrockResponse(raw: unknown): BedrockSendResult {
  let json: unknown;
  if (typeof raw === 'string') {
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      throw new ProviderError('Bedrock response is not valid JSON', 'bedrock');
    }
  } else {
    json = raw;
  }
  if (!json || typeof json !== 'object') {
    throw new ProviderError('Bedrock response is not a JSON object', 'bedrock');
  }
  const r = json as Record<string, unknown>;

  // Anthropic response shape: { content: [{type:'text',text:'...'}], usage: {input_tokens,output_tokens} }
  const contentBlock = Array.isArray(r['content']) ? r['content'] : [];
  const textBlock = contentBlock.find(
    (b: unknown) => typeof b === 'object' && b !== null && (b as Record<string, unknown>)['type'] === 'text',
  ) as Record<string, unknown> | undefined;
  const content = typeof textBlock?.['text'] === 'string' ? textBlock['text'] : '';

  const result: BedrockSendResult = { content };

  if (r['usage'] && typeof r['usage'] === 'object') {
    const u = r['usage'] as Record<string, unknown>;
    result.usage = {
      inputTokens: typeof u['input_tokens'] === 'number' ? u['input_tokens'] : 0,
      outputTokens: typeof u['output_tokens'] === 'number' ? u['output_tokens'] : 0,
    };
  }

  if (typeof r['model'] === 'string') {
    result.model = r['model'];
  }

  return result;
}

// ─── BedrockAdapter ─────────────────────────────────────────────────────────

export interface BedrockAdapterOptions {
  /** Optional fetch override for tests */
  fetchImpl?: typeof fetch;
}

export class BedrockAdapter implements ProviderAdapter {
  readonly name = 'bedrock';
  readonly supportedModels: readonly ModelType[];

  private readonly fetchImpl: typeof fetch;

  constructor(opts?: BedrockAdapterOptions) {
    this.supportedModels = Object.keys(BEDROCK_MODEL_MAP) as ModelType[];
    this.fetchImpl = opts?.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  }

  // ─── send() — primary HTTP entry ────────────────────────────────────────

  async send(
    messages: BedrockMessage[],
    model: string,
    opts?: BedrockSendOptions,
  ): Promise<BedrockSendResult> {
    const entry = BEDROCK_MODEL_MAP[model];
    if (!entry) {
      throw new ProviderError(
        `Unsupported Bedrock model "${model}". Supported: ${this.supportedModels.join(', ')}`,
        'bedrock',
      );
    }

    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'];
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'];
    const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'];

    if (!accessKeyId || !secretAccessKey || !region) {
      throw new ProviderError(
        'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION must be set for Bedrock',
        'bedrock',
      );
    }

    const host = `bedrock-runtime.${region}.amazonaws.com`;
    const encodedModelId = encodeURIComponent(entry.bedrockId).replace(/%3A/g, ':');
    const path = `/model/${encodedModelId}/invoke`;

    const requestBody: Record<string, unknown> = {
      anthropic_version: entry.anthropicVersion,
      max_tokens: opts?.maxTokens ?? entry.defaultMaxTokens,
      messages,
    };
    if (opts?.system) {
      requestBody['system'] = opts.system;
    }
    if (opts?.temperature !== undefined) {
      requestBody['temperature'] = opts.temperature;
    }

    const bodyStr = JSON.stringify(requestBody);
    const now = new Date();
    const datetime = formatAmzDate(now);

    const { authorization, amzDate, amzContentSha256 } = sigv4Sign({
      accessKeyId,
      secretAccessKey,
      region,
      service: 'bedrock-runtime',
      datetime,
      method: 'POST',
      path,
      body: bodyStr,
      host,
    });

    const url = `https://${host}${path}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: host,
        'X-Amz-Date': amzDate,
        'X-Amz-Content-Sha256': amzContentSha256,
        Authorization: authorization,
      },
      body: bodyStr,
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new ProviderError(
        `Bedrock InvokeModel returned ${res.status}${text ? `: ${text}` : ''}`,
        'bedrock',
      );
    }

    const json: unknown = await res.json();
    return parseBedrockResponse(json);
  }

  // ─── isAvailable() ──────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    return hasAwsCredentials();
  }

  // ─── diagnoseAvailability() ─────────────────────────────────────────────

  async diagnoseAvailability(): Promise<ProviderAvailabilityDetail> {
    const hasKey = hasAwsCredentials();
    const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'];
    const hints: string[] = [];
    if (!process.env['AWS_ACCESS_KEY_ID']) hints.push('Set AWS_ACCESS_KEY_ID');
    if (!process.env['AWS_SECRET_ACCESS_KEY']) hints.push('Set AWS_SECRET_ACCESS_KEY');
    if (!region) hints.push('Set AWS_REGION');
    return {
      name: 'bedrock',
      binaryFound: true, // HTTP — no binary
      binaryPath: undefined,
      versionStatus: hasKey ? 'unknown' : 'missing',
      authMethod: 'api_key',
      authStatus: hasKey ? 'ok' : 'missing',
      available: hasKey,
      partial: false,
      models: [...this.supportedModels] as ModelType[],
      reason: hasKey
        ? `Bedrock adapter ready (region: ${region ?? 'unknown'})`
        : 'AWS credentials missing — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION',
      hints,
    };
  }

  // ─── Spawn-mode stubs (HTTP-only) ───────────────────────────────────────

  spawn(_taskId: string, _model: ModelType, _prompt: string, _opts?: ProviderSpawnOptions): void {
    throw new ProviderError('bedrock is an HTTP-only adapter — use send() instead of spawn()', 'bedrock');
  }

  kill(_taskId: string): void {
    // No-op: nothing to kill in HTTP-only adapter.
  }

  listWorkers(): string[] {
    return [];
  }

  buildCommand(_model: ModelType, _promptPath: string): string {
    return '';
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a BedrockAdapter. The `root` parameter is accepted for API consistency
 * with other provider factories (createClaudeAdapter, createCodexAdapter, etc.)
 * but is not used by the HTTP-only adapter.
 */
export function createBedrockAdapter(_root: string, opts?: BedrockAdapterOptions): BedrockAdapter {
  return new BedrockAdapter(opts);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasAwsCredentials(): boolean {
  return (
    Boolean(process.env['AWS_ACCESS_KEY_ID']) &&
    Boolean(process.env['AWS_SECRET_ACCESS_KEY']) &&
    Boolean(process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'])
  );
}

function formatAmzDate(d: Date): string {
  // Format: YYYYMMDDTHHmmssZ
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '';
  }
}
