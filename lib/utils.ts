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

import { differenceInDays, parseISO, startOfDay } from "date-fns";

/**
 * Calculates the number of inclusive rental days between two dates.
 *
 * Rent It heavy equipment rental semantics are strictly daily-inclusive:
 * - Oct 10 to Oct 10 = 1 rental day (the machine is deployed/held for that full day)
 * - Oct 10 to Oct 11 = 2 rental days
 * - Oct 10 to Oct 12 = 3 rental days
 * - Oct 10 to Oct 13 = 4 rental days
 *
 * Formula:
 *   differenceInDays(startOfDay(endDate), startOfDay(startDate)) + 1
 *
 * @param startDate - Date instance or YYYY-MM-DD date string
 * @param endDate   - Date instance or YYYY-MM-DD date string
 * @returns Number of inclusive rental days (minimum 1, or 0 if invalid / endDate < startDate)
 */
export function calculateInclusiveRentalDays(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined
): number {
  if (!startDate || !endDate) return 0;

  const start = typeof startDate === "string" ? parseISO(startDate) : startDate;
  const end = typeof endDate === "string" ? parseISO(endDate) : endDate;

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 0;
  }

  const normalizedStart = startOfDay(start);
  const normalizedEnd = startOfDay(end);

  if (normalizedEnd < normalizedStart) {
    return 0;
  }

  return differenceInDays(normalizedEnd, normalizedStart) + 1;
}

/**
 * Calculates the total rental price given daily rate and dates.
 *
 * @param pricePerDay - Daily rate in PHP
 * @param startDate   - Date instance or YYYY-MM-DD date string
 * @param endDate     - Date instance or YYYY-MM-DD date string
 * @returns Total price rounded to 2 decimal places
 */
export function calculateRentalTotalPrice(
  pricePerDay: number,
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined
): number {
  const days = calculateInclusiveRentalDays(startDate, endDate);
  const rate = typeof pricePerDay === "number" && !isNaN(pricePerDay) ? pricePerDay : 0;
  return Number((days * rate).toFixed(2));
}
