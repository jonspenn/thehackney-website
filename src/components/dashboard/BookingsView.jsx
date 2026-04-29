/**
 * BookingsView - Monthly revenue closed, year-over-year comparison.
 * Data sourced from HubSpot won deals export (bookings-data.js + bookings-deals.js).
 * Interactive legend: click a year to toggle it on/off.
 * Click any revenue figure to drill into the deals behind it.
 */

import { useState, useMemo } from "react";
import {
  REVENUE_BY_YEAR, YEAR_TOTALS, CURRENT_DATA_MONTH,
  YEAR_COLORS, YEAR_STYLES,
} from "./bookings-data.js";
import { DEALS_BY_MONTH } from "./bookings-deals.js";
import { MetadataStrip, MetadataCell } from "./primitives/index.js";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = Object.keys(REVENUE_BY_YEAR).map(Number).sort();
const CURRENT_YEAR = YEARS[YEARS.length - 1];

function formatRevenue(val) {
  if (val >= 1000) return `£${Math.round(val / 1000)}k`;
  return `£${val}`;
}

/* Strip-cell short form: same as formatRevenue but always £k for >=1000.
   Returned to the metric strip for the YTD total + best-month sub-unit. */
function formatRevenueShort(val) {
  if (val == null) return "—";
  if (val >= 1000) return `£${Math.round(val / 1000)}k`;
  return `£${val}`;
}

function formatRevenueExact(val) {
  return `£${val.toLocaleString("en-GB")}`;
}

function formatEventDate(d) {
  if (!d) return "-";
  try {
    const [y, m, day] = d.split("-");
    return `${parseInt(day)} ${SHORT_MONTHS[parseInt(m) - 1]} ${y}`;
  } catch { return d; }
}

/* Catmull-Rom spline -> cubic Bezier path. Same helper as PipelineView's
   monthly trends chart so both charts smooth identically. tension=0.5 keeps
   peaks sharp for lumpy seasonal revenue data; tension=0.7 (Pipeline default)
   smooths slightly more. Wedding revenue is structurally lumpy month-to-month,
   so we under-smooth here to preserve the actual shape. */
