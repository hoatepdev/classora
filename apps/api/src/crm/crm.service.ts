import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { StudentRelationshipsService } from '../students/relationships.service.js';
import { StudentsService } from '../students/students.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import { StudentStatus } from '../students/dto/create-student.dto.js';
import type { CreateLeadDto, CreateLeadNoteDto, LeadQueryDto, LostLeadDto, UpdateLeadDto } from './dto/lead.dto.js';
import {
  type LeadRow,
  type LeadStatus,
  actor,
  leadColumns,
  lockTenantCrmMaterialization,
  recordLeadEvent,
  serializeLead,
  transitionAllowed,
} from './crm-shared.js';

type LeadListRow = LeadRow & { interestedCourseName: string | null; interestedCourseLevelName: string | null; preferredBranchName: string | null };
type EventRow = QueryResultRow & { id: string; type: string; fromStatus: LeadStatus | null; toStatus: LeadStatus | null; reason: string | null; metadata: Record<string, unknown> | null; actorName: string | null; occurredAt: Date };
type NoteRow = QueryResultRow & { id: string; content: string; authorName: string | null; createdAt: Date };
type BookingListRow = QueryResultRow & {
  id: string; leadId: string; sessionId: string; studentId: string; guardianId: string | null; trialEnrollmentId: string;
  status: 'BOOKED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED'; outcome: 'ENROLL' | 'FOLLOW_UP' | 'LOST' | null;
  outcomeNotes: string | null; cancelReason: string | null; bookedAt: Date; cancelledAt: Date | null; completedAt: Date | null;
  sessionDate: string; startTime: string; endTime: string; sessionStatus: string; classCode: string; className: string;
};

const leadSelect = `SELECT ${leadColumns}, c.name AS "interestedCourseName", cl.name AS "interestedCourseLevelName", b.name AS "preferredBranchName"
  FROM leads l
  LEFT JOIN courses c ON c.tenant_id = l.tenant_id AND c.id = l.interested_course_id
  LEFT JOIN course_levels cl ON cl.tenant_id = l.tenant_id AND cl.id = l.interested_course_level_id
  LEFT JOIN branches b ON b.tenant_id = l.tenant_id AND b.id = l.preferred_branch_id`;

const CONTACT_COLUMNS: Array<[keyof UpdateLeadDto & keyof CreateLeadDto, string]> = [
  ['studentName', 'student_name'],
  ['studentPhone', 'student_phone'],
  ['studentEmail', 'student_email'],
  ['guardianName', 'guardian_name'],
  ['guardianPhone', 'guardian_phone'],
  ['guardianEmail', 'guardian_email'],
  ['campaign', 'campaign'],
];

type LeadCursor = { createdAt: string; id: string };

function decodeCursor(value: string | undefined): LeadCursor | undefined {
  if (!value) return undefined;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as LeadCursor;
    if (!cursor || typeof cursor.createdAt !== 'string' || typeof cursor.id !== 'string') throw new Error();
    return cursor;
  } catch {
    throw new BadRequestException('Invalid lead cursor');
  }
}

