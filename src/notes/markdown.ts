// The small formatting language for notes. Each line is one of:
//   - [ ] task        - [x] done task      - item / * item (bullet)      text
// Inline: **bold**, *italic*, and bare http(s) links. Nothing else, so notes
// stay readable as plain text (and in Toby's export, if ever needed).

export type Block =
  | { type: 'task'; checked: boolean; text: string; line: number }
  | { type: 'bullet'; text: string; line: number }
  | { type: 'text'; text: string; line: number }
  | { type: 'blank'; line: number };

export function parseNote(note: string): Block[] {
  return note.split('\n').map((raw, line) => {
    const task = /^\s*[-*] \[( |x|X)\] ?(.*)$/.exec(raw);
    if (task) return { type: 'task', checked: task[1] !== ' ', text: task[2]!, line };
    const bullet = /^\s*[-*] (.*)$/.exec(raw);
    if (bullet) return { type: 'bullet', text: bullet[1]!, line };
    if (!raw.trim()) return { type: 'blank', line };
    return { type: 'text', text: raw, line };
  });
}

/** Flips the checkbox on one line, leaving every other character alone. */
export function toggleTask(note: string, line: number): string {
  const lines = note.split('\n');
  const l = lines[line];
  if (l === undefined) return note;
  lines[line] = l.replace(/\[( |x|X)\]/, (m) => (m === '[ ]' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

export type Inline = { type: 'text' | 'bold' | 'italic'; text: string } | { type: 'link'; text: string; href: string };

/** Splits a line into plain text, **bold**, *italic* and links. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(https?:\/\/[^\s<>"')\]]+)/g;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ type: 'bold', text: m[2] });
    else if (m[4] !== undefined) out.push({ type: 'italic', text: m[4] });
    else out.push({ type: 'link', text: m[5]!, href: m[5]! });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

export const taskCounts = (note: string) => {
  const tasks = parseNote(note).filter((b) => b.type === 'task');
  return { done: tasks.filter((t) => t.checked).length, total: tasks.length };
};
