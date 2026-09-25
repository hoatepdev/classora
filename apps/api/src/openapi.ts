import { applyDecorators, type INestApplication } from '@nestjs/common';
import { runtimeEnvironment } from './config.js';
import {
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
  ApiTags,
  DocumentBuilder,
  SwaggerModule,
  type ReferenceObject,
  type SchemaObject,
} from '@nestjs/swagger';

const ulid = { type: 'string', pattern: '^[0-9A-HJKMNP-TV-Z]{26}$' } satisfies SchemaObject;
const timestamp = { type: 'string', format: 'date-time' } satisfies SchemaObject;
const nullableString = { type: 'string', nullable: true } satisfies SchemaObject;

const resourceProperties = {
  id: ulid,
  tenantId: ulid,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const resourceRequired = ['id', 'tenantId', 'createdAt', 'updatedAt'];

export const openApiSchemas = {
  Error: {
    type: 'object',
    properties: {
      statusCode: { type: 'integer' },
      message: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      error: { type: 'string' },
    },
    required: ['statusCode', 'message'],
  },
  LoginResponse: {
    type: 'object',
    properties: { accessToken: { type: 'string' } },
    required: ['accessToken'],
  },
  CurrentUser: {
    type: 'object',
    properties: {
      id: ulid,
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      memberships: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: ulid,
            tenantId: ulid,
            userId: ulid,
            role: { type: 'string', enum: ['OWNER', 'CENTER_ADMIN', 'ACADEMIC_MANAGER', 'ACCOUNTANT', 'SALE', 'STAFF', 'TEACHER'] },
            status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
            permissions: { type: 'array', items: { type: 'string' } },
            tenant: {
              type: 'object',
              properties: {
                id: ulid,
                name: { type: 'string' },
                slug: { type: 'string' },
              },
              required: ['id', 'name', 'slug'],
            },
          },
          required: ['id', 'tenantId', 'userId', 'role', 'status', 'permissions', 'tenant'],
        },
      },
    },
    required: ['id', 'email', 'name', 'memberships'],
  },
  Health: {
    type: 'object',
    properties: { status: { type: 'string', enum: ['ok'] }, timestamp },
    required: ['status', 'timestamp'],
  },
  Readiness: {
    type: 'object',
    properties: { status: { type: 'string', enum: ['ready'] }, timestamp },
    required: ['status', 'timestamp'],
  },
  TenantHealth: {
    type: 'object',
    properties: { tenantId: ulid, tenantSlug: { type: 'string' } },
    required: ['tenantId', 'tenantSlug'],
  },
  TenantQueryHealth: {
    type: 'object',
    properties: {
      tenantId: ulid,
      tenantSlug: { type: 'string' },
      result: { type: 'integer', enum: [1] },
    },
    required: ['tenantId', 'tenantSlug', 'result'],
  },
  Student: {
    type: 'object',
    properties: {
      ...resourceProperties,
      code: { type: 'string' },
      fullName: { type: 'string' },
      phone: nullableString,
      email: { type: 'string', format: 'email', nullable: true },
      dateOfBirth: { type: 'string', format: 'date', nullable: true },
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
      gender: nullableString,
      address: nullableString,
      school: nullableString,
      source: nullableString,
    },
    required: [...resourceRequired, 'code', 'fullName', 'phone', 'email', 'dateOfBirth', 'status', 'gender', 'address', 'school', 'source'],
  },
  Guardian: {
    type: 'object',
    properties: { ...resourceProperties, fullName: { type: 'string' }, phone: nullableString, email: { type: 'string', format: 'email', nullable: true }, address: nullableString, notes: nullableString },
    required: [...resourceRequired, 'fullName', 'phone', 'email', 'address', 'notes'],
  },
  StudentGuardian: {
    allOf: [
      { $ref: '#/components/schemas/Guardian' },
      {
        type: 'object',
        properties: { relationship: { type: 'string' }, isPrimaryContact: { type: 'boolean' }, isBillingContact: { type: 'boolean' } },
        required: ['relationship', 'isPrimaryContact', 'isBillingContact'],
      },
    ],
  },
  StudentNote: {
    type: 'object',
    properties: { id: ulid, studentId: ulid, content: { type: 'string' }, authorId: { ...ulid, nullable: true }, authorName: nullableString, createdAt: timestamp },
    required: ['id', 'studentId', 'content', 'authorId', 'authorName', 'createdAt'],
  },
  StudentTag: {
    type: 'object',
    properties: { id: ulid, name: { type: 'string' } },
    required: ['id', 'name'],
  },
  StudentActivity: {
    type: 'object',
    properties: { id: ulid, action: { type: 'string' }, entityType: { type: 'string' }, entityId: { ...ulid, nullable: true }, before: { type: 'object', nullable: true }, after: { type: 'object', nullable: true }, actorName: nullableString, occurredAt: timestamp },
    required: ['id', 'action', 'entityType', 'entityId', 'before', 'after', 'actorName', 'occurredAt'],
  },
  Branch: {
    type: 'object',
    properties: { ...resourceProperties, code: { type: 'string' }, name: { type: 'string' }, address: nullableString, phone: nullableString, email: { type: 'string', format: 'email', nullable: true }, status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] }, notes: nullableString, roomCount: { type: 'integer' } },
    required: [...resourceRequired, 'code', 'name', 'address', 'phone', 'email', 'status', 'notes', 'roomCount'],
  },
  Room: {
    type: 'object',
    properties: { ...resourceProperties, branchId: ulid, branchCode: { type: 'string' }, branchName: { type: 'string' }, code: { type: 'string' }, name: { type: 'string' }, capacity: { type: 'integer', nullable: true }, status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] }, notes: nullableString },
    required: [...resourceRequired, 'branchId', 'branchCode', 'branchName', 'code', 'name', 'capacity', 'status', 'notes'],
  },
  Teacher: {
    type: 'object',
    properties: {
      ...resourceProperties,
      code: { type: 'string' },
      name: { type: 'string' },
      phone: nullableString,
      email: { type: 'string', format: 'email', nullable: true },
      note: nullableString,
      specialties: { type: 'array', items: { type: 'string' } },
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [...resourceRequired, 'code', 'name', 'phone', 'email', 'note', 'specialties', 'status'],
  },
  Course: {
    type: 'object',
    properties: {
      ...resourceProperties,
      code: { type: 'string' },
      name: { type: 'string' },
      description: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [...resourceRequired, 'code', 'name', 'description', 'status'],
  },
  CourseLevel: {
    type: 'object',
    properties: {
      ...resourceProperties,
      courseId: ulid,
      code: { type: 'string' },
      name: { type: 'string' },
      displayOrder: { type: 'integer', minimum: 0 },
      description: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [...resourceRequired, 'courseId', 'code', 'name', 'displayOrder', 'description', 'status'],
  },
  Class: {
    type: 'object',
    properties: {
      ...resourceProperties,
      courseId: { ...ulid, nullable: true },
      courseCode: nullableString,
      courseName: nullableString,
      branchId: { ...ulid, nullable: true },
      branchCode: { type: 'string', nullable: true },
      branchName: { type: 'string', nullable: true },
      courseLevelId: { ...ulid, nullable: true },
      courseLevelCode: { type: 'string', nullable: true },
      courseLevelName: { type: 'string', nullable: true },
      defaultRoomId: { ...ulid, nullable: true },
      defaultRoomCode: { type: 'string', nullable: true },
      primaryTeacherId: { ...ulid, nullable: true },
      primaryTeacherCode: { type: 'string', nullable: true },
      primaryTeacherName: { type: 'string', nullable: true },
      capacity: { type: 'integer', nullable: true, minimum: 1 },
      startDate: { type: 'string', format: 'date', nullable: true },
      expectedEndDate: { type: 'string', format: 'date', nullable: true },
      code: { type: 'string' },
      name: { type: 'string' },
      description: nullableString,
      completedOn: { type: 'string', format: 'date', nullable: true },
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED', 'COMPLETED'] },
    },
    required: [
      ...resourceRequired,
      'completedOn',
      'courseId',
      'courseCode',
      'courseName',
      'branchId',
      'branchCode',
      'branchName',
      'courseLevelId',
      'courseLevelCode',
      'courseLevelName',
      'defaultRoomId',
      'defaultRoomCode',
      'primaryTeacherId',
      'primaryTeacherCode',
      'primaryTeacherName',
      'capacity',
      'startDate',
      'expectedEndDate',
      'code',
      'name',
      'description',
      'status',
    ],
  },
  CompensationAgreement: {
    type: 'object',
    description: 'Effective-dated teacher compensation agreement. VND amounts are decimal integer strings.',
    properties: {
      id: ulid,
      tenantId: ulid,
      teacherId: ulid,
      teacherCode: { type: 'string' },
      teacherName: { type: 'string' },
      classId: { ...ulid, nullable: true },
      classCode: { type: 'string', nullable: true },
      className: { type: 'string', nullable: true },
      basis: { type: 'string', enum: ['PER_SESSION', 'PER_HOUR', 'FIXED_CLASS'] },
      rateVnd: { type: 'string', pattern: '^[1-9]\\d*$' },
      effectiveFrom: { type: 'string', format: 'date' },
      effectiveUntil: { type: 'string', format: 'date', nullable: true },
      status: { type: 'string', enum: ['ACTIVE', 'ENDED'] },
      notes: { type: 'string', nullable: true },
    },
    required: ['id', 'tenantId', 'teacherId', 'teacherCode', 'teacherName', 'classId', 'classCode', 'className', 'basis', 'rateVnd', 'effectiveFrom', 'effectiveUntil', 'status', 'notes'],
  },
  CompensationPeriod: {
    type: 'object',
    properties: {
      ...resourceProperties,
      periodStart: { type: 'string', format: 'date' },
      periodEnd: { type: 'string', format: 'date' },
      status: { type: 'string', enum: ['DRAFT', 'FINALIZED'] },
      generatedAt: { ...timestamp, nullable: true },
      finalizedAt: { ...timestamp, nullable: true },
      finalizedByUserId: { ...ulid, nullable: true },
    },
    required: [...resourceRequired, 'periodStart', 'periodEnd', 'status', 'generatedAt', 'finalizedAt', 'finalizedByUserId'],
  },
  CompensationStatement: {
    type: 'object',
    properties: {
      id: ulid,
      periodId: ulid,
      teacherId: ulid,
      teacherCode: { type: 'string' },
      teacherName: { type: 'string' },
      earningsVnd: { type: 'string', pattern: '^\\d+$' },
      adjustmentsVnd: { type: 'string', pattern: '^-?\\d+$' },
      payableVnd: { type: 'string', pattern: '^\\d+$' },
    },
    required: ['id', 'periodId', 'teacherId', 'teacherCode', 'teacherName', 'earningsVnd', 'adjustmentsVnd', 'payableVnd'],
  },
  CourseClass: {
    type: 'object',
    properties: {
      ...resourceProperties,
      courseId: ulid,
      code: { type: 'string' },
      name: { type: 'string' },
      description: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [...resourceRequired, 'courseId', 'code', 'name', 'description', 'status'],
  },
  Enrollment: {
    type: 'object',
    properties: {
      ...resourceProperties,
      studentId: ulid,
      classId: ulid,
      status: { type: 'string', enum: ['PENDING', 'TRIAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'] },
      enrolledAt: timestamp,
      startedAt: { ...timestamp, nullable: true },
      endedAt: { ...timestamp, nullable: true },
      pauseStartedAt: { ...timestamp, nullable: true },
      expectedEndDate: { type: 'string', format: 'date', nullable: true },
      sourceEnrollmentId: { ...ulid, nullable: true },
      notes: nullableString,
    },
    required: [...resourceRequired, 'studentId', 'classId', 'status', 'enrolledAt', 'startedAt', 'endedAt', 'pauseStartedAt', 'expectedEndDate', 'sourceEnrollmentId', 'notes'],
  },
  EnrollmentEvent: {
    type: 'object',
    properties: { id: ulid, type: { type: 'string' }, fromStatus: nullableString, toStatus: nullableString, fromClassId: { ...ulid, nullable: true }, toClassId: { ...ulid, nullable: true }, reason: nullableString, metadata: { type: 'object', nullable: true }, actorUserId: { ...ulid, nullable: true }, actorMembershipId: { ...ulid, nullable: true }, occurredAt: timestamp },
    required: ['id', 'type', 'fromStatus', 'toStatus', 'fromClassId', 'toClassId', 'reason', 'metadata', 'actorUserId', 'actorMembershipId', 'occurredAt'],
  },
  EnrollmentStudent: {
    allOf: [
      { $ref: '#/components/schemas/Enrollment' },
      {
        type: 'object',
        properties: {
          studentCode: { type: 'string' },
          studentFullName: { type: 'string' },
        },
        required: ['studentCode', 'studentFullName'],
      },
    ],
  },
  EnrollmentClass: {
    allOf: [
      { $ref: '#/components/schemas/Enrollment' },
      {
        type: 'object',
        properties: { classCode: { type: 'string' }, className: { type: 'string' } },
        required: ['classCode', 'className'],
      },
    ],
  },
  Schedule: {
    type: 'object',
    properties: {
      ...resourceProperties,
      classId: ulid,
      teacherId: ulid,
      branchId: { ...ulid, nullable: true },
      roomId: { ...ulid, nullable: true },
      dayOfWeek: {
        type: 'string',
        enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      effectiveFrom: { type: 'string', format: 'date', nullable: true },
      effectiveUntil: { type: 'string', format: 'date', nullable: true },
      legacyRoomSource: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [
      ...resourceRequired,
      'classId',
      'teacherId',
      'branchId',
      'roomId',
      'dayOfWeek',
      'startTime',
      'endTime',
      'effectiveFrom',
      'effectiveUntil',
      'legacyRoomSource',
      'status',
    ],
  },
  ClassSchedule: {
    allOf: [
      { $ref: '#/components/schemas/Schedule' },
      {
        type: 'object',
        properties: { teacherCode: { type: 'string' }, teacherName: { type: 'string' } },
        required: ['teacherCode', 'teacherName'],
      },
    ],
  },
  TeacherSchedule: {
    allOf: [
      { $ref: '#/components/schemas/Schedule' },
      {
        type: 'object',
        properties: { classCode: { type: 'string' }, className: { type: 'string' } },
        required: ['classCode', 'className'],
      },
    ],
  },
  SchedulePattern: {
    type: 'object',
    allOf: [{ $ref: '#/components/schemas/Schedule' }],
    description: 'Weekly SchedulePattern. Date and time fields use local tenant time; edits affect future generation only.',
  },
  ScheduleExclusion: {
    type: 'object',
    properties: {
      ...resourceProperties,
      date: { type: 'string', format: 'date' },
      branchId: { ...ulid, nullable: true },
      branchCode: { type: 'string', nullable: true },
      branchName: { type: 'string', nullable: true },
      reason: { type: 'string', minLength: 1, maxLength: 500 },
    },
    required: [...resourceRequired, 'date', 'branchId', 'branchCode', 'branchName', 'reason'],
  },
  Session: {
    type: 'object',
    properties: {
      ...resourceProperties,
      classId: ulid,
      schedulePatternId: { ...ulid, nullable: true },
      teacherId: { ...ulid, nullable: true },
      roomId: { ...ulid, nullable: true },
      sessionDate: { type: 'string', format: 'date' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      status: { type: 'string', enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] },
      manualOverride: { type: 'boolean' },
      rescheduledFromId: { ...ulid, nullable: true },
      cancellationReason: nullableString,
      rescheduleReason: nullableString,
      sourceSessionDate: { type: 'string', format: 'date', nullable: true },
      sourceStartTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', nullable: true },
      sourceEndTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', nullable: true },
    },
    required: [...resourceRequired, 'classId', 'schedulePatternId', 'teacherId', 'roomId', 'sessionDate', 'startTime', 'endTime', 'status', 'manualOverride', 'rescheduledFromId', 'cancellationReason', 'rescheduleReason', 'sourceSessionDate', 'sourceStartTime', 'sourceEndTime'],
  },
  AttendanceRecord: {
    type: 'object',
    properties: {
      ...resourceProperties,
      attendanceSessionId: { ...ulid, description: 'Compatibility name for the authoritative Session ID.' },
      sessionId: { ...ulid, deprecated: true, description: 'Use attendanceSessionId in the attendance compatibility API.' },
      studentId: ulid,
      status: { type: 'string', enum: ['UNMARKED', 'PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED', 'ONLINE', 'MAKEUP'] },
      note: nullableString,
    },
    required: [
      ...resourceRequired,
      'attendanceSessionId',
      'studentId',
      'status',
      'note',
    ],
  },
  AttendanceCorrection: {
    type: 'object',
    properties: { id: ulid, attendanceRecordId: ulid, beforeStatus: { type: 'string' }, afterStatus: { type: 'string' }, beforeNote: nullableString, afterNote: nullableString, reason: { type: 'string' }, actorUserId: { ...ulid, nullable: true }, actorMembershipId: { ...ulid, nullable: true }, requestId: nullableString, createdAt: timestamp },
    required: ['id', 'attendanceRecordId', 'beforeStatus', 'afterStatus', 'beforeNote', 'afterNote', 'reason', 'actorUserId', 'actorMembershipId', 'requestId', 'createdAt'],
  },
  AttendanceSession: {
    type: 'object',
    deprecated: true,
    description: 'Deprecated attendance compatibility projection. Session is the authoritative dated occurrence.',
    properties: {
      ...resourceProperties,
      classId: ulid,
      scheduleId: { ...ulid, nullable: true, description: 'Compatibility name for schedulePatternId.' },
      teacherId: { ...ulid, nullable: true },
      sessionDate: { type: 'string', format: 'date' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      status: { type: 'string', enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] },
    },
    required: [
      ...resourceRequired,
      'classId',
      'scheduleId',
      'teacherId',
      'sessionDate',
      'startTime',
      'endTime',
      'status',
    ],
  },
  AttendanceSheet: {
    type: 'object',
    properties: { id: ulid, tenantId: ulid, sessionId: ulid, status: { type: 'string', enum: ['OPEN', 'LOCKED'] }, initializedAt: timestamp, lockedAt: { ...timestamp, nullable: true }, lockedByUserId: { ...ulid, nullable: true }, createdAt: timestamp, updatedAt: timestamp },
    required: ['id', 'tenantId', 'sessionId', 'status', 'initializedAt', 'lockedAt', 'lockedByUserId', 'createdAt', 'updatedAt'],
  },
  MakeupEntitlement: {
    type: 'object',
    properties: { id: ulid, tenantId: ulid, studentId: ulid, sourceAttendanceRecordId: ulid, sourceSessionId: ulid, sourceEnrollmentId: { ...ulid, nullable: true }, status: { type: 'string', enum: ['AVAILABLE', 'BOOKED', 'USED', 'EXPIRED', 'REVOKED'] }, expiresAt: { type: 'string', format: 'date' }, createdAt: timestamp, updatedAt: timestamp },
    required: ['id', 'tenantId', 'studentId', 'sourceAttendanceRecordId', 'sourceSessionId', 'sourceEnrollmentId', 'status', 'expiresAt', 'createdAt', 'updatedAt'],
  },
  MakeupBooking: {
    type: 'object',
    properties: { id: ulid, tenantId: ulid, entitlementId: ulid, studentId: ulid, destinationSessionId: ulid, status: { type: 'string', enum: ['BOOKED', 'USED', 'CANCELLED'] }, bookedAt: timestamp, cancelledAt: { ...timestamp, nullable: true }, usedAt: { ...timestamp, nullable: true }, createdAt: timestamp, updatedAt: timestamp },
    required: ['id', 'tenantId', 'entitlementId', 'studentId', 'destinationSessionId', 'status', 'bookedAt', 'cancelledAt', 'usedAt', 'createdAt', 'updatedAt'],
  },
  PricingPlan: {
    type: 'object',
    properties: {
      ...resourceProperties,
      code: { type: 'string' },
      name: { type: 'string' },
      amountVnd: { type: 'string', pattern: '^\\d+$' },
      billingPeriod: { type: 'string', enum: ['ONE_TIME', 'MONTHLY', 'TERM'] },
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [...resourceRequired, 'code', 'name', 'amountVnd', 'billingPeriod', 'status'],
  },
  Invoice: {
    type: 'object',
    properties: {
      ...resourceProperties,
      invoiceNumber: { type: 'string', nullable: true },
      studentId: ulid,
      enrollmentId: { ...ulid, nullable: true },
      pricingPlanId: { ...ulid, nullable: true },
      status: { type: 'string', enum: ['DRAFT', 'ISSUED', 'VOID'] },
      effectiveStatus: { type: 'string', enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'] },
      issueDate: { type: 'string', format: 'date', nullable: true },
      dueDate: { type: 'string', format: 'date', nullable: true },
      subtotalVnd: { type: 'string', pattern: '^\\d+$' },
      discountVnd: { type: 'string', pattern: '^\\d+$' },
      totalVnd: { type: 'string', pattern: '^\\d+$' },
      paidVnd: { type: 'string', pattern: '^\\d+$' },
      creditVnd: { type: 'string', pattern: '^\\d+$' },
      outstandingVnd: { type: 'string', pattern: '^\\d+$' },
    },
    required: [...resourceRequired, 'invoiceNumber', 'studentId', 'enrollmentId', 'pricingPlanId', 'status', 'effectiveStatus', 'issueDate', 'dueDate', 'subtotalVnd', 'discountVnd', 'totalVnd', 'paidVnd', 'creditVnd', 'outstandingVnd'],
  },
  CreditNote: {
    type: 'object',
    properties: {
      id: ulid,
      tenantId: ulid,
      creditNoteNumber: { type: 'string', nullable: true },
      invoiceId: ulid,
      invoiceNumber: { type: 'string', nullable: true },
      studentId: ulid,
      studentName: { type: 'string', nullable: true },
      amountVnd: { type: 'string', pattern: '^\\d+$' },
      reason: { type: 'string' },
      status: { type: 'string', enum: ['DRAFT', 'ISSUED', 'VOID'] },
      issuedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: timestamp,
    },
    required: ['id', 'tenantId', 'creditNoteNumber', 'invoiceId', 'invoiceNumber', 'studentId', 'studentName', 'amountVnd', 'reason', 'status', 'issuedAt', 'createdAt'],
  },
  Discount: {
    type: 'object',
    properties: {
      ...resourceProperties,
      code: { type: 'string' },
      name: { type: 'string' },
      type: { type: 'string', enum: ['PERCENTAGE', 'FIXED'] },
      value: { type: 'string', pattern: '^\\d+$' },
      maxAmountVnd: { type: 'string', pattern: '^\\d+$', nullable: true },
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
      startsAt: { type: 'string', format: 'date', nullable: true },
      endsAt: { type: 'string', format: 'date', nullable: true },
    },
    required: [...resourceRequired, 'code', 'name', 'type', 'value', 'maxAmountVnd', 'status', 'startsAt', 'endsAt'],
  },
  EnrollmentPricing: {
    type: 'object',
    properties: {
      ...resourceProperties,
      enrollmentId: ulid,
      pricingPlanId: { ...ulid, nullable: true },
      amountVnd: { type: 'string', pattern: '^\\d+$' },
      currency: { type: 'string' },
      effectiveFrom: { type: 'string', format: 'date' },
      effectiveUntil: { type: 'string', format: 'date', nullable: true },
      lockedAt: { type: 'string', format: 'date-time', nullable: true },
    },
    required: [...resourceRequired, 'enrollmentId', 'pricingPlanId', 'amountVnd', 'currency', 'effectiveFrom', 'effectiveUntil', 'lockedAt'],
  },
  EnrollmentDiscount: {
    type: 'object',
    properties: {
      ...resourceProperties,
      enrollmentId: ulid,
      discountId: ulid,
      discountCode: { type: 'string' },
      discountName: { type: 'string' },
      amountVnd: { type: 'string', pattern: '^\\d+$' },
      appliedAt: { type: 'string', format: 'date' },
    },
    required: [...resourceRequired, 'enrollmentId', 'discountId', 'discountCode', 'discountName', 'amountVnd', 'appliedAt'],
  },
  Payment: {
    type: 'object',
    properties: {
      id: ulid,
      tenantId: ulid,
      invoiceId: { ...ulid, nullable: true },
      studentId: { ...ulid, nullable: true },
      studentName: { type: 'string', nullable: true },
      invoiceNumber: { type: 'string', nullable: true },
      amountVnd: { type: 'string', pattern: '^\\d+$' },
      method: { type: 'string' },
      reference: { type: 'string', nullable: true },
      note: { type: 'string', nullable: true },
      receivedAt: timestamp,
      createdAt: timestamp,
      status: { type: 'string', enum: ['RECORDED', 'REVERSED'] },
    },
    required: ['id', 'tenantId', 'invoiceId', 'studentId', 'studentName', 'invoiceNumber', 'amountVnd', 'method', 'reference', 'note', 'receivedAt', 'createdAt', 'status'],
  },
  Refund: {
    type: 'object',
    properties: {
      id: ulid,
      paymentId: ulid,
      studentId: { ...ulid, nullable: true },
      studentName: { type: 'string', nullable: true },
      amount: { type: 'string', pattern: '^\\d+$' },
      requestedAt: timestamp,
      reason: { type: 'string' },
      status: { type: 'string', enum: ['REFUNDED'] },
    },
    required: ['id', 'paymentId', 'studentId', 'studentName', 'amount', 'requestedAt', 'reason', 'status'],
  },
  CustomerCredit: {
    type: 'object',
    properties: {
      studentId: ulid,
      studentName: { type: 'string' },
      availableCreditVnd: { type: 'string', pattern: '^\\d+$' },
    },
    required: ['studentId', 'studentName', 'availableCreditVnd'],
  },
  Receivable: {
    type: 'object',
    properties: {
      id: ulid,
      studentId: ulid,
      studentName: { type: 'string', nullable: true },
      invoiceId: ulid,
      invoiceNumber: { type: 'string', nullable: true },
      dueAt: { type: 'string', format: 'date', nullable: true },
      amount: { type: 'string', pattern: '^\\d+$' },
      daysOverdue: { type: 'integer', minimum: 0 },
      status: { type: 'string', enum: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      effectiveStatus: { type: 'string', enum: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
    },
    required: ['id', 'studentId', 'studentName', 'invoiceId', 'invoiceNumber', 'dueAt', 'amount', 'daysOverdue', 'status', 'effectiveStatus'],
  },
  StudentBillingPayment: {
    type: 'object',
    properties: {
      id: ulid,
      amountVnd: { type: 'string', pattern: '^\\d+$' },
      method: { type: 'string' },
      reference: { type: 'string', nullable: true },
      receivedAt: timestamp,
      invoiceId: { ...ulid, nullable: true },
      status: { type: 'string', enum: ['RECORDED', 'REVERSED'] },
    },
    required: ['id', 'amountVnd', 'method', 'reference', 'receivedAt', 'invoiceId', 'status'],
  },
  StudentBilling: {
    type: 'object',
    properties: {
      student: {
        type: 'object',
        properties: { id: ulid, fullName: { type: 'string' } },
        required: ['id', 'fullName'],
      },
      invoices: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } },
      payments: { type: 'array', items: { $ref: '#/components/schemas/StudentBillingPayment' } },
      availableCreditVnd: { type: 'string', pattern: '^\\d+$' },
    },
    required: ['student', 'invoices', 'payments', 'availableCreditVnd'],
  },
  BillingOverview: {
    type: 'object',
    properties: {
      currency: { type: 'string', enum: ['VND'] },
      outstanding: { type: 'string', pattern: '^\\d+$' },
      overdue: { type: 'string', pattern: '^\\d+$' },
      collectedThisPeriod: { type: 'string', pattern: '^\\d+$' },
      dueThisPeriod: { type: 'string', pattern: '^\\d+$' },
      recentInvoices: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } },
      recentPayments: { type: 'array', items: { $ref: '#/components/schemas/Payment' } },
    },
    required: ['currency', 'outstanding', 'overdue', 'collectedThisPeriod', 'dueThisPeriod', 'recentInvoices', 'recentPayments'],
  },
  AttendanceSessionSummary: {
    allOf: [
      { $ref: '#/components/schemas/AttendanceSession' },
      {
        type: 'object',
        properties: {
          classCode: { type: 'string' },
          className: { type: 'string' },
          teacherCode: nullableString,
          teacherName: nullableString,
          recordCount: { type: 'integer' },
        },
        required: ['classCode', 'className', 'teacherCode', 'teacherName', 'recordCount'],
      },
    ],
  },
  AttendanceSessionDetail: {
    allOf: [
      { $ref: '#/components/schemas/AttendanceSession' },
      {
        type: 'object',
        properties: {
          classCode: { type: 'string' },
          className: { type: 'string' },
          teacherCode: nullableString,
          teacherName: nullableString,
          records: {
            type: 'array',
            items: {
              allOf: [
                { $ref: '#/components/schemas/AttendanceRecord' },
                {
                  type: 'object',
                  properties: {
                    studentCode: { type: 'string' },
                    studentFullName: { type: 'string' },
                  },
                  required: ['studentCode', 'studentFullName'],
                },
              ],
            },
          },
        },
        required: ['classCode', 'className', 'teacherCode', 'teacherName', 'records'],
      },
    ],
  },
  StudentAttendance: {
    allOf: [
      { $ref: '#/components/schemas/AttendanceRecord' },
      {
        type: 'object',
        properties: {
          classId: ulid,
          classCode: { type: 'string' },
          className: { type: 'string' },
          sessionDate: { type: 'string', format: 'date' },
          startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          sessionStatus: { type: 'string', enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] },
        },
        required: [
          'classId',
          'classCode',
          'className',
          'sessionDate',
          'startTime',
          'endTime',
          'sessionStatus',
        ],
      },
    ],
  },
  LeadStatus: {
    type: 'string',
    enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'WON', 'LOST'],
    description: 'WON and LOST are terminal. TRIAL_BOOKED/TRIAL_COMPLETED arise only from trial booking/outcome commands; WON only from conversion.',
  },
  Lead: {
    type: 'object',
    description: 'CRM prospect before and around conversion. Tenant-scoped; sales assignment is a validated control-database membership scalar (no cross-database foreign key).',
    properties: {
      ...resourceProperties,
      status: { $ref: '#/components/schemas/LeadStatus' },
      studentName: { type: 'string' },
      studentPhone: nullableString,
      studentEmail: { type: 'string', format: 'email', nullable: true },
      guardianName: nullableString,
      guardianPhone: nullableString,
      guardianEmail: { type: 'string', format: 'email', nullable: true },
      source: { type: 'string', enum: ['REFERRAL', 'FACEBOOK', 'GOOGLE', 'WALK_IN', 'EXISTING_CUSTOMER', 'OTHER'], nullable: true },
      campaign: nullableString,
      interestedCourseId: { ...ulid, nullable: true },
      interestedCourseName: { type: 'string', nullable: true },
      interestedCourseLevelId: { ...ulid, nullable: true },
      interestedCourseLevelName: { type: 'string', nullable: true },
      preferredBranchId: { ...ulid, nullable: true },
      preferredBranchName: { type: 'string', nullable: true },
      assignedMembershipId: { ...ulid, nullable: true, description: 'Active membership of this tenant, validated against the control database.' },
      nextFollowUpAt: { ...timestamp, nullable: true },
      convertedStudentId: { ...ulid, nullable: true },
      convertedGuardianId: { ...ulid, nullable: true },
      convertedEnrollmentId: { ...ulid, nullable: true },
      lostReason: { type: 'string', enum: ['PRICE', 'SCHEDULE', 'NO_RESPONSE', 'COMPETITOR', 'NOT_INTERESTED', 'LOCATION', 'OTHER'], nullable: true },
      lostReasonDetail: nullableString,
      wonAt: { ...timestamp, nullable: true },
      lostAt: { ...timestamp, nullable: true },
    },
    required: [...resourceRequired, 'status', 'studentName', 'studentPhone', 'studentEmail', 'guardianName', 'guardianPhone', 'guardianEmail', 'source', 'campaign', 'interestedCourseId', 'interestedCourseName', 'interestedCourseLevelId', 'interestedCourseLevelName', 'preferredBranchId', 'preferredBranchName', 'assignedMembershipId', 'nextFollowUpAt', 'convertedStudentId', 'convertedGuardianId', 'convertedEnrollmentId', 'lostReason', 'lostReasonDetail', 'wonAt', 'lostAt'],
  },
  LeadList: {
    type: 'object',
    properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Lead' } }, nextCursor: { type: 'string', nullable: true } },
    required: ['data', 'nextCursor'],
  },
  LeadNote: {
    type: 'object',
    description: 'Append-only internal staff note.',
    properties: { id: ulid, leadId: ulid, content: { type: 'string' }, authorName: nullableString, createdAt: timestamp },
    required: ['id', 'leadId', 'content', 'authorName', 'createdAt'],
  },
  LeadEvent: {
    type: 'object',
    description: 'Business CRM timeline (not a substitute for AuditEvent, which remains the security/operational audit trail).',
    properties: {
      id: ulid,
      type: { type: 'string', enum: ['CREATED', 'UPDATED', 'ASSIGNED', 'CONTACTED', 'QUALIFIED', 'FOLLOW_UP_CHANGED', 'NOTE_ADDED', 'TRIAL_BOOKED', 'TRIAL_CANCELLED', 'TRIAL_COMPLETED', 'TRIAL_OUTCOME', 'CONVERTED', 'LOST'] },
      fromStatus: { ...nullableString, description: 'Lead status before the event.' },
      toStatus: { ...nullableString, description: 'Lead status after the event.' },
      reason: nullableString,
      metadata: { type: 'object', nullable: true },
      actorUserId: { ...ulid, nullable: true },
      actorMembershipId: { ...ulid, nullable: true },
      occurredAt: timestamp,
    },
    required: ['id', 'type', 'fromStatus', 'toStatus', 'reason', 'metadata', 'actorUserId', 'actorMembershipId', 'occurredAt'],
  },
  TrialBooking: {
    type: 'object',
    description: 'Trial participation over the real Session/Enrollment/Attendance system. The TRIAL enrollment and the finalized AttendanceRecord remain authoritative.',
    properties: {
      ...resourceProperties,
      leadId: ulid,
      sessionId: ulid,
      studentId: ulid,
      guardianId: { ...ulid, nullable: true },
      trialEnrollmentId: ulid,
      status: { type: 'string', enum: ['BOOKED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] },
      outcome: { type: 'string', enum: ['ENROLL', 'FOLLOW_UP', 'LOST'], nullable: true },
      outcomeNotes: nullableString,
      cancelReason: nullableString,
      sessionDate: { type: 'string', format: 'date' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      sessionStatus: { type: 'string', enum: ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'], description: 'CANCELLED/RESCHEDULED means the trial needs rebooking.' },
      classCode: { type: 'string' },
      className: { type: 'string' },
      bookedAt: timestamp,
      cancelledAt: { ...timestamp, nullable: true },
      completedAt: { ...timestamp, nullable: true },
    },
    required: [...resourceRequired, 'leadId', 'sessionId', 'studentId', 'guardianId', 'trialEnrollmentId', 'status', 'outcome', 'outcomeNotes', 'cancelReason', 'sessionDate', 'startTime', 'endTime', 'sessionStatus', 'classCode', 'className', 'bookedAt', 'cancelledAt', 'completedAt'],
  },
  TrialOutcome: {
    type: 'object',
    description: 'Recorded only after attendance finalization. PRESENT/LATE/ONLINE map to COMPLETED; absences map to NO_SHOW.',
    properties: { bookingId: ulid, outcome: { type: 'string', enum: ['ENROLL', 'FOLLOW_UP', 'LOST'] }, attended: { type: 'boolean' }, attendanceStatus: { type: 'string' } },
    required: ['bookingId', 'outcome', 'attended', 'attendanceStatus'],
  },
  LeadConversion: {
    type: 'object',
    description: 'Result of POST /leads/:id/convert. Requires crm.write; runs atomically and rejects repeats once WON. Direct Student/Enrollment APIs still enforce their own permissions.',
    properties: {
      studentId: ulid,
      guardianId: { ...ulid, nullable: true },
      enrollmentId: ulid,
      conversionMode: { type: 'string', enum: ['TRIAL_PROMOTED', 'TRIAL_REENROLLED', 'DIRECT'], description: 'TRIAL_PROMOTED activates the same-class trial enrollment; TRIAL_REENROLLED withdraws the trial and re-enrolls into a different class preserving history; DIRECT creates a new ACTIVE enrollment.' },
    },
    required: ['studentId', 'guardianId', 'enrollmentId', 'conversionMode'],
  },
  LeadDetail: {
    allOf: [
      { $ref: '#/components/schemas/Lead' },
      {
        type: 'object',
        properties: {
          notes: { type: 'array', items: { $ref: '#/components/schemas/LeadNote' } },
          events: { type: 'array', items: { $ref: '#/components/schemas/LeadEvent' } },
          trialBookings: { type: 'array', items: { $ref: '#/components/schemas/TrialBooking' } },
          conversion: { $ref: '#/components/schemas/LeadConversion' },
        },
        required: ['notes', 'events', 'trialBookings'],
      },
    ],
  },
  LeadDuplicate: {
    type: 'object',
    description: 'Contact-match candidate only; never proof of identity. Merging is never automatic.',
    properties: { kind: { type: 'string', enum: ['STUDENT', 'GUARDIAN', 'LEAD'] }, id: ulid, name: { type: 'string' }, phone: nullableString, email: nullableString, possibleDuplicate: { type: 'boolean' } },
    required: ['kind', 'id', 'name', 'phone', 'email', 'possibleDuplicate'],
  },
  CrmCourseLookup: {
    type: 'object',
    properties: { id: ulid, code: { type: 'string' }, name: { type: 'string' }, levels: { type: 'array', items: { type: 'object', properties: { id: ulid, code: { type: 'string' }, name: { type: 'string' } }, required: ['id', 'code', 'name'] } } },
    required: ['id', 'code', 'name', 'levels'],
  },
  CrmBranchLookup: {
    type: 'object',
    properties: { id: ulid, code: { type: 'string' }, name: { type: 'string' } },
    required: ['id', 'code', 'name'],
  },
  CrmClassLookup: {
    type: 'object',
    properties: { id: ulid, code: { type: 'string' }, name: { type: 'string' }, courseName: nullableString },
    required: ['id', 'code', 'name', 'courseName'],
  },
  CrmAssigneeLookup: {
    type: 'object',
    properties: { membershipId: ulid, name: { type: 'string' }, role: { type: 'string' } },
    required: ['membershipId', 'name', 'role'],
  },
  CrmTrialSession: {
    type: 'object',
    description: 'Bounded future SCHEDULED Session candidates for trial booking. Branch ranks results but is not a hard filter.',
    properties: {
      id: ulid,
      classId: ulid,
      classCode: { type: 'string' },
      className: { type: 'string' },
      courseId: { ...ulid, nullable: true },
      courseName: nullableString,
      courseLevelId: { ...ulid, nullable: true },
      branchId: { ...ulid, nullable: true },
      branchName: nullableString,
      sessionDate: { type: 'string', format: 'date' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
    },
    required: ['id', 'classId', 'classCode', 'className', 'courseId', 'courseName', 'courseLevelId', 'branchId', 'branchName', 'sessionDate', 'startTime', 'endTime'],
  },
} satisfies Record<string, SchemaObject>;

export type OpenApiSchemaName = keyof typeof openApiSchemas;

export const schemaRef = (name: OpenApiSchemaName): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

export const arraySchema = (name: OpenApiSchemaName): SchemaObject => ({
  type: 'array',
  items: schemaRef(name),
});

export const errorResponse = { schema: schemaRef('Error') };

export const ApiUlidParam = () =>
  applyDecorators(
    ApiParam({ name: 'id', schema: ulid, description: 'ULID resource identifier' }),
    ApiInvalidRequest(),
  );

export const ApiTenantDomain = (tag: string) => applyDecorators(ApiTags(tag), ApiBearerAuth());

export const ApiInvalidRequest = () =>
  ApiResponse({ status: 400, description: 'Invalid request', ...errorResponse });

export const ApiTenantErrors = () =>
  applyDecorators(
    ApiResponse({ status: 401, description: 'Not authenticated', ...errorResponse }),
    ApiResponse({ status: 403, description: 'Tenant membership required', ...errorResponse }),
    ApiResponse({ status: 404, description: 'Tenant or resource not found', ...errorResponse }),
  );

export function setupOpenApi(
  app: INestApplication,
  enabled = process.env.ENABLE_SWAGGER === 'true',
) {
  if (!enabled) return;
  if (runtimeEnvironment() === 'production') {
    throw new Error('ENABLE_SWAGGER must be false in production');
  }

  const config = new DocumentBuilder()
    .setTitle('Classora API')
    .setDescription(
      'Multi-tenant SaaS API for training centers. Tenant identity is resolved from the request hostname; clients must not send a tenant ID or database selector.',
    )
    .setVersion('v1')
    .addBearerAuth()
    .addServer('/api', 'Same-origin web gateway')
    .addServer('/', 'Direct NestJS')
    .build();
  const documentFactory = () => {
    const document = SwaggerModule.createDocument(app, config);
    document.components ??= {};
    document.components.schemas = {
      ...document.components.schemas,
      ...openApiSchemas,
    };
    return document;
  };

  SwaggerModule.setup('docs', app, documentFactory, {
    jsonDocumentUrl: 'docs/openapi.json',
    raw: ['json'],
  });
}
