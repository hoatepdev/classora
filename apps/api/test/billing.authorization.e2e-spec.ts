import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ControlDatabaseService } from '../src/database/control-database.service.js';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';
import { BillingService } from '../src/billing/billing.service.js';

const user = { id: '01J00000000000000000000001', email: 'billing@example.com', name: 'Billing Tester', status: 'ACTIVE' as const };
const tenant = { id: '01J00000000000000000000002', name: 'Billing', slug: 'billing', dbName: 'classora_tenant_billing' };
const id = '01J00000000000000000000003';

const readRoutes = [
  ['get', '/pricing-plans'], ['get', '/invoices'], ['get', '/billing/overview'], ['get', '/payments'],
  ['get', '/customer-credit'], ['get', '/receivables'], ['get', '/discounts'], ['get', '/enrollment-pricing'],
  ['get', '/enrollment-discounts'], ['get', '/refunds'], ['get', '/credit-notes'], ['get', `/invoices/${id}`],
  ['get', `/students/${id}/billing`],
] as const;
const manageRoutes = [
  ['post', '/pricing-plans'], ['post', '/discounts'], ['post', `/discounts/${id}/disable`],
  ['post', `/enrollments/${id}/pricing`], ['post', `/enrollments/${id}/discounts`], ['post', '/invoices'],
  ['post', `/invoices/${id}/issue`], ['post', `/invoices/${id}/void`], ['post', `/invoices/${id}/credit-notes`],
  ['post', `/credit-notes/${id}/issue`], ['post', `/credit-notes/${id}/void`],
] as const;
const collectRoutes = [
  ['post', '/payments/unallocated'], ['post', `/invoices/${id}/payments`], ['post', `/payments/${id}/allocate`],
] as const;
const refundRoutes = [['post', `/payments/${id}/refund`], ['post', `/payments/${id}/reverse`]] as const;

const bodyFor = (path: string) => {
  if (path === '/pricing-plans') return { code: 'PLAN', name: 'Plan', amountVnd: '1000' };
  if (path === '/discounts') return { code: 'DISC', name: 'Discount', kind: 'FIXED', value: '100' };
  if (path.endsWith('/pricing')) return { amountVnd: '1000', effectiveFrom: '2026-01-01' };
  if (path.endsWith('/discounts')) return { discountId: id, amountVnd: '100' };
  if (path === '/invoices') return { studentId: id, items: [{ description: 'Tuition', quantity: '1', unitAmountVnd: '1000' }] };
  if (path.includes('/credit-notes') && path.endsWith('/void')) return { reason: 'Correction', idempotencyKey: 'void-key' };
  if (path.includes('/credit-notes')) return { amountVnd: '100', reason: 'Correction', idempotencyKey: 'note-key' };
  if (path.endsWith('/payments') || path === '/payments/unallocated') return { amountVnd: '100', method: 'CASH', idempotencyKey: 'payment-key' };
  if (path.endsWith('/allocate')) return { allocations: [{ invoiceId: id, amountVnd: '100' }], idempotencyKey: 'allocation-key' };
  if (path.endsWith('/refund')) return { amountVnd: '100', reason: 'Refund', idempotencyKey: 'refund-key' };
  if (path.endsWith('/reverse')) return { reason: 'Correction', idempotencyKey: 'reverse-key' };
  return {};
};

describe('billing permission matrix', () => {
  let app: INestApplication;
  let role: 'ACCOUNTANT' | 'STAFF';
  const pool = { query: vi.fn(async () => ({ rows: [] })) };
  const database = {
    user: { findUnique: vi.fn(async () => user) },
    tenant: { findUnique: vi.fn(async () => tenant) },
    tenantMembership: { findUnique: vi.fn(async () => ({ id, userId: user.id, role, status: 'ACTIVE', user })) },
  };
  const connections = { getConnection: vi.fn(async () => pool), releaseConnection: vi.fn() };
  const billing = Object.fromEntries([
    'plans', 'createPlan', 'invoices', 'overview', 'payments', 'customerCredit', 'receivables', 'discounts',
    'createDiscount', 'disableDiscount', 'enrollmentPricing', 'createEnrollmentPricing', 'enrollmentDiscounts',
    'createEnrollmentDiscount', 'refunds', 'creditNotes', 'createInvoice', 'invoice', 'studentBilling', 'issue',
    'void', 'createCreditNote', 'issueCreditNote', 'voidCreditNote', 'recordUnallocatedPayment', 'recordPayment',
    'allocatePayment', 'refundPayment', 'reversePayment',
  ].map((method) => [method, vi.fn(async () => ({}))]),
  ) as unknown as BillingService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ControlDatabaseService).useValue(database)
      .overrideProvider(TenantConnectionManager).useValue(connections)
      .overrideProvider(BillingService).useValue(billing)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => { role = 'ACCOUNTANT'; vi.clearAllMocks(); });

  const call = (method: 'get' | 'post', path: string) => {
    const requestBuilder = request(app.getHttpServer())[method](path)
      .set('Host', `${tenant.slug}.classora.io.vn`)
      .set('Authorization', `Bearer ${app.get(JwtService).sign({ sub: user.id })}`);
    return method === 'post' ? requestBuilder.send(bodyFor(path)) : requestBuilder;
  };

  it.each(readRoutes)('allows %s %s with billing.read and denies it without billing.read', async (method, path) => {
    await call(method, path).expect(200);
    role = 'STAFF';
    await call(method, path).expect(403);
  });

  it.each(manageRoutes)('allows %s %s with billing.manage and denies it without billing.manage', async (method, path) => {
    await call(method, path).expect(201);
    role = 'STAFF';
    await call(method, path).expect(403);
  });

  it.each(collectRoutes)('allows %s %s with billing.collect and denies it without billing.collect', async (method, path) => {
    await call(method, path).expect(201);
    role = 'STAFF';
    await call(method, path).expect(403);
  });

  it.each(refundRoutes)('allows %s %s with billing.refund and denies it without billing.refund', async (method, path) => {
    await call(method, path).expect(201);
    role = 'STAFF';
    await call(method, path).expect(403);
  });
});
