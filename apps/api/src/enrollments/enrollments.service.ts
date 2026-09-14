import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { CreateEnrollmentDto } from './dto/create-enrollment.dto.js';
import { EnrollmentStatus, type UpdateEnrollmentDto } from './dto/update-enrollment.dto.js';

type EnrollmentRow = QueryResultRow & {
  id: string;
  tenantId: string;
  studentId: string;
  classId: string;
  status: EnrollmentStatus;
  enrolledAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type StudentEnrollmentRow = EnrollmentRow & {
  studentCode: string;
  studentFullName: string;
};

type ClassEnrollmentRow = EnrollmentRow & {
  classCode: string;
  className: string;
};

const enrollmentColumns = `
  e.id,
  e.tenant_id AS "tenantId",
  e.student_id AS "studentId",
  e.class_id AS "classId",
  e.status,
  e.enrolled_at AS "enrolledAt",
  e.created_at AS "createdAt",
  e.updated_at AS "updatedAt"
`;

function serialize<T extends EnrollmentRow>(row: T) {
  return {
    ...row,
    enrolledAt: row.enrolledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function foreignKeyConstraint(error: unknown) {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== '23503' ||
    !('constraint' in error)
  ) {
    return undefined;
  }
  return error.constraint;
}

@Injectable()
export class EnrollmentsService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(input: CreateEnrollmentDto) {
    const { tenant, pool } = this.tenantContext.get();
    try {
      const result = await pool.query<EnrollmentRow>(
        `INSERT INTO enrollments AS e
          (id, tenant_id, student_id, class_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ON CONSTRAINT enrollments_tenant_id_student_id_class_id_key
         DO UPDATE SET
           status = 'ACTIVE',
           enrolled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE e.status = 'WITHDRAWN'
         RETURNING
           e.id,
           e.tenant_id AS "tenantId",
           e.student_id AS "studentId",
           e.class_id AS "classId",
           e.status,
           e.enrolled_at AS "enrolledAt",
           e.created_at AS "createdAt",
           e.updated_at AS "updatedAt"`,
        [ulid(), tenant.tenantId, input.studentId, input.classId],
      );
      const enrollment = result.rows[0];
      if (!enrollment) throw new ConflictException('Student is already enrolled in this class');
      return serialize(enrollment);
    } catch (error) {
      const constraint = foreignKeyConstraint(error);
      if (constraint === 'enrollments_student_id_fkey') {
        throw new NotFoundException('Student not found');
      }
      if (constraint === 'enrollments_class_id_fkey') {
        throw new NotFoundException('Class not found');
      }
      throw error;
    }
  }

  async withdraw(id: string, _input: UpdateEnrollmentDto) {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<EnrollmentRow>(
      `UPDATE enrollments AS e
       SET status = 'WITHDRAWN', updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND id = $2 AND status = 'ACTIVE'
       RETURNING
         e.id,
         e.tenant_id AS "tenantId",
         e.student_id AS "studentId",
         e.class_id AS "classId",
         e.status,
         e.enrolled_at AS "enrolledAt",
         e.created_at AS "createdAt",
         e.updated_at AS "updatedAt"`,
      [tenant.tenantId, id],
    );
    if (result.rows[0]) return serialize(result.rows[0]);

    const existing = await pool.query(
      'SELECT 1 FROM enrollments WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, id],
    );
    if (!existing.rows[0]) throw new NotFoundException('Enrollment not found');
    throw new ConflictException('Enrollment is already withdrawn');
  }

  async listStudents(classId: string) {
    const { tenant, pool } = this.tenantContext.get();
    const classRecord = await pool.query(
      'SELECT 1 FROM classes WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, classId],
    );
    if (!classRecord.rows[0]) throw new NotFoundException('Class not found');

    const result = await pool.query<StudentEnrollmentRow>(
      `SELECT
         ${enrollmentColumns},
         s.code AS "studentCode",
         s.full_name AS "studentFullName"
       FROM enrollments e
       JOIN students s ON s.id = e.student_id AND s.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.class_id = $2
       ORDER BY s.full_name ASC, e.id ASC`,
      [tenant.tenantId, classId],
    );
    return result.rows.map(serialize);
  }

  async listClasses(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    const student = await pool.query(
      'SELECT 1 FROM students WHERE tenant_id = $1 AND id = $2',
      [tenant.tenantId, studentId],
    );
    if (!student.rows[0]) throw new NotFoundException('Student not found');

    const result = await pool.query<ClassEnrollmentRow>(
      `SELECT
         ${enrollmentColumns},
         c.code AS "classCode",
         c.name AS "className"
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id AND c.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.student_id = $2
       ORDER BY c.name ASC, e.id ASC`,
      [tenant.tenantId, studentId],
    );
    return result.rows.map(serialize);
  }
}
