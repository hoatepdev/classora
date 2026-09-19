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
  return <div className="page-heading">
    <div>
      <h1>{title}</h1>
      {description && <p className="subtitle">{description}</p>}
    </div>
    {(primaryAction || secondaryActions) && <div className="flex flex-wrap items-center gap-3">
      {secondaryActions}
      {primaryAction}
    </div>}
  </div>;
}
