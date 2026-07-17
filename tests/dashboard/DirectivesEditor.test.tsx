// @vitest-environment happy-dom
// Tests follow the source-inspection pattern established in AppShell.test.tsx —
// reads the source file and asserts expected strings/patterns without rendering React.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const COMPONENT_PATH = join(
  process.cwd(),
  "src",
  "dashboard",
  "src",
  "components",
  "DirectivesEditor.tsx",
);
const src = () => readFileSync(COMPONENT_PATH, "utf-8");

describe("DirectivesEditor — file and exports", () => {
  it("file exists", () => {
    expect(existsSync(COMPONENT_PATH)).toBe(true);
  });

  it("exports DirectivesEditor function component", () => {
    const content = src();
    expect(content).toContain("export function DirectivesEditor");
  });
});

// SURF-7 (ADR-G-033): read-only cutover pin
describe("DirectivesEditor — read-only viewer render", () => {
  it("renders the DIRECTIVES content in a read-only pre (no Textarea)", () => {
    const content = src();
    expect(content).toContain('data-testid="directives-view"');
    expect(content).toContain("<pre");
    expect(content).toContain("DIRECTIVES");
    expect(content).not.toContain("Textarea");
    expect(content).not.toContain("directives-editor-textarea");
  });

  it("loads content from GET /api/directives via fetchJson", () => {
    const content = src();
    expect(content).toContain("/api/directives");
    expect(content).toContain("fetchJson");
  });

  it("renders the readonly notice with the directives hint", () => {
    const content = src();
    expect(content).toContain("ReadOnlyNotice");
    expect(content).toContain("readonly.hint.directives");
  });
});

// SURF-7 (ADR-G-033): read-only cutover pin
describe("DirectivesEditor — no mutation wiring", () => {
  it("has NO save button and never POSTs /api/directives", () => {
    const content = src();
    expect(content).not.toContain("postJson");
    expect(content).not.toContain("handleSave");
    expect(content).not.toContain("directives-save-btn");
  });

  it("has NO onChange edit path — content state only comes from the fetch", () => {
    const content = src();
    expect(content).not.toContain("onChange={");
    expect(content).toContain("setContent");
    expect(content).toContain("isLoading");
  });
});

describe("DirectivesEditor — empty content guard", () => {
  it("tracks isEmpty derived state from content", () => {
    const content = src();
    expect(content).toContain("isEmpty");
    expect(content).toContain("content.trim()");
  });

  it("shows the empty warning banner when content is empty", () => {
    const content = src();
    expect(content).toContain("directives-empty-warning");
    expect(content).toContain("empty");
  });

  it("exposes onContentChange callback for parent integration", () => {
    const content = src();
    expect(content).toContain("onContentChange");
    expect(content).toContain("hasContent");
  });
});
