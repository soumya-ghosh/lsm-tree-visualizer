import { useEffect, useState } from 'react';
import { useLSMStore } from '@/store/lsm-store';
import { StartScreen } from '@/components/StartScreen';
import { Visualizer } from '@/components/Visualizer';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Github, Star } from 'lucide-react';

const GITHUB_URL = 'https://github.com/soumya-ghosh/lsm-tree-visualizer';
const GITHUB_API = 'https://api.github.com/repos/soumya-ghosh/lsm-tree-visualizer';

export default function App() {
  const started = useLSMStore((s) => s.started);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch(GITHUB_API)
      .then((r) => r.json())
      .then((data) => (typeof data.stargazers_count === 'number' ? setStars(data.stargazers_count) : null))
      .catch(() => {});
  }, []);

  return (
    <TooltipProvider>
      <div className="fixed top-4 right-4 z-[100] flex items-center gap-2">
        <ThemeToggle />
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border shadow-lg text-foreground hover:bg-muted/80 hover:border-primary/50 transition-all"
          aria-label="View on GitHub"
        >
          <Github className="w-6 h-6 shrink-0" />
          {stars !== null && (
            <span className="flex items-center gap-1 text-sm font-medium">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              {stars}
            </span>
          )}
        </a>
      </div>
      {started ? <Visualizer /> : <StartScreen />}
    </TooltipProvider>
  );
}
