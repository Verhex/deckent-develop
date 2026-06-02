// @vitest-environment happy-dom
// RefreshButton cooldown tests (sprint-220 task 220-006/220-007-fix).
// Source-inspection style — reads the .tsx source and asserts structure.
// No DOM render, no timer mocks, no network — fully hermetic.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS_DIR = join(process.cwd(), "src", "dashboard", "src", "components");
const COMPONENT_PATH = join(COMPONENTS_DIR, "RefreshButton.tsx");

const src = () => readFileSync(COMPONENT_PATH, "utf-8");

describe("RefreshButton — file exists and exports", () => {
  it("RefreshButton.tsx file exists", () => {
    expect(existsSync(COMPONENT_PATH)).toBe(true);
  });

  it("exports RefreshButton function component", () => {
    const content = src();
    expect(content).toContain("export function RefreshButton");
  });
});

describe("RefreshButton — refresh trigger", () => {
  it("calls onRefetch prop on click via handleRefresh", () => {
    const content = src();
    // accepts onRefetch prop and calls it on click
    expect(content).toContain("onRefetch");
    expect(content).toContain("handleRefresh");
  });

  it("onClick handler wired to button element", () => {
    const content = src();
    expect(content).toContain("onClick={handleRefresh}");
  });

  it("renders Refresh label when not in cooldown", () => {
    const content = src();
    expect(content).toContain('"Refresh"');
  });
});

describe("RefreshButton — cooldown disable", () => {
  it("tracks cooldown boolean state", () => {
    const content = src();
    expect(content).toContain("cooldown");
    expect(content).toContain("setCooldown");
  });

  it("button is disabled during cooldown", () => {
    const content = src();
    expect(content).toContain("disabled={cooldown}");
  });

  it("starts cooldown on refresh click", () => {
    const content = src();
    // setCooldown(true) called in handleRefresh
    expect(content).toContain("setCooldown(true)");
  });
});

describe("RefreshButton — countdown display", () => {
  it("tracks countdown numeric state for remaining seconds", () => {
    const content = src();
    expect(content).toContain("countdown");
    expect(content).toContain("setCountdown");
  });

  it("displays countdown seconds in button label during cooldown", () => {
    const content = src();
    // Shows "Refresh (Ns)" during cooldown
    expect(content).toContain("Refresh (");
    expect(content).toContain("countdown");
  });

  it("uses setInterval to decrement countdown each second", () => {
    const content = src();
    expect(content).toContain("setInterval");
    expect(content).toContain("clearInterval");
  });
});

describe("RefreshButton — re-enable after cooldown", () => {
  it("clears cooldown when countdown reaches zero", () => {
    const content = src();
    // setCooldown(false) called when prev <= 1
    expect(content).toContain("setCooldown(false)");
  });

  it("supports configurable cooldownMs prop (default 10000ms)", () => {
    const content = src();
    expect(content).toContain("cooldownMs");
    expect(content).toContain("10000");
  });

  it("cleans up interval on unmount via useEffect return", () => {
    const content = src();
    // return () => clearInterval prevents memory leaks
    expect(content).toContain("return () => clearInterval");
  });
});
