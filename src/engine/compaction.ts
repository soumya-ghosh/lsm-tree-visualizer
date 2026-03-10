import type { LSMConfig, SSTableMeta } from './types';
import { createSSTable, hasOverlap, mergeEntries } from './sstable';

export interface CompactionResult {
  removedSSTs: string[];
  newSSTs: SSTableMeta[];
  fromLevel: number;
  toLevel: number;
}

export function leveledCompaction(
  levels: SSTableMeta[][],
  config: LSMConfig,
): CompactionResult | null {
  // L0 -> L1 compaction: triggered when L0 has too many SSTables
  if (levels[0] && levels[0].length >= config.l0CompactionTrigger) {
    return compactL0ToL1(levels, config);
  }

  // Ln -> Ln+1: triggered when level size exceeds threshold
  for (let i = 1; i < levels.length && i < config.maxLevels - 1; i++) {
    const maxSize = Math.pow(config.levelMultiplier, i);
    if (levels[i] && levels[i].length > maxSize) {
      return compactLevelToNext(levels, i, config);
    }
  }

  return null;
}

function hasDeeper(levels: SSTableMeta[][], fromLevel: number): boolean {
  for (let i = fromLevel + 1; i < levels.length; i++) {
    if (levels[i] && levels[i].length > 0) return true;
  }
  return false;
}

function compactL0ToL1(levels: SSTableMeta[][], config: LSMConfig): CompactionResult {
  const l0 = levels[0] ?? [];
  const l1 = levels[1] ?? [];

  const overlapping = l1.filter((sst) =>
    l0.some((l0sst) => hasOverlap(l0sst, sst)),
  );

  const toMerge = [...l0, ...overlapping];
  const nonOverlappingL1 = l1.filter((sst) => !overlapping.includes(sst));
  const dropTombstones = nonOverlappingL1.length === 0 && !hasDeeper(levels, 1);
  const merged = mergeEntries(toMerge, dropTombstones);

  // target level = 1, so chunkSize = baseChunkSize * 2^1
  const chunkSize = config.baseChunkSize * Math.pow(2, 1);
  const newSSTs: SSTableMeta[] = [];
  for (let i = 0; i < merged.length; i += chunkSize) {
    newSSTs.push(createSSTable(1, merged.slice(i, i + chunkSize)));
  }

  return {
    removedSSTs: toMerge.map((s) => s.id),
    newSSTs,
    fromLevel: 0,
    toLevel: 1,
  };
}

function compactLevelToNext(
  levels: SSTableMeta[][],
  level: number,
  config: LSMConfig,
): CompactionResult {
  const current = levels[level] ?? [];
  const next = levels[level + 1] ?? [];

  // Pick the oldest SSTable from current level
  const picked = current[0];
  if (!picked) return { removedSSTs: [], newSSTs: [], fromLevel: level, toLevel: level + 1 };

  const overlapping = next.filter((sst) => hasOverlap(picked, sst));
  const toMerge = [picked, ...overlapping];
  const nonOverlappingNext = next.filter((sst) => !overlapping.includes(sst));
  const dropTombstones = nonOverlappingNext.length === 0 && !hasDeeper(levels, level + 1);
  const merged = mergeEntries(toMerge, dropTombstones);

  // target level = level + 1, so chunkSize = baseChunkSize * 2^(level+1)
  const chunkSize = config.baseChunkSize * Math.pow(2, level + 1);
  const newSSTs: SSTableMeta[] = [];
  for (let i = 0; i < merged.length; i += chunkSize) {
    newSSTs.push(createSSTable(level + 1, merged.slice(i, i + chunkSize)));
  }

  return {
    removedSSTs: toMerge.map((s) => s.id),
    newSSTs,
    fromLevel: level,
    toLevel: level + 1,
  };
}

export function sizeTieredCompaction(
  levels: SSTableMeta[][],
  config: LSMConfig,
): CompactionResult | null {
  for (let i = 0; i < levels.length && i < config.maxLevels - 1; i++) {
    const level = levels[i] ?? [];
    if (level.length >= config.l0CompactionTrigger) {
      const targetHasData = (levels[i + 1]?.length ?? 0) > 0;
      const dropTombstones = !targetHasData && !hasDeeper(levels, i + 1);
      const merged = mergeEntries(level, dropTombstones);
      const newSSTs = [createSSTable(i + 1, merged)];
      return {
        removedSSTs: level.map((s) => s.id),
        newSSTs,
        fromLevel: i,
        toLevel: i + 1,
      };
    }
  }
  return null;
}

export function runCompaction(
  levels: SSTableMeta[][],
  config: LSMConfig,
): CompactionResult | null {
  return config.compactionStrategy === 'leveled'
    ? leveledCompaction(levels, config)
    : sizeTieredCompaction(levels, config);
}
