/**
 * Inline SVG paths per milestone kind, used by ActivityTimelineRow. Stroke-
 * only, viewBox 0 0 20 20. Mahogany-tinted (warn) variants used for Lost /
 * Cancelled / No-show.
 *
 * Adding a new kind: append an entry here and the timeline will pick it up.
 */

import { Fragment } from "react";

export const MILESTONE_ICONS = {
  form_submit:               { paths: <Fragment><path d="M3 5h14v10H3z"/><path d="M3 5l7 6 7-6"/></Fragment> },
  cta_click:                 { paths: <Fragment><path d="M9 3l7 7-3 1 2 5-2 1-2-5-3 2z"/></Fragment> },
  date_check:                { paths: <Fragment><path d="M3 5h14v12H3z"/><path d="M3 8h14M7 3v4M13 3v4"/></Fragment> },
  brochure_download:         { paths: <Fragment><path d="M10 3v9M6 8l4 4 4-4M3 17h14"/></Fragment> },
  questionnaire_complete:    { paths: <Fragment><path d="M5 4h10v12H5z"/><path d="M7 8l1 1 2-2M7 12l1 1 2-2"/></Fragment> },
  questionnaire_start:       { paths: <Fragment><path d="M5 4h10v12H5z"/><path d="M7 8l1 1 2-2M7 12l1 1 2-2"/></Fragment> },
  first_visit:               { paths: <Fragment><path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2.5"/></Fragment> },
  meeting_at:                { paths: <Fragment><path d="M5 3h3l1 4-2 1a8 8 0 005 5l1-2 4 1v3a1 1 0 01-1 1A12 12 0 014 4a1 1 0 011-1z"/></Fragment> },
  call_at:                   { paths: <Fragment><path d="M5 3h3l1 4-2 1a8 8 0 005 5l1-2 4 1v3a1 1 0 01-1 1A12 12 0 014 4a1 1 0 011-1z"/></Fragment> },
  tour_at:                   { paths: <Fragment><path d="M10 2a5 5 0 015 5c0 4-5 11-5 11s-5-7-5-11a5 5 0 015-5z"/><circle cx="10" cy="7" r="2"/></Fragment> },
  proposal_at:               { paths: <Fragment><path d="M5 2h7l3 3v13H5z"/><path d="M12 2v3h3M7 9h6M7 12h6M7 15h4"/></Fragment> },
  won_at:                    { paths: <Fragment><circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/></Fragment> },
  lost_at:                   { paths: <Fragment><circle cx="10" cy="10" r="7"/><path d="M7 7l6 6M13 7l-6 6"/></Fragment>, warn: true },
  cancelled_at:              { paths: <Fragment><circle cx="10" cy="10" r="7"/><path d="M7 7l6 6M13 7l-6 6"/></Fragment>, warn: true },
  noshow_at:                 { paths: <Fragment><circle cx="10" cy="10" r="7"/><path d="M7 7l6 6M13 7l-6 6"/></Fragment>, warn: true },
};

export function MilestoneIcon({ kind }) {
  const cfg = MILESTONE_ICONS[kind];
  if (!cfg) {
    return (
      <span className="activity-mini__icon">
        <svg viewBox="0 0 20 20" fill="currentColor" stroke="none">
          <circle cx="10" cy="10" r="3.5" />
        </svg>
      </span>
    );
  }
  return (
    <span className={`activity-mini__icon${cfg.warn ? " activity-mini__icon--warn" : ""}`}>
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {cfg.paths}
      </svg>
    </span>
  );
}
