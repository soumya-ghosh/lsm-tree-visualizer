export interface LSMConfig {
  memtableMaxSize: number;
  levelMultiplier: number;
  maxLevels: number;
  l0CompactionTrigger: number;
  compactionStrategy: 'leveled' | 'size-tiered';
}

export const DEFAULT_CONFIG: LSMConfig = {
  memtableMaxSize: 8,
  levelMultiplier: 4,
  maxLevels: 5,
  l0CompactionTrigger: 4,
  compactionStrategy: 'leveled',
};

export interface KeyValue {
  key: string;
  value: string;
  timestamp: number;
  deleted?: boolean;
}

export interface SSTableMeta {
  id: string;
  level: number;
  entries: KeyValue[];
  minKey: string;
  maxKey: string;
  size: number;
  createdAt: number;
}

export interface WALEntry {
  operation: 'put' | 'delete';
  key: string;
  value: string;
  timestamp: number;
}

export type LSMEventType =
  | 'put'
  | 'get'
  | 'delete'
  | 'flush'
  | 'compaction'
  | 'get-result';

export interface LSMEvent {
  type: LSMEventType;
  timestamp: number;
  details: Record<string, unknown>;
}

export interface LSMSnapshot {
  memtable: KeyValue[];
  wal: WALEntry[];
  levels: SSTableMeta[][];
  config: LSMConfig;
  stats: LSMStats;
}

export interface LSMStats {
  totalPuts: number;
  totalGets: number;
  totalDeletes: number;
  totalFlushes: number;
  totalCompactions: number;
  writeAmplification: number;
  readAmplification: number;
  spaceAmplification: number;
}
