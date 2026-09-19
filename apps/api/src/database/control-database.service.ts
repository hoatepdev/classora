import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { postgresConfig } from '../config.js';

function controlDatabaseConfig() {
  const config = postgresConfig();
  return {
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.controlDatabase,
    max: 5,
    connectionTimeoutMillis: 5_000,
  };
}

@Injectable()
export class ControlDatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg(controlDatabaseConfig()) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
