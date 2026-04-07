// ─── Managed Docs ─────────────────────────────────────────────────────────
// Barrel exports for user-defined document management system.

export type { ManagedDocEntry, DocsConfig, ParsedSection, SectionGenerator, ManagedDocUpdateResult } from './types.js';
export { loadDocsConfig, saveDocsConfig, addDoc, removeDoc, getDoc, generateDocId } from './docs-config.js';
export { parseSections, findSectionByTitle, replaceSectionContent, appendSection, updateDocSections, trimToMaxLines } from './section-updater.js';
export { findGenerator, generateAllSections } from './content-generators.js';
export { runManagedDocUpdates } from './managed-doc-runner.js';
