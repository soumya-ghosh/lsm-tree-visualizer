import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';

const LEVEL_BG = [
  'from-amber-500/5 to-amber-500/10 border-amber-500/20',
  'from-emerald-500/5 to-emerald-500/10 border-emerald-500/20',
  'from-cyan-500/5 to-cyan-500/10 border-cyan-500/20',
  'from-violet-500/5 to-violet-500/10 border-violet-500/20',
  'from-pink-500/5 to-pink-500/10 border-pink-500/20',
];

const LEVEL_TEXT = [
  'text-amber-400',
  'text-emerald-400',
  'text-cyan-400',
  'text-violet-400',
  'text-pink-400',
];

export interface LevelGroupNodeData {
  level: number;
  sstCount: number;
  width: number;
  height: number;
  [key: string]: unknown;
}

export function LevelGroupNode({ data }: NodeProps) {
  const { level, sstCount } = data as unknown as LevelGroupNodeData;
  const bgClass = LEVEL_BG[Math.min(level, LEVEL_BG.length - 1)];
  const textClass = LEVEL_TEXT[Math.min(level, LEVEL_TEXT.length - 1)];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: level * 0.1 }}
      className={`rounded-lg border bg-gradient-to-r ${bgClass} w-full h-full min-h-[80px]`}
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${textClass}`}>
          Level {level}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {sstCount} SST{sstCount !== 1 ? 's' : ''}
        </span>
      </div>
      <Handle type="target" position={Position.Top} className="!bg-transparent !w-0 !h-0 !min-w-0 !min-h-0" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !w-0 !h-0 !min-w-0 !min-h-0" />
    </motion.div>
  );
}
