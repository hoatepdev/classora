import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { attendanceSummary } from '../attendance/attendance-summary.js';
import { invoiceBalance, ledgerCreditSql, ledgerPaidSql } from '../billing/billing-ledger.js';
import { PortalSubjectType } from '../generated/prisma/enums.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';

const cursor = (createdAt: Date, id: string) => Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString('base64url');
function parseCursor(value?: string): [string, string] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2 || parsed.some((item) => typeof item !== 'string')) throw new Error();
    return parsed as [string, string];
  } catch { throw new BadRequestException('Invalid cursor'); }
}
const serialize = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value instanceof Date ? value.toISOString() : value]));

@Injectable()
export class PortalService {
  constructor(private readonly tenantContext: TenantContextService) {}

  me(user: { id: string; email: string; name: string }) {
    const { portal } = this.context();
    return {
      user,
      subjects: portal.subjects.map(({ accessId: _accessId, ...subject }) => subject),
      students: portal.students.map(({ guardianSubjectIds: _guardians, billingGuardianSubjectIds, studentSubjectIds: _students, ...student }) => ({ ...student, canViewBilling: billingGuardianSubjectIds.length > 0 })),
      portalType: portal.subjects.some((subject) => subject.type === PortalSubjectType.GUARDIAN) ? 'GUARDIAN' : 'STUDENT',
    };
  }

  async student(studentId: string) {
    this.authorizeStudent(studentId);
    const { tenant, pool } = this.context();
    const [student, enrollments] = await Promise.all([
      pool.query(`SELECT id,code,full_name AS "fullName",status,date_of_birth::text AS "dateOfBirth",school FROM students WHERE tenant_id=$1 AND id=$2`, [tenant.tenantId, studentId]),
      pool.query(`SELECT e.id,e.status,e.enrolled_at AS "enrolledAt",e.started_at AS "startedAt",e.ended_at AS "endedAt",e.expected_end_date::text AS "expectedEndDate",
        c.id AS "classId",c.code AS "classCode",c.name AS "className",c.start_date::text AS "classStartDate",c.expected_end_date::text AS "classExpectedEndDate",
        co.id AS "courseId",co.code AS "courseCode",co.name AS "courseName",cl.id AS "levelId",cl.code AS "levelCode",cl.name AS "levelName",
        b.id AS "branchId",b.code AS "branchCode",b.name AS "branchName"
        FROM enrollments e JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
        LEFT JOIN courses co ON co.tenant_id=c.tenant_id AND co.id=c.course_id
        LEFT JOIN course_levels cl ON cl.tenant_id=c.tenant_id AND cl.id=c.course_level_id
        LEFT JOIN branches b ON b.tenant_id=c.tenant_id AND b.id=c.branch_id
        WHERE e.tenant_id=$1 AND e.student_id=$2 ORDER BY e.enrolled_at DESC,e.id DESC`, [tenant.tenantId, studentId]),
    ]);
    if (!student.rows[0]) throw new NotFoundException('Student not found');
    return { ...student.rows[0], enrollments: enrollments.rows.map(serialize) };
  }

  async schedule(studentId: string, from: string, to: string) {
    this.authorizeStudent(studentId);
    this.dateRange(from, to);
    const { tenant, pool } = this.context();
    const result = await pool.query(`SELECT a.id,a.session_date::text AS date,a.start_time::text AS "startTime",a.end_time::text AS "endTime",a.status,
      c.id AS "classId",c.code AS "classCode",c.name AS "className",co.name AS "courseName",cl.name AS "levelName",t.name AS "teacherName",r.name AS "roomName",b.name AS "branchName"
      FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id
      LEFT JOIN courses co ON co.tenant_id=c.tenant_id AND co.id=c.course_id LEFT JOIN course_levels cl ON cl.tenant_id=c.tenant_id AND cl.id=c.course_level_id
      LEFT JOIN teachers t ON t.tenant_id=a.tenant_id AND t.id=a.teacher_id LEFT JOIN rooms r ON r.tenant_id=a.tenant_id AND r.id=a.room_id LEFT JOIN branches b ON b.tenant_id=a.tenant_id AND b.id=a.branch_id
      WHERE a.tenant_id=$1 AND a.session_date BETWEEN $3::date AND $4::date AND (
        EXISTS (SELECT 1 FROM attendance_records ar JOIN attendance_sheets sh ON sh.tenant_id=ar.tenant_id AND sh.session_id=ar.session_id WHERE ar.tenant_id=a.tenant_id AND ar.session_id=a.id AND ar.student_id=$2 AND sh.status='LOCKED')
        OR EXISTS (SELECT 1 FROM enrollments e WHERE e.tenant_id=a.tenant_id AND e.class_id=a.class_id AND e.student_id=$2 AND e.status IN ('TRIAL','ACTIVE') AND e.enrolled_at::date<=a.session_date AND (e.ended_at IS NULL OR e.ended_at::date>=a.session_date)))
      ORDER BY a.session_date,a.start_time,a.id`, [tenant.tenantId, studentId, from, to]);
    return result.rows.map(({ id: _id, ...row }) => ({ ...row, startTime: String(row.startTime).slice(0, 5), endTime: String(row.endTime).slice(0, 5) }));
  }

