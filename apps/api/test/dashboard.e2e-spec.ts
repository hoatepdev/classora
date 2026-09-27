import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

const ids = {
  owner: '01JHZX3V8Q9K5M2N7R4T6W1Y0B',
  accountant: '01JHZX3V8Q9K5M2N7R4T6W1Y0C',
  sale: '01JHZX3V8Q9K5M2N7R4T6W1Y0D',
  teacher: '01JHZX3V8Q9K5M2N7R4T6W1Y0E',
  staff: '01JHZX3V8Q9K5M2N7R4T6W1Y0F',
  portalOnly: '01JHZX3V8Q9K5M2N7R4T6W1Y0G',
};
const tenant = { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A', slug: 'alpha', dbName: 'classora_tenant_alpha' };
const users: Record<string, { id: string; email: string; name: string; status: string }> = {
  [ids.owner]: { id: ids.owner, email: 'owner@example.com', name: 'Owner', status: 'ACTIVE' },
  [ids.accountant]: { id: ids.accountant, email: 'accountant@example.com', name: 'Accountant', status: 'ACTIVE' },
  [ids.sale]: { id: ids.sale, email: 'sale@example.com', name: 'Sale', status: 'ACTIVE' },
  [ids.teacher]: { id: ids.teacher, email: 'teacher@example.com', name: 'Teacher', status: 'ACTIVE' },
  [ids.staff]: { id: ids.staff, email: 'staff@example.com', name: 'Staff', status: 'ACTIVE' },
  [ids.portalOnly]: { id: ids.portalOnly, email: 'portal@example.com', name: 'Portal', status: 'ACTIVE' },
};
const roles: Record<string, string> = {
  [ids.owner]: 'OWNER',
  [ids.accountant]: 'ACCOUNTANT',
  [ids.sale]: 'SALE',
  [ids.teacher]: 'TEACHER',
  [ids.staff]: 'STAFF',
};

function dashboardPool(empty = false) {
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (empty) {
      if (sql.includes('FROM leads WHERE')) return { rows: [{ activeLeadCount: 0, NEW: 0, CONTACTED: 0, QUALIFIED: 0, TRIAL_BOOKED: 0, TRIAL_COMPLETED: 0, overdueFollowUpCount: 0, followUpsTodayCount: 0, wonThisMonthCount: 0 }] };
      if (sql.includes('FROM trial_bookings')) return { rows: [{ count: 0 }] };
      if (sql.includes('FROM compensation_periods')) return { rows: [{ draftPeriodCount: 0, unresolvedIssueCount: 0, latestFinalizedPayableVnd: 0 }] };
      if (sql.includes('FROM attendance_sessions WHERE tenant_id=$1 AND session_date')) return { rows: [{ total: 0, scheduled: 0, completed: 0, cancelled: 0, rescheduled: 0 }] };
      if (sql.includes('FROM students WHERE') || sql.includes('FROM classes WHERE') || sql.includes('FROM makeup_entitlements')) return { rows: [{ count: 0 }] };
      return { rows: [] };
    }
    if (sql.includes('FROM students WHERE tenant_id=$1 AND status')) return { rows: [{ count: 3 }] };
    if (sql.includes('FROM classes WHERE')) return { rows: [{ count: 2 }] };
    if (sql.includes('FROM attendance_sessions WHERE tenant_id=$1 AND session_date')) return { rows: [{ total: 5, scheduled: 2, completed: 2, cancelled: 1, rescheduled: 0 }] };
    if (sql.includes("a.status='SCHEDULED' AND (a.session_date + a.start_time)") && sql.includes('LIMIT 6')) {
      return { rows: [{ id: '01JHZX3V8Q9K5M2N7R4T6W1Y10', date: '2026-09-28', startTime: '18:00:00', endTime: '20:00:00', classId: '01JHZX3V8Q9K5M2N7R4T6W1Y11', className: 'IELTS Advanced', teacherName: 'Teacher A', roomName: 'R101', branchName: 'Main', status: 'SCHEDULED' }] };
    }
    if (sql.includes('attendance_sheets sh')) {
      return { rows: [{ total: 2, id: '01JHZX3V8Q9K5M2N7R4T6W1Y12', date: '2026-09-28', endTime: '09:00:00', className: 'IELTS Advanced' }, { total: 2, id: '01JHZX3V8Q9K5M2N7R4T6W1Y13', date: '2026-09-27', endTime: '20:00:00', className: 'Kids English' }] };
    }
    if (sql.includes('FROM makeup_entitlements')) return { rows: [{ count: 4 }] };
    if (sql.includes('FROM assessments a')) return { rows: [{ total: 1, id: '01JHZX3V8Q9K5M2N7R4T6W1Y14', title: 'Mid-term', classId: '01JHZX3V8Q9K5M2N7R4T6W1Y11', className: 'IELTS Advanced' }] };
    if (sql.includes('FROM progress_reports r')) return { rows: [{ total: 2, id: '01JHZX3V8Q9K5M2N7R4T6W1Y15', title: 'Q3 report', studentId: '01JHZX3V8Q9K5M2N7R4T6W1Y16', studentName: 'Student A' }] };
    if (sql.includes('FROM compensation_periods')) return { rows: [{ draftPeriodCount: 1, unresolvedIssueCount: 2, latestFinalizedPayableVnd: 12000000 }] };
    if (sql.includes('FROM leads WHERE tenant_id=$1')) return { rows: [{ activeLeadCount: 6, NEW: 2, CONTACTED: 1, QUALIFIED: 1, TRIAL_BOOKED: 1, TRIAL_COMPLETED: 1, overdueFollowUpCount: 2, followUpsTodayCount: 1, wonThisMonthCount: 3 }] };
    if (sql.includes('FROM leads l WHERE')) {
      return { rows: [
        { leadId: '01JHZX3V8Q9K5M2N7R4T6W1Y17', studentName: 'Lead A', status: 'CONTACTED', assignedMembershipId: null, nextFollowUpAt: new Date('2026-09-27T02:00:00Z') },
        { leadId: '01JHZX3V8Q9K5M2N7R4T6W1Y18', studentName: 'Lead B', status: 'QUALIFIED', assignedMembershipId: 'membership-1', nextFollowUpAt: new Date('2026-09-28T04:00:00Z') },
      ] };
    }
    if (sql.includes('COUNT(*)::int AS count FROM trial_bookings')) return { rows: [{ count: 3 }] };
    if (sql.includes('FROM trial_bookings t')) return { rows: [{ id: '01JHZX3V8Q9K5M2N7R4T6W1Y19', leadId: '01JHZX3V8Q9K5M2N7R4T6W1Y17', leadName: 'Lead A', sessionId: '01JHZX3V8Q9K5M2N7R4T6W1Y10', sessionDate: '2026-09-29', startTime: '18:00:00', className: 'IELTS Advanced', status: 'BOOKED' }] };
    if (sql.includes('FROM communication_messages')) return { rows: [{ id: '01JHZX3V8Q9K5M2N7R4T6W1Y1A', date: new Date('2026-09-27T08:00:00Z'), eventType: 'PAYMENT_RECEIVED' }] };
    if (sql.includes('FROM invoices i LEFT JOIN students')) return { rows: [] };
    if (sql.includes('FROM payments p')) return { rows: [] };
    return { rows: [] };
  });
  return { pool: { query } as unknown as Pool, queries };
}

