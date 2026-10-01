export { cn } from "cn";

export const DEFAULT_CURRENCY = "PHP";
export const DEFAULT_CURRENCY_SYMBOL = "₱";

/**
 * Formats a numeric price or rental rate to Philippine Peso (PHP ₱)
 * in the standard ₱1,000.00 format.
 *
 * @param amount - The numeric price/rate to format.
 * @returns Formatted currency string, e.g. "₱1,250.00"
 */
export function formatCurrency(amount: number | null | undefined): string {
  const value = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
