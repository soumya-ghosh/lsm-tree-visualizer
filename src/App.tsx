import { useLSMStore } from '@/store/lsm-store';
import { StartScreen } from '@/components/StartScreen';
import { Visualizer } from '@/components/Visualizer';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function App() {
  const started = useLSMStore((s) => s.started);

  return (
    <TooltipProvider>
      {started ? <Visualizer /> : <StartScreen />}
    </TooltipProvider>
  );
}
