// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TaskCard,
  getCardColor,
  getCardIcon,
  getCardIconColor,
  describeCurrentAction,
  getBadgeVariant,
  getBadgeLabel,
  type TaskCardData,
} from "../../src/dashboard/src/components/TaskCard";

// ─── Fixtures ───────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskCardData> = {}): TaskCardData {
  return {
    id: "041-001",
    title: "Test task",
    status: "PENDING",
    ...overrides,
  };
}

// ─── getCardColor tests ─────────────────────────────────────────────

describe("getCardColor", () => {
  it("returns green for DONE", () => {
    expect(getCardColor("DONE")).toContain("green");
  });

  it("returns blue for EXECUTING", () => {
    expect(getCardColor("EXECUTING")).toContain("blue");
  });

  it("returns blue for CODING", () => {
    expect(getCardColor("CODING")).toContain("blue");
  });

  it("returns blue for TESTING", () => {
    expect(getCardColor("TESTING")).toContain("blue");
  });

  it("returns blue for VERIFYING", () => {
    expect(getCardColor("VERIFYING")).toContain("blue");
  });

  it("returns red for NO_GO", () => {
    expect(getCardColor("NO_GO")).toContain("red");
  });

  it("returns red for ERROR", () => {
    expect(getCardColor("ERROR")).toContain("red");
  });

  it("returns yellow for PAUSED", () => {
    expect(getCardColor("PAUSED")).toContain("yellow");
  });

  it("returns zinc (gray) for unknown/PENDING", () => {
    expect(getCardColor("PENDING")).toContain("zinc");
    expect(getCardColor("DRAFT")).toContain("zinc");
  });
});

// ─── getCardIcon tests ──────────────────────────────────────────────

describe("getCardIcon", () => {
  it("returns different icons for different statuses", () => {
    const doneIcon = getCardIcon("DONE");
    const execIcon = getCardIcon("EXECUTING");
    const nogoIcon = getCardIcon("NO_GO");
    const pendingIcon = getCardIcon("PENDING");
    expect(doneIcon).not.toBe(execIcon);
    expect(nogoIcon).not.toBe(pendingIcon);
  });

  it("returns same icon for active sub-statuses", () => {
    expect(getCardIcon("CODING")).toBe(getCardIcon("EXECUTING"));
    expect(getCardIcon("TESTING")).toBe(getCardIcon("VERIFYING"));
  });
});

// ─── getCardIconColor tests ─────────────────────────────────────────

describe("getCardIconColor", () => {
  it("returns green for DONE", () => {
    expect(getCardIconColor("DONE")).toBe("text-green-400");
  });

  it("returns blue for active statuses", () => {
    expect(getCardIconColor("EXECUTING")).toBe("text-blue-400");
    expect(getCardIconColor("CODING")).toBe("text-blue-400");
  });

  it("returns red for NO_GO", () => {
    expect(getCardIconColor("NO_GO")).toBe("text-red-400");
  });

  it("returns yellow for PAUSED", () => {
    expect(getCardIconColor("PAUSED")).toBe("text-yellow-400");
  });

  it("returns zinc for unknown", () => {
    expect(getCardIconColor("PENDING")).toBe("text-zinc-500");
  });
});

// ─── describeCurrentAction tests ────────────────────────────────────

describe("describeCurrentAction", () => {
  it("returns custom currentAction when provided", () => {
    const task = makeTask({ currentAction: "Custom action" });
    expect(describeCurrentAction(task)).toBe("Custom action");
  });

  it("returns 'Completed' for DONE", () => {
    expect(describeCurrentAction(makeTask({ status: "DONE" }))).toBe("Completed");
  });

  it("returns 'Working...' for EXECUTING", () => {
    expect(describeCurrentAction(makeTask({ status: "EXECUTING" }))).toBe("Working...");
  });

  it("returns 'Writing code' for CODING", () => {
    expect(describeCurrentAction(makeTask({ status: "CODING" }))).toBe("Writing code");
  });

  it("returns 'Running tests' for TESTING with single attempt", () => {
    expect(describeCurrentAction(makeTask({ status: "TESTING" }))).toBe("Running tests");
  });

  it("returns 'Running tests (attempt N/3)' for TESTING with retries", () => {
    const task = makeTask({
      status: "TESTING",
      feedbackLoop: { tscAttempts: 1, testAttempts: 2 },
    });
    expect(describeCurrentAction(task)).toBe("Running tests (attempt 2/3)");
  });

  it("returns 'Type checking' for VERIFYING", () => {
    expect(describeCurrentAction(makeTask({ status: "VERIFYING" }))).toBe("Type checking");
  });

  it("returns 'Failed — needs attention' for NO_GO", () => {
    expect(describeCurrentAction(makeTask({ status: "NO_GO" }))).toContain("needs attention");
  });

  it("returns 'Queued' for PENDING without dependencies", () => {
    expect(describeCurrentAction(makeTask({ status: "PENDING" }))).toBe("Queued");
  });

  it("returns 'Waiting for Task X' for PENDING with dependencies", () => {
    const task = makeTask({ status: "PENDING", dependsOn: ["041-002"] });
    expect(describeCurrentAction(task)).toBe("Waiting for Task 041-002");
  });

  it("returns 'Waiting' for unknown status", () => {
    expect(describeCurrentAction(makeTask({ status: "UNKNOWN" }))).toBe("Waiting");
  });
});

