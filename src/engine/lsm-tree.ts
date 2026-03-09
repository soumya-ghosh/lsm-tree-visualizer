import type {
  LSMConfig,
  LSMEvent,
  LSMSnapshot,
  LSMStats,
  SSTableMeta,
} from './types';
import { DEFAULT_CONFIG } from './types';
import { MemTable } from './memtable';
import { WAL } from './wal';
import { createSSTable, resetSSTCounter } from './sstable';
import { runCompaction, type CompactionResult } from './compaction';

export class LSMTree {
  private memtable = new MemTable();
  private wal = new WAL();
  private levels: SSTableMeta[][] = [];
  private config: LSMConfig;
  private stats: LSMStats = {
    totalPuts: 0,
    totalGets: 0,
    totalDeletes: 0,
    totalFlushes: 0,
    totalCompactions: 0,
    writeAmplification: 0,
    readAmplification: 0,
    spaceAmplification: 0,
  };
  private bytesWrittenToStorage = 0;
  private bytesWrittenByUser = 0;
  private logicalClock = 0;

  constructor(config: Partial<LSMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initLevels();
  }

  private initLevels(): void {
    this.levels = Array.from({ length: this.config.maxLevels }, () => []);
  }

  put(key: string, value: string): LSMEvent[] {
    const events: LSMEvent[] = [];
    const timestamp = ++this.logicalClock;

    this.wal.append('put', key, value);
    this.memtable.put(key, value, timestamp);
    this.stats.totalPuts++;
    this.bytesWrittenByUser += key.length + value.length;

    events.push({
      type: 'put',
      timestamp,
      details: { key, value },
    });

    if (this.memtable.size >= this.config.memtableMaxSize) {
      events.push(...this.flush());
    }

    this.updateAmplification();
    return events;
  }

  get(key: string): { value: string | null; found: boolean; path: string[]; events: LSMEvent[] } {
    this.stats.totalGets++;
    const path: string[] = [];
    const events: LSMEvent[] = [];

    events.push({
      type: 'get',
      timestamp: Date.now(),
      details: { key },
    });

    // Check memtable first
    path.push('memtable');
    const memResult = this.memtable.get(key);
    if (memResult) {
      const found = !memResult.deleted;
      events.push({
        type: 'get-result',
        timestamp: Date.now(),
        details: { key, value: found ? memResult.value : null, found, path: [...path] },
      });
      return { value: found ? memResult.value : null, found, path, events };
    }

    // Check levels L0 -> Ln
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      // Search newest SSTables first at L0
      const tables = i === 0 ? [...level].reverse() : level;
      for (const sst of tables) {
        if (key >= sst.minKey && key <= sst.maxKey) {
          path.push(sst.id);
          const entry = sst.entries.find((e) => e.key === key);
          if (entry) {
            const found = !entry.deleted;
            events.push({
              type: 'get-result',
              timestamp: Date.now(),
              details: { key, value: found ? entry.value : null, found, path: [...path] },
            });
            return { value: found ? entry.value : null, found, path, events };
          }
        }
      }
    }

    events.push({
      type: 'get-result',
      timestamp: Date.now(),
      details: { key, value: null, found: false, path: [...path] },
    });
    return { value: null, found: false, path, events };
  }

  delete(key: string): LSMEvent[] {
    const timestamp = ++this.logicalClock;
    this.wal.append('delete', key, '');
    this.memtable.put(key, '', timestamp, true);
    this.stats.totalDeletes++;

    const events: LSMEvent[] = [{
      type: 'delete',
      timestamp,
      details: { key },
    }];

    if (this.memtable.size >= this.config.memtableMaxSize) {
      events.push(...this.flush());
    }

    this.updateAmplification();
    return events;
  }

  flush(): LSMEvent[] {
    if (this.memtable.size === 0) return [];

    const entries = this.memtable.getSorted();
    const sst = createSSTable(0, entries);
    this.levels[0].push(sst);
    this.memtable.clear();
    this.stats.totalFlushes++;
    this.bytesWrittenToStorage += entries.reduce(
      (acc, e) => acc + e.key.length + e.value.length,
      0,
    );

    const events: LSMEvent[] = [{
      type: 'flush',
      timestamp: Date.now(),
      details: { sstId: sst.id, entries: entries.length },
    }];

    // Check if compaction is needed
    const compactionEvents = this.tryCompaction();
    events.push(...compactionEvents);

    this.updateAmplification();
    return events;
  }

  private tryCompaction(): LSMEvent[] {
    const events: LSMEvent[] = [];
    let result: CompactionResult | null;

    // Keep compacting until no more compaction needed
    while ((result = runCompaction(this.levels, this.config)) !== null) {
      // Remove old SSTables
      for (const id of result.removedSSTs) {
        for (let i = 0; i < this.levels.length; i++) {
          this.levels[i] = this.levels[i].filter((s) => s.id !== id);
        }
      }

      // Add new SSTables
      for (const sst of result.newSSTs) {
        while (this.levels.length <= sst.level) {
          this.levels.push([]);
        }
        this.levels[sst.level].push(sst);
      }

      this.stats.totalCompactions++;
      this.bytesWrittenToStorage += result.newSSTs.reduce(
        (acc, s) => acc + s.entries.reduce((a, e) => a + e.key.length + e.value.length, 0),
        0,
      );

      events.push({
        type: 'compaction',
        timestamp: Date.now(),
        details: {
          fromLevel: result.fromLevel,
          toLevel: result.toLevel,
          removed: result.removedSSTs,
          created: result.newSSTs.map((s) => s.id),
        },
      });
    }

    return events;
  }

  private updateAmplification(): void {
    if (this.bytesWrittenByUser > 0) {
      this.stats.writeAmplification =
        Math.round((this.bytesWrittenToStorage / this.bytesWrittenByUser) * 100) / 100;
    }

    const totalEntries = this.levels.reduce(
      (acc, level) => acc + level.reduce((a, sst) => a + sst.size, 0),
      0,
    );
    const lastLevelEntries =
      this.levels[this.levels.length - 1]?.reduce((a, sst) => a + sst.size, 0) ?? 0;

    if (lastLevelEntries > 0) {
      this.stats.spaceAmplification =
        Math.round((totalEntries / lastLevelEntries) * 100) / 100;
    }

    this.stats.readAmplification = this.levels.reduce(
      (acc, level) => acc + Math.max(level.length, level.length > 0 ? 1 : 0),
      0,
    ) + 1; // +1 for memtable
  }

  getSnapshot(): LSMSnapshot {
    return {
      memtable: this.memtable.getSorted(),
      wal: this.wal.getEntries(),
      levels: this.levels.map((level) => [...level]),
      config: { ...this.config },
      stats: { ...this.stats },
    };
  }

  updateConfig(partial: Partial<LSMConfig>): void {
    this.config = { ...this.config, ...partial };
    while (this.levels.length < this.config.maxLevels) {
      this.levels.push([]);
    }
  }

  reset(config?: Partial<LSMConfig>): void {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memtable = new MemTable();
    this.wal = new WAL();
    this.levels = [];
    this.initLevels();
    this.stats = {
      totalPuts: 0,
      totalGets: 0,
      totalDeletes: 0,
      totalFlushes: 0,
      totalCompactions: 0,
      writeAmplification: 0,
      readAmplification: 0,
      spaceAmplification: 0,
    };
    this.bytesWrittenToStorage = 0;
    this.bytesWrittenByUser = 0;
    this.logicalClock = 0;
    resetSSTCounter();
  }
}
