import type { PortalSubjectType } from '../generated/prisma/enums.js';
import type { TenantRequest } from '../tenant/tenant-membership.guard.js';

export type PortalSubject = {
  accessId: string;
  type: PortalSubjectType;
  id: string;
  name: string;
};

export type PortalStudent = {
  id: string;
  code: string;
  fullName: string;
  guardianSubjectIds: string[];
  billingGuardianSubjectIds: string[];
  studentSubjectIds: string[];
};

export type PortalContext = {
  subjects: PortalSubject[];
  students: PortalStudent[];
};

export type PortalRequest = TenantRequest & { portal?: PortalContext };
