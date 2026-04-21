# Reddit Fetcher Skill

## Trigger Patterns
- reddit, subreddit, post, comment, upvote, flair
- "fetch reddit posts", "search subreddit", "get comments", "monitor subreddit"

## Core Expertise

### Client Setup
```typescript
import Snoowrap from 'snoowrap';

const reddit = new Snoowrap({
  userAgent: 'deckent:v1.0.0 (by /u/your_username)',
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  refreshToken: process.env.REDDIT_REFRESH_TOKEN,
});

// Configure request handling
reddit.config({
  requestDelay: 1000,          // 1 req/sec (Reddit limit: 60/min)
  continueAfterRatelimitError: true,
  retryErrorCodes: [502, 503, 504],
  maxRetryAttempts: 3,
});
```

### Fetching Posts
```typescript
// Get hot posts from a subreddit
const hotPosts = await reddit.getSubreddit('typescript').getHot({ limit: 25 });

// Get new posts
const newPosts = await reddit.getSubreddit('programming').getNew({ limit: 50 });

// Get top posts (time filter)
const topPosts = await reddit.getSubreddit('webdev').getTop({ time: 'week', limit: 10 });

// Search within a subreddit
const results = await reddit.getSubreddit('node').search({
  query: 'ESM import',
  sort: 'relevance',
  time: 'month',
});

// Access post properties
for (const post of hotPosts) {
  console.log({
    title: post.title,
    author: post.author.name,
    score: post.score,
    url: post.url,
    selftext: post.selftext,        // Text content (self posts)
    num_comments: post.num_comments,
    created_utc: post.created_utc,
    flair: post.link_flair_text,
  });
}
```

### Comment Operations
```typescript
// Get comments on a post (tree structure)
const submission = reddit.getSubmission('abc123');
const comments = await submission.expandReplies({ limit: Infinity, depth: 3 });

// Flatten comment tree
function flattenComments(listing: Snoowrap.Comment[]): Array<{ author: string; body: string; score: number }> {
  const flat: Array<{ author: string; body: string; score: number }> = [];
  for (const comment of listing) {
    flat.push({ author: comment.author.name, body: comment.body, score: comment.score });
    if (comment.replies?.length) {
      flat.push(...flattenComments(comment.replies as unknown as Snoowrap.Comment[]));
    }
  }
  return flat;
}

// Submit a comment (requires authenticated user)
await reddit.getSubmission('abc123').reply('Great post!');
```

### Subreddit Monitoring
```typescript
// Poll for new posts (simple monitoring loop)
async function monitorSubreddit(
  subredditName: string,
  onNewPost: (post: Snoowrap.Submission) => void,
  intervalMs = 60_000
): Promise<() => void> {
  let lastSeen = '';
  const timer = setInterval(async () => {
    const posts = await reddit.getSubreddit(subredditName).getNew({ limit: 10 });
    for (const post of posts) {
      if (post.name === lastSeen) break;
      onNewPost(post);
    }
    if (posts.length > 0) lastSeen = posts[0].name;
  }, intervalMs);
  return () => clearInterval(timer);
}
```

### User & Flair Operations
```typescript
// Get user info
const user = await reddit.getUser('username').fetch();
console.log({ karma: user.link_karma + user.comment_karma, created: user.created_utc });

// Get user's recent posts
const userPosts = await reddit.getUser('username').getSubmissions({ limit: 10 });
```

### Error Handling
- **Rate limits:** Reddit enforces 60 requests/minute for OAuth apps. Snoowrap handles this with `requestDelay`, but burst operations can still hit 429.
- **Deleted/removed content:** `[deleted]` author and `[removed]` body are common. Always null-check.
- **Private subreddits:** Return 403. Check `subreddit.subreddit_type` before querying.
- **User-Agent requirement:** Reddit blocks requests without a descriptive User-Agent string.
- **Pagination:** Snoowrap returns `Listing` objects. Use `.fetchMore()` or iterate with `{ after }`.
- **NSFW filtering:** Use `over18` property to filter. Some subreddits require opt-in.

### Best Practices
- Always set a descriptive `userAgent` string including your app name and version.
- Store credentials in `.deck`: `$DECK:REDDIT_CLIENT_ID`, `$DECK:REDDIT_CLIENT_SECRET`, `$DECK:REDDIT_REFRESH_TOKEN`.
- Use `getNew` for monitoring, `getHot` for discovery, `getTop` for summaries.
- For large data collection, respect rate limits and use `requestDelay: 1000`.
- Comment trees can be deeply nested. Set a reasonable `depth` limit (3-5) for performance.
- Use Reddit's search syntax for precise queries: `flair:question`, `self:yes`, `site:github.com`.
