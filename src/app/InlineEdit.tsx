import { useEffect, useRef, useState } from 'react';

/**
 * Text that turns into an input on click. Enter or blur saves, Escape
 * cancels. Empty values are rejected unless `allowEmpty`.
 */
export function InlineEdit({
  value,
  onSave,
  label,
  className,
  placeholder,
  allowEmpty = false,
  startEditing = false,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  startEditing?: boolean;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    const v = draft.trim();
    if (v !== value && (v || allowEmpty)) onSave(v);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`inline-edit ${className ?? ''}`}
        aria-label={`${label}: ${value || placeholder || ''}. Click to edit`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || <span className="muted">{placeholder}</span>}
      </button>
    );
  }
  return (
    <input
      ref={input}
      className={`inline-edit-input ${className ?? ''}`}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}
