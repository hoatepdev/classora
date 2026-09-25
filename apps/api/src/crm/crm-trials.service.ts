import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import { AuditService } from '../audit/audit.service.js';
import { EnrollmentInitialStatus } from '../enrollments/dto/create-enrollment.dto.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { BookTrialDto, CancelTrialBookingDto, TrialOutcomeDto } from './dto/trial.dto.js';
import { CrmService } from './crm.service.js';
import {
  type TrialBookingRow,
  actor,
  bookingColumns,
  recordLeadEvent,
  transitionAllowed,
} from './crm-shared.js';

type SessionCandidateRow = QueryResultRow & { id: string; classId: string; status: string; sessionDate: string; classStatus: string };

const ATTENDED_STATUSES = ['PRESENT', 'LATE', 'ONLINE'];

@Injectable()
export class CrmTrialsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async book(leadId: string, input: BookTrialDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    const bookingId = ulid();
    try {
      await client.query('BEGIN');
      const lead = await this.crm.lockedLead(client, context.tenant.tenantId, leadId);
      if (lead.status !== 'QUALIFIED') throw new ConflictException(`Cannot book a trial from lead status ${lead.status}`);
      const active = await client.query(`SELECT 1 FROM trial_bookings WHERE tenant_id=$1 AND lead_id=$2 AND status='BOOKED'`, [context.tenant.tenantId, leadId]);
      if (active.rows[0]) throw new ConflictException('Lead already has an active trial booking');

      const sessionResult = await client.query<SessionCandidateRow>(
        `SELECT a.id, a.class_id AS "classId", a.status, a.session_date::text AS "sessionDate", c.status AS "classStatus"
         FROM attendance_sessions a JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id
         WHERE a.tenant_id=$1 AND a.id=$2 FOR SHARE OF a, c`,
        [context.tenant.tenantId, input.sessionId],
      );
      const session = sessionResult.rows[0];
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== 'SCHEDULED') throw new ConflictException('Session is not open for booking');
      if (session.sessionDate < new Date().toISOString().slice(0, 10)) throw new ConflictException('Session is in the past');
      if (session.classStatus !== 'ACTIVE') throw new ConflictException('Class is disabled');

      const defaults = await this.crm.trialDefaults(client, context.tenant.tenantId, leadId);
      const { studentId, guardianId } = await this.crm.ensureStudentAndGuardian(client, lead, input, defaults);
      const enrollment = await this.enrollments.createInTransaction(client, { studentId, classId: session.classId, status: EnrollmentInitialStatus.TRIAL, notes: `Trial booking for lead ${leadId}` });

      await client.query(
        `INSERT INTO trial_bookings (id, tenant_id, lead_id, session_id, student_id, guardian_id, trial_enrollment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [bookingId, context.tenant.tenantId, leadId, input.sessionId, studentId, guardianId, enrollment.id],
      );
      await client.query(`UPDATE leads SET status='TRIAL_BOOKED', updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`, [context.tenant.tenantId, leadId]);
      await recordLeadEvent(client, context.tenant.tenantId, leadId, 'TRIAL_BOOKED', 'QUALIFIED', 'TRIAL_BOOKED', null, { bookingId, sessionId: input.sessionId, enrollmentId: enrollment.id }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await this.audit.recordTenant(client, { ...actor(context), action: 'trial_booking.created', entityType: 'TRIAL_BOOKING', entityId: bookingId, after: { leadId, sessionId: input.sessionId, studentId, guardianId, trialEnrollmentId: enrollment.id } });
      await client.query('COMMIT');
      return this.crm.get(leadId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async cancel(bookingId: string, input: CancelTrialBookingDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const booking = await this.lockedBooking(client, context.tenant.tenantId, bookingId);
      if (booking.status !== 'BOOKED') throw new ConflictException('Only a booked trial can be cancelled');
      const lead = await this.crm.lockedLead(client, context.tenant.tenantId, booking.leadId);

      await client.query(
        `UPDATE trial_bookings SET status='CANCELLED', cancel_reason=$3, cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [context.tenant.tenantId, bookingId, input.reason ?? 'Cancelled'],
      );
      const enrollment = await client.query<{ status: string }>(`SELECT status FROM enrollments WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [context.tenant.tenantId, booking.trialEnrollmentId]);
      if (enrollment.rows[0]?.status === 'TRIAL') await this.enrollments.transitionInTransaction(client, booking.trialEnrollmentId, 'withdraw', { reason: `Trial cancelled: ${input.reason ?? 'no reason given'}` });
      if (lead.status === 'TRIAL_BOOKED') {
        await client.query(`UPDATE leads SET status='QUALIFIED', updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`, [context.tenant.tenantId, booking.leadId]);
      }
      await recordLeadEvent(client, context.tenant.tenantId, booking.leadId, 'TRIAL_CANCELLED', lead.status, lead.status === 'TRIAL_BOOKED' ? 'QUALIFIED' : lead.status, input.reason ?? null, { bookingId }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await this.audit.recordTenant(client, { ...actor(context), action: 'trial_booking.cancelled', entityType: 'TRIAL_BOOKING', entityId: bookingId, before: { status: 'BOOKED' }, after: { status: 'CANCELLED' }, reason: input.reason ?? undefined });
      await client.query('COMMIT');
      return this.crm.get(booking.leadId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async outcome(bookingId: string, input: TrialOutcomeDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const booking = await this.lockedBooking(client, context.tenant.tenantId, bookingId);
      if (booking.status !== 'BOOKED') throw new ConflictException('Trial outcome requires a booked trial');
      const lead = await this.crm.lockedLead(client, context.tenant.tenantId, booking.leadId);

      const sheet = await client.query<{ status: string }>(`SELECT status FROM attendance_sheets WHERE tenant_id=$1 AND session_id=$2 FOR SHARE`, [context.tenant.tenantId, booking.sessionId]);
      if (sheet.rows[0]?.status !== 'LOCKED') throw new ConflictException('Trial attendance must be finalized before recording the outcome');
      const record = await client.query<{ status: string }>(
        `SELECT status FROM attendance_records WHERE tenant_id=$1 AND session_id=$2 AND student_id=$3`,
        [context.tenant.tenantId, booking.sessionId, booking.studentId],
      );
      if (!record.rows[0]) throw new ConflictException('No attendance record exists for the trial student');
      if (record.rows[0].status === 'UNMARKED') throw new ConflictException('Trial attendance is not finalized for the trial student');
      const attended = ATTENDED_STATUSES.includes(record.rows[0].status);
      const bookingStatus = attended ? 'COMPLETED' : 'NO_SHOW';

      let toStatus: 'TRIAL_COMPLETED' | 'QUALIFIED' | 'LOST' = 'TRIAL_COMPLETED';
      if (input.outcome === 'FOLLOW_UP') toStatus = 'QUALIFIED';
      if (input.outcome === 'LOST') {
        toStatus = 'LOST';
        if (!input.lostReason) throw new BadRequestException('A lost reason is required when the outcome is LOST');
      }
      if (toStatus === 'TRIAL_COMPLETED' && !transitionAllowed(lead.status, 'TRIAL_COMPLETED')) throw new ConflictException(`Cannot record this outcome from lead status ${lead.status}`);
      if (toStatus === 'QUALIFIED' && !transitionAllowed(lead.status, 'QUALIFIED')) throw new ConflictException(`Cannot record this outcome from lead status ${lead.status}`);
      if (toStatus === 'LOST' && !transitionAllowed(lead.status, 'LOST')) throw new ConflictException(`Cannot record this outcome from lead status ${lead.status}`);

      await client.query(
        `UPDATE trial_bookings SET status=$3, outcome=$4, outcome_notes=$5, completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [context.tenant.tenantId, bookingId, bookingStatus, input.outcome, input.notes ?? null],
      );
      if (toStatus === 'LOST') {
        await client.query(
          `UPDATE leads SET status='LOST', lost_reason=$3, lost_reason_detail=$4, lost_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
          [context.tenant.tenantId, booking.leadId, input.lostReason, input.lostDetail ?? null],
        );
      } else {
        await client.query(`UPDATE leads SET status=$3, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`, [context.tenant.tenantId, booking.leadId, toStatus]);
      }
      await recordLeadEvent(client, context.tenant.tenantId, booking.leadId, 'TRIAL_COMPLETED', lead.status, toStatus, null, { bookingId, attendanceStatus: record.rows[0].status, bookingStatus }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await recordLeadEvent(client, context.tenant.tenantId, booking.leadId, 'TRIAL_OUTCOME', toStatus, toStatus, input.lostReason ?? null, { bookingId, outcome: input.outcome, attended }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await this.audit.recordTenant(client, { ...actor(context), action: 'trial_booking.completed', entityType: 'TRIAL_BOOKING', entityId: bookingId, before: { status: 'BOOKED' }, after: { status: bookingStatus, outcome: input.outcome } });
      await this.audit.recordTenant(client, { ...actor(context), action: 'trial_booking.outcome_recorded', entityType: 'TRIAL_BOOKING', entityId: bookingId, after: { outcome: input.outcome, attended, attendanceStatus: record.rows[0].status }, reason: input.notes ?? undefined });
      if (toStatus === 'LOST') await this.audit.recordTenant(client, { ...actor(context), action: 'lead.lost', entityType: 'LEAD', entityId: booking.leadId, before: { status: lead.status }, after: { status: 'LOST', reason: input.lostReason } });
      await client.query('COMMIT');
      return this.crm.get(booking.leadId);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async lockedBooking(client: PoolClient, tenantId: string, id: string): Promise<TrialBookingRow> {
    const result = await client.query<TrialBookingRow>(`SELECT ${bookingColumns.replace(/\bt\./g, '')} FROM trial_bookings WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, id]);
    if (!result.rows[0]) throw new NotFoundException('Trial booking not found');
    return result.rows[0];
  }
}
