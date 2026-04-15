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

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const YEARS = Object.keys(REVENUE_BY_YEAR).map(Number).sort();
const CURRENT_YEAR = YEARS[YEARS.length - 1];

function formatRevenue(val) {
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

export default function BookingsView() {
  const [hiddenYears, setHiddenYears] = useState(() => new Set(YEARS.filter(y => y !== CURRENT_YEAR)));
  const [hoveredMonth, setHoveredMonth] = useState(null);
  const [drillDown, setDrillDown] = useState(null); // { year, month } or null

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

      {/* ── KPI cards ── */}
      <div className="bookings-kpis">
        {YEARS.map(year => {
          const total = year === CURRENT_YEAR
            ? REVENUE_BY_YEAR[year].slice(0, CURRENT_DATA_MONTH).reduce((a, b) => a + b, 0)
            : YEAR_TOTALS[year];
          const label = year === CURRENT_YEAR
            ? `${year} YTD (${SHORT_MONTHS[CURRENT_DATA_MONTH - 1]})`
            : `${year} Total`;
          const ytdPrev = year > YEARS[0] ? ytdByYear[year - 1] : null;
          const ytdCurr = ytdByYear[year];
          const pctChange = ytdPrev ? Math.round(((ytdCurr - ytdPrev) / ytdPrev) * 100) : null;

          return (
            <div key={year} className="bookings-kpi" style={{ borderLeftColor: YEAR_COLORS[year] }}>
              <div className="bookings-kpi__label">{label}</div>
              <div className="bookings-kpi__value">{formatRevenueExact(total)}</div>
              {year === CURRENT_YEAR && pctChange !== null && (
                <div className="bookings-kpi__change" style={{ color: pctChange >= 0 ? "#2E4009" : "#8C472E" }}>
                  {pctChange >= 0 ? "+" : ""}{pctChange}% vs {year - 1} at same point
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Chart ── */}
      <div className="bookings-chart">
        <h3 className="bookings-chart__title">Monthly revenue booked (close date)</h3>

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

          {/* Year lines */}
          {YEARS.filter(y => !hiddenYears.has(y)).map(year => {
            const data = REVENUE_BY_YEAR[year];
            const endMonth = year === CURRENT_YEAR ? CURRENT_DATA_MONTH : 12;
            const points = [];
            for (let m = 0; m < endMonth; m++) {
              points.push({ x: monthX(m), y: valY(data[m]), val: data[m], month: m });
            }
            if (points.length === 0) return null;

            const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

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
                {points.map((p, i) => (
                  <g key={i} onClick={() => handleCellClick(year, p.month)} style={{ cursor: p.val > 0 ? "pointer" : "default" }}>
                    <circle
                      cx={p.x} cy={p.y}
                      r={hoveredMonth === p.month ? 4.5 : (p.val > 0 ? 3 : 1.5)}
                      fill={p.val > 0 ? YEAR_COLORS[year] : "rgba(44,24,16,0.08)"}
                      stroke={drillDown && drillDown.year === year && drillDown.month === p.month ? "#2E4009" : "#F5F0E8"}
                      strokeWidth={drillDown && drillDown.year === year && drillDown.month === p.month ? 2.5 : 1.5}
                    />
                    {(hoveredMonth === p.month || (year === CURRENT_YEAR && i === points.length - 1)) && p.val > 0 && (
                      <text
                        x={p.x}
                        y={p.y - 10}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={YEAR_COLORS[year]}
                      >
                        {formatRevenue(p.val)}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Drill-down panel ── */}
      {drillDown && drillDeals && (
        <div className="bookings-drill">
          <div className="bookings-drill__header">
            <h3 className="bookings-drill__title">
              {FULL_MONTHS[drillDown.month]} {drillDown.year}
              <span className="bookings-drill__total"> - {formatRevenueExact(REVENUE_BY_YEAR[drillDown.year][drillDown.month])} from {drillDeals.length} deal{drillDeals.length !== 1 ? "s" : ""}</span>
            </h3>
            <button className="bookings-drill__close" onClick={() => setDrillDown(null)} type="button" title="Close">&times;</button>
          </div>
          {drillDeals.length > 0 ? (
            <div className="bookings-drill__table-wrap">
              <table className="bookings-drill__table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Deal</th>
                    <th>Type</th>
                    <th>Event date</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDeals.map((deal, idx) => (
                    <tr key={idx}>
                      <td style={{ textAlign: "left", fontWeight: 500 }}>{deal.n}</td>
                      <td>{deal.t}</td>
                      <td>{formatEventDate(deal.d)}</td>
                      <td style={{ fontWeight: 600 }}>{formatRevenueExact(deal.a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "rgba(44,24,16,0.4)", fontStyle: "italic", margin: "8px 0" }}>No deal data available for this month.</p>
          )}
        </div>
      )}

      {/* ── Month detail table ── */}
      <div className="bookings-table-wrap">
        <table className="bookings-table">
          <thead>
            <tr>
              <th>Month</th>
              {YEARS.map(y => <th key={y}>{y}</th>)}
              <th>Best</th>
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
                  style={{ opacity: isFuture ? 0.35 : 1 }}
                  onMouseEnter={() => setHoveredMonth(i)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  className={hoveredMonth === i ? "bookings-table__row--hover" : ""}
                >
                  <td style={{ fontWeight: 600 }}>{label}</td>
                  {YEARS.map((y) => {
                    const val = REVENUE_BY_YEAR[y][i];
                    const isBest = val === bestVal && val > 0 && (!isFuture || y !== CURRENT_YEAR);
                    const isActive = drillDown && drillDown.year === y && drillDown.month === i;
                    return (
                      <td
                        key={y}
                        className={val > 0 ? "bookings-table__cell--clickable" : ""}
                        style={{
                          fontWeight: isBest ? 700 : 400,
                          color: isBest ? "#2E4009" : undefined,
                          background: isActive ? "rgba(46,64,9,0.08)" : undefined,
                          cursor: val > 0 ? "pointer" : "default",
                        }}
                        onClick={() => handleCellClick(y, i)}
                        title={val > 0 ? `Click to see ${FULL_MONTHS[i]} ${y} deals` : ""}
                      >
                        {val > 0 ? formatRevenueExact(val) : "-"}
                      </td>
                    );
                  })}
                  <td style={{ fontSize: "0.8em", color: "rgba(44,24,16,0.4)" }}>
                    {bestVal > 0 ? YEARS[pastVals.indexOf(bestVal)] : "-"}
                  </td>
                </tr>
              );
            })}
            <tr className="bookings-table__total">
              <td style={{ fontWeight: 700 }}>Total</td>
              {YEARS.map(y => (
                <td key={y} style={{ fontWeight: 700 }}>
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

      <p className="bookings-footnote">
        Source: HubSpot won deals export (14 Apr 2026). Close date basis, all event types.
        2026 data through {SHORT_MONTHS[CURRENT_DATA_MONTH - 1]}. Click any figure to see deals.
      </p>
    </div>
  );
}
