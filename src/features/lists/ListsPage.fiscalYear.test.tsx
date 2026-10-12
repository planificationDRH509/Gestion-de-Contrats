import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ListsPage } from "./ListsPage";
import { useFiscalYearFilter } from "../../lib/useFiscalYearFilter";

vi.mock("../auth/auth", () => ({ useAuth: () => ({ user: { id: "u", workspaceId: "w" }, can: () => false }) }));
vi.mock("../../lib/useIsMobileViewport", () => ({ useIsMobileViewport: () => false }));
vi.mock("./ListDetail", () => ({ ListDetail: ({ list }: { list: { id: string } }) => <div>Detail {list.id}</div> }));
vi.mock("./listsApi", () => ({ useContractLists: () => ({ data: [
  { id: "current", createdAt: "2026-10-01T12:00:00Z", visaNumber: "CURRENT", durationMonths: 12, members: [], history: [] },
  { id: "past", createdAt: "2026-09-30T12:00:00Z", visaNumber: "PAST", durationMonths: 6, members: [], history: [], sealedAt: "2026-09-30" }
] }) }));

afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); });
function HomeFilter() {
  const [, setYear] = useFiscalYearFilter("w", "u");
  return <button onClick={() => setYear("2025-2026")}>Previous year</button>;
}
it("defaults to the current fiscal year and follows the home selection across navigation", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  const home = render(<HomeFilter />);
  const page = render(<MemoryRouter><ListsPage /></MemoryRouter>);
  expect(screen.getByText("Visa CURRENT")).toBeInTheDocument();
  expect(screen.queryByText("Visa PAST")).not.toBeInTheDocument();
  act(() => screen.getByText("Previous year").click());
  expect(screen.getByText("Visa PAST")).toBeInTheDocument();
  expect(screen.queryByText("Visa CURRENT")).not.toBeInTheDocument();
  home.unmount();
  page.unmount();
  render(<MemoryRouter initialEntries={["/?liste=current"]}><ListsPage /></MemoryRouter>);
  expect(screen.getByText("Visa PAST")).toBeInTheDocument();
  expect(screen.queryByText("Detail current")).not.toBeInTheDocument();
  expect(screen.getByText("Liste introuvable")).toBeInTheDocument();
});
