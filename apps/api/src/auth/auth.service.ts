import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ControlDatabaseService } from '../database/control-database.service.js';
import type { AuthenticatedUser } from './auth.guard.js';
import { permissionsForRole } from '../authorization/permissions.js';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$YpGzjsFcWtxUuAVrQKJ+/BbKC2CDln8HmqwlqTtrdhg';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: ControlDatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.database.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, passwordHash: true, status: true },
    });
    const validPassword = await argon2.verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);

    if (!user || user.status !== 'ACTIVE' || !validPassword) throw new UnauthorizedException();

    return { accessToken: await this.jwt.signAsync({ sub: user.id }) };
  }

  async getCurrentUser(user: AuthenticatedUser) {
    const memberships = await this.database.tenantMembership.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        role: true,
        status: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { tenant: { name: 'asc' } },
    });

    return {
      ...user,
      memberships: memberships.map((membership) => ({
        ...membership,
        permissions: permissionsForRole(membership.role),
      })),
    };
  }
}
