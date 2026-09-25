import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { EnrollmentInitialStatus } from '../enrollments/dto/create-enrollment.dto.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { PoolClient, QueryResultRow } from 'pg';
import type { ConvertLeadDto } from './dto/trial.dto.js';
import { CrmService } from './crm.service.js';
import { actor, recordLeadEvent } from './crm-shared.js';

type TrialEnrollmentRow = QueryResultRow & { id: string; classId: string; status: string };

@Injectable()
export class CrmConversionService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async convert(leadId: string, input: ConvertLeadDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const lead = await this.crm.lockedLead(client, context.tenant.tenantId, leadId);
      if (lead.status === 'WON') throw new ConflictException('Lead is already converted');
      if (lead.status !== 'QUALIFIED' && lead.status !== 'TRIAL_COMPLETED') {
        throw new ConflictException(`Lead cannot be converted from status ${lead.status}`);
      }

      const defaults = await this.crm.trialDefaults(client, context.tenant.tenantId, leadId);
      const { studentId, guardianId } = await this.crm.ensureStudentAndGuardian(client, lead, input, defaults);

      // Prefer promoting the existing TRIAL enrollment; otherwise close it and re-enroll into the final class.
      const trial = await client.query<TrialEnrollmentRow>(
        `SELECT e.id, e.class_id AS "classId", e.status FROM trial_bookings t
         JOIN enrollments e ON e.tenant_id = t.tenant_id AND e.id = t.trial_enrollment_id
         WHERE t.tenant_id=$1 AND t.lead_id=$2 AND e.status='TRIAL' AND e.student_id=$3
         ORDER BY t.booked_at DESC LIMIT 1 FOR SHARE OF e`,
        [context.tenant.tenantId, leadId, studentId],
      );
      let enrollmentId: string;
      let conversionMode: 'TRIAL_PROMOTED' | 'TRIAL_REENROLLED' | 'DIRECT';
      const trialEnrollment = trial.rows[0];
      if (trialEnrollment && trialEnrollment.classId === input.classId) {
        const promoted = await this.enrollments.transitionInTransaction(client, trialEnrollment.id, 'activate', { reason: 'Lead converted' });
        enrollmentId = promoted.id;
        conversionMode = 'TRIAL_PROMOTED';
      } else if (trialEnrollment) {
        await this.enrollments.transitionInTransaction(client, trialEnrollment.id, 'withdraw', { reason: 'Converted into a different class' });
        const reenrolled = await this.enrollments.reenrollInTransaction(client, trialEnrollment.id, { studentId, classId: input.classId, status: EnrollmentInitialStatus.ACTIVE });
        enrollmentId = reenrolled.id;
        conversionMode = 'TRIAL_REENROLLED';
      } else {
        const created = await this.enrollments.createInTransaction(client, { studentId, classId: input.classId, status: EnrollmentInitialStatus.ACTIVE, notes: `Converted from lead ${leadId}` });
        enrollmentId = created.id;
        conversionMode = 'DIRECT';
      }

      await client.query(
        `UPDATE leads SET status='WON', won_at=CURRENT_TIMESTAMP, converted_student_id=$3, converted_guardian_id=$4, converted_enrollment_id=$5, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2`,
        [context.tenant.tenantId, leadId, studentId, guardianId, enrollmentId],
      );
      await recordLeadEvent(client, context.tenant.tenantId, leadId, 'CONVERTED', lead.status, 'WON', null, { studentId, guardianId, enrollmentId, classId: input.classId, conversionMode }, context.actorUserId ?? null, context.actorMembershipId ?? null);
      await this.audit.recordTenant(client, { ...actor(context), action: 'lead.converted', entityType: 'LEAD', entityId: leadId, before: { status: lead.status }, after: { status: 'WON', studentId, guardianId, enrollmentId, conversionMode } });
      await client.query('COMMIT');
      return { ...(await this.crm.get(leadId)), conversion: { studentId, guardianId, enrollmentId, conversionMode } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
