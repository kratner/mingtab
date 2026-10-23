import { describe, expect, it } from 'vitest';
import { parseInline, parseNote, taskCounts, toggleTask } from './markdown';

const note = ['Launch checklist', '- [ ] write post', '- [x] **record** demo', '* bullet', '', 'see https://example.com/a)'].join('\n');

describe('notes', () => {
  it('parses tasks, bullets, text and blanks with their line numbers', () => {
    expect(parseNote(note).map((b) => `${b.type}@${b.line}`)).toEqual(['text@0', 'task@1', 'task@2', 'bullet@3', 'blank@4', 'text@5']);
    expect(parseNote(note)[2]).toMatchObject({ checked: true, text: '**record** demo' });
  });
  it('toggles exactly one checkbox and nothing else', () => {
    const once = toggleTask(note, 1);
    expect(once.split('\n')[1]).toBe('- [x] write post');
    expect(toggleTask(once, 1)).toBe(note);
    expect(toggleTask(note, 99)).toBe(note);
  });
  it('counts tasks', () => {
    expect(taskCounts(note)).toEqual({ done: 1, total: 2 });
  });
  it('finds bold, italic and links; a closing bracket is not part of a link', () => {
    expect(parseInline('a **b** *c* https://x.example/p) d')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'b' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'https://x.example/p', href: 'https://x.example/p' },
      { type: 'text', text: ') d' },
    ]);
    expect(parseInline('javascript:alert(1)')).toEqual([{ type: 'text', text: 'javascript:alert(1)' }]);
  });
});
