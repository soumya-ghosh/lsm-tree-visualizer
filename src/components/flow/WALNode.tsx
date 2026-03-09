import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'motion/react';
import type { WALEntry } from '@/engine/types';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface WALNodeData {
  entries: WALEntry[];
  [key: string]: unknown;
}

export function WALNode({ data }: NodeProps) {
  const { entries } = data as unknown as WALNodeData;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border-2 border-slate-500/40 bg-card p-3 w-[240px] h-[200px] shadow-lg flex flex-col"
    >
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">WAL</span>
          <span className="text-[10px] text-muted-foreground ml-2">{entries.length} entries</span>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 nowheel">
        <div className="space-y-0.5 pr-2">
          {entries.length === 0 && (
            <div className="text-[10px] text-muted-foreground italic text-center py-2">
              No writes yet
            </div>
          )}
          {[...entries].reverse().map((e, i) => (
            <div
              key={`${e.key}-${e.timestamp}-${i}`}
              className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
            >
              <span className={`shrink-0 ${e.operation === 'delete' ? 'text-red-400' : 'text-green-400'}`}>
                {e.operation === 'delete' ? 'DEL' : 'PUT'}
              </span>
              <span className="text-muted-foreground truncate">{e.key}</span>
              {e.operation === 'put' && (
                <span className="text-foreground truncate ml-auto">{e.value}</span>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-1.5 !h-1.5" />
    </motion.div>
  );
}
