import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutocompleteField } from "./AutocompleteField";

afterEach(cleanup);

describe("AutocompleteField salary variants", () => {
  it("keeps choices with the same label when their salary sublabels differ", () => {
    const onSelect = vi.fn();
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        onSelect={onSelect}
        items={[
          { id: "doctor_45000", label: "Médecin", sublabel: "45 000 HTG" },
          { id: "doctor_60000", label: "Médecin", sublabel: "60 000 HTG" },
        ]}
      />
    );

    fireEvent.focus(screen.getByRole("textbox"));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("45 000 HTG");
    expect(options[1]).toHaveTextContent("60 000 HTG");

    fireEvent.mouseDown(options[1]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doctor_60000" })
    );
  });

  it("does not hide the other salaries when one variant is featured", () => {
    const featured = { id: "doctor_45000", label: "Médecin", sublabel: "45 000 HTG" };
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        featuredItem={featured}
        items={[
          featured,
          { id: "doctor_60000", label: "Médecin", sublabel: "60 000 HTG" },
        ]}
      />
    );

    fireEvent.focus(screen.getByRole("textbox"));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent("45 000 HTG");
    expect(options[1]).toHaveTextContent("60 000 HTG");
  });
});
