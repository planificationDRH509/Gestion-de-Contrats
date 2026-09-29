import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MultiSelectDropdown } from "./MultiSelectDropdown";

afterEach(cleanup);

function Filter({ initial = [] }: { initial?: string[] }) {
  const [selected, setSelected] = useState(initial);
  return <>
    <MultiSelectDropdown label="Institution" options={["Hôpital de Delmas", "Hôpital du Cap", "Centre de Delmas"]}
      selectedValues={selected} onChange={setSelected} placeholder="Toutes les institutions" searchable />
    <output data-testid="selection">{selected.join("|")}</output>
  </>;
}

describe("searchable multiselect filters", () => {
  it("selects and clears only search results while preserving other selections", async () => {
    render(<Filter initial={["Hôpital du Cap"]} />);
    await userEvent.click(screen.getByRole("button", { name: /Hôpital du Cap/ }));
    await userEvent.type(screen.getByRole("searchbox"), "delmas hopital");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Toutes" }));
    expect(screen.getByTestId("selection")).toHaveTextContent("Hôpital du Cap|Hôpital de Delmas");
    await userEvent.click(screen.getByRole("button", { name: "Aucun" }));
    expect(screen.getByTestId("selection")).toHaveTextContent(/^Hôpital du Cap$/);
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.click(screen.getByRole("button", { name: "Toutes" }));
    expect(screen.getAllByRole("checkbox").every(input => (input as HTMLInputElement).checked)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Aucun" }));
    expect(screen.getByTestId("selection")).toBeEmptyDOMElement();
  });

  it("does not select hidden options when the search has no results", async () => {
    render(<Filter />);
    await userEvent.click(screen.getByRole("button", { name: /Toutes les institutions/ }));
    await userEvent.type(screen.getByRole("searchbox"), "inexistant");
    await userEvent.click(screen.getByRole("button", { name: "Toutes" }));
    expect(screen.getByTestId("selection")).toBeEmptyDOMElement();
  });

  it("does not mistake obsolete selections for all available options", () => {
    render(<Filter initial={["Ancien A", "Ancien B", "Ancien C"]} />);
    expect(screen.getByRole("button")).toHaveTextContent("3 sélectionné(s)");
  });
});
