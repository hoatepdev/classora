import { Button } from "@/components/ui/button";
import { CircleAlert } from "lucide-react";

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <div className="rounded-xl border border-[#efc5c0] bg-[#fffafa] px-5 py-12 text-center text-sm text-[#8d231b]" role="alert">
    <CircleAlert className="mx-auto mb-4" size={28} strokeWidth={1.8} aria-hidden="true" />
    <strong className="block text-base text-[#8d231b]">{title}</strong>
    <p className="mt-1 mb-0">{message}</p>
    {onRetry && <Button className="mt-5" variant="secondary" onClick={onRetry}>Thử lại</Button>}
  </div>;
}
