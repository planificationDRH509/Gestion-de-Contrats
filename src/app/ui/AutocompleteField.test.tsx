import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutocompleteField } from "./AutocompleteField";

afterEach(cleanup);

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

  it("keeps bare and Alt-modified digits for input and selects suggestions with Ctrl+digit", () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <AutocompleteField
        value=""
        onChange={onChange}
        onSelect={onSelect}
        items={[
          { id: "first", label: "Première suggestion" },
          { id: "second", label: "Deuxième suggestion" }
        ]}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: "2", code: "Digit2" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "2" } });
    expect(onChange).toHaveBeenCalledWith("2");

    fireEvent.keyDown(input, { key: "2", code: "Digit2", altKey: true });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "2", code: "Digit2", ctrlKey: true });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "second" })
    );
    expect(onChange).toHaveBeenCalledWith("Deuxième suggestion");
  });

  it("shows the Ctrl modifier in numeric shortcut hints", () => {
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        items={[{ id: "first", label: "Première suggestion" }]}
      />
    );

    fireEvent.focus(screen.getByRole("textbox"));

    expect(screen.getByText("Ctrl+1")).toBeInTheDocument();
  });
});
