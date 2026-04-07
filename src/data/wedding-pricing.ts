/**
 * wedding-pricing.ts
 *
 * Thin helper around src/data/wedding-pricing.json. The JSON is the
 * single source of truth - this module just gives the rest of the site
 * (currently /weddings/ Section 7) typed access plus a couple of derived
 * views (lowest "from" by season + day-type, lowest overall combo).
 *
 * Designed so we can swap the JSON for a real database call later
 * without changing call sites - the same getSeasonFromPrices() and
 * getLowestCombo() shapes will come back.
 */
import data from "./wedding-pricing.json";

export type DayType =
  | "sun-thu"
  | "fri"
  | "sat"
  | "dec-wed-fri"
  | "dec-mon-tue";

export interface Row {
  month: number;
  dayType: DayType;
  hire: number;
  min: number;
}

export interface Season {
  id: "winter" | "spring" | "summer" | "autumn";
  label: string;
  period: string;
  months: number[];
}

export interface RateCard {
  extrapolated: boolean;
  extrapolationMethod?: string;
  pendingReview?: string;
  rows: Row[];
}

const cards = data.rateCards as Record<string, RateCard>;
const seasons = data.seasons as Season[];

/** Get a year's full rate card. */
export function getRateCard(year: number): RateCard {
  const card = cards[String(year)];
  if (!card) throw new Error(`No rate card for year ${year}`);
  return card;
}

/** All seasons with their month ranges. */
export function getSeasons(): Season[] {
  return seasons;
}

/** Format a number as a GBP "from" price. */
export function formatFrom(amount: number): string {
  return `From £${amount.toLocaleString("en-GB")}`;
}

/**
 * For a given year + season + dayType, return the lowest total
 * (venue hire + minimum spend) across the months in that season.
 * This is what we display in the season summary table on /weddings/.
 */
export function getLowestTotal(
  year: number,
  seasonId: Season["id"],
  dayType: DayType
): number {
  const card = getRateCard(year);
  const season = seasons.find((s) => s.id === seasonId);
  if (!season) throw new Error(`Unknown season ${seasonId}`);
  const matches = card.rows.filter(
    (r) => season.months.includes(r.month) && r.dayType === dayType
  );
  if (matches.length === 0) {
    throw new Error(
      `No rows for ${year} ${seasonId} ${dayType} - check wedding-pricing.json`
    );
  }
  return Math.min(...matches.map((r) => r.hire + r.min));
}

/**
 * The "From £X" hook at the top of Section 7. Returns the cheapest
 * single (month, day-type) combo for the year - hire + min spend
 * coming from the same row, not synthetic mins. Includes context so
 * we can describe it honestly ("Winter weddings, any day of the week").
 */
export function getLowestCombo(year: number): {
  total: number;
  hire: number;
  min: number;
  context: string;
} {
  const card = getRateCard(year);
  // Exclude December special day-types from the headline number - they
  // add noise and are explained separately in the brochure.
  const standardRows = card.rows.filter((r) =>
    ["sat", "fri", "sun-thu"].includes(r.dayType)
  );
  let lowest = standardRows[0];
  for (const row of standardRows) {
    if (row.hire + row.min < lowest.hire + lowest.min) lowest = row;
  }
  // Build a human-readable context label by collapsing all rows that
  // share the lowest total.
  const lowestTotal = lowest.hire + lowest.min;
  const matchingRows = standardRows.filter(
    (r) => r.hire + r.min === lowestTotal
  );
  const months = [...new Set(matchingRows.map((r) => r.month))].sort(
    (a, b) => a - b
  );
  const dayTypes = [...new Set(matchingRows.map((r) => r.dayType))];
  const monthLabel = describeMonthRange(months);
  const dayLabel =
    dayTypes.length === 3
      ? "any day of the week"
      : dayTypes.map(describeDayType).join(" or ");
  return {
    total: lowestTotal,
    hire: lowest.hire,
    min: lowest.min,
    context: `${monthLabel} weddings, ${dayLabel}`,
  };
}

function describeMonthRange(months: number[]): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (months.length === 1) return names[months[0] - 1];
  // Detect contiguous range and describe e.g. "Jan - Mar"
  const sorted = [...months].sort((a, b) => a - b);
  const isContiguous = sorted.every(
    (m, i) => i === 0 || m === sorted[i - 1] + 1
  );
  if (isContiguous) {
    if (sorted[0] >= 1 && sorted[sorted.length - 1] <= 3) return "Winter";
    return `${names[sorted[0] - 1]} - ${names[sorted[sorted.length - 1] - 1]}`;
  }
  return sorted.map((m) => names[m - 1]).join(", ");
}

function describeDayType(dayType: DayType): string {
  switch (dayType) {
    case "sat":
      return "Saturday";
    case "fri":
      return "Friday";
    case "sun-thu":
      return "Sunday to Thursday";
    case "dec-wed-fri":
      return "December Wed-Fri";
    case "dec-mon-tue":
      return "December Mon-Tue";
  }
}
