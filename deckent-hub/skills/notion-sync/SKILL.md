# Notion Sync Skill

## Trigger Patterns
- notion, database, page, block, sync, workspace
- "create notion page", "query database", "update block", "sync workspace"

## Core Expertise

### Client Setup
```typescript
import { Client } from '@notionhq/client';
const notion = new Client({ auth: process.env.NOTION_TOKEN });
```

### Database Operations
```typescript
// Query a database with filters and sorts
const response = await notion.databases.query({
  database_id: 'abc123',
  filter: {
    property: 'Status',
    select: { equals: 'In Progress' },
  },
  sorts: [{ property: 'Created', direction: 'descending' }],
});

// Create a database entry
await notion.pages.create({
  parent: { database_id: 'abc123' },
  properties: {
    Name: { title: [{ text: { content: 'New Item' } }] },
    Status: { select: { name: 'Todo' } },
    Priority: { number: 1 },
  },
});
```

### Page & Block Operations
```typescript
// Append blocks to a page (children)
await notion.blocks.children.append({
  block_id: pageId,
  children: [
    { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: 'Section' } }] } },
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Body text here.' } }] } },
    { object: 'block', type: 'to_do', to_do: { rich_text: [{ text: { content: 'Task item' } }], checked: false } },
  ],
});

// Retrieve all blocks (handle pagination)
let blocks: BlockObjectResponse[] = [];
let cursor: string | undefined;
do {
  const resp = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
  blocks.push(...resp.results as BlockObjectResponse[]);
  cursor = resp.has_more ? resp.next_cursor ?? undefined : undefined;
} while (cursor);
```

### Error Handling
- **Rate limits:** Notion API uses 3 req/s per integration. Implement exponential backoff on 429.
- **Pagination:** Always handle `has_more` + `next_cursor` for list endpoints.
- **Property types:** Each property type (title, rich_text, select, multi_select, number, date, relation) has its own nested structure. Always check the property type before accessing values.
- **Archived pages:** Filter out `archived: true` results unless explicitly needed.
- **Token scopes:** Internal integrations need explicit page/database sharing. If 404, check integration access.

### Sync Pattern
```typescript
// Incremental sync using last_edited_time filter
const lastSync = loadLastSyncTimestamp();
const updated = await notion.databases.query({
  database_id: dbId,
  filter: { timestamp: 'last_edited_time', last_edited_time: { after: lastSync } },
});
// Process updated.results, then save new timestamp
```

### Best Practices
- Use database IDs (not page IDs) for structured data queries.
- Rich text is always an array of text objects with annotations. Never assume a single element.
- For bulk operations, batch requests and respect rate limits.
- Store the integration token in `.deck` file, reference via `$DECK:NOTION_TOKEN`.
