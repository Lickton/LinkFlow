interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const todayLabel = new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());

  return (
    <header className="mb-4 border-b border-slate-200 pb-3 md:mb-6 md:pb-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-[0.01em] text-slate-900 sm:text-3xl">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p> : null}
        </div>
        <p className="shrink-0 text-xs font-medium text-slate-500 sm:text-sm">{todayLabel}</p>
      </div>
    </header>
  );
}
