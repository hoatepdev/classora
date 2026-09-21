import { AuditService } from '../src/audit/audit.service.js';

type Row = {
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
  occurredAt: Date;
};

const tenantId = '01JHZX3V8Q9K5M2N7R4T6W1Y0A';
const tenant = { tenantId, tenantSlug: 'alpha', dbName: 'classora_tenant_alpha' };

function row(id: string, occurredAt: string, source: 'control' | 'tenant'): Row {
  return {
    id,
    tenantId,
    actorUserId: '01JHZX3V8Q9K5M2N7R4T6W1Y0B',
    actorMembershipId: '01JHZX3V8Q9K5M2N7R4T6W1Y0D',
    actorName: 'Owner',
    actorEmail: 'owner@example.com',
    action: source === 'control' ? 'membership.role_changed' : 'student.updated',
    entityType: source === 'control' ? 'MEMBERSHIP' : 'STUDENT',
    entityId: id,
    before: { status: 'ACTIVE' },
    after: { status: 'DISABLED' },
    reason: null,
    requestId: 'request-1',
    metadata: null,
    occurredAt: new Date(occurredAt),
  };
}

describe('audit service', () => {
  it('redacts secret-shaped fields before control persistence', async () => {
    const create = vi.fn(async (input: { data: Record<string, unknown> }) => input.data);
    const service = new AuditService(
      { auditEvent: { create } } as never,
      { get: () => ({ tenant, pool: { query: vi.fn() } }) } as never,
    );

    await service.recordControl({ auditEvent: { create } } as never, {
      tenantId,
      action: 'student.created',
      entityType: 'STUDENT',
      before: { password: 'pw', nested: { jwtToken: 'jwt', displayName: 'Safe' } },
      after: { apiKey: 'key', connectionString: 'postgresql://secret', email: 'safe@example.com' },
      metadata: { invitationToken: 'token', note: 'Safe metadata' },
    });

    const data = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.before).toEqual({ nested: { displayName: 'Safe' } });
    expect(data.after).toEqual({ email: 'safe@example.com' });
    expect(data.metadata).toEqual({ note: 'Safe metadata' });
  });

  it('redacts secret-shaped fields before tenant persistence', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const service = new AuditService(
      { auditEvent: { create: vi.fn() } } as never,
      { get: () => ({ tenant, pool: { query } }) } as never,
    );

    await service.recordTenant({ query } as never, {
      tenantId,
      action: 'student.created',
      entityType: 'STUDENT',
      after: { fullName: 'Student', passwordHash: 'hash', secretValue: 'secret' },
    });

    const params = query.mock.calls[0][1] as string[];
    expect(JSON.parse(params[10])).toEqual({ fullName: 'Student' });
  });

  it('merges tenant and control events newest first and returns a filter-bound cursor', async () => {
    const controlRows = [row('01JHZX3V8Q9K5M2N7R4T6W1Y0F', '2026-09-21T10:00:03.000Z', 'control'), row('01JHZX3V8Q9K5M2N7R4T6W1Y0E', '2026-09-21T10:00:01.000Z', 'control')];
    const tenantRows = [row('01JHZX3V8Q9K5M2N7R4T6W1Y0G', '2026-09-21T10:00:02.000Z', 'tenant')];
    const queryRaw = vi.fn(async () => controlRows.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString().replace(/\.\d{3}Z$/, '.000000Z') })));
    const service = new AuditService(
      { auditEvent: { create: vi.fn(), findFirst: vi.fn() }, $queryRaw: queryRaw } as never,
      { get: () => ({ tenant, pool: { query: vi.fn(async () => ({ rows: tenantRows })) } }) } as never,
    );

    const page = await service.list({ tenantId, limit: 2 });
    expect(page.data.map((event) => event.id)).toEqual([controlRows[0].id, tenantRows[0].id]);
    expect(page.nextCursor).toBeTruthy();

    await expect(service.list({ tenantId, limit: 2, action: 'student.created', cursor: page.nextCursor! })).rejects.toThrow('does not match filters');
  });

  it('rejects a query outside the trusted tenant context', async () => {
    const service = new AuditService(
      { auditEvent: { create: vi.fn() }, $queryRaw: vi.fn() } as never,
      { get: () => ({ tenant, pool: { query: vi.fn() } }) } as never,
    );

    await expect(service.list({ tenantId: '01JHZX3V8Q9K5M2N7R4T6W1Y0C', limit: 10 })).rejects.toThrow('Invalid tenant scope');
  });
});
