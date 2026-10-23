import { describe, expect, it } from 'vitest';
import {
  byPosition,
  initialPositions,
  positionAfterLast,
  positionAt,
  positionBeforeFirst,
  positionBetween,
  reorderPosition,
} from './position';

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

describe('reorderPosition', () => {
  const items = initialPositions(4).map((position, i) => ({ id: 'abcd'[i]!, position }));
  const order = (id: string, pos: string) =>
    items
      .map((i) => (i.id === id ? { ...i, position: pos } : i))
      .sort(byPosition)
      .map((i) => i.id)
      .join('');

  it('moving down lands after the target', () => {
    expect(order('a', reorderPosition(items, 'a', 'c')!)).toBe('bcad');
  });
  it('moving up lands before the target', () => {
    expect(order('d', reorderPosition(items, 'd', 'b')!)).toBe('adbc');
  });
  it('to the ends', () => {
    expect(order('a', reorderPosition(items, 'a', 'd')!)).toBe('bcda');
    expect(order('d', reorderPosition(items, 'd', 'a')!)).toBe('dabc');
  });
  it('no-op when dropped on itself or unknown ids', () => {
    expect(reorderPosition(items, 'a', 'a')).toBeNull();
    expect(reorderPosition(items, 'a', 'zz')).toBeNull();
  });
});

describe('positionAt', () => {
  it('inserts at index, clamped', () => {
    const s = initialPositions(2).map((position) => ({ position }));
    const k = positionAt(s, 1);
    expect(k > s[0]!.position && k < s[1]!.position).toBe(true);
    expect(positionAt(s, 99) > s[1]!.position).toBe(true);
    expect(positionAt(s, -5) < s[0]!.position).toBe(true);
  });
});
