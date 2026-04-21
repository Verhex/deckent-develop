# Twitter/X Post — Twitter API v2 Integration

## Trigger Patterns
- "post a tweet", "tweet this", "read my timeline"
- "twitter api", "x api", "hashtag analysis"
- "schedule tweet", "thread", "reply to tweet"

## Core API Patterns

### Client Setup
```typescript
import { TwitterApi } from 'twitter-api-v2';

const client = new TwitterApi({
  appKey: process.env.TWITTER_APP_KEY!,
  appSecret: process.env.TWITTER_APP_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
});

// Read-write client (v2 endpoints)
const rwClient = client.readWrite;
```

### Post a Tweet
```typescript
const { data } = await rwClient.v2.tweet('Hello from Deckent!');
console.log(`Tweet posted: https://twitter.com/i/status/${data.id}`);
```

### Post a Thread
```typescript
const thread = await rwClient.v2.tweetThread([
  'Thread start (1/3)',
  'Middle of thread (2/3)',
  'End of thread (3/3)',
]);
```

### Read Home Timeline
```typescript
const timeline = await rwClient.v2.homeTimeline({
  max_results: 20,
  'tweet.fields': ['created_at', 'public_metrics'],
});
for (const tweet of timeline.data.data) {
  console.log(`${tweet.text} (likes: ${tweet.public_metrics?.like_count})`);
}
```

### Reply to a Tweet
```typescript
await rwClient.v2.reply('This is my reply!', originalTweetId);
```

## Error Handling
- **Rate limits**: Twitter v2 has strict rate limits. Always check `x-rate-limit-remaining` headers. Use `client.v2.rateLimitPlugin` for automatic retry.
- **403 Forbidden**: Usually means your app permissions are read-only. Regenerate tokens with read+write access in the Developer Portal.
- **Tweet length**: Max 280 characters. Check length before posting. For longer content, use threads.
- **Duplicate tweets**: Twitter rejects identical tweets within a short window. Add a timestamp or unique suffix if automating.
- **Media uploads**: Use v1.1 media upload endpoint (`client.v1.uploadMedia(buffer)`) then attach media_id to v2 tweet.

## Best Practices
- Store API keys in `.deck` file, reference via `$DECK:TWITTER_APP_KEY`
- Use OAuth 2.0 PKCE flow for user-context actions (posting on behalf of users)
- Always handle pagination with `timeline.fetchNext()` for large result sets
- Set `NODE_ENV=test` to use sandbox/mock client in tests
