import { useLSMStore } from '@/store/lsm-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Database, Shuffle } from 'lucide-react';

export function StartScreen() {
  const start = useLSMStore((s) => s.start);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            LSM Tree Visualizer
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
            Interactive visualization of Log-Structured Merge Trees with SSTables,
            as used in RocksDB, Apache Cassandra, LevelDB, and other key-value stores.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:scale-[1.02]"
            onClick={() => start(false)}
          >
            <CardHeader className="pb-2">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-base">Start from Scratch</CardTitle>
              <CardDescription className="text-xs">
                Begin with an empty LSM tree. Insert keys manually and watch the
                data flow through MemTable, flush to SSTables, and trigger compactions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Empty Tree
              </Button>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 hover:scale-[1.02]"
            onClick={() => start(true)}
          >
            <CardHeader className="pb-2">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <Shuffle className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-base">Sample Data</CardTitle>
              <CardDescription className="text-xs">
                Pre-populate with ~30 random key-value pairs, triggering flushes
                and compactions so you can explore a populated tree immediately.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                Random Data
              </Button>
            </CardContent>
          </Card>
        </div>

        <p className="text-[10px] text-muted-foreground pt-4">
          Configure MemTable size, compaction strategy, level multiplier, and more after starting.
        </p>
      </div>
    </div>
  );
}
