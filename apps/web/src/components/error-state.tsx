import { Button } from "@/components/ui/button";
import { CircleAlert } from "lucide-react";

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <div className="state error" role="alert">
    <CircleAlert className="mx-auto mb-4" size={28} strokeWidth={1.8} aria-hidden="true" />
    <strong>{title}</strong>
    <p className="m-0">{message}</p>
    {onRetry && <Button className="mt-5" variant="secondary" onClick={onRetry}>Thử lại</Button>}
  </div>;
}
