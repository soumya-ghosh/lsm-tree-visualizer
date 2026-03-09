import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFlowLayout } from '../use-flow-layout';
import type { LSMSnapshot, SSTableMeta, KeyValue } from '@/engine/types';
import { DEFAULT_CONFIG } from '@/engine/types';

function kv(key: string, value: string, timestamp = 1): KeyValue {
  return { key, value, timestamp, deleted: false };
}

function makeSST(id: string, level: number, entries: KeyValue[]): SSTableMeta {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  return {
    id,
    level,
    entries: sorted,
    minKey: sorted[0]?.key ?? '',
    maxKey: sorted[sorted.length - 1]?.key ?? '',
    size: sorted.length,
    createdAt: Date.now(),
  };
}

function emptySnapshot(): LSMSnapshot {
  return {
    memtable: [],
    wal: [],
    levels: [[], [], [], [], []],
    config: { ...DEFAULT_CONFIG },
    stats: {
      totalPuts: 0,
      totalGets: 0,
      totalDeletes: 0,
      totalFlushes: 0,
      totalCompactions: 0,
      writeAmplification: 0,
      readAmplification: 0,
      spaceAmplification: 0,
    },
  };
}

describe('useFlowLayout', () => {
  it('empty snapshot produces WAL + MemTable + L0 group nodes', () => {
    const { result } = renderHook(() => useFlowLayout(emptySnapshot(), []));
    const { nodes } = result.current;
    expect(nodes.length).toBe(3);
    expect(nodes.find((n) => n.id === 'wal')).toBeDefined();
    expect(nodes.find((n) => n.id === 'memtable')).toBeDefined();
    expect(nodes.find((n) => n.id === 'level-0')).toBeDefined();
  });

  it('WAL node has correct type and position', () => {
    const { result } = renderHook(() => useFlowLayout(emptySnapshot(), []));
    const wal = result.current.nodes.find((n) => n.id === 'wal')!;
    expect(wal.type).toBe('walNode');
    expect(wal.position.x).toBe(0);
  });

  it('MemTable node has correct type and position', () => {
    const { result } = renderHook(() => useFlowLayout(emptySnapshot(), []));
    const mem = result.current.nodes.find((n) => n.id === 'memtable')!;
    expect(mem.type).toBe('memtableNode');
    expect(mem.position.x).toBe(300);
  });

  it('MemTable highlighted flag reflects highlightedPath', () => {
    const { result } = renderHook(() => useFlowLayout(emptySnapshot(), ['memtable']));
    const mem = result.current.nodes.find((n) => n.id === 'memtable')!;
    expect(mem.data.highlighted).toBe(true);
  });

  it('SSTable nodes are children of their level group', () => {
    const snap = emptySnapshot();
    snap.levels[0] = [makeSST('sst-1-L0', 0, [kv('a', '1'), kv('b', '2')])];
    const { result } = renderHook(() => useFlowLayout(snap, []));
    const sstNode = result.current.nodes.find((n) => n.id === 'sst-1-L0')!;
    expect(sstNode.parentId).toBe('level-0');
  });

  it('SST nodes get highlighted from path', () => {
    const snap = emptySnapshot();
    snap.levels[0] = [makeSST('sst-1-L0', 0, [kv('a', '1')])];
    const { result } = renderHook(() => useFlowLayout(snap, ['sst-1-L0']));
    const sstNode = result.current.nodes.find((n) => n.id === 'sst-1-L0')!;
    expect(sstNode.data.highlighted).toBe(true);
  });

  it('empty levels (except L0) are skipped', () => {
    const snap = emptySnapshot();
    const { result } = renderHook(() => useFlowLayout(snap, []));
    expect(result.current.nodes.find((n) => n.id === 'level-1')).toBeUndefined();
  });

  it('non-empty L1 creates level group and SST nodes', () => {
    const snap = emptySnapshot();
    snap.levels[1] = [
      makeSST('sst-1-L1', 1, [kv('a', '1')]),
      makeSST('sst-2-L1', 1, [kv('b', '2')]),
    ];
    const { result } = renderHook(() => useFlowLayout(snap, []));
    expect(result.current.nodes.find((n) => n.id === 'level-1')).toBeDefined();
    expect(result.current.nodes.filter((n) => n.parentId === 'level-1')).toHaveLength(2);
  });

  it('edges: always has wal-to-mem', () => {
    const { result } = renderHook(() => useFlowLayout(emptySnapshot(), []));
    expect(result.current.edges.find((e) => e.id === 'wal-to-mem')).toBeDefined();
  });

  it('edges: mem-to-l0 exists when L0 is present', () => {
    const { result } = renderHook(() => useFlowLayout(emptySnapshot(), []));
    const edge = result.current.edges.find((e) => e.id === 'mem-to-l0')!;
    expect(edge).toBeDefined();
    expect(edge.label).toBe('flush');
  });

  it('edges: l0-to-l1 exists when both levels present', () => {
    const snap = emptySnapshot();
    snap.levels[0] = [makeSST('sst-1-L0', 0, [kv('a', '1')])];
    snap.levels[1] = [makeSST('sst-2-L1', 1, [kv('b', '2')])];
    const { result } = renderHook(() => useFlowLayout(snap, []));
    const edge = result.current.edges.find((e) => e.id === 'l0-to-l1');
    expect(edge).toBeDefined();
    expect(edge!.label).toBe('compact');
  });

  it('level group width scales with SST count', () => {
    const snap = emptySnapshot();
    const ssts: SSTableMeta[] = [];
    for (let i = 0; i < 5; i++) {
      ssts.push(makeSST(`sst-${i}-L0`, 0, [kv(`k${i}`, `v${i}`)]));
    }
    snap.levels[0] = ssts;
    const { result } = renderHook(() => useFlowLayout(snap, []));
    const levelNode = result.current.nodes.find((n) => n.id === 'level-0')!;
    expect(levelNode.data.width).toBeGreaterThan(300);
  });

  it('SST nodes are horizontally spaced within level', () => {
    const snap = emptySnapshot();
    snap.levels[0] = [
      makeSST('sst-1-L0', 0, [kv('a', '1')]),
      makeSST('sst-2-L0', 0, [kv('b', '2')]),
    ];
    const { result } = renderHook(() => useFlowLayout(snap, []));
    const sst1 = result.current.nodes.find((n) => n.id === 'sst-1-L0')!;
    const sst2 = result.current.nodes.find((n) => n.id === 'sst-2-L0')!;
    const SST_WIDTH = 150;
    const SST_GAP = 16;
    expect(sst2.position.x - sst1.position.x).toBe(SST_WIDTH + SST_GAP);
  });
});
