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
  });
});
