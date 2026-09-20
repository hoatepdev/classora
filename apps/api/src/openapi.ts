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
            role: { type: 'string', enum: ['OWNER', 'ADMIN', 'STAFF'] },
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
          required: ['id', 'tenantId', 'userId', 'role', 'tenant'],
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
    },
    required: [...resourceRequired, 'code', 'fullName', 'phone', 'email', 'dateOfBirth', 'status'],
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
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [...resourceRequired, 'code', 'name', 'phone', 'email', 'note', 'status'],
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
  Class: {
    type: 'object',
    properties: {
      ...resourceProperties,
      courseId: { ...ulid, nullable: true },
      courseCode: nullableString,
      courseName: nullableString,
      code: { type: 'string' },
      name: { type: 'string' },
      description: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [
      ...resourceRequired,
      'courseId',
      'courseCode',
      'courseName',
      'code',
      'name',
      'description',
      'status',
    ],
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
      status: { type: 'string', enum: ['ACTIVE', 'WITHDRAWN'] },
      enrolledAt: timestamp,
    },
    required: [...resourceRequired, 'studentId', 'classId', 'status', 'enrolledAt'],
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
      dayOfWeek: {
        type: 'string',
        enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      room: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] },
    },
    required: [
      ...resourceRequired,
      'classId',
      'teacherId',
      'dayOfWeek',
      'startTime',
      'endTime',
      'room',
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
  AttendanceRecord: {
    type: 'object',
    properties: {
      ...resourceProperties,
      attendanceSessionId: ulid,
      studentId: ulid,
      status: { type: 'string', enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] },
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
  AttendanceSession: {
    type: 'object',
    properties: {
      ...resourceProperties,
      classId: ulid,
      scheduleId: { ...ulid, nullable: true },
      teacherId: { ...ulid, nullable: true },
      sessionDate: { type: 'string', format: 'date' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      endTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      status: { type: 'string', enum: ['OPEN', 'COMPLETED'] },
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
          sessionStatus: { type: 'string', enum: ['OPEN', 'COMPLETED'] },
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
