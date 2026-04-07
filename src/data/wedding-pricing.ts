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
 * For a given year + season + dayType, return the cheapest single
 * row (hire + min spend coming from the same month). This is what
 * we display in the season summary table on /weddings/ - both the
 * total and the breakdown.
 */
export function getLowestBreakdown(
  year: number,
  seasonId: Season["id"],
  dayType: DayType
): { total: number; hire: number; min: number } {
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
  const lowest = matches.reduce((a, b) =>
    a.hire + a.min <= b.hire + b.min ? a : b
  );
  return { total: lowest.hire + lowest.min, hire: lowest.hire, min: lowest.min };
}

/** Convenience wrapper if a caller only needs the total. */
export function getLowestTotal(
  year: number,
  seasonId: Season["id"],
  dayType: DayType
): number {
  return getLowestBreakdown(year, seasonId, dayType).total;
}

/**
 * The "From £X" hook at the top of Section 7. Returns the cheapest
 * single (month, day-type) combo for the year - hire + min spend
 * coming from the same row, not synthetic mins.
 *
 * Context label is chosen to be the most compelling true framing of
 * the lowest price. The strongest story is "any day of the week" - so
 * we look for the largest contiguous month range where ALL THREE
 * standard day types (Sat, Fri, Sun-Thu) tie at the lowest total. If
 * one exists, the label uses that window. Otherwise we fall back to
 * describing the cheapest Saturday combo, since Saturday is the
 * day couples most want to know about.
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
  const lowestTotal = lowest.hire + lowest.min;

  // Find every month where all three standard day types hit the lowest
  // total. That's the "any day of the week" window.
  const allDayTypeMonths: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthRows = standardRows.filter((r) => r.month === m);
    if (
      monthRows.length === 3 &&
      monthRows.every((r) => r.hire + r.min === lowestTotal)
    ) {
      allDayTypeMonths.push(m);
    }
  }

  let context: string;
  if (allDayTypeMonths.length > 0) {
    context = `${describeMonthRange(allDayTypeMonths)} weddings, any day of the week`;
  } else {
    // Fall back: describe the cheapest Saturday window.
    const satRows = standardRows.filter((r) => r.dayType === "sat");
    const lowestSat = satRows.reduce((a, b) =>
      a.hire + a.min <= b.hire + b.min ? a : b
    );
    const lowestSatTotal = lowestSat.hire + lowestSat.min;
    const satMonths = satRows
      .filter((r) => r.hire + r.min === lowestSatTotal)
      .map((r) => r.month);
    context = `${describeMonthRange(satMonths)} Saturdays`;
  }

  return {
    total: lowestTotal,
    hire: lowest.hire,
    min: lowest.min,
    context,
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
    if (sorted[0] >= 1 && sorted[sorted.length - 1] <= 3) return "Off-peak";
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
