import { describe, it, expect } from "vitest";
import { numberToFrenchWords } from "./numberToFrenchWords";

describe("numberToFrenchWords", () => {
  it("converts basic numbers", () => {
    expect(numberToFrenchWords(0)).toBe("zéro");
    expect(numberToFrenchWords(21)).toBe("vingt et un");
    expect(numberToFrenchWords(71)).toBe("soixante et onze");
  });

  it("converts thousands and millions", () => {
    expect(numberToFrenchWords(1000)).toBe("mille");
    expect(numberToFrenchWords(45000)).toBe("quarante-cinq mille");
    expect(numberToFrenchWords(2000000)).toBe("deux millions");
  });

  it("handles cents", () => {
    expect(numberToFrenchWords(123.45)).toBe(
      "cent vingt-trois et quarante-cinq centimes"
    );
  });
});
