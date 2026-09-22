import { permissionsForRole, hasPermission, PERMISSIONS } from '../src/authorization/permissions.js';
import { TenantRole } from '../src/generated/prisma/enums.js';

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
    expect(hasPermission(TenantRole.TEACHER, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(TenantRole.OWNER, PERMISSIONS.AUDIT_READ)).toBe(true);
    expect(hasPermission(TenantRole.CENTER_ADMIN, PERMISSIONS.AUDIT_READ)).toBe(true);
    expect(hasPermission(TenantRole.ACADEMIC_MANAGER, PERMISSIONS.AUDIT_READ)).toBe(false);
    expect(hasPermission(TenantRole.STAFF, PERMISSIONS.AUDIT_READ)).toBe(false);
    expect(hasPermission(TenantRole.TEACHER, PERMISSIONS.AUDIT_READ)).toBe(false);
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