  async attendance(studentId: string, query: { cursor?: string; limit?: number }) {
    this.authorizeStudent(studentId);
    const { tenant, pool } = this.context();
    const position = parseCursor(query.cursor);
    const values: unknown[] = [tenant.tenantId, studentId];
    let page = '';
    if (position) { values.push(position[0], position[1]); page = ` AND (a.session_date,a.id)<($3::date,$4)`; }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    values.push(limit + 1);
    const [result, totals] = await Promise.all([
      pool.query<{ id: string; date: string; status: string } & QueryResultRow>(`SELECT r.id,r.status,r.source,a.id AS "sessionId",a.session_date::text AS date,a.start_time::text AS "startTime",a.end_time::text AS "endTime",c.id AS "classId",c.code AS "classCode",c.name AS "className"
        FROM attendance_records r JOIN attendance_sheets sh ON sh.tenant_id=r.tenant_id AND sh.session_id=r.session_id AND sh.status='LOCKED'
        JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id
        WHERE r.tenant_id=$1 AND r.student_id=$2${page} ORDER BY a.session_date DESC,a.id DESC LIMIT $${values.length}`, values),
      pool.query<{ status: string }>(`SELECT r.status FROM attendance_records r JOIN attendance_sheets sh ON sh.tenant_id=r.tenant_id AND sh.session_id=r.session_id AND sh.status='LOCKED' WHERE r.tenant_id=$1 AND r.student_id=$2`, [tenant.tenantId, studentId]),
    ]);
    const rows = result.rows.slice(0, limit);
    return { data: rows.map(({ id: _id, sessionId: _sessionId, ...row }) => ({ ...row, startTime: String(row.startTime).slice(0, 5), endTime: String(row.endTime).slice(0, 5) })), summary: attendanceSummary(totals.rows.map((row) => row.status)), nextCursor: result.rows.length > limit && rows.length ? Buffer.from(JSON.stringify([rows.at(-1)!.date, rows.at(-1)!.sessionId])).toString('base64url') : null };
  }

  async makeup(studentId: string) {
    this.authorizeStudent(studentId);
    const { tenant, pool } = this.context();
    const result = await pool.query(`SELECT e.id,CASE WHEN e.status IN ('AVAILABLE','BOOKED') AND CURRENT_DATE>e.expires_at THEN 'EXPIRED' ELSE e.status END AS status,e.expires_at::text AS "expiresAt",
      source.id AS "sourceSessionId",source.session_date::text AS "sourceDate",source_class.name AS "sourceClassName",
      b.id AS "bookingId",b.status AS "bookingStatus",destination.id AS "destinationSessionId",destination.session_date::text AS "destinationDate",destination.start_time::text AS "destinationStartTime",destination_class.name AS "destinationClassName"
      FROM makeup_entitlements e JOIN attendance_sessions source ON source.tenant_id=e.tenant_id AND source.id=e.source_session_id JOIN classes source_class ON source_class.tenant_id=source.tenant_id AND source_class.id=source.class_id
      LEFT JOIN makeup_bookings b ON b.tenant_id=e.tenant_id AND b.entitlement_id=e.id AND b.status IN ('BOOKED','USED')
      LEFT JOIN attendance_sessions destination ON destination.tenant_id=b.tenant_id AND destination.id=b.destination_session_id LEFT JOIN classes destination_class ON destination_class.tenant_id=destination.tenant_id AND destination_class.id=destination.class_id
      WHERE e.tenant_id=$1 AND e.student_id=$2 ORDER BY e.expires_at DESC,e.id DESC`, [tenant.tenantId, studentId]);
    return result.rows.map(({ id: _id, sourceSessionId: _sourceSessionId, bookingId: _bookingId, destinationSessionId: _destinationSessionId, ...row }) => ({ ...row, destinationStartTime: row.destinationStartTime ? String(row.destinationStartTime).slice(0, 5) : null }));
  }

