import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ulid } from 'ulid';
import type { PoolClient, QueryResultRow } from 'pg';
import { AuditService } from '../audit/audit.service.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';
import type { CreateGuardianDto, CreateNoteDto, CreateTagDto, LinkGuardianDto, UpdateGuardianDto } from './dto/guardian.dto.js';
import type { CreateGuardianLinkDto } from './dto/create-guardian-link.dto.js';

type GuardianRow = QueryResultRow & {
  id: string;
  tenantId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StudentGuardianRow = GuardianRow & {
  relationship: string;
  isPrimaryContact: boolean;
  isBillingContact: boolean;
};

type ActivityRow = QueryResultRow & {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  actorName: string | null;
  occurredAt: Date;
};

const guardianSelect = `
  SELECT id, tenant_id AS "tenantId", full_name AS "fullName", phone, email, address, notes,
    created_at AS "createdAt", updated_at AS "updatedAt"
  FROM guardians
`;

function serializeGuardian(row: GuardianRow) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function conflictConstraint(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== '23505') return undefined;
  return 'constraint' in error && typeof error.constraint === 'string' ? error.constraint : undefined;
}

function isConflict(error: unknown) {
  return conflictConstraint(error) !== undefined;
}

function guardianSnapshot(row: GuardianRow) {
  return { fullName: row.fullName, phone: row.phone, email: row.email, address: row.address, notes: row.notes };
}

@Injectable()
export class StudentRelationshipsService {
  constructor(private readonly tenantContext: TenantContextService, private readonly audit: AuditService) {}

  async guardians(search?: string) {
    const { tenant, pool } = this.tenantContext.get();
    const values: unknown[] = [tenant.tenantId];
    const term = search?.trim();
    const condition = term ? 'AND (full_name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)' : '';
    if (term) values.push(`%${term}%`);
    const result = await pool.query<GuardianRow>(
      `${guardianSelect} WHERE tenant_id = $1 ${condition} ORDER BY full_name, id LIMIT 50`,
      values,
    );
    return result.rows.map(serializeGuardian);
  }

