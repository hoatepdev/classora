function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  if (name === 'POSTGRES_PASSWORD' && value === 'change-me') {
    throw new Error('POSTGRES_PASSWORD must not use the placeholder value');
  }
  return value;
}

function port(name: string) {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return value;
}

export function runtimeEnvironment() {
  const value = required('NODE_ENV');
  if (!['development', 'test', 'production'].includes(value)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  return value as 'development' | 'test' | 'production';
}

function accessTtl() {
  const value = process.env.JWT_ACCESS_TTL?.trim();
  if (!value) {
    if (runtimeEnvironment() === 'production') {
      throw new Error('JWT_ACCESS_TTL is required in production');
    }
    return '1h';
  }
  if (!/^\d+(ms|s|m|h|d|w|y)$/.test(value)) {
    throw new Error('JWT_ACCESS_TTL must be a duration such as 1h or 30m');
  }
  return value;
}

export function postgresConfig() {
  return {
    host: required('POSTGRES_HOST'),
    port: port('POSTGRES_PORT'),
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    controlDatabase: required('CONTROL_DB_NAME'),
    postgresDatabase: process.env.POSTGRES_DB?.trim(),
  };
}

export function controlDatabaseUrl() {
  const config = postgresConfig();
  return `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(config.controlDatabase)}`;
}

export function tenantDatabaseUrl(dbName: string) {
  const config = postgresConfig();
  return `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${encodeURIComponent(dbName)}`;
}

export function apiConfig() {
  const jwtSecret = required('JWT_SECRET');
  runtimeEnvironment();
  if (Buffer.byteLength(jwtSecret) < 32) throw new Error('JWT_SECRET must be at least 32 bytes');

  return {
    port: port('PORT'),
    jwtSecret,
    accessTtl: accessTtl(),
  };
}
