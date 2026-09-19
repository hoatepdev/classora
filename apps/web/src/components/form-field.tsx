import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function FormField({ id, label, required, error, full, children }: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  return <div className={cn("field", full && "full")}>
    <Label htmlFor={id}>{label}{required && <span className="required"> *</span>}</Label>
    {children}
    {error && <p className="field-error" id={errorId}>{error}</p>}
  </div>;
}
