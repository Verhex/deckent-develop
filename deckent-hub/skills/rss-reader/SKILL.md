# RSS Reader Skill

## Trigger Patterns
- "parse RSS feed", "read Atom feed", "subscribe to feed"
- "syndication", "news aggregation", "feed reader"
- Any task involving RSS/Atom XML parsing

## RSS Parser Usage

### Basic Feed Parsing
```typescript
import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'Deckent-RSS/1.0' },
  customFields: {
    item: [['media:content', 'media'], ['dc:creator', 'creator']],
  },
});

async function parseFeed(url: string): Promise<ParsedFeed> {
  const feed = await parser.parseURL(url);
  return {
    title: feed.title ?? 'Untitled',
    link: feed.link,
    items: feed.items.map(item => ({
      title: item.title ?? '',
      link: item.link ?? '',
      pubDate: item.pubDate ? new Date(item.pubDate) : null,
      content: item.contentSnippet ?? item.content ?? '',
      creator: item.creator ?? item['dc:creator'] ?? 'Unknown',
    })),
  };
}
```

### Atom Feed Detection
```typescript
async function detectFeedType(url: string): Promise<'rss' | 'atom' | 'unknown'> {
  const res = await fetch(url, { headers: { Accept: 'application/xml' } });
  const text = await res.text();
  if (text.includes('<feed') && text.includes('xmlns="http://www.w3.org/2005/Atom"')) return 'atom';
  if (text.includes('<rss') || text.includes('<channel>')) return 'rss';
  return 'unknown';
}
```

### Feed Polling with Change Detection
```typescript
const lastEtags = new Map<string, string>();

async function pollFeed(url: string): Promise<ParsedFeed | null> {
  const headers: Record<string, string> = { 'User-Agent': 'Deckent-RSS/1.0' };
  const etag = lastEtags.get(url);
  if (etag) headers['If-None-Match'] = etag;

  const res = await fetch(url, { headers });
  if (res.status === 304) return null; // No changes

  const newEtag = res.headers.get('etag');
  if (newEtag) lastEtags.set(url, newEtag);

  const text = await res.text();
  return parser.parseString(text);
}
```

## Common Feed Sources
- GitHub releases: `https://github.com/{owner}/{repo}/releases.atom`
- Reddit: `https://www.reddit.com/r/{subreddit}/.rss`
- YouTube channel: `https://www.youtube.com/feeds/videos.xml?channel_id={id}`

## Error Handling
- **ECONNREFUSED/ETIMEDOUT**: Feed server down. Retry with backoff, cache last result.
- **403**: Server blocks bots. Set a proper User-Agent header.
- **Invalid XML**: Use `parser.parseString()` with try/catch; some feeds have malformed CDATA.
- **Encoding issues**: Force UTF-8; some feeds serve ISO-8859-1 without declaring it.
- **Empty items array**: Feed exists but has no entries. Distinguish from parse failure.

## Best Practices
- Always set a User-Agent header; many servers reject requests without one.
- Use ETag/If-None-Match for efficient polling (saves bandwidth).
- Normalize dates with `new Date(pubDate)` — RSS date formats vary wildly.
- Limit item count with `parser.parseURL(url, { maxItems: 50 })` for large feeds.
- Store feed URL + last-seen GUID to detect new items on subsequent polls.
