import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { ClassesModule } from './classes/classes.module.js';
import { ControlDatabaseModule } from './database/control-database.module.js';
import { EnrollmentsModule } from './enrollments/enrollments.module.js';
import { HealthController } from './health.controller.js';
import { StudentsModule } from './students/students.module.js';
import { TenantConnectionInterceptor } from './tenant/tenant-connection.interceptor.js';
import { TenantMembershipGuard } from './tenant/tenant-membership.guard.js';
import { TenantModule } from './tenant/tenant.module.js';

@Module({
  imports: [
    ControlDatabaseModule,
    AuthModule,
    TenantModule,
    StudentsModule,
    ClassesModule,
    EnrollmentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: TenantMembershipGuard },
    { provide: APP_INTERCEPTOR, useExisting: TenantConnectionInterceptor },
  ],
})
export class AppModule {}
