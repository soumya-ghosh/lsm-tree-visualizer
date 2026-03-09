import type { KeyValue, SSTableMeta } from './types';

let sstCounter = 0;

export function createSSTable(level: number, entries: KeyValue[]): SSTableMeta {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  return {
    id: `sst-${++sstCounter}-L${level}`,
    level,
    entries: sorted,
    minKey: sorted[0]?.key ?? '',
    maxKey: sorted[sorted.length - 1]?.key ?? '',
    size: sorted.length,
    createdAt: Date.now(),
  };
}

export function mergeEntries(
  tables: SSTableMeta[],
  dropTombstones = true,
): KeyValue[] {
  const merged = new Map<string, KeyValue>();
  const allEntries = tables
    .flatMap((t) => t.entries)
    .sort((a, b) => {
      const cmp = a.key.localeCompare(b.key);
      if (cmp !== 0) return cmp;
      return b.timestamp - a.timestamp; // newer first
    });

  for (const entry of allEntries) {
    if (!merged.has(entry.key)) {
      merged.set(entry.key, entry);
    }
  }

  let result = [...merged.values()];
  if (dropTombstones) {
    result = result.filter((e) => !e.deleted);
  }
  return result.sort((a, b) => a.key.localeCompare(b.key));
}

export function hasOverlap(a: SSTableMeta, b: SSTableMeta): boolean {
  return a.minKey <= b.maxKey && b.minKey <= a.maxKey;
}

export function resetSSTCounter(): void {
  sstCounter = 0;
}
