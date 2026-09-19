import type { LucideIcon } from "lucide-react";

export function EmptyState({ title, description, action, icon: Icon }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return <div className="state">
    {Icon && <Icon className="mx-auto mb-4 text-[#596278]" size={28} strokeWidth={1.8} aria-hidden="true" />}
    <strong>{title}</strong>
    {description && <p className="m-0">{description}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>;
}
