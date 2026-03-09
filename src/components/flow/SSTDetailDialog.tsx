import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useLSMStore } from '@/store/lsm-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const LEVEL_COLORS = [
  'text-amber-400',
  'text-emerald-400',
  'text-cyan-400',
  'text-violet-400',
  'text-pink-400',
];

const LEVEL_BORDER = [
  'border-amber-500/30',
  'border-emerald-500/30',
  'border-cyan-500/30',
  'border-violet-500/30',
  'border-pink-500/30',
];

export function SSTDetailDialog() {
  const selectedSST = useLSMStore((s) => s.selectedSST);
  const snapshot = useLSMStore((s) => s.snapshot);
  const setSelectedSST = useLSMStore((s) => s.setSelectedSST);
  const lastGetResult = useLSMStore((s) => s.lastGetResult);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedSST(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSelectedSST]);

  let sst = null;
  if (selectedSST) {
    for (const level of snapshot.levels) {
      for (const s of level) {
        if (s.id === selectedSST) {
          sst = s;
          break;
        }
      }
      if (sst) break;
    }
  }

  const foundKey = lastGetResult?.found ? lastGetResult.key : null;

  return (
    <AnimatePresence>
      {sst && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSelectedSST(null)}
          />

          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, scale: 0.85, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 24 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className={`relative z-10 bg-card border ${LEVEL_BORDER[Math.min(sst.level, LEVEL_BORDER.length - 1)]} rounded-xl shadow-2xl p-5 min-w-[320px] max-w-[420px]`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-sm font-bold font-mono ${LEVEL_COLORS[Math.min(sst.level, LEVEL_COLORS.length - 1)]}`}
                >
                  {sst.id}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  Level {sst.level}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {sst.size} entries
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 shrink-0"
                onClick={() => setSelectedSST(null)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground mb-3 font-mono">
              Key range: [{sst.minKey} .. {sst.maxKey}]
            </div>

            {foundKey && (
              <div className="text-[11px] text-yellow-400 mb-2 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                Found key: <span className="font-mono font-bold">{foundKey}</span>
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/30">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <span>Key</span>
                <span>Value</span>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                <div className="divide-y divide-border/50">
                  {sst.entries.map((entry, i) => (
                    <motion.div
                      key={entry.key}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.025, 0.3) }}
                      className={`flex justify-between items-center text-[11px] font-mono px-3 py-1.5 ${
                        entry.key === foundKey
                          ? 'bg-yellow-500/15 ring-1 ring-inset ring-yellow-500/30'
                          : 'hover:bg-muted/50'
                      } ${entry.deleted ? 'text-red-400 line-through opacity-60' : 'text-foreground'}`}
                    >
                      <span className="text-muted-foreground">{entry.key}</span>
                      <span>{entry.deleted ? 'TOMBSTONE' : entry.value}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
