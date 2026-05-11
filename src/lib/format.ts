export function parseMoney(input: string): number {
  const normalized = input.replace(/[\s,]/g, "");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatLastName(name: string): string {
  return name.trim().toUpperCase();
}

export function formatFirstName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|\s|-)\S/g, (c) => c.toUpperCase());
}
