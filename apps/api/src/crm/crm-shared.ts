import type { PoolClient, QueryResultRow } from 'pg';
import { ulid } from 'ulid';
import type { TenantContextService } from '../tenant/tenant-context.service.js';

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'TRIAL_BOOKED' | 'TRIAL_COMPLETED' | 'WON' | 'LOST';

export type LeadRow = QueryResultRow & {
  id: string;
  tenantId: string;
  status: LeadStatus;
  studentName: string;
  studentPhone: string | null;
  studentEmail: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  guardianEmail: string | null;
  source: string | null;
  campaign: string | null;
  interestedCourseId: string | null;
  interestedCourseLevelId: string | null;
  preferredBranchId: string | null;
  assignedMembershipId: string | null;
  nextFollowUpAt: Date | null;
  convertedStudentId: string | null;
  convertedGuardianId: string | null;
  convertedEnrollmentId: string | null;
  lostReason: string | null;
  lostReasonDetail: string | null;
  wonAt: Date | null;
  lostAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LeadEventRow = QueryResultRow & {
  id: string;
  type: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  actorUserId: string | null;
  actorMembershipId: string | null;
  occurredAt: Date;
};

export type TrialBookingRow = QueryResultRow & {
  id: string;
  tenantId: string;
  leadId: string;
  sessionId: string;
  studentId: string;
  guardianId: string | null;
  trialEnrollmentId: string;
  status: 'BOOKED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  outcome: 'ENROLL' | 'FOLLOW_UP' | 'LOST' | null;
  outcomeNotes: string | null;
  cancelReason: string | null;
  bookedAt: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const leadColumns = `l.id, l.tenant_id AS "tenantId", l.status, l.student_name AS "studentName", l.student_phone AS "studentPhone",
  l.student_email AS "studentEmail", l.guardian_name AS "guardianName", l.guardian_phone AS "guardianPhone", l.guardian_email AS "guardianEmail",
  l.source, l.campaign, l.interested_course_id AS "interestedCourseId", l.interested_course_level_id AS "interestedCourseLevelId",
  l.preferred_branch_id AS "preferredBranchId", l.assigned_membership_id AS "assignedMembershipId", l.next_follow_up_at AS "nextFollowUpAt",
  l.converted_student_id AS "convertedStudentId", l.converted_guardian_id AS "convertedGuardianId", l.converted_enrollment_id AS "convertedEnrollmentId",
  l.lost_reason AS "lostReason", l.lost_reason_detail AS "lostReasonDetail", l.won_at AS "wonAt", l.lost_at AS "lostAt",
  l.created_at AS "createdAt", l.updated_at AS "updatedAt"`;

export const bookingColumns = `t.id, t.tenant_id AS "tenantId", t.lead_id AS "leadId", t.session_id AS "sessionId", t.student_id AS "studentId",
  t.guardian_id AS "guardianId", t.trial_enrollment_id AS "trialEnrollmentId", t.status, t.outcome, t.outcome_notes AS "outcomeNotes",
  t.cancel_reason AS "cancelReason", t.booked_at AS "bookedAt", t.cancelled_at AS "cancelledAt", t.completed_at AS "completedAt",
  t.created_at AS "createdAt", t.updated_at AS "updatedAt"`;

export const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['TRIAL_BOOKED', 'WON', 'LOST'],
  TRIAL_BOOKED: ['TRIAL_COMPLETED', 'QUALIFIED', 'LOST'],
  TRIAL_COMPLETED: ['WON', 'QUALIFIED', 'LOST'],
  WON: [],
  LOST: [],
};

export const LEAD_SOURCES = ['REFERRAL', 'FACEBOOK', 'GOOGLE', 'WALK_IN', 'EXISTING_CUSTOMER', 'OTHER'] as const;
export const LEAD_LOST_REASONS = ['PRICE', 'SCHEDULE', 'NO_RESPONSE', 'COMPETITOR', 'NOT_INTERESTED', 'LOCATION', 'OTHER'] as const;
export const GUARDIAN_RELATIONSHIPS = ['MOTHER', 'FATHER', 'GRANDPARENT', 'GUARDIAN', 'OTHER'] as const;

export function serializeLead(row: LeadRow) {
  return {
    ...row,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    wonAt: row.wonAt?.toISOString() ?? null,
    lostAt: row.lostAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeBooking(row: TrialBookingRow) {
  return {
    ...row,
    bookedAt: row.bookedAt.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function actor(context: ReturnType<TenantContextService['get']>) {
  return {
    tenantId: context.tenant.tenantId,
    actorUserId: context.actorUserId,
    actorMembershipId: context.actorMembershipId,
    actorName: context.actorName,
    actorEmail: context.actorEmail,
    requestId: context.requestId,
  };
}

export async function recordLeadEvent(
  client: PoolClient,
  tenantId: string,
  leadId: string,
  type: string,
  fromStatus: LeadStatus | null,
  toStatus: LeadStatus | null,
  reason: string | null = null,
  metadata: Record<string, unknown> | null = null,
  actorUserId: string | null = null,
  actorMembershipId: string | null = null,
) {
  await client.query(
    `INSERT INTO lead_events (id, tenant_id, lead_id, type, from_status, to_status, reason, metadata, actor_user_id, actor_membership_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
    [ulid(), tenantId, leadId, type, fromStatus, toStatus, reason, metadata ? JSON.stringify(metadata) : null, actorUserId, actorMembershipId],
  );
}

export function transitionAllowed(from: LeadStatus, to: LeadStatus) {
  return LEAD_TRANSITIONS[from]?.includes(to) ?? false;
}

// ponytail: tenant-wide advisory lock serializes CRM student materialization; per-lead locks if contention appears.
export async function lockTenantCrmMaterialization(client: PoolClient, tenantId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${tenantId}:crm-student`]);
}
