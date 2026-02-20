import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

interface AppLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function AppLayout({ sidebar, main }: AppLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startWidth: 320,
  });

  useEffect(() => {
    const minWidth = 240;
    const maxWidth = 520;

    const onMouseMove = (event: MouseEvent) => {
      if (!dragRef.current.active) {
        return;
      }

      const delta = event.clientX - dragRef.current.startX;
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, dragRef.current.startWidth + delta));
      setSidebarWidth(nextWidth);
    };

    const onMouseUp = () => {
      if (!dragRef.current.active) {
        return;
      }

      dragRef.current.active = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const handleDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="flex min-h-screen w-screen bg-linkflow-app">
      <div className="flex h-screen w-full min-w-0 flex-1 overflow-hidden bg-white">
        <div className="h-full shrink-0 min-w-0" style={{ width: `${sidebarWidth}px` }}>
          {sidebar}
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          onMouseDown={handleDragStart}
          className="group relative h-full w-3 shrink-0 cursor-col-resize bg-transparent"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:bg-blue-400" />
        </div>
        <div className="min-w-0 flex-1">{main}</div>
      </div>
    </div>
  );
}
