import type { PoolConfig } from 'pg';
import { TenantConnectionManager } from '../src/tenant/tenant-connection-manager.service.js';

const poolInstances = vi.hoisted(
  () => [] as Array<{ config: PoolConfig; end: ReturnType<typeof vi.fn> }>,
);

vi.mock('pg', () => ({
  Pool: class {
    readonly end = vi.fn(async () => undefined);

    constructor(readonly config: PoolConfig) {
      poolInstances.push(this);
    }
  },
}));

describe('TenantConnectionManager', () => {
  let manager: TenantConnectionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    poolInstances.length = 0;
    manager = new TenantConnectionManager();
  });

  afterEach(async () => {
    await manager.closeAll();
    vi.useRealTimers();
  });

  it('reuses one pool for concurrent requests to the same database', async () => {
    const [first, second] = await Promise.all([
      manager.getConnection('tenant_a'),
      manager.getConnection('tenant_a'),
    ]);

    expect(first).toBe(second);
    expect(poolInstances).toHaveLength(1);
    expect(poolInstances[0].config).toMatchObject({ database: 'tenant_a', max: 3 });
  });

  it('evicts the least recently used inactive pool at the pool limit', async () => {
    for (let index = 0; index < 10; index += 1) {
      const dbName = `tenant_${index}`;
      const pool = await manager.getConnection(dbName);
      manager.releaseConnection(dbName, pool);
      await vi.advanceTimersByTimeAsync(1);
    }

    await manager.getConnection('tenant_10');

    expect(poolInstances).toHaveLength(11);
    expect(poolInstances[0].end).toHaveBeenCalledOnce();
  });

  it('closes an inactive pool after ten minutes', async () => {
    const pool = await manager.getConnection('tenant_idle');
    manager.releaseConnection('tenant_idle', pool);

    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(poolInstances[0].end).toHaveBeenCalledOnce();
  });

  it('closes every pool on shutdown', async () => {
    await manager.getConnection('tenant_a');
    await manager.getConnection('tenant_b');

    await manager.closeAll();

    expect(poolInstances.every(({ end }) => end.mock.calls.length === 1)).toBe(true);
    await expect(manager.getConnection('tenant_c')).rejects.toThrow('shutting down');
  });
});
