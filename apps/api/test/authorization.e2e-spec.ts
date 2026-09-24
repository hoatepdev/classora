import { vi } from 'vitest';
import { permissionsForRole, hasPermission, PERMISSIONS } from '../src/authorization/permissions.js';
import { MembershipStatus, TenantRole } from '../src/generated/prisma/enums.js';
import { TeamService } from '../src/team/team.service.js';

describe('authorization matrix', () => {
  it('defines every built-in role and keeps sensitive permissions least-privileged', () => {
    for (const role of Object.values(TenantRole)) {
      expect(permissionsForRole(role).length).toBeGreaterThan(0);
    }

    expect(hasPermission(TenantRole.OWNER, PERMISSIONS.TEAM_MANAGE)).toBe(true);
    expect(hasPermission(TenantRole.ACADEMIC_MANAGER, PERMISSIONS.STUDENT_WRITE)).toBe(true);
    expect(hasPermission(TenantRole.ACADEMIC_MANAGER, PERMISSIONS.TEAM_MANAGE)).toBe(false);
    expect(hasPermission(TenantRole.ACCOUNTANT, PERMISSIONS.STUDENT_WRITE)).toBe(false);
    expect(hasPermission(TenantRole.ACCOUNTANT, PERMISSIONS.TEAM_MANAGE)).toBe(false);
    expect(hasPermission(TenantRole.OWNER, PERMISSIONS.COMPENSATION_READ)).toBe(true);
    expect(hasPermission(TenantRole.OWNER, PERMISSIONS.COMPENSATION_MANAGE)).toBe(true);
    expect(hasPermission(TenantRole.CENTER_ADMIN, PERMISSIONS.COMPENSATION_READ)).toBe(true);
    expect(hasPermission(TenantRole.CENTER_ADMIN, PERMISSIONS.COMPENSATION_MANAGE)).toBe(true);
    expect(hasPermission(TenantRole.ACCOUNTANT, PERMISSIONS.COMPENSATION_READ)).toBe(true);
    expect(hasPermission(TenantRole.ACCOUNTANT, PERMISSIONS.COMPENSATION_MANAGE)).toBe(true);
    for (const role of [TenantRole.ACADEMIC_MANAGER, TenantRole.STAFF, TenantRole.TEACHER, TenantRole.SALE]) {
      expect(hasPermission(role, PERMISSIONS.COMPENSATION_READ)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.COMPENSATION_MANAGE)).toBe(false);
    }
    expect(hasPermission(TenantRole.TEACHER, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(TenantRole.OWNER, PERMISSIONS.AUDIT_READ)).toBe(true);
    expect(hasPermission(TenantRole.CENTER_ADMIN, PERMISSIONS.AUDIT_READ)).toBe(true);
    expect(hasPermission(TenantRole.ACADEMIC_MANAGER, PERMISSIONS.AUDIT_READ)).toBe(false);
    expect(hasPermission(TenantRole.STAFF, PERMISSIONS.AUDIT_READ)).toBe(false);
    expect(hasPermission(TenantRole.TEACHER, PERMISSIONS.AUDIT_READ)).toBe(false);
  });

  it('serializes owner-changing membership mutations before checking the final-owner invariant', async () => {
    const calls: string[] = [];
    const target = {
      id: '01JHZX3V8Q9K5M2N7R4T6W1Y0D',
      role: TenantRole.OWNER,
      status: MembershipStatus.ACTIVE,
      disabledAt: null,
      createdAt: new Date(0),
      user: { name: 'Owner', email: 'owner@example.com' },
    };
    const transaction = {
      $queryRaw: vi.fn(async () => { calls.push('lock'); }),
      tenantMembership: {
        findFirst: vi.fn(async () => { calls.push('read'); return target; }),
        count: vi.fn(async () => 1),
        update: vi.fn(async () => ({ ...target, role: TenantRole.CENTER_ADMIN })),
      },
    };
    const database = {
      tenantMembership: { findUnique: vi.fn(async () => target) },
      $transaction: vi.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction)),
    };
    const audit = { recordControl: vi.fn() };
    const service = new TeamService(database as never, audit as never);

    await service.changeRole('01JHZX3V8Q9K5M2N7R4T6W1Y0A', target.id, target.id, { role: TenantRole.CENTER_ADMIN });

    expect(calls.slice(0, 2)).toEqual(['lock', 'read']);
    expect(transaction.tenantMembership.count).toHaveBeenCalled();
  });

  it('scopes LOCAL-04 organization permissions per role', () => {
    for (const role of [TenantRole.OWNER, TenantRole.CENTER_ADMIN]) {
      expect(hasPermission(role, PERMISSIONS.BRANCH_READ)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.BRANCH_WRITE)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.ROOM_READ)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.ROOM_WRITE)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.COURSE_WRITE)).toBe(true);
    }

    for (const permission of [PERMISSIONS.COURSE_READ, PERMISSIONS.COURSE_WRITE, PERMISSIONS.BRANCH_READ, PERMISSIONS.BRANCH_WRITE, PERMISSIONS.ROOM_READ, PERMISSIONS.ROOM_WRITE]) {
      expect(hasPermission(TenantRole.ACADEMIC_MANAGER, permission)).toBe(true);
    }

    for (const permission of [PERMISSIONS.COURSE_READ, PERMISSIONS.BRANCH_READ, PERMISSIONS.ROOM_READ, PERMISSIONS.TEACHER_READ]) {
      expect(hasPermission(TenantRole.STAFF, permission)).toBe(true);
    }
    for (const permission of [PERMISSIONS.COURSE_WRITE, PERMISSIONS.BRANCH_WRITE, PERMISSIONS.ROOM_WRITE, PERMISSIONS.TEACHER_WRITE]) {
      expect(hasPermission(TenantRole.STAFF, permission)).toBe(false);
    }

    for (const role of [TenantRole.ACCOUNTANT, TenantRole.SALE, TenantRole.TEACHER]) {
      expect(hasPermission(role, PERMISSIONS.BRANCH_READ)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.BRANCH_WRITE)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.ROOM_READ)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.ROOM_WRITE)).toBe(false);
    }
  });
});