  async billing(studentId: string) {
    const student = this.authorizeStudent(studentId);
    if (!student.billingGuardianSubjectIds.length) throw new ForbiddenException();
    const { tenant, pool } = this.context();
    const billingContact = await pool.query(`SELECT 1 FROM student_guardians WHERE tenant_id=$1 AND student_id=$2 AND guardian_id=ANY($3::char(26)[]) AND is_billing_contact=TRUE LIMIT 1`, [tenant.tenantId, studentId, student.billingGuardianSubjectIds]);
    if (!billingContact.rows[0]) throw new ForbiddenException();
    const invoices = await pool.query(`SELECT i.id,i.invoice_number AS "invoiceNumber",i.issue_date::text AS "issueDate",i.due_date::text AS "dueDate",i.status,i.total_vnd AS "totalVnd",${ledgerPaidSql} AS paid_vnd,${ledgerCreditSql} AS credit_vnd
      FROM invoices i WHERE i.tenant_id=$1 AND i.student_id=$2 AND i.status IN ('ISSUED','VOID') ORDER BY i.issue_date DESC NULLS LAST,i.id DESC`, [tenant.tenantId, studentId]);
    const ids = invoices.rows.map((row) => row.id);
    const [items, payments, refunds] = await Promise.all([
      ids.length ? pool.query(`SELECT invoice_id AS "invoiceId",description,quantity::text,unit_amount_vnd::text AS "unitAmountVnd",amount_vnd::text AS "amountVnd" FROM invoice_items WHERE tenant_id=$1 AND invoice_id=ANY($2::char(26)[]) ORDER BY invoice_id,id`, [tenant.tenantId, ids]) : { rows: [] },
      pool.query(`SELECT p.id,p.invoice_id AS "invoiceId",p.amount_vnd::text AS "amountVnd",p.method,p.received_at AS "receivedAt" FROM payments p WHERE p.tenant_id=$1 AND p.student_id=$2 AND NOT EXISTS (SELECT 1 FROM payment_reversals pr WHERE pr.tenant_id=p.tenant_id AND pr.payment_id=p.id) ORDER BY p.received_at DESC,p.id DESC`, [tenant.tenantId, studentId]),
      pool.query(`SELECT r.id,r.payment_id AS "paymentId",r.amount_vnd::text AS "amountVnd",r.created_at AS "refundedAt" FROM refunds r JOIN payments p ON p.tenant_id=r.tenant_id AND p.id=r.payment_id WHERE r.tenant_id=$1 AND p.student_id=$2 ORDER BY r.created_at DESC,r.id DESC`, [tenant.tenantId, studentId]),
    ]);
    return {
      invoices: invoices.rows.map((row) => ({ invoiceNumber: row.invoiceNumber, issueDate: row.issueDate, dueDate: row.dueDate, totalVnd: String(row.totalVnd), ...invoiceBalance(row.status, row.totalVnd, row.credit_vnd, row.paid_vnd, row.dueDate), items: items.rows.filter((item) => item.invoiceId === row.id).map(({ invoiceId: _invoiceId, ...item }) => item) })),
      payments: payments.rows.map(({ id: _id, invoiceId: _invoiceId, ...row }) => serialize(row)),
      refunds: refunds.rows.map(({ id: _id, paymentId: _paymentId, ...row }) => serialize(row)),
    };
  }

  async notifications(query: { cursor?: string; limit?: number }) {
    const { tenant, pool, portal } = this.context();
    const position = parseCursor(query.cursor);
    const pairs = portal.subjects.map((subject) => [subject.type, subject.id]);
    const values: unknown[] = [tenant.tenantId, pairs.map(([type]) => type), pairs.map(([, id]) => id)];
    let page = '';
    if (position) { values.push(position[0], position[1]); page = ` AND (created_at,id)<($4::timestamptz,$5)`; }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100); values.push(limit + 1);
    const result = await pool.query<{ id: string; eventType: string; subject: string | null; body: string; createdAt: Date }>(`SELECT id,event_type AS "eventType",subject,body,created_at AS "createdAt" FROM communication_messages
      WHERE tenant_id=$1 AND channel='IN_APP' AND (recipient_type,recipient_id) IN (SELECT * FROM unnest($2::text[],$3::char(26)[]))${page}
      ORDER BY created_at DESC,id DESC LIMIT $${values.length}`, values);
    const rows = result.rows.slice(0, limit);
    return { data: rows.map(({ id: _id, ...row }) => serialize(row)), nextCursor: result.rows.length > limit && rows.length ? cursor(rows.at(-1)!.createdAt, rows.at(-1)!.id) : null };
  }

  private context() { const context = this.tenantContext.get(); if (!context.portal) throw new ForbiddenException(); return { ...context, portal: context.portal }; }
  private authorizeStudent(id: string) { const student = this.context().portal.students.find((item) => item.id === id); if (!student) throw new NotFoundException('Student not found'); return student; }
  private dateRange(from: string, to: string) { const start = new Date(`${from}T00:00:00Z`).getTime(); const end = new Date(`${to}T00:00:00Z`).getTime(); if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new BadRequestException('Invalid date range'); if ((end - start) / 86_400_000 > 366) throw new BadRequestException('The date range cannot exceed 366 days'); }
}
