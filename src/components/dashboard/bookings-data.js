/**
 * Historical monthly revenue from HubSpot won deals export (2026-04-14).
 * Close date basis. All event types (W/C/P).
 *
 * To update: re-export won deals from HubSpot, run the extraction script,
 * or replace with Xero API integration (Phase 4).
 */

export const REVENUE_BY_YEAR = {
  2023: [49873, 63000, 72796, 46200, 47937, 49087, 22960, 45994, 54000, 87900, 61337, 23000],
  2024: [88000, 52000, 67648, 24000, 40500, 70000, 71000, 55500, 57500, 67250, 33000, 22000],
  2025: [96500, 28000, 39500, 45000, 17500, 17072, 25500, 39850, 42650, 85350, 63550, 32000],
  2026: [103300, 38800, 80375, 38550, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const YEAR_TOTALS = {
  2023: 624084,
  2024: 648398,
  2025: 532472,
  2026: 261025,
};

/** 2026 data complete through this month (1-indexed). Months after this are future. */
export const CURRENT_DATA_MONTH = 4;

/** Year colours for the chart lines */
export const YEAR_COLORS = {
  2023: "rgba(44,24,16,0.2)",   // faded - oldest
  2024: "#BF7256",              // Dusty Coral
  2025: "#8C472E",              // Fired Brick
  2026: "#2C1810",              // Brewery Dark - current year, boldest
};

export const YEAR_STYLES = {
  2023: { width: 1.5, dash: "6 3" },   // thin dashed
  2024: { width: 1.5, dash: "4 2" },   // thin dashed
  2025: { width: 2, dash: "" },         // solid
  2026: { width: 2.5, dash: "" },       // bold solid - current
};
