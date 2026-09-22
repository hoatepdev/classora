import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { setupOpenApi } from '../src/openapi.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

async function createApp(swaggerEnabled: boolean) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ControlDatabaseService)
    .useValue({})
    .overrideProvider(TenantConnectionManager)
    .useValue({})
    .compile();
  const app = moduleRef.createNestApplication();
  setupOpenApi(app, swaggerEnabled);
  await app.init();
  return app;
}

describe('OpenAPI', () => {
  let enabledApp: INestApplication;
  let disabledApp: INestApplication;

  beforeAll(async () => {
    enabledApp = await createApp(true);
    disabledApp = await createApp(false);
  });

  afterAll(async () => {
    await Promise.all([enabledApp.close(), disabledApp.close()]);
  });

  it('exposes the UI and JSON only when enabled', async () => {
    await request(enabledApp.getHttpServer()).get('/docs/').expect(200).expect('Content-Type', /html/);
    await request(enabledApp.getHttpServer()).get('/docs/openapi.json').expect(200);

    await request(disabledApp.getHttpServer()).get('/docs/').expect(404);
    await request(disabledApp.getHttpServer()).get('/docs/openapi.json').expect(404);
  });

  it('documents domains, statuses, bearer authentication, and the gateway base path', async () => {
    const { body } = await request(enabledApp.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);

    expect(body.info).toMatchObject({ title: 'Classora API', version: 'v1' });
    expect(body.servers).toEqual([
      { url: '/api', description: 'Same-origin web gateway' },
      { url: '/', description: 'Direct NestJS' },
    ]);
    expect(body.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
    const tags = Object.values(body.paths)
      .flatMap((path) => Object.values(path as Record<string, { tags?: string[] }>))
      .flatMap((operation) => operation.tags ?? []);
    expect(tags).toEqual(
      expect.arrayContaining([
        'Auth',
        'Students',
        'Teachers',
        'Courses',
        'Classes',
        'Enrollments',
        'Schedules',
        'Attendance',
        'Health',
        'Student relationships',
        'Branches',
        'Rooms',
      ]),
    );
    expect(body.paths['/auth/login'].post.responses).toHaveProperty('200');
    expect(body.paths['/students'].post.responses).toHaveProperty('201');
    expect(body.paths['/students'].get.responses['200'].content['application/json'].schema).toMatchObject({
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/Student' } },
        nextCursor: { type: 'string', nullable: true },
      },
    });
    expect(body.components.schemas.CreateStudentDto).toMatchObject({
      required: ['code', 'fullName'],
      properties: {
        dateOfBirth: { type: 'string', format: 'date', nullable: true },
        status: { enum: ['ACTIVE', 'DISABLED'] },
      },
    });
    expect(body.paths['/auth/login'].post.security).toBeUndefined();
    expect(body.paths['/health'].get.security).toBeUndefined();
    expect(body.paths['/auth/me'].get.security).toEqual([{ bearer: [] }]);
    expect(body.paths['/students'].get.security).toEqual([{ bearer: [] }]);
    for (const path of ['/guardians', '/students/{id}/guardians', '/students/{id}/notes', '/students/{id}/tags', '/students/{id}/activity']) {
      expect(body.paths[path]).toBeDefined();
      expect(body.paths[path].get.security ?? body.paths[path].post?.security).toEqual([{ bearer: [] }]);
    }
    expect(body.components.schemas.Guardian).toBeDefined();
    expect(body.components.schemas.StudentGuardian).toBeDefined();
    expect(body.components.schemas.StudentNote).toBeDefined();
    expect(body.components.schemas.StudentTag).toBeDefined();
    expect(body.components.schemas.StudentActivity).toBeDefined();
    expect(body.components.schemas.EnrollmentEvent).toBeDefined();
    expect(body.components.schemas.Branch).toBeDefined();
    expect(body.components.schemas.Room).toBeDefined();
    expect(body.components.schemas.CourseLevel).toBeDefined();
    for (const path of ['/branches', '/branches/{id}', '/rooms', '/rooms/{id}', '/courses/{id}/levels', '/courses/{id}/levels/{levelId}', '/teachers/{id}/branches', '/enrollments/{id}', '/enrollments/{id}/history']) {
      expect(body.paths[path]).toBeDefined();
      const operation = body.paths[path].get ?? body.paths[path].patch ?? body.paths[path].post;
      expect(operation.security).toEqual([{ bearer: [] }]);
    }
  });

  it('rejects Swagger when production is enabled', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => setupOpenApi(disabledApp, true)).toThrow('ENABLE_SWAGGER must be false in production');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('does not document a client-controlled tenant selector', async () => {
    const { body } = await request(enabledApp.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);
    const forbidden = new Set(['x-tenant-id', 'tenantid', 'dbname', 'database', 'databaseserver']);

    for (const path of Object.values(body.paths) as Record<string, unknown>[]) {
      for (const operation of Object.values(path) as Record<string, unknown>[]) {
        if (!operation || typeof operation !== 'object') continue;
        for (const parameter of (operation.parameters ?? []) as Array<{ name?: string }>) {
          expect(forbidden.has(parameter.name?.toLowerCase() ?? '')).toBe(false);
        }
      }
    }
    for (const [name, schema] of Object.entries(body.components.schemas) as Array<
      [string, { properties?: Record<string, unknown> }]
    >) {
      if (!name.endsWith('Dto')) continue;
      for (const property of Object.keys(schema.properties ?? {})) {
        expect(forbidden.has(property.toLowerCase())).toBe(false);
      }
    }
  });
});
