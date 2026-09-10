import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

const MAX_POOLS = 10;
const IDLE_TIMEOUT_MS = 10 * 60_000;
const EVICTION_INTERVAL_MS = 60_000;

type PoolEntry = {
  pool: Pool;
  lastUsedAt: number;
  activeRequests: number;
};

@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private readonly pools = new Map<string, PoolEntry>();
  private readonly evictionTimer = setInterval(
    () => this.runExclusive(() => this.evictIdlePools()).catch((error) => this.logger.error(error)),
    EVICTION_INTERVAL_MS,
  );
  private operations: Promise<void> = Promise.resolve();
  private shuttingDown = false;

  constructor() {
    this.evictionTimer.unref();
  }

  getConnection(dbName: string): Promise<Pool> {
    if (!dbName) throw new Error('Tenant database name is required');

    return this.runExclusive(async () => {
      if (this.shuttingDown) throw new Error('Tenant connection manager is shutting down');

      const existing = this.pools.get(dbName);
      if (existing) {
        existing.lastUsedAt = Date.now();
        existing.activeRequests += 1;
        return existing.pool;
      }

      if (this.pools.size >= MAX_POOLS) await this.evictLeastRecentlyUsedPool();

      const pool = new Pool({
        host: process.env.POSTGRES_HOST ?? 'localhost',
        port: Number(process.env.POSTGRES_PORT ?? 5432),
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: dbName,
        max: 3,
      });

      this.pools.set(dbName, { pool, lastUsedAt: Date.now(), activeRequests: 1 });
      return pool;
    });
  }

  releaseConnection(dbName: string, pool: Pool) {
    const entry = this.pools.get(dbName);
    if (!entry || entry.pool !== pool) return;

    entry.activeRequests = Math.max(0, entry.activeRequests - 1);
    entry.lastUsedAt = Date.now();
  }

  async closeAll() {
    if (this.shuttingDown) return;

    this.shuttingDown = true;
    clearInterval(this.evictionTimer);
    await this.operations;

    const entries = [...this.pools.values()];
    this.pools.clear();
    await Promise.allSettled(entries.map(({ pool }) => pool.end()));
  }

  async onModuleDestroy() {
    await this.closeAll();
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async evictLeastRecentlyUsedPool() {
    const candidate = [...this.pools.entries()]
      .filter(([, entry]) => entry.activeRequests === 0)
      .sort(([, left], [, right]) => left.lastUsedAt - right.lastUsedAt)[0];

    if (!candidate) throw new Error(`Tenant pool limit of ${MAX_POOLS} reached`);

    const [dbName, entry] = candidate;
    this.pools.delete(dbName);
    await entry.pool.end();
  }

  private async evictIdlePools() {
    const cutoff = Date.now() - IDLE_TIMEOUT_MS;
    const idlePools = [...this.pools.entries()].filter(
      ([, entry]) => entry.activeRequests === 0 && entry.lastUsedAt <= cutoff,
    );

    for (const [dbName] of idlePools) this.pools.delete(dbName);
    await Promise.allSettled(idlePools.map(([, entry]) => entry.pool.end()));
  }
}
