/**
 * ActivityTimelineRow - One row in a vertical activity timeline. Renders an
 * iconised dot on a left rail, with title + right-aligned timestamp, plus
 * optional detail line and tinted detail box.
 *
 * Props:
 *   icon        string  milestone-kind key (looked up in MILESTONE_ICONS)
 *   title       string  primary copy (e.g. "Submitted brochure form")
 *   when        string  formatted timestamp (e.g. "Today 14:32")
 *   detail      string? secondary muted line (e.g. "via Bridebook")
 *   detailBox   string? Fired-Brick tinted block of italic copy
 *   kind        "default" | "warn"  reserved (warn icons set via MILESTONE_ICONS)
 *
 * Visual: 16px icon dot on a Warm-Canvas chip, vertical hairline rail at
 *   left, 14px gap to body. Title 13px DM Sans 500 Brewery Dark, timestamp
 *   11px tabular-nums Brewery Dark @ 60%.
 */

import { MilestoneIcon } from "./activity-icons.jsx";

export default function ActivityTimelineRow({ icon, title, when, detail, detailBox, kind = "default" }) {
  void kind;
  return (
    <div className="activity-mini__row">
      <MilestoneIcon kind={icon} />
      <div className="activity-mini__row-body">
        <div className="activity-mini__row-top">
          <div className="activity-mini__title">{title}</div>
          <div className="activity-mini__when">{when}</div>
        </div>
        {detail && <div className="activity-mini__detail">{detail}</div>}
        {detailBox && <div className="activity-mini__detail-box">{detailBox}</div>}
      </div>
    </div>
  );
}
