import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

function controlDatabaseConfig() {
  return {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.CONTROL_DB_NAME ?? 'control_db',
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
