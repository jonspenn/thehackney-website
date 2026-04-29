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

/* Best-ever per month: the historical high-water mark for each calendar month
   across all years EXCLUDING the current one. Acts as the ceiling benchmark
   on the chart - if the current year's line sits above this, we're breaking
   records for that month. Computed once at module load since the underlying
   year data is static within a deploy. */
const BEST_EVER_BY_MONTH = (() => {
  const arr = new Array(12).fill(0);
  for (let m = 0; m < 12; m++) {
    let best = 0;
    for (const y of YEARS) {
      if (y === CURRENT_YEAR) continue;
      const v = REVENUE_BY_YEAR[y][m];
      if (v > best) best = v;
    }
    arr[m] = best;
  }
  return arr;
})();
const BEST_EVER_KEY = "best"; /* sentinel key in hiddenYears + legend */
const BEST_EVER_COLOR = "#40160C"; /* Mahogany */
const BEST_EVER_DASH = "5 3";
const BEST_EVER_WIDTH = 1.5;
const BEST_EVER_OPACITY = 0.42;

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

  /* Compute max value across visible years (and best-ever benchmark when
     visible) for Y-axis scaling */
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
    if (!hiddenYears.has(BEST_EVER_KEY)) {
      for (let m = 0; m < 12; m++) {
        if (BEST_EVER_BY_MONTH[m] > max) max = BEST_EVER_BY_MONTH[m];
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

    /* vs best ever YTD: sum of per-month historical maxes through CURRENT_DATA_MONTH */
    let bestEverYTD = 0;
    for (let m = 0; m < CURRENT_DATA_MONTH; m++) {
      bestEverYTD += BEST_EVER_BY_MONTH[m];
    }
    const bestEverPct = bestEverYTD ? Math.round(((ytdTotal - bestEverYTD) / bestEverYTD) * 100) : null;
    /* For sub-0.5% deltas show one decimal so "+0%" doesn't read as "tied" */
    const bestEverPctFine = bestEverYTD ? ((ytdTotal - bestEverYTD) / bestEverYTD) * 100 : null;
    const bestEverPctDisplay = bestEverPctFine == null
      ? null
      : (Math.abs(bestEverPctFine) < 1
          ? bestEverPctFine.toFixed(1)
          : Math.round(bestEverPctFine).toString());

    return {
      ytdTotal, yoyPct,
      bestMonthLabel, bestMonthValue,
      dealsCurrentYTD, dealsPriorYTD,
      bestEverYTD, bestEverPct, bestEverPctFine, bestEverPctDisplay,
    };
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
          <MetadataCell eyebrow="vs best ever">
            <span
              className="pipe-metric"
              style={{ color: strip.bestEverPct == null ? undefined : (strip.bestEverPct >= 0 ? "#2E4009" : "#8C472E") }}
              title={strip.bestEverYTD ? `Best-ever YTD = sum of per-month historical maxes (£${strip.bestEverYTD.toLocaleString("en-GB")} for Jan-${SHORT_MONTHS[CURRENT_DATA_MONTH - 1]})` : ""}
            >
              {strip.bestEverPctDisplay == null
                ? "—"
                : `${strip.bestEverPctFine >= 0 ? "+" : ""}${strip.bestEverPctDisplay}%`}
              <span className="pipe-metric__unit">vs best YTD</span>
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

        {/* Interactive legend - years + best-ever benchmark */}
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
              type="button"
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
          {/* Best-ever benchmark toggle */}
          <button
            className="bookings-legend__item"
            style={{
              opacity: hiddenYears.has(BEST_EVER_KEY) ? 0.3 : 1,
              textDecoration: hiddenYears.has(BEST_EVER_KEY) ? "line-through" : "none",
            }}
            onClick={() => setHiddenYears(prev => {
              const next = new Set(prev);
              next.has(BEST_EVER_KEY) ? next.delete(BEST_EVER_KEY) : next.add(BEST_EVER_KEY);
              return next;
            })}
            title={hiddenYears.has(BEST_EVER_KEY) ? "Show best-ever benchmark" : "Hide best-ever benchmark"}
            type="button"
          >
            <svg width="20" height="10" style={{ marginRight: 4, verticalAlign: "middle" }}>
              <line
                x1="0" y1="5" x2="20" y2="5"
                stroke={hiddenYears.has(BEST_EVER_KEY) ? "rgba(44,24,16,0.15)" : BEST_EVER_COLOR}
                strokeOpacity={hiddenYears.has(BEST_EVER_KEY) ? 1 : BEST_EVER_OPACITY}
                strokeWidth={BEST_EVER_WIDTH}
                strokeDasharray={BEST_EVER_DASH}
              />
            </svg>
            Best ever
          </button>
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

          {/* Best-ever benchmark line - per-month historical max across all
              prior years. Renders BEFORE the year lines so the actual data
              draws on top of the benchmark. Spans all 12 months (it's a
              static reference line, not bounded by CURRENT_DATA_MONTH). */}
          {!hiddenYears.has(BEST_EVER_KEY) && (() => {
            const points = BEST_EVER_BY_MONTH.map((v, m) => ({
              x: monthX(m), y: valY(v), val: v, month: m,
            }));
            return (
              <path
                d={smoothPath(points, 0.5)}
                fill="none"
                stroke={BEST_EVER_COLOR}
                strokeOpacity={BEST_EVER_OPACITY}
                strokeWidth={BEST_EVER_WIDTH}
                strokeDasharray={BEST_EVER_DASH}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })()}

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
                {/* Per-point hover/active dot. Value label moved to the stacked
                    tooltip rendered once per hover, after the year-line loop. */}
                {points.map((p) => {
                  const isHovered = hoveredMonth === p.month;
                  const isActive = drillDown && drillDown.year === year && drillDown.month === p.month;
                  if (!isHovered && !isActive) return null;
                  return (
                    <circle
                      key={p.month}
                      cx={p.x} cy={p.y}
                      r={isActive ? 5 : 4}
                      fill={p.val > 0 ? YEAR_COLORS[year] : "transparent"}
                      stroke={isActive ? "#2E4009" : "#F5F0E8"}
                      strokeWidth={isActive ? 2.5 : 1.5}
                      style={{ cursor: p.val > 0 ? "pointer" : "default" }}
                      onClick={() => handleCellClick(year, p.month)}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Stacked hover tooltip - one card listing every visible year's
              value at the hovered month. Replaces per-dot labels which
              collided when years stacked close together (e.g. £39k vs £28k
              within 12px y-distance). */}
          {hoveredMonth !== null && (() => {
            const visibleAtMonth = YEARS
              .filter(y => !hiddenYears.has(y))
              .filter(y => {
                const endMonth = y === CURRENT_YEAR ? CURRENT_DATA_MONTH : 12;
                return hoveredMonth < endMonth && REVENUE_BY_YEAR[y][hoveredMonth] > 0;
              })
              .sort((a, b) => b - a);
            const bestVal = BEST_EVER_BY_MONTH[hoveredMonth];
            const showBest = !hiddenYears.has(BEST_EVER_KEY) && bestVal > 0;
            if (visibleAtMonth.length === 0 && !showBest) return null;

            /* Card geometry. Generous spacing - header and rows must each
               sit on their own line with breathing room (£39k vs £45k labels
               were colliding at the previous 16px row height + 6px padding). */
            const padX = 12;
            const padY = 12;
            const headerH = 18;
            const rowH = 22;
            const cardW = 124;
            const totalRows = visibleAtMonth.length + (showBest ? 1 : 0);
            const cardH = padY * 2 + headerH + rowH * totalRows;

            const tx = monthX(hoveredMonth);
            /* Pin to right of crosshair when there's room, otherwise flip left. */
            const cardX = tx + cardW + 14 > W - PAD_R
              ? tx - cardW - 12
              : tx + 12;
            const cardY = PAD_T + 4;

            const headerCenterY = cardY + padY + headerH / 2;

            return (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={cardX} y={cardY}
                  width={cardW} height={cardH}
                  rx={4} ry={4}
                  fill="rgba(245,240,232,0.96)"
                  stroke="rgba(64,22,12,0.14)"
                  strokeWidth="1"
                />
                <text
                  x={cardX + padX}
                  y={headerCenterY}
                  dominantBaseline="central"
                  fontSize="10" fontWeight="700"
                  letterSpacing="0.1em"
                  fill="rgba(44,24,16,0.45)"
                >
                  {SHORT_MONTHS[hoveredMonth].toUpperCase()}
                </text>
                {visibleAtMonth.map((year, i) => {
                  const rowCenterY = cardY + padY + headerH + i * rowH + rowH / 2;
                  return (
                    <g key={year}>
                      <circle
                        cx={cardX + padX + 4}
                        cy={rowCenterY}
                        r={4}
                        fill={YEAR_COLORS[year]}
                      />
                      <text
                        x={cardX + padX + 14}
                        y={rowCenterY}
                        dominantBaseline="central"
                        fontSize="12"
                        fontWeight={year === CURRENT_YEAR ? "600" : "500"}
                        fill="rgba(44,24,16,0.72)"
                      >
                        {year}
                      </text>
                      <text
                        x={cardX + cardW - padX}
                        y={rowCenterY}
                        textAnchor="end"
                        dominantBaseline="central"
                        fontSize="12"
                        fontWeight="600"
                        fill={YEAR_COLORS[year]}
                        fontVariantNumeric="tabular-nums"
                      >
                        {formatRevenue(REVENUE_BY_YEAR[year][hoveredMonth])}
                      </text>
                    </g>
                  );
                })}
                {/* Best-ever benchmark row - separated visually by a 1px rule above */}
                {showBest && (() => {
                  const bestRowIdx = visibleAtMonth.length;
                  const rowCenterY = cardY + padY + headerH + bestRowIdx * rowH + rowH / 2;
                  return (
                    <g>
                      {visibleAtMonth.length > 0 && (
                        <line
                          x1={cardX + padX} y1={rowCenterY - rowH / 2}
                          x2={cardX + cardW - padX} y2={rowCenterY - rowH / 2}
                          stroke="rgba(44,24,16,0.10)"
                          strokeWidth="1"
                        />
                      )}
                      <line
                        x1={cardX + padX}
                        x2={cardX + padX + 8}
                        y1={rowCenterY} y2={rowCenterY}
                        stroke={BEST_EVER_COLOR}
                        strokeOpacity={BEST_EVER_OPACITY}
                        strokeWidth={BEST_EVER_WIDTH}
                        strokeDasharray={BEST_EVER_DASH}
                      />
                      <text
                        x={cardX + padX + 14}
                        y={rowCenterY}
                        dominantBaseline="central"
                        fontSize="11"
                        fontWeight="500"
                        fontStyle="italic"
                        fill="rgba(44,24,16,0.55)"
                      >
                        Best ever
                      </text>
                      <text
                        x={cardX + cardW - padX}
                        y={rowCenterY}
                        textAnchor="end"
                        dominantBaseline="central"
                        fontSize="12"
                        fontWeight="600"
                        fill={BEST_EVER_COLOR}
                        fillOpacity={0.7}
                        fontVariantNumeric="tabular-nums"
                      >
                        {formatRevenue(bestVal)}
                      </text>
                    </g>
                  );
                })()}
              </g>
            );
          })()}
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
        Source: HubSpot won deals export (29 Apr 2026). Close date basis, all event types.
        2026 data through {SHORT_MONTHS[CURRENT_DATA_MONTH - 1]}. Click any figure to see deals.
      </p>
    </div>
  );
}