// ─── getBadgeVariant tests ──────────────────────────────────────────

describe("getBadgeVariant", () => {
  it("returns success for DONE", () => {
    expect(getBadgeVariant("DONE")).toBe("success");
  });

  it("returns info for active statuses", () => {
    expect(getBadgeVariant("EXECUTING")).toBe("info");
    expect(getBadgeVariant("CODING")).toBe("info");
    expect(getBadgeVariant("TESTING")).toBe("info");
  });

  it("returns destructive for NO_GO/ERROR", () => {
    expect(getBadgeVariant("NO_GO")).toBe("destructive");
    expect(getBadgeVariant("ERROR")).toBe("destructive");
  });

  it("returns warning for PAUSED", () => {
    expect(getBadgeVariant("PAUSED")).toBe("warning");
  });

  it("returns secondary for unknown", () => {
    expect(getBadgeVariant("PENDING")).toBe("secondary");
  });
});

// ─── getBadgeLabel tests ────────────────────────────────────────────

describe("getBadgeLabel", () => {
  it("maps DONE to Done", () => { expect(getBadgeLabel("DONE")).toBe("Done"); });
  it("maps EXECUTING to Active", () => { expect(getBadgeLabel("EXECUTING")).toBe("Active"); });
  it("maps CODING to Writing code", () => { expect(getBadgeLabel("CODING")).toBe("Writing code"); });
  it("maps NO_GO to No-Go", () => { expect(getBadgeLabel("NO_GO")).toBe("No-Go"); });
  it("maps PENDING to Queued", () => { expect(getBadgeLabel("PENDING")).toBe("Queued"); });
  it("maps PAUSED to Paused", () => { expect(getBadgeLabel("PAUSED")).toBe("Paused"); });
  it("maps unknown to Waiting", () => { expect(getBadgeLabel("SOMETHING")).toBe("Waiting"); });
});

// ─── TaskCard component rendering tests ─────────────────────────────

