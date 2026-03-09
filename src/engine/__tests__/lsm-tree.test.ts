import { describe, it, expect, beforeEach } from 'vitest';
import { LSMTree } from '../lsm-tree';
import { resetSSTCounter } from '../sstable';

describe('LSMTree', () => {
  let tree: LSMTree;

  beforeEach(() => {
    resetSSTCounter();
    tree = new LSMTree();
  });

  // ── Put / Write path ──────────────────────────────────────

  describe('put', () => {
    it('adds key to memtable', () => {
      tree.put('k', 'v');
      const snap = tree.getSnapshot();
      expect(snap.memtable.find((e) => e.key === 'k')).toBeDefined();
    });

    it('appends to WAL', () => {
      tree.put('k', 'v');
      const snap = tree.getSnapshot();
      expect(snap.wal.some((e) => e.operation === 'put' && e.key === 'k')).toBe(true);
    });

    it('returns event with type put', () => {
      const events = tree.put('k', 'v');
      expect(events[0].type).toBe('put');
      expect(events[0].details.key).toBe('k');
      expect(events[0].details.value).toBe('v');
    });

    it('increments stats.totalPuts', () => {
      tree.put('a', '1');
      tree.put('b', '2');
      tree.put('c', '3');
      expect(tree.getSnapshot().stats.totalPuts).toBe(3);
    });

    it('auto-flushes when memtable reaches max size', () => {
      tree = new LSMTree({ memtableMaxSize: 4 });
      for (let i = 0; i < 4; i++) tree.put(`k${i}`, `v${i}`);
      const snap = tree.getSnapshot();
      expect(snap.memtable).toHaveLength(0);
      expect(snap.levels[0].length).toBe(1);
    });

    it('auto-flush emits flush event', () => {
      tree = new LSMTree({ memtableMaxSize: 4 });
      let allEvents: ReturnType<typeof tree.put> = [];
      for (let i = 0; i < 4; i++) allEvents = tree.put(`k${i}`, `v${i}`);
      expect(allEvents.some((e) => e.type === 'flush')).toBe(true);
    });

    it('multiple flushes accumulate L0 SSTables', () => {
      tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 100 });
      for (let i = 0; i < 8; i++) tree.put(`k${i}`, `v${i}`);
      expect(tree.getSnapshot().levels[0].length).toBe(2);
    });
  });

  // ── Get / Read path ───────────────────────────────────────

  describe('get', () => {
    it('finds key in memtable', () => {
      tree.put('k', 'v');
      const result = tree.get('k');
      expect(result.found).toBe(true);
      expect(result.value).toBe('v');
      expect(result.path).toEqual(['memtable']);
    });

    it('finds key in L0 SSTable after flush', () => {
      tree.put('k', 'v');
      tree.flush();
      const result = tree.get('k');
      expect(result.found).toBe(true);
      expect(result.value).toBe('v');
      expect(result.path.length).toBeGreaterThan(1);
      expect(result.path[0]).toBe('memtable');
    });

    it('returns found:false for missing key', () => {
      const result = tree.get('nope');
      expect(result.found).toBe(false);
      expect(result.value).toBeNull();
    });

    it('returns latest value (memtable over SST)', () => {
      tree.put('k', 'v1');
      tree.flush();
      tree.put('k', 'v2');
      const result = tree.get('k');
      expect(result.value).toBe('v2');
      expect(result.path).toEqual(['memtable']);
    });

    it('searches L0 newest-first', () => {
      tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 100 });
      tree.put('k', 'v1');
      tree.put('x', 'pad'); // triggers flush
      tree.put('k', 'v2');
      tree.put('y', 'pad'); // triggers another flush
      const result = tree.get('k');
      expect(result.found).toBe(true);
      expect(result.value).toBe('v2');
    });

    it('increments stats.totalGets', () => {
      tree.get('a');
      tree.get('b');
      expect(tree.getSnapshot().stats.totalGets).toBe(2);
    });

    it('returns events including get and get-result', () => {
      tree.put('k', 'v');
      const result = tree.get('k');
      expect(result.events.some((e) => e.type === 'get')).toBe(true);
      expect(result.events.some((e) => e.type === 'get-result')).toBe(true);
    });
  });

  // ── Delete ────────────────────────────────────────────────

  describe('delete', () => {
    it('makes subsequent get return found:false', () => {
      tree.put('k', 'v');
      tree.delete('k');
      expect(tree.get('k').found).toBe(false);
    });

    it('stores tombstone in memtable', () => {
      tree.delete('k');
      const snap = tree.getSnapshot();
      const entry = snap.memtable.find((e) => e.key === 'k');
      expect(entry).toBeDefined();
      expect(entry!.deleted).toBe(true);
    });

    it('tombstone survives flush and masks old value', () => {
      tree.put('k', 'v');
      tree.flush();
      tree.delete('k');
      tree.flush();
      expect(tree.get('k').found).toBe(false);
    });

    it('increments stats.totalDeletes', () => {
      tree.delete('a');
      tree.delete('b');
      expect(tree.getSnapshot().stats.totalDeletes).toBe(2);
    });
  });

  // ── Flush ─────────────────────────────────────────────────

  describe('flush', () => {
    it('on empty memtable returns []', () => {
      const events = tree.flush();
      expect(events).toHaveLength(0);
    });

    it('clears memtable', () => {
      tree.put('k', 'v');
      tree.flush();
      expect(tree.getSnapshot().memtable).toHaveLength(0);
    });

    it('creates L0 SSTable with sorted entries', () => {
      tree.put('c', '3');
      tree.put('a', '1');
      tree.put('b', '2');
      tree.flush();
      const sst = tree.getSnapshot().levels[0][0];
      expect(sst.entries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
    });

    it('increments stats.totalFlushes', () => {
      tree.put('k', 'v');
      tree.flush();
      expect(tree.getSnapshot().stats.totalFlushes).toBe(1);
    });
  });

  // ── Compaction (integration via LSMTree) ──────────────────

  describe('compaction', () => {
    it('auto-compaction fires when L0 reaches trigger', () => {
      tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      for (let i = 0; i < 4; i++) tree.put(`k${i}`, `v${i}`);
      const snap = tree.getSnapshot();
      expect(snap.levels[0].length).toBeLessThan(2);
      expect(snap.levels[1].length).toBeGreaterThan(0);
    });

    it('compaction event is emitted', () => {
      tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      let allEvents: ReturnType<typeof tree.put> = [];
      for (let i = 0; i < 4; i++) {
        allEvents.push(...tree.put(`k${i}`, `v${i}`));
      }
      expect(allEvents.some((e) => e.type === 'compaction')).toBe(true);
    });

    it('stats.totalCompactions increments', () => {
      tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      for (let i = 0; i < 4; i++) tree.put(`k${i}`, `v${i}`);
      expect(tree.getSnapshot().stats.totalCompactions).toBeGreaterThan(0);
    });

    it('cascading compaction works', () => {
      tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2, levelMultiplier: 2 });
      for (let i = 0; i < 30; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      const snap = tree.getSnapshot();
      const deepLevels = snap.levels.filter((l) => l.length > 0);
      expect(deepLevels.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Config and Reset ──────────────────────────────────────

  describe('config and reset', () => {
    it('updateConfig changes behavior', () => {
      tree.updateConfig({ memtableMaxSize: 16 });
      for (let i = 0; i < 10; i++) tree.put(`k${i}`, `v${i}`);
      expect(tree.getSnapshot().memtable.length).toBe(10);
    });

    it('updateConfig expands levels array if maxLevels increases', () => {
      tree.updateConfig({ maxLevels: 7 });
      expect(tree.getSnapshot().levels.length).toBeGreaterThanOrEqual(7);
    });

    it('reset clears all state', () => {
      for (let i = 0; i < 10; i++) tree.put(`k${i}`, `v${i}`);
      tree.flush();
      tree.reset();
      const snap = tree.getSnapshot();
      expect(snap.memtable).toHaveLength(0);
      expect(snap.levels.every((l) => l.length === 0)).toBe(true);
      expect(snap.stats.totalPuts).toBe(0);
    });

    it('reset with custom config applies it', () => {
      tree.reset({ memtableMaxSize: 16 });
      expect(tree.getSnapshot().config.memtableMaxSize).toBe(16);
    });
  });

  // ── Snapshot ──────────────────────────────────────────────

  describe('snapshot', () => {
    it('getSnapshot returns immutable copy', () => {
      tree.put('k', 'v');
      const snap = tree.getSnapshot();
      snap.memtable.push({ key: 'injected', value: 'bad', timestamp: 0 });
      expect(tree.getSnapshot().memtable.find((e) => e.key === 'injected')).toBeUndefined();
    });

    it('snapshot config matches current config', () => {
      tree.updateConfig({ levelMultiplier: 8 });
      expect(tree.getSnapshot().config.levelMultiplier).toBe(8);
    });
  });

  // ── Amplification Metrics ─────────────────────────────────

  describe('amplification', () => {
    it('write amplification increases after flush', () => {
      tree.put('k', 'v');
      tree.flush();
      expect(tree.getSnapshot().stats.writeAmplification).toBeGreaterThan(0);
    });

    it('read amplification accounts for levels', () => {
      tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 100 });
      for (let i = 0; i < 4; i++) tree.put(`k${i}`, `v${i}`);
      expect(tree.getSnapshot().stats.readAmplification).toBeGreaterThan(1);
    });
  });
});
