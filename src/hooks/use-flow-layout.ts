import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { LSMSnapshot } from '@/engine/types';

const SST_WIDTH = 150;
const SST_HEIGHT = 60;
const SST_GAP = 16;
const LEVEL_PADDING_TOP = 32;
const LEVEL_PADDING_SIDE = 16;
const LEVEL_GAP = 20;
const TOP_Y = 0;
const LEVEL_START_Y = 250;

export function useFlowLayout(
  snapshot: LSMSnapshot,
  highlightedPath: string[],
) {
  return useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // WAL node
    nodes.push({
      id: 'wal',
      type: 'walNode',
      position: { x: 0, y: TOP_Y },
      data: { entries: snapshot.wal },
      draggable: true,
    });

    // MemTable node
    nodes.push({
      id: 'memtable',
      type: 'memtableNode',
      position: { x: 320, y: TOP_Y },
      data: {
        entries: snapshot.memtable,
        maxSize: snapshot.config.memtableMaxSize,
        highlighted: highlightedPath.includes('memtable'),
      },
      draggable: true,
    });

    // Edge: WAL -> MemTable
    edges.push({
      id: 'wal-to-mem',
      source: 'wal',
      target: 'memtable',
      sourceHandle: null,
      targetHandle: null,
      type: 'default',
      animated: true,
      style: { stroke: '#64748b', strokeWidth: 1.5, strokeDasharray: '5 5' },
    });

    // Level groups and SST nodes
    let currentY = LEVEL_START_Y;
    let prevRenderedLevelId: string | null = null;

    for (let levelIdx = 0; levelIdx < snapshot.levels.length; levelIdx++) {
      const level = snapshot.levels[levelIdx];
      if (levelIdx > 0 && level.length === 0) continue;

      const sstCount = level.length;
      const levelWidth = Math.max(
        sstCount * (SST_WIDTH + SST_GAP) + LEVEL_PADDING_SIDE * 2,
        300,
      );
      const levelHeight = SST_HEIGHT + LEVEL_PADDING_TOP + 24;

      const levelId = `level-${levelIdx}`;
      nodes.push({
        id: levelId,
        type: 'levelGroupNode',
        position: { x: 0, y: currentY },
        data: {
          level: levelIdx,
          sstCount,
          width: levelWidth,
          height: levelHeight,
        },
        style: { width: levelWidth, height: levelHeight },
        draggable: true,
      });

      // SST nodes inside level (non-draggable; the level group handles drag)
      level.forEach((sst, sstIdx) => {
        const sstX = LEVEL_PADDING_SIDE + sstIdx * (SST_WIDTH + SST_GAP);
        const sstY = LEVEL_PADDING_TOP;

        nodes.push({
          id: sst.id,
          type: 'sstNode',
          position: { x: sstX, y: sstY },
          parentId: levelId,
          extent: 'parent' as const,
          data: {
            sstId: sst.id,
            level: sst.level,
            minKey: sst.minKey,
            maxKey: sst.maxKey,
            size: sst.size,
            highlighted: highlightedPath.includes(sst.id),
          },
          draggable: false,
          connectable: false,
          focusable: false,
        });
      });

      // Edge: MemTable -> L0 (flush path)
      if (levelIdx === 0) {
        edges.push({
          id: 'mem-to-l0',
          source: 'memtable',
          target: levelId,
          type: 'default',
          animated: true,
          label: 'flush',
          style: { stroke: '#3b82f6', strokeWidth: 1.5 },
          labelStyle: { fontSize: 10, fill: '#64748b' },
        });
      }

      // Edge: connect to the previous *rendered* level (handles gaps like L0 → L2)
      if (prevRenderedLevelId) {
        edges.push({
          id: `${prevRenderedLevelId}-to-${levelId}`,
          source: prevRenderedLevelId,
          target: levelId,
          type: 'default',
          label: 'compact',
          style: { stroke: '#6366f1', strokeWidth: 1.5, strokeDasharray: '4 4' },
          labelStyle: { fontSize: 10, fill: '#64748b' },
        });
      }

      prevRenderedLevelId = levelId;
      currentY += levelHeight + LEVEL_GAP;
    }

    return { nodes, edges };
  }, [snapshot, highlightedPath]);
}
