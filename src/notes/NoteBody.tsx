import { parseInline, parseNote, toggleTask } from './markdown';

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.type === 'bold' ? (
          <strong key={i}>{part.text}</strong>
        ) : part.type === 'italic' ? (
          <em key={i}>{part.text}</em>
        ) : part.type === 'link' ? (
          <a key={i} href={part.href} target="_blank" rel="noreferrer" draggable={false}>
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** A note, formatted. Ticking a checkbox rewrites just that line of the note. */
export function NoteBody({ note, label, onChange }: { note: string; label: string; onChange: (next: string) => void }) {
  return (
    <div className="note-body">
      {parseNote(note).map((b) => {
        if (b.type === 'blank') return <div key={b.line} className="note-blank" />;
        if (b.type === 'task')
          return (
            <label key={b.line} className={`note-task ${b.checked ? 'done' : ''}`}>
              <input
                type="checkbox"
                checked={b.checked}
                aria-label={`${b.text || 'Task'} (${label})`}
                onChange={() => onChange(toggleTask(note, b.line))}
              />
              <span>
                <Inline text={b.text} />
              </span>
            </label>
          );
        if (b.type === 'bullet')
          return (
            <div key={b.line} className="note-bullet">
              <Inline text={b.text} />
            </div>
          );
        return (
          <p key={b.line} className="note-line">
            <Inline text={b.text} />
          </p>
        );
      })}
    </div>
  );
}
