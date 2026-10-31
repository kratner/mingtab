import { useSelection } from './selection';

/** "Select" in a view's toolbar: turns select mode on, or off again. */
export function SelectToggle() {
  const { active, start, stop } = useSelection();
  return (
    <button type="button" className={`select-toggle ${active ? 'on' : ''}`} aria-pressed={active} onClick={active ? stop : start}>
      {active ? (
        <>
          Done<span className="long-label"> selecting</span>
        </>
      ) : (
        'Select'
      )}
    </button>
  );
}
