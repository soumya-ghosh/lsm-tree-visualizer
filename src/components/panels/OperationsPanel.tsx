import { useState } from 'react';
import { useLSMStore } from '@/store/lsm-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DraggablePanel } from './DraggablePanel';

export function OperationsPanel() {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [bulkCount, setBulkCount] = useState(10);

  const put = useLSMStore((s) => s.put);
  const get = useLSMStore((s) => s.get);
  const del = useLSMStore((s) => s.del);
  const bulkInsert = useLSMStore((s) => s.bulkInsert);
  const manualFlush = useLSMStore((s) => s.manualFlush);
  const lastGetResult = useLSMStore((s) => s.lastGetResult);
  const clearHighlight = useLSMStore((s) => s.clearHighlight);
  const searchAnimation = useLSMStore((s) => s.searchAnimation);

  const handlePut = () => {
    if (!key.trim()) return;
    put(key.trim(), value.trim() || 'null');
    setKey('');
    setValue('');
  };

  const handleGet = () => {
    if (!key.trim()) return;
    get(key.trim());
  };

  const handleDelete = () => {
    if (!key.trim()) return;
    del(key.trim());
    setKey('');
    setValue('');
  };

  return (
    <DraggablePanel title="Operations" defaultPosition={{ x: 16, y: 340 }}>
      <div className="space-y-3 w-[220px]">
        <div className="space-y-1.5">
          <Label className="text-[11px]">Key</Label>
          <Input
            className="h-7 text-xs font-mono"
            placeholder="e.g. user:001"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePut()}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px]">Value</Label>
          <Input
            className="h-7 text-xs font-mono"
            placeholder="e.g. alpha"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1 h-7 text-[11px]" onClick={handlePut}>
            Put
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 h-7 text-[11px]" onClick={handleGet}>
            Get
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 h-7 text-[11px]" onClick={handleDelete}>
            Delete
          </Button>
        </div>

        {searchAnimation?.active && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 text-[11px] space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-400 font-medium">Searching...</span>
              <span className="font-mono text-muted-foreground ml-auto">
                {searchAnimation.steps[searchAnimation.currentStepIndex]}
              </span>
            </div>
          </div>
        )}

        {lastGetResult && !searchAnimation?.active && (
          <div className="rounded-md border bg-muted/50 p-2 text-[11px] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-muted-foreground">GET {lastGetResult.key}</span>
              <Badge variant={lastGetResult.found ? 'default' : 'destructive'} className="text-[9px]">
                {lastGetResult.found ? 'FOUND' : 'NOT FOUND'}
              </Badge>
            </div>
            {lastGetResult.found && (
              <div className="font-mono text-foreground">{lastGetResult.value}</div>
            )}
            <div className="text-[9px] text-muted-foreground">
              Path: {lastGetResult.path.join(' → ')}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 text-[9px] w-full"
              onClick={clearHighlight}
            >
              Clear highlight
            </Button>
          </div>
        )}

        <Separator />

        <div className="space-y-1.5">
          <Label className="text-[11px]">Bulk Insert</Label>
          <div className="flex gap-1.5">
            <Input
              className="h-7 text-xs w-16"
              type="number"
              min={1}
              max={100}
              value={bulkCount}
              onChange={(e) => setBulkCount(Number(e.target.value))}
            />
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-[11px]"
              onClick={() => bulkInsert(bulkCount)}
            >
              Insert Random
            </Button>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-[11px]"
          onClick={manualFlush}
        >
          Manual Flush
        </Button>
      </div>
    </DraggablePanel>
  );
}
