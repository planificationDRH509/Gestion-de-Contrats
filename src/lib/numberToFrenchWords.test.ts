import { describe, it, expect } from "vitest";
import { numberToFrenchWords } from "./numberToFrenchWords";

describe("numberToFrenchWords", () => {
  it("converts basic numbers", () => {
    expect(numberToFrenchWords(0)).toBe("ZÉRO");
    expect(numberToFrenchWords(21)).toBe("VINGT ET UN");
    expect(numberToFrenchWords(71)).toBe("SOIXANTE ET ONZE");
  });

  it("converts thousands and millions", () => {
    expect(numberToFrenchWords(1000)).toBe("MILLE");
    expect(numberToFrenchWords(45000)).toBe("QUARANTE CINQ MILLE");
    expect(numberToFrenchWords(2000000)).toBe("DEUX MILLIONS");
  });

  it("handles cents", () => {
    expect(numberToFrenchWords(123.45)).toBe(
      "CENT VINGT TROIS ET QUARANTE CINQ CENTIMES"
    );
  });
});
