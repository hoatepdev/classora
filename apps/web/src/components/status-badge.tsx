import { Badge, badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type Status = "ACTIVE" | "DISABLED" | "WITHDRAWN" | "OPEN" | "COMPLETED" | "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "PENDING" | "TRIAL" | "PAUSED" | "CANCELLED" | "RESCHEDULED" | "SCHEDULED";
type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const variants: Record<Status, BadgeVariant> = {
  ACTIVE: "active",
  PRESENT: "active",
  OPEN: "info",
  LATE: "warning",
  EXCUSED: "info",
  ABSENT: "danger",
  DISABLED: "inactive",
  WITHDRAWN: "inactive",
  COMPLETED: "inactive",
  PENDING: "info",
  TRIAL: "warning",
  PAUSED: "warning",
  CANCELLED: "inactive",
  RESCHEDULED: "warning",
  SCHEDULED: "info",
};

export function StatusBadge({ status, children }: { status: Status; children: React.ReactNode }) {
  return <Badge variant={variants[status]}>{children}</Badge>;
}
