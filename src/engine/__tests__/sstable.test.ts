import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSSTable,
  mergeEntries,
  hasOverlap,
  resetSSTCounter,
} from '../sstable';
import type { KeyValue, SSTableMeta } from '../types';

function kv(key: string, value: string, timestamp: number, deleted = false): KeyValue {
  return { key, value, timestamp, deleted };
}

describe('SSTable utilities', () => {
  beforeEach(() => {
    resetSSTCounter();
  });

  it('createSSTable sorts entries by key', () => {
    const sst = createSSTable(0, [kv('c', 'v3', 1), kv('a', 'v1', 2), kv('b', 'v2', 3)]);
    expect(sst.entries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
  });

  it('createSSTable sets correct minKey/maxKey', () => {
    const sst = createSSTable(0, [kv('c', 'v3', 1), kv('a', 'v1', 2), kv('b', 'v2', 3)]);
    expect(sst.minKey).toBe('a');
    expect(sst.maxKey).toBe('c');
  });

  it('createSSTable sets size to entry count', () => {
    const sst = createSSTable(0, [kv('a', '1', 1), kv('b', '2', 2), kv('c', '3', 3)]);
    expect(sst.size).toBe(3);
  });

  it('createSSTable assigns incrementing IDs with level suffix', () => {
    const sst1 = createSSTable(0, [kv('a', '1', 1)]);
    const sst2 = createSSTable(0, [kv('b', '2', 2)]);
    expect(sst1.id).toContain('L0');
    expect(sst2.id).toContain('L0');
    const num1 = parseInt(sst1.id.split('-')[1]);
    const num2 = parseInt(sst2.id.split('-')[1]);
    expect(num2).toBeGreaterThan(num1);
  });

  it('resetSSTCounter resets IDs', () => {
    createSSTable(0, [kv('a', '1', 1)]);
    resetSSTCounter();
    const sst = createSSTable(1, [kv('b', '2', 2)]);
    expect(sst.id).toBe('sst-1-L1');
  });

  it('mergeEntries keeps newest value per key', () => {
    const sst1 = createSSTable(0, [kv('a', 'old', 100)]);
    const sst2 = createSSTable(0, [kv('a', 'new', 200)]);
    const merged = mergeEntries([sst1, sst2]);
    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe('new');
  });

  it('mergeEntries drops tombstones', () => {
    const sst1 = createSSTable(0, [kv('a', 'v1', 100)]);
    const sst2 = createSSTable(0, [kv('a', '', 200, true)]);
    const merged = mergeEntries([sst1, sst2]);
    expect(merged).toHaveLength(0);
  });

  it('mergeEntries returns sorted output', () => {
    const sst1 = createSSTable(0, [kv('c', 'v3', 1), kv('a', 'v1', 2)]);
    const sst2 = createSSTable(0, [kv('d', 'v4', 3), kv('b', 'v2', 4)]);
    const merged = mergeEntries([sst1, sst2]);
    expect(merged.map((e) => e.key)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('mergeEntries with non-overlapping tables', () => {
    const sst1 = createSSTable(0, [kv('a', 'v1', 1), kv('b', 'v2', 2)]);
    const sst2 = createSSTable(0, [kv('x', 'v3', 3), kv('y', 'v4', 4)]);
    const merged = mergeEntries([sst1, sst2]);
    expect(merged).toHaveLength(4);
    expect(merged.map((e) => e.key)).toEqual(['a', 'b', 'x', 'y']);
  });

  it('hasOverlap returns true for overlapping ranges', () => {
    const a = createSSTable(0, [kv('a', '1', 1), kv('d', '4', 4)]);
    const b = createSSTable(0, [kv('c', '3', 3), kv('f', '6', 6)]);
    expect(hasOverlap(a, b)).toBe(true);
  });

  it('hasOverlap returns false for disjoint ranges', () => {
    const a = createSSTable(0, [kv('a', '1', 1), kv('b', '2', 2)]);
    const b = createSSTable(0, [kv('d', '4', 4), kv('f', '6', 6)]);
    expect(hasOverlap(a, b)).toBe(false);
  });

  it('hasOverlap returns true for exact boundary touch', () => {
    const a = createSSTable(0, [kv('a', '1', 1), kv('c', '3', 3)]);
    const b = createSSTable(0, [kv('c', '3', 3), kv('f', '6', 6)]);
    expect(hasOverlap(a, b)).toBe(true);
  });
});
