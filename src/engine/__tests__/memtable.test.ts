import { describe, it, expect, beforeEach } from 'vitest';
import { MemTable } from '../memtable';

describe('MemTable', () => {
  let mt: MemTable;

  beforeEach(() => {
    mt = new MemTable();
  });

  it('put and get a single key', () => {
    mt.put('k1', 'v1', 1000);
    const result = mt.get('k1');
    expect(result).toBeDefined();
    expect(result!.key).toBe('k1');
    expect(result!.value).toBe('v1');
    expect(result!.timestamp).toBe(1000);
    expect(result!.deleted).toBe(false);
  });

  it('put overwrites existing key', () => {
    mt.put('k1', 'v1', 1000);
    mt.put('k1', 'v2', 2000);
    const result = mt.get('k1');
    expect(result!.value).toBe('v2');
    expect(result!.timestamp).toBe(2000);
    expect(mt.size).toBe(1);
  });

  it('get returns undefined for missing key', () => {
    expect(mt.get('nonexistent')).toBeUndefined();
  });

  it('put with deleted=true stores tombstone', () => {
    mt.put('k1', '', 1000, true);
    const result = mt.get('k1');
    expect(result).toBeDefined();
    expect(result!.deleted).toBe(true);
    expect(result!.value).toBe('');
  });

  it('size reflects unique keys', () => {
    mt.put('a', 'v1', 1);
    mt.put('b', 'v2', 2);
    mt.put('c', 'v3', 3);
    expect(mt.size).toBe(3);
    mt.put('a', 'v4', 4);
    expect(mt.size).toBe(3);
  });

  it('getSorted returns alphabetical order', () => {
    mt.put('c', 'v3', 3);
    mt.put('a', 'v1', 1);
    mt.put('b', 'v2', 2);
    const sorted = mt.getSorted();
    expect(sorted.map((e) => e.key)).toEqual(['a', 'b', 'c']);
  });

  it('clear empties the table', () => {
    mt.put('k1', 'v1', 1);
    mt.put('k2', 'v2', 2);
    mt.clear();
    expect(mt.size).toBe(0);
    expect(mt.get('k1')).toBeUndefined();
  });

  it('entries returns all values', () => {
    mt.put('a', 'v1', 1);
    mt.put('b', 'v2', 2);
    mt.put('c', 'v3', 3);
    expect(mt.entries()).toHaveLength(3);
  });
});