function encodeCursor(cursor: LeadCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function pgConstraint(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : undefined;
}

@Injectable()
export class CrmService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly database: ControlDatabaseService,
    private readonly students: StudentsService,
    private readonly relationships: StudentRelationshipsService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async list(query: LeadQueryDto) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const conditions = ['l.tenant_id = $1'];
    if (query.status) { values.push(query.status); conditions.push(`l.status = $${values.length}`); }
    if (query.assignedMembershipId) { values.push(query.assignedMembershipId); conditions.push(`l.assigned_membership_id = $${values.length}`); }
    if (query.courseId) { values.push(query.courseId); conditions.push(`l.interested_course_id = $${values.length}`); }
    if (query.branchId) { values.push(query.branchId); conditions.push(`l.preferred_branch_id = $${values.length}`); }
    if (query.source) { values.push(query.source); conditions.push(`l.source = $${values.length}`); }
    if (query.followUp) {
      if (query.followUp === 'NONE') conditions.push('l.next_follow_up_at IS NULL');
      else if (query.followUp === 'OVERDUE') conditions.push(`l.next_follow_up_at < date_trunc('day', CURRENT_TIMESTAMP)`);
      else if (query.followUp === 'TODAY') conditions.push(`l.next_follow_up_at >= date_trunc('day', CURRENT_TIMESTAMP) AND l.next_follow_up_at < date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'`);
      else conditions.push(`l.next_follow_up_at >= date_trunc('day', CURRENT_TIMESTAMP) + interval '1 day'`);
    }
    if (query.search?.trim()) {
      values.push(`%${query.search.trim()}%`);
      const term = `$${values.length}`;
      conditions.push(`(l.student_name ILIKE ${term} OR l.student_phone ILIKE ${term} OR l.student_email ILIKE ${term} OR l.guardian_name ILIKE ${term} OR l.guardian_phone ILIKE ${term} OR l.guardian_email ILIKE ${term})`);
    }
    const cursor = decodeCursor(query.cursor);
    if (cursor) { values.push(cursor.createdAt, cursor.id); conditions.push(`(l.created_at, l.id) < ($${values.length - 1}::timestamptz, $${values.length})`); }
    const limit = query.limit ?? 50;
    const result = await pool.query<LeadListRow>(
      `${leadSelect} WHERE ${conditions.join(' AND ')} ORDER BY l.created_at DESC, l.id DESC LIMIT ${limit + 1}`,
      values,
    );
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1);
    return {
      data: rows.map(serializeLead),
      nextCursor: result.rows.length > limit && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  async get(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const leadResult = await pool.query<LeadListRow>(`${leadSelect} WHERE l.tenant_id = $1 AND l.id = $2`, [tenant.tenantId, id]);
    const lead = leadResult.rows[0];
    if (!lead) throw new NotFoundException('Lead not found');
    const [notes, events, bookings] = await Promise.all([
      pool.query<NoteRow>(`SELECT id, content, author_name AS "authorName", created_at AS "createdAt" FROM lead_notes WHERE tenant_id=$1 AND lead_id=$2 ORDER BY created_at DESC, id DESC LIMIT 100`, [tenant.tenantId, id]),
      pool.query<EventRow>(`SELECT id, type, from_status AS "fromStatus", to_status AS "toStatus", reason, metadata, actor_membership_id AS "actorMembershipId", occurred_at AS "occurredAt" FROM lead_events WHERE tenant_id=$1 AND lead_id=$2 ORDER BY occurred_at DESC, id DESC LIMIT 200`, [tenant.tenantId, id]),
      pool.query<BookingListRow>(`SELECT t.id, t.lead_id AS "leadId", t.session_id AS "sessionId", t.student_id AS "studentId", t.guardian_id AS "guardianId",
        t.trial_enrollment_id AS "trialEnrollmentId", t.status, t.outcome, t.outcome_notes AS "outcomeNotes", t.cancel_reason AS "cancelReason",
        t.booked_at AS "bookedAt", t.cancelled_at AS "cancelledAt", t.completed_at AS "completedAt",
        a.session_date::text AS "sessionDate", a.start_time::text AS "startTime", a.end_time::text AS "endTime", a.status AS "sessionStatus",
        c.code AS "classCode", c.name AS "className"
        FROM trial_bookings t
        JOIN attendance_sessions a ON a.tenant_id = t.tenant_id AND a.id = t.session_id
        JOIN classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
        WHERE t.tenant_id=$1 AND t.lead_id=$2 ORDER BY t.booked_at DESC, t.id DESC`, [tenant.tenantId, id]),
    ]);
    return {
      ...serializeLead(lead),
      notes: notes.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      events: events.rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
      trialBookings: bookings.rows.map((row) => ({
        ...row,
        startTime: row.startTime.slice(0, 5),
        endTime: row.endTime.slice(0, 5),
        bookedAt: row.bookedAt.toISOString(),
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
        completedAt: row.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async create(input: CreateLeadDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    const id = ulid();
    try {
      await client.query('BEGIN');
      await this.validateInterest(client, context.tenant.tenantId, input.interestedCourseId ?? null, input.interestedCourseLevelId ?? null, input.preferredBranchId ?? null);
      if (input.assignedMembershipId) await this.validateMembership(input.assignedMembershipId, context.tenant.tenantId);
      await client.query(
        `INSERT INTO leads (id, tenant_id, status, student_name, student_phone, student_email, guardian_name, guardian_phone, guardian_email,
          source, campaign, interested_course_id, interested_course_level_id, preferred_branch_id, assigned_membership_id, next_follow_up_at)
         VALUES ($1,$2,'NEW',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::timestamptz)`,
        [id, context.tenant.tenantId, input.studentName, input.studentPhone ?? null, input.studentEmail ?? null, input.guardianName ?? null, input.guardianPhone ?? null,
          input.guardianEmail ?? null, input.source ?? null, input.campaign ?? null, input.interestedCourseId ?? null, input.interestedCourseLevelId ?? null,
          input.preferredBranchId ?? null, input.assignedMembershipId ?? null, input.nextFollowUpAt ?? null],
      );
      await recordLeadEvent(client, context.tenant.tenantId, id, 'CREATED', null, 'NEW', null, null, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await this.audit.recordTenant(client, { ...actor(context), action: 'lead.created', entityType: 'LEAD', entityId: id, after: { studentName: input.studentName, source: input.source ?? null, assignedMembershipId: input.assignedMembershipId ?? null } });
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (pgConstraint(error)?.startsWith('leads_')) throw new BadRequestException('Lead references an invalid record');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(id: string, input: UpdateLeadDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.lockedLead(client, context.tenant.tenantId, id);
      if (['WON', 'LOST'].includes(current.status)) throw new ConflictException('Terminal leads cannot be edited');

      const effectiveCourse = input.interestedCourseId !== undefined ? input.interestedCourseId : current.interestedCourseId;
      const effectiveLevel = input.interestedCourseLevelId !== undefined ? input.interestedCourseLevelId : current.interestedCourseLevelId;
      const effectiveBranch = input.preferredBranchId !== undefined ? input.preferredBranchId : current.preferredBranchId;
      await this.validateInterest(client, context.tenant.tenantId, effectiveCourse, effectiveLevel, effectiveBranch);
      if (input.assignedMembershipId !== undefined && input.assignedMembershipId !== null) await this.validateMembership(input.assignedMembershipId, context.tenant.tenantId);

      const assignments: Array<[string, unknown]> = [];
      for (const [property, column] of CONTACT_COLUMNS) {
        if (!Object.hasOwn(input, property) || input[property] === undefined) continue;
        assignments.push([column, input[property] ?? null]);
      }
      if (input.source !== undefined) assignments.push(['source', input.source ?? null]);
      if (input.interestedCourseId !== undefined) assignments.push(['interested_course_id', input.interestedCourseId ?? null]);
      if (input.interestedCourseLevelId !== undefined) assignments.push(['interested_course_level_id', input.interestedCourseLevelId ?? null]);
      if (input.preferredBranchId !== undefined) assignments.push(['preferred_branch_id', input.preferredBranchId ?? null]);
      if (input.assignedMembershipId !== undefined) assignments.push(['assigned_membership_id', input.assignedMembershipId ?? null]);
      if (input.nextFollowUpAt !== undefined) assignments.push(['next_follow_up_at', input.nextFollowUpAt ?? null]);
      if (!assignments.length) throw new BadRequestException('At least one field is required');

      const values: unknown[] = [context.tenant.tenantId, id];
      const sets = assignments.map(([column, value]) => {
        values.push(value);
        return `${column} = $${values.length}${column === 'next_follow_up_at' ? '::timestamptz' : ''}`;
      });
      await client.query(`UPDATE leads SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND id = $2`, values);

      const changed = Object.fromEntries(assignments.filter(([column]) => column !== 'campaign').map(([column]) => [column, (current as unknown as Record<string, unknown>)[column] ?? null]));
      await recordLeadEvent(client, context.tenant.tenantId, id, 'UPDATED', current.status, current.status, null, Object.keys(changed).length ? { changed } : null, context.actorUserId ?? null, context.actorMembershipId ?? null);
      if (input.assignedMembershipId !== undefined) {
        await recordLeadEvent(client, context.tenant.tenantId, id, 'ASSIGNED', current.status, current.status, null, { assignedMembershipId: input.assignedMembershipId ?? null }, context.actorUserId ?? null, context.actorMembershipId ?? null);
        await this.audit.recordTenant(client, { ...actor(context), action: 'lead.assigned', entityType: 'LEAD', entityId: id, before: { assignedMembershipId: current.assignedMembershipId }, after: { assignedMembershipId: input.assignedMembershipId ?? null } });
      }
      if (input.nextFollowUpAt !== undefined) {
        await recordLeadEvent(client, context.tenant.tenantId, id, 'FOLLOW_UP_CHANGED', current.status, current.status, null, { nextFollowUpAt: input.nextFollowUpAt ?? null }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      }
      await this.audit.recordTenant(client, { ...actor(context), action: 'lead.updated', entityType: 'LEAD', entityId: id, before: changed, after: Object.fromEntries(assignments) });
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async contact(id: string) { return this.simpleTransition(id, 'CONTACTED'); }
  async qualify(id: string) { return this.simpleTransition(id, 'QUALIFIED'); }

  async lost(id: string, input: LostLeadDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const lead = await this.lockedLead(client, context.tenant.tenantId, id);
      if (!transitionAllowed(lead.status, 'LOST')) throw new ConflictException(`Cannot transition lead from ${lead.status} to LOST`);
      await client.query(
        `UPDATE leads SET status='LOST', lost_reason=$3, lost_reason_detail=$4, lost_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [context.tenant.tenantId, id, input.reason, input.detail ?? null],
      );
      const active = await client.query<{ bookingId: string; enrollmentId: string; enrollmentStatus: string }>(
        `SELECT t.id AS "bookingId", t.trial_enrollment_id AS "enrollmentId", e.status AS "enrollmentStatus"
         FROM trial_bookings t JOIN enrollments e ON e.tenant_id = t.tenant_id AND e.id = t.trial_enrollment_id
         WHERE t.tenant_id=$1 AND t.lead_id=$2 AND t.status='BOOKED' ORDER BY t.booked_at DESC`,
        [context.tenant.tenantId, id],
      );
      for (const row of active.rows) {
        await client.query(`UPDATE trial_bookings SET status='CANCELLED', cancel_reason=$3, cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`, [context.tenant.tenantId, row.bookingId, 'Lead lost']);
        if (row.enrollmentStatus === 'TRIAL') await this.enrollments.transitionInTransaction(client, row.enrollmentId, 'withdraw', { reason: 'Lead lost' });
      }
      await recordLeadEvent(client, context.tenant.tenantId, id, 'LOST', lead.status, 'LOST', input.reason, { detail: input.detail ?? null, cancelledBookings: active.rows.length }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await this.audit.recordTenant(client, { ...actor(context), action: 'lead.lost', entityType: 'LEAD', entityId: id, before: { status: lead.status }, after: { status: 'LOST', reason: input.reason }, reason: input.detail ?? undefined });
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async addNote(id: string, input: CreateLeadNoteDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    const noteId = ulid();
    try {
      await client.query('BEGIN');
      const lead = await this.lockedLead(client, context.tenant.tenantId, id);
      await client.query(
        `INSERT INTO lead_notes (id, tenant_id, lead_id, content, author_user_id, author_membership_id, author_name) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [noteId, context.tenant.tenantId, id, input.content, context.actorUserId ?? null, context.actorMembershipId ?? null, context.actorName ?? null],
      );
      await recordLeadEvent(client, context.tenant.tenantId, id, 'NOTE_ADDED', lead.status, lead.status, null, { noteId }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await client.query('COMMIT');
      return { id: noteId, leadId: id, content: input.content, authorName: context.actorName ?? null };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async duplicates(id: string) {
    const { tenant, pool } = this.tenantContext.get();
    const leadResult = await pool.query<LeadRow>(`SELECT ${leadColumns} FROM leads l WHERE l.tenant_id = $1 AND l.id = $2`, [tenant.tenantId, id]);
    const lead = leadResult.rows[0];
    if (!lead) throw new NotFoundException('Lead not found');
    const phones = [lead.studentPhone, lead.guardianPhone].filter((value): value is string => Boolean(value));
    const emails = [lead.studentEmail, lead.guardianEmail].filter((value): value is string => Boolean(value));
    if (!phones.length && !emails.length) return [];

    const values: unknown[] = [tenant.tenantId, id];
    let phoneRef = '';
    let emailRef = '';
    if (phones.length) { values.push(phones); phoneRef = `$${values.length}`; }
    if (emails.length) { values.push(emails); emailRef = `$${values.length}`; }
    const contact = [
      phoneRef && `phone = ANY(${phoneRef})`,
      emailRef && `email = ANY(${emailRef})`,
    ].filter(Boolean).join(' OR ');
    const leadContact = [
      phoneRef && `(l.student_phone = ANY(${phoneRef}) OR l.guardian_phone = ANY(${phoneRef}))`,
      emailRef && `(l.student_email = ANY(${emailRef}) OR l.guardian_email = ANY(${emailRef}))`,
    ].filter(Boolean).join(' OR ');

    const result = await pool.query(
      `SELECT kind, id, name, phone, email FROM (
        SELECT 'STUDENT' AS kind, s.id, s.full_name AS name, s.phone, s.email FROM students s WHERE s.tenant_id=$1 AND (${contact})
        UNION ALL
        SELECT 'GUARDIAN' AS kind, g.id, g.full_name AS name, g.phone, g.email FROM guardians g WHERE g.tenant_id=$1 AND (${contact})
        UNION ALL
        SELECT 'LEAD' AS kind, l.id, l.student_name AS name, COALESCE(l.student_phone, l.guardian_phone) AS phone, COALESCE(l.student_email, l.guardian_email) AS email
        FROM leads l WHERE l.tenant_id=$1 AND l.id <> $2 AND l.status NOT IN ('WON','LOST') AND (${leadContact})
      ) candidates ORDER BY kind, name LIMIT 20`,
      values,
    );
    return result.rows.map((row) => ({ ...row, possibleDuplicate: true }));
  }

  async lookupCourses() {
    const { tenant, pool } = this.tenantContext.get();
    const courses = await pool.query<{ id: string; code: string; name: string }>(`SELECT id, code, name FROM courses WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY name, id`, [tenant.tenantId]);
    if (!courses.rows.length) return [];
    const levels = await pool.query<{ id: string; courseId: string; code: string; name: string }>(
      `SELECT id, course_id AS "courseId", code, name FROM course_levels WHERE tenant_id=$1 AND status='ACTIVE' AND course_id = ANY($2) ORDER BY display_order, name, id`,
      [tenant.tenantId, courses.rows.map((course) => course.id)],
    );
    return courses.rows.map((course) => ({ ...course, levels: levels.rows.filter((level) => level.courseId === course.id) }));
  }

  async lookupBranches() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<{ id: string; code: string; name: string }>(`SELECT id, code, name FROM branches WHERE tenant_id=$1 AND status='ACTIVE' ORDER BY name, id`, [tenant.tenantId]);
    return result.rows;
  }

  async lookupClasses() {
    const { tenant, pool } = this.tenantContext.get();
    const result = await pool.query<{ id: string; code: string; name: string; courseName: string | null }>(
      `SELECT c.id, c.code, c.name, co.name AS "courseName" FROM classes c
       LEFT JOIN courses co ON co.tenant_id=c.tenant_id AND co.id=c.course_id
       WHERE c.tenant_id=$1 AND c.status='ACTIVE' ORDER BY c.name, c.id`,
      [tenant.tenantId],
    );
    return result.rows;
  }

  async lookupAssignees() {
    const { tenant } = this.tenantContext.get();
    const memberships = await this.database.tenantMembership.findMany({
      where: { tenantId: tenant.tenantId, status: 'ACTIVE' },
      select: { id: true, role: true, user: { select: { name: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    return memberships.map((membership) => ({ membershipId: membership.id, name: membership.user?.name ?? membership.id, role: membership.role }));
  }

  async lookupTrialSessions(input: { from?: string; to?: string; courseId?: string; courseLevelId?: string; branchId?: string }) {
    const { tenant, pool } = this.tenantContext.get();
    const today = new Date().toISOString().slice(0, 10);
    const from = input.from ?? today;
    const to = input.to ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    if (from < today) throw new BadRequestException('Trial session search cannot start in the past');
    if ((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 > 60) throw new BadRequestException('Trial session range cannot exceed 60 days');
    const values: unknown[] = [tenant.tenantId, from, to];
    const conditions = [`a.tenant_id = $1`, `a.status = 'SCHEDULED'`, `a.session_date >= $2::date`, `a.session_date <= $3::date`, `c.status = 'ACTIVE'`];
    if (input.courseId) { values.push(input.courseId); conditions.push(`c.course_id = $${values.length}`); }
    if (input.courseLevelId) { values.push(input.courseLevelId); conditions.push(`c.course_level_id = $${values.length}`); }
    values.push(input.branchId ?? null);
    const branchRank = `$${values.length}::char(26) IS NULL OR a.branch_id = $${values.length}::char(26)`;
    const result = await pool.query(
      `SELECT a.id, a.class_id AS "classId", c.code AS "classCode", c.name AS "className", c.course_id AS "courseId", co.name AS "courseName",
        c.course_level_id AS "courseLevelId", a.branch_id AS "branchId", b.name AS "branchName",
        a.session_date::text AS "sessionDate", a.start_time::text AS "startTime", a.end_time::text AS "endTime"
       FROM attendance_sessions a
       JOIN classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
       LEFT JOIN courses co ON co.tenant_id = c.tenant_id AND co.id = c.course_id
       LEFT JOIN branches b ON b.tenant_id = a.tenant_id AND b.id = a.branch_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY (CASE WHEN ${branchRank} THEN 0 ELSE 1 END), a.session_date, a.start_time, a.id
       LIMIT 200`,
      values,
    );
    return result.rows.map((row) => ({ ...row, startTime: row.startTime.slice(0, 5), endTime: row.endTime.slice(0, 5) }));
  }

  async validateInterest(client: PoolClient, tenantId: string, courseId: string | null, courseLevelId: string | null, branchId: string | null) {
    if (courseLevelId && !courseId) throw new BadRequestException('Course level requires a course');
    if (courseId) {
      const course = await client.query(`SELECT 1 FROM courses WHERE tenant_id=$1 AND id=$2`, [tenantId, courseId]);
      if (!course.rows[0]) throw new NotFoundException('Course not found');
    }
    if (courseLevelId) {
      const level = await client.query<{ courseId: string }>(`SELECT course_id AS "courseId" FROM course_levels WHERE tenant_id=$1 AND id=$2`, [tenantId, courseLevelId]);
      if (!level.rows[0]) throw new NotFoundException('Course level not found');
      if (level.rows[0].courseId !== courseId) throw new BadRequestException('Course level does not belong to the selected course');
    }
    if (branchId) {
      const branch = await client.query(`SELECT 1 FROM branches WHERE tenant_id=$1 AND id=$2`, [tenantId, branchId]);
      if (!branch.rows[0]) throw new NotFoundException('Branch not found');
    }
  }

  async validateMembership(membershipId: string, tenantId: string) {
    const membership = await this.database.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: { status: true },
    });
    if (!membership || membership.status !== 'ACTIVE') throw new BadRequestException('Assigned member is not an active member of this tenant');
  }

  // Shared by trial booking and conversion: reuse or materialize Student (+ Guardian link) from Lead data.
  // defaultStudentId/defaultGuardianId come from the lead's existing trial bookings so conversion never re-asks.
  async ensureStudentAndGuardian(
    client: PoolClient,
    lead: LeadRow,
    input: { studentId?: string; createStudent?: boolean; guardianId?: string; createGuardian?: boolean; guardianRelationship?: string },
    defaults: { studentId?: string; guardianId?: string | null } = {},
  ) {
    const context = this.tenantContext.get();
    let studentId: string;
    if (input.studentId !== undefined && input.createStudent) throw new BadRequestException('Choose either an existing Student or creating one, not both');
    if (input.studentId !== undefined) {
      const student = await client.query(`SELECT id FROM students WHERE tenant_id=$1 AND id=$2`, [context.tenant.tenantId, input.studentId]);
      if (!student.rows[0]) throw new NotFoundException('Student not found');
      studentId = input.studentId;
    } else if (input.createStudent) {
      studentId = await this.materializeStudent(client, lead);
    } else if (defaults.studentId) {
      studentId = defaults.studentId;
    } else {
      throw new BadRequestException('Choose an existing Student or confirm creating one');
    }

    let guardianId: string | null = null;
    const wantsGuardian = input.guardianId !== undefined || input.createGuardian === true;
    if (wantsGuardian && !lead.guardianName && input.guardianId === undefined) throw new BadRequestException('Lead has no guardian data to create a Guardian from');
    if (input.guardianId !== undefined) {
      const guardian = await client.query(`SELECT id FROM guardians WHERE tenant_id=$1 AND id=$2`, [context.tenant.tenantId, input.guardianId]);
      if (!guardian.rows[0]) throw new NotFoundException('Guardian not found');
      guardianId = input.guardianId;
    } else if (input.createGuardian === true) {
      guardianId = await this.relationships.createGuardianInTransaction(client, { fullName: lead.guardianName!, phone: lead.guardianPhone, email: lead.guardianEmail, notes: `Created from lead ${lead.id}` });
    } else if (defaults.guardianId !== undefined) {
      guardianId = defaults.guardianId;
    }
    if (guardianId) await this.relationships.linkGuardianInTransaction(client, studentId, guardianId, input.guardianRelationship ?? 'OTHER');
    return { studentId, guardianId };
  }

  async trialDefaults(client: PoolClient, tenantId: string, leadId: string) {
    const result = await client.query<{ studentId: string; guardianId: string | null }>(
      `SELECT student_id AS "studentId", guardian_id AS "guardianId" FROM trial_bookings
       WHERE tenant_id=$1 AND lead_id=$2 ORDER BY booked_at DESC, id DESC LIMIT 1`,
      [tenantId, leadId],
    );
    return result.rows[0] ?? {};
  }

  private async materializeStudent(client: PoolClient, lead: LeadRow) {
    const context = this.tenantContext.get();
    await lockTenantCrmMaterialization(client, context.tenant.tenantId);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const student = await this.students.createInTransaction(client, {
          code: `STU${ulid().slice(-6)}`,
          fullName: lead.studentName,
          phone: lead.studentPhone,
          email: lead.studentEmail,
          status: StudentStatus.ACTIVE,
          source: lead.source ?? undefined,
        });
        return student.id;
      } catch (error) {
        if (pgConstraint(error) === 'students_tenant_id_code_key' && attempt === 0) continue;
        throw error;
      }
    }
    throw new ConflictException('Student could not be created');
  }

  private async simpleTransition(id: string, to: LeadStatus) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const lead = await this.lockedLead(client, context.tenant.tenantId, id);
      if (!transitionAllowed(lead.status, to)) throw new ConflictException(`Cannot transition lead from ${lead.status} to ${to}`);
      await client.query(`UPDATE leads SET status=$3, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`, [context.tenant.tenantId, id, to]);
      await recordLeadEvent(client, context.tenant.tenantId, id, to === 'CONTACTED' ? 'CONTACTED' : 'QUALIFIED', lead.status, to, null, null, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await this.audit.recordTenant(client, { ...actor(context), action: 'lead.status_changed', entityType: 'LEAD', entityId: id, before: { status: lead.status }, after: { status: to } });
      await client.query('COMMIT');
      return this.get(id);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async lockedLead(client: PoolClient, tenantId: string, id: string): Promise<LeadRow> {
    const result = await client.query<LeadRow>(`SELECT ${leadColumns} FROM leads l WHERE l.tenant_id=$1 AND l.id=$2 FOR UPDATE`, [tenantId, id]);
    if (!result.rows[0]) throw new NotFoundException('Lead not found');
    return result.rows[0];
  }
}
