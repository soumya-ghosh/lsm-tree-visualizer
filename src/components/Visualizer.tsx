import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeTypes,
  type NodeChange,
  type EdgeChange,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useLSMStore } from '@/store/lsm-store';
import { useFlowLayout } from '@/hooks/use-flow-layout';
import { MemTableNode } from './flow/MemTableNode';
import { SSTNode } from './flow/SSTNode';
import { LevelGroupNode } from './flow/LevelGroupNode';
import { WALNode } from './flow/WALNode';
import { SSTDetailDialog } from './flow/SSTDetailDialog';
import { ConfigPanel } from './panels/ConfigPanel';
import { OperationsPanel } from './panels/OperationsPanel';
import { StatsPanel } from './panels/StatsPanel';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

const nodeTypes: NodeTypes = {
  memtableNode: MemTableNode,
  sstNode: SSTNode,
  levelGroupNode: LevelGroupNode,
  walNode: WALNode,
};

const SEARCH_STEP_DELAY_MS = 600;

export function Visualizer() {
  const snapshot = useLSMStore((s) => s.snapshot);
  const highlightedPath = useLSMStore((s) => s.highlightedPath);
  const reset = useLSMStore((s) => s.reset);
  const searchAnimation = useLSMStore((s) => s.searchAnimation);
  const advanceSearch = useLSMStore((s) => s.advanceSearch);
  const setSelectedSST = useLSMStore((s) => s.setSelectedSST);

  const { nodes: layoutNodes, edges: layoutEdges } = useFlowLayout(snapshot, highlightedPath);

  const [nodes, setNodes] = useState<Node[]>(layoutNodes);
  const [edges, setEdges] = useState<Edge[]>(layoutEdges);

  useEffect(() => {
    setNodes((currentNodes) => {
      const currentMap = new Map(currentNodes.map((n) => [n.id, n]));
      return layoutNodes.map((layoutNode) => {
        const existing = currentMap.get(layoutNode.id);
        // Preserve user-dragged position for draggable nodes; always recompute for child SST nodes
        if (existing && layoutNode.draggable !== false) {
          return { ...layoutNode, position: existing.position };
        }
        return layoutNode;
      });
    });
  }, [layoutNodes]);

  useEffect(() => {
    setEdges(layoutEdges);
  }, [layoutEdges]);

  // Drive the step-by-step Get search animation
  const animTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (searchAnimation?.active) {
      animTimerRef.current = setInterval(() => {
        advanceSearch();
      }, SEARCH_STEP_DELAY_MS);
    }
    return () => {
      if (animTimerRef.current) clearInterval(animTimerRef.current);
    };
  }, [searchAnimation?.active, advanceSearch]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'sstNode' && node.data?.sstId) {
        setSelectedSST(node.data.sstId as string);
      }
    },
    [setSelectedSST],
  );

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  const onReset = useCallback(() => {
    if (window.confirm('Reset the tree? All data will be lost.')) {
      reset();
    }
  }, [reset]);

  return (
    <div className="w-screen h-screen relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        className="bg-background"
      >
        <Background gap={20} size={1} className="opacity-30" />
        <Controls className="!bg-card !border-border !shadow-lg" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor="#3b82f6"
          maskColor="rgba(0,0,0,0.3)"
        />
      </ReactFlow>

      <ConfigPanel />
      <OperationsPanel />
      <StatsPanel />

      <div className="absolute top-4 right-44 z-50">
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-[11px] gap-1"
          onClick={onReset}
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </Button>
      </div>

      <SSTDetailDialog />
    </div>
  );
}
