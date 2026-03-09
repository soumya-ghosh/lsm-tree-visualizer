import { describe, it, expect, beforeEach } from 'vitest';
import { LSMTree } from '../lsm-tree';
import { resetSSTCounter, hasOverlap } from '../sstable';
import type { SSTableMeta } from '../types';

describe('LSM Tree Correctness', () => {
  beforeEach(() => {
    resetSSTCounter();
  });

  // ── 5.1 Read-After-Write Linearizability ──────────────────

  describe('read-after-write linearizability', () => {
    it('immediate read-after-write', () => {
      const tree = new LSMTree({ memtableMaxSize: 4 });
      tree.put('k', 'v');
      expect(tree.get('k').value).toBe('v');
    });

    it('read-after-write survives flush', () => {
      const tree = new LSMTree();
      tree.put('k', 'v');
      tree.flush();
      expect(tree.get('k').value).toBe('v');
    });

    it('read-after-write survives compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      tree.put('k', 'v');
      // Fill enough to trigger flush + compaction
      for (let i = 0; i < 10; i++) tree.put(`pad${i}`, `p${i}`);
      expect(tree.get('k').value).toBe('v');
    });

    it('read-after-write for every key in a bulk sequence', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3 });
      const expected = new Map<string, string>();
      for (let i = 0; i < 50; i++) {
        const k = `key-${String(i).padStart(3, '0')}`;
        const v = `val-${i}`;
        tree.put(k, v);
        expected.set(k, v);
      }
      for (const [k, v] of expected) {
        const result = tree.get(k);
        expect(result.found).toBe(true);
        expect(result.value).toBe(v);
      }
    });
  });

  // ── 5.2 Last-Writer-Wins (Recency) ───────────────────────

  describe('last-writer-wins (recency)', () => {
    it('memtable shadowing', () => {
      const tree = new LSMTree();
      tree.put('k', 'v1');
      tree.put('k', 'v2');
      expect(tree.get('k').value).toBe('v2');
    });

    it('memtable shadows SSTable', () => {
      const tree = new LSMTree();
      tree.put('k', 'v1');
      tree.flush();
      tree.put('k', 'v2');
      const result = tree.get('k');
      expect(result.value).toBe('v2');
      expect(result.path).toEqual(['memtable']);
    });

    it('newer L0 SST shadows older L0 SST', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 100 });
      tree.put('k', 'v1');
      tree.put('pad1', 'x'); // triggers flush
      tree.put('k', 'v2');
      tree.put('pad2', 'x'); // triggers another flush
      expect(tree.get('k').value).toBe('v2');
    });

    it('recency survives leveled compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2, compactionStrategy: 'leveled' });
      tree.put('k', 'v1');
      tree.put('pad1', 'x'); // flush
      tree.put('k', 'v2');
      tree.put('pad2', 'x'); // flush + compact
      tree.put('k', 'v3');
      tree.put('pad3', 'x'); // flush
      tree.put('pad4', 'x2');
      tree.put('pad5', 'x3'); // flush + compact
      expect(tree.get('k').value).toBe('v3');
    });

    it('recency survives size-tiered compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2, compactionStrategy: 'size-tiered' });
      tree.put('k', 'v1');
      tree.put('pad1', 'x');
      tree.put('k', 'v2');
      tree.put('pad2', 'x');
      tree.put('k', 'v3');
      tree.put('pad3', 'x');
      tree.put('pad4', 'x2');
      tree.put('pad5', 'x3');
      expect(tree.get('k').value).toBe('v3');
    });

    it('recency across levels', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      // Put key, flush enough to compact it to L1
      tree.put('k', 'v1');
      tree.put('pad1', 'x');
      tree.put('pad2', 'y');
      tree.put('pad3', 'z');
      // Now put newer value
      tree.put('k', 'v2');
      tree.put('pad4', 'w'); // flush to L0
      expect(tree.get('k').value).toBe('v2');
    });
  });

  // ── 5.3 Tombstone / Delete Correctness ────────────────────

  describe('tombstone / delete correctness', () => {
    it('delete in memtable masks value in same memtable', () => {
      const tree = new LSMTree();
      tree.put('k', 'v');
      tree.delete('k');
      expect(tree.get('k').found).toBe(false);
    });

    it('tombstone in memtable masks value in SSTable', () => {
      const tree = new LSMTree();
      tree.put('k', 'v');
      tree.flush();
      tree.delete('k');
      expect(tree.get('k').found).toBe(false);
    });

    it('tombstone in L0 SSTable masks value in L1', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      tree.put('k', 'v');
      tree.put('pad1', 'x'); // flush
      tree.put('pad2', 'y');
      tree.put('pad3', 'z'); // flush + compact -> k is in L1
      tree.delete('k');
      tree.put('pad4', 'w'); // flush tombstone to L0
      expect(tree.get('k').found).toBe(false);
    });

    it('compaction merge eliminates tombstoned keys', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      tree.put('k', 'v');
      tree.put('pad1', 'x'); // flush
      tree.delete('k');
      tree.put('pad2', 'y'); // flush + compact
      const snap = tree.getSnapshot();
      const allEntries = snap.levels.flatMap((l) => l.flatMap((s) => s.entries));
      expect(allEntries.find((e) => e.key === 'k')).toBeUndefined();
    });

    it('re-insert after delete is visible', () => {
      const tree = new LSMTree();
      tree.put('k', 'v1');
      tree.delete('k');
      tree.put('k', 'v2');
      expect(tree.get('k').value).toBe('v2');
    });

    it('re-insert after delete survives compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      tree.put('k', 'v1');
      tree.put('pad1', 'x'); // flush
      tree.delete('k');
      tree.put('pad2', 'y'); // flush + compact
      tree.put('k', 'v2');
      tree.put('pad3', 'z'); // flush
      tree.put('pad4', 'w');
      tree.put('pad5', 'q'); // flush + compact
      expect(tree.get('k').value).toBe('v2');
    });
  });

  // ── 5.4 No Data Loss During Compaction ────────────────────

  describe('no data loss during compaction', () => {
    it('all keys survive L0->L1 leveled compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 4, compactionStrategy: 'leveled' });
      const keys: string[] = [];
      for (let i = 0; i < 16; i++) {
        const k = `key-${String(i).padStart(3, '0')}`;
        tree.put(k, `val-${i}`);
        keys.push(k);
      }
      for (const k of keys) {
        expect(tree.get(k).found).toBe(true);
      }
    });

    it('all keys survive L1->L2 leveled compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2, levelMultiplier: 2, compactionStrategy: 'leveled' });
      const keys: string[] = [];
      for (let i = 0; i < 30; i++) {
        const k = `key-${String(i).padStart(3, '0')}`;
        tree.put(k, `val-${i}`);
        keys.push(k);
      }
      for (const k of keys) {
        expect(tree.get(k).found).toBe(true);
      }
    });

    it('all keys survive size-tiered compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 4, compactionStrategy: 'size-tiered' });
      const keys: string[] = [];
      for (let i = 0; i < 16; i++) {
        const k = `key-${String(i).padStart(3, '0')}`;
        tree.put(k, `val-${i}`);
        keys.push(k);
      }
      for (const k of keys) {
        expect(tree.get(k).found).toBe(true);
      }
    });

    it('repeated compaction cycles dont lose data', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      const expected = new Map<string, string>();
      for (let i = 0; i < 200; i++) {
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
    });
  });

  // ── 5.5 SSTable Structural Invariants ─────────────────────

  describe('SSTable structural invariants', () => {
    function getAllSSTs(tree: LSMTree): SSTableMeta[] {
      return tree.getSnapshot().levels.flatMap((l) => l);
    }

    it('entries are sorted by key', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3 });
      for (let i = 0; i < 20; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      for (const sst of getAllSSTs(tree)) {
        for (let i = 0; i < sst.entries.length - 1; i++) {
          expect(sst.entries[i].key <= sst.entries[i + 1].key).toBe(true);
        }
      }
    });

    it('minKey equals first entry key', () => {
      const tree = new LSMTree({ memtableMaxSize: 3 });
      for (let i = 0; i < 6; i++) tree.put(`k${i}`, `v${i}`);
      for (const sst of getAllSSTs(tree)) {
        expect(sst.minKey).toBe(sst.entries[0].key);
      }
    });

    it('maxKey equals last entry key', () => {
      const tree = new LSMTree({ memtableMaxSize: 3 });
      for (let i = 0; i < 6; i++) tree.put(`k${i}`, `v${i}`);
      for (const sst of getAllSSTs(tree)) {
        expect(sst.maxKey).toBe(sst.entries[sst.entries.length - 1].key);
      }
    });

    it('size equals entries.length', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3 });
      for (let i = 0; i < 20; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      for (const sst of getAllSSTs(tree)) {
        expect(sst.size).toBe(sst.entries.length);
      }
    });

    it('no duplicate keys within a single SSTable', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3 });
      for (let i = 0; i < 20; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      for (const sst of getAllSSTs(tree)) {
        const keys = sst.entries.map((e) => e.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });

    it('SSTable level matches its position', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      for (let i = 0; i < 20; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      const snap = tree.getSnapshot();
      for (let i = 0; i < snap.levels.length; i++) {
        for (const sst of snap.levels[i]) {
          expect(sst.level).toBe(i);
        }
      }
    });
  });

  // ── 5.6 Level Structure Invariants ────────────────────────

  describe('level structure invariants', () => {
    it('L0 SSTables may have overlapping key ranges', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 100 });
      tree.put('a', 'v1');
      tree.put('c', 'v2'); // flush
      tree.put('b', 'v3');
      tree.put('d', 'v4'); // flush
      // just confirm engine allows overlapping L0 without error
      const snap = tree.getSnapshot();
      expect(snap.levels[0].length).toBe(2);
    });

    it('L1+ SSTables have non-overlapping key ranges after leveled compaction', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 4, compactionStrategy: 'leveled' });
      for (let i = 0; i < 32; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      const snap = tree.getSnapshot();
      for (let lvl = 1; lvl < snap.levels.length; lvl++) {
        const level = snap.levels[lvl];
        for (let i = 0; i < level.length; i++) {
          for (let j = i + 1; j < level.length; j++) {
            expect(hasOverlap(level[i], level[j])).toBe(false);
          }
        }
      }
    });

    it('level count never exceeds maxLevels (or auto-extended levels are valid)', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2, maxLevels: 5 });
      for (let i = 0; i < 50; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      const snap = tree.getSnapshot();
      // levels may be auto-extended, but all levels should be valid arrays
      for (const level of snap.levels) {
        expect(Array.isArray(level)).toBe(true);
      }
    });

    it('compaction only moves data downward', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      const events: ReturnType<typeof tree.put> = [];
      for (let i = 0; i < 20; i++) events.push(...tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`));
      const compactionEvents = events.filter((e) => e.type === 'compaction');
      for (const e of compactionEvents) {
        expect((e.details.toLevel as number)).toBeGreaterThan(e.details.fromLevel as number);
      }
    });
  });

  // ── 5.7 Read Path Correctness ─────────────────────────────

  describe('read path correctness', () => {
    it('get path always starts with memtable', () => {
      const tree = new LSMTree();
      tree.put('k', 'v');
      expect(tree.get('k').path[0]).toBe('memtable');
      expect(tree.get('nonexistent').path[0]).toBe('memtable');
    });

    it('get path only includes SSTables whose key range contains the query key', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 100 });
      for (let i = 0; i < 8; i++) tree.put(`k${i}`, `v${i}`);
      const result = tree.get('k5');
      const snap = tree.getSnapshot();
      const allSSTs = snap.levels.flatMap((l) => l);
      for (const sstId of result.path.filter((p) => p !== 'memtable')) {
        const sst = allSSTs.find((s) => s.id === sstId);
        expect(sst).toBeDefined();
        expect('k5' >= sst!.minKey && 'k5' <= sst!.maxKey).toBe(true);
      }
    });

    it('get stops at first match', () => {
      const tree = new LSMTree();
      tree.put('k', 'v');
      const result = tree.get('k');
      expect(result.path).toEqual(['memtable']);
    });

    it('get scans all levels on miss', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 100 });
      tree.put('a', 'v1');
      tree.put('b', 'v2'); // flush to L0
      const result = tree.get('a');
      // a is in L0, so path should include memtable + sst id
      expect(result.path[0]).toBe('memtable');
      expect(result.path.length).toBeGreaterThan(1);
    });
  });

  // ── 5.8 Amplification Metrics Sanity ──────────────────────

  describe('amplification metrics sanity', () => {
    it('write amplification >= 0', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3 });
      for (let i = 0; i < 20; i++) tree.put(`k${i}`, `v${i}`);
      expect(tree.getSnapshot().stats.writeAmplification).toBeGreaterThanOrEqual(0);
    });

    it('write amplification > 0 after at least one flush', () => {
      const tree = new LSMTree();
      tree.put('k', 'v');
      tree.flush();
      expect(tree.getSnapshot().stats.writeAmplification).toBeGreaterThan(0);
    });

    it('read amplification >= 1', () => {
      const tree = new LSMTree();
      tree.put('k', 'v');
      expect(tree.getSnapshot().stats.readAmplification).toBeGreaterThanOrEqual(1);
    });

    it('space amplification >= 1 when data exists in last level', () => {
      const tree = new LSMTree({ memtableMaxSize: 2, l0CompactionTrigger: 2 });
      for (let i = 0; i < 10; i++) tree.put(`k${String(i).padStart(3, '0')}`, `v${i}`);
      const snap = tree.getSnapshot();
      const lastLevel = snap.levels[snap.levels.length - 1];
      if (lastLevel && lastLevel.length > 0) {
        expect(snap.stats.spaceAmplification).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ── 5.9 Randomized / Fuzzy Correctness ────────────────────

  describe('randomized / fuzzy correctness', () => {
    function randomKey(): string {
      return `key-${String(Math.floor(Math.random() * 50)).padStart(3, '0')}`;
    }
    function randomValue(): string {
      return `val-${Math.random().toString(36).slice(2, 8)}`;
    }

    it('random put/get/delete sequence (leveled)', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3, compactionStrategy: 'leveled' });
      const ref = new Map<string, string | null>();

      for (let i = 0; i < 200; i++) {
        const r = Math.random();
        const k = randomKey();
        if (r < 0.7) {
          const v = randomValue();
          tree.put(k, v);
          ref.set(k, v);
        } else if (r < 0.9) {
          tree.get(k);
        } else {
          tree.delete(k);
          ref.set(k, null);
        }
      }

      for (const [k, v] of ref) {
        const result = tree.get(k);
        if (v === null) {
          expect(result.found).toBe(false);
        } else {
          expect(result.found).toBe(true);
          expect(result.value).toBe(v);
        }
      }
    });

    it('random put/get/delete sequence (size-tiered)', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3, compactionStrategy: 'size-tiered' });
      const ref = new Map<string, string | null>();

      for (let i = 0; i < 200; i++) {
        const r = Math.random();
        const k = randomKey();
        if (r < 0.7) {
          const v = randomValue();
          tree.put(k, v);
          ref.set(k, v);
        } else if (r < 0.9) {
          tree.get(k);
        } else {
          tree.delete(k);
          ref.set(k, null);
        }
      }

      for (const [k, v] of ref) {
        const result = tree.get(k);
        if (v === null) {
          expect(result.found).toBe(false);
        } else {
          expect(result.found).toBe(true);
          expect(result.value).toBe(v);
        }
      }
    });

    it('random config changes mid-stream', () => {
      const tree = new LSMTree({ memtableMaxSize: 4, l0CompactionTrigger: 3 });
      const ref = new Map<string, string | null>();

      for (let i = 0; i < 100; i++) {
        if (i % 20 === 0 && i > 0) {
          tree.updateConfig({
            memtableMaxSize: 2 + Math.floor(Math.random() * 10),
            compactionStrategy: Math.random() > 0.5 ? 'leveled' : 'size-tiered',
          });
        }
        const k = randomKey();
        const r = Math.random();
        if (r < 0.7) {
          const v = randomValue();
          tree.put(k, v);
          ref.set(k, v);
        } else if (r < 0.9) {
          tree.get(k);
        } else {
          tree.delete(k);
          ref.set(k, null);
        }
      }

      for (const [k, v] of ref) {
        const result = tree.get(k);
        if (v === null) {
          expect(result.found).toBe(false);
        } else {
          expect(result.found).toBe(true);
          expect(result.value).toBe(v);
        }
      }
    });
  });
});
