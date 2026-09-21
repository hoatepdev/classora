import type { TenantRole } from '../generated/prisma/enums.js';

export const PERMISSIONS = {
  TEAM_READ: 'team.read',
  TEAM_MANAGE: 'team.manage',
  STUDENT_READ: 'student.read',
  STUDENT_WRITE: 'student.write',
  TEACHER_READ: 'teacher.read',
  TEACHER_WRITE: 'teacher.write',
  CLASS_READ: 'class.read',
  CLASS_WRITE: 'class.write',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_WRITE: 'attendance.write',
  BILLING_READ: 'billing.read',
  BILLING_COLLECT: 'billing.collect',
  CRM_READ: 'crm.read',
  CRM_WRITE: 'crm.write',
  REPORT_FINANCE: 'report.finance',
  SETTINGS_READ: 'settings.read',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const all = Object.values(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  OWNER: all,
  CENTER_ADMIN: all,
  ACADEMIC_MANAGER: [
    PERMISSIONS.TEAM_READ,
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.STUDENT_WRITE,
    PERMISSIONS.TEACHER_READ,
    PERMISSIONS.TEACHER_WRITE,
    PERMISSIONS.CLASS_READ,
    PERMISSIONS.CLASS_WRITE,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.SETTINGS_READ,
  ],
  ACCOUNTANT: [
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.BILLING_COLLECT,
    PERMISSIONS.REPORT_FINANCE,
  ],
  SALE: [PERMISSIONS.CRM_READ, PERMISSIONS.CRM_WRITE],
  STAFF: [
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.STUDENT_WRITE,
    PERMISSIONS.TEACHER_READ,
    PERMISSIONS.CLASS_READ,
    PERMISSIONS.ATTENDANCE_READ,
  ],
  TEACHER: [
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.CLASS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
  ],
};

export function permissionsForRole(role: TenantRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: TenantRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}
