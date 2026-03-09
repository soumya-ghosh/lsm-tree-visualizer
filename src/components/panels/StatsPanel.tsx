import { useLSMStore } from '@/store/lsm-store';
import { DraggablePanel } from './DraggablePanel';

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-mono text-foreground">{value}</span>
    </div>
  );
}

export function StatsPanel() {
  const snapshot = useLSMStore((s) => s.snapshot);
  const { stats, levels, memtable } = snapshot;

  const totalSSTs = levels.reduce((acc, l) => acc + l.length, 0);
  const totalEntries =
    memtable.length +
    levels.reduce((acc, l) => acc + l.reduce((a, s) => a + s.size, 0), 0);

  return (
    <DraggablePanel title="Statistics" defaultPosition={{ x: 16, y: 660 }}>
      <div className="space-y-1.5 w-[200px]">
        <StatRow label="Total Puts" value={stats.totalPuts} />
        <StatRow label="Total Gets" value={stats.totalGets} />
        <StatRow label="Total Deletes" value={stats.totalDeletes} />

        <div className="h-px bg-border my-1" />

        <StatRow label="Flushes" value={stats.totalFlushes} />
        <StatRow label="Compactions" value={stats.totalCompactions} />
        <StatRow label="Total SSTables" value={totalSSTs} />
        <StatRow label="Total Entries" value={totalEntries} />

        <div className="h-px bg-border my-1" />

        <StatRow label="Write Amp" value={`${stats.writeAmplification}x`} />
        <StatRow label="Read Amp" value={`${stats.readAmplification}x`} />
        <StatRow label="Space Amp" value={`${stats.spaceAmplification}x`} />

        <div className="h-px bg-border my-1" />

        {levels.map((level, i) =>
          level.length > 0 ? (
            <StatRow key={i} label={`L${i} SSTables`} value={level.length} />
          ) : null,
        )}
      </div>
    </DraggablePanel>
  );
}
