# Todoist Skill

## Trigger Patterns
- todoist, task, todo, project, label, priority
- "create todoist task", "list projects", "add label", "set priority", "complete task"

## Core Expertise

### Client Setup
```typescript
import { TodoistApi } from '@doist/todoist-api-typescript';
const api = new TodoistApi(process.env.TODOIST_API_TOKEN!);
```

### Task Operations
```typescript
// Create a task with full metadata
const task = await api.addTask({
  content: 'Review pull request #42',
  description: 'Check test coverage and type safety',
  projectId: '2203456',
  priority: 4,        // 1=normal, 4=urgent
  dueString: 'tomorrow at 10am',
  labels: ['code-review', 'urgent'],
});

// Get all active tasks
const tasks = await api.getTasks();

// Filter tasks by project
const projectTasks = await api.getTasks({ projectId: '2203456' });

// Complete a task
await api.closeTask(task.id);

// Update a task
await api.updateTask(task.id, {
  content: 'Updated task title',
  priority: 2,
});
```

### Project Operations
```typescript
// List all projects
const projects = await api.getProjects();

// Create a project with color
const project = await api.addProject({
  name: 'Sprint 149',
  color: 'blue',
  isFavorite: true,
});

// Get project details
const details = await api.getProject(projectId);
```

### Label & Section Operations
```typescript
// Create labels for categorization
await api.addLabel({ name: 'high-priority', color: 'red' });

// Create sections within a project
await api.addSection({ name: 'In Progress', projectId: '2203456' });

// Move task to section
await api.updateTask(taskId, { sectionId: sectionId });
```

### Due Date Patterns
```typescript
// Natural language due dates (Todoist parses these)
{ dueString: 'every monday at 9am' }       // Recurring
{ dueString: 'next friday' }                // Relative
{ dueDate: '2026-04-25' }                   // Absolute (date only)
{ dueDatetime: '2026-04-25T14:00:00Z' }     // Absolute with time
```

### Error Handling
- **Rate limits:** 450 requests per 15 minutes. Cache project/label lists locally.
- **Task not found:** Completed tasks return 404 on `getTask`. Use `closeTask` idempotently.
- **Priority inversion:** Todoist priority 4 = highest (UI "P1"), priority 1 = lowest (UI "P4"). Map carefully.
- **Sync API vs REST:** The REST API v2 is simpler. Use Sync API only for offline-first or bulk operations.
- **Token storage:** Store in `.deck` file as `$DECK:TODOIST_API_TOKEN`.

### Batch Pattern
```typescript
// Bulk create tasks from a list
const items = ['Task A', 'Task B', 'Task C'];
const created = await Promise.all(
  items.map(content => api.addTask({ content, projectId, priority: 2 }))
);
```

### Best Practices
- Always set `projectId` explicitly. Default inbox can get cluttered.
- Use labels for cross-project categorization (e.g., "blocked", "waiting").
- Recurring tasks use `dueString` with natural language, not `dueDate`.
- For Deckent integration: map sprint tasks to Todoist projects, use labels for agent assignment.
