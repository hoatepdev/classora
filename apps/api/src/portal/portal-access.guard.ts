import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Pool } from 'pg';
import { ControlDatabaseService } from '../database/control-database.service.js';
import { PortalAccessStatus, PortalSubjectType } from '../generated/prisma/enums.js';
import { TenantConnectionManager } from '../tenant/tenant-connection-manager.service.js';
import { IS_PORTAL_TENANT_ROUTE } from '../tenant/tenant-route.js';
import { TenantResolverService } from '../tenant/tenant-resolver.service.js';
import type { PortalRequest, PortalStudent, PortalSubject } from './portal.types.js';

@Injectable()
export class PortalAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantResolver: TenantResolverService,
    private readonly connections: TenantConnectionManager,
    private readonly database: ControlDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPortalRoute = this.reflector.getAllAndOverride<boolean>(IS_PORTAL_TENANT_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isPortalRoute) return true;

    const request = context.switchToHttp().getRequest<PortalRequest>();
    if (!request.user) throw new UnauthorizedException();
    const tenant = await this.tenantResolver.resolve(request.hostname);
    if (!tenant) throw new NotFoundException('Tenant not found');
    const accesses = await this.database.portalAccess.findMany({
      where: { tenantId: tenant.tenantId, userId: request.user.id, status: PortalAccessStatus.ACTIVE },
      select: { id: true, subjectType: true, subjectId: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!accesses.length) throw new ForbiddenException();

    const pool = await this.connections.getConnection(tenant.dbName);
    try {
      const portal = await this.resolvePortalContext(pool, tenant.tenantId, accesses);
      if (!portal.subjects.length) throw new ForbiddenException();
      request.tenant = tenant;
      request.portal = portal;
      return true;
    } finally {
      this.connections.releaseConnection(tenant.dbName, pool);
    }
  }

  private async resolvePortalContext(
    pool: Pool,
    tenantId: string,
    accesses: Array<{ id: string; subjectType: PortalSubjectType; subjectId: string }>,
  ) {
    const guardianIds = accesses.filter((access) => access.subjectType === PortalSubjectType.GUARDIAN).map((access) => access.subjectId);
    const studentIds = accesses.filter((access) => access.subjectType === PortalSubjectType.STUDENT).map((access) => access.subjectId);
    const [guardians, directStudents, linkedStudents] = await Promise.all([
      guardianIds.length ? pool.query<{ id: string; name: string }>(
        'SELECT id, full_name AS name FROM guardians WHERE tenant_id=$1 AND id=ANY($2::char(26)[])',
        [tenantId, guardianIds],
      ) : { rows: [] },
      studentIds.length ? pool.query<{ id: string; code: string; fullName: string }>(
        'SELECT id, code, full_name AS "fullName" FROM students WHERE tenant_id=$1 AND id=ANY($2::char(26)[])',
        [tenantId, studentIds],
      ) : { rows: [] },
      guardianIds.length ? pool.query<{ id: string; code: string; fullName: string; guardianId: string; billing: boolean }>(
        `SELECT s.id,s.code,s.full_name AS "fullName",sg.guardian_id AS "guardianId",sg.is_billing_contact AS billing
         FROM student_guardians sg JOIN students s ON s.tenant_id=sg.tenant_id AND s.id=sg.student_id
         WHERE sg.tenant_id=$1 AND sg.guardian_id=ANY($2::char(26)[])
         ORDER BY s.full_name,s.id`,
        [tenantId, guardianIds],
      ) : { rows: [] },
    ]);
    const guardianById = new Map(guardians.rows.map((row) => [row.id, row]));
    const directById = new Map(directStudents.rows.map((row) => [row.id, row]));
    const subjects = accesses.flatMap<PortalSubject>((access) => {
      if (access.subjectType === PortalSubjectType.GUARDIAN) {
        const guardian = guardianById.get(access.subjectId);
        return guardian ? [{ accessId: access.id, type: access.subjectType, id: access.subjectId, name: guardian.name }] : [];
      }
      const student = directById.get(access.subjectId);
      return student ? [{ accessId: access.id, type: access.subjectType, id: access.subjectId, name: student.fullName }] : [];
    });
    const students = new Map<string, PortalStudent>();
    for (const row of directStudents.rows) students.set(row.id, { ...row, guardianSubjectIds: [], billingGuardianSubjectIds: [], studentSubjectIds: [row.id] });
    for (const row of linkedStudents.rows) {
      const student = students.get(row.id) ?? { id: row.id, code: row.code, fullName: row.fullName, guardianSubjectIds: [], billingGuardianSubjectIds: [], studentSubjectIds: [] };
      student.guardianSubjectIds.push(row.guardianId);
      if (row.billing) student.billingGuardianSubjectIds.push(row.guardianId);
      students.set(row.id, student);
    }
    return { subjects, students: [...students.values()] };
  }
}
