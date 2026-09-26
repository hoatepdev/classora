import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { ulid } from "ulid";
import { AuditService } from "../audit/audit.service.js";
import { CommunicationService } from "../communication/communication.service.js";
import { TenantContextService } from "../tenant/tenant-context.service.js";
import type { CorrectAttendanceDto } from "./dto/correct-attendance.dto.js";
import type { CreateAttendanceSessionDto } from "./dto/create-attendance-session.dto.js";
import {
  AttendanceRecordStatus,
  type UpdateAttendanceRecordDto,
} from "./dto/update-attendance-record.dto.js";
import { AttendanceSessionStatus } from "./dto/update-attendance-session.dto.js";

type SessionRow = QueryResultRow & {
  id: string;
  tenantId: string;
  classId: string;
  scheduleId: string | null;
  teacherId: string | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  status: AttendanceSessionStatus;
  createdAt: Date;
  updatedAt: Date;
};
type SessionDetailRow = SessionRow & {
  classCode: string;
  className: string;
  teacherCode: string | null;
  teacherName: string | null;
  attendanceStatus: "OPEN" | "LOCKED";
};
type RecordRow = QueryResultRow & {
  id: string;
  tenantId: string;
  attendanceSessionId: string;
  studentId: string;
  status: AttendanceRecordStatus;
  note: string | null;
  source: "REGULAR" | "MAKEUP";
  makeupBookingId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
type SessionRecordRow = RecordRow & {
  studentCode: string;
  studentFullName: string;
};
type StudentHistoryRow = RecordRow & {
  classId: string;
  classCode: string;
  className: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  sessionStatus: AttendanceSessionStatus;
  source: "REGULAR" | "MAKEUP";
};

type Context = ReturnType<TenantContextService["get"]>;
const EXPIRATION_DAYS = 30;
const sessionColumns = `a.id, a.tenant_id AS "tenantId", a.class_id AS "classId", a.schedule_pattern_id AS "scheduleId", a.teacher_id AS "teacherId", a.session_date::text AS "sessionDate", a.start_time::text AS "startTime", a.end_time::text AS "endTime", a.status, a.created_at AS "createdAt", a.updated_at AS "updatedAt"`;
const recordColumns = `r.id, r.tenant_id AS "tenantId", r.session_id AS "attendanceSessionId", r.student_id AS "studentId", r.status, r.note, r.source, r.makeup_booking_id AS "makeupBookingId", r.created_at AS "createdAt", r.updated_at AS "updatedAt"`;

function actor(context: Context) {
  return {
    tenantId: context.tenant.tenantId,
    actorUserId: context.actorUserId,
    actorMembershipId: context.actorMembershipId,
    actorName: context.actorName,
    actorEmail: context.actorEmail,
    requestId: context.requestId,
  };
}
function serializeSession<T extends SessionRow>(row: T) {
  return {
    ...row,
    startTime: row.startTime.slice(0, 5),
    endTime: row.endTime.slice(0, 5),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function serializeRecord<T extends RecordRow>(row: T) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function errorConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "constraint" in error
    ? String(error.constraint)
    : undefined;
}
function mapError(error: unknown): never {
  const constraint = errorConstraint(error);
  if (constraint?.includes("session_student_key"))
    throw new ConflictException(
      "Student already has an attendance record for this session.",
    );
  if (constraint?.includes("source_key"))
    throw new ConflictException(
      "The absence already has a makeup entitlement.",
    );
  if (constraint?.includes("active_entitlement_key"))
    throw new ConflictException(
      "The entitlement already has an active booking.",
    );
  if (constraint?.includes("active_student_session_key"))
    throw new ConflictException("Student is already booked for this session.");
  if (
    constraint?.includes("manual_occurrence_key") ||
    constraint?.includes("schedule_date_key") ||
    constraint?.includes("occurrence_key") ||
    constraint?.includes("generated_occurrence_key")
  )
    throw new ConflictException(
      "Attendance session already exists for this occurrence.",
    );
  throw error;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly communication: CommunicationService,
  ) {}

  async create(input: CreateAttendanceSessionDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    let sessionId: string;
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [context.tenant.tenantId]);
      const occurrence = await this.resolveOccurrence(
        client,
        context.tenant.tenantId,
        input,
      );
      sessionId = ulid();
      await client.query(
        `INSERT INTO attendance_sessions (id, tenant_id, class_id, schedule_pattern_id, room_id, teacher_id, branch_id, session_date, start_time, end_time, manual_override) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::time,$10::time,TRUE)`,
        [
          sessionId,
          context.tenant.tenantId,
          input.classId,
          input.scheduleId ?? null,
          occurrence.roomId,
          occurrence.teacherId,
          occurrence.branchId,
          input.sessionDate,
          occurrence.startTime,
          occurrence.endTime,
        ],
      );
      await this.initializeInTransaction(
        client,
        context,
        sessionId,
        input.classId,
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "schedule.session.created",
        entityType: "Session",
        entityId: sessionId,
        after: { classId: input.classId, schedulePatternId: input.scheduleId ?? null, sessionDate: input.sessionDate, startTime: occurrence.startTime, endTime: occurrence.endTime, manualOverride: true },
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(error);
    } finally {
      client.release();
    }
    return this.get(sessionId!);
  }

  async initialize(id: string) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockSession(client, context.tenant.tenantId, id);
      const session = await this.sessionForUpdate(
        client,
        context.tenant.tenantId,
        id,
      );
      if (session.status !== AttendanceSessionStatus.OPEN)
        throw new ConflictException(
          "Only scheduled sessions can be initialized.",
        );
      await this.initializeInTransaction(client, context, id, session.classId);
      await client.query("COMMIT");
      return this.get(id);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const sessionResult = await pool.query<SessionDetailRow>(
      `SELECT ${sessionColumns}, c.code AS "classCode", c.name AS "className", t.code AS "teacherCode", t.name AS "teacherName", COALESCE(sh.status, 'OPEN') AS "attendanceStatus" FROM attendance_sessions a JOIN classes c ON c.id=a.class_id AND c.tenant_id=a.tenant_id LEFT JOIN teachers t ON t.id=a.teacher_id AND t.tenant_id=a.tenant_id LEFT JOIN attendance_sheets sh ON sh.tenant_id=a.tenant_id AND sh.session_id=a.id WHERE a.tenant_id=$1 AND a.id=$2`,
      [tenant.tenantId, id],
    );
    const session = sessionResult.rows[0];
    if (!session) throw new NotFoundException("Session not found");
    const records = await pool.query<SessionRecordRow>(
      `SELECT ${recordColumns}, s.code AS "studentCode", s.full_name AS "studentFullName", r.source FROM attendance_records r JOIN students s ON s.id=r.student_id AND s.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND r.session_id=$2 ORDER BY s.full_name,r.id`,
      [tenant.tenantId, id],
    );
    return {
      ...serializeSession(session),
      attendanceStatus: session.attendanceStatus,
      records: records.rows.map(serializeRecord),
    };
  }

  async updateRecord(id: string, input: UpdateAttendanceRecordDto) {
    if (input.status === undefined && input.note === undefined)
      throw new BadRequestException("At least one field is required");
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{
        sessionId: string;
        sessionStatus: AttendanceSessionStatus;
        source: "REGULAR" | "MAKEUP";
      }>(
        `SELECT a.id AS "sessionId", a.status AS "sessionStatus", r.source FROM attendance_records r JOIN attendance_sessions a ON a.id=r.session_id AND a.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE OF a`,
        [context.tenant.tenantId, id],
      );
      if (!existing.rows[0])
        throw new NotFoundException("Attendance record not found");
      const sheet = await client.query<{ status: string }>(
        "SELECT status FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
        [context.tenant.tenantId, existing.rows[0].sessionId],
      );
      if (
        sheet.rows[0]?.status === "LOCKED" ||
        existing.rows[0].sessionStatus !== AttendanceSessionStatus.OPEN
      )
        throw new ConflictException("Finalized attendance cannot be edited.");
      if (
        existing.rows[0].source === "MAKEUP" &&
        input.status !== undefined &&
        ![AttendanceRecordStatus.MAKEUP, AttendanceRecordStatus.ABSENT_UNEXCUSED].includes(input.status)
      )
        throw new ConflictException("Makeup attendance can only be marked as makeup or no-show.");
      const record = await client.query<RecordRow>(
        `SELECT ${recordColumns} FROM attendance_records r WHERE r.tenant_id=$1 AND r.id=$2 FOR UPDATE`,
        [context.tenant.tenantId, id],
      );
      if (!record.rows[0])
        throw new NotFoundException("Attendance record not found");
      const values: unknown[] = [context.tenant.tenantId, id];
      const fields: string[] = [];
      if (input.status !== undefined) {
        values.push(input.status);
        fields.push(`status=$${values.length}`);
      }
      if (input.note !== undefined) {
        values.push(input.note);
        fields.push(`note=$${values.length}`);
      }
      const result = await client.query<RecordRow>(
        `UPDATE attendance_records AS r SET ${fields.join(",")},updated_at=CURRENT_TIMESTAMP WHERE r.tenant_id=$1 AND r.id=$2 RETURNING ${recordColumns}`,
        values,
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "attendance.updated",
        entityType: "AttendanceRecord",
        entityId: id,
        before: { status: record.rows[0].status, note: record.rows[0].note },
        after: { status: result.rows[0].status, note: result.rows[0].note },
      });
      await client.query("COMMIT");
      return serializeRecord(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(error);
    } finally {
      client.release();
    }
  }

  async finalize(id: string) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockSession(client, context.tenant.tenantId, id);
      const session = await this.sessionForUpdate(
        client,
        context.tenant.tenantId,
        id,
      );
      if (["CANCELLED", "RESCHEDULED"].includes(session.status))
        throw new ConflictException(
          "Cancelled or rescheduled sessions cannot be finalized.",
        );
      const sheet = await client.query<{ status: string }>(
        "SELECT status FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
        [context.tenant.tenantId, id],
      );
      if (sheet.rows[0]?.status === "LOCKED")
        throw new ConflictException("Attendance is already finalized.");
      await this.initializeInTransaction(client, context, id, session.classId);
      const unmarked = await client.query(
        "SELECT 1 FROM attendance_records WHERE tenant_id=$1 AND session_id=$2 AND status=$3 LIMIT 1",
        [context.tenant.tenantId, id, AttendanceRecordStatus.UNMARKED],
      );
      if (unmarked.rows[0])
        throw new BadRequestException(
          "Every attendance record must be marked before finalization.",
        );
      await client.query(
        `INSERT INTO attendance_sheets (id,tenant_id,session_id,status,locked_at,locked_by_user_id) VALUES ($1,$2,$3,'LOCKED',CURRENT_TIMESTAMP,$4) ON CONFLICT (tenant_id,session_id) DO UPDATE SET status='LOCKED',locked_at=CURRENT_TIMESTAMP,locked_by_user_id=$4,updated_at=CURRENT_TIMESTAMP`,
        [ulid(), context.tenant.tenantId, id, context.actorUserId ?? null],
      );
      const completed = await client.query(
        `UPDATE attendance_sessions SET status='COMPLETED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND status='SCHEDULED'`,
        [context.tenant.tenantId, id],
      );
      if (!completed.rowCount)
        throw new ConflictException("Session is no longer scheduled.");
      await this.createEntitlements(client, context, id);
      await this.reconcileMakeupBookings(client, context, id);
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "attendance.finalized",
        entityType: "AttendanceSheet",
        entityId: id,
        after: { sessionId: id, status: "LOCKED" },
      });
      const dispatch = await this.communication.dispatchWithinTransaction(client, {
        eventType: "ATTENDANCE_ABSENCE",
        sourceEntityId: id,
      });
      await client.query("COMMIT");
      await this.communication.deliver(dispatch.messageIds);
      return this.get(id);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(error);
    } finally {
      client.release();
    }
  }

  async correct(id: string, input: CorrectAttendanceDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query("BEGIN");
      const oldResult = await client.query<RecordRow & { sessionId: string }>(
        `SELECT ${recordColumns}, r.session_id AS "sessionId" FROM attendance_records r JOIN attendance_sheets sh ON sh.tenant_id=r.tenant_id AND sh.session_id=r.session_id JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id WHERE r.tenant_id=$1 AND r.id=$2 AND sh.status='LOCKED' FOR UPDATE OF a,sh,r`,
        [context.tenant.tenantId, id],
      );
      const old = oldResult.rows[0];
      if (!old)
        throw new NotFoundException("Locked attendance record not found");
      const reason = input.reason.trim();
      if (!reason)
        throw new BadRequestException("Correction reason is required.");
      if (input.status === AttendanceRecordStatus.UNMARKED)
        throw new BadRequestException(
          "Locked attendance cannot be reset to UNMARKED.",
        );
      if (old.status === input.status)
        throw new BadRequestException(
          "Correction must change the attendance status.",
        );
      const entitlement = await client.query<{ id: string; status: string }>(
        "SELECT id,status FROM makeup_entitlements WHERE tenant_id=$1 AND source_attendance_record_id=$2 FOR UPDATE",
        [context.tenant.tenantId, id],
      );
      if (
        entitlement.rows[0] &&
        ["BOOKED", "USED"].includes(entitlement.rows[0].status) &&
        old.status === AttendanceRecordStatus.ABSENT_EXCUSED &&
        input.status !== AttendanceRecordStatus.ABSENT_EXCUSED
      )
        throw new ConflictException(
          "Cancel the unused makeup booking before correcting this absence.",
        );
      if (
        input.status === AttendanceRecordStatus.MAKEUP &&
        (old.source !== "MAKEUP" || !old.makeupBookingId)
      )
        throw new ConflictException("MAKEUP status requires a makeup booking.");
      if (
        old.source === "MAKEUP" &&
        ![AttendanceRecordStatus.MAKEUP, AttendanceRecordStatus.ABSENT_UNEXCUSED].includes(input.status)
      )
        throw new ConflictException(
          "Makeup attendance can only be marked as makeup or no-show.",
        );
      const updated = await client.query<RecordRow>(
        `UPDATE attendance_records AS r SET status=$3,note=$4,updated_at=CURRENT_TIMESTAMP WHERE r.tenant_id=$1 AND r.id=$2 RETURNING ${recordColumns}`,
        [context.tenant.tenantId, id, input.status, input.note ?? old.note],
      );
      await client.query(
        `INSERT INTO attendance_corrections (id,tenant_id,attendance_record_id,before_status,after_status,before_note,after_note,reason,actor_user_id,actor_membership_id,request_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          ulid(),
          context.tenant.tenantId,
          id,
          old.status,
          updated.rows[0].status,
          old.note,
          updated.rows[0].note,
          input.reason.trim(),
          context.actorUserId ?? null,
          context.actorMembershipId ?? null,
          context.requestId ?? null,
        ],
      );
      await this.reconcileCorrectedEntitlement(
        client,
        context,
        updated.rows[0],
        old.status,
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "attendance.corrected",
        entityType: "AttendanceRecord",
        entityId: id,
        reason: input.reason.trim(),
        before: {
          status: old.status,
          note: old.note,
          sessionId: old.sessionId,
          studentId: old.studentId,
        },
        after: {
          status: updated.rows[0].status,
          note: updated.rows[0].note,
          sessionId: old.sessionId,
          studentId: old.studentId,
        },
      });
      await client.query("COMMIT");
      return serializeRecord(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(error);
    } finally {
      client.release();
    }
  }

  async listEntitlements(studentId?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const student = studentId ? " AND e.student_id=$2" : "";
    if (studentId) values.push(studentId);
    const rows = await pool.query(
      `SELECT e.id,e.tenant_id AS "tenantId",e.student_id AS "studentId",e.source_attendance_record_id AS "sourceAttendanceRecordId",e.source_session_id AS "sourceSessionId",e.source_enrollment_id AS "sourceEnrollmentId",CASE WHEN e.status IN ('AVAILABLE','BOOKED') AND CURRENT_DATE > e.expires_at THEN 'EXPIRED' ELSE e.status END AS status,e.expires_at::text AS "expiresAt",b.id AS "bookingId",b.destination_session_id AS "bookingDestinationSessionId",b.status AS "bookingStatus",e.created_at AS "createdAt",e.updated_at AS "updatedAt" FROM makeup_entitlements e LEFT JOIN makeup_bookings b ON b.tenant_id=e.tenant_id AND b.entitlement_id=e.id AND b.status='BOOKED' WHERE e.tenant_id=$1${student} ORDER BY e.expires_at,e.id`,
      values,
    );
    return rows.rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async bookMakeup(entitlementId: string, destinationSessionId: string) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query("BEGIN");
      const entitlement = await client.query<{
        studentId: string;
        status: string;
        expiresAt: string;
        sourceSessionId: string;
        expired: boolean;
      }>(
        'SELECT student_id AS "studentId",status,expires_at::text AS "expiresAt",source_session_id AS "sourceSessionId",CURRENT_DATE > expires_at AS expired FROM makeup_entitlements WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [context.tenant.tenantId, entitlementId],
      );
      const source = entitlement.rows[0];
      if (!source) throw new NotFoundException("Makeup entitlement not found");
      if (source.status !== "AVAILABLE")
        throw new ConflictException("Makeup entitlement is not available.");
      const sourceSession = await client.query<{ status: string }>(
        "SELECT status FROM attendance_sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [context.tenant.tenantId, source.sourceSessionId],
      );
      if (!sourceSession.rows[0])
        throw new NotFoundException("Source session not found");
      if (sourceSession.rows[0].status !== "COMPLETED")
        throw new ConflictException(
          "Makeup entitlement is not available until the source session is completed.",
        );
      if (source.expired) {
        await client.query(
          "UPDATE makeup_entitlements SET status='EXPIRED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2",
          [context.tenant.tenantId, entitlementId],
        );
        throw new ConflictException("Makeup entitlement has expired.");
      }
      const destination = await client.query<{
        classId: string;
        courseId: string | null;
        courseLevelId: string | null;
        sessionDate: string;
        status: string;
        capacity: number | null;
      }>(
        `SELECT a.class_id AS "classId",c.course_id AS "courseId",c.course_level_id AS "courseLevelId",a.session_date::text AS "sessionDate",a.status,c.capacity FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE`,
        [context.tenant.tenantId, destinationSessionId],
      );
      const target = destination.rows[0];
      if (!target) throw new NotFoundException("Destination session not found");
      if (target.status !== "SCHEDULED")
        throw new ConflictException("Destination session is not available.");
      const sourceClass = await client.query<{
        courseId: string | null;
        courseLevelId: string | null;
      }>(
        `SELECT c.course_id AS "courseId",c.course_level_id AS "courseLevelId" FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE a.tenant_id=$1 AND a.id=$2`,
        [context.tenant.tenantId, source.sourceSessionId],
      );
      const origin = sourceClass.rows[0];
      if (
        !origin ||
        target.courseId !== origin.courseId ||
        (origin.courseLevelId && target.courseLevelId !== origin.courseLevelId)
      )
        throw new ConflictException(
          "Destination class is not academically compatible.",
        );
      if (target.sessionDate > source.expiresAt)
        throw new ConflictException(
          "Destination session is after the entitlement expiration.",
        );
      await this.initializeInTransaction(
        client,
        context,
        destinationSessionId,
        target.classId,
      );
      const destinationSheet = await client.query<{ status: string }>(
        "SELECT status FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
        [context.tenant.tenantId, destinationSessionId],
      );
      if (destinationSheet.rows[0]?.status !== "OPEN")
        throw new ConflictException("Destination attendance is finalized.");
      const duplicate = await client.query<{
        source?: string;
        status?: string;
      }>(
        `SELECT source,status FROM attendance_records WHERE tenant_id=$1 AND session_id=$2 AND student_id=$3 UNION ALL SELECT 'MAKEUP' AS source,'BOOKED' AS status FROM makeup_bookings WHERE tenant_id=$1 AND destination_session_id=$2 AND student_id=$3 AND status='BOOKED'`,
        [context.tenant.tenantId, destinationSessionId, source.studentId],
      );
      if (
        duplicate.rows[0] &&
        !(
          duplicate.rows[0].source === "REGULAR" &&
          duplicate.rows[0].status === "UNMARKED"
        )
      )
        throw new ConflictException(
          "Student already participates in the destination session.",
        );
      if (target.capacity !== null) {
        const count = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM (
        SELECT student_id FROM attendance_records WHERE tenant_id=$1 AND session_id=$2 AND student_id <> $3
        UNION
        SELECT student_id FROM makeup_bookings WHERE tenant_id=$1 AND destination_session_id=$2 AND status='BOOKED' AND student_id <> $3
      ) occupied_students`,
          [context.tenant.tenantId, destinationSessionId, source.studentId],
        );
        const occupied = Number(count.rows[0]?.count ?? 0);
        if (occupied >= target.capacity)
          throw new ConflictException("Destination session is at capacity.");
      }
      const bookingId = ulid();
      await client.query(
        `INSERT INTO makeup_bookings (id,tenant_id,entitlement_id,student_id,destination_session_id) VALUES ($1,$2,$3,$4,$5)`,
        [
          bookingId,
          context.tenant.tenantId,
          entitlementId,
          source.studentId,
          destinationSessionId,
        ],
      );
      await client.query(
        "UPDATE makeup_entitlements SET status='BOOKED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2",
        [context.tenant.tenantId, entitlementId],
      );
      await client.query(
        "SELECT 1 FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
        [context.tenant.tenantId, destinationSessionId],
      );
      await client.query(
        `INSERT INTO attendance_records (id,tenant_id,session_id,student_id,makeup_booking_id,status,source) SELECT $1,$2,$3,$4,$5,'UNMARKED','MAKEUP' WHERE EXISTS (SELECT 1 FROM attendance_sheets WHERE tenant_id=$2 AND session_id=$3 AND status='OPEN') ON CONFLICT (tenant_id,session_id,student_id) DO UPDATE SET status='MAKEUP',makeup_booking_id=EXCLUDED.makeup_booking_id,source='MAKEUP' WHERE attendance_records.source='REGULAR' AND attendance_records.status='UNMARKED'`,
        [
          ulid(),
          context.tenant.tenantId,
          destinationSessionId,
          source.studentId,
          bookingId,
        ],
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "makeup.booking_created",
        entityType: "MakeupBooking",
        entityId: bookingId,
        after: {
          entitlementId,
          studentId: source.studentId,
          destinationSessionId,
        },
      });
      await client.query("COMMIT");
      return {
        id: bookingId,
        entitlementId,
        studentId: source.studentId,
        destinationSessionId,
        status: "BOOKED",
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(error);
    } finally {
      client.release();
    }
  }

  async rebookMakeup(bookingId: string, destinationSessionId: string) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query("BEGIN");
      const bookingResult = await client.query<{
        entitlementId: string;
        studentId: string;
        currentSessionId: string;
        status: string;
        sourceSessionId: string;
        expiresAt: string;
        expired: boolean;
      }>(
        `SELECT b.entitlement_id AS "entitlementId",b.student_id AS "studentId",b.destination_session_id AS "currentSessionId",b.status,e.source_session_id AS "sourceSessionId",e.expires_at::text AS "expiresAt",CURRENT_DATE > e.expires_at AS expired FROM makeup_bookings b JOIN makeup_entitlements e ON e.tenant_id=b.tenant_id AND e.id=b.entitlement_id WHERE b.tenant_id=$1 AND b.id=$2 FOR UPDATE OF b,e`,
        [context.tenant.tenantId, bookingId],
      );
      const booking = bookingResult.rows[0];
      if (!booking) throw new NotFoundException("Makeup booking not found");
      if (booking.status !== "BOOKED")
        throw new ConflictException(
          "Only an unused makeup booking can be rebooked.",
        );
      if (booking.expired)
        throw new ConflictException("Makeup entitlement has expired.");
      if (booking.currentSessionId === destinationSessionId)
        throw new BadRequestException(
          "The booking already targets this session.",
        );
      if (
        await client
          .query(
            "SELECT 1 FROM attendance_sessions WHERE tenant_id=$1 AND id=$2 AND status='COMPLETED' FOR UPDATE",
            [context.tenant.tenantId, booking.sourceSessionId],
          )
          .then((result) => !result.rows[0])
      )
        throw new ConflictException(
          "Makeup entitlement is not available until the source session is completed.",
        );
      const destination = await client.query<{
        classId: string;
        courseId: string | null;
        courseLevelId: string | null;
        sessionDate: string;
        status: string;
        capacity: number | null;
      }>(
        `SELECT a.class_id AS "classId",c.course_id AS "courseId",c.course_level_id AS "courseLevelId",a.session_date::text AS "sessionDate",a.status,c.capacity FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE`,
        [context.tenant.tenantId, destinationSessionId],
      );
      const target = destination.rows[0];
      if (!target) throw new NotFoundException("Destination session not found");
      if (target.status !== "SCHEDULED")
        throw new ConflictException("Destination session is not available.");
      if (target.sessionDate > booking.expiresAt)
        throw new ConflictException(
          "Destination session is after the entitlement expiration.",
        );
      const sourceClass = await client.query<{
        courseId: string | null;
        courseLevelId: string | null;
      }>(
        `SELECT c.course_id AS "courseId",c.course_level_id AS "courseLevelId" FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE a.tenant_id=$1 AND a.id=$2`,
        [context.tenant.tenantId, booking.sourceSessionId],
      );
      const origin = sourceClass.rows[0];
      if (
        !origin ||
        target.courseId !== origin.courseId ||
        (origin.courseLevelId && target.courseLevelId !== origin.courseLevelId)
      )
        throw new ConflictException(
          "Destination class is not academically compatible.",
        );
      await this.initializeInTransaction(
        client,
        context,
        destinationSessionId,
        target.classId,
      );
      const destinationSheet = await client.query<{ status: string }>(
        "SELECT status FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
        [context.tenant.tenantId, destinationSessionId],
      );
      if (destinationSheet.rows[0]?.status !== "OPEN")
        throw new ConflictException("Destination attendance is finalized.");
      const duplicate = await client.query<{
        source?: string;
        status?: string;
      }>(
        `SELECT source,status FROM attendance_records WHERE tenant_id=$1 AND session_id=$2 AND student_id=$3 UNION ALL SELECT 'MAKEUP' AS source,'BOOKED' AS status FROM makeup_bookings WHERE tenant_id=$1 AND destination_session_id=$2 AND student_id=$3 AND status='BOOKED'`,
        [context.tenant.tenantId, destinationSessionId, booking.studentId],
      );
      if (
        duplicate.rows[0] &&
        !(
          duplicate.rows[0].source === "REGULAR" &&
          duplicate.rows[0].status === "UNMARKED"
        )
      )
        throw new ConflictException(
          "Student already participates in the destination session.",
        );
      if (target.capacity !== null) {
        const count = await client.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM (SELECT student_id FROM attendance_records WHERE tenant_id=$1 AND session_id=$2 AND student_id <> $3 UNION SELECT student_id FROM makeup_bookings WHERE tenant_id=$1 AND destination_session_id=$2 AND status='BOOKED' AND student_id <> $3) occupied_students`,
          [context.tenant.tenantId, destinationSessionId, booking.studentId],
        );
        if (Number(count.rows[0]?.count ?? 0) >= target.capacity)
          throw new ConflictException("Destination session is at capacity.");
      }
      const currentSheet = await client.query<{ status: string }>(
        "SELECT status FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
        [context.tenant.tenantId, booking.currentSessionId],
      );
      if (currentSheet.rows[0]?.status === "LOCKED")
        throw new ConflictException(
          "A booking in a finalized destination session cannot be rebooked.",
        );
      await client.query(
        `WITH restored AS (
          UPDATE attendance_records SET status='UNMARKED',source='REGULAR',makeup_booking_id=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE tenant_id=$1 AND makeup_booking_id=$2 AND session_id=$3 AND enrollment_id IS NOT NULL
        )
        DELETE FROM attendance_records WHERE tenant_id=$1 AND makeup_booking_id=$2 AND session_id=$3 AND enrollment_id IS NULL`,
        [context.tenant.tenantId, bookingId, booking.currentSessionId],
      );
      await client.query(
        `UPDATE makeup_bookings SET destination_session_id=$3,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND status='BOOKED'`,
        [context.tenant.tenantId, bookingId, destinationSessionId],
      );
      await client.query(
        "SELECT 1 FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
        [context.tenant.tenantId, destinationSessionId],
      );
      await client.query(
        `INSERT INTO attendance_records (id,tenant_id,session_id,student_id,makeup_booking_id,status,source) SELECT $1,$2,$3,$4,$5,'MAKEUP','MAKEUP' WHERE EXISTS (SELECT 1 FROM attendance_sheets WHERE tenant_id=$2 AND session_id=$3 AND status='OPEN') ON CONFLICT (tenant_id,session_id,student_id) DO UPDATE SET status='MAKEUP',makeup_booking_id=EXCLUDED.makeup_booking_id,source='MAKEUP' WHERE attendance_records.source='REGULAR' AND attendance_records.status='UNMARKED'`,
        [
          ulid(),
          context.tenant.tenantId,
          destinationSessionId,
          booking.studentId,
          bookingId,
        ],
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "makeup.booking_rebooked",
        entityType: "MakeupBooking",
        entityId: bookingId,
        before: { destinationSessionId: booking.currentSessionId },
        after: { destinationSessionId },
      });
      await client.query("COMMIT");
      return {
        id: bookingId,
        entitlementId: booking.entitlementId,
        studentId: booking.studentId,
        destinationSessionId,
        status: "BOOKED",
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(error);
    } finally {
      client.release();
    }
  }

  async cancelMakeup(bookingId: string) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query("BEGIN");
      const booking = await client.query<{
        entitlementId: string;
        status: string;
      }>(
        'SELECT entitlement_id AS "entitlementId",status FROM makeup_bookings WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [context.tenant.tenantId, bookingId],
      );
      if (!booking.rows[0])
        throw new NotFoundException("Makeup booking not found");
      if (booking.rows[0].status !== "BOOKED")
        throw new ConflictException(
          "Only an unused makeup booking can be cancelled.",
        );
      await client.query(
        "UPDATE makeup_bookings SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2",
        [context.tenant.tenantId, bookingId],
      );
      await client.query(
        "UPDATE makeup_entitlements SET status=CASE WHEN CURRENT_DATE > expires_at THEN 'EXPIRED' ELSE 'AVAILABLE' END,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2",
        [context.tenant.tenantId, booking.rows[0].entitlementId],
      );
      await client.query(
        `WITH restored AS (
          UPDATE attendance_records SET status='UNMARKED',source='REGULAR',makeup_booking_id=NULL,updated_at=CURRENT_TIMESTAMP
          WHERE tenant_id=$1 AND makeup_booking_id=$2 AND enrollment_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM attendance_sheets WHERE tenant_id=$1 AND session_id=attendance_records.session_id AND status='OPEN')
        )
        DELETE FROM attendance_records WHERE tenant_id=$1 AND makeup_booking_id=$2 AND enrollment_id IS NULL
          AND EXISTS (SELECT 1 FROM attendance_sheets WHERE tenant_id=$1 AND session_id=attendance_records.session_id AND status='OPEN')`,
        [context.tenant.tenantId, bookingId],
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "makeup.booking_cancelled",
        entityType: "MakeupBooking",
        entityId: bookingId,
        after: { status: "CANCELLED" },
      });
      await client.query("COMMIT");
      return { id: bookingId, status: "CANCELLED" };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      return mapError(error);
    } finally {
      client.release();
    }
  }

  async corrections(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const exists = await pool.query(
      "SELECT 1 FROM attendance_records WHERE tenant_id=$1 AND id=$2",
      [tenant.tenantId, id],
    );
    if (!exists.rows[0])
      throw new NotFoundException("Attendance record not found");
    return (
      await pool.query(
        `SELECT id,attendance_record_id AS "attendanceRecordId",before_status AS "beforeStatus",after_status AS "afterStatus",before_note AS "beforeNote",after_note AS "afterNote",reason,actor_user_id AS "actorUserId",actor_membership_id AS "actorMembershipId",request_id AS "requestId",created_at AS "createdAt" FROM attendance_corrections WHERE tenant_id=$1 AND attendance_record_id=$2 ORDER BY created_at,id`,
        [tenant.tenantId, id],
      )
    ).rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async listForClass(classId: string) {
    const { tenant, pool } = this.tenantContext.get();
    if (
      !(
        await pool.query("SELECT 1 FROM classes WHERE tenant_id=$1 AND id=$2", [
          tenant.tenantId,
          classId,
        ])
      ).rows[0]
    )
      throw new NotFoundException("Class not found");
    const result = await pool.query<SessionRow>(
      `SELECT ${sessionColumns},c.code AS "classCode",c.name AS "className",t.code AS "teacherCode",t.name AS "teacherName",COUNT(r.id)::int AS "recordCount" FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id LEFT JOIN teachers t ON t.tenant_id=a.tenant_id AND t.id=a.teacher_id LEFT JOIN attendance_records r ON r.tenant_id=a.tenant_id AND r.session_id=a.id WHERE a.tenant_id=$1 AND a.class_id=$2 GROUP BY a.id,c.code,c.name,t.code,t.name ORDER BY a.session_date DESC,a.start_time DESC,a.id DESC`,
      [tenant.tenantId, classId],
    );
    return result.rows.map(serializeSession);
  }
  async listForStudent(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    if (
      !(
        await pool.query(
          "SELECT 1 FROM students WHERE tenant_id=$1 AND id=$2",
          [tenant.tenantId, studentId],
        )
      ).rows[0]
    )
      throw new NotFoundException("Student not found");
    const result = await pool.query<StudentHistoryRow>(
      `SELECT ${recordColumns},a.class_id AS "classId",c.code AS "classCode",c.name AS "className",a.session_date::text AS "sessionDate",a.start_time::text AS "startTime",a.end_time::text AS "endTime",a.status AS "sessionStatus",r.source FROM attendance_records r JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id WHERE r.tenant_id=$1 AND r.student_id=$2 ORDER BY a.session_date DESC,a.start_time DESC,r.id DESC`,
      [tenant.tenantId, studentId],
    );
    return result.rows.map((row) => ({
      ...serializeRecord(row),
      startTime: row.startTime.slice(0, 5),
      endTime: row.endTime.slice(0, 5),
    }));
  }

  private async initializeInTransaction(
    client: PoolClient,
    context: Context,
    sessionId: string,
    classId: string,
  ) {
    const sheet = await client.query<{ id: string; status: string }>(
      "SELECT id,status FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE",
      [context.tenant.tenantId, sessionId],
    );
    if (sheet.rows[0]?.status === "LOCKED") return;
    const shouldSnapshotRoster = !sheet.rows[0];
    if (shouldSnapshotRoster) {
      await client.query(
        "INSERT INTO attendance_sheets (id,tenant_id,session_id) VALUES ($1,$2,$3)",
        [ulid(), context.tenant.tenantId, sessionId],
      );
      const enrollments = await client.query<{
        studentId: string;
        enrollmentId: string;
      }>(
        `SELECT id AS "enrollmentId",student_id AS "studentId" FROM enrollments WHERE tenant_id=$1 AND class_id=$2 AND status IN ('TRIAL','ACTIVE') ORDER BY student_id`,
        [context.tenant.tenantId, classId],
      );
      for (const enrollment of enrollments.rows)
        await client.query(
          `INSERT INTO attendance_records (id,tenant_id,session_id,student_id,enrollment_id,status,source) VALUES ($1,$2,$3,$4,$5,'UNMARKED','REGULAR') ON CONFLICT (tenant_id,session_id,student_id) DO NOTHING`,
          [
            ulid(),
            context.tenant.tenantId,
            sessionId,
            enrollment.studentId,
            enrollment.enrollmentId,
          ],
        );
    }
    const makeups = await client.query<{
      studentId: string;
      bookingId: string;
    }>(
      `SELECT student_id AS "studentId",id AS "bookingId" FROM makeup_bookings WHERE tenant_id=$1 AND destination_session_id=$2 AND status='BOOKED'`,
      [context.tenant.tenantId, sessionId],
    );
    for (const booking of makeups.rows)
      await client.query(
        `INSERT INTO attendance_records (id,tenant_id,session_id,student_id,makeup_booking_id,status,source) VALUES ($1,$2,$3,$4,$5,'UNMARKED','MAKEUP') ON CONFLICT (tenant_id,session_id,student_id) DO UPDATE SET status='MAKEUP',makeup_booking_id=EXCLUDED.makeup_booking_id,source='MAKEUP' WHERE attendance_records.source='REGULAR' AND attendance_records.status='UNMARKED'`,
        [
          ulid(),
          context.tenant.tenantId,
          sessionId,
          booking.studentId,
          booking.bookingId,
        ],
      );
    await this.audit.recordTenant(client, {
      ...actor(context),
      action: "attendance.initialized",
      entityType: "AttendanceSheet",
      entityId: sessionId,
      after: { sessionId },
    });
  }

  private async createEntitlements(
    client: PoolClient,
    context: Context,
    sessionId: string,
  ) {
    const rows = await client.query<{
      recordId: string;
      studentId: string;
      enrollmentId: string | null;
      sessionDate: string;
    }>(
      `SELECT r.id AS "recordId",r.student_id AS "studentId",r.enrollment_id AS "enrollmentId",a.session_date::text AS "sessionDate" FROM attendance_records r JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id WHERE r.tenant_id=$1 AND r.session_id=$2 AND r.status='ABSENT_EXCUSED' AND r.source='REGULAR' AND NOT EXISTS (SELECT 1 FROM enrollments te WHERE te.tenant_id=r.tenant_id AND te.id=r.enrollment_id AND te.status='TRIAL')`,
      [context.tenant.tenantId, sessionId],
    );
    for (const row of rows.rows) {
      const entitlementId = ulid();
      const result = await client.query(
        `INSERT INTO makeup_entitlements (id,tenant_id,student_id,source_attendance_record_id,source_session_id,source_enrollment_id,expires_at) VALUES ($1,$2,$3,$4,$5,$6,($7::date + $8::int)) ON CONFLICT (tenant_id,source_attendance_record_id) DO NOTHING`,
        [
          entitlementId,
          context.tenant.tenantId,
          row.studentId,
          row.recordId,
          sessionId,
          row.enrollmentId,
          row.sessionDate,
          EXPIRATION_DAYS,
        ],
      );
      if (result.rowCount) {
        await this.audit.recordTenant(client, {
          ...actor(context),
          action: "makeup.entitlement_created",
          entityType: "MakeupEntitlement",
          entityId: entitlementId,
          after: {
            sourceAttendanceRecordId: row.recordId,
            sourceSessionId: sessionId,
            studentId: row.studentId,
            expiresInDays: EXPIRATION_DAYS,
          },
        });
      }
    }
  }

  private async reconcileMakeupBookings(
    client: PoolClient,
    context: Context,
    sessionId: string,
  ) {
    const rows = await client.query<{
      id: string;
      entitlementId: string;
      studentId: string;
    }>(
      `SELECT b.id,b.entitlement_id AS "entitlementId",b.student_id AS "studentId" FROM makeup_bookings b LEFT JOIN attendance_records r ON r.tenant_id=b.tenant_id AND r.makeup_booking_id=b.id WHERE b.tenant_id=$1 AND b.destination_session_id=$2 AND b.status='BOOKED' AND (r.id IS NULL OR r.status <> 'MAKEUP') FOR UPDATE OF b`,
      [context.tenant.tenantId, sessionId],
    );
    for (const row of rows.rows) {
      await client.query(
        `UPDATE makeup_bookings SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [context.tenant.tenantId, row.id],
      );
      await client.query(
        `UPDATE makeup_entitlements SET status=CASE WHEN CURRENT_DATE > expires_at THEN 'EXPIRED' ELSE 'AVAILABLE' END,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 AND status='BOOKED'`,
        [context.tenant.tenantId, row.entitlementId],
      );
    }
    const used = await client.query<{ id: string; entitlementId: string }>(
      `SELECT b.id,b.entitlement_id AS "entitlementId" FROM makeup_bookings b JOIN attendance_records r ON r.tenant_id=b.tenant_id AND r.makeup_booking_id=b.id WHERE b.tenant_id=$1 AND b.destination_session_id=$2 AND b.status='BOOKED' AND r.status='MAKEUP' FOR UPDATE OF b`,
      [context.tenant.tenantId, sessionId],
    );
    for (const row of used.rows) {
      await client.query(
        `UPDATE makeup_bookings SET status='USED',used_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [context.tenant.tenantId, row.id],
      );
      await client.query(
        `UPDATE makeup_entitlements SET status='USED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [context.tenant.tenantId, row.entitlementId],
      );
      await this.audit.recordTenant(client, {
        ...actor(context),
        action: "makeup.booking_used",
        entityType: "MakeupBooking",
        entityId: row.id,
        after: { status: "USED", entitlementId: row.entitlementId },
      });
    }
  }

  private async reconcileCorrectedEntitlement(
    client: PoolClient,
    context: Context,
    record: RecordRow,
    beforeStatus: string,
  ) {
    const madeEligible =
      record.status === AttendanceRecordStatus.ABSENT_EXCUSED &&
      beforeStatus !== AttendanceRecordStatus.ABSENT_EXCUSED;
    const madeIneligible =
      record.status !== AttendanceRecordStatus.ABSENT_EXCUSED &&
      beforeStatus === AttendanceRecordStatus.ABSENT_EXCUSED;
    if (madeEligible) {
      const existing = await client.query<{ id: string; status: string }>(
        "SELECT id,status FROM makeup_entitlements WHERE tenant_id=$1 AND source_attendance_record_id=$2 FOR UPDATE",
        [context.tenant.tenantId, record.id],
      );
      if (existing.rows[0]?.status === "REVOKED") {
        await client.query(
          "UPDATE makeup_entitlements SET status=CASE WHEN CURRENT_DATE > expires_at THEN 'EXPIRED' ELSE 'AVAILABLE' END,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2",
          [context.tenant.tenantId, existing.rows[0].id],
        );
      } else if (!existing.rows[0]) {
        await this.createEntitlements(
          client,
          context,
          record.attendanceSessionId,
        );
      }
    }
    if (madeIneligible) {
      const existing = await client.query<{ id: string; status: string }>(
        "SELECT id,status FROM makeup_entitlements WHERE tenant_id=$1 AND source_attendance_record_id=$2 FOR UPDATE",
        [context.tenant.tenantId, record.id],
      );
      if (existing.rows[0] && existing.rows[0].status === "AVAILABLE") {
        await client.query(
          "UPDATE makeup_entitlements SET status='REVOKED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2",
          [context.tenant.tenantId, existing.rows[0].id],
        );
        await this.audit.recordTenant(client, {
          ...actor(context),
          action: "makeup.entitlement_revoked",
          entityType: "MakeupEntitlement",
          entityId: existing.rows[0].id,
          before: { status: "AVAILABLE" },
          after: { status: "REVOKED" },
        });
      }
    }
  }

  private async lockSession(client: PoolClient, tenantId: string, id: string) {
    const result = await client.query(
      "SELECT 1 FROM attendance_sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException("Session not found");
  }
  private async sessionForUpdate(
    client: PoolClient,
    tenantId: string,
    id: string,
  ) {
    const result = await client.query<SessionRow>(
      `SELECT ${sessionColumns} FROM attendance_sessions a WHERE a.tenant_id=$1 AND a.id=$2 FOR UPDATE`,
      [tenantId, id],
    );
    if (!result.rows[0]) throw new NotFoundException("Session not found");
    return result.rows[0];
  }
  private async assertNoSessionConflict(
    client: PoolClient,
    tenantId: string,
    classId: string,
    teacherId: string | null,
    roomId: string | null,
    sessionDate: string,
    startTime: string,
    endTime: string,
  ) {
    const conflict = await client.query<{ classId: string; teacherId: string | null; roomId: string | null }>(
      `SELECT class_id AS "classId",teacher_id AS "teacherId",room_id AS "roomId" FROM attendance_sessions
       WHERE tenant_id=$1 AND session_date=$2::date AND status IN ('SCHEDULED','COMPLETED')
         AND (class_id=$3 OR ($4::char(26) IS NOT NULL AND teacher_id=$4) OR ($5::char(26) IS NOT NULL AND room_id=$5))
         AND start_time < $7::time AND end_time > $6::time LIMIT 1`,
      [tenantId, sessionDate, classId, teacherId, roomId, startTime, endTime],
    );
    const row = conflict.rows[0];
    if (!row) return;
    if (row.classId === classId) throw new ConflictException("Class already has an overlapping session.");
    if (teacherId && row.teacherId === teacherId) throw new ConflictException("Teacher already has an overlapping session.");
    throw new ConflictException("Room already has an overlapping session.");
  }

  private async resolveOccurrence(
    client: PoolClient,
    tenantId: string,
    input: CreateAttendanceSessionDto,
  ) {
    const classResult = await client.query<{
      branchId: string | null;
      startDate: string | null;
      expectedEndDate: string | null;
      status: string;
    }>(
      `SELECT branch_id AS "branchId",start_date::text AS "startDate",expected_end_date::text AS "expectedEndDate",status
       FROM classes WHERE tenant_id=$1 AND id=$2`,
      [tenantId, input.classId],
    );
    const classRecord = classResult.rows[0];
    if (!classRecord) throw new NotFoundException("Class not found");
    if (classRecord.status !== "ACTIVE") throw new ConflictException("Class is disabled.");
    if ((classRecord.startDate && input.sessionDate < classRecord.startDate) || (classRecord.expectedEndDate && input.sessionDate > classRecord.expectedEndDate))
      throw new ConflictException("Session date is outside the class lifecycle.");
    if (input.scheduleId) {
      const result = await client.query<{
        classId: string;
        teacherId: string;
        roomId: string | null;
        branchId: string | null;
        dayOfWeek: string;
        startTime: string;
        endTime: string;
        status: string;
        effectiveFrom: string | null;
        effectiveUntil: string | null;
      }>(
        `SELECT class_id AS "classId",teacher_id AS "teacherId",room_id AS "roomId",branch_id AS "branchId",day_of_week AS "dayOfWeek",start_time::text AS "startTime",end_time::text AS "endTime",status,effective_from::text AS "effectiveFrom",effective_until::text AS "effectiveUntil" FROM schedules WHERE tenant_id=$1 AND id=$2`,
        [tenantId, input.scheduleId],
      );
      const schedule = result.rows[0];
      if (!schedule) throw new NotFoundException("Schedule not found");
      if (schedule.classId !== input.classId)
        throw new BadRequestException(
          "Schedule does not belong to this class.",
        );
      if (schedule.status !== "ACTIVE")
        throw new ConflictException("Schedule is disabled.");
      if (
        (schedule.effectiveFrom &&
          input.sessionDate < schedule.effectiveFrom) ||
        (schedule.effectiveUntil && input.sessionDate > schedule.effectiveUntil)
      )
        throw new ConflictException(
          "Session date is outside the schedule effective range.",
        );
      const weekdays = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
      if (weekdays[new Date(`${input.sessionDate}T00:00:00Z`).getUTCDay()] !== schedule.dayOfWeek)
        throw new ConflictException("Session date does not match the schedule weekday.");
      const excluded = await client.query(
        `SELECT 1 FROM schedule_exclusions WHERE tenant_id=$1 AND date=$2::date AND (branch_id IS NULL OR branch_id=$3)`,
        [tenantId, input.sessionDate, schedule.branchId ?? classRecord.branchId],
      );
      if (excluded.rows[0]) throw new ConflictException("Session date is excluded from scheduling.");
      await this.assertNoSessionConflict(client, tenantId, input.classId, schedule.teacherId, schedule.roomId, input.sessionDate, schedule.startTime, schedule.endTime);
      return {
        teacherId: schedule.teacherId,
        roomId: schedule.roomId,
        branchId: schedule.branchId ?? classRecord.branchId,
        startTime: schedule.startTime.slice(0, 5),
        endTime: schedule.endTime.slice(0, 5),
      };
    }
    if (
      input.teacherId &&
      !(
        await client.query(
          "SELECT 1 FROM teachers WHERE tenant_id=$1 AND id=$2",
          [tenantId, input.teacherId],
        )
      ).rows[0]
    )
      throw new NotFoundException("Teacher not found");
    if (!input.startTime || !input.endTime || input.startTime >= input.endTime)
      throw new BadRequestException(
        "Valid start and end times are required without a schedule.",
      );
    await this.assertNoSessionConflict(client, tenantId, input.classId, input.teacherId ?? null, null, input.sessionDate, input.startTime, input.endTime);
    return {
      teacherId: input.teacherId ?? null,
      roomId: null,
      branchId: classRecord.branchId,
      startTime: input.startTime,
      endTime: input.endTime,
    };
  }
}
