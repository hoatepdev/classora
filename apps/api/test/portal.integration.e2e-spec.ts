import dotenv from 'dotenv';
dotenv.config({ override: true });

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConflictException, ForbiddenException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { escapeIdentifier, Pool } from 'pg';
import request from 'supertest';
import { ulid } from 'ulid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditService } from '../src/audit/audit.service.js';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { PortalAccessStatus, PortalSubjectType, TenantRole, UserStatus } from '../src/generated/prisma/enums.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PortalAccessService } from '../src/portal/portal-access.service.js';
import { PortalService } from '../src/portal/portal.service.js';
import { deployTenantSchema } from '../src/database/tenant-migrations.js';
import { postgresConfig } from '../src/config.js';
import { TenantContextService, type TenantContext } from '../src/tenant/tenant-context.service.js';

const enabled = process.env.B5_TEST_DATABASE === '1';

function runPrisma(databaseUrl: string) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'prisma.config.ts'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl, CONTROL_DB_NAME: new URL(databaseUrl).pathname.slice(1) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(output.replace(/postgresql:\/\/\S+/g, 'postgresql://***'))));
  });
}

describe.skipIf(!enabled)('LOCAL-12 portal hard gates (real PostgreSQL)', () => {
  let admin: Pool;
  let controlPool: Pool;
  let tenantA: Pool;
  let tenantB: Pool;
  let control: PrismaClient;
  let context: TenantContextService;
  let access: PortalAccessService;
  let portal: PortalService;
  const names = { control: '', a: '', b: '' };
  const ids = { tenantA: ulid(), tenantB: ulid(), owner: ulid(), guardian: ulid(), guardianNoBilling: ulid(), studentA: ulid(), studentA2: ulid(), studentB: ulid(), classA: ulid() };
  const tenantMetaA = { tenantId: ids.tenantA, tenantSlug: 'portal-a', dbName: '' };
  const tenantMetaB = { tenantId: ids.tenantB, tenantSlug: 'portal-b', dbName: '' };
  const testRequest = { requestId: 'portal-test' } as never;

  const runA = <T>(callback: () => Promise<T>) => context.run<T>({ tenant: tenantMetaA, pool: tenantA, actorUserId: ids.owner, actorMembershipId: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', actorName: 'Owner', actorEmail: 'owner@example.com' } as TenantContext, callback);
  const runPortal = <T>(students: TenantContext['portal']['students'], subjects: TenantContext['portal']['subjects'], callback: () => Promise<T>) => context.run<T>({ tenant: tenantMetaA, pool: tenantA, portal: { students, subjects } } as TenantContext, callback);

  beforeAll(async () => {
    const config = postgresConfig();
    admin = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase, max: 1 });
    const runId = `${Date.now()}_${process.pid}`;
    names.control = `classora_local12_control_${runId}`;
    names.a = `classora_local12_${runId}_a`;
    names.b = `classora_local12_${runId}_b`;
    tenantMetaA.dbName = names.a; tenantMetaB.dbName = names.b;
    for (const name of Object.values(names)) await admin.query(`CREATE DATABASE ${escapeIdentifier(name)}`);
    const base = { host: config.host, port: config.port, user: config.user, password: config.password };
    const controlUrl = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${names.control}`;
    await runPrisma(controlUrl);
    await deployTenantSchema(names.a); await deployTenantSchema(names.b);
    controlPool = new Pool({ ...base, database: names.control, max: 12 });
    tenantA = new Pool({ ...base, database: names.a, max: 12 });
    tenantB = new Pool({ ...base, database: names.b, max: 4 });
    control = new PrismaClient({ adapter: new PrismaPg({ ...base, database: names.control }) });
    await control.tenant.createMany({ data: [
      { id: ids.tenantA, name: 'Portal A', slug: 'portal-a', dbName: names.a },
      { id: ids.tenantB, name: 'Portal B', slug: 'portal-b', dbName: names.b },
    ] });
    await control.user.create({ data: { id: ids.owner, email: 'owner@example.com', name: 'Owner', passwordHash: 'test', status: UserStatus.ACTIVE } });
    await control.tenantMembership.create({ data: { id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D', tenantId: ids.tenantA, userId: ids.owner, role: TenantRole.OWNER } });
    await tenantA.query(`INSERT INTO students(id,tenant_id,code,full_name,email) VALUES ($1,$2,'A-1','Student A','student-a@example.com'),($3,$2,'A-2','Student A2','student-a2@example.com')`, [ids.studentA, ids.tenantA, ids.studentA2]);
    await tenantA.query(`INSERT INTO guardians(id,tenant_id,full_name,email) VALUES ($1,$2,'Guardian Billing','parent@example.com'),($3,$2,'Guardian Academic','other-parent@example.com')`, [ids.guardian, ids.tenantA, ids.guardianNoBilling]);
    await tenantA.query(`INSERT INTO student_guardians(id,tenant_id,student_id,guardian_id,relationship,is_billing_contact) VALUES ($1,$2,$3,$4,'PARENT',TRUE),($5,$2,$6,$4,'PARENT',FALSE),($7,$2,$3,$8,'PARENT',FALSE)`, [ulid(), ids.tenantA, ids.studentA, ids.guardian, ulid(), ids.studentA2, ulid(), ids.guardianNoBilling]);
    await tenantA.query(`INSERT INTO classes(id,tenant_id,code,name) VALUES ($1,$2,'CLASS-A','Class A')`, [ids.classA, ids.tenantA]);
    const enrollment = ulid(); const session = ulid();
    await tenantA.query(`INSERT INTO enrollments(id,tenant_id,student_id,class_id,status) VALUES ($1,$2,$3,$4,'ACTIVE')`, [enrollment, ids.tenantA, ids.studentA, ids.classA]);
    await tenantA.query(`INSERT INTO attendance_sessions(id,tenant_id,class_id,session_date,start_time,end_time,status) VALUES ($1,$2,$3,CURRENT_DATE,'18:00','20:00','COMPLETED')`, [session, ids.tenantA, ids.classA]);
    await tenantA.query(`INSERT INTO attendance_sheets(id,tenant_id,session_id,status) VALUES ($1,$2,$3,'LOCKED')`, [ulid(), ids.tenantA, session]);
    await tenantA.query(`INSERT INTO attendance_records(id,tenant_id,session_id,student_id,enrollment_id,status,note) VALUES ($1,$2,$3,$4,$5,'PRESENT','private note')`, [ulid(), ids.tenantA, session, ids.studentA, enrollment]);
    const invoice = ulid();
    await tenantA.query(`INSERT INTO invoices(id,tenant_id,invoice_number,student_id,status,issue_date,due_date,subtotal_vnd,total_vnd) VALUES ($1,$2,'INV-PORTAL',$3,'ISSUED',CURRENT_DATE,CURRENT_DATE,1000,1000)`, [invoice, ids.tenantA, ids.studentA]);
    await tenantA.query(`INSERT INTO invoice_items(id,tenant_id,invoice_id,description,quantity,unit_amount_vnd,amount_vnd) VALUES ($1,$2,$3,'Tuition',1,1000,1000)`, [ulid(), ids.tenantA, invoice]);
    await tenantA.query(`INSERT INTO communication_messages(id,tenant_id,event_type,channel,recipient_type,recipient_id,body,dedupe_key,status,sent_at) VALUES ($1,$2,'SESSION_REMINDER','IN_APP','GUARDIAN',$3,'Guardian A message','portal-a-message','SENT',CURRENT_TIMESTAMP),($4,$2,'SESSION_REMINDER','IN_APP','GUARDIAN',$5,'Other guardian message','portal-other-message','SENT',CURRENT_TIMESTAMP)`, [ulid(), ids.tenantA, ids.guardian, ulid(), ids.guardianNoBilling]);
    await tenantB.query(`INSERT INTO students(id,tenant_id,code,full_name,email) VALUES ($1,$2,'B-1','Student B','student-b@example.com')`, [ids.studentB, ids.tenantB]);
    context = new TenantContextService();
    const audit = new AuditService(control as never, context);
    const resolver = { resolve: async (hostname: string) => hostname.startsWith('portal-a.') ? tenantMetaA : hostname.startsWith('portal-b.') ? tenantMetaB : null };
    const connections = { getConnection: async (db: string) => db === names.a ? tenantA : tenantB, releaseConnection() {} };
    access = new PortalAccessService(control as never, audit, context, resolver as never, connections as never);
    portal = new PortalService(context);
  }, 120_000);

  afterAll(async () => {
    await control?.$disconnect().catch(() => undefined);
    for (const pool of [controlPool, tenantA, tenantB, admin]) await pool?.end().catch(() => undefined);
    const config = postgresConfig(); const cleanup = new Pool({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.controlDatabase });
    for (const name of Object.values(names).filter(Boolean)) await cleanup.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(name)} WITH (FORCE)`).catch(() => undefined);
    await cleanup.end();
  });

  it('stores only a token hash and accepts a new guardian exactly once without membership creation', async () => {
    const invited = await runA(() => access.invite(ids.owner, { subjectType: PortalSubjectType.GUARDIAN, subjectId: ids.guardian }, testRequest));
    const stored = await control.portalInvitation.findFirstOrThrow({ where: { tenantId: ids.tenantA, subjectId: ids.guardian } });
    expect(stored.tokenHash).not.toBe(invited.invitationToken);
    expect(JSON.stringify(stored)).not.toContain(invited.invitationToken);
    const results = await Promise.allSettled([
      access.acceptNew('portal-a.classora.io.vn', { token: invited.invitationToken, name: 'Parent', password: 'correct horse battery staple' }, testRequest),
      access.acceptNew('portal-a.classora.io.vn', { token: invited.invitationToken, name: 'Parent', password: 'correct horse battery staple' }, testRequest),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const user = await control.user.findUniqueOrThrow({ where: { email: 'parent@example.com' } });
    expect(await control.portalAccess.count({ where: { tenantId: ids.tenantA, userId: user.id } })).toBe(1);
    expect(await control.tenantMembership.count({ where: { userId: user.id } })).toBe(0);
    await expect(access.acceptNew('portal-a.classora.io.vn', { token: invited.invitationToken, name: 'Parent', password: 'correct horse battery staple' }, testRequest)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reuses an existing staff user and keeps membership unchanged', async () => {
    const existing = await control.user.create({ data: { email: 'student-a@example.com', name: 'Dual User', passwordHash: 'test', status: UserStatus.ACTIVE } });
    await control.tenantMembership.create({ data: { tenantId: ids.tenantA, userId: existing.id, role: TenantRole.CENTER_ADMIN } });
    const invited = await runA(() => access.invite(ids.owner, { subjectType: PortalSubjectType.STUDENT, subjectId: ids.studentA }, testRequest));
    await expect(access.acceptNew('portal-a.classora.io.vn', { token: invited.invitationToken, name: 'Duplicate', password: 'correct horse battery staple' }, testRequest)).rejects.toBeInstanceOf(ConflictException);
    await access.acceptExisting('portal-a.classora.io.vn', invited.invitationToken, existing.id, testRequest);
    expect(await control.user.count({ where: { email: 'student-a@example.com' } })).toBe(1);
    expect((await control.tenantMembership.findFirstOrThrow({ where: { userId: existing.id } })).role).toBe(TenantRole.CENTER_ADMIN);
  });

  it('derives current child and billing authorization and isolates notifications', async () => {
    const guardianStudent = { id: ids.studentA, code: 'A-1', fullName: 'Student A', guardianSubjectIds: [ids.guardian], billingGuardianSubjectIds: [ids.guardian], studentSubjectIds: [] };
    const subject = { accessId: ulid(), type: PortalSubjectType.GUARDIAN, id: ids.guardian, name: 'Guardian Billing' };
    await runPortal([guardianStudent], [subject], async () => {
      const profile = await portal.student(ids.studentA);
      expect(profile).not.toHaveProperty('source'); expect(profile).not.toHaveProperty('notes');
      await expect(portal.student(ids.studentA2)).rejects.toBeInstanceOf(NotFoundException);
      const attendance = await portal.attendance(ids.studentA, {});
      expect(attendance.data).toHaveLength(1); expect(attendance.data[0]).not.toHaveProperty('note');
      const billing = await portal.billing(ids.studentA);
      expect(billing.invoices[0]).toMatchObject({ invoiceNumber: 'INV-PORTAL', outstandingVnd: '1000' });
      const notifications = await portal.notifications({});
      expect(notifications.data.map((message) => message.body)).toEqual(['Guardian A message']);
    });
    await tenantA.query('UPDATE student_guardians SET is_billing_contact=FALSE WHERE tenant_id=$1 AND student_id=$2 AND guardian_id=$3', [ids.tenantA, ids.studentA, ids.guardian]);
    await runPortal([{ ...guardianStudent, billingGuardianSubjectIds: [] }], [subject], () => expect(portal.billing(ids.studentA)).rejects.toBeInstanceOf(ForbiddenException));
    await tenantA.query('DELETE FROM student_guardians WHERE tenant_id=$1 AND student_id=$2 AND guardian_id=$3', [ids.tenantA, ids.studentA, ids.guardian]);
  });

  it('rejects tenant B subjects and IDs through tenant A flows', async () => {
    await expect(runA(() => access.invite(ids.owner, { subjectType: PortalSubjectType.STUDENT, subjectId: ids.studentB }, testRequest))).rejects.toBeInstanceOf(NotFoundException);
    const direct = { id: ids.studentA, code: 'A-1', fullName: 'Student A', guardianSubjectIds: [], billingGuardianSubjectIds: [], studentSubjectIds: [ids.studentA] };
    await runPortal([direct], [{ accessId: ulid(), type: PortalSubjectType.STUDENT, id: ids.studentA, name: 'Student A' }], () => expect(portal.student(ids.studentB)).rejects.toBeInstanceOf(NotFoundException));
  });

  it('disables, enables and removes only portal authorization with audit history', async () => {
    const row = await control.portalAccess.findFirstOrThrow({ where: { tenantId: ids.tenantA, subjectType: PortalSubjectType.STUDENT, subjectId: ids.studentA } });
    await runA(() => access.setStatus(row.id, PortalAccessStatus.DISABLED, testRequest));
    expect((await control.portalAccess.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(PortalAccessStatus.DISABLED);
    expect(await control.tenantMembership.count({ where: { userId: row.userId } })).toBe(1);
    await runA(() => access.setStatus(row.id, PortalAccessStatus.ACTIVE, testRequest));
    await runA(() => access.remove(row.id, testRequest));
    expect(await control.user.findUnique({ where: { id: row.userId } })).not.toBeNull();
    const actions = await control.auditEvent.findMany({ where: { tenantId: ids.tenantA, action: { startsWith: 'portal.' } }, select: { action: true } });
    expect(new Set(actions.map(({ action }) => action))).toEqual(expect.objectContaining(new Set(['portal.invited', 'portal.activated', 'portal.disabled', 'portal.enabled', 'portal.removed'])));
  });

  it('enforces the real guard pipeline over HTTP: portal access only, no staff leakage, immediate disable', async () => {
    const { default: argon2 } = await import('argon2');
    const passwordHash = await argon2.hash('correct horse battery staple', { type: argon2.argon2id });
    await control.user.update({ where: { email: 'parent@example.com' }, data: { passwordHash } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ControlDatabaseService)
      .useValue(control)
      .compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    try {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Host', 'portal-a.classora.io.vn')
        .send({ email: 'parent@example.com', password: 'correct horse battery staple' })
        .expect(200);
      const token = login.body.accessToken;
      const auth = { Authorization: `Bearer ${token}` };

      const me = await request(app.getHttpServer()).get('/portal/me').set('Host', 'portal-a.classora.io.vn').set(auth).expect(200);
      expect(me.body.portalType).toBe('GUARDIAN');
      expect(me.body.students.map((student: { id: string }) => student.id)).toEqual([ids.studentA2]);
      expect(me.body).not.toHaveProperty('memberships');

      await request(app.getHttpServer()).get(`/portal/students/${ids.studentB}`).set('Host', 'portal-a.classora.io.vn').set(auth).expect(404);
      await request(app.getHttpServer()).get('/students').set('Host', 'portal-a.classora.io.vn').set(auth).expect(403);
      await request(app.getHttpServer()).get('/communications').set('Host', 'portal-a.classora.io.vn').set(auth).expect(403);

      const accessRow = await control.portalAccess.findFirstOrThrow({ where: { tenantId: ids.tenantA, subjectType: PortalSubjectType.GUARDIAN, subjectId: ids.guardian } });
      await control.portalAccess.update({ where: { id: accessRow.id }, data: { status: PortalAccessStatus.DISABLED, disabledAt: new Date() } });
      await request(app.getHttpServer()).get('/portal/me').set('Host', 'portal-a.classora.io.vn').set(auth).expect(403);
      await control.portalAccess.update({ where: { id: accessRow.id }, data: { status: PortalAccessStatus.ACTIVE, disabledAt: null } });
      await request(app.getHttpServer()).get('/portal/me').set('Host', 'portal-a.classora.io.vn').set(auth).expect(200);
    } finally {
      await app.close();
    }
  });
});