describe("TaskCard component", () => {
  it("renders without crashing", () => {
    render(<TaskCard task={makeTask()} />);
    expect(screen.getByTestId("task-card-041-001")).toBeTruthy();
  });

  it("shows task ID and title", () => {
    render(<TaskCard task={makeTask({ title: "Fix logging" })} />);
    expect(screen.getByText("Task 041-001")).toBeTruthy();
    expect(screen.getByText("Fix logging")).toBeTruthy();
  });

  it("shows correct data-status attribute", () => {
    render(<TaskCard task={makeTask({ status: "DONE" })} />);
    expect(screen.getByTestId("task-card-041-001").getAttribute("data-status")).toBe("DONE");
  });

  it("shows current action text", () => {
    render(<TaskCard task={makeTask({ status: "CODING" })} />);
    expect(screen.getByTestId("task-action-041-001").textContent).toBe("Writing code");
  });

  it("shows badge with correct label", () => {
    render(<TaskCard task={makeTask({ status: "DONE" })} />);
    expect(screen.getByText("Done")).toBeTruthy();
  });

  it("shows correct color for DONE status (green)", () => {
    render(<TaskCard task={makeTask({ status: "DONE" })} />);
    const card = screen.getByTestId("task-card-041-001");
    expect(card.className).toContain("green");
  });

  it("shows correct color for EXECUTING status (blue)", () => {
    render(<TaskCard task={makeTask({ status: "EXECUTING" })} />);
    const card = screen.getByTestId("task-card-041-001");
    expect(card.className).toContain("blue");
  });

  it("shows correct color for NO_GO status (red)", () => {
    render(<TaskCard task={makeTask({ status: "NO_GO" })} />);
    const card = screen.getByTestId("task-card-041-001");
    expect(card.className).toContain("red");
  });

  it("shows correct color for PAUSED status (yellow)", () => {
    render(<TaskCard task={makeTask({ status: "PAUSED" })} />);
    const card = screen.getByTestId("task-card-041-001");
    expect(card.className).toContain("yellow");
  });

  it("shows correct color for PENDING status (gray/zinc)", () => {
    render(<TaskCard task={makeTask({ status: "PENDING" })} />);
    const card = screen.getByTestId("task-card-041-001");
    expect(card.className).toContain("zinc");
  });

  it("does not show details when collapsed", () => {
    const task = makeTask({
      status: "DONE",
      filesChanged: ["src/foo.ts"],
    });
    render(<TaskCard task={task} />);
    expect(screen.queryByTestId("task-details-041-001")).toBeNull();
  });

  it("shows details when clicked (expandable)", () => {
    const task = makeTask({
      status: "DONE",
      filesChanged: ["src/foo.ts", "src/bar.ts"],
    });
    render(<TaskCard task={task} />);

    fireEvent.click(screen.getByTestId("task-card-toggle-041-001"));

    expect(screen.getByTestId("task-details-041-001")).toBeTruthy();
    expect(screen.getByTestId("task-files-041-001")).toBeTruthy();
    expect(screen.getByText("src/foo.ts")).toBeTruthy();
    expect(screen.getByText("src/bar.ts")).toBeTruthy();
  });

  it("shows files changed count in expandable details", () => {
    const task = makeTask({
      status: "DONE",
      filesChanged: ["a.ts", "b.ts", "c.ts"],
    });
    render(<TaskCard task={task} />);
    fireEvent.click(screen.getByTestId("task-card-toggle-041-001"));

    expect(screen.getByText(/Files changed \(3\)/)).toBeTruthy();
  });

  it("shows test results in expandable details", () => {
    const task = makeTask({
      status: "DONE",
      filesChanged: ["a.ts"],
      testResults: { passed: 10, failed: 2, total: 12 },
    });
    render(<TaskCard task={task} />);
    fireEvent.click(screen.getByTestId("task-card-toggle-041-001"));

    expect(screen.getByTestId("task-tests-041-001")).toBeTruthy();
    expect(screen.getByText("10 passed")).toBeTruthy();
    expect(screen.getByText("2 failed")).toBeTruthy();
    expect(screen.getByText("12 total")).toBeTruthy();
  });

  it("hides failed count when zero", () => {
    const task = makeTask({
      status: "DONE",
      filesChanged: ["a.ts"],
      testResults: { passed: 10, failed: 0, total: 10 },
    });
    render(<TaskCard task={task} />);
    fireEvent.click(screen.getByTestId("task-card-toggle-041-001"));

    expect(screen.getByText("10 passed")).toBeTruthy();
    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("shows retry history in expandable details", () => {
    const task = makeTask({
      status: "DONE",
      filesChanged: ["a.ts"],
      retryHistory: [
        { attempt: 1, reason: "tsc failed" },
        { attempt: 2, reason: "test assertion mismatch" },
      ],
    });
    render(<TaskCard task={task} />);
    fireEvent.click(screen.getByTestId("task-card-toggle-041-001"));

    expect(screen.getByTestId("task-retries-041-001")).toBeTruthy();
    expect(screen.getByText(/Attempt 1: tsc failed/)).toBeTruthy();
    expect(screen.getByText(/Attempt 2: test assertion mismatch/)).toBeTruthy();
  });

  it("collapses details when clicked again", () => {
    const task = makeTask({
      status: "DONE",
      filesChanged: ["src/foo.ts"],
    });
    render(<TaskCard task={task} />);

    const toggle = screen.getByTestId("task-card-toggle-041-001");
    fireEvent.click(toggle);
    expect(screen.getByTestId("task-details-041-001")).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByTestId("task-details-041-001")).toBeNull();
  });

  it("does not expand when task has no details", () => {
    const task = makeTask({ status: "PENDING" });
    render(<TaskCard task={task} />);

    fireEvent.click(screen.getByTestId("task-card-toggle-041-001"));
    expect(screen.queryByTestId("task-details-041-001")).toBeNull();
  });

  it("shows 'Waiting for Task X' when PENDING with dependencies", () => {
    const task = makeTask({ status: "PENDING", dependsOn: ["041-003"] });
    render(<TaskCard task={task} />);
    expect(screen.getByTestId("task-action-041-001").textContent).toBe("Waiting for Task 041-003");
  });

  it("shows test retry attempt text for TESTING status", () => {
    const task = makeTask({
      status: "TESTING",
      feedbackLoop: { tscAttempts: 1, testAttempts: 2 },
    });
    render(<TaskCard task={task} />);
    expect(screen.getByTestId("task-action-041-001").textContent).toBe("Running tests (attempt 2/3)");
  });
});
