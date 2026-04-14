/**
 * tracking.js - The Hackney first-party data capture
 *
 * Phase 1 of prd-sys-d1-data-platform.md
 *
 * Vanilla JS, no dependencies. < 3KB gzipped.
 * Loaded in Base.astro after GTM and Clarity scripts.
 * Reads page_type from existing dataLayer.
 * Uses navigator.sendBeacon (fetch with keepalive as fallback).
 * Does not fire if DNT header set.
 * Does not duplicate GA4/GTM events - captures what they cannot:
 *   pre-conversion identity, keyword parsing, cross-system journey,
 *   date check data, questionnaire data.
 */

(function () {
  "use strict";

  // Respect Do Not Track
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

  var API_INIT = "/api/init";
  var API_TRACK = "/api/track";

  // State - populated after /api/init response
  var visitorId = null;
  var sessionId = null;
  var initDone = false;
  var eventQueue = [];

  // Get consent state from cookie
  function getConsent() {
    var m = document.cookie.match(/(?:^|;\s*)thk_consent=(\w+)/);
    return m ? m[1] : null;
  }

  // Read a named cookie value
  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Collect URL params + Meta cookies once
  function getParams() {
    var sp = new URLSearchParams(window.location.search);
    var p = {};
    var keys = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "wbraid", "gbraid",
      "hsa_cam", "hsa_kw", "hsa_mt",
      "ttclid", "msclkid", "li_fat_id"
    ];
    for (var i = 0; i < keys.length; i++) {
      var v = sp.get(keys[i]);
      if (v) p[keys[i]] = v;
    }
    // Meta cookies - set by Meta Pixel, needed for Conversions API
    var fbc = getCookie("_fbc");
    var fbp = getCookie("_fbp");
    if (fbc) p._fbc = fbc;
    if (fbp) p._fbp = fbp;
    return p;
  }

  // Send data - prefer sendBeacon, fallback to fetch keepalive
  function send(url, data) {
    var json = JSON.stringify(data);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([json], { type: "application/json" }));
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: true,
      }).catch(function () {});
    }
  }

  // Track an event - queues until init completes
  function track(eventType, eventData) {
    if (!initDone) {
      eventQueue.push({ type: eventType, data: eventData });
      return;
    }
    send(API_TRACK, {
      visitor_id: visitorId,
      session_id: sessionId,
      event_type: eventType,
      event_data: eventData || null,
      page_url: window.location.pathname,
    });
  }

  // Flush queued events after init
  function flushQueue() {
    for (var i = 0; i < eventQueue.length; i++) {
      track(eventQueue[i].type, eventQueue[i].data);
    }
    eventQueue = [];
  }

  // Initialise - call /api/init to get or create visitor + session
  function init() {
    var pageType = "general";
    if (window.dataLayer) {
      for (var i = 0; i < window.dataLayer.length; i++) {
        if (window.dataLayer[i].page_type) {
          pageType = window.dataLayer[i].page_type;
          break;
        }
      }
    }

    var payload = {
      page: window.location.pathname,
      referrer: document.referrer || "",
      params: getParams(),
      consent: getConsent(),
    };

    fetch(API_INIT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        visitorId = data.visitor_id;
        sessionId = data.session_id;
        initDone = true;

        // Track initial page view
        track("page_view", {
          path: window.location.pathname,
          title: document.title,
          page_type: pageType,
        });

        flushQueue();
      })
      .catch(function () {
        // Init failed - silently disable tracking for this page load
      });
  }

  // --- CTA click tracking ---
  // Listens for clicks on elements with data-track="cta"
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-track='cta']");
    if (!el) return;
    track("cta_click", {
      cta_id: el.getAttribute("data-track-id") || el.textContent.trim().slice(0, 80),
      cta_text: el.textContent.trim().slice(0, 80),
      destination: el.getAttribute("href") || null,
    });
  });

  // --- Scroll depth tracking ---
  // Fires at 25%, 50%, 75%, 100% milestones. Debounced to max 1 per 5 seconds.
  var scrollMilestones = {};
  var scrollThrottled = false;
  var SCROLL_DEBOUNCE = 5000;

  function checkScroll() {
    if (scrollThrottled) return;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    var pct = Math.round((window.scrollY / docHeight) * 100);
    var thresholds = [25, 50, 75, 100];
    for (var i = 0; i < thresholds.length; i++) {
      var t = thresholds[i];
      if (pct >= t && !scrollMilestones[t]) {
        scrollMilestones[t] = true;
        track("scroll_depth", {
          depth_percent: t,
          page: window.location.pathname,
        });
      }
    }
    scrollThrottled = true;
    setTimeout(function () { scrollThrottled = false; }, SCROLL_DEBOUNCE);
  }

  window.addEventListener("scroll", checkScroll, { passive: true });

  // --- Expose for other scripts (questionnaire, date checker) ---
  // Other components can call window.__thk.track('event_type', { data })
  window.__thk = {
    track: track,
    getVisitorId: function () { return visitorId; },
    getSessionId: function () { return sessionId; },
  };

  // Start
  init();
})();
