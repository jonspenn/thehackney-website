/**
 * SubModeToggle - pill-style segmented toggle for tab sub-modes.
 *
 * Used across the dashboard whenever a tab needs to swap between 2-4 modes
 * that filter the same data:
 *   Leads tab        Active / Lost (with counts)
 *   Website tab      Performance / Events
 *   Attribution tab  All time / Last 90d / Last 30d
 *
 * Renders the existing `.adm-leads-mode` chrome (defined in
 * src/pages/admin/dashboard/index.astro). Optional `count` per mode appears
 * as a Cormorant numeral after the label, picking up the active-state colour.
 *
 * Props:
 *   modes      array of { id, label, count?, onSelect? }. onSelect lets a
 *              consumer run mode-specific side-effects (URL persistence,
 *              cohort fetches) before the bare onChange callback.
 *   active     id of the currently active mode.
 *   onChange   (id) => void. Called when a mode is clicked. The optional
 *              per-mode onSelect runs first, then onChange.
 *   className  extra classes appended to the wrapper. Use "adm-website-sub"
 *              for the 18px-bottom-margin variant used by Website +
 *              Attribution sub-tabs.
 */
export default function SubModeToggle({ modes, active, onChange, className = "" }) {
  const cls = ["adm-leads-mode", className].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      {modes.map(m => {
        const isActive = m.id === active;
        const handleClick = () => {
          if (m.onSelect) m.onSelect(m.id);
          if (onChange) onChange(m.id);
        };
        return (
          <button
            key={m.id}
            type="button"
            className={`adm-leads-mode__btn${isActive ? " adm-leads-mode__btn--active" : ""}`}
            onClick={handleClick}
          >
            {m.label}
            {m.count != null && <span className="adm-leads-mode__count">{m.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