function smoothPath(points, tension = 0.5) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || points[i + 1];
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export default function BookingsView() {
  const [hiddenYears, setHiddenYears] = useState(() => new Set(YEARS.filter(y => y !== CURRENT_YEAR)));
  const [hoveredMonth, setHoveredMonth] = useState(null);
  const [drillDown, setDrillDown] = useState(null); // { year, month } or null
  const [chartOpen, setChartOpen] = useState(true);

  /* Compute max value across visible years for Y-axis scaling */
  const maxVal = useMemo(() => {
    let max = 0;
    for (const year of YEARS) {
      if (hiddenYears.has(year)) continue;
      for (let m = 0; m < 12; m++) {
        if (year === CURRENT_YEAR && m >= CURRENT_DATA_MONTH) continue;
        const val = REVENUE_BY_YEAR[year][m];
        if (val > max) max = val;
      }
    }
    return max || 1;
  }, [hiddenYears]);

  /* YTD comparison */
  const ytdByYear = useMemo(() => {
    const result = {};
    for (const year of YEARS) {
      let total = 0;
      for (let m = 0; m < CURRENT_DATA_MONTH; m++) {
        total += REVENUE_BY_YEAR[year][m];
      }
      result[year] = total;
    }
    return result;
  }, []);

  /* Drill-down deals */
  const drillDeals = useMemo(() => {
    if (!drillDown) return null;
    const key = `${drillDown.year}-${drillDown.month + 1}`;
    return DEALS_BY_MONTH[key] || [];
  }, [drillDown]);

  /* Metric-strip cells (YTD total / vs Last year % / Best month YTD / Deals closed YTD) */
  const strip = useMemo(() => {
    const ytdTotal = ytdByYear[CURRENT_YEAR] || 0;
    const ytdPrev = ytdByYear[CURRENT_YEAR - 1];
    const yoyPct = ytdPrev ? Math.round(((ytdTotal - ytdPrev) / ytdPrev) * 100) : null;

    /* Best month YTD: highest month within the current year up to CURRENT_DATA_MONTH */
    let bestMonthIdx = -1;
    let bestMonthValue = 0;
    for (let m = 0; m < CURRENT_DATA_MONTH; m++) {
      const v = REVENUE_BY_YEAR[CURRENT_YEAR][m];
      if (v > bestMonthValue) {
        bestMonthValue = v;
        bestMonthIdx = m;
      }
    }
    const bestMonthLabel = bestMonthIdx >= 0 ? SHORT_MONTHS[bestMonthIdx] : "—";

    /* Deals closed YTD: count rows in DEALS_BY_MONTH for current year up to CURRENT_DATA_MONTH */
    let dealsCurrentYTD = 0;
    let dealsPriorYTD = 0;
    for (let m = 1; m <= CURRENT_DATA_MONTH; m++) {
      dealsCurrentYTD += (DEALS_BY_MONTH[`${CURRENT_YEAR}-${m}`] || []).length;
      dealsPriorYTD += (DEALS_BY_MONTH[`${CURRENT_YEAR - 1}-${m}`] || []).length;
    }

    return { ytdTotal, yoyPct, bestMonthLabel, bestMonthValue, dealsCurrentYTD, dealsPriorYTD };
  }, [ytdByYear]);

  function handleCellClick(year, monthIdx) {
    const val = REVENUE_BY_YEAR[year][monthIdx];
    if (val <= 0) return;
    if (drillDown && drillDown.year === year && drillDown.month === monthIdx) {
      setDrillDown(null); // toggle off
    } else {
      setDrillDown({ year, month: monthIdx });
    }
  }

  /* SVG dimensions */
  const W = 820, H = 240, PAD_T = 30, PAD_B = 32, PAD_L = 52, PAD_R = 16;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  /* Y-axis grid */
  const niceMax = Math.ceil(maxVal / 20000) * 20000;
  const gridStep = niceMax <= 60000 ? 20000 : niceMax <= 120000 ? 30000 : 50000;
  const gridLines = [];
  for (let v = 0; v <= niceMax; v += gridStep) {
    const y = PAD_T + plotH - (plotH * (v / niceMax));
    gridLines.push({ val: v, y });
  }

  const monthX = (i) => PAD_L + (plotW * (i / 11));
  const valY = (v) => PAD_T + plotH - (plotH * (v / niceMax));

  return (
    <div className="bookings-view">

      {/* ── Metric strip header ── */}
      <div className="pipe-meta-wrap">
        <MetadataStrip>
          <MetadataCell eyebrow="YTD total">
            <span className="pipe-metric">
              {formatRevenueShort(strip.ytdTotal)}
              <span className="pipe-metric__unit">by {SHORT_MONTHS[CURRENT_DATA_MONTH - 1]}</span>
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="vs last year">
            <span className="pipe-metric" style={{ color: strip.yoyPct == null ? undefined : (strip.yoyPct >= 0 ? "#2E4009" : "#8C472E") }}>
              {strip.yoyPct == null ? "—" : `${strip.yoyPct >= 0 ? "+" : ""}${strip.yoyPct}%`}
              <span className="pipe-metric__unit">vs {CURRENT_YEAR - 1} YTD</span>
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="Best month YTD">
            <span className="pipe-metric">
              {strip.bestMonthLabel}
              {strip.bestMonthValue > 0 && <span className="pipe-metric__unit">{formatRevenueShort(strip.bestMonthValue)}</span>}
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="Deals closed YTD">
            <span className="pipe-metric">
              {strip.dealsCurrentYTD}
              <span className="pipe-metric__unit">vs {strip.dealsPriorYTD} in {CURRENT_YEAR - 1}</span>
            </span>
          </MetadataCell>
        </MetadataStrip>
      </div>

      {/* ── Chart panel ── */}
      <div className="pipe-panel bookings-chart-panel">
        <button
          type="button"
          className="pipe-collapse-toggle"
          onClick={() => setChartOpen(o => !o)}
          aria-expanded={chartOpen}
          aria-controls="bookings-chart-body"
        >
          <span className={`pipe-collapse-toggle__arrow${chartOpen ? " pipe-collapse-toggle__arrow--open" : ""}`}>{"\u25B6"}</span>
          Monthly revenue booked
          {!chartOpen && <span className="pipe-collapse-toggle__summary">close date · click a year in the legend to toggle</span>}
        </button>
        {chartOpen && (
        <div className="bookings-chart-body" id="bookings-chart-body">

        {/* Interactive legend */}
        <div className="bookings-legend">
          {YEARS.map(year => (
            <button
              key={year}
              className="bookings-legend__item"
              style={{
                opacity: hiddenYears.has(year) ? 0.3 : 1,
                textDecoration: hiddenYears.has(year) ? "line-through" : "none",
              }}
              onClick={() => setHiddenYears(prev => {
                const next = new Set(prev);
                next.has(year) ? next.delete(year) : next.add(year);
                return next;
              })}
              title={hiddenYears.has(year) ? `Show ${year}` : `Hide ${year}`}
            >
              <svg width="20" height="10" style={{ marginRight: 4, verticalAlign: "middle" }}>
                <line
                  x1="0" y1="5" x2="20" y2="5"
                  stroke={hiddenYears.has(year) ? "rgba(44,24,16,0.15)" : YEAR_COLORS[year]}
                  strokeWidth={YEAR_STYLES[year].width}
                  strokeDasharray={YEAR_STYLES[year].dash}
                />
              </svg>
              {year}
            </button>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "auto", maxHeight: "280px", cursor: "pointer" }}
          onMouseLeave={() => setHoveredMonth(null)}
        >
          {/* Grid lines */}
          {gridLines.map(g => (
            <g key={g.val}>
              <line x1={PAD_L} y1={g.y} x2={W - PAD_R} y2={g.y} stroke="rgba(44,24,16,0.06)" strokeWidth="1" />
              <text x={PAD_L - 8} y={g.y + 3} textAnchor="end" fontSize="10" fill="rgba(44,24,16,0.4)">
                {formatRevenue(g.val)}
              </text>
            </g>
          ))}

          {/* Future month shading */}
          {CURRENT_DATA_MONTH < 12 && (
            <rect
              x={monthX(CURRENT_DATA_MONTH)}
              y={PAD_T}
              width={monthX(11) - monthX(CURRENT_DATA_MONTH) + 8}
              height={plotH}
              fill="rgba(44,24,16,0.02)"
              rx="2"
            />
          )}

          {/* Hover columns */}
          {SHORT_MONTHS.map((_, i) => {
            const colW = plotW / 12;
            return (
              <rect
                key={i}
                x={monthX(i) - colW / 2}
                y={PAD_T}
                width={colW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoveredMonth(i)}
              />
            );
          })}

          {/* Hover highlight line */}
          {hoveredMonth !== null && (
            <line
              x1={monthX(hoveredMonth)} y1={PAD_T}
              x2={monthX(hoveredMonth)} y2={PAD_T + plotH}
              stroke="rgba(44,24,16,0.08)" strokeWidth="1"
            />
          )}

          {/* Month labels */}
          {SHORT_MONTHS.map((label, i) => (
            <text
              key={i}
              x={monthX(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fontWeight={hoveredMonth === i ? "700" : "500"}
              fill={i >= CURRENT_DATA_MONTH ? "rgba(44,24,16,0.2)" : "rgba(44,24,16,0.5)"}
            >
              {label}
            </text>
          ))}

          {/* Year lines - smoothPath (Catmull-Rom Bezier, tension 0.5) for visual
              parity with PipelineView's monthly trends. Lines only on the path;
              hit-target circles per month for click + hover state; end-of-line
              dot per visible year so the latest data point is always anchored.
              Per-point value labels removed - hover crosshair + drill-in below
              carry that data without cluttering the chart. */}
          {YEARS.filter(y => !hiddenYears.has(y)).map(year => {
            const data = REVENUE_BY_YEAR[year];
            const endMonth = year === CURRENT_YEAR ? CURRENT_DATA_MONTH : 12;
            const points = [];
            for (let m = 0; m < endMonth; m++) {
              points.push({ x: monthX(m), y: valY(data[m]), val: data[m], month: m });
            }
            if (points.length === 0) return null;

            const pathD = smoothPath(points, 0.5);
            const lastPoint = points[points.length - 1];
            const isCurrent = year === CURRENT_YEAR;

            return (
              <g key={year}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={YEAR_COLORS[year]}
                  strokeWidth={YEAR_STYLES[year].width}
                  strokeDasharray={YEAR_STYLES[year].dash}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* End-of-line dot */}
                {lastPoint.val > 0 && (
                  <circle
                    cx={lastPoint.x} cy={lastPoint.y}
                    r={isCurrent ? 4.5 : 3.5}
                    fill={YEAR_COLORS[year]}
                    stroke="#F5F0E8"
                    strokeWidth={1.5}
                  />
                )}
                {/* Per-point hover/active dot + value label. Rendered only when
                    hovered or the drilled-in cell, so the chart stays clean by default
                    but surfaces the £k value the moment the user reads a month. Label
                    sits above the dot with a Warm Canvas stroke halo so it stays
                    legible over crossing year lines. */}
                {points.map((p) => {
                  const isHovered = hoveredMonth === p.month;
                  const isActive = drillDown && drillDown.year === year && drillDown.month === p.month;
                  if (!isHovered && !isActive) return null;
                  return (
                    <g key={p.month}>
                      <circle
                        cx={p.x} cy={p.y}
                        r={isActive ? 5 : 4}
                        fill={p.val > 0 ? YEAR_COLORS[year] : "transparent"}
                        stroke={isActive ? "#2E4009" : "#F5F0E8"}
                        strokeWidth={isActive ? 2.5 : 1.5}
                        style={{ cursor: p.val > 0 ? "pointer" : "default" }}
                        onClick={() => handleCellClick(year, p.month)}
                      />
                      {p.val > 0 && (
                        <text
                          x={p.x}
                          y={p.y - 11}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight="600"
                          fill={YEAR_COLORS[year]}
                          stroke="#F5F0E8"
                          strokeWidth="3"
                          paintOrder="stroke"
                          style={{ pointerEvents: "none" }}
                        >
                          {formatRevenue(p.val)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        </div>
        )}
      </div>

      {/* ── Drill-down panel ── */}
      {drillDown && drillDeals && (
        <div className="lp-card bookings-drill-card">
          <div className="bookings-drill-card__header">
            <div className="bookings-drill-card__title-wrap">
              <span className="lp-meta-cell__eyebrow">Drill-in · {FULL_MONTHS[drillDown.month]} {drillDown.year}</span>
              <h3 className="bookings-drill-card__title">
                {formatRevenueExact(REVENUE_BY_YEAR[drillDown.year][drillDown.month])}
                <span className="bookings-drill-card__sub">from {drillDeals.length} deal{drillDeals.length !== 1 ? "s" : ""}</span>
              </h3>
            </div>
            <button
              type="button"
              className="bookings-drill-card__close"
              onClick={() => setDrillDown(null)}
              title="Close drill-in"
              aria-label="Close drill-in"
            >×</button>
          </div>
          {drillDeals.length > 0 ? (
            <div className="rep-table-wrap bookings-drill-card__table-wrap">
              <table className="rep-table bookings-drill-card__table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Deal</th>
                    <th style={{ textAlign: "left" }}>Type</th>
                    <th style={{ textAlign: "left" }}>Event date</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDeals.map((deal, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: "left", fontWeight: 500 }}>{deal.n}</td>
                      <td style={{ textAlign: "left", color: "rgba(44,24,16,0.6)" }}>{deal.t}</td>
                      <td style={{ textAlign: "left", color: "rgba(44,24,16,0.6)" }}>{formatEventDate(deal.d)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatRevenueExact(deal.a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="bookings-drill-card__empty">No deal data available for this month.</p>
          )}
        </div>
      )}

      {/* ── Month detail table ── */}
      <div className="pipe-panel bookings-table-panel">
        <div className="pipe-collapse-toggle pipe-collapse-toggle--static">
          <span className="pipe-collapse-toggle__arrow pipe-collapse-toggle__arrow--open">{"\u25B6"}</span>
          Year-over-year by month
          <span className="pipe-collapse-toggle__summary">{"\u00A3"} closed per month, all event types</span>
        </div>
        <div className="rep-table-wrap">
          <table className="rep-table bookings-rep-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Month</th>
                {YEARS.map(y => <th key={y} style={{ textAlign: "right" }}>{y}</th>)}
                <th style={{ textAlign: "left" }}>Best</th>
              </tr>
            </thead>
            <tbody>
              {SHORT_MONTHS.map((label, i) => {
                const isFuture = i >= CURRENT_DATA_MONTH;
                const vals = YEARS.map(y => REVENUE_BY_YEAR[y][i]);
                const pastVals = vals.filter((v, idx) => YEARS[idx] !== CURRENT_YEAR || !isFuture);
                const bestVal = Math.max(...pastVals);

                return (
                  <tr
                    key={i}
                    style={{ opacity: isFuture ? 0.4 : 1 }}
                    onMouseEnter={() => setHoveredMonth(i)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className={hoveredMonth === i ? "bookings-rep-table__row--hover" : ""}
                  >
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    {YEARS.map((y) => {
                      const val = REVENUE_BY_YEAR[y][i];
                      const isBest = val === bestVal && val > 0 && (!isFuture || y !== CURRENT_YEAR);
                      const isActive = drillDown && drillDown.year === y && drillDown.month === i;
                      return (
                        <td
                          key={y}
                          className={val > 0 ? "bookings-rep-table__cell--clickable" : ""}
                          style={{
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            fontWeight: isBest ? 700 : 400,
                            color: isBest ? "#2E4009" : undefined,
                            background: isActive ? "rgba(46,64,9,0.08)" : undefined,
                            cursor: val > 0 ? "pointer" : "default",
                          }}
                          onClick={() => handleCellClick(y, i)}
                          title={val > 0 ? `Click to see ${FULL_MONTHS[i]} ${y} deals` : ""}
                        >
                          {val > 0 ? formatRevenueExact(val) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ fontSize: "12px", color: "rgba(44,24,16,0.5)" }}>
                      {bestVal > 0 ? YEARS[pastVals.indexOf(bestVal)] : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="bookings-rep-table__total">
                <td style={{ fontWeight: 700 }}>Total</td>
                {YEARS.map(y => (
                  <td key={y} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {y === CURRENT_YEAR
                      ? formatRevenueExact(REVENUE_BY_YEAR[y].slice(0, CURRENT_DATA_MONTH).reduce((a, b) => a + b, 0))
                      : formatRevenueExact(YEAR_TOTALS[y])
                    }
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="bookings-footnote">
        Source: HubSpot won deals export (14 Apr 2026). Close date basis, all event types.
        2026 data through {SHORT_MONTHS[CURRENT_DATA_MONTH - 1]}. Click any figure to see deals.
      </p>
    </div>
  );
}
