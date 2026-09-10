import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { TenantResolverService } from '../src/tenant/tenant-resolver.service.js';

describe('GET /health/tenant', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TenantResolverService)
      .useValue({
        resolve: (hostname: string) =>
          hostname === 'demo.classora.io.vn'
            ? { tenantSlug: 'demo', dbName: 'classora_tenant_demo' }
            : null,
      })
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

  it.each(['api.classora.io.vn', 'app.classora.io.vn', 'unknown.classora.io.vn'])(
    'allows the non-tenant hostname %s',
    async (hostname) => {
      await request(app.getHttpServer())
        .get('/health/tenant')
        .set('Host', hostname)
        .expect(200)
        .expect({ tenant: null });
    },
  );
});
