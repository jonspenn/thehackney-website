/**
 * Dashboard constants - labels, configs, tier settings.
 * Shared across all dashboard sub-components.
 */

export const FORM_TYPE_LABELS = {
  "wedding-quiz": "Wedding Questionnaire",
  "corporate-quiz": "Corporate Questionnaire",
  "brochure-download": "Brochure Download",
  "brochure-wedding": "Wedding Brochure",
  "brochure-corporate": "Corporate Brochure",
  "brochure-private-events": "Private Events Brochure",
  "brochure-supper-club": "Supper Club Brochure",
  "supperclub-signup": "Supper Club Signup",
};

export const BROCHURE_TYPE_LABELS = {
  wedding: "Wedding",
  corporate: "Corporate",
  "private-events": "Private Events",
  "supper-club": "Supper Club",
};

export const LEAD_TYPE_LABELS = {
  wedding: "Wedding",
  corporate: "Corporate",
  supperclub: "Supper Club",
  "private-events": "Private Events",
};

export const URGENCY_LABELS = {
  browsing: "1 \u00B7 Browsing",
  comparing: "2 \u00B7 Shortlisting",
  ready: "3 \u00B7 Ready to book",
  asap: "4 \u00B7 Urgent",
};
export const URGENCY_STAGE = { browsing: 1, comparing: 2, ready: 3, asap: 4, _default: 0 };

export const BUDGET_LABELS = {
  "under-5k": "Under \u00A35K",
  "5k-10k": "\u00A35K - \u00A310K",
  "10k-20k": "\u00A310K - \u00A320K",
  "20k-plus": "\u00A320K+",
};

export const EVENT_TYPE_DISPLAY = {
  "photo-film": "Photo/Film Shoot",
  "team-building": "Team Building",
  conference: "Conference",
  meeting: "Meeting",
  "product-launch": "Product Launch",
  "christmas-party": "Christmas Party",
  "summer-party": "Summer Party",
  other: "Other",
};

