import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service.js';

describe('GET /health/tenant', () => {
  let app: INestApplication;
  const query = vi.fn(async () => ({ rows: [{ result: 1 }] }));
  const pool = { query } as unknown as Pool;
  const connections = {
    getConnection: vi.fn(async () => pool),
    releaseConnection: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TenantResolverService)
      .useValue({
        resolve: (hostname: string) =>
          hostname === 'demo.classora.io.vn'
            ? { tenantSlug: 'demo', dbName: 'classora_tenant_demo' }
            : null,
      })
      .overrideProvider(TenantConnectionManager)
      .useValue(connections)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(() => app.close());

  it('returns the tenant resolved from the hostname', async () => {
    await request(app.getHttpServer())
      .get('/health/tenant')
      .set('Host', 'demo.classora.io.vn')
      .expect(200)
      .expect({ tenantSlug: 'demo', dbName: 'classora_tenant_demo' });
  });

  it('queries the resolved tenant database', async () => {
    await request(app.getHttpServer())
      .get('/health/tenant/query')
      .set('Host', 'demo.classora.io.vn')
      .expect(200)
      .expect({ tenantSlug: 'demo', dbName: 'classora_tenant_demo', result: 1 });

    expect(query).toHaveBeenCalledWith('SELECT 1 AS result');
    expect(connections.getConnection).toHaveBeenCalledWith('classora_tenant_demo');
    expect(connections.releaseConnection).toHaveBeenCalledWith('classora_tenant_demo', pool);
  });

  it.each(['api.classora.io.vn', 'app.classora.io.vn', 'unknown.classora.io.vn'])(
    'allows the non-tenant hostname %s',
    async (hostname) => {
      await request(app.getHttpServer())
        .get('/health/tenant/query')
        .set('Host', hostname)
        .expect(200)
        .expect({ tenant: null });
    },
  );
});
