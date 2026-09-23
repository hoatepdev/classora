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

type BranchRecord = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: 'ACTIVE' | 'DISABLED';
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type RoomRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  branchCode: string | null;
  branchName: string | null;
  code: string;
  name: string;
  capacity: number | null;
  status: 'ACTIVE' | 'DISABLED';
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function orgPool() {
  const branches = new Map<string, BranchRecord>();
  const rooms = new Map<string, RoomRecord>();
  const clientCalls: string[] = [];
  // Inserts run through the transaction client only; stage them so ROLLBACK visibly undoes writes.
  const stagedBranches: [string, BranchRecord][] = [];
  const stagedRooms: [string, RoomRecord][] = [];
  const roomCount = (tenantId: string, branchId: string) =>
    [...rooms.values()].filter((room) => room.tenantId === tenantId && room.branchId === branchId).length;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('INSERT INTO branches')) {
      const now = new Date('2026-09-22T00:00:00.000Z');
      const branch: BranchRecord = {
        id: values[0] as string,
        tenantId: values[1] as string,
        code: values[2] as string,
        name: values[3] as string,
        address: values[4] as string | null,
        phone: values[5] as string | null,
        email: values[6] as string | null,
        status: values[7] as BranchRecord['status'],
        notes: values[8] as string | null,
        createdAt: now,
        updatedAt: now,
      };
      if ([...branches.values()].some((row) => row.tenantId === branch.tenantId && row.code === branch.code)) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'branches_tenant_id_code_key',
        });
      }
      stagedBranches.push([branch.id, branch]);
      return { rows: [{ ...branch, roomCount: 0 }] };
    }

    if (sql.includes('INSERT INTO rooms')) {
      const now = new Date('2026-09-22T00:00:00.000Z');
      const parent = branches.get(values[2] as string);
      const room: RoomRecord = {
        id: values[0] as string,
        tenantId: values[1] as string,
        branchId: values[2] as string,
        branchCode: parent?.code ?? null,
        branchName: parent?.name ?? null,
        code: values[3] as string,
        name: values[4] as string,
        capacity: values[5] as number | null,
        status: values[6] as RoomRecord['status'],
        notes: values[7] as string | null,
        createdAt: now,
        updatedAt: now,
      };
      if (
        [...rooms.values(), ...stagedRooms.map(([, row]) => row)].some(
          (row) => row.tenantId === room.tenantId && row.branchId === room.branchId && row.code === room.code,
        )
      ) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'rooms_tenant_id_branch_id_code_key',
        });
      }
      stagedRooms.push([room.id, room]);
      return { rows: [{ ...room }] };
    }

    if (sql.includes('UPDATE branches')) {
      const [tenantId, id, ...updates] = values as [string, string, ...unknown[]];
      const branch = branches.get(id as string);
      if (!branch || branch.tenantId !== tenantId) return { rows: [] };
      const assignments = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(',updated_at')).split(', ');
      const propertyByColumn: Record<string, keyof BranchRecord> = {
        code: 'code',
        name: 'name',
        address: 'address',
        phone: 'phone',
        email: 'email',
        status: 'status',
        notes: 'notes',
      };
      assignments.forEach((assignment, index) => {
        branch[propertyByColumn[assignment.split(' = ')[0]]] = updates[index] as never;
      });
      branch.updatedAt = new Date('2026-09-22T01:00:00.000Z');
      return { rows: [{ ...branch, roomCount: roomCount(branch.tenantId, branch.id) }] };
    }

    if (sql.includes('UPDATE rooms')) {
      const [tenantId, id, ...updates] = values as [string, string, ...unknown[]];
      const room = rooms.get(id as string);
      if (!room || room.tenantId !== tenantId) return { rows: [] };
      const assignments = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(',updated_at')).split(',');
      const propertyByColumn: Record<string, keyof RoomRecord> = {
        branch_id: 'branchId',
        code: 'code',
        name: 'name',
        capacity: 'capacity',
        status: 'status',
        notes: 'notes',
      };
      assignments.forEach((assignment, index) => {
        room[propertyByColumn[assignment.split('=')[0]]] = updates[index] as never;
      });
      const parent = branches.get(room.branchId);
      room.branchCode = parent?.code ?? null;
      room.branchName = parent?.name ?? null;
      room.updatedAt = new Date('2026-09-22T01:00:00.000Z');
      return { rows: [{ ...room }] };
    }

    if (sql.includes('SELECT id,status FROM branches')) {
      const branch = branches.get(values[1] as string);
      return { rows: branch?.tenantId === values[0] ? [{ id: branch.id, status: branch.status }] : [] };
    }

    if (sql.includes('SELECT status FROM branches')) {
      const branch = branches.get(values[1] as string);
      return { rows: branch?.tenantId === values[0] ? [{ status: branch.status }] : [] };
    }

    if (sql.includes('SELECT 1 FROM branches')) {
      const branch = branches.get(values[1] as string);
      return { rows: branch?.tenantId === values[0] ? [{ exists: 1 }] : [] };
    }

    if (sql.includes('FROM rooms r JOIN branches')) {
      if (sql.includes('FOR UPDATE') || sql.includes('r.id=$2')) {
        const room = rooms.get(values[1] as string) ?? stagedRooms.find(([id]) => id === values[1])?.[1];
        return { rows: room?.tenantId === values[0] ? [{ ...room }] : [] };
      }
      const list = [...rooms.values()].filter(
        (room) => room.tenantId === values[0] && (sql.includes('r.branch_id=$2') ? room.branchId === values[1] : true),
      );
      return {
        rows: list
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .map((room) => ({ ...room })),
      };
    }

    if (sql.includes('FROM branches WHERE')) {
      const branch = branches.get(values[1] as string);
      return { rows: branch?.tenantId === values[0] ? [{ ...branch }] : [] };
    }

    if (sql.includes('FROM branches b LEFT JOIN rooms')) {
      if (sql.includes('b.id = $2')) {
        const branch = branches.get(values[1] as string);
        return {
          rows: branch?.tenantId === values[0] ? [{ ...branch, roomCount: roomCount(branch.tenantId, branch.id) }] : [],
        };
      }
      const list = [...branches.values()].filter((branch) => branch.tenantId === values[0]);
      return {
        rows: list
          .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          .map((branch) => ({ ...branch, roomCount: roomCount(branch.tenantId, branch.id) })),
      };
    }

    return { rows: [] };
  });
  const release = vi.fn();
  const pool = {
    query,
    connect: vi.fn(async () => ({
      query: async (sql: string, vals: unknown[] = []) => {
        clientCalls.push(sql);
        if (sql === 'BEGIN') return { rows: [] };
        if (sql === 'COMMIT') {
          stagedBranches.forEach(([id, branch]) => branches.set(id, branch));
          stagedRooms.forEach(([id, room]) => rooms.set(id, room));
          stagedBranches.length = 0;
          stagedRooms.length = 0;
          return { rows: [] };
        }
        if (sql === 'ROLLBACK') {
          stagedBranches.length = 0;
          stagedRooms.length = 0;
          return { rows: [] };
        }
        return query(sql, vals);
      },
      release,
    })),
  } as unknown as Pool;
  return { pool, query, release, branches, rooms, clientCalls, stagedBranches, stagedRooms };
}

