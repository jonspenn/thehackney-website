import { useEffect, useMemo, useState } from "react";

/**
 * Combined internal dashboard for /admin/.
 * Orchestrates tabs, data fetching, and renders sub-components.
 * Protected by Cloudflare Access (zero trust).
 *
 * Constants and utilities extracted to dashboard/constants.js and dashboard/utils.js.
 * Sub-components: dashboard/LeadProfile.jsx (full-page profile + journey), dashboard/LeadTable.jsx.
 */

import {
  LEAD_TABS,
} from "./dashboard/constants.js";

import LeadProfile from "./dashboard/LeadProfile.jsx";
import LeadTable from "./dashboard/LeadTable.jsx";
import PipelineView from "./dashboard/PipelineView.jsx";
import BookingsView from "./dashboard/BookingsView.jsx";
import WebsiteView from "./dashboard/WebsiteView.jsx";
import AttributionView from "./dashboard/AttributionView.jsx";
import CustomersView from "./dashboard/CustomersView.jsx";
import PricingView from "./dashboard/PricingView.jsx";
import DatesView from "./dashboard/DatesView.jsx";

/* ───────── URL persistence ───────── */
const VALID_TABS = ["pipeline", "leads", "dates", "customers", "bookings", "website", "attribution", "overview", "analytics", "lost", "pricing"];
const VALID_TYPES = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];

/* ───────── main component ───────── */

