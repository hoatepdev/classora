import { defineConfig } from 'prisma/config';

function controlDatabaseUrl() {
  const user = encodeURIComponent(process.env.POSTGRES_USER ?? 'classora');
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? 'change-me');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const database = process.env.CONTROL_DB_NAME ?? 'control_db';

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: controlDatabaseUrl(),
  },
});
