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
    <header className="mb-6 border-b border-slate-200 pb-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-[0.01em] text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p> : null}
        </div>
        <p className="shrink-0 text-sm font-medium text-slate-500">{todayLabel}</p>
      </div>
    </header>
  );
}
