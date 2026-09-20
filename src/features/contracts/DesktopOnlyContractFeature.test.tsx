import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DesktopOnlyContractFeature } from "./DesktopOnlyContractFeature";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockMobileViewport(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })));
}

describe("DesktopOnlyContractFeature", () => {
  it("redirects mobile users away from contract documents", () => {
    mockMobileViewport(true);
    render(
      <MemoryRouter initialEntries={["/app/contrats/123"]}>
        <Routes>
          <Route path="/app/contrats" element={<span>Liste des contrats</span>} />
          <Route path="/app/contrats/:contractId" element={<DesktopOnlyContractFeature><span>Document du contrat</span></DesktopOnlyContractFeature>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Liste des contrats")).toBeInTheDocument();
    expect(screen.queryByText("Document du contrat")).not.toBeInTheDocument();
  });

  it("keeps contract documents available on larger screens", () => {
    mockMobileViewport(false);
    render(
      <MemoryRouter initialEntries={["/app/contrats/123"]}>
        <Routes>
          <Route path="/app/contrats/:contractId" element={<DesktopOnlyContractFeature><span>Document du contrat</span></DesktopOnlyContractFeature>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Document du contrat")).toBeInTheDocument();
  });
});
