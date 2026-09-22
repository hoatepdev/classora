import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuditService } from '../src/audit/audit.service.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

const user = {
  id: '01JHZX3V8Q9K5M2N7R4T6W1Y0B',
  email: 'owner@example.com',
  name: 'Owner',
  status: 'ACTIVE' as const,
};
const tenants = {
  alpha: {
    id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A',
    slug: 'alpha',
    dbName: 'classora_tenant_alpha',
  },
  beta: {
    id: '01JHZX3V8Q9K5M2N7R4T6W1Y0C',
    slug: 'beta',
    dbName: 'classora_tenant_beta',
  },
};

type Teacher = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

type Branch = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
};

function teacherPool() {
  const rows = new Map<string, Teacher>();
  const branches = new Map<string, Branch>();
  const assignments = new Map<string, { tenantId: string; teacherId: string; branchId: string }>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('INSERT INTO teachers')) {
      const now = new Date('2026-09-15T00:00:00.000Z');
      const teacher: Teacher = {
        id: values[0] as string,
        tenantId: values[1] as string,
        code: values[2] as string,
        name: values[3] as string,
        phone: values[4] as string | null,
        email: values[5] as string | null,
        note: values[6] as string | null,
        status: values[7] as Teacher['status'],
        createdAt: now,
        updatedAt: now,
      };
      if ([...rows.values()].some((row) => row.tenantId === teacher.tenantId && row.code === teacher.code)) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'teachers_tenant_id_code_key',
        });
      }
      rows.set(teacher.id, teacher);
      return { rows: [teacher] };
    }

    if (sql.includes('UPDATE teachers')) {
      const [tenantId, id, ...updates] = values as [string, string, ...unknown[]];
      const teacher = rows.get(id);
      if (!teacher || teacher.tenantId !== tenantId) return { rows: [] };
      const assignments = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(', updated_at')).split(', ');
      const propertyByColumn: Record<string, keyof Teacher> = {
        code: 'code',
        name: 'name',
        phone: 'phone',
        email: 'email',
        note: 'note',
        status: 'status',
      };
      assignments.forEach((assignment, index) => {
        teacher[propertyByColumn[assignment.split(' = ')[0]]] = updates[index] as never;
      });
      teacher.updatedAt = new Date('2026-09-15T01:00:00.000Z');
      return { rows: [teacher] };
    }

    if (sql.includes('DELETE FROM teacher_branches')) {
      for (const [key, assignment] of [...assignments]) {
        if (assignment.tenantId === values[0] && assignment.teacherId === values[1]) assignments.delete(key);
      }
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO teacher_branches')) {
      const [ids, tenantIds, teacherIds, branchIds] = values as [string[], string[], string[], string[]];
      ids.forEach((rowId, index) => assignments.set(rowId, { tenantId: tenantIds[index], teacherId: teacherIds[index], branchId: branchIds[index] }));
      return { rows: [] };
    }

    if (sql.includes('FROM teacher_branches tb')) {
      return {
        rows: [...assignments.values()]
          .filter((assignment) => assignment.tenantId === values[0] && assignment.teacherId === values[1])
          .flatMap((assignment) => {
            const branch = branches.get(assignment.branchId);
            return branch?.tenantId === values[0] ? [branch] : [];
          })
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      };
    }

    if (sql.includes('FROM teacher_branches')) {
      return {
        rows: [...assignments.values()]
          .filter((assignment) => assignment.tenantId === values[0] && assignment.teacherId === values[1])
          .map((assignment) => ({ branchId: assignment.branchId })),
      };
    }

    if (sql.includes('FROM branches') && sql.includes('ANY(')) {
      const [tenantId, ids] = values as [string, string[]];
      return { rows: [...branches.values()].filter((branch) => branch.tenantId === tenantId && ids.includes(branch.id)) };
    }

    if (sql.includes('AND id = $2')) {
      const [tenantId, id] = values;
      const teacher = rows.get(id as string);
      return { rows: teacher?.tenantId === tenantId ? [teacher] : [] };
    }

    return {
      rows: [...rows.values()]
        .filter((teacher) => teacher.tenantId === values[0])
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    };
  });

  const release = vi.fn();
  const pool = {
    query,
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as Pool;

  return { pool, query, release, rows, branches, assignments };
}

