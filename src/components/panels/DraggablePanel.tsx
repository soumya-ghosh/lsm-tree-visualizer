import { type ReactNode, useRef, useState, useCallback } from 'react';
import { GripVertical } from 'lucide-react';

interface DraggablePanelProps {
  title: string;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  className?: string;
}

export function DraggablePanel({
  title,
  children,
  defaultPosition = { x: 16, y: 16 },
  className = '',
}: DraggablePanelProps) {
  const [pos, setPos] = useState(defaultPosition);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
      };

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current) return;
        setPos({
          x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
          y: dragRef.current.origY + (ev.clientY - dragRef.current.startY),
        });
      };

      const onUp = () => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [pos],
  );

  return (
    <div
      className={`absolute z-50 rounded-lg border bg-card/95 backdrop-blur-sm shadow-xl ${className}`}
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center gap-1 px-3 py-2 border-b cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onPointerDown}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground flex-1">{title}</span>
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▼' : '▲'}
        </button>
      </div>
      {!collapsed && <div className="p-3">{children}</div>}
    </div>
  );
}
