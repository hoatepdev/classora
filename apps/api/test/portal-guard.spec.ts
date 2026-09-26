import { ForbiddenException } from '@nestjs/common';
import { PortalAccessGuard } from '../src/portal/portal-access.guard.js';
import { PortalAccessStatus, PortalSubjectType } from '../src/generated/prisma/enums.js';

function context(request: Record<string, unknown>, portal = true) {
  return { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => ({}), getClass: () => ({ portal }) } as never;
}

it('derives guardian children and billing scope from current tenant relationships', async () => {
  const request = { user: { id: 'user' }, hostname: 'demo.classora.io.vn' };
  const pool = { query: vi.fn(async (sql: string) => {
    if (sql.includes('FROM guardians')) return { rows: [{ id: 'guardian', name: 'Parent' }] };
    if (sql.includes('FROM students') && !sql.includes('student_guardians')) return { rows: [] };
    return { rows: [{ id: 'student', code: 'ST-1', fullName: 'Student', guardianId: 'guardian', billing: true }] };
  }) };
  const guard = new PortalAccessGuard(
    { getAllAndOverride: vi.fn(() => true) } as never,
    { resolve: vi.fn(async () => ({ tenantId: 'tenant', tenantSlug: 'demo', dbName: 'tenant_db' })) } as never,
    { getConnection: vi.fn(async () => pool), releaseConnection: vi.fn() } as never,
    { portalAccess: { findMany: vi.fn(async () => [{ id: 'access', subjectType: PortalSubjectType.GUARDIAN, subjectId: 'guardian' }]) } } as never,
  );
  await expect(guard.canActivate(context(request))).resolves.toBe(true);
  expect(request).toMatchObject({ portal: { students: [{ id: 'student', billingGuardianSubjectIds: ['guardian'] }] } });
});

it('blocks disabled or absent access before opening a tenant database', async () => {
  const connections = { getConnection: vi.fn(), releaseConnection: vi.fn() };
  const guard = new PortalAccessGuard(
    { getAllAndOverride: vi.fn(() => true) } as never,
    { resolve: vi.fn(async () => ({ tenantId: 'tenant', tenantSlug: 'demo', dbName: 'tenant_db' })) } as never,
    connections as never,
    { portalAccess: { findMany: vi.fn(async ({ where }) => { expect(where.status).toBe(PortalAccessStatus.ACTIVE); return []; }) } } as never,
  );
  await expect(guard.canActivate(context({ user: { id: 'user' }, hostname: 'demo.classora.io.vn' }))).rejects.toBeInstanceOf(ForbiddenException);
  expect(connections.getConnection).not.toHaveBeenCalled();
});
