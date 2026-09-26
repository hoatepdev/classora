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
  COURSE_READ: 'course.read',
  COURSE_WRITE: 'course.write',
  BRANCH_READ: 'branch.read',
  BRANCH_WRITE: 'branch.write',
  ROOM_READ: 'room.read',
  ROOM_WRITE: 'room.write',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_WRITE: 'attendance.write',
  ATTENDANCE_CORRECT: 'attendance.correct',
  SCHEDULE_READ: 'schedule.read',
  SCHEDULE_WRITE: 'schedule.write',
  ENROLLMENT_READ: 'enrollment.read',
  ENROLLMENT_WRITE: 'enrollment.write',
  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',
  BILLING_COLLECT: 'billing.collect',
  BILLING_REFUND: 'billing.refund',
  COMPENSATION_READ: 'compensation.read',
  COMPENSATION_MANAGE: 'compensation.manage',
  CRM_READ: 'crm.read',
  CRM_WRITE: 'crm.write',
  COMMUNICATION_READ: 'communication.read',
  COMMUNICATION_MANAGE: 'communication.manage',
  REPORT_FINANCE: 'report.finance',
  SETTINGS_READ: 'settings.read',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_READ: 'audit.read',
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
    PERMISSIONS.COURSE_READ,
    PERMISSIONS.COURSE_WRITE,
    PERMISSIONS.BRANCH_READ,
    PERMISSIONS.BRANCH_WRITE,
    PERMISSIONS.ROOM_READ,
    PERMISSIONS.ROOM_WRITE,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.ATTENDANCE_CORRECT,
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.SCHEDULE_WRITE,
    PERMISSIONS.ENROLLMENT_READ,
    PERMISSIONS.ENROLLMENT_WRITE,
    PERMISSIONS.SETTINGS_READ,
  ],
  ACCOUNTANT: [
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.BILLING_COLLECT,
    PERMISSIONS.BILLING_REFUND,
    PERMISSIONS.COMPENSATION_READ,
    PERMISSIONS.COMPENSATION_MANAGE,
    PERMISSIONS.REPORT_FINANCE,
  ],
  SALE: [PERMISSIONS.CRM_READ, PERMISSIONS.CRM_WRITE],
  STAFF: [
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.STUDENT_WRITE,
    PERMISSIONS.TEACHER_READ,
    PERMISSIONS.CLASS_READ,
    PERMISSIONS.COURSE_READ,
    PERMISSIONS.BRANCH_READ,
    PERMISSIONS.ROOM_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.SCHEDULE_READ,
    PERMISSIONS.ENROLLMENT_READ,
  ],
  TEACHER: [
    PERMISSIONS.STUDENT_READ,
    PERMISSIONS.CLASS_READ,
    PERMISSIONS.ATTENDANCE_READ,
    PERMISSIONS.ATTENDANCE_WRITE,
    PERMISSIONS.SCHEDULE_READ,
  ],
};

export function permissionsForRole(role: TenantRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: TenantRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}
