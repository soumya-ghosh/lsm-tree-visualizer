import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';

const LEVEL_COLORS = [
  'border-amber-500/50 text-amber-400',
  'border-emerald-500/50 text-emerald-400',
  'border-cyan-500/50 text-cyan-400',
  'border-violet-500/50 text-violet-400',
  'border-pink-500/50 text-pink-400',
];

export interface SSTNodeData {
  sstId: string;
  level: number;
  minKey: string;
  maxKey: string;
  size: number;
  highlighted: boolean;
  [key: string]: unknown;
}

export function SSTNode({ data }: NodeProps) {
  const d = data as unknown as SSTNodeData;
  const colorClass = LEVEL_COLORS[Math.min(d.level, LEVEL_COLORS.length - 1)];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: -10 }}
      animate={{
        opacity: 1,
        scale: d.highlighted ? 1.05 : 1,
        y: 0,
        boxShadow: d.highlighted
          ? '0 0 16px rgba(234, 179, 8, 0.4)'
          : '0 2px 8px rgba(0,0,0,0.2)',
      }}
      transition={{ duration: 0.35, type: 'spring', stiffness: 300, damping: 25 }}
      className={`group rounded-md border bg-card p-2 min-w-[140px] cursor-pointer ${colorClass} ${
        d.highlighted ? 'ring-2 ring-yellow-400/50' : ''
      }`}
      whileHover={{ scale: d.highlighted ? 1.05 : 1.02 }}
    >
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-1.5 !h-1.5" />

      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono opacity-70">{d.sstId}</span>
        <Badge variant="outline" className="text-[9px] px-1 py-0">
          {d.size}
        </Badge>
      </div>

      <div className="text-[10px] font-mono text-center text-foreground">
        [{d.minKey}..{d.maxKey}]
      </div>

      <div className="text-[8px] text-muted-foreground text-center mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        click to view
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-1.5 !h-1.5" />
    </motion.div>
  );
}
