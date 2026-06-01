// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Onboarding } from "../../src/dashboard/src/components/Onboarding";

afterEach(() => {
  cleanup();
});

describe("Onboarding wizard", () => {
  it("renders first step on initial load", () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    render(<Onboarding onComplete={onComplete} onSkip={onSkip} />);

    expect(screen.getByTestId("onboarding-wizard")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-title").textContent).toBe(
      "Initialize your project",
    );
  });

  it("advances to next step when Next is clicked", () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    render(<Onboarding onComplete={onComplete} onSkip={onSkip} />);

    fireEvent.click(screen.getByTestId("onboarding-next"));

    expect(screen.getByTestId("onboarding-step-title").textContent).toBe(
      "Write your sprint directives",
    );
  });

  it("shows step progress indicators for all steps", () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    render(<Onboarding onComplete={onComplete} onSkip={onSkip} />);

    expect(screen.getByTestId("onboarding-steps")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-indicator-0")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-indicator-1")).toBeTruthy();
    expect(screen.getByTestId("onboarding-step-indicator-2")).toBeTruthy();
  });

  it("calls onSkip when Skip button is clicked", () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    render(<Onboarding onComplete={onComplete} onSkip={onSkip} />);

    fireEvent.click(screen.getByTestId("onboarding-skip"));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("calls onComplete on last step when Get started is clicked", () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    render(<Onboarding onComplete={onComplete} onSkip={onSkip} />);

    fireEvent.click(screen.getByTestId("onboarding-next"));
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("onboarding-next").textContent).toBe("Get started");

    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("shows guide text for each step", () => {
    const onComplete = vi.fn();
    const onSkip = vi.fn();
    render(<Onboarding onComplete={onComplete} onSkip={onSkip} />);

    expect(screen.getByText(/deckent init/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByText(/DIRECTIVES\.md/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByText(/deckent start/)).toBeTruthy();
  });
});
