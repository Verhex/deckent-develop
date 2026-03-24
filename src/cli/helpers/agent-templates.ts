/**
 * Agent Template Engine — generates integration files for external AI agents.
 * Supports Codex (AGENTS.md), Gemini (GEMINI.md), and Cursor (.cursor/rules/deckent.mdc).
 */

export interface ProjectInfo {
  name: string;
  language: string;
  framework: string;
  commands: { build: string; test: string; lint: string };
}

/**
 * Generate AGENTS.md content for Codex integration.
 * Includes project name, stack info, Deckent rules, and build/test commands.
 */
export function generateAgentsMd(info: ProjectInfo): string {
  return `# AGENTS.md — Deckent Integration

Project: ${info.name} (${info.language}/${info.framework})

## Sprint Instructions
- Read DIRECTIVES.md for current sprint goals
- Follow task scope boundaries strictly
- Write tests for all changes
- Report results in .tasks/ directory

## Commands
- Build: ${info.commands.build}
- Test: ${info.commands.test}
- Lint: ${info.commands.lint}

## Project Context
@DECKENT.md
`;
}

/**
 * Generate GEMINI.md content for Gemini CLI integration.
 * Includes project context, Deckent rules, and stack-aware commands.
 */
export function generateGeminiMd(info: ProjectInfo): string {
  return `# GEMINI.md — Deckent Integration

Project: ${info.name} (${info.language}/${info.framework})

## Context
@DECKENT.md

## Rules
- Follow DIRECTIVES.md for sprint goals
- Respect file scope boundaries
- Run tests before reporting completion

## Commands
- Build: ${info.commands.build}
- Test: ${info.commands.test}
`;
}

/**
 * Generate .cursor/rules/deckent.mdc content for Cursor integration.
 * Includes YAML frontmatter and Deckent scope rules.
 */
export function generateCursorRules(info: ProjectInfo): string {
  return `---
description: Deckent AI Agent Orchestrator rules for ${info.name}
globs: **/*
---

# Deckent Integration

Project: ${info.name} (${info.language}/${info.framework})

## Rules
- Read DIRECTIVES.md for current sprint goals
- Follow task scope boundaries
- Run tests before reporting completion

## Context
@DECKENT.md
`;
}

/**
 * Append Deckent section to existing file content.
 * If Deckent section already exists (marked by "# Deckent Integration"), skip.
 * Returns the merged content.
 */
export function appendDeckentSection(existingContent: string, newSection: string): string {
  if (existingContent.includes('# Deckent Integration')) {
    return existingContent;
  }
  return existingContent + '\n\n---\n\n' + newSection;
}
