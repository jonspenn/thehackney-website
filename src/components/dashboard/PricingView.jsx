/**
 * PricingView - Wedding rate card side-by-side view for James's sign-off.
 *
 * Renders wedding-pricing.json as a 2025 / 2026 / 2027 / 2028 (DRAFT) table
 * with year-over-year tint cues (green = up, brick = down). Includes anomaly
 * callouts, status banner, and a Print / Save PDF button that uses the
 * browser's native print dialog.
 *
 * Source of truth is src/data/wedding-pricing.json - this view is read-only.
 * Edits happen in the JSON file, get pushed, and the view rebuilds.
 *
 * This lives as a tab inside AdminDashboard.jsx (NOT a sibling Astro page).
 * See website/LEARNINGS.md - "Dashboard features are tabs, never sibling pages"
 * for why.
 */

const DAY_TYPE_ORDER = {
  "sun-thu": 1,
  fri: 2,
  sat: 3,
  "dec-wed-fri": 4,
  "dec-mon-tue": 5,
};

const DAY_TYPE_LABELS = {
  "sun-thu": "Sun-Thu",
  fri: "Friday",
  sat: "Saturday",
  "dec-wed-fri": "Dec Wed-Fri",
  "dec-mon-tue": "Dec Mon-Tue",
};

const MONTH_LABELS = [
  "",
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* Anomaly callouts pulled from 2028-pricing-extrapolation-2026-04.md */
const ANOMALIES = [
  {
    title: "Jan-Mar 2028 hire fee jump",
    body: "2025 and 2026 held flat at \u00a31,000. 2027 jumped to \u00a31,300. Extrapolation takes 2028 to \u00a31,750 (applies the 2026-to-2027 +30% ratio to 2027). If winter should stay cheaper to keep off-season volume, drop 2028 back to \u00a31,500 or hold at \u00a31,300.",
  },
  {
    title: "Jun-Sep 2028 Saturday hire fees",
    body: "Model raises Jun-Sep Saturday hire by \u00a3500 (rounded from the 2026-to-2027 +14% trend). If a softer increase is preferred, \u00a33,500 is the next clean step down.",
  },
  {
    title: "Odd numbers in existing 2026 / 2027 brochure (NOT in rate card above)",
    body: "\"8 Hour Unlimited Drinks + Crement\" is listed at \u00a3703 (2026) and \u00a3704 (2027) in the brochure - almost certainly \u00a3103 / \u00a3104 typos. Also: 2026 December Wed-Fri minimum spend (\u00a35,000) is higher than December Saturday (\u00a33,000) - intentional, or a row that got missed on update?",
  },
];

const YEARS = ["2025", "2026", "2027", "2028"];

function fmt(n) {
  if (n == null) return "-";
  return "\u00a3" + n.toLocaleString("en-GB");
}

export default function PricingView({ pricing }) {
  if (!pricing || !pricing.rateCards) {
    return (
      <section className="rep-section">
        <h2 className="rep-h2">Pricing review</h2>
        <p className="rep-empty-small">
          Pricing data not available. The dashboard page should pass the
          <code>wedding-pricing.json</code> contents as a prop to
          <code>&lt;AdminDashboard /&gt;</code>.
        </p>
      </section>
    );
  }

  /* year -> (month-dayType -> row) maps for lookup */
  const yearMaps = {};
  for (const y of YEARS) {
    yearMaps[y] = {};
    const card = pricing.rateCards[y];
    if (!card) continue;
    for (const r of card.rows) {
      yearMaps[y][`${r.month}-${r.dayType}`] = r;
    }
  }

  /* Unique (month, dayType) combos across all years, sorted chronologically */
  const keySet = new Set();
  for (const y of YEARS) {
    const card = pricing.rateCards[y];
    if (!card) continue;
    for (const r of card.rows) keySet.add(`${r.month}-${r.dayType}`);
  }
  const rows = [...keySet]
    .map((k) => {
      const firstDash = k.indexOf("-");
      return {
        key: k,
        month: parseInt(k.slice(0, firstDash), 10),
        dayType: k.slice(firstDash + 1),
      };
    })
    .sort((a, b) =>
      a.month !== b.month
        ? a.month - b.month
        : (DAY_TYPE_ORDER[a.dayType] || 99) - (DAY_TYPE_ORDER[b.dayType] || 99),
    );

  function deltaClass(yearCurrent, yearPrior, key) {
    const cur = yearMaps[yearCurrent]?.[key];
    const prior = yearMaps[yearPrior]?.[key];
    if (!cur || !prior) return "";
    if (cur.hire > prior.hire || cur.min > prior.min) return "cell-up";
    if (cur.hire < prior.hire || cur.min < prior.min) return "cell-down";
    return "cell-flat";
  }

  function deltaString(yearCurrent, yearPrior, key) {
    const cur = yearMaps[yearCurrent]?.[key];
    const prior = yearMaps[yearPrior]?.[key];
    if (!cur || !prior) return "";
    const hireDelta = cur.hire - prior.hire;
    const minDelta = cur.min - prior.min;
    if (hireDelta === 0 && minDelta === 0) return "flat";
    const parts = [];
    if (hireDelta !== 0) {
      parts.push(
        `hire ${hireDelta > 0 ? "+" : ""}\u00a3${hireDelta.toLocaleString("en-GB")}`,
      );
    }
    if (minDelta !== 0) {
      parts.push(
        `min ${minDelta > 0 ? "+" : ""}\u00a3${minDelta.toLocaleString("en-GB")}`,
      );
    }
    return parts.join(", ");
  }

  return (
    <section className="pr-view">
      {/* Header row: title + lede on the left, Print button on the right */}
      <div className="pr-view-head">
        <div>
          <h2 className="rep-h2" style={{ marginBottom: "6px" }}>Pricing review</h2>
          <p className="rep-sub" style={{ marginTop: 0, maxWidth: "640px" }}>
            Side-by-side view of every row in the wedding rate card, pulled
            directly from the site's pricing data. Green tint = price rose
            year-over-year, brick tint = price fell, no tint = flat. 2028 is
            draft and pending James's sign-off.
          </p>
        </div>
        <button
          className="rep-refresh pr-print-btn"
          onClick={() => window.print()}
          type="button"
          aria-label="Print or save as PDF"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Meta strip */}
      <div className="pr-meta">
        <div className="pr-meta-card">
          <div className="pr-meta-label">Last updated</div>
          <div className="pr-meta-value">{pricing.lastUpdated}</div>
        </div>
        <div className="pr-meta-card">
          <div className="pr-meta-label">Currency</div>
          <div className="pr-meta-value">{pricing.currency} (VAT {pricing.vat})</div>
        </div>
        <div className="pr-meta-card">
          <div className="pr-meta-label">Cell format</div>
          <div className="pr-meta-value">Hire fee / Min spend</div>
        </div>
        <div className="pr-meta-card">
          <div className="pr-meta-label">Source</div>
          <div className="pr-meta-value"><code>wedding-pricing.json</code></div>
        </div>
      </div>

      {/* Status banner */}
      <div className="pr-status-banner">
        <strong>2028 is DRAFT.</strong> Extrapolated from the 2026 &rarr; 2027
        trend per row (hire rounded to nearest &pound;250, min spend to
        nearest &pound;500). Pending James's sign-off before publication.
        2028 is currently only visible in the brochure capture form's
        wedding-year dropdown - no prices are shown publicly yet.
      </div>

      {/* Anomaly callouts */}
      <div className="pr-callouts">
        {ANOMALIES.map((a) => (
          <div className="pr-callout" key={a.title}>
            <h3>{a.title}</h3>
            <p>{a.body}</p>
          </div>
        ))}
      </div>

      {/* Table section head */}
      <div className="pr-section-head">
        <h3 className="pr-h3">Rate card 2025 - 2028</h3>
      </div>

      {/* Legend */}
      <div className="pr-legend">
        <span className="pr-legend-item">
          <span className="pr-legend-swatch" style={{ background: "rgba(46, 64, 9, 0.07)" }} />
          Price increased vs prior year
        </span>
        <span className="pr-legend-item">
          <span className="pr-legend-swatch" style={{ background: "rgba(140, 71, 46, 0.09)" }} />
          Price decreased vs prior year
        </span>
        <span className="pr-legend-item">
          <span
            className="pr-legend-swatch"
            style={{ borderColor: "rgba(140, 71, 46, 0.6)", background: "rgba(140, 71, 46, 0.06)" }}
          />
          2028 draft column
        </span>
      </div>

      {/* Table */}
      <div className="pr-table-wrap">
        <table className="pr-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Day type</th>
              <th>2025</th>
              <th>2026</th>
              <th>2027</th>
              <th className="draft">2028 DRAFT</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const isFirstOfMonth = idx === 0 || rows[idx - 1].month !== row.month;
              const r25 = yearMaps["2025"][row.key];
              const r26 = yearMaps["2026"][row.key];
              const r27 = yearMaps["2027"][row.key];
              const r28 = yearMaps["2028"][row.key];
              const d26 = deltaClass("2026", "2025", row.key);
              const d27 = deltaClass("2027", "2026", row.key);
              const d28 = deltaClass("2028", "2027", row.key);
              const delta26 = deltaString("2026", "2025", row.key);
              const delta27 = deltaString("2027", "2026", row.key);
              const delta28 = deltaString("2028", "2027", row.key);
              return (
                <tr key={row.key} className={isFirstOfMonth ? "month-first" : ""}>
                  <td className="col-month">{isFirstOfMonth ? MONTH_LABELS[row.month] : ""}</td>
                  <td className="col-daytype">{DAY_TYPE_LABELS[row.dayType] || row.dayType}</td>
                  <td className="price">{r25 ? `${fmt(r25.hire)} / ${fmt(r25.min)}` : "-"}</td>
                  <td className={`price ${d26}`}>
                    {r26 ? `${fmt(r26.hire)} / ${fmt(r26.min)}` : "-"}
                    {r26 && delta26 && delta26 !== "flat" && (
                      <span className="price-delta">{delta26}</span>
                    )}
                  </td>
                  <td className={`price ${d27}`}>
                    {r27 ? `${fmt(r27.hire)} / ${fmt(r27.min)}` : "-"}
                    {r27 && delta27 && delta27 !== "flat" && (
                      <span className="price-delta">{delta27}</span>
                    )}
                  </td>
                  <td className={`price draft-col ${d28}`}>
                    {r28 ? `${fmt(r28.hire)} / ${fmt(r28.min)}` : "-"}
                    {r28 && delta28 && delta28 !== "flat" && (
                      <span className="price-delta">{delta28}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="pr-footer">
        <p>
          <strong>How to use this tab:</strong> review each row of the 2028
          column against 2027. Where the draft doesn't feel right, note the
          month, day type, and the correction. Jon will update
          {" "}<code>wedding-pricing.json</code> and push - the dashboard and
          the calendar + quiz + brochure flow pick up the new numbers on the
          next deploy.
        </p>
        <p>
          <strong>Full extrapolation rationale and per-row change log:</strong>{" "}
          see{" "}
          <code>
            sales &amp; marketing/collateral/2025/wedding/2028-pricing-extrapolation-2026-04.md
          </code>{" "}
          in the Hackney Drive folder.
        </p>
      </div>
    </section>
  );
}
