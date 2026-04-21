# GitHub Issues Skill

## Trigger Patterns
- "create GitHub issue", "list open issues", "close PR"
- "add label", "assign milestone", "review pull request"
- Any task involving GitHub REST API or repository management

## Octokit Setup

### Authentication
```typescript
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  userAgent: 'Deckent/1.0',
  timeZone: 'UTC',
});
```

### Issue Operations
```typescript
// Create issue
async function createIssue(owner: string, repo: string, title: string, body: string, labels?: string[]) {
  const { data } = await octokit.issues.create({
    owner, repo, title, body,
    labels: labels ?? [],
  });
  return data;
}

// List issues with filters
async function listIssues(owner: string, repo: string, opts?: { state?: 'open' | 'closed'; labels?: string; per_page?: number }) {
  const { data } = await octokit.issues.listForRepo({
    owner, repo,
    state: opts?.state ?? 'open',
    labels: opts?.labels,
    per_page: opts?.per_page ?? 30,
    sort: 'updated',
    direction: 'desc',
  });
  return data.filter(i => !i.pull_request); // Exclude PRs (GitHub returns both)
}

// Add labels
async function addLabels(owner: string, repo: string, issueNumber: number, labels: string[]) {
  await octokit.issues.addLabels({ owner, repo, issue_number: issueNumber, labels });
}
```

### Pull Request Operations
```typescript
// Create PR
async function createPR(owner: string, repo: string, head: string, base: string, title: string, body: string) {
  const { data } = await octokit.pulls.create({ owner, repo, head, base, title, body });
  return data;
}

// List PR files
async function getPRFiles(owner: string, repo: string, prNumber: number) {
  const { data } = await octokit.pulls.listFiles({ owner, repo, pull_number: prNumber });
  return data.map(f => ({ filename: f.filename, status: f.status, changes: f.changes }));
}

// Merge PR
async function mergePR(owner: string, repo: string, prNumber: number, method: 'merge' | 'squash' | 'rebase' = 'squash') {
  await octokit.pulls.merge({ owner, repo, pull_number: prNumber, merge_method: method });
}
```

### Pagination for Large Repos
```typescript
async function getAllIssues(owner: string, repo: string): Promise<Issue[]> {
  return octokit.paginate(octokit.issues.listForRepo, {
    owner, repo, state: 'all', per_page: 100,
  });
}
```

## Error Handling
- **401**: Bad token. Check GITHUB_TOKEN env var and token scopes (needs `repo` for private repos).
- **403**: Rate limited. Check `X-RateLimit-Remaining` header. Use conditional requests with ETags.
- **404**: Repo not found or insufficient permissions. Verify owner/repo and token scopes.
- **422**: Validation error (duplicate label, invalid milestone). Read `error.response.data.errors` array.
- **Secondary rate limit**: Too many requests in short burst. Add 1s delay between mutating operations.

## Best Practices
- Always filter out PRs from issue listings (GitHub API returns both under `/issues`).
- Use `per_page: 100` with pagination for bulk operations.
- Prefer `octokit.paginate()` over manual page iteration.
- For CI integrations, use `GITHUB_TOKEN` from Actions (automatically scoped).
- Cache responses using ETags: pass `headers: { 'If-None-Match': etag }` to avoid rate limit waste.
- Use GraphQL API (`@octokit/graphql`) for complex queries that need nested data in one call.
