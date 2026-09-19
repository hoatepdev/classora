import type { LucideIcon } from "lucide-react";

export function EmptyState({ title, description, action, icon: Icon }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return <div className="rounded-xl border border-dashed border-[#cbd1d9] bg-white px-5 py-12 text-center text-sm text-[#667085]">
    {Icon && <Icon className="mx-auto mb-4 text-[#596278]" size={28} strokeWidth={1.8} aria-hidden="true" />}
    <strong className="block text-base text-[#202944]">{title}</strong>
    {description && <p className="mt-1 mb-0">{description}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>;
}
