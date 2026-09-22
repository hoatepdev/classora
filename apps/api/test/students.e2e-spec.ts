import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
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

type Student = {
  id: string;
  tenantId: string;
  code: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
};

function studentPool() {
  const rows = new Map<string, Student>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql) || sql.includes('INSERT INTO audit_events')) return { rows: [] };
    if (sql.includes('INSERT INTO students')) {
      const now = new Date('2026-09-12T00:00:00.000Z');
      const student: Student = {
        id: values[0] as string,
        tenantId: values[1] as string,
        code: values[2] as string,
        fullName: values[3] as string,
        phone: values[4] as string | null,
        email: values[5] as string | null,
        dateOfBirth: values[6] as string | null,
        status: values[7] as Student['status'],
        createdAt: now,
        updatedAt: now,
      };
      if ([...rows.values()].some((row) => row.tenantId === student.tenantId && row.code === student.code)) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'students_tenant_id_code_key',
        });
      }
      rows.set(student.id, student);
      return { rows: [student] };
    }

    if (sql.includes('UPDATE students')) {
      const [tenantId, id, ...updates] = values as [string, string, ...unknown[]];
      const student = rows.get(id);
      if (!student || student.tenantId !== tenantId) return { rows: [] };
      const assignments = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(', updated_at')).split(', ');
      const propertyByColumn: Record<string, keyof Student> = {
        code: 'code',
        full_name: 'fullName',
        phone: 'phone',
        email: 'email',
        date_of_birth: 'dateOfBirth',
        status: 'status',
      };
      assignments.forEach((assignment, index) => {
        student[propertyByColumn[assignment.split(' = ')[0]]] = updates[index] as never;
      });
      student.updatedAt = new Date('2026-09-12T01:00:00.000Z');
      return { rows: [student] };
    }

    if (sql.includes('AND id = $2')) {
      const [tenantId, id] = values;
      const student = rows.get(id as string);
      return { rows: student?.tenantId === tenantId ? [student] : [] };
    }

    return {
      rows: [...rows.values()]
        .filter((student) => student.tenantId === values[0])
        .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id)),
    };
  });

  const client = { query, release: vi.fn() };
  return { pool: { query, connect: vi.fn(async () => client) } as unknown as Pool, query, rows, client };
}

describe('students', () => {
  let app: INestApplication;
  let token: string;
  const alpha = studentPool();
  const beta = studentPool();
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

  const authorized = (method: 'get' | 'post' | 'patch', path: string, tenant = 'alpha') =>
    request(app.getHttpServer())
      [method](path)
      .set('Host', `${tenant}.classora.io.vn`)
      .set('Authorization', `Bearer ${token}`);

  it('does not give unauthenticated requests a tenant pool', async () => {
    await request(app.getHttpServer())
      .get('/students')
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);

    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('creates, lists, and clears nullable Student fields in the trusted tenant', async () => {
    const created = await authorized('post', '/students')
      .send({
        code: ' s001 ',
        fullName: ' Nguyễn Văn An ',
        phone: '0900000000',
        email: '',
        dateOfBirth: '2010-05-12',
      })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      code: 'S001',
      fullName: 'Nguyễn Văn An',
      email: null,
      dateOfBirth: '2010-05-12',
      status: 'ACTIVE',
    });
    expect(created.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await authorized('get', '/students').expect(200).expect(({ body }) => {
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(created.body.id);
      expect(body.nextCursor).toBeNull();
    });

    await authorized('patch', `/students/${created.body.id}`)
      .send({ phone: null })
      .expect(200)
      .expect(({ body }) => expect(body.phone).toBeNull());

    expect(alpha.query.mock.calls.some(([, values]) => values?.includes(tenants.alpha.id))).toBe(true);
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.alpha.dbName);
    expect(connections.releaseConnection).toHaveBeenCalledWith(tenants.alpha.dbName, alpha.pool);
  });

  it('rejects client tenant selectors and empty patches', async () => {
    await authorized('post', '/students')
      .send({ code: 'S002', fullName: 'Student', tenantId: tenants.beta.id })
      .expect(400);

    const existing = [...alpha.rows.values()][0];
    await authorized('patch', `/students/${existing.id}`).send({}).expect(400);
  });

  it('maps only the Student code constraint to conflict', async () => {
    await authorized('post', '/students')
      .send({ code: 's001', fullName: 'Duplicate' })
      .expect(409);
  });

  it('cannot read or patch a Student through another tenant pool', async () => {
    const alphaStudent = [...alpha.rows.values()][0];

    await authorized('get', `/students/${alphaStudent.id}`, 'beta').expect(404);
    await authorized('patch', `/students/${alphaStudent.id}`, 'beta')
      .send({ fullName: 'Changed' })
      .expect(404);

    expect(alpha.rows.get(alphaStudent.id)?.fullName).toBe('Nguyễn Văn An');
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.beta.dbName);
  });

  it('validates date, email, ID, required fields, and non-nullable patches', async () => {
    await authorized('post', '/students')
      .send({ code: '', fullName: '', email: 'bad', dateOfBirth: '2010-02-31' })
      .expect(400);
    await authorized('post', '/students')
      .send({ code: 'S002', fullName: 'Student', dateOfBirth: '2010-05-12T00:00:00Z' })
      .expect(400);
    await authorized('get', '/students/not-an-id').expect(400);

    const existing = [...alpha.rows.values()][0];
    for (const field of ['code', 'fullName', 'status']) {
      await authorized('patch', `/students/${existing.id}`)
        .send({ [field]: null })
        .expect(400);
    }
  });
});