export default function AdminDashboard({ pricing }) {
  const [tracking, setTracking] = useState(null);
  const [clicks, setClicks] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [leads, setLeads] = useState({}); // keyed by lead type: { wedding: {...}, corporate: {...}, ... }
  const [lostLeads, setLostLeads] = useState({}); // keyed by lead type - funnel_stage='lost' only
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // ── URL state hydration ──
  // Read tab / type / lead from window.location.search so a page refresh preserves
  // the view. Lead is stored as contact_id; the lead object is resolved once the
  // leads/customers data loads (see useEffect below).
  const initialUrlState = (() => {
    if (typeof window === "undefined") return { tab: "overview", type: "wedding", leadId: null };
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const type = params.get("type");
    const leadId = params.get("lead");
    return {
      tab: VALID_TABS.includes(tab) ? tab : "pipeline",
      type: VALID_TYPES.includes(type) ? type : "wedding",
      leadId: leadId || null,
    };
  })();

  // ── Tab redirects (29 Apr 2026 IA restructure) ──
  // - ?tab=lost      → leads + showLost=true
  // - ?tab=overview  → website + websiteSub='performance'
  // - ?tab=analytics → website + websiteSub='events'
  // Old bookmarks and copied URLs all keep working; the user just lands in
  // the new home of that content.
  const initialResolvedTab = (() => {
    if (initialUrlState.tab === "lost") return "leads";
    if (initialUrlState.tab === "overview" || initialUrlState.tab === "analytics") return "website";
    return initialUrlState.tab;
  })();
  const [activeTab, setActiveTab] = useState(initialResolvedTab);
  const [activeLeadType, setActiveLeadType] = useState(initialUrlState.type);
  const initialLostMode = (() => {
    if (typeof window === "undefined") return false;
    if (initialUrlState.tab === "lost") return true;
    const params = new URLSearchParams(window.location.search);
    return params.get("lost") === "1";
  })();
  const [showLost, setShowLost] = useState(initialLostMode);
  const initialWebsiteSub = (() => {
    if (typeof window === "undefined") return "performance";
    if (initialUrlState.tab === "analytics") return "events";
    if (initialUrlState.tab === "overview") return "performance";
    const params = new URLSearchParams(window.location.search);
    const sub = params.get("sub");
    return sub === "events" ? "events" : "performance";
  })();
  const [websiteSub, setWebsiteSub] = useState(initialWebsiteSub);
  const [pendingLeadId, setPendingLeadId] = useState(initialUrlState.leadId); // resolved to selectedLead once data arrives
  const [analyticsFilter, setAnalyticsFilter] = useState(null); // { type, value, label } or null
  const [selectedLead, setSelectedLead] = useState(null); // lead object for profile panel
  const [journey, setJourney] = useState(null); // journey data for selected lead
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [showFullJourney, setShowFullJourney] = useState(false); // full session log hidden by default
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [deletedLeads, setDeletedLeads] = useState({}); // keyed by lead type

  function selectLead(lead, leadType) {
    setSelectedLead(lead);
    const nextType = leadType || activeLeadType;
    if (leadType) setActiveLeadType(leadType);
    setJourney(null);
    setShowFullJourney(false);
    if (lead?.contact_id) {
      syncUrl({ tab: activeTab, type: nextType, leadId: lead.contact_id });
      setJourneyLoading(true);
      fetch(`/api/lead-journey?contact_id=${encodeURIComponent(lead.contact_id)}`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => { if (data.ok) setJourney(data); })
        .catch(() => {})
        .finally(() => setJourneyLoading(false));
    }
  }

  async function fetchDeletedLeads() {
    const leadTypes = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];
    const results = await Promise.all(
      leadTypes.map(t => fetch(`/api/leads?type=${t}&deleted=1`, { cache: "no-store" }).catch(() => null))
    );
    const data = {};
    for (let i = 0; i < leadTypes.length; i++) {
      if (results[i] && results[i].ok) {
        const lj = await results[i].json();
        if (lj.ok) data[leadTypes[i]] = lj;
      }
    }
    setDeletedLeads(data);
  }

  async function handleDeleteOrRestore() {
    // Refresh both active leads and deleted leads
    const leadTypes = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];
    const [activeResults, deletedResults] = await Promise.all([
      Promise.all(leadTypes.map(t => fetch(`/api/leads?type=${t}`, { cache: "no-store" }).catch(() => null))),
      Promise.all(leadTypes.map(t => fetch(`/api/leads?type=${t}&deleted=1`, { cache: "no-store" }).catch(() => null))),
    ]);
    const activeData = {};
    const delData = {};
    for (let i = 0; i < leadTypes.length; i++) {
      if (activeResults[i]?.ok) { const lj = await activeResults[i].json(); if (lj.ok) activeData[leadTypes[i]] = lj; }
      if (deletedResults[i]?.ok) { const lj = await deletedResults[i].json(); if (lj.ok) delData[leadTypes[i]] = lj; }
    }
    setLeads(activeData);
    setDeletedLeads(delData);
  }

  async function handleStatusChange(result) {
    // Re-fetch active + lost buckets for the current type so both views reflect
    // the update (e.g. marking a lead Lost removes it from Leads and adds it to
    // the Lost tab in one refresh cycle).
    try {
      const [activeRes, lostRes] = await Promise.all([
        fetch(`/api/leads?type=${activeLeadType}`, { cache: "no-store" }),
        fetch(`/api/leads?type=${activeLeadType}&stage=lost`, { cache: "no-store" }),
      ]);
      const activeJson = activeRes.ok ? await activeRes.json() : null;
      const lostJson = lostRes.ok ? await lostRes.json() : null;

      if (activeJson?.ok) setLeads(prev => ({ ...prev, [activeLeadType]: activeJson }));
      if (lostJson?.ok) setLostLeads(prev => ({ ...prev, [activeLeadType]: lostJson }));

      // Update the selected lead with fresh data - check active first, then lost
      if (selectedLead) {
        const fromActive = activeJson?.ok && activeJson.leads.find(l => l.contact_id === selectedLead.contact_id);
        const fromLost = lostJson?.ok && lostJson.leads.find(l => l.contact_id === selectedLead.contact_id);
        const updated = fromActive || fromLost;
        if (updated) setSelectedLead(updated);
      }
    } catch (err) {
      console.error("[status-refresh]", err);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tRes, cRes, ctRes] = await Promise.all([
        fetch("/api/tracking-stats", { cache: "no-store" }),
        fetch("/api/click-stats", { cache: "no-store" }),
        fetch("/api/contact-stats", { cache: "no-store" }).catch(() => null),
      ]);
      if (!tRes.ok) throw new Error(`Tracking API: HTTP ${tRes.status}`);
      if (!cRes.ok) throw new Error(`Click API: HTTP ${cRes.status}`);
      const [tJson, cJson] = await Promise.all([tRes.json(), cRes.json()]);
      if (tJson.error) throw new Error(tJson.error);
      if (cJson.error) throw new Error(cJson.error);
      setTracking(tJson);
      setClicks(cJson);
      if (ctRes && ctRes.ok) {
        const ctJson = await ctRes.json();
        if (ctJson.ok) setContacts(ctJson);
      }
      // Fetch active + lost leads for all revenue streams in parallel.
      // Active = excludes won (moved to Customers) + lost (moved to Lost tab).
      // Cancelled / noshow remain in active because they may still rebook.
      const leadTypes = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];
      const [activeResults, lostResults] = await Promise.all([
        Promise.all(leadTypes.map(t => fetch(`/api/leads?type=${t}`, { cache: "no-store" }).catch(() => null))),
        Promise.all(leadTypes.map(t => fetch(`/api/leads?type=${t}&stage=lost`, { cache: "no-store" }).catch(() => null))),
      ]);
      const leadsData = {};
      const lostData = {};
      for (let i = 0; i < leadTypes.length; i++) {
        if (activeResults[i]?.ok) {
          const lj = await activeResults[i].json();
          if (lj.ok) leadsData[leadTypes[i]] = lj;
        }
        if (lostResults[i]?.ok) {
          const lj = await lostResults[i].json();
          if (lj.ok) lostData[leadTypes[i]] = lj;
        }
      }
      setLeads(leadsData);
      setLostLeads(lostData);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  /* ── URL <-> state sync ── */
  function syncUrl({ tab, type, leadId }, { replace = false } = {}) {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (tab && tab !== "overview") params.set("tab", tab);
    if (type && type !== "wedding") params.set("type", type);
    if (leadId) params.set("lead", leadId);
    const search = params.toString();
    const hash = window.location.hash || "";
    const newUrl = (search ? `${window.location.pathname}?${search}` : window.location.pathname) + hash;
    if (replace) window.history.replaceState({}, "", newUrl);
    else window.history.pushState({}, "", newUrl);
  }

  // popstate (browser back/forward) - re-hydrate state from URL.
  useEffect(() => {
    function onPop() {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const t = params.get("tab");
      const ty = params.get("type");
      const leadId = params.get("lead");
      setActiveTab(VALID_TABS.includes(t) ? t : "pipeline");
      setActiveLeadType(VALID_TYPES.includes(ty) ? ty : "wedding");
      if (leadId) {
        setPendingLeadId(leadId);
        // selectedLead will be resolved by the resolver effect below
      } else {
        setSelectedLead(null);
        setPendingLeadId(null);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Resolve pendingLeadId -> selectedLead once leads/customers data is available.
  useEffect(() => {
    if (!pendingLeadId) return;
    // Search across active leads, lost leads.
    const allBuckets = [leads, lostLeads];
    let found = null;
    for (const bucket of allBuckets) {
      if (!bucket) continue;
      for (const k of Object.keys(bucket)) {
        const arr = bucket[k]?.leads;
        if (!arr) continue;
        const hit = arr.find(l => l.contact_id === pendingLeadId);
        if (hit) { found = { lead: hit, type: k }; break; }
      }
      if (found) break;
    }
    if (found) {
      setSelectedLead(found.lead);
      setActiveLeadType(found.type);
      setJourney(null);
      setShowFullJourney(false);
      setJourneyLoading(true);
      fetch(`/api/lead-journey?contact_id=${encodeURIComponent(found.lead.contact_id)}`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => { if (data.ok) setJourney(data); })
        .catch(() => {})
        .finally(() => setJourneyLoading(false));
      setPendingLeadId(null);
    } else if (!loading) {
      // Not found in lead/lost data. If we're on the customers tab, CustomersView
      // will resolve it via onSelectCustomer when its own fetch completes; we
      // leave pendingLeadId set so a child can claim it. For other tabs, drop it.
      if (activeTab !== "customers") {
        setPendingLeadId(null);
        // strip the orphan lead param from URL silently
        syncUrl({ tab: activeTab, type: activeLeadType, leadId: null }, { replace: true });
      }
    }
  }, [pendingLeadId, leads, lostLeads, loading, activeTab, activeLeadType]);

  function applyAnalyticsFilter(type, value, label) {
    const current = analyticsFilter;
    if (current && current.type === type && current.value === value) {
      setAnalyticsFilter(null);
    } else {
      setAnalyticsFilter({ type, value, label });
      // Cross-tab navigation: chart click on a non-Website tab jumps the user
      // into the Website tab's Events sub-section (the merged Analytics view).
      if (activeTab !== "website" || websiteSub !== "events") {
        setActiveTab("website");
        setWebsiteSub("events");
        setSelectedLead(null);
        setPendingLeadId(null);
        const params = new URLSearchParams(window.location.search);
        params.set("tab", "website");
        params.set("sub", "events");
        params.delete("lead");
        window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
      }
    }
  }

  /* ── loading / error states ── */
  if (loading) return <div className="rep-state">Loading dashboard data…</div>;
  if (error) return (
    <div className="rep-state rep-state--error">
      Could not load data: {error}<br />
      <button className="rep-retry" onClick={load} type="button">Retry</button>
    </div>
  );
  if (!tracking && !clicks) return null;

  const t = tracking?.totals || {};
  const c = clicks?.totals || {};

  // Total leads across all types for the tab badge
  const totalLeadsCount = LEAD_TABS.reduce((sum, lt) => sum + (leads[lt.type]?.total || 0), 0);
  const totalLostCount = LEAD_TABS.reduce((sum, lt) => sum + (lostLeads[lt.type]?.total || 0), 0);

  // ── Visible tab order (29 Apr 2026 IA restructure) ──
  // Operational tabs first (Pipeline / Leads / Dates), retrospective in
  // the middle (Customers / Bookings), Overview / Analytics at the end.
  // Pricing and Lost are no longer top-level tabs:
  //   - Pricing absorbed into Dates (PricingView reachable via ?tab=pricing
  //     until the rate-card drawer fully absorbs it).
  //   - Lost demoted to an inline mode toggle on the Leads tab (Active /
  //     Lost). The lost route ?tab=lost is auto-redirected to
  //     ?tab=leads&lost=1 on hydration. Pipeline already shows Lost as a
  //     terminal stage with click-to-drill-in - that pattern stays.
  const tabs = [
    { id: "pipeline", label: "Pipeline" },
    { id: "leads", label: `Leads (${totalLeadsCount})` },
    { id: "dates", label: "Dates" },
    { id: "customers", label: "Customers" },
    { id: "bookings", label: "Bookings" },
    { id: "website", label: "Website" },
    { id: "attribution", label: "Attribution" },
  ];

  return (
    <div className="rep">
      {/* Tab nav */}
      <div className="adm-tabs">
        {tabs.map((tab) => (
          tab.href ? (
            <a
              key={tab.id}
              className="adm-tab"
              href={tab.href}
            >
              {tab.label}
            </a>
          ) : (
            <button
              key={tab.id}
              className={`adm-tab${activeTab === tab.id ? " adm-tab--active" : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedLead(null);
                setPendingLeadId(null);
                syncUrl({ tab: tab.id, type: activeLeadType, leadId: null });
              }}
              type="button"
            >
              {tab.label}
            </button>
          )
        ))}
        <button className="rep-refresh adm-refresh" onClick={load} type="button" aria-label="Refresh data">Refresh</button>
      </div>

      {/* ═══════ WEBSITE TAB ═══════
           Merged Overview + Analytics (29 Apr 2026 IA restructure Phase 3).
           Sub-tabs: Performance (was Overview - KPIs, top pages, sources,
           devices, day-of-week, CTAs, dates) and Events (was Analytics -
           visitor table, date clicks log, event log). The cross-navigation
           from Performance charts to Events log is preserved as intra-tab
           sub-switching. */}
      {/* WEBSITE TAB - Performance + Events sub-tabs (formerly Overview + Analytics).
           Component lives at src/components/dashboard/WebsiteView.jsx. */}
      {activeTab === "website" && (
        <WebsiteView
          tracking={tracking}
          clicks={clicks}
          websiteSub={websiteSub}
          setWebsiteSub={setWebsiteSub}
          analyticsFilter={analyticsFilter}
          setAnalyticsFilter={setAnalyticsFilter}
          onApplyFilter={applyAnalyticsFilter}
        />
      )}

      {/* ═══════ ATTRIBUTION TAB ═══════
           Per-platform funnel performance (29 Apr 2026 - kickoff brief at
           website/pages/dashboard/next-session-attribution-kickoff.md).
           Phase 0: skeleton. Subsequent phases add API + funnel table +
           drill-in + ad-platform connectors. */}
      {activeTab === "attribution" && (
        <AttributionView />
      )}



      {/* ═══════ LEADS TAB ═══════
           Lost is an inline mode toggle here (29 Apr 2026 demotion - was its
           own top-level tab). Active = open pipeline, Lost = funnel_stage="lost"
           leads from /api/leads?stage=lost. Both views share the same LeadTable
           render path; only the data source and `mode` prop change. */}
      {activeTab === "leads" && !selectedLead && (
        <>
          <div className="adm-leads-mode">
            <button
              type="button"
              className={`adm-leads-mode__btn${!showLost ? " adm-leads-mode__btn--active" : ""}`}
              onClick={() => {
                setShowLost(false);
                syncUrl({ tab: "leads", type: activeLeadType, leadId: null }, { replace: true });
              }}
            >
              Active leads
              <span className="adm-leads-mode__count">{totalLeadsCount}</span>
            </button>
            <button
              type="button"
              className={`adm-leads-mode__btn${showLost ? " adm-leads-mode__btn--active" : ""}`}
              onClick={() => {
                setShowLost(true);
                const params = new URLSearchParams(window.location.search);
                params.set("tab", "leads");
                params.set("type", activeLeadType);
                params.set("lost", "1");
                params.delete("lead");
                window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
              }}
            >
              Lost
              <span className="adm-leads-mode__count">{totalLostCount}</span>
            </button>
          </div>
          {showLost ? (
            <LeadTable
              leads={lostLeads}
              selectedLeadId={selectedLead?.contact_id}
              onSelectLead={selectLead}
              initialType={activeLeadType}
              onLeadTypeChange={(t) => { setActiveLeadType(t); syncUrl({ tab: activeTab, type: t, leadId: null }, { replace: true }); }}
              mode="lost"
            />
          ) : (
            <LeadTable
              leads={leads}
              deletedLeads={deletedLeads}
              selectedLeadId={selectedLead?.contact_id}
              onSelectLead={selectLead}
              initialType={activeLeadType}
              onLeadTypeChange={(t) => { setActiveLeadType(t); syncUrl({ tab: activeTab, type: t, leadId: null }, { replace: true }); }}
              onDelete={handleDeleteOrRestore}
              onRestore={handleDeleteOrRestore}
              showRecycleBin={showRecycleBin}
              onToggleRecycleBin={() => {
                const next = !showRecycleBin;
                setShowRecycleBin(next);
                if (next) fetchDeletedLeads();
              }}
            />
          )}
        </>
      )}

      {/* ═══════ PIPELINE TAB ═══════ */}
      {activeTab === "pipeline" && !selectedLead && (
        <PipelineView
          leads={leads}
          onSelectLead={selectLead}
          initialType={activeLeadType}
          onTypeChange={(t) => { setActiveLeadType(t); syncUrl({ tab: activeTab, type: t, leadId: null }, { replace: true }); }}
        />
      )}

      {/* ═══════ BOOKINGS TAB ═══════ */}
      {activeTab === "bookings" && (
        <BookingsView />
      )}

      {/* ═══════ CUSTOMERS TAB ═══════ */}
      {activeTab === "customers" && !selectedLead && (
        <CustomersView
          onSelectCustomer={selectLead}
          initialType={activeLeadType}
          onTypeChange={(t) => { setActiveLeadType(t); syncUrl({ tab: activeTab, type: t, leadId: null }, { replace: true }); }}
          pendingCustomerId={pendingLeadId}
          onPendingResolved={() => setPendingLeadId(null)}
        />
      )}

      {/* ═══════ PRICING TAB ═══════ */}
      {activeTab === "dates" && (
        <DatesView
          pricing={pricing}
          leads={leads}
          onSelectLead={selectLead}
        />
      )}

      {activeTab === "pricing" && !selectedLead && (
        <PricingView pricing={pricing} />
      )}


      {/* ═══════ FULL-PAGE LEAD PROFILE ═══════ */}
      {selectedLead && (
        <LeadProfile
          lead={selectedLead}
          activeLeadType={activeLeadType}
          journey={journey}
          journeyLoading={journeyLoading}
          showFullJourney={showFullJourney}
          setShowFullJourney={setShowFullJourney}
          onBack={() => {
            setSelectedLead(null);
            setPendingLeadId(null);
            syncUrl({ tab: activeTab, type: activeLeadType, leadId: null });
          }}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
