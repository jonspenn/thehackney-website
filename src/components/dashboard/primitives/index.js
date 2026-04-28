/**
 * Dashboard primitives barrel.
 *
 * Reusable, stateless atoms used across every dashboard view (lead profile,
 * lead table, future pipeline / customers / bookings tabs). Each primitive
 * keeps the existing CSS class names so the consolidated rules in
 * src/pages/admin/dashboard/index.astro under "/* === Dashboard primitives ===" *\/
 * resolve identically.
 *
 * Usage:
 *   import {
 *     StagePill, ScoreRing, MetadataStrip, MetadataCell,
 *     AttributeRow, EyebrowLabel, SoftPill,
 *     ActivityTimelineRow, CardSurface,
 *   } from "./primitives";
 *
 * Profile-specific compositions (FunnelTrack, JourneySummary, EventDetailsColumn,
 * ScoreBreakdownColumn, ActivitySummaryColumn, IdentityStrip, dialogs) stay
 * inside the component file that owns them - they are not primitives.
 */

export { default as StagePill } from "./StagePill.jsx";
export { default as ScoreRing, resolveRingDisplay } from "./ScoreRing.jsx";
export { MetadataStrip, MetadataCell } from "./MetadataStrip.jsx";
export { default as AttributeRow } from "./AttributeRow.jsx";
export { default as EyebrowLabel } from "./EyebrowLabel.jsx";
export { default as SoftPill } from "./SoftPill.jsx";
export { default as ActivityTimelineRow } from "./ActivityTimelineRow.jsx";
export { MILESTONE_ICONS, MilestoneIcon } from "./activity-icons.jsx";
export { default as CardSurface } from "./CardSurface.jsx";
export { default as FunnelTrack } from "./FunnelTrack.jsx";
