import { Global, Module } from '@nestjs/common';
import { ControlDatabaseService } from './control-database.service.js';

@Global()
@Module({
  providers: [ControlDatabaseService],
  exports: [ControlDatabaseService],
})
export class ControlDatabaseModule {}
