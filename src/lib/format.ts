export function parseMoney(input: string): number {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function formatCurrency(value: number) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "HTG",
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }
}
