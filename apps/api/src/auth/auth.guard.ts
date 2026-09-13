import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ControlDatabaseService } from '../database/control-database.service.js';

const IS_PUBLIC = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly database: ControlDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    let payload: { sub?: unknown };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload.sub !== 'string') throw new UnauthorizedException();

    const user = await this.database.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();

    request.user = { id: user.id, email: user.email, name: user.name };
    return true;
  }

  private extractToken(request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization) throw new UnauthorizedException();

    const [type, token, extra] = authorization.split(' ');
    if (type !== 'Bearer' || !token || extra) throw new UnauthorizedException();

    return token;
  }
}
