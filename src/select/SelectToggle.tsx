import { useSelection } from './selection';

/** "Select" in a view's toolbar: turns select mode on, or off again.
 *  Where the toolbar is narrow it shows only its icon (see .tb-btn in app.css);
 *  the text stays in the accessible name either way. */
export function SelectToggle() {
  const { active, start, stop } = useSelection();
  return (
    <button
      type="button"
      className={`select-toggle tb-btn ${active ? 'on' : ''}`}
      aria-pressed={active}
      title={active ? 'Done selecting' : 'Select collections and tabs'}
      onClick={active ? stop : start}
    >
      <span className="tb-icon" aria-hidden="true">
        {active ? '✓' : '☑︎'}
      </span>
      {active ? (
        <span className="tb-label">
          Done<span className="long-label"> selecting</span>
        </span>
      ) : (
        <span className="tb-label">Select</span>
      )}
    </button>
  );
}
