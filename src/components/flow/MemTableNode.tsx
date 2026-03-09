import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import type { KeyValue } from '@/engine/types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

export interface MemTableNodeData {
  entries: KeyValue[];
  maxSize: number;
  highlighted: boolean;
  [key: string]: unknown;
}

export function MemTableNode({ data }: NodeProps) {
  const { entries, maxSize, highlighted } = data as unknown as MemTableNodeData;
  const fillPercent = Math.min((entries.length / maxSize) * 100, 100);
  const isNearFull = fillPercent >= 75;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: 1,
        boxShadow: highlighted
          ? '0 0 20px rgba(59, 130, 246, 0.4)'
          : isNearFull
            ? '0 0 12px rgba(245, 158, 11, 0.25)'
            : '0 4px 12px rgba(0,0,0,0.2)',
      }}
      transition={{ duration: 0.3 }}
      className={`rounded-lg border-2 bg-card p-3 min-w-[220px] max-w-[260px] ${
        highlighted
          ? 'border-blue-400'
          : isNearFull
            ? 'border-amber-500/60'
            : 'border-blue-500/40'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">MemTable</span>
        <Badge variant={isNearFull ? 'destructive' : 'secondary'} className="text-[10px]">
          {entries.length}/{maxSize}
        </Badge>
      </div>

      <div className="w-full h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isNearFull ? 'bg-amber-500' : 'bg-blue-500'}`}
          animate={{ width: `${fillPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <ScrollArea className="max-h-[120px] nowheel">
        <div className="space-y-0.5">
          {entries.length === 0 && (
            <div className="text-[10px] text-muted-foreground italic text-center py-2">Empty</div>
          )}
          {entries.map((e, i) => (
            <motion.div
              key={e.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              className={`flex justify-between text-[10px] font-mono px-1.5 py-0.5 rounded ${
                e.deleted ? 'text-red-400 line-through opacity-60' : 'text-foreground'
              }`}
            >
              <span className="text-muted-foreground truncate max-w-[100px]">{e.key}</span>
              <span className="truncate max-w-[80px]">{e.deleted ? 'DEL' : e.value}</span>
            </motion.div>
          ))}
        </div>
      </ScrollArea>

      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-1.5 !h-1.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-2 !h-2" />
    </motion.div>
  );
}