describe('dashboard', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const data = dashboardPool();
  const empty = dashboardPool(true);
  const pools = new Map([
    [tenant.dbName, data.pool],
    ['classora_tenant_empty', empty.pool],
  ]);
  const connections = {
    getConnection: vi.fn(async (dbName: string) => pools.get(dbName)),
    releaseConnection: vi.fn(),
  };
  const database = {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null) },
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => (where.slug === tenant.slug ? { ...tenant, name: 'Alpha' } : where.slug === 'empty' ? { ...tenant, slug: 'empty', dbName: 'classora_tenant_empty' } : null)),
    },
    tenantMembership: {
      findUnique: vi.fn(async ({ where }: { where: { tenantId_userId: { userId: string } } }) => {
        const role = roles[where.tenantId_userId.userId];
        return role ? { id: `membership-${role}`, role } : null;
      }),
      findMany: vi.fn(async () => [{ id: 'membership-1', user: { name: 'Seller Hoa' } }]),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ControlDatabaseService)
      .useValue(database)
      .overrideProvider(TenantConnectionManager)
      .useValue(connections)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jwt = app.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => {
    vi.clearAllMocks();
    data.queries.length = 0;
  });

  const token = (userId: string) => jwt.signAsync({ sub: userId });
  const get = async (userId: string, slug = tenant.slug) => request(app.getHttpServer()).get('/dashboard').set('Authorization', `Bearer ${await token(userId)}`).set('Host', `${slug}.classora.io.vn`);

  it('rejects unauthenticated requests', async () => {
    const response = await request(app.getHttpServer()).get('/dashboard').set('Host', `${tenant.slug}.classora.io.vn`);
    expect(response.status).toBe(401);
  });

  it('rejects portal-only users without a staff membership', async () => {
    const response = await get(ids.portalOnly);
    expect(response.status).toBe(403);
  });

  it('returns every authorized section for the owner', async () => {
    const response = await get(ids.owner);
    expect(response.status).toBe(200);
    expect(response.body.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(response.body.sections.academic.activeStudentCount).toBe(3);
    expect(response.body.sections.academic.sessionsToday).toMatchObject({ total: 5, scheduled: 2, completed: 2, cancelled: 1, rescheduled: 0 });
    expect(response.body.sections.academic.pendingAttendanceCount).toBe(2);
    expect(response.body.sections.academic.availableMakeupCount).toBe(4);
    expect(response.body.sections.academic.draftAssessmentCount).toBe(1);
    expect(response.body.sections.academic.draftProgressReportCount).toBe(2);
    expect(response.body.sections.finance.billing).toMatchObject({ outstandingVnd: '0', overdueVnd: '0', collectedThisMonthVnd: '0' });
    expect(response.body.sections.finance.compensation).toMatchObject({ draftPeriodCount: 1, unresolvedIssueCount: 2, latestFinalizedPayableVnd: '12000000' });
    expect(response.body.sections.growth.activeLeadCount).toBe(6);
    expect(response.body.sections.growth.followUps[0]).toMatchObject({ leadId: '01JHZX3V8Q9K5M2N7R4T6W1Y17', assigneeName: null });
    expect(response.body.sections.growth.followUps[1].assigneeName).toBe('Seller Hoa');
    expect(Array.isArray(response.body.sections.attention)).toBe(true);
    expect(response.body.sections.attention.length).toBeGreaterThan(0);
  });

  it('omits academic and growth aggregates for the accountant', async () => {
    const response = await get(ids.accountant);
    expect(response.status).toBe(200);
    const body = JSON.stringify(response.body);
    expect(response.body.sections.academic).toBeUndefined();
    expect(response.body.sections.growth).toBeUndefined();
    expect(response.body.sections.finance.billing).toBeDefined();
    expect(body).not.toContain('activeStudentCount');
    expect(body).not.toContain('sessionsToday');
    expect(body).not.toContain('pendingAttendanceCount');
    expect(body).not.toContain('availableMakeupCount');
    expect(body).not.toContain('draftAssessmentCount');
    expect(body).not.toContain('draftProgressReportCount');
    expect(body).not.toContain('pipeline');
    expect(body).not.toContain('activeLeadCount');
  });

  it('omits finance, academic, and communication data for sale', async () => {
    const response = await get(ids.sale);
    expect(response.status).toBe(200);
    const body = JSON.stringify(response.body);
    expect(response.body.sections.academic).toBeUndefined();
    expect(response.body.sections.finance).toBeUndefined();
    expect(response.body.sections.growth.activeLeadCount).toBe(6);
    expect(body).not.toContain('outstandingVnd');
    expect(body).not.toContain('overdueReceivables');
    expect(body).not.toContain('sessionsToday');
    expect(body).not.toContain('pendingAttendanceCount');
    const ranFinanceOrAcademic = data.queries.some((sql) => sql.includes('FROM invoices') || sql.includes('FROM students WHERE tenant_id=$1 AND status') || sql.includes('attendance_sheets sh') || sql.includes('FROM makeup_entitlements') || sql.includes('FROM communication_messages'));
    expect(ranFinanceOrAcademic).toBe(false);
  });

  it('shows only academic data for the teacher and staff roles', async () => {
    for (const userId of [ids.teacher, ids.staff]) {
      const response = await get(userId);
      expect(response.status).toBe(200);
      expect(response.body.sections.academic).toBeDefined();
      expect(response.body.sections.finance).toBeUndefined();
      expect(response.body.sections.growth).toBeUndefined();
    }
    const teacherResponse = await get(ids.teacher);
    expect(teacherResponse.body.sections.academic.draftAssessmentCount).toBe(1);
    const staffResponse = await get(ids.staff);
    expect(staffResponse.body.sections.academic).not.toHaveProperty('draftAssessmentCount');
    expect(staffResponse.body.sections.academic).not.toHaveProperty('draftProgressReportCount');
  });

  it('renders a valid zero state for an empty tenant', async () => {
    const response = await get(ids.owner, 'empty');
    expect(response.status).toBe(200);
    expect(response.body.sections.academic.activeStudentCount).toBe(0);
    expect(response.body.sections.academic.sessionsToday.total).toBe(0);
    expect(response.body.sections.finance.billing.outstandingVnd).toBe('0');
    expect(response.body.sections.growth.activeLeadCount).toBe(0);
    expect(response.body.sections.attention).toEqual([]);
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('undefined');
  });
});