export const EVENT_TYPE_LABELS = {
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

export const JOURNEY_EVENT_LABELS = {
  page_view: "Viewed",
  cta_click: "Clicked CTA",
  date_check: "Checked date",
  scroll_depth: "Scrolled",
  questionnaire_start: "Started questionnaire",
  questionnaire_step: "Questionnaire step",
  questionnaire_complete: "Completed questionnaire",
  questionnaire_abandon: "Left questionnaire",
  form_submit: "Submitted form",
  brochure_download: "Downloaded brochure",
};

export const DAY_LABELS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_LABELS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ── Lead scoring ── */

export const DEAD_DAYS = { wedding: 21, corporate: 14, supperclub: 10, "private-events": 10, "cafe-bar": 10 };

export const TIER_CONFIG = {
  hot:  { label: "Hot",  color: "#8C472E", bg: "rgba(140,71,46,0.08)", border: "#8C472E" },
  warm: { label: "Warm", color: "#BF7256", bg: "rgba(191,114,86,0.06)", border: "#BF7256" },
  cool: { label: "Cool", color: "#2E4009", bg: "rgba(46,64,9,0.05)",   border: "#2E4009" },
  cold: { label: "Cold", color: "rgba(44,24,16,0.35)", bg: "transparent", border: "rgba(44,24,16,0.15)" },
};

export const STAGE_SEQUENCE = ["Brochure", "Quiz", "Call", "Tour"];

/* ── Funnel lifecycle ── */

export const FUNNEL_STAGES = {
  wedding:          ["lead", "qualified", "engaged", "call", "tour", "proposal", "won"],
  corporate:        ["lead", "qualified", "engaged", "call", "tour", "proposal", "won"],
  "private-events": ["lead", "qualified", "engaged", "call", "tour", "proposal", "won"],
  supperclub:       ["signup", "engaged", "booked", "attended"],
  "cafe-bar":       ["signup", "engaged", "return"],
};

export const FUNNEL_LABELS = {
  lead: "Lead", qualified: "Qualified", engaged: "Engaged",
  call: "Call", tour: "Tour", proposal: "Proposal", won: "Won",
  meeting: "Meeting", /* legacy - kept for backward compat */
  lost: "Lost", cancelled: "Cancelled", noshow: "No-show",
  signup: "Signup", booked: "Booked", attended: "Attended", return: "Return",
};

export const STAGE_DEFINITIONS = {
  lead: "Downloaded a brochure or submitted a contact form",
  qualified: "Completed the wedding or event quiz",
  engaged: "Clicked to book a discovery call or venue tour",
  call: "Had a discovery call with Hugo",
  tour: "Had a venue tour at The Hackney",
  proposal: "Hugo has sent a proposal - waiting on their decision",
  won: "Booked - deposit received and date confirmed",
  lost: "Did not proceed - see lost reason below",
  cancelled: "Tour or call was booked but cancelled before it happened",
  noshow: "Tour or call was booked but they didn't show up",
  signup: "Signed up via the website",
  booked: "Booked a ticket or reservation",
  attended: "Attended the event",
  return: "Came back for another visit",
};

export const HEALTH_THRESHOLDS = {
  wedding: {
    lead:      [7, 14],
    qualified: [3, 7],
    engaged:   [5, 10],
    call:      [2, 5],
    tour:      [3, 7],
    proposal:  [7, 14],
  },
  corporate: {
    lead:      [3, 7],
    qualified: [2, 5],
    engaged:   [3, 7],
    call:      [1, 3],
    tour:      [2, 5],
    proposal:  [5, 10],
  },
  "private-events": {
    lead:      [5, 10],
    qualified: [3, 7],
    engaged:   [5, 10],
    call:      [2, 5],
    tour:      [3, 7],
    proposal:  [7, 14],
  },
  supperclub: {
    signup:  [14, 30],
    engaged: [7, 14],
    booked:  [3, 7],
  },
  "cafe-bar": {
    signup:  [14, 30],
    engaged: [7, 14],
  },
};

export const HEALTH_COLORS = {
  green:  { color: "#2E4009", bg: "rgba(46,64,9,0.12)", label: "On track" },
  amber:  { color: "#BF7256", bg: "rgba(191,114,86,0.12)", label: "Slowing" },
  red:    { color: "#8C472E", bg: "rgba(140,71,46,0.15)", label: "Stuck" },
};

/* ── Source channel mapping ── */

export const SOURCE_MAP = [
  { match: /google/i,     label: "Google",    color: "#49590E", bg: "rgba(73,89,14,0.08)" },
  { match: /meta|facebook|instagram|fb/i, label: "Meta", color: "#8C472E", bg: "rgba(140,71,46,0.1)" },
  { match: /pinterest/i,  label: "Pinterest", color: "#8C472E", bg: "rgba(140,71,46,0.08)" },
  { match: /hitched/i,    label: "Hitched",   color: "#49590E", bg: "rgba(73,89,14,0.06)" },
  { match: /bridebook/i,  label: "Bridebook", color: "#49590E", bg: "rgba(73,89,14,0.06)" },
  { match: /tiktok/i,     label: "TikTok",    color: "#2C1810", bg: "rgba(44,24,16,0.06)" },
  { match: /bing|microsoft/i, label: "Bing",  color: "#2C1810", bg: "rgba(44,24,16,0.06)" },
];

/* ── Lost reasons ── */

export const LOST_REASONS = [
  { value: "booked_elsewhere", label: "Booked elsewhere" },
  { value: "budget", label: "Budget" },
  { value: "date_unavailable", label: "Date unavailable" },
  { value: "changed_plans", label: "Changed plans" },
  { value: "no_response", label: "No response" },
  { value: "not_a_fit", label: "Not a fit" },
  { value: "other", label: "Other" },
];

export const DAY_TYPE_LABELS = {
  sat: "Saturday",
  fri: "Friday",
  "sun-thu": "Sun - Thu",
  "dec-wed-fri": "Dec Wed - Fri",
  "dec-mon-tue": "Dec Mon - Tue",
};

/* ── Lead tab config ── */

export const LEAD_TABS = [
  { type: "wedding", label: "Wedding" },
  { type: "corporate", label: "Corporate" },
  { type: "supperclub", label: "Supper Club" },
  { type: "private-events", label: "Private Events" },
  { type: "cafe-bar", label: "Cafe-Bar" },
];
