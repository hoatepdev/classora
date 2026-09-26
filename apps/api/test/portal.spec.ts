import { PortalSubjectType, TenantRole } from '../src/generated/prisma/enums.js';
import { attendanceSummary } from '../src/attendance/attendance-summary.js';
import { invoiceBalance } from '../src/billing/billing-ledger.js';
import { hasPermission, PERMISSIONS } from '../src/authorization/permissions.js';

it('keeps portal management least-privileged', () => {
  for (const role of [TenantRole.OWNER, TenantRole.CENTER_ADMIN, TenantRole.ACADEMIC_MANAGER]) expect(hasPermission(role, PERMISSIONS.PORTAL_MANAGE)).toBe(true);
  for (const role of [TenantRole.ACCOUNTANT, TenantRole.SALE, TenantRole.STAFF, TenantRole.TEACHER]) expect(hasPermission(role, PERMISSIONS.PORTAL_MANAGE)).toBe(false);
  expect(Object.values(PortalSubjectType)).toEqual(['GUARDIAN', 'STUDENT']);
});

it('uses one attendance and invoice formula for portal projections', () => {
  expect(attendanceSummary(['PRESENT', 'LATE', 'ONLINE', 'MAKEUP', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'UNMARKED'])).toEqual({ attended: 4, absent: 2, late: 1, total: 6, percentage: 66.67 });
  expect(invoiceBalance('ISSUED', 1000n, 200n, 500n, '2020-01-01')).toEqual({ paidVnd: '500', creditVnd: '200', outstandingVnd: '300', effectiveStatus: 'PARTIALLY_PAID' });
});
