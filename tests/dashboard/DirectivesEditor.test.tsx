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

describe("DirectivesEditor — content render", () => {
  it("renders Textarea for editing DIRECTIVES content", () => {
    const content = src();
    expect(content).toContain("Textarea");
    expect(content).toContain("directives-editor-textarea");
    expect(content).toContain("DIRECTIVES");
  });

  it("loads content from GET /api/directives via fetchJson", () => {
    const content = src();
    expect(content).toContain("/api/directives");
    expect(content).toContain("fetchJson");
  });
});

describe("DirectivesEditor — edit", () => {
  it("has onChange handler that updates editor content state", () => {
    const content = src();
    // setContent called from onChange
    expect(content).toContain("setContent");
    expect(content).toContain("onChange");
  });

  it("tracks loading and saved state for UX feedback", () => {
    const content = src();
    expect(content).toContain("isLoading");
    expect(content).toContain("setSaved");
  });
});

describe("DirectivesEditor — save", () => {
  it("save button calls POST /api/directives via postJson", () => {
    const content = src();
    expect(content).toContain("postJson");
    expect(content).toContain("/api/directives");
    expect(content).toContain("handleSave");
  });

  it("save button has data-testid and shows saving indicator", () => {
    const content = src();
    expect(content).toContain("directives-save-btn");
    expect(content).toContain("Saving");
    expect(content).toContain("Save");
  });
});

describe("DirectivesEditor — empty content guard", () => {
  it("tracks isEmpty derived state from content", () => {
    const content = src();
    expect(content).toContain("isEmpty");
    expect(content).toContain("content.trim()");
  });

  it("disables save button when content is empty", () => {
    const content = src();
    // disabled prop is set based on isEmpty
    expect(content).toContain("disabled={isSaving || isEmpty}");
  });

  it("shows warning banner and footer message when empty", () => {
    const content = src();
    expect(content).toContain("directives-empty-warning");
    expect(content).toContain("empty");
    expect(content).toContain("disabled");
    // footer warning text
    expect(content).toContain("Sprint start is disabled");
  });

  it("exposes onContentChange callback for parent start-button integration", () => {
    const content = src();
    expect(content).toContain("onContentChange");
    expect(content).toContain("hasContent");
  });
});