describe('organization (branches + rooms)', () => {
  let app: INestApplication;
  let token: string;
  const alpha = orgPool();
  const beta = orgPool();
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
  beforeEach(() => {
    vi.clearAllMocks();
    alpha.branches.clear();
    alpha.rooms.clear();
    alpha.clientCalls.length = 0;
    alpha.stagedBranches.length = 0;
    alpha.stagedRooms.length = 0;
    beta.branches.clear();
    beta.rooms.clear();
    beta.clientCalls.length = 0;
    beta.stagedBranches.length = 0;
    beta.stagedRooms.length = 0;
  });

  const authorized = (method: 'get' | 'post' | 'patch', path: string, tenant = 'alpha') =>
    request(app.getHttpServer())
      [method](path)
      .set('Host', `${tenant}.classora.io.vn`)
      .set('Authorization', `Bearer ${token}`);

  const seedBranch = (id: string, code: string, status: BranchRecord['status'] = 'ACTIVE') => {
    alpha.branches.set(id, {
      id,
      tenantId: tenants.alpha.id,
      code,
      name: code,
      address: null,
      phone: null,
      email: null,
      status,
      notes: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
  };

  const hnBranchId = '01JHZX3V8Q9K5M2N7R4T6W1Y0K';
  const dnBranchId = '01JHZX3V8Q9K5M2N7R4T6W1Y0M';
  const unknownBranchId = '01JHZX3V8Q9K5M2N7R4T6W1Y0N';
  const disabledBranchId = '01JHZX3V8Q9K5M2N7R4T6W1Y0Z';
  const room1Id = '01JHZX3V8Q9K5M2N7R4T6W1Y0P';
  const room2Id = '01JHZX3V8Q9K5M2N7R4T6W1Y0Q';
  const unknownRoomId = '01JHZX3V8Q9K5M2N7R4T6W1Y0S';

  it('does not give unauthenticated requests a tenant pool', async () => {
    await request(app.getHttpServer())
      .get('/branches')
      .set('Host', 'alpha.classora.io.vn')
      .expect(401);

    expect(alpha.pool.connect).not.toHaveBeenCalled();
  });

  it('creates, lists, gets, edits, and disables a normalized Branch', async () => {
    const created = await authorized('post', '/branches')
      .send({ code: ' q1 ', name: ' Co So Quan 1 ', address: '   ', email: ' Q1@Alpha.VN ' })
      .expect(201);

    expect(created.body).toMatchObject({
      tenantId: tenants.alpha.id,
      code: 'Q1',
      name: 'Co So Quan 1',
      address: null,
      email: 'q1@alpha.vn',
      status: 'ACTIVE',
      roomCount: 0,
    });
    expect(created.body.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    await authorized('get', '/branches').expect(200).expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(created.body.id);
    });
    await authorized('get', `/branches/${created.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.code).toBe('Q1'));

    await authorized('patch', `/branches/${created.body.id}`)
      .send({ name: ' Co So Moi ', status: 'DISABLED' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('Co So Moi');
        expect(body.status).toBe('DISABLED');
      });
    await authorized('patch', `/branches/${created.body.id}`).send({}).expect(400);
  });

  it('rejects duplicate Branch codes, invalid input, and tenant selectors', async () => {
    await authorized('post', '/branches').send({ code: 'HN', name: 'Ha Noi' }).expect(201);
    await authorized('post', '/branches').send({ code: ' hn ', name: 'Other' }).expect(409);
    await authorized('post', '/branches').send({ code: '', name: '' }).expect(400);
    await authorized('post', '/branches').send({ code: 'X', name: 'X', email: 'nope' }).expect(400);
    await authorized('post', '/branches')
      .send({ code: 'X', name: 'X', tenantId: tenants.beta.id })
      .expect(400);
    await authorized('get', '/branches/not-an-id').expect(400);
    await authorized('get', `/branches/${unknownBranchId}`).expect(404);
  });

  it('isolates Branch data by tenant and allows the same code in both tenants', async () => {
    const created = await authorized('post', '/branches').send({ code: 'HN', name: 'Ha Noi' }).expect(201);

    await authorized('get', '/branches', 'beta').expect(200).expect([]);
    await authorized('get', `/branches/${created.body.id}`, 'beta').expect(404);
    await authorized('patch', `/branches/${created.body.id}`, 'beta')
      .send({ name: 'Changed' })
      .expect(404);
    await authorized('post', '/branches', 'beta')
      .send({ code: 'HN', name: 'Beta HQ' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.tenantId).toBe(tenants.beta.id);
        expect(body.code).toBe('HN');
      });

    expect(alpha.branches.get(created.body.id)?.name).toBe('Ha Noi');
    expect(connections.getConnection).toHaveBeenCalledWith(tenants.beta.dbName);
  });

  it('creates Rooms under active Branches and enforces branch rules', async () => {
    seedBranch(hnBranchId, 'HN');
    seedBranch(dnBranchId, 'DN');
    seedBranch(disabledBranchId, 'OFF', 'DISABLED');

    const first = await authorized('post', '/rooms')
      .send({ code: ' p1 ', name: ' Phong 1 ', branchId: hnBranchId, capacity: 30 })
      .expect(201);
    expect(first.body).toMatchObject({
      tenantId: tenants.alpha.id,
      branchId: hnBranchId,
      branchCode: 'HN',
      code: 'P1',
      name: 'Phong 1',
      capacity: 30,
      status: 'ACTIVE',
    });

    await authorized('post', '/rooms')
      .send({ code: ' P1 ', name: 'Duplicate', branchId: hnBranchId })
      .expect(409);
    await authorized('post', '/rooms')
      .send({ code: 'P1', name: 'Phong 2', branchId: dnBranchId })
      .expect(201);
    await authorized('post', '/rooms')
      .send({ code: 'P9', name: 'Phong Off', branchId: disabledBranchId })
      .expect(409);
    await authorized('post', '/rooms')
      .send({ code: 'P9', name: 'Phong X', branchId: unknownBranchId })
      .expect(404);
    await authorized('post', '/rooms').send({ code: 'P9', name: 'Phong X', branchId: 'nope' }).expect(400);
    await authorized('post', '/rooms')
      .send({ code: 'P9', name: 'Phong X', branchId: hnBranchId, capacity: -1 })
      .expect(400);

    await authorized('get', '/rooms').expect(200).expect(({ body }) => {
      expect(body.map((room: { name: string }) => room.name)).toEqual(['Phong 1', 'Phong 2']);
    });
    await authorized('get', `/rooms?branchId=${hnBranchId}`).expect(200).expect(({ body }) => {
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(first.body.id);
    });
    await authorized('get', `/rooms?branchId=${unknownBranchId}`).expect(404);
    await authorized('get', `/rooms/${first.body.id}`).expect(200);
    await authorized('get', `/rooms/${first.body.id}`, 'beta').expect(404);
  });

  it('edits Rooms and rejects moves to disabled or unknown Branches', async () => {
    seedBranch(hnBranchId, 'HN');
    seedBranch(dnBranchId, 'DN');
    seedBranch(disabledBranchId, 'OFF', 'DISABLED');
    const room = await authorized('post', '/rooms')
      .send({ code: 'P1', name: 'Phong 1', branchId: hnBranchId })
      .expect(201);

    await authorized('patch', `/rooms/${room.body.id}`)
      .send({ name: ' Phong Moi ', capacity: 40 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.name).toBe('Phong Moi');
        expect(body.capacity).toBe(40);
      });
    await authorized('patch', `/rooms/${room.body.id}`)
      .send({ branchId: disabledBranchId })
      .expect(409);
    await authorized('patch', `/rooms/${room.body.id}`)
      .send({ branchId: unknownBranchId })
      .expect(404);
    await authorized('patch', `/rooms/${room.body.id}`)
      .send({ branchId: dnBranchId })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ branchId: dnBranchId, branchCode: 'DN' }));
    await authorized('patch', `/rooms/${room.body.id}`).send({}).expect(400);
    await authorized('patch', `/rooms/${unknownRoomId}`).send({ name: 'X' }).expect(404);
  });

  it('writes transactional audit events for Branch and Room mutations', async () => {
    const audit = app.get(AuditService);
    const record = vi.spyOn(audit, 'recordTenant');

    const branch = await authorized('post', '/branches').send({ code: 'HN', name: 'Ha Noi' }).expect(201);
    expect(
      record.mock.calls.some(
        ([, event]) => event.action === 'branch.created' && event.entityType === 'BRANCH' && event.entityId === branch.body.id,
      ),
    ).toBe(true);

    const room = await authorized('post', '/rooms')
      .send({ code: 'P1', name: 'Phong 1', branchId: branch.body.id, capacity: 10 })
      .expect(201);
    const roomCreated = record.mock.calls.find(([, event]) => event.action === 'room.created');
    expect(roomCreated).toBeTruthy();
    expect(roomCreated![1].entityType).toBe('ROOM');
    expect((roomCreated![1].after as { code?: string }).code).toBe('P1');

    record.mockClear();
    await authorized('patch', `/rooms/${room.body.id}`).send({ capacity: 20 }).expect(200);
    const roomUpdated = record.mock.calls.find(([, event]) => event.action === 'room.updated');
    expect((roomUpdated![1].before as { capacity?: number }).capacity).toBe(10);
    expect((roomUpdated![1].after as { capacity?: number }).capacity).toBe(20);

    await authorized('patch', `/branches/${branch.body.id}`).send({ status: 'DISABLED' }).expect(200);
    const branchUpdated = record.mock.calls.find(([, event]) => event.action === 'branch.updated');
    expect((branchUpdated![1].before as { status?: string }).status).toBe('ACTIVE');
    expect((branchUpdated![1].after as { status?: string }).status).toBe('DISABLED');
  });

  it('rolls back Branch creation when the audit write fails', async () => {
    const audit = app.get(AuditService);
    const record = vi.spyOn(audit, 'recordTenant');
    record.mockRejectedValueOnce(new Error('audit unavailable'));

    await authorized('post', '/branches').send({ code: 'HN', name: 'Ha Noi' }).expect(500);

    expect(alpha.branches.size).toBe(0);
    expect(alpha.clientCalls.some((sql) => sql.includes('ROLLBACK'))).toBe(true);
    expect(alpha.clientCalls.some((sql) => sql.includes('COMMIT'))).toBe(false);
    record.mockRestore();

    await authorized('post', '/branches').send({ code: 'HN', name: 'Ha Noi' }).expect(201);
    expect(alpha.branches.size).toBe(1);
  });
});
