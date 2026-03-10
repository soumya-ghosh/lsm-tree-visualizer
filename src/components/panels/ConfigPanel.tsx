import { useLSMStore } from '@/store/lsm-store';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DraggablePanel } from './DraggablePanel';

export function ConfigPanel() {
  const snapshot = useLSMStore((s) => s.snapshot);
  const updateConfig = useLSMStore((s) => s.updateConfig);
  const { config } = snapshot;

  return (
    <DraggablePanel title="Configuration" defaultPosition={{ x: 16, y: 16 }}>
      <div className="space-y-4 w-[220px]">
        <div className="space-y-1.5">
          <Label className="text-[11px]">
            MemTable Size: <span className="text-primary font-mono">{config.memtableMaxSize}</span>
          </Label>
          <Slider
            value={[config.memtableMaxSize]}
            onValueChange={([v]) => updateConfig({ memtableMaxSize: v })}
            min={2}
            max={32}
            step={1}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">
            Level Multiplier: <span className="text-primary font-mono">{config.levelMultiplier}</span>
          </Label>
          <Slider
            value={[config.levelMultiplier]}
            onValueChange={([v]) => updateConfig({ levelMultiplier: v })}
            min={2}
            max={10}
            step={1}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">
            Max Levels: <span className="text-primary font-mono">{config.maxLevels}</span>
          </Label>
          <Slider
            value={[config.maxLevels]}
            onValueChange={([v]) => updateConfig({ maxLevels: v })}
            min={2}
            max={7}
            step={1}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">
            L0 Compaction Trigger: <span className="text-primary font-mono">{config.l0CompactionTrigger}</span>
          </Label>
          <Slider
            value={[config.l0CompactionTrigger]}
            onValueChange={([v]) => updateConfig({ l0CompactionTrigger: v })}
            min={2}
            max={8}
            step={1}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">
            Base SSTable Size: <span className="text-primary font-mono">{config.baseChunkSize}</span>
          </Label>
          <Slider
            value={[config.baseChunkSize]}
            onValueChange={([v]) => updateConfig({ baseChunkSize: v })}
            min={2}
            max={32}
            step={1}
          />
          <div className="text-[10px] text-muted-foreground font-mono leading-relaxed">
            {Array.from({ length: Math.min(config.maxLevels, 5) }, (_, i) => {
              const size = i === 0
                ? config.memtableMaxSize
                : config.baseChunkSize * Math.pow(2, i);
              return (
                <span key={i} className="mr-2">
                  L{i}:{size}
                </span>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">Compaction Strategy</Label>
          <Select
            value={config.compactionStrategy}
            onValueChange={(v) =>
              updateConfig({ compactionStrategy: v as 'leveled' | 'size-tiered' })
            }
          >
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="leveled">Leveled (RocksDB)</SelectItem>
              <SelectItem value="size-tiered">Size-Tiered (Cassandra)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </DraggablePanel>
  );
}
