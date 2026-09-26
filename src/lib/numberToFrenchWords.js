var UNITS = [
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
var TENS = [
    "",
    "dix",
    "vingt",
    "trente",
    "quarante",
    "cinquante",
    "soixante"
];
function underHundred(n) {
    if (n < 20)
        return UNITS[n];
    if (n < 70) {
        var ten = Math.floor(n / 10);
        var unit = n % 10;
        if (unit === 0)
            return TENS[ten];
        if (unit === 1)
            return "".concat(TENS[ten], " et un");
        return "".concat(TENS[ten], "-").concat(UNITS[unit]);
    }
    if (n < 80) {
        // 70-79: soixante + 10-19
        return "soixante-".concat(underHundred(n - 60)).replace("soixante-onze", "soixante et onze");
    }
    // 80-99: quatre-vingt + 0-19
    var base = "quatre-vingt";
    if (n === 80)
        return "".concat(base, "s");
    if (n === 81)
        return "".concat(base, "-un");
    return "".concat(base, "-").concat(underHundred(n - 80));
}
function underThousand(n) {
    if (n < 100)
        return underHundred(n);
    var hundreds = Math.floor(n / 100);
    var rest = n % 100;
    if (hundreds === 1) {
        return rest === 0 ? "cent" : "cent ".concat(underHundred(rest));
    }
    var plural = rest === 0 ? "s" : "";
    return rest === 0
        ? "".concat(UNITS[hundreds], " cents")
        : "".concat(UNITS[hundreds], " cent").concat(plural, " ").concat(underHundred(rest));
}
function underMillion(n) {
    if (n < 1000)
        return underThousand(n);
    var thousands = Math.floor(n / 1000);
    var rest = n % 1000;
    var thousandWord = thousands === 1 ? "mille" : "".concat(underThousand(thousands).replace(/(vingt|cent)s$/, "$1"), " mille");
    if (rest === 0)
        return thousandWord;
    return "".concat(thousandWord, " ").concat(underThousand(rest));
}
function underBillion(n) {
    if (n < 1000000)
        return underMillion(n);
    var millions = Math.floor(n / 1000000);
    var rest = n % 1000000;
    var millionWord = millions === 1 ? "un million" : "".concat(underThousand(millions), " millions");
    if (rest === 0)
        return millionWord;
    return "".concat(millionWord, " ").concat(underMillion(rest));
}
function underTrillion(n) {
    if (n < 1000000000)
        return underBillion(n);
    var billions = Math.floor(n / 1000000000);
    var rest = n % 1000000000;
    var billionWord = billions === 1 ? "un milliard" : "".concat(underThousand(billions), " milliards");
    if (rest === 0)
        return billionWord;
    return "".concat(billionWord, " ").concat(underBillion(rest));
}
export function numberToFrenchWords(value) {
    if (!Number.isFinite(value))
        return "";
    var rounded = Math.round(Math.abs(value) * 100) / 100;
    var integerPart = Math.floor(rounded);
    var centPart = Math.round((rounded - integerPart) * 100);
    var integerWords = underTrillion(Math.abs(integerPart));
    var sign = value < 0 && rounded > 0 ? "moins " : "";
    var result = "".concat(sign).concat(integerWords).trim();
    if (centPart > 0) {
        var centWords = underHundred(centPart);
        result = "".concat(result, " et ").concat(centWords, " centime").concat(centPart > 1 ? "s" : "");
    }
    return result.toUpperCase().replace(/-/g, " ");
}
