import { framedOutputDigest } from '../core/output-digest.js';

export const SOURCE_KINDS = [
  'official-repo',
  'official-release',
  'official-docs',
  'official-announcement',
  'benchmark',
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Lower array position is higher retrieval priority. */
export const SOURCE_PRIORITY: Readonly<Record<SourceKind, number>> =
  Object.freeze(Object.fromEntries(
    SOURCE_KINDS.map((kind, index) => [kind, index]),
  ) as Record<SourceKind, number>);

export const SOURCE_FETCH_TIMEOUT_MS = 5_000;
export const SOURCE_FETCH_MAX_ATTEMPTS = 3;

export const SOURCE_FORMATS = [
  'github-release-json',
  'json-feed',
  'atom',
  'html',
] as const;

export type SourceFormat = (typeof SOURCE_FORMATS)[number];

export interface ConditionalFetchState {
  etag?: string;
  lastModified?: string;
}

export interface SourceDefinition {
  sourceId: string;
  kind: SourceKind;
  url: string;
  format: SourceFormat;
  conditional?: ConditionalFetchState;
}

export interface SourceMetadata {
  title: string;
  publishedAt?: string;
  canonicalUrl?: string;
}

interface ResultEvidence {
  byteCount: number;
  framedOutputDigest: `sha256:${string}`;
  attempts: number;
}

export type SourceRetrievalResult =
  | (ResultEvidence & {
      status: 'ok';
      source: SourceDefinition;
      conditional: ConditionalFetchState;
      entries: readonly SourceMetadata[];
    })
  | (ResultEvidence & {
      status: 'unchanged';
      source: SourceDefinition;
      conditional: ConditionalFetchState;
    })
  | (ResultEvidence & {
      status: 'hold';
      source: SourceDefinition;
      conditional: ConditionalFetchState;
      reason: string;
    });

export type SourceFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Retrieve independently, returning one honest typed result per source.
 * Production callers use the global fetch default; tests inject a fake.
 */
export async function retrieveSources(
  sources: readonly SourceDefinition[],
  fetchImpl: SourceFetch = globalThis.fetch,
): Promise<readonly SourceRetrievalResult[]> {
  const prioritized = sources
    .map((source, originalIndex) => ({ source, originalIndex }))
    .sort(
      (left, right) =>
        SOURCE_PRIORITY[left.source.kind] - SOURCE_PRIORITY[right.source.kind]
        || left.originalIndex - right.originalIndex,
    );

  return Promise.all(prioritized.map(({ source }) => retrieveSource(source, fetchImpl)));
}

async function retrieveSource(
  source: SourceDefinition,
  fetchImpl: SourceFetch,
): Promise<SourceRetrievalResult> {
  let lastReason = 'Retrieval did not run.';

  for (let attempt = 1; attempt <= SOURCE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SOURCE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(source.url, {
        headers: conditionalHeaders(source.conditional),
        signal: controller.signal,
      });
      const conditional = responseConditional(response, source.conditional);

      if (response.status === 304) {
        return evidenceResult({
          status: 'unchanged', source, conditional, attempts: attempt,
        }, '');
      }
      if (!response.ok) {
        lastReason = `HTTP ${response.status}.`;
        if (isRetryableStatus(response.status) && attempt < SOURCE_FETCH_MAX_ATTEMPTS) {
          continue;
        }
        return evidenceResult({
          status: 'hold', source, conditional, reason: lastReason, attempts: attempt,
        }, '');
      }

      const body = await response.text();
      try {
        const entries = parseSource(source.format, body);
        if (entries.length === 0) {
          throw new Error('Source contains no usable metadata.');
        }
        return evidenceResult({
          status: 'ok', source, conditional, entries, attempts: attempt,
        }, body);
      } catch (error: unknown) {
        return evidenceResult({
          status: 'hold',
          source,
          conditional,
          reason: failureReason(error),
          attempts: attempt,
        }, body);
      }
    } catch (error: unknown) {
      lastReason = controller.signal.aborted
        ? `Timed out after ${SOURCE_FETCH_TIMEOUT_MS}ms.`
        : `Fetch failed: ${failureReason(error)}`;
      if (attempt === SOURCE_FETCH_MAX_ATTEMPTS) {
        return evidenceResult({
          status: 'hold',
          source,
          conditional: source.conditional ?? {},
          reason: lastReason,
          attempts: attempt,
        }, '');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return evidenceResult({
    status: 'hold',
    source,
    conditional: source.conditional ?? {},
    reason: lastReason,
    attempts: SOURCE_FETCH_MAX_ATTEMPTS,
  }, '');
}

/**
 * Attach the secret-safe evidence fields to a result variant.
 *
 * The parameter is the result union minus those fields rather than a bare
 * generic: a generic widens `status` to `string` when it infers from an object
 * literal, and the widened shape then no longer belongs to the discriminated
 * union — which is exactly the mistake the union exists to prevent.
 */
function evidenceResult(
  result: DistributiveOmit<SourceRetrievalResult, 'byteCount' | 'framedOutputDigest'>,
  body: string,
): SourceRetrievalResult {
  return {
    ...result,
    byteCount: Buffer.byteLength(body, 'utf8'),
    framedOutputDigest: framedOutputDigest([body]) as `sha256:${string}`,
  } as SourceRetrievalResult;
}

/** `Omit` that keeps a union distributed instead of collapsing its members. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function conditionalHeaders(state?: ConditionalFetchState): Record<string, string> {
  const headers: Record<string, string> = {};
  if (state?.etag !== undefined) headers['If-None-Match'] = state.etag;
  if (state?.lastModified !== undefined) {
    headers['If-Modified-Since'] = state.lastModified;
  }
  return headers;
}

function responseConditional(
  response: Response,
  previous?: ConditionalFetchState,
): ConditionalFetchState {
  return {
    ...(previous ?? {}),
    ...(response.headers.get('etag') === null
      ? {} : { etag: response.headers.get('etag') ?? undefined }),
    ...(response.headers.get('last-modified') === null
      ? {} : { lastModified: response.headers.get('last-modified') ?? undefined }),
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseSource(format: SourceFormat, body: string): readonly SourceMetadata[] {
  switch (format) {
    case 'github-release-json':
      return parseGitHubReleases(body);
    case 'json-feed':
      return parseJsonFeed(body);
    case 'atom':
      return parseAtom(body);
    case 'html':
      return parseHtmlMetadata(body);
  }
}

function parseGitHubReleases(body: string): readonly SourceMetadata[] {
  const parsed: unknown = JSON.parse(body);
  const releases = Array.isArray(parsed) ? parsed : [parsed];
  return releases.map((release) => {
    const record = objectRecord(release, 'GitHub release');
    const title = nonEmptyString(record.name) ?? nonEmptyString(record.tag_name);
    if (title === undefined) throw new Error('GitHub release has no title or tag.');
    return compactMetadata(
      title,
      nonEmptyString(record.published_at),
      nonEmptyString(record.html_url),
    );
  });
}

function parseJsonFeed(body: string): readonly SourceMetadata[] {
  const feed = objectRecord(JSON.parse(body), 'JSON feed');
  if (!Array.isArray(feed.items)) throw new Error('JSON feed has no items array.');
  return feed.items.map((item) => {
    const record = objectRecord(item, 'JSON feed item');
    const title = nonEmptyString(record.title);
    if (title === undefined) throw new Error('JSON feed item has no title.');
    return compactMetadata(
      title,
      nonEmptyString(record.date_published) ?? nonEmptyString(record.date_modified),
      nonEmptyString(record.url) ?? nonEmptyString(record.external_url),
    );
  });
}

function parseAtom(body: string): readonly SourceMetadata[] {
  const entries = [...body.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  if (entries.length === 0) throw new Error('Atom feed has no entries.');
  return entries.map((match) => {
    const entry = match[1] ?? '';
    const title = elementText(entry, 'title');
    if (title === undefined) throw new Error('Atom entry has no title.');
    const linkTag = entry.match(/<link\b[^>]*\b(?:rel=["']alternate["'][^>]*)?>/i)?.[0];
    return compactMetadata(
      title,
      elementText(entry, 'published') ?? elementText(entry, 'updated'),
      linkTag === undefined ? undefined : attributeValue(linkTag, 'href'),
    );
  });
}

function parseHtmlMetadata(body: string): readonly SourceMetadata[] {
  const title = metaContent(body, 'property', 'og:title')
    ?? metaContent(body, 'name', 'twitter:title')
    ?? elementText(body, 'title');
  if (title === undefined) throw new Error('HTML has no safe title metadata.');
  const canonicalTag = body.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i)?.[0]
    ?? body.match(/<link\b[^>]*\bhref=["'][^"']+["'][^>]*\brel=["']canonical["'][^>]*>/i)?.[0];
  return [compactMetadata(
    title,
    metaContent(body, 'property', 'article:published_time')
      ?? metaContent(body, 'name', 'date'),
    canonicalTag === undefined ? undefined : attributeValue(canonicalTag, 'href'),
  )];
}

function metaContent(body: string, key: 'name' | 'property', value: string): string | undefined {
  const tags = body.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((candidate) => attributeValue(candidate, key)?.toLowerCase() === value);
  return tag === undefined ? undefined : attributeValue(tag, 'content');
}

function elementText(body: string, element: string): string | undefined {
  const match = body.match(new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)<\\/${element}>`, 'i'));
  return match?.[1] === undefined ? undefined : nonEmptyString(decodeXml(stripTags(match[1])));
}

function attributeValue(tag: string, attribute: string): string | undefined {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] === undefined ? undefined : nonEmptyString(decodeXml(match[2]));
}

function compactMetadata(
  title: string,
  publishedAt?: string,
  canonicalUrl?: string,
): SourceMetadata {
  return {
    title,
    ...(publishedAt === undefined ? {} : { publishedAt }),
    ...(canonicalUrl === undefined ? {} : { canonicalUrl }),
  };
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim() : undefined;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function failureReason(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message : String(error);
}
