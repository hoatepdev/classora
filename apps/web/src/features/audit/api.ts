import { api } from "@/lib/api";

export type AuditEvent = {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
  source: "control" | "tenant";
};

export type AuditFilters = { actorUserId?: string; action?: string; entityType?: string; from?: string; to?: string; cursor?: string; limit?: number };
export type AuditResponse = { data: AuditEvent[]; nextCursor: string | null };
export const auditQueryKey = (filters: AuditFilters = {}) => ["audit", window.location.hostname, filters] as const;
export async function listAuditEvents(filters: AuditFilters = {}) { return (await api.get<AuditResponse>("/audit", { params: filters })).data; }
export async function getAuditEvent(id: string) { return (await api.get<AuditEvent>(`/audit/${id}`)).data; }
