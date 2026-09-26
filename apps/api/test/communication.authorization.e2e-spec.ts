import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';
import { CommunicationService } from '../src/communication/communication.service.js';

const user = { id: '01J000000000000000000000A1', email: 'comm@example.com', name: 'Communication Tester', status: 'ACTIVE' as const };
const tenant = { id: '01J000000000000000000000A2', name: 'Communication', slug: 'communication', dbName: 'classora_tenant_communication' };
const id = '01J000000000000000000000A3';

const readRoutes = [
  ['get', '/communications'],
  ['get', `/communications/${id}`],
  ['get', '/communications/templates'],
  ['post', `/communications/templates/PAYMENT_RECEIVED/EMAIL/preview`],
] as const;
const manageRoutes = [
  ['post', `/communications/${id}/retry`],
  ['put', '/communications/templates/PAYMENT_RECEIVED/EMAIL'],
  ['post', '/communications/templates/PAYMENT_RECEIVED/EMAIL/reset'],
  ['post', '/communications/templates/PAYMENT_RECEIVED/EMAIL/enable'],
  ['post', '/communications/templates/PAYMENT_RECEIVED/EMAIL/disable'],
] as const;

const bodyFor = (path: string) => {
  if (path.endsWith('/preview')) return { body: 'Xin chào {{studentName}}' };
  if (path.includes('/templates') && !path.endsWith('/reset') && !path.endsWith('/enable') && !path.endsWith('/disable')) {
    return { subject: 'Thông báo', body: 'Xin chào {{studentName}}' };
  }
  return {};
};

describe('communication permission matrix', () => {
  let app: INestApplication;
  let role: 'OWNER' | 'STAFF' | 'SALE' | 'TEACHER';
  const pool = { query: vi.fn(async () => ({ rows: [] })) };
  const database = {
    user: { findUnique: vi.fn(async () => user) },
    tenant: { findUnique: vi.fn(async () => tenant) },
    tenantMembership: { findUnique: vi.fn(async () => ({ id, userId: user.id, role, status: 'ACTIVE', user })) },
  };
  const connections = { getConnection: vi.fn(async () => pool), releaseConnection: vi.fn() };
  const communication = Object.fromEntries(
    ['list', 'message', 'retry', 'templates', 'upsertTemplate', 'resetTemplate', 'setTemplateEnabled', 'previewTemplate', 'dispatchEvent', 'deliver']
      .map((method) => [method, vi.fn(async () => ({}))]),
  ) as unknown as CommunicationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ControlDatabaseService).useValue(database)
      .overrideProvider(TenantConnectionManager).useValue(connections)
      .overrideProvider(CommunicationService).useValue(communication)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => { role = 'OWNER'; vi.clearAllMocks(); });

  const call = (method: 'get' | 'post' | 'put', path: string) => {
    const requestBuilder = request(app.getHttpServer())[method](path)
      .set('Host', `${tenant.slug}.classora.io.vn`)
      .set('Authorization', `Bearer ${app.get(JwtService).sign({ sub: user.id })}`);
    return method === 'get' ? requestBuilder : requestBuilder.send(bodyFor(path));
  };

  it.each(readRoutes)('allows %s %s with communication.read and denies it without communication.read', async (method, path) => {
    await call(method, path).expect(method === 'post' ? 201 : 200);
    for (const denied of ['STAFF', 'SALE', 'TEACHER'] as const) {
      role = denied;
      await call(method, path).expect(403);
    }
  });

  it.each(manageRoutes)('allows %s %s with communication.manage and denies it without communication.manage', async (method, path) => {
    await call(method, path).expect(method === 'put' ? 200 : 201);
    for (const denied of ['STAFF', 'SALE', 'TEACHER'] as const) {
      role = denied;
      await call(method, path).expect(403);
    }
  });

  it('rejects unauthenticated requests without acquiring a tenant connection', async () => {
    await request(app.getHttpServer()).get('/communications').set('Host', `${tenant.slug}.classora.io.vn`).expect(401);
    expect(connections.getConnection).not.toHaveBeenCalled();
  });

  it('validates template route parameters', async () => {
    await call('post', '/communications/templates/NOT_AN_EVENT/EMAIL/preview').expect(400);
    await call('put', '/communications/templates/PAYMENT_RECEIVED/SMS').expect(400);
  });
});
