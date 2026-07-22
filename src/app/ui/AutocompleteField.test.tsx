import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutocompleteField } from "./AutocompleteField";

describe("AutocompleteField contextual ranking", () => {
  it("uses a contextual boost to order otherwise unfiltered suggestions", () => {
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        items={[
          { id: "other", label: "A", rankingBoost: 0 },
          { id: "nearby", label: "Centre de santé proche", rankingBoost: 40 }
        ]}
      />
    );

    fireEvent.focus(screen.getByRole("textbox"));

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Centre de santé proche");
    expect(options[1]).toHaveTextContent("A");
  });
});
