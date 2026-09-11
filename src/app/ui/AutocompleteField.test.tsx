import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutocompleteField } from "./AutocompleteField";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

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

  it("keeps bare and Ctrl-modified digits for input and selects suggestions with Alt+digit", () => {
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

    fireEvent.keyDown(input, { key: "2", code: "Digit2", ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "2", code: "Digit2", altKey: true });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "second" })
    );
    expect(onChange).toHaveBeenCalledWith("Deuxième suggestion");
  });

  it("shows the Alt modifier in numeric shortcut hints", () => {
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        items={[{ id: "first", label: "Première suggestion" }]}
      />
    );

    fireEvent.focus(screen.getByRole("textbox"));

    expect(screen.getByText("Alt+1")).toBeInTheDocument();
  });

  it("maps the last choice to Alt+1 and the tenth choice to Alt+0", () => {
    const onSelect = vi.fn();
    const featuredItem = { id: "last", label: "Dernier choix" };
    const otherItems = Array.from({ length: 9 }, (_, index) => ({
      id: `choice-${index + 2}`,
      label: `Choix ${index + 2}`,
    }));
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        onSelect={onSelect}
        featuredItem={featuredItem}
        items={otherItems}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Alt+1");
    expect(screen.getAllByRole("option")[9]).toHaveTextContent("Alt+0");

    fireEvent.keyDown(input, { key: "1", code: "Digit1", altKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "last" }));

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "0", code: "Digit0", altKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "choice-10" }));
  });

  it("ranks a probable contextual match before a recent choice", () => {
    localStorage.setItem("contribution_recent_assignment", JSON.stringify(["recent"]));
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        pinCategory="assignment"
        items={[
          { id: "recent", label: "Choix récent" },
          { id: "probable", label: "Choix probable", rankingBoost: 40 },
        ]}
      />
    );

    fireEvent.focus(screen.getByRole("textbox"));
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Choix probable");
    expect(options[1]).toHaveTextContent("Choix récent");
  });

  it("accepts the first suggestion with Enter and advances to the next field", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(
      <form>
        <AutocompleteField
          value=""
          onChange={vi.fn()}
          onSelect={onSelect}
          items={[
            { id: "probable", label: "Choix probable", rankingBoost: 40 },
            { id: "other", label: "Autre choix" },
          ]}
        />
        <input aria-label="Champ suivant" />
      </form>
    );

    const input = screen.getAllByRole("textbox")[0];
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "probable" }));
    vi.runAllTimers();
    expect(screen.getByLabelText("Champ suivant")).toHaveFocus();
  });

  it("navigates visible suggestions with ArrowUp and ArrowDown", () => {
    const onSelect = vi.fn();
    const parentKeys: string[] = [];
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        onSelect={onSelect}
        onKeyDown={(event) => parentKeys.push(event.key)}
        items={[
          { id: "first", label: "Première suggestion" },
          { id: "second", label: "Deuxième suggestion" },
          { id: "third", label: "Troisième suggestion" },
        ]}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowUp", code: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    expect(parentKeys).toEqual([]);

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "first" }));
  });

  it("returns arrow navigation to the parent after Escape", () => {
    const parentKeys: string[] = [];
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        onKeyDown={(event) => parentKeys.push(event.key)}
        items={[{ id: "first", label: "Première suggestion" }]}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    expect(screen.getByRole("option")).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
    expect(parentKeys).toEqual(["ArrowDown"]);
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("keeps field and row navigation when there are no suggestions", () => {
    const parentKeys: string[] = [];
    render(
      <AutocompleteField
        value=""
        onChange={vi.fn()}
        onKeyDown={(event) => parentKeys.push(event.key)}
        items={[]}
      />
    );

    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowUp", code: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(parentKeys).toEqual(["ArrowDown", "ArrowUp", "Enter"]);
  });

  it("advances from the last autocomplete column to the next spreadsheet row", () => {
    vi.useFakeTimers();
    render(
      <>
        <AutocompleteField
          dataSheetRow="row-1"
          dataSheetCol={6}
          value=""
          onChange={vi.fn()}
          items={[{ id: "first", label: "Première suggestion" }]}
        />
        <input data-sheet-row="row-2" data-sheet-col={0} aria-label="Ligne suivante" />
      </>
    );

    const input = screen.getAllByRole("textbox")[0];
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    vi.runAllTimers();

    expect(screen.getByLabelText("Ligne suivante")).toHaveFocus();
  });
});
