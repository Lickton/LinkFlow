import type { ReactNode } from 'react';

interface AppLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
}

export function AppLayout({ sidebar, main }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-linkflow-app p-4 sm:p-6">
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-7xl overflow-hidden rounded-card bg-white shadow-sm sm:h-[calc(100vh-3rem)]">
        {sidebar}
        {main}
      </div>
    </div>
  );
}
