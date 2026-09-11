import { describe, expect, it, vi } from "vitest";
import {
  formatNifInput,
  formatNifInputElement,
  prepareNifDigitOverwrite
} from "./nifInput";

describe("NIF input formatting", () => {
  it("formats at most ten digits", () => {
    expect(formatNifInput("1234567890")).toBe("123-456-789-0");
    expect(formatNifInput("123-456-789-09")).toBe("123-456-789-0");
  });

  it("keeps the caret beside the digit edited in the middle", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.value = "123-496-789-0";
    input.focus();
    input.setSelectionRange(6, 6);

    expect(formatNifInputElement(input)).toBe("123-496-789-0");
    expect(input.selectionStart).toBe(6);
  });

  it("selects the targeted digit for overwrite when the NIF is complete", () => {
    const input = document.createElement("input");
    input.value = "123-456-789-0";
    input.setSelectionRange(5, 5);

    prepareNifDigitOverwrite(input, "9");

    expect(input.selectionStart).toBe(5);
    expect(input.selectionEnd).toBe(6);
  });
});
