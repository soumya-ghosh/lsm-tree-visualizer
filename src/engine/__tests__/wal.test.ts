import { describe, it, expect, beforeEach } from 'vitest';
import { WAL } from '../wal';

describe('WAL', () => {
  let wal: WAL;

  beforeEach(() => {
    wal = new WAL();
  });

  it('append adds entry with correct fields', () => {
    const entry = wal.append('put', 'k1', 'v1');
    expect(entry.operation).toBe('put');
    expect(entry.key).toBe('k1');
    expect(entry.value).toBe('v1');
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it('getEntries returns all entries in order', () => {
    wal.append('put', 'k1', 'v1');
    wal.append('put', 'k2', 'v2');
    wal.append('delete', 'k3', '');
    const entries = wal.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].key).toBe('k1');
    expect(entries[1].key).toBe('k2');
    expect(entries[2].key).toBe('k3');
  });

  it('getRecent(n) returns last n entries', () => {
    for (let i = 0; i < 5; i++) {
      wal.append('put', `k${i}`, `v${i}`);
    }
    const recent = wal.getRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].key).toBe('k3');
    expect(recent[1].key).toBe('k4');
  });

  it('clear empties the log', () => {
    wal.append('put', 'k1', 'v1');
    wal.append('put', 'k2', 'v2');
    wal.clear();
    expect(wal.size).toBe(0);
  });

  it('size tracks count', () => {
    wal.append('put', 'k1', 'v1');
    wal.append('put', 'k2', 'v2');
    wal.append('delete', 'k3', '');
    expect(wal.size).toBe(3);
  });
});
