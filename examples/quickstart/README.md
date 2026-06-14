# Deckent Quickstart Example

This is a minimal example project demonstrating Deckent's orchestration capabilities.

## Getting Started

### Prerequisites
- Node.js >=18.0.0
- Deckent CLI installed globally or available locally

### Installation

```bash
npm install
```

### Usage

1. **View the plan**
   ```bash
   npm run deckent:plan
   ```
   This will read `DIRECTIVES.md` and display the planned tasks.

2. **Start the sprint**
   ```bash
   npm run deckent:start
   ```
   This will spawn workers and begin task execution. Monitor progress with `deckent status`.

3. **Check status**
   ```bash
   npm run deckent:status
   ```
   View real-time progress of the sprint execution.

4. **Run diagnostics**
   ```bash
   npm run deckent:doctor
   ```
   Check the health of your Deckent setup.

## Project Structure

```
.
├── package.json          # Project configuration
├── DIRECTIVES.md         # Sprint directives (2 tasks)
├── README.md             # This file
└── .deckent/             # Deckent state (auto-generated)
    ├── config.json
    ├── .brain/
    ├── .tasks/
    └── .locks/
```

## The Sprint

This example defines 2 simple tasks:

1. **Validate Project Structure** — Verify directory and file integrity
2. **Generate Summary Report** — Create a SUMMARY.md with project stats

Both tasks are designed to complete quickly and demonstrate the core Deckent workflow.

## Next Steps

- Edit `DIRECTIVES.md` to add more tasks
- Customize task scope and execution logic
- Integrate with your AI development workflow
- Check the main Deckent documentation for advanced features

## Resources

- [deckent Documentation](https://deckent.ai)
- [Architecture Guide](../../docs/architecture/architecture.md)
- [Contributing Guide](../../CONTRIBUTING.md)
