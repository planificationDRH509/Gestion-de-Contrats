const NIF_DIGIT_LIMIT = 10;

export function formatNifInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, NIF_DIGIT_LIMIT);

  return [
    digits.slice(0, 3),
    digits.slice(3, 6),
    digits.slice(6, 9),
    digits.slice(9, 10)
  ].filter(Boolean).join("-");
}

function caretAfterDigitCount(value: string, digitCount: number): number {
  if (digitCount <= 0) return 0;

  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) {
      seen += 1;
      if (seen === digitCount) return index + 1;
    }
  }

  return value.length;
}

/** Keep mid-value edits stable when separators are rewritten. */
export function formatNifInputElement(input: HTMLInputElement): string {
  const rawValue = input.value;
  const rawCaret = input.selectionStart ?? rawValue.length;
  const digitsBeforeCaret = rawValue.slice(0, rawCaret).replace(/\D/g, "").length;
  const formatted = formatNifInput(rawValue);
  const nextCaret = caretAfterDigitCount(formatted, digitsBeforeCaret);

  input.value = formatted;

  const restoreCaret = () => {
    if (document.activeElement === input) input.setSelectionRange(nextCaret, nextCaret);
  };

  restoreCaret();
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(restoreCaret);
  } else {
    window.setTimeout(restoreCaret, 0);
  }

  return formatted;
}

/** Replace the targeted digit when typing into an already complete NIF. */
export function prepareNifDigitOverwrite(
  input: HTMLInputElement,
  insertedText: string | null
): void {
  if (!insertedText || !/^\d$/.test(insertedText)) return;
  if (input.value.replace(/\D/g, "").length < NIF_DIGIT_LIMIT) return;

  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start === null || end === null || start !== end) return;

  for (let index = start; index < input.value.length; index += 1) {
    if (/\d/.test(input.value[index])) {
      input.setSelectionRange(index, index + 1);
      return;
    }
  }
}
