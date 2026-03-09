import { describe, it, expect, beforeEach } from 'vitest';
import {
  leveledCompaction,
  sizeTieredCompaction,
  runCompaction,
} from '../compaction';
import { createSSTable, resetSSTCounter } from '../sstable';
import type { LSMConfig, SSTableMeta, KeyValue } from '../types';
import { DEFAULT_CONFIG } from '../types';

function kv(key: string, value: string, timestamp: number, deleted = false): KeyValue {
  return { key, value, timestamp, deleted };
}

function makeLevels(maxLevels: number): SSTableMeta[][] {
  return Array.from({ length: maxLevels }, () => []);
}

describe('Compaction strategies', () => {
  beforeEach(() => {
    resetSSTCounter();
  });

  describe('leveledCompaction', () => {
    it('returns null when L0 is below trigger', () => {
      const levels = makeLevels(5);
      levels[0].push(createSSTable(0, [kv('a', '1', 1)]));
      levels[0].push(createSSTable(0, [kv('b', '2', 2)]));
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4 };
      expect(leveledCompaction(levels, config)).toBeNull();
    });

    it('triggers L0->L1 when L0 reaches trigger', () => {
      const levels = makeLevels(5);
      for (let i = 0; i < 4; i++) {
        levels[0].push(createSSTable(0, [kv(`k${i}`, `v${i}`, i)]));
      }
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4 };
      const result = leveledCompaction(levels, config);
      expect(result).not.toBeNull();
      expect(result!.fromLevel).toBe(0);
      expect(result!.toLevel).toBe(1);
    });

    it('L0->L1 compaction merges overlapping L1 SSTables', () => {
      const levels = makeLevels(5);
      for (let i = 0; i < 4; i++) {
        levels[0].push(createSSTable(0, [kv('a', `v${i}`, i), kv('d', `v${i}`, i)]));
      }
      const overlappingL1 = createSSTable(1, [kv('c', 'x', 100), kv('f', 'y', 100)]);
      const nonOverlappingL1 = createSSTable(1, [kv('g', 'x', 100), kv('h', 'y', 100)]);
      levels[1].push(overlappingL1, nonOverlappingL1);

      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4 };
      const result = leveledCompaction(levels, config)!;

      expect(result.removedSSTs).toContain(overlappingL1.id);
      expect(result.removedSSTs).not.toContain(nonOverlappingL1.id);
      // All L0 SSTables should be removed
      for (const sst of levels[0]) {
        expect(result.removedSSTs).toContain(sst.id);
      }
    });

    it('L0->L1 compaction chunks output into SSTables of size 4', () => {
      const levels = makeLevels(5);
      const entries: KeyValue[] = [];
      for (let i = 0; i < 12; i++) {
        entries.push(kv(`k${String(i).padStart(2, '0')}`, `v${i}`, i));
      }
      // Split into 4 L0 SSTables of 3 entries each
      for (let i = 0; i < 4; i++) {
        levels[0].push(createSSTable(0, entries.slice(i * 3, (i + 1) * 3)));
      }
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4 };
      const result = leveledCompaction(levels, config)!;
      expect(result.newSSTs).toHaveLength(3); // 12 / 4 = 3
    });

    it('triggers Ln->Ln+1 when level exceeds multiplier^n', () => {
      const levels = makeLevels(5);
      const config: LSMConfig = { ...DEFAULT_CONFIG, levelMultiplier: 4, l0CompactionTrigger: 10 };
      // L1 max size = 4^1 = 4, so 5 SSTables triggers compaction
      for (let i = 0; i < 5; i++) {
        levels[1].push(createSSTable(1, [kv(`k${i}`, `v${i}`, i)]));
      }
      const result = leveledCompaction(levels, config);
      expect(result).not.toBeNull();
      expect(result!.fromLevel).toBe(1);
      expect(result!.toLevel).toBe(2);
    });

    it('picks oldest SSTable from Ln for Ln->Ln+1', () => {
      const levels = makeLevels(5);
      const config: LSMConfig = { ...DEFAULT_CONFIG, levelMultiplier: 4, l0CompactionTrigger: 10 };
      const oldest = createSSTable(1, [kv('a', 'v1', 1)]);
      levels[1].push(oldest);
      for (let i = 0; i < 4; i++) {
        levels[1].push(createSSTable(1, [kv(`k${i}`, `v${i}`, 100 + i)]));
      }
      const result = leveledCompaction(levels, config)!;
      expect(result.removedSSTs).toContain(oldest.id);
    });
  });

  describe('sizeTieredCompaction', () => {
    it('returns null below trigger', () => {
      const levels = makeLevels(5);
      levels[0].push(createSSTable(0, [kv('a', '1', 1)]));
      levels[0].push(createSSTable(0, [kv('b', '2', 2)]));
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4, compactionStrategy: 'size-tiered' };
      expect(sizeTieredCompaction(levels, config)).toBeNull();
    });

    it('merges entire level into one SSTable at next level', () => {
      const levels = makeLevels(5);
      for (let i = 0; i < 4; i++) {
        levels[0].push(createSSTable(0, [kv(`k${i}`, `v${i}`, i)]));
      }
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4, compactionStrategy: 'size-tiered' };
      const result = sizeTieredCompaction(levels, config)!;
      expect(result.newSSTs).toHaveLength(1);
      expect(result.newSSTs[0].level).toBe(1);
      expect(result.removedSSTs).toHaveLength(4);
    });
  });

  describe('runCompaction', () => {
    it('dispatches to leveled strategy', () => {
      const levels = makeLevels(5);
      for (let i = 0; i < 4; i++) {
        levels[0].push(createSSTable(0, [kv(`k${i}`, `v${i}`, i)]));
      }
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4, compactionStrategy: 'leveled' };
      const result = runCompaction(levels, config);
      expect(result).not.toBeNull();
      expect(result!.fromLevel).toBe(0);
      expect(result!.toLevel).toBe(1);
    });

    it('dispatches to size-tiered strategy', () => {
      const levels = makeLevels(5);
      for (let i = 0; i < 4; i++) {
        levels[0].push(createSSTable(0, [kv(`k${i}`, `v${i}`, i)]));
      }
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4, compactionStrategy: 'size-tiered' };
      const result = runCompaction(levels, config);
      expect(result).not.toBeNull();
      expect(result!.newSSTs).toHaveLength(1); // size-tiered merges to one
    });

    it('compaction drops tombstoned keys', () => {
      const levels = makeLevels(5);
      for (let i = 0; i < 4; i++) {
        levels[0].push(createSSTable(0, [kv('a', '', i, true)]));
      }
      const config: LSMConfig = { ...DEFAULT_CONFIG, l0CompactionTrigger: 4 };
      const result = runCompaction(levels, config)!;
      const allEntries = result.newSSTs.flatMap((s) => s.entries);
      expect(allEntries.find((e) => e.key === 'a')).toBeUndefined();
    });

    it('compaction with empty levels returns null', () => {
      const levels = makeLevels(5);
      const config: LSMConfig = { ...DEFAULT_CONFIG };
      expect(runCompaction(levels, config)).toBeNull();
    });
  });
});
