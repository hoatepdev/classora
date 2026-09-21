import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

const user = {
  id: '01JHZX3V8Q9K5M2N7R4T6W1Y0B',
  email: 'owner@example.com',
  name: 'Demo Owner',
  status: 'ACTIVE' as const,
};
const demoTenant = {
  id: '01JHZX3V8Q9K5M2N7R4T6W1Y0A',
  name: 'Demo',
  slug: 'demo',
  dbName: 'classora_tenant_demo',
};
const otherTenant = {
  id: '01JHZX3V8Q9K5M2N7R4T6W1Y0C',
  name: 'Other',
  slug: 'other',
  dbName: 'classora_tenant_other',
};
const membership = { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', role: 'OWNER' as const };

describe('authentication and tenant authorization', () => {
  let app: INestApplication;
  let passwordHash: string;

  const query = vi.fn(async () => ({ rows: [{ result: 1 }] }));
  const pool = { query } as unknown as Pool;
  const connections = {
    getConnection: vi.fn(async () => pool),
    releaseConnection: vi.fn(),
  };
  const database = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.email === user.email) return { ...user, passwordHash };
        if (where.id === user.id) return user;
        return null;
      }),
    },
    tenant: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
        if (where.slug === demoTenant.slug) return demoTenant;
        if (where.slug === otherTenant.slug) return otherTenant;
        return null;
      }),
    },
    tenantMembership: {
      findUnique: vi.fn(
        async ({ where }: { where: { tenantId_userId: { tenantId: string; userId: string } } }) =>
          where.tenantId_userId.tenantId === demoTenant.id &&
          where.tenantId_userId.userId === user.id
            ? { ...membership, status: 'ACTIVE', userId: user.id }
            : null,
      ),
      findMany: vi.fn(async () => [
        {
          ...membership,
          tenantId: demoTenant.id,
          userId: user.id,
          tenant: { id: demoTenant.id, name: demoTenant.name, slug: demoTenant.slug },
        },
      ]),
    },
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash('correct horse battery staple');

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
  });

  afterAll(() => app.close());

  beforeEach(() => vi.clearAllMocks());

  const createAccessToken = () => app.get(JwtService).signAsync({ sub: user.id });

  it('logs in and returns the current user without opening a tenant database', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Host', 'demo.classora.io.vn')
      .send({ email: 'OWNER@example.com', password: 'correct horse battery staple' })
      .expect(200);

    expect(login.body.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Host', 'demo.classora.io.vn')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: user.id,
          email: user.email,
          name: user.name,
          memberships: [
            {
              ...membership,
              tenantId: demoTenant.id,
              userId: user.id,
              tenant: { id: demoTenant.id, name: demoTenant.name, slug: demoTenant.slug },
            },
          ],
        });
        expect(body.memberships[0].permissions).toContain('student.read');
      });

    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('rejects invalid login input and credentials', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '', unexpected: true })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: 'wrong password' })
      .expect(401);
  });

  it('limits repeated login attempts', async () => {
    const attempts = [];
    for (let index = 0; index < 11; index += 1) {
      attempts.push(
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: user.email, password: 'wrong password' }),
      );
    }

    expect(attempts.some(({ status }) => status === 429)).toBe(true);
    expect(attempts.every(({ status }) => status === 401 || status === 429)).toBe(true);
  });

  it('does not resolve or open a tenant database before authentication', async () => {
    await request(app.getHttpServer())
      .get('/health/tenant/query')
      .set('Host', 'demo.classora.io.vn')
      .expect(401);

    expect(database.tenant.findUnique).not.toHaveBeenCalled();
    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('allows members and releases the authorized tenant database', async () => {
    const accessToken = await createAccessToken();

    await request(app.getHttpServer())
      .get('/health/tenant/query')
      .set('Host', 'demo.classora.io.vn')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect({ tenantId: demoTenant.id, tenantSlug: demoTenant.slug, result: 1 });

    expect(connections.getConnection).toHaveBeenCalledWith(demoTenant.dbName);
    expect(query).toHaveBeenCalledWith('SELECT 1 AS result');
    expect(connections.releaseConnection).toHaveBeenCalledWith(demoTenant.dbName, pool);
  });

  it('denies non-members before opening their tenant database', async () => {
    const accessToken = await createAccessToken();

    await request(app.getHttpServer())
      .get('/health/tenant/query')
      .set('Host', 'other.classora.io.vn')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('rejects expired access tokens', async () => {
    const expiredToken = await app
      .get(JwtService)
      .signAsync({ sub: user.id }, { expiresIn: -1 });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('does not hide control database failures as authentication failures', async () => {
    const accessToken = await createAccessToken();
    database.user.findUnique.mockRejectedValueOnce(new Error('control database unavailable'));

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(500);
  });
});
