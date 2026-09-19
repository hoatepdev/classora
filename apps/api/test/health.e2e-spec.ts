import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';

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
    await app.init();
  });

  afterAll(() => app.close());

  it('returns the API status', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      });
  });

  it('reports control-database readiness', async () => {
    await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('ready'));
  });

  it('returns 503 when the control database is unavailable', async () => {
    database.$queryRaw.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer()).get('/health/ready').expect(503);
  });
});
