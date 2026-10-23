import { describe, expect, it } from 'vitest';
import { byPosition, initialPositions, positionAfterLast, positionBeforeFirst, positionBetween } from './position';

describe('positions', () => {
  it('initial keys ascend', () => {
    const keys = initialPositions(50);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(50);
  });

  it('after-last and before-first bracket existing items', () => {
    const items = initialPositions(3).map((position) => ({ position }));
    expect(positionAfterLast(items) > items[2]!.position).toBe(true);
    expect(positionBeforeFirst(items) < items[0]!.position).toBe(true);
    expect(positionAfterLast([])).toBeTypeOf('string');
  });

  it('stays ordered after many random inserts', () => {
    const items = initialPositions(5).map((position, i) => ({ position, label: i }));
    for (let n = 0; n < 200; n++) {
      items.sort(byPosition);
      const at = Math.floor(Math.random() * (items.length + 1));
      const before = items[at - 1]?.position ?? null;
      const after = items[at]?.position ?? null;
      items.splice(at, 0, { position: positionBetween(before, after), label: 100 + n });
    }
    const sorted = [...items].sort(byPosition);
    expect(sorted.map((i) => i.position)).toEqual(items.map((i) => i.position));
    expect(new Set(items.map((i) => i.position)).size).toBe(items.length);
  });
});
