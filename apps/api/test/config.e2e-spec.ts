import { apiConfig, controlDatabaseUrl, postgresConfig } from '../src/config.js';

describe('strict configuration', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('rejects placeholder database credentials', () => {
    process.env.POSTGRES_PASSWORD = 'change-me';
    expect(() => postgresConfig()).toThrow('POSTGRES_PASSWORD must not use the placeholder value');
  });

  it('rejects invalid ports', () => {
    process.env.POSTGRES_PORT = 'not-a-port';
    expect(() => postgresConfig()).toThrow('POSTGRES_PORT must be a valid TCP port');
  });

  it('builds encoded database URLs from validated values', () => {
    process.env.POSTGRES_USER = 'class ora';
    process.env.POSTGRES_PASSWORD = 'test/password';
    expect(controlDatabaseUrl()).toContain('class%20ora:test%2Fpassword');
  });

  it('validates the API port and JWT secret', () => {
    expect(apiConfig().port).toBe(4101);
    process.env.PORT = '0';
    expect(() => apiConfig()).toThrow('PORT must be a valid TCP port');
  });
});
