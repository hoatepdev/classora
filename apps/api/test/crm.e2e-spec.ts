import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

const user = { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0B', email: 'sale@example.com', name: 'Sale User', status: 'ACTIVE' as const };
const tenants = {
  alpha: { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A', slug: 'alpha', dbName: 'classora_tenant_alpha' },
  beta: { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0C', slug: 'beta', dbName: 'classora_tenant_beta' },
};
const records = {
  alpha: { courseId: '01JHZX3V8Q9K5M2N7R4T6W1Y1A', levelId: '01JHZX3V8Q9K5M2N7R4T6W1Y1B', leadId: '01JHZX3V8Q9K5M2N7R4T6W1Y1C' },
  beta: { courseId: '01JHZX3V8Q9K5M2N7R4T6W1Y2A', leadId: '01JHZX3V8Q9K5M2N7R4T6W1Y2C' },
};

type LeadRecord = {
  id: string;
  tenantId: string;
  status: string;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  guardianName: string | null;
  source: string | null;
  interestedCourseId: string | null;
  interestedCourseLevelId: string | null;
  preferredBranchId: string | null;
  assignedMembershipId: string | null;
  nextFollowUpAt: Date | null;
  lostReason: string | null;
  lostAt: Date | null;
  wonAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const now = () => new Date('2026-10-01T00:00:00.000Z');

function crmPool(tenantId: string) {
  const courses = new Map<string, { id: string; tenantId: string; name: string }>();
  const levels = new Map<string, { id: string; tenantId: string; courseId: string }>();
  const branches = new Map<string, { id: string; tenantId: string }>();
  const leads = new Map<string, LeadRecord>();
  const events: unknown[] = [];
  const notes: unknown[] = [];
  const enrollments = new Map<string, { id: string; tenantId: string; status: string }>();
  const auditEvents: unknown[] = [];
  const ownCourseId = tenantId === tenants.alpha.id ? records.alpha.courseId : records.beta.courseId;
  courses.set(ownCourseId, { id: ownCourseId, tenantId, name: 'IELTS' });
  levels.set(records.alpha.levelId, { id: records.alpha.levelId, tenantId: tenants.alpha.id, courseId: records.alpha.courseId });
  enrollments.set('01JHZX3V8Q9K5M2N7R4T6W1Y1E', { id: '01JHZX3V8Q9K5M2N7R4T6W1Y1E', tenantId, status: 'TRIAL' });

  const leadRow = (lead: LeadRecord) => {
    const record = lead as unknown as Record<string, unknown>;
    const date = (value: unknown) => (value == null ? null : value instanceof Date ? value : new Date(value as string));
    return {
      ...record,
      studentPhone: lead.studentPhone,
      studentEmail: lead.studentEmail,
      guardianName: lead.guardianName,
      guardianPhone: null,
      guardianEmail: null,
      campaign: (record.campaign as string | undefined) ?? null,
      nextFollowUpAt: date(record.nextFollowUpAt ?? null),
      wonAt: date(record.wonAt ?? null),
      lostAt: date(record.lostAt ?? null),
      lostReason: (record.lostReason as string | undefined) ?? null,
      convertedStudentId: null,
      convertedGuardianId: null,
      convertedEnrollmentId: null,
      lostReasonDetail: null,
      interestedCourseName: courses.get(lead.interestedCourseId ?? '')?.name ?? null,
      interestedCourseLevelName: null,
      preferredBranchName: null,
      createdAt: date(record.createdAt ?? lead.createdAt),
      updatedAt: date(record.updatedAt ?? lead.updatedAt),
    };
  };

  const applyUpdate = (map: Map<string, Record<string, unknown>>, sql: string, values: unknown[]) => {
    const target = map.get(values[1] as string);
    if (!target || target.tenantId !== values[0]) return { rows: [] };
    if (sql.includes("status='LOST'")) target.status = 'LOST';
    if (sql.includes("status='TRIAL_BOOKED'")) target.status = 'TRIAL_BOOKED';
    const assignments = [...sql.matchAll(/(\w+)\s*=\s*\$(\d+)(?:::timestamptz)?/g)];
    for (const [, column, index] of assignments) {
      if (Number(index) <= 2) continue;
      const value = values[Number(index) - 1];
      target[column] = value;
      target[column.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase())] = value;
    }
    return { rows: [target] };
  };

  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('INSERT INTO audit_events')) { auditEvents.push(values); return { rows: [] }; }
    if (sql.includes('INSERT INTO lead_events')) { events.push(values); return { rows: [] }; }
    if (sql.includes('INSERT INTO lead_notes')) { notes.push(values); return { rows: [{ id: values[0], createdAt: now() }] }; }

    if (sql.includes('INSERT INTO leads')) {
      const [id, requestedTenantId, studentName, studentPhone, studentEmail, guardianName, , , source, , courseId, levelId, branchId, assignedMembershipId, nextFollowUpAt] = values as (string | Date | null)[];
      const lead: LeadRecord = {
        id: id!, tenantId: requestedTenantId!, status: 'NEW', studentName: studentName!, studentPhone: (studentPhone as string) ?? null,
        studentEmail: (studentEmail as string) ?? null, guardianName: (guardianName as string) ?? null, source: (source as string) ?? null,
        interestedCourseId: (courseId as string) ?? null, interestedCourseLevelId: (levelId as string) ?? null, preferredBranchId: (branchId as string) ?? null,
        assignedMembershipId: (assignedMembershipId as string) ?? null, nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt as string) : null,
        lostReason: null, lostAt: null, wonAt: null, createdAt: now(), updatedAt: now(),
      };
      leads.set(lead.id, lead);
      return { rows: [] };
    }

    if (sql.includes('FROM leads l') && sql.includes('FOR UPDATE')) {
      const [requestedTenantId, id] = values as string[];
      const lead = leads.get(id);
      return { rows: lead?.tenantId === requestedTenantId ? [leadRow(lead)] : [] };
    }
    if (sql.includes('FROM leads l') && sql.includes('l.id = $2')) {
      const [requestedTenantId, id] = values as string[];
      const lead = leads.get(id);
      return { rows: lead?.tenantId === requestedTenantId ? [leadRow(lead)] : [] };
    }
    if (sql.includes('FROM leads l')) {
      const [requestedTenantId] = values as string[];
      return { rows: [...leads.values()].filter((lead) => lead.tenantId === requestedTenantId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(leadRow) };
    }

    if (sql.includes('UPDATE leads')) return applyUpdate(leads as unknown as Map<string, Record<string, unknown>>, sql, values);

    if (sql.includes('FROM lead_notes')) {
      const [requestedTenantId, leadId] = values as string[];
      const lead = leads.get(leadId);
      return { rows: lead?.tenantId === requestedTenantId && notes.length ? [{ id: 'note-1', content: 'note', authorName: 'Sale User', createdAt: now() }] : [] };
    }
    if (sql.includes('FROM lead_events')) {
      const [requestedTenantId, leadId] = values as string[];
      const lead = leads.get(leadId);
      return { rows: lead?.tenantId === requestedTenantId ? events.map((_, index) => ({ id: `event-${index}`, type: 'CREATED', fromStatus: null, toStatus: 'NEW', reason: null, metadata: null, actorMembershipId: null, occurredAt: now() })) : [] };
    }
    if (sql.includes('FROM trial_bookings')) {
      const [requestedTenantId] = values as string[];
      return { rows: tenantId === requestedTenantId ? [] : [] };
    }
    if (sql.includes('FROM attendance_sessions a') && sql.includes('JOIN classes c') && sql.includes('ORDER BY')) {
      return { rows: [] };
    }

    if (sql.includes('SELECT 1 FROM courses')) {
      const [requestedTenantId, courseId] = values as string[];
      const course = courses.get(courseId);
      return { rows: course?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }
    if (sql.includes('FROM course_levels') && sql.includes('course_id AS "courseId"')) {
      const [requestedTenantId, levelId] = values as string[];
      const level = levels.get(levelId);
      return { rows: level?.tenantId === requestedTenantId ? [level] : [] };
    }
    if (sql.includes('SELECT 1 FROM branches')) {
      const [requestedTenantId, branchId] = values as string[];
      const branch = branches.get(branchId);
      return { rows: branch?.tenantId === requestedTenantId ? [{ exists: 1 }] : [] };
    }
    if (sql.includes('FROM courses') && sql.includes("status='ACTIVE'")) return { rows: [...courses.values()].filter((course) => course.tenantId === values[0] as string) };
    if (sql.includes('FROM course_levels') && sql.includes('course_id = ANY')) return { rows: [...levels.values()] };
    if (sql.includes('FROM branches') && sql.includes("status='ACTIVE'")) return { rows: [...branches.values()] };
    if (sql.includes('"courseName"')) return { rows: [] };

    if (sql.includes('FROM enrollments e WHERE e.tenant_id=$1 AND e.id=$2 FOR UPDATE')) {
      const [requestedTenantId, id] = values as string[];
      const enrollment = enrollments.get(id);
      return { rows: enrollment?.tenantId === requestedTenantId ? [enrollment] : [] };
    }
    if (sql.includes('UPDATE enrollments')) {
      const [requestedTenantId, id, status] = values as string[];
      const enrollment = enrollments.get(id);
      if (enrollment?.tenantId === requestedTenantId) enrollment.status = status;
      return { rows: enrollment ? [enrollment] : [] };
    }
    if (sql.includes('INSERT INTO enrollment_events')) return { rows: [] };

    throw new Error(`Unexpected query: ${sql}`);
  });

  const client = { query, release: vi.fn() };
  return { pool: { query, connect: vi.fn(async () => client) } as unknown as Pool, query, leads, events, auditEvents };
}

describe('crm leads', () => {
  let app: INestApplication;
  let token: string;
  let membershipRole = 'SALE';
  const alpha = crmPool(tenants.alpha.id);
  const beta = crmPool(tenants.beta.id);
  const pools = new Map([[tenants.alpha.dbName, alpha.pool], [tenants.beta.dbName, beta.pool]]);
  const connections = {
    getConnection: vi.fn(async (dbName: string) => pools.get(dbName)),
    releaseConnection: vi.fn(),
  };
  const database = {
    user: { findUnique: vi.fn(async () => user) },
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { slug: keyof typeof tenants } }) => {
        const tenant = tenants[where.slug];
        return tenant ? { ...tenant, name: tenant.slug } : null;
      }),
    },
    tenantMembership: {
      findUnique: vi.fn(async () => ({ id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', role: membershipRole, status: 'ACTIVE' })),
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === '01JHZX3V8Q9K5M2N7R4T6W1Y0D' && where.tenantId === tenants.alpha.id
          ? { status: 'ACTIVE' }
          : null,
      ),
      findMany: vi.fn(async () => [{ id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', role: 'SALE', user: { name: 'Sale User' } }]),
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
    token = await app.get(JwtService).signAsync({ sub: user.id });
  });

  afterAll(() => app.close());
  beforeEach(() => { vi.clearAllMocks(); membershipRole = 'SALE'; });

  const authorized = (method: 'get' | 'post' | 'patch', path: string, tenant = 'alpha') =>
    request(app.getHttpServer())[method](path).set('Host', `${tenant}.classora.io.vn`).set('Authorization', `Bearer ${token}`);

  const createLead = (overrides: Record<string, unknown> = {}, tenant = 'alpha') =>
    authorized('post', '/leads', tenant).send({
      studentName: 'An Nguyen',
      studentPhone: '0900111222',
      guardianName: 'Lan Tran',
      source: 'FACEBOOK',
      interestedCourseId: records[tenant as keyof typeof records].courseId,
      ...overrides,
    });

  it('creates a lead with normalized contact data, events, and audit', async () => {
    const created = await createLead({ nextFollowUpAt: '2026-10-02T09:00:00Z', assignedMembershipId: '01JHZX3V8Q9K5M2N7R4T6W1Y0D' }).expect(201);
    expect(created.body).toMatchObject({ status: 'NEW', studentName: 'An Nguyen', studentEmail: null });
    expect(created.body.events.at(-1)).toMatchObject({ type: 'CREATED', toStatus: 'NEW' });

    await authorized('get', '/leads').expect(200).expect(({ body }) => {
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toMatchObject({ studentName: 'An Nguyen', interestedCourseName: 'IELTS' });
    });
    expect(alpha.events).toHaveLength(1);
    expect(alpha.auditEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects invalid lead input and unknown references', async () => {
    await createLead({ studentEmail: 'not-an-email' }).expect(400);
    await createLead({ studentName: '   ' }).expect(400);
    await createLead({ tenantId: tenants.beta.id }).expect(400);
    await createLead({ interestedCourseId: records.beta.courseId }).expect(404);
    await createLead({ interestedCourseId: null, interestedCourseLevelId: records.alpha.levelId }).expect(400);
    await createLead({ interestedCourseId: records.alpha.courseId, interestedCourseLevelId: '01JHZX3V8Q9K5M2N7R4T6W9Z9Z' }).expect(404);
    await createLead({ assignedMembershipId: '01JHZX3V8Q9K5M2N7R4T6W9Z9Y' }).expect(400);
  });

  it('walks the lifecycle through validated transitions and rejects invalid ones', async () => {
    const lead = (await createLead()).body;
    await authorized('post', `/leads/${lead.id}/qualify`).expect(200).expect(({ body }) => expect(body.status).toBe('QUALIFIED'));
    await authorized('post', `/leads/${lead.id}/contact`).expect(409);
    await authorized('post', `/leads/${lead.id}/lost`).send({}).expect(400);
    await authorized('post', `/leads/${lead.id}/lost`).send({ reason: 'PRICE' }).expect(200).expect(({ body }) => expect(body.status).toBe('LOST'));
    await authorized('post', `/leads/${lead.id}/contact`).expect(409);
    await authorized('patch', `/leads/${lead.id}`).send({ studentPhone: '0999' }).expect(409);
    expect(alpha.leads.get(lead.id)?.lostReason).toBe('PRICE');

    const stepped = (await createLead({ studentName: 'Step Lead' })).body;
    await authorized('post', `/leads/${stepped.id}/contact`).expect(200).expect(({ body }) => expect(body.status).toBe('CONTACTED'));
    await authorized('post', `/leads/${stepped.id}/contact`).expect(409);
    await authorized('post', `/leads/${stepped.id}/qualify`).expect(200).expect(({ body }) => expect(body.status).toBe('QUALIFIED'));
  });

  it('blocks trial booking and conversion from ineligible lead statuses', async () => {
    const lead = (await createLead()).body;
    await authorized('post', `/leads/${lead.id}/trial-bookings`).send({ sessionId: '01JHZX3V8Q9K5M2N7R4T6W1Y1D', createStudent: true }).expect(409);
    await authorized('post', `/leads/${lead.id}/convert`).send({ classId: '01JHZX3V8Q9K5M2N7R4T6W1Y1F', createStudent: true }).expect(409);
  });

  it('updates non-lifecycle fields including follow-up without touching status', async () => {
    const lead = (await createLead()).body;
    await authorized('patch', `/leads/${lead.id}`).send({ nextFollowUpAt: '2026-10-05T02:00:00Z', campaign: ' autumn-2026 ' }).expect(200);
    const stored = alpha.leads.get(lead.id);
    expect(stored?.campaign).toBe('autumn-2026');
    expect(stored?.status).toBe('NEW');
    expect(new Date(stored?.nextFollowUpAt as unknown as string).toISOString()).toBe('2026-10-05T02:00:00.000Z');
    await authorized('patch', `/leads/${lead.id}`).send({ status: 'WON' }).expect(400);
  });

  it('adds append-only notes', async () => {
    const lead = (await createLead()).body;
    await authorized('post', `/leads/${lead.id}/notes`).send({ content: '  Called, will confirm tomorrow ' }).expect(201)
      .expect(({ body }) => expect(body.content).toBe('Called, will confirm tomorrow'));
    await authorized('post', `/leads/${lead.id}/notes`).send({ content: '   ' }).expect(400);
  });

  it('serves CRM lookups without broad academic permissions', async () => {
    await authorized('get', '/crm/lookups/courses').expect(200).expect(({ body }) => expect(body[0]).toMatchObject({ name: 'IELTS' }));
    await authorized('get', '/crm/lookups/branches').expect(200);
    await authorized('get', '/crm/lookups/classes').expect(200);
    await authorized('get', '/crm/lookups/assignees').expect(200).expect(({ body }) => expect(body[0]).toMatchObject({ membershipId: '01JHZX3V8Q9K5M2N7R4T6W1Y0D' }));
    await authorized('get', '/crm/trial-sessions').expect(200);
  });

  it('keeps SALE inside crm permissions and TEACHER outside CRM entirely', async () => {
    const lead = (await createLead()).body;
    await authorized('post', '/students').send({ code: 'X1', fullName: 'Nope' }).expect(403);
    await authorized('post', '/enrollments').send({ studentId: '01JHZX3V8Q9K5M2N7R4T6W1Y1E', classId: '01JHZX3V8Q9K5M2N7R4T6W1Y1F' }).expect(403);

    membershipRole = 'TEACHER';
    await authorized('get', '/leads').expect(403);
    await authorized('get', `/leads/${lead.id}`).expect(403);
    await authorized('get', '/crm/lookups/courses').expect(403);
    await authorized('post', '/leads').send({ studentName: 'Hidden' }).expect(403);
  });

  it('fails guessed cross-tenant identifiers safely', async () => {
    const alphaLead = (await createLead()).body;
    const betaLead = (await createLead({ studentName: 'Beta Lead', interestedCourseId: records.beta.courseId }, 'beta')).body;

    await authorized('get', `/leads/${alphaLead.id}`, 'beta').expect(404);
    await authorized('patch', `/leads/${betaLead.id}`).send({ studentPhone: '0888' }).expect(404);
    await authorized('post', `/leads/${betaLead.id}/lost`).send({ reason: 'PRICE' }).expect(404);
    await authorized('post', `/leads/${alphaLead.id}/trial-bookings`).send({ sessionId: '01JHZX3V8Q9K5M2N7R4T6W1Y1D', createStudent: true }).expect(409);
    expect(alpha.leads.get(alphaLead.id)?.status).toBe('NEW');
    expect(beta.leads.get(betaLead.id)?.status).toBe('NEW');
  });

  it('rejects unauthenticated access before acquiring a tenant pool', async () => {
    connections.getConnection.mockClear();
    await request(app.getHttpServer()).get('/leads').set('Host', 'alpha.classora.io.vn').expect(401);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });
});
