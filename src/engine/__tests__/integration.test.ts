import { describe, it, expect, beforeEach } from 'vitest';
import { LSMTree } from '../lsm-tree';
import { resetSSTCounter } from '../sstable';

describe('Integration tests', () => {
  beforeEach(() => {
    resetSSTCounter();
  });

  it('full write-flush-compact cycle', () => {
    const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 4 });
    const keys: string[] = [];
    for (let i = 0; i < 20; i++) {
      const k = `key-${String(i).padStart(3, '0')}`;
      tree.put(k, `val-${i}`);
      keys.push(k);
    }
    const snap = tree.getSnapshot();
    expect(snap.memtable.length).toBeLessThan(4);
    expect(snap.levels[0].length).toBeLessThan(4);
    // All keys must be retrievable
    for (const k of keys) {
      expect(tree.get(k).found).toBe(true);
    }
  });

  it('overwrite consistency', () => {
    const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 4 });
    tree.put('k', 'v1');
    tree.flush();
    tree.put('k', 'v2');
    tree.flush();
    // Fill enough to trigger compaction
    for (let i = 0; i < 10; i++) tree.put(`pad${i}`, `p${i}`);
    expect(tree.get('k').value).toBe('v2');
  });

  it('delete consistency across compaction', () => {
    const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
    tree.put('k', 'v');
    tree.put('pad1', 'x'); // flush
    tree.delete('k');
    tree.put('pad2', 'y'); // flush + compact
    expect(tree.get('k').found).toBe(false);
  });

  it('size-tiered strategy', () => {
    const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 4, compactionStrategy: 'size-tiered' });
    const keys: string[] = [];
    for (let i = 0; i < 20; i++) {
      const k = `key-${String(i).padStart(3, '0')}`;
      tree.put(k, `val-${i}`);
      keys.push(k);
    }
    const snap = tree.getSnapshot();
    // Size-tiered produces single SSTables per compaction
    for (let lvl = 1; lvl < snap.levels.length; lvl++) {
      if (snap.levels[lvl].length > 0) {
        expect(snap.levels[lvl].length).toBeLessThanOrEqual(snap.config.l0CompactionTrigger);
      }
    }
    for (const k of keys) {
      expect(tree.get(k).found).toBe(true);
    }
  });

  it('config hot-swap', () => {
    const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 4, compactionStrategy: 'leveled' });
    const keys: string[] = [];
    for (let i = 0; i < 10; i++) {
      const k = `key-${String(i).padStart(3, '0')}`;
      tree.put(k, `val-${i}`);
      keys.push(k);
    }
    tree.updateConfig({ compactionStrategy: 'size-tiered' });
    for (let i = 10; i < 20; i++) {
      const k = `key-${String(i).padStart(3, '0')}`;
      tree.put(k, `val-${i}`);
      keys.push(k);
    }
    for (const k of keys) {
      expect(tree.get(k).found).toBe(true);
    }
  });

  it('bulk insert stress', () => {
    const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 2 });
    const expected = new Map<string, string>();
    for (let i = 0; i < 100; i++) {
      const k = `key-${String(i).padStart(4, '0')}`;
      const v = `val-${i}`;
      tree.put(k, v);
      expected.set(k, v);
    }
    for (const [k, v] of expected) {
      const result = tree.get(k);
      expect(result.found).toBe(true);
      expect(result.value).toBe(v);
    }
    const snap = tree.getSnapshot();
    const deepLevels = snap.levels.filter((l) => l.length > 0);
    expect(deepLevels.length).toBeGreaterThanOrEqual(2);
  });

  it('read path correctness: most recent value wins across levels', () => {
    const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
    // Put key in L1 via flush+compact
    tree.put('k', 'v1');
    tree.put('pad1', 'x');
    tree.put('pad2', 'y');
    tree.put('pad3', 'z');
    // Now put newer value in memtable
    tree.put('k', 'v2');
    expect(tree.get('k').value).toBe('v2');
    // Flush to L0
    tree.put('pad4', 'w');
    expect(tree.get('k').value).toBe('v2');
  });

  it('WAL records all writes', () => {
    const tree = new LSMTree();
    for (let i = 0; i < 50; i++) {
      tree.put(`k${i}`, `v${i}`);
    }
    const snap = tree.getSnapshot();
    // WAL getRecent(20) returns last 20
    expect(snap.wal.length).toBeLessThanOrEqual(20);
    expect(snap.wal.length).toBe(20);
    // Most recent entry should be k49
    expect(snap.wal[snap.wal.length - 1].key).toBe('k49');
  });
});