describe('teachers', () => {
  let app: INestApplication;
  let token: string;
  const alpha = teacherPool();
  const beta = teacherPool();
  const pools = new Map([
    [tenants.alpha.dbName, alpha.pool],
    [tenants.beta.dbName, beta.pool],
  ]);
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
      findUnique: vi.fn(async () => ({ id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', role: 'OWNER' })),
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    token = await app.get(JwtService).signAsync({ sub: user.id });
  });

  afterAll(() => app.close());
  beforeEach(() => vi.clearAllMocks());

  const authorized = (method: 'get' | 'post' | 'patch' | 'put', path: string, tenant = 'alpha') =>
    request(app.getHttpServer())
      [method](path)
      .set('Host', `${tenant}.classora.io.vn`)
      .set('Authorization', `Bearer ${token}`);

  it('does not give unauthenticated requests a tenant pool', async () => {
    await request(app.getHttpServer())
      .get('/teachers')
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);

    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('creates, lists, gets, and edits a Teacher in the trusted tenant', async () => {
    const created = await authorized('post', '/teachers')
      .send({
        code: ' gv001 ',
        name: ' Nguyen Van A ',
        phone: ' 0901234567 ',
        email: ' Teacher@Example.COM ',
        note: ' ',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      code: 'GV001',
      name: 'Nguyen Van A',
      phone: '0901234567',
      email: 'teacher@example.com',
      note: null,
      status: 'ACTIVE',
    });
    expect(created.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await authorized('get', '/teachers').expect(200).expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(created.body.id);
    });
    await authorized('get', `/teachers/${created.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.code).toBe('GV001'));
    await authorized('patch', `/teachers/${created.body.id}`)
      .send({ name: ' Nguyen Van B ', phone: '', note: null, status: 'DISABLED' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({
        name: 'Nguyen Van B',
        phone: null,
        note: null,
        status: 'DISABLED',
      }));

    expect(alpha.query.mock.calls.some(([, values]) => values?.includes(tenants.alpha.id))).toBe(true);
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.alpha.dbName);
    expect(connections.releaseConnection).toHaveBeenCalledWith(tenants.alpha.dbName, alpha.pool);
  });

  it('rejects client tenant selectors and empty patches', async () => {
    await authorized('post', '/teachers')
      .send({ code: 'GV002', name: 'Teacher', tenantId: tenants.beta.id })
      .expect(400);

    const existing = [...alpha.rows.values()][0];
    await authorized('patch', `/teachers/${existing.id}`).send({}).expect(400);
  });

  it('rejects invalid fields and non-nullable patches', async () => {
    await authorized('post', '/teachers')
      .send({ code: ' ', name: ' ', email: 'bad', status: 'UNKNOWN' })
      .expect(400);
    await authorized('get', '/teachers/not-an-id').expect(400);

    const existing = [...alpha.rows.values()][0];
    for (const field of ['code', 'name', 'status']) {
      await authorized('patch', `/teachers/${existing.id}`)
        .send({ [field]: null })
        .expect(400);
    }
  });

  it('maps duplicate normalized Teacher codes to conflict', async () => {
    await authorized('post', '/teachers')
      .send({ code: ' gv001 ', name: 'Duplicate' })
      .expect(409);
  });

  it('cannot list, read, or patch a Teacher through another tenant pool', async () => {
    const alphaTeacher = [...alpha.rows.values()][0];

    await authorized('get', '/teachers', 'beta')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual([]));
    await authorized('get', `/teachers/${alphaTeacher.id}`, 'beta').expect(404);
    await authorized('patch', `/teachers/${alphaTeacher.id}`, 'beta')
      .send({ name: 'Changed' })
      .expect(404);

    expect(alpha.rows.get(alphaTeacher.id)?.name).toBe('Nguyen Van B');
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.beta.dbName);
  });

  it('allows the same Teacher code in separate tenant databases', async () => {
    await authorized('post', '/teachers', 'beta')
      .send({ code: ' gv001 ', name: 'Beta Teacher' })
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({
        tenantId: tenants.beta.id,
        code: 'GV001',
      }));
  });

  it('replaces, lists, and audits Teacher branch assignments transactionally', async () => {
    const audit = app.get(AuditService);
    const record = vi.spyOn(audit, 'recordTenant');
    const teacher = [...alpha.rows.values()][0];
    const branchA = '01JHZX3V8Q9K5M2N7R4T6W1Y0K';
    const branchB = '01JHZX3V8Q9K5M2N7R4T6W1Y0M';
    alpha.branches.set(branchA, { id: branchA, tenantId: tenants.alpha.id, code: 'QN1', name: 'Quan 1', status: 'ACTIVE' });
    alpha.branches.set(branchB, { id: branchB, tenantId: tenants.alpha.id, code: 'QN7', name: 'Quan 7', status: 'ACTIVE' });

    await authorized('put', `/teachers/${teacher.id}/branches`)
      .send({ branchIds: [branchA, branchB] })
      .expect(200);
    expect(record.mock.calls.some(([, event]) => event.action === 'teacher.branch_assigned')).toBe(true);
    await authorized('get', `/teachers/${teacher.id}/branches`)
      .expect(200)
      .expect(({ body }) => expect(body.map((branch: { id: string }) => branch.id)).toEqual([branchA, branchB]));

    await authorized('put', `/teachers/${teacher.id}/branches`)
      .send({ branchIds: [branchA, branchA] })
      .expect(400);
    await authorized('put', `/teachers/${teacher.id}/branches`)
      .send({ branchIds: [branchA, '01JHZX3V8Q9K5M2N7R4T6W1Y0N'] })
      .expect(404);
    expect(alpha.assignments.size).toBe(2);

    record.mockClear();
    await authorized('put', `/teachers/${teacher.id}/branches`)
      .send({ branchIds: [branchB] })
      .expect(200);
    expect(
      record.mock.calls.some(
        ([, event]) =>
          event.action === 'teacher.branch_unassigned' &&
          (event.before as { branchId?: string })?.branchId === branchA,
      ),
    ).toBe(true);
    await authorized('get', `/teachers/${teacher.id}/branches`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
  });

  it('isolates Teacher branch assignments by tenant', async () => {
    const teacher = [...alpha.rows.values()][0];

    await authorized('get', `/teachers/${teacher.id}/branches`, 'beta').expect(404);
    await authorized('put', `/teachers/${teacher.id}/branches`, 'beta')
      .send({ branchIds: [] })
      .expect(404);
    expect(alpha.assignments.size).toBe(1);
  });
});