  async createAndLinkGuardian(studentId: string, input: CreateGuardianLinkDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertStudent(client, context.tenant.tenantId, studentId);
      const guardianId = ulid();
      await client.query(
        'INSERT INTO guardians (id, tenant_id, full_name, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [guardianId, context.tenant.tenantId, input.fullName, input.phone ?? null, input.email?.toLowerCase() ?? null, input.address ?? null, input.notes ?? null],
      );
      const relationship = input.relationship ?? 'Other';
      const isPrimaryContact = input.isPrimaryContact ?? false;
      const isBillingContact = input.isBillingContact ?? false;
      if (isPrimaryContact) {
        await client.query('UPDATE student_guardians SET is_primary_contact = FALSE, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND student_id = $2', [context.tenant.tenantId, studentId]);
      }
      await client.query(
        `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary_contact, is_billing_contact)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ulid(), context.tenant.tenantId, studentId, guardianId, relationship, isPrimaryContact, isBillingContact],
      );
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId,
        actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId,
        action: 'guardian.created', entityType: 'GUARDIAN', entityId: guardianId,
        after: { fullName: input.fullName, phone: input.phone ?? null, email: input.email?.toLowerCase() ?? null, address: input.address ?? null, notes: input.notes ?? null },
      });
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId,
        actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId,
        action: 'student.guardian_linked', entityType: 'STUDENT', entityId: studentId,
        after: { guardianId, relationship, isPrimaryContact, isBillingContact },
      });
      await client.query('COMMIT');
      return { studentId, guardianId, relationship, isPrimaryContact, isBillingContact };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (conflictConstraint(error) === 'student_guardians_one_primary_idx') throw new ConflictException('Student already has a primary contact');
      throw error;
    } finally {
      client.release();
    }
  }

  async createGuardian(input: CreateGuardianDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const id = ulid();
      await client.query(
        'INSERT INTO guardians (id, tenant_id, full_name, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, context.tenant.tenantId, input.fullName, input.phone ?? null, input.email?.toLowerCase() ?? null, input.address ?? null, input.notes ?? null],
      );
      const guardian = (await client.query<GuardianRow>(`${guardianSelect} WHERE tenant_id = $1 AND id = $2`, [context.tenant.tenantId, id])).rows[0];
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: 'guardian.created',
        entityType: 'GUARDIAN',
        entityId: id,
        after: guardianSnapshot(guardian),
      });
      await client.query('COMMIT');
      return serializeGuardian(guardian);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isConflict(error)) throw new ConflictException('Guardian already exists');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateGuardian(id: string, input: UpdateGuardianDto) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const columns = [
      ['fullName', 'full_name'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['address', 'address'],
      ['notes', 'notes'],
    ] as const;
    for (const [property, column] of columns) {
      if (!Object.hasOwn(input, property) || input[property] === undefined) continue;
      const value = input[property];
      values.push(property === 'email' && typeof value === 'string' ? value.toLowerCase() : value ?? null);
      fields.push(`${column} = $${values.length + 2}`);
    }
    if (!fields.length) throw new BadRequestException('At least one field is required');

    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const before = (await client.query<GuardianRow>(`${guardianSelect} WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [context.tenant.tenantId, id])).rows[0];
      if (!before) throw new NotFoundException('Guardian not found');
      await client.query(
        `UPDATE guardians SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND id = $2`,
        [context.tenant.tenantId, id, ...values],
      );
      const after = (await client.query<GuardianRow>(`${guardianSelect} WHERE tenant_id = $1 AND id = $2`, [context.tenant.tenantId, id])).rows[0];
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: 'guardian.updated',
        entityType: 'GUARDIAN',
        entityId: id,
        before: guardianSnapshot(before),
        after: guardianSnapshot(after),
      });
      await client.query('COMMIT');
      return serializeGuardian(after);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async studentGuardians(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    await this.assertStudent(pool, tenant.tenantId, studentId);
    const result = await pool.query<StudentGuardianRow>(
      `SELECT g.id, g.tenant_id AS "tenantId", g.full_name AS "fullName", g.phone, g.email, g.address, g.notes,
        g.created_at AS "createdAt", g.updated_at AS "updatedAt", sg.relationship,
        sg.is_primary_contact AS "isPrimaryContact", sg.is_billing_contact AS "isBillingContact"
       FROM guardians g
       JOIN student_guardians sg ON sg.guardian_id = g.id AND sg.tenant_id = g.tenant_id
       WHERE g.tenant_id = $1 AND sg.student_id = $2
       ORDER BY sg.is_primary_contact DESC, g.full_name, g.id`,
      [tenant.tenantId, studentId],
    );
    return result.rows.map((row) => ({ ...serializeGuardian(row), relationship: row.relationship, isPrimaryContact: row.isPrimaryContact, isBillingContact: row.isBillingContact }));
  }

  async studentNotes(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    await this.assertStudent(pool, tenant.tenantId, studentId);
    const result = await pool.query(
      `SELECT id, student_id AS "studentId", content, author_id AS "authorId", author_name AS "authorName", created_at AS "createdAt"
       FROM student_notes WHERE tenant_id = $1 AND student_id = $2 ORDER BY created_at DESC, id DESC LIMIT 100`,
      [tenant.tenantId, studentId],
    );
    return result.rows;
  }

  async studentTags(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    await this.assertStudent(pool, tenant.tenantId, studentId);
    const result = await pool.query(
      `SELECT t.id, t.name FROM student_tags t
       JOIN student_tag_assignments a ON a.tag_id = t.id AND a.tenant_id = t.tenant_id
       WHERE a.tenant_id = $1 AND a.student_id = $2 ORDER BY t.name, t.id`,
      [tenant.tenantId, studentId],
    );
    return result.rows;
  }

  async studentActivity(studentId: string) {
    const { tenant, pool } = this.tenantContext.get();
    await this.assertStudent(pool, tenant.tenantId, studentId);
    const result = await pool.query<ActivityRow>(
      `SELECT id, action, entity_type AS "entityType", entity_id AS "entityId", before, after,
        actor_name AS "actorName", occurred_at AS "occurredAt"
       FROM audit_events
       WHERE tenant_id = $1 AND (
         (entity_type = 'STUDENT' AND entity_id = $2)
         OR (entity_type = 'GUARDIAN' AND entity_id IN (
           SELECT guardian_id FROM student_guardians WHERE tenant_id = $1 AND student_id = $2
         ))
       )
       ORDER BY occurred_at DESC, id DESC LIMIT 100`,
      [tenant.tenantId, studentId],
    );
    return result.rows;
  }

  async createGuardianInTransaction(client: PoolClient, input: { fullName: string; phone?: string | null; email?: string | null; notes?: string | null }) {
    const context = this.tenantContext.get();
    const id = ulid();
    await client.query(
      'INSERT INTO guardians (id, tenant_id, full_name, phone, email, address, notes) VALUES ($1, $2, $3, $4, $5, NULL, $6)',
      [id, context.tenant.tenantId, input.fullName, input.phone ?? null, input.email?.toLowerCase() ?? null, input.notes ?? null],
    );
    await this.audit.recordTenant(client, {
      tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId,
      actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId,
      action: 'guardian.created', entityType: 'GUARDIAN', entityId: id,
      after: { fullName: input.fullName, phone: input.phone ?? null, email: input.email?.toLowerCase() ?? null },
    });
    return id;
  }

  async linkGuardianInTransaction(client: PoolClient, studentId: string, guardianId: string, relationship: string) {
    const context = this.tenantContext.get();
    await this.assertStudent(client, context.tenant.tenantId, studentId);
    const guardian = await client.query('SELECT id FROM guardians WHERE tenant_id = $1 AND id = $2', [context.tenant.tenantId, guardianId]);
    if (!guardian.rows[0]) throw new NotFoundException('Guardian not found');
    await client.query(
      `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary_contact, is_billing_contact)
       VALUES ($1, $2, $3, $4, $5, FALSE, FALSE)
       ON CONFLICT (tenant_id, student_id, guardian_id) DO NOTHING`,
      [ulid(), context.tenant.tenantId, studentId, guardianId, relationship],
    );
    await this.audit.recordTenant(client, {
      tenantId: context.tenant.tenantId, actorUserId: context.actorUserId, actorMembershipId: context.actorMembershipId,
      actorName: context.actorName, actorEmail: context.actorEmail, requestId: context.requestId,
      action: 'student.guardian_linked', entityType: 'STUDENT', entityId: studentId,
      after: { guardianId, relationship, isPrimaryContact: false, isBillingContact: false },
    });
  }

  async link(studentId: string, guardianId: string, input: LinkGuardianDto) {
    return this.mutateLink(studentId, guardianId, input, false);
  }

  async updateLink(studentId: string, guardianId: string, input: LinkGuardianDto) {
    return this.mutateLink(studentId, guardianId, input, true);
  }

  private async mutateLink(studentId: string, guardianId: string, input: LinkGuardianDto, update: boolean) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertStudent(client, context.tenant.tenantId, studentId);
      const guardian = await client.query('SELECT id FROM guardians WHERE tenant_id = $1 AND id = $2', [context.tenant.tenantId, guardianId]);
      if (!guardian.rows[0]) throw new NotFoundException('Guardian not found');

      const links = await client.query<{ guardianId: string; relationship: string; isPrimaryContact: boolean; isBillingContact: boolean }>(
        `SELECT guardian_id AS "guardianId", relationship, is_primary_contact AS "isPrimaryContact", is_billing_contact AS "isBillingContact"
         FROM student_guardians WHERE tenant_id = $1 AND student_id = $2 FOR UPDATE`,
        [context.tenant.tenantId, studentId],
      );
      const current = links.rows.find((row) => row.guardianId === guardianId);
      if (update && !current) throw new NotFoundException('Guardian relationship not found');
      if (!update && current) throw new ConflictException('Guardian is already linked');
      const relationship = input.relationship ?? current?.relationship ?? 'Other';
      const isPrimaryContact = input.isPrimaryContact ?? current?.isPrimaryContact ?? false;
      const isBillingContact = input.isBillingContact ?? current?.isBillingContact ?? false;

      if (isPrimaryContact) {
        await client.query(
          'UPDATE student_guardians SET is_primary_contact = FALSE, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND student_id = $2 AND guardian_id <> $3',
          [context.tenant.tenantId, studentId, guardianId],
        );
      }
      if (update) {
        await client.query(
          `UPDATE student_guardians SET relationship = $1, is_primary_contact = $2, is_billing_contact = $3, updated_at = CURRENT_TIMESTAMP
           WHERE tenant_id = $4 AND student_id = $5 AND guardian_id = $6`,
          [relationship, isPrimaryContact, isBillingContact, context.tenant.tenantId, studentId, guardianId],
        );
      } else {
        await client.query(
          `INSERT INTO student_guardians (id, tenant_id, student_id, guardian_id, relationship, is_primary_contact, is_billing_contact)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ulid(), context.tenant.tenantId, studentId, guardianId, relationship, isPrimaryContact, isBillingContact],
        );
      }
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: update ? 'student.guardian_updated' : 'student.guardian_linked',
        entityType: 'STUDENT',
        entityId: studentId,
        ...(update && current ? {
          before: { guardianId, relationship: current.relationship, isPrimaryContact: current.isPrimaryContact, isBillingContact: current.isBillingContact },
        } : {}),
        after: { guardianId, relationship, isPrimaryContact, isBillingContact },
      });
      await client.query('COMMIT');
      return { studentId, guardianId, relationship, isPrimaryContact, isBillingContact };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (conflictConstraint(error) === 'student_guardians_tenant_student_guardian_key') throw new ConflictException('Guardian is already linked');
      if (conflictConstraint(error) === 'student_guardians_one_primary_idx') throw new ConflictException('Student already has a primary contact');
      throw error;
    } finally {
      client.release();
    }
  }

  async unlink(studentId: string, guardianId: string) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'DELETE FROM student_guardians WHERE tenant_id = $1 AND student_id = $2 AND guardian_id = $3 RETURNING id',
        [context.tenant.tenantId, studentId, guardianId],
      );
      if (!result.rows[0]) throw new NotFoundException('Guardian relationship not found');
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: 'student.guardian_unlinked',
        entityType: 'STUDENT',
        entityId: studentId,
        after: { guardianId },
      });
      await client.query('COMMIT');
      return { studentId, guardianId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async addNote(studentId: string, input: CreateNoteDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertStudent(client, context.tenant.tenantId, studentId);
      const id = ulid();
      const result = await client.query<{ id: string; createdAt: Date }>(
        `INSERT INTO student_notes (id, tenant_id, student_id, content, author_id, author_name)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at AS "createdAt"`,
        [id, context.tenant.tenantId, studentId, input.content, context.actorUserId ?? null, context.actorName ?? null],
      );
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: 'student.note_added',
        entityType: 'STUDENT',
        entityId: studentId,
        after: { noteId: id },
      });
      await client.query('COMMIT');
      return { id, studentId, content: input.content, authorName: context.actorName ?? null, createdAt: result.rows[0].createdAt.toISOString() };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createTag(studentId: string, input: CreateTagDto) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertStudent(client, context.tenant.tenantId, studentId);
      const existing = await client.query<{ id: string; name: string }>(
        'SELECT id, name FROM student_tags WHERE tenant_id = $1 AND name = $2',
        [context.tenant.tenantId, input.name],
      );
      const tag = existing.rows[0] ?? { id: ulid(), name: input.name };
      if (!existing.rows[0]) {
        await client.query('INSERT INTO student_tags (id, tenant_id, name) VALUES ($1, $2, $3)', [tag.id, context.tenant.tenantId, tag.name]);
      }
      await client.query('INSERT INTO student_tag_assignments (id, tenant_id, student_id, tag_id) VALUES ($1, $2, $3, $4)', [ulid(), context.tenant.tenantId, studentId, tag.id]);
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: 'student.tag_added',
        entityType: 'STUDENT',
        entityId: studentId,
        after: { tagId: tag.id, name: tag.name },
      });
      await client.query('COMMIT');
      return tag;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isConflict(error)) throw new ConflictException('Tag is already assigned');
      throw error;
    } finally {
      client.release();
    }
  }

  async removeTag(studentId: string, tagId: string) {
    const context = this.tenantContext.get();
    const client = await context.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertStudent(client, context.tenant.tenantId, studentId);
      const tag = await client.query<{ name: string }>(
        `SELECT t.name FROM student_tag_assignments a
         JOIN student_tags t ON t.tenant_id = a.tenant_id AND t.id = a.tag_id
         WHERE a.tenant_id = $1 AND a.student_id = $2 AND a.tag_id = $3
         FOR UPDATE`,
        [context.tenant.tenantId, studentId, tagId],
      );
      if (!tag.rows[0]) throw new NotFoundException('Tag assignment not found');
      await client.query(
        'DELETE FROM student_tag_assignments WHERE tenant_id = $1 AND student_id = $2 AND tag_id = $3',
        [context.tenant.tenantId, studentId, tagId],
      );
      await this.audit.recordTenant(client, {
        tenantId: context.tenant.tenantId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.actorMembershipId,
        actorName: context.actorName,
        actorEmail: context.actorEmail,
        requestId: context.requestId,
        action: 'student.tag_removed',
        entityType: 'STUDENT',
        entityId: studentId,
        after: { tagId, name: tag.rows[0].name },
      });
      await client.query('COMMIT');
      return { studentId, tagId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertStudent(client: Pick<PoolClient, 'query'>, tenantId: string, studentId: string) {
    const result = await client.query('SELECT id FROM students WHERE tenant_id = $1 AND id = $2', [tenantId, studentId]);
    if (!result.rows[0]) throw new NotFoundException('Student not found');
  }
}
