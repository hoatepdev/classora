import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { StudentsModule } from '../students/students.module.js';
import { TeachersModule } from '../teachers/teachers.module.js';
import { TenantModule } from '../tenant/tenant.module.js';
import { DataTransferController } from './data-transfer.controller.js';
import { DataTransferExportService } from './data-transfer-export.service.js';
import { DataTransferImportService } from './data-transfer-import.service.js';

@Module({
  imports: [TenantModule, AuditModule, StudentsModule, TeachersModule, CoursesModule, ClassesModule, EnrollmentsModule],
  controllers: [DataTransferController],
  providers: [DataTransferImportService, DataTransferExportService],
})
export class DataTransferModule {}
