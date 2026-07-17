// @vitest-environment happy-dom
// SURF-7 (ADR-G-033): read-only cutover pin — the dashboard UI language is a
// CLIENT preference (localStorage `deckent.dashboard.lang`); flipping it must
// never POST /api/config. Project config stays the first-boot DEFAULT only.
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

const postJsonMock = vi.fn();
const fetchJsonMock = vi.fn();

vi.mock("../../src/dashboard/src/lib/api", () => ({
  postJson: (...args: unknown[]) => postJsonMock(...args),
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
}));

import { LanguageProvider, useTranslation } from "../../src/dashboard/src/i18n/LanguageProvider";

const LANG_KEY = "deckent.dashboard.lang";

function Probe() {
  const { lang, setLang } = useTranslation();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <button data-testid="to-tr" onClick={() => setLang("tr")}>tr</button>
    </div>
  );
}

function renderProbe() {
  return render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("LanguageProvider — client-side language preference (SURF-7)", () => {
  it("setLang writes localStorage and performs NO POST /api/config", async () => {
    fetchJsonMock.mockResolvedValue({});
    renderProbe();

    fireEvent.click(screen.getByTestId("to-tr"));

    await waitFor(() => expect(screen.getByTestId("lang").textContent).toBe("tr"));
    expect(window.localStorage.getItem(LANG_KEY)).toBe("tr");
    expect(postJsonMock).not.toHaveBeenCalled();
  });

  it("initial lang comes from localStorage without any config fetch", () => {
    window.localStorage.setItem(LANG_KEY, "tr");
    renderProbe();

    expect(screen.getByTestId("lang").textContent).toBe("tr");
    expect(fetchJsonMock).not.toHaveBeenCalled();
  });

  it("falls back to GET /api/config language only when nothing is stored", async () => {
    fetchJsonMock.mockResolvedValue({ language: "tr" });
    renderProbe();

    await waitFor(() => expect(screen.getByTestId("lang").textContent).toBe("tr"));
    expect(fetchJsonMock).toHaveBeenCalledWith("/api/config");
    expect(postJsonMock).not.toHaveBeenCalled();
  });
});
