import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { requestLoggingMiddleware } from '../src/request-logging.js';

const database = {
  $disconnect: vi.fn(),
  $queryRaw: vi.fn(async () => [{ result: 1 }]),
};

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ControlDatabaseService)
      .useValue(database)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(requestLoggingMiddleware);
    await app.init();
  });

  afterAll(() => app.close());

  it('returns the API status', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('X-Request-Id', /^[A-Za-z0-9-]+$/)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      });
  });

  it('reports process liveness at the explicit live endpoint', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200).expect(({ body }) => expect(body.status).toBe('ok'));
  });

  it('reports control-database readiness', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ready'));
  });

  it('returns 503 when the control database is unavailable', async () => {
    database.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer()).get('/health/ready').expect(503).expect('X-Request-Id', /^[A-Za-z0-9-]+$/);
  });

  it('reuses a bounded incoming request ID', async () => {
    await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'operator-trace-123').expect(200).expect('X-Request-Id', 'operator-trace-123');
  });
});
