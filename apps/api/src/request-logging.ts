import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Logger } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth/auth.guard.js';
import type { TenantRequest } from './tenant/tenant-membership.guard.js';

const logger = new Logger('HTTP');
const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export type RequestWithId = Request & { requestId?: string };
type DiagnosticRequest = AuthenticatedRequest & TenantRequest & RequestWithId;

function requestId(request: Request) {
  const incoming = request.header('x-request-id');
  return incoming && requestIdPattern.test(incoming) ? incoming : randomUUID();
}

export function requestLoggingMiddleware(request: Request, response: Response, next: NextFunction) {
  const id = requestId(request);
  (request as RequestWithId).requestId = id;
  const startedAt = process.hrtime.bigint();
  response.setHeader('X-Request-Id', id);
  response.on('finish', () => {
    const diagnosticRequest = request as DiagnosticRequest;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = diagnosticRequest.route?.path ?? request.originalUrl.split('?')[0];
    const record = {
      timestamp: new Date().toISOString(),
      level: response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info',
      category: response.statusCode >= 400 ? 'http_error' : 'http_request',
      requestId: id,
      method: request.method,
      route,
      status: response.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      ...(diagnosticRequest.tenant && {
        tenantId: diagnosticRequest.tenant.tenantId,
        tenantSlug: diagnosticRequest.tenant.tenantSlug,
      }),
      ...(diagnosticRequest.user?.id && { userId: diagnosticRequest.user.id }),
    };
    logger.log(JSON.stringify(record));
  });
  next();
}
