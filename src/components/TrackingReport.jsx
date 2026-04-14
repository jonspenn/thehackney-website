import { useEffect, useMemo, useState } from "react";

/**
 * Internal tracking dashboard for the D1 first-party data platform.
 * Powers the obscure /reports/tr-a83f19d2b6e7/ page so Jon, Hugo, and
 * James can see visitor behaviour across the site.
 *
 * Fetches everything in one call from /api/tracking-stats.
 *
 * NOT linked from anywhere on the public site, noindexed at the
 * page level. Read-only - no actions, no data export.
 */

const EVENT_TYPE_LABELS = {
  page_view: "Page views",
  cta_click: "CTA clicks",
  date_check: "Date checks",
  scroll_depth: "Scroll depth",
  questionnaire_start: "Quiz starts",
  questionnaire_step: "Quiz steps",
  questionnaire_complete: "Quiz completions",
  questionnaire_abandon: "Quiz abandons",
  form_submit: "Form submissions",
  brochure_download: "Brochure downloads",
};

function formatRelativeTime(iso) {
  if (!iso) return "";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const then = new Date(safe);
  if (Number.isNaN(then.getTime())) return iso;
  const diffSec = Math.floor((Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatAbsoluteTime(iso) {
  if (!iso) return "\u2014";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenUrl(url) {
  if (!url) return "\u2014";
  try {
    const u = new URL(url, "https://thehackney-website.pages.dev");
    return u.pathname;
  } catch {
    return url;
  }
}

function parseEventData(raw) {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function eventSummary(eventType, eventData) {
  const d = parseEventData(eventData);
  if (!d) return "";
  if (eventType === "cta_click" && d.track_id) return d.track_id;
  if (eventType === "scroll_depth" && d.depth) return `${d.depth}%`;
  if (eventType === "page_view" && d.page_type) return d.page_type;
  return "";
}

export default function TrackingReport() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tracking-stats", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Auto-refresh every 60s
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  const topPageMax = useMemo(() => {
    if (!data || !data.topPages.length) return 1;
    return data.topPages[0].view_count;
  }, [data]);

  const topCTAMax = useMemo(() => {
    if (!data || !data.topCTAs.length) return 1;
    return data.topCTAs[0].click_count;
  }, [data]);

  const sourceMax = useMemo(() => {
    if (!data || !data.sources.length) return 1;
    return data.sources[0].visitor_count;
  }, [data]);

  const deviceTotal = useMemo(() => {
    if (!data) return 0;
    return data.devices.reduce((sum, d) => sum + d.visitor_count, 0);
  }, [data]);

  const eventTypeMax = useMemo(() => {
    if (!data || !data.eventTypes.length) return 1;
    return data.eventTypes[0].event_count;
  }, [data]);

  if (loading) {
    return <div className="rep-state">Loading tracking data\u2026</div>;
  }
  if (error) {
    return (
      <div className="rep-state rep-state--error">
        Could not load tracking data: {error}
        <br />
        <button className="rep-retry" onClick={load} type="button">
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { totals, topPages, topCTAs, devices, sources, eventTypes, recentEvents, recentVisitors } = data;
  const noData = totals.totalVisitors === 0;

  return (
    <div className="rep">
      {/* Totals strip */}
      <div className="rep-totals">
        <div className="rep-stat">
          <div className="rep-stat__num">{totals.totalVisitors}</div>
          <div className="rep-stat__label">Total visitors</div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat__num">{totals.totalSessions}</div>
          <div className="rep-stat__label">Total sessions</div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat__num">{totals.totalEvents}</div>
          <div className="rep-stat__label">Total events</div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat__num">{totals.avgPagesPerSession}</div>
          <div className="rep-stat__label">Avg pages / session</div>
        </div>
      </div>

      {/* Today strip */}
      <div className="rep-totals rep-totals--today">
        <div className="rep-stat rep-stat--today">
          <div className="rep-stat__num">{totals.visitorsToday}</div>
          <div className="rep-stat__label">Visitors today</div>
        </div>
        <div className="rep-stat rep-stat--today">
          <div className="rep-stat__num">{totals.sessionsToday}</div>
          <div className="rep-stat__label">Sessions today</div>
        </div>
        <div className="rep-stat rep-stat--today">
          <div className="rep-stat__num">{totals.eventsToday}</div>
          <div className="rep-stat__label">Events today</div>
        </div>
        <div className="rep-stat rep-stat--today">
          <div className="rep-stat__num">
            {totals.lastVisitorAt ? formatRelativeTime(totals.lastVisitorAt) : "\u2014"}
          </div>
          <div className="rep-stat__label">Last activity</div>
        </div>
      </div>

      <button
        className="rep-refresh"
        onClick={load}
        type="button"
        aria-label="Refresh data"
      >
        Refresh
      </button>

      {noData && (
        <div className="rep-empty">
          No visitor data yet. Once the tracking script fires on the live site,
          this dashboard will populate automatically. Refreshes every 60 seconds.
        </div>
      )}

      {/* Top pages */}
      <section className="rep-section">
        <h2 className="rep-h2">Top pages</h2>
        <p className="rep-sub">
          Most viewed pages by total page_view events.
        </p>
        {topPages.length === 0 ? (
          <p className="rep-empty-small">No page views yet.</p>
        ) : (
          <ol className="rep-toplist">
            {topPages.map((row, i) => {
              const pct = (row.view_count / topPageMax) * 100;
              return (
                <li key={row.page_url} className="rep-toprow">
                  <span className="rep-toprank">{i + 1}</span>
                  <span className="rep-topdate">{shortenUrl(row.page_url)}</span>
                  <span className="rep-topbar">
                    <span className="rep-topbar__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="rep-topcount">{row.view_count}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Top CTAs */}
      <section className="rep-section">
        <h2 className="rep-h2">Top CTA clicks</h2>
        <p className="rep-sub">
          Which buttons are getting clicked, and on which pages.
        </p>
        {topCTAs.length === 0 ? (
          <p className="rep-empty-small">No CTA clicks yet.</p>
        ) : (
          <ol className="rep-toplist">
            {topCTAs.map((row, i) => {
              const pct = (row.click_count / topCTAMax) * 100;
              return (
                <li key={`${row.cta_id}-${row.page_url}`} className="rep-toprow">
                  <span className="rep-toprank">{i + 1}</span>
                  <span className="rep-topdate">
                    <strong>{row.cta_id || "unknown"}</strong>
                    <br />
                    <span style={{ fontSize: "12px", color: "rgba(44,24,16,0.5)" }}>
                      {shortenUrl(row.page_url)}
                    </span>
                  </span>
                  <span className="rep-topbar">
                    <span className="rep-topbar__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="rep-topcount">{row.click_count}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Two-column grid: Sources + Devices */}
      <div className="rep-two-col">
        {/* Traffic sources */}
        <section className="rep-section">
          <h2 className="rep-h2">Traffic sources</h2>
          <p className="rep-sub">First-touch UTM source per visitor.</p>
          {sources.length === 0 ? (
            <p className="rep-empty-small">No source data yet.</p>
          ) : (
            <ol className="rep-toplist">
              {sources.map((row, i) => {
                const pct = (row.visitor_count / sourceMax) * 100;
                return (
                  <li key={row.source} className="rep-toprow rep-toprow--compact">
                    <span className="rep-toprank">{i + 1}</span>
                    <span className="rep-topdate">{row.source}</span>
                    <span className="rep-topbar">
                      <span className="rep-topbar__fill" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="rep-topcount">{row.visitor_count}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Device breakdown */}
        <section className="rep-section">
          <h2 className="rep-h2">Devices</h2>
          <p className="rep-sub">Visitor count by device type.</p>
          {devices.length === 0 ? (
            <p className="rep-empty-small">No device data yet.</p>
          ) : (
            <div className="rep-device-grid">
              {devices.map((d) => {
                const pct = deviceTotal > 0 ? Math.round((d.visitor_count / deviceTotal) * 100) : 0;
                return (
                  <div key={d.device_type} className="rep-device-card">
                    <div className="rep-device-card__pct">{pct}%</div>
                    <div className="rep-device-card__label">{d.device_type || "Unknown"}</div>
                    <div className="rep-device-card__count">{d.visitor_count} visitors</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Event type breakdown */}
      <section className="rep-section">
        <h2 className="rep-h2">Events by type</h2>
        <p className="rep-sub">
          Total count for each event type tracked.
        </p>
        {eventTypes.length === 0 ? (
          <p className="rep-empty-small">No events yet.</p>
        ) : (
          <ol className="rep-toplist">
            {eventTypes.map((row, i) => {
              const pct = (row.event_count / eventTypeMax) * 100;
              return (
                <li key={row.event_type} className="rep-toprow rep-toprow--compact">
                  <span className="rep-toprank">{i + 1}</span>
                  <span className="rep-topdate">
                    {EVENT_TYPE_LABELS[row.event_type] || row.event_type}
                  </span>
                  <span className="rep-topbar">
                    <span className="rep-topbar__fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="rep-topcount">{row.event_count}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Recent visitors */}
      <section className="rep-section">
        <h2 className="rep-h2">Recent visitors</h2>
        <p className="rep-sub">
          Last {RECENT_VISITORS_DISPLAY} visitors. Shows first-touch attribution.
        </p>
        {recentVisitors.length === 0 ? (
          <p className="rep-empty-small">No visitors yet.</p>
        ) : (
          <div className="rep-table-wrap">
            <table className="rep-table">
              <thead>
                <tr>
                  <th>First seen</th>
                  <th>Device</th>
                  <th>Landing page</th>
                  <th>Source</th>
                  <th>Sessions</th>
                  <th>Pages</th>
                </tr>
              </thead>
              <tbody>
                {recentVisitors.map((row) => (
                  <tr key={row.visitor_id}>
                    <td>{formatRelativeTime(row.first_seen_at)}</td>
                    <td>{row.device_type || "\u2014"}</td>
                    <td className="rep-table__ref">{shortenUrl(row.first_landing_page)}</td>
                    <td>
                      {row.first_utm_source || "Direct"}
                      {row.first_utm_medium ? ` / ${row.first_utm_medium}` : ""}
                    </td>
                    <td>{row.total_sessions}</td>
                    <td>{row.total_page_views}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent events */}
      <section className="rep-section">
        <h2 className="rep-h2">Recent events</h2>
        <p className="rep-sub">
          Last {RECENT_EVENTS_DISPLAY} events. Useful for checking the system is working.
        </p>
        {recentEvents.length === 0 ? (
          <p className="rep-empty-small">No events logged yet.</p>
        ) : (
          <div className="rep-table-wrap">
            <table className="rep-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Page</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((row, i) => (
                  <tr key={i}>
                    <td>{formatRelativeTime(row.created_at)}</td>
                    <td>
                      <span className={`rep-event-badge rep-event-badge--${row.event_type.split("_")[0]}`}>
                        {EVENT_TYPE_LABELS[row.event_type] || row.event_type}
                      </span>
                    </td>
                    <td className="rep-table__ref">{shortenUrl(row.page_url)}</td>
                    <td className="rep-table__ref">{eventSummary(row.event_type, row.event_data)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const RECENT_EVENTS_DISPLAY = 50;
const RECENT_VISITORS_DISPLAY = 30;
