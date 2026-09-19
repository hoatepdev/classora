export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}) {
  return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-.025em] text-[#0f172a] md:text-[2rem]">{title}</h1>
      {description && <p className="mt-1.5 mb-0 max-w-2xl text-sm leading-6 text-[#64748b]">{description}</p>}
    </div>
    {(primaryAction || secondaryActions) && <div className="flex shrink-0 flex-wrap items-center gap-3">
      {secondaryActions}
      {primaryAction}
    </div>}
  </div>;
}
