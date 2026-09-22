import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { PermissionGuard } from './authorization/permission.guard.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { CoursesModule } from './courses/courses.module.js';
import { ControlDatabaseModule } from './database/control-database.module.js';
import { EnrollmentsModule } from './enrollments/enrollments.module.js';
import { HealthController } from './health.controller.js';
import { SchedulesModule } from './schedules/schedules.module.js';
import { StudentsModule } from './students/students.module.js';
import { TeachersModule } from './teachers/teachers.module.js';
import { TenantConnectionInterceptor } from './tenant/tenant-connection.interceptor.js';
import { TenantMembershipGuard } from './tenant/tenant-membership.guard.js';
import { TenantModule } from './tenant/tenant.module.js';
import { TeamModule } from './team/team.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    ControlDatabaseModule,
    AuthorizationModule,
    AuthModule,
    TenantModule,
    StudentsModule,
    CoursesModule,
    ClassesModule,
    EnrollmentsModule,
    TeachersModule,
    SchedulesModule,
    AttendanceModule,
    AuditModule,
    BranchesModule,
    RoomsModule,
    TeamModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: TenantMembershipGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
    { provide: APP_INTERCEPTOR, useExisting: TenantConnectionInterceptor },
  ],
})
export class AppModule {}
