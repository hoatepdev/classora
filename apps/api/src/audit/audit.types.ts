import type { PoolClient } from 'pg';
import type { Prisma } from '../generated/prisma/client.js';

export type AuditJson = Record<string, unknown>;

export type AuditRecordInput = {
  tenantId: string;
  actorUserId?: string | null;
  actorMembershipId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: AuditJson | null;
  after?: AuditJson | null;
  reason?: string | null;
  requestId?: string | null;
  metadata?: AuditJson | null;
  occurredAt?: Date;
};

export type AuditEvent = Omit<AuditRecordInput, 'occurredAt'> & {
  id: string;
  occurredAt: string;
  source: 'control' | 'tenant';
};

export type AuditCursorPosition = {
  occurredAt: string;
  id: string;
};

export type AuditTransaction = Prisma.TransactionClient | PoolClient;

export type AuditFilter = {
  tenantId: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit: number;
};
