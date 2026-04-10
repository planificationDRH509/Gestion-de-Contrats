const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf"
];

const TENS = [
  "",
  "dix",
  "vingt",
  "trente",
  "quarante",
  "cinquante",
  "soixante"
];

function underHundred(n: number): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    if (unit === 0) return TENS[ten];
    if (unit === 1) return `${TENS[ten]} et un`;
    return `${TENS[ten]}-${UNITS[unit]}`;
  }
  if (n < 80) {
    // 70-79: soixante + 10-19
    return `soixante-${underHundred(n - 60)}`.replace("soixante-onze", "soixante et onze");
  }
  // 80-99: quatre-vingt + 0-19
  const base = "quatre-vingt";
  if (n === 80) return `${base}s`;
  if (n === 81) return `${base}-un`;
  return `${base}-${underHundred(n - 80)}`;
}

function underThousand(n: number): string {
  if (n < 100) return underHundred(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 1) {
    return rest === 0 ? "cent" : `cent ${underHundred(rest)}`;
  }
  const plural = rest === 0 ? "s" : "";
  return rest === 0
    ? `${UNITS[hundreds]} cents`
    : `${UNITS[hundreds]} cent${plural} ${underHundred(rest)}`;
}

function underMillion(n: number): string {
  if (n < 1000) return underThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousandWord = thousands === 1 ? "mille" : `${underThousand(thousands)} mille`;
  if (rest === 0) return thousandWord;
  return `${thousandWord} ${underThousand(rest)}`;
}

function underBillion(n: number): string {
  if (n < 1_000_000) return underMillion(n);
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const millionWord = millions === 1 ? "un million" : `${underThousand(millions)} millions`;
  if (rest === 0) return millionWord;
  return `${millionWord} ${underMillion(rest)}`;
}

function underTrillion(n: number): string {
  if (n < 1_000_000_000) return underBillion(n);
  const billions = Math.floor(n / 1_000_000_000);
  const rest = n % 1_000_000_000;
  const billionWord = billions === 1 ? "un milliard" : `${underThousand(billions)} milliards`;
  if (rest === 0) return billionWord;
  return `${billionWord} ${underBillion(rest)}`;
}

export function numberToFrenchWords(value: number): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  const integerPart = Math.floor(rounded);
  const centPart = Math.round((rounded - integerPart) * 100);

  const integerWords = underTrillion(Math.abs(integerPart));
  const sign = integerPart < 0 ? "moins " : "";
  let result = `${sign}${integerWords}`.trim();

  if (centPart > 0) {
    const centWords = underHundred(centPart);
    result = `${result} et ${centWords} centime${centPart > 1 ? "s" : ""}`;
  }

  return result;
}
